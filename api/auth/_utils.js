// ─────────────────────────────────────────────────────────────────────────────
// Shared auth utilities — token creation, verification, email allow-list
// Used by api/auth/request.js, api/auth/verify.js, and api/chat.js
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ── Token helpers ─────────────────────────────────────────────────────────────
//
// Tokens are: base64url(JSON payload) + "." + HMAC-SHA256 hex signature
//
// Magic link tokens expire in 15 minutes and carry type: "magic"
// Session tokens   expire in 7 days  and carry type: "session"
//
// The type field prevents a magic token being reused as a session token.

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured.");
  return s;
}

export function createToken(data, expiryMs) {
  const payload = { ...data, exp: Date.now() + expiryMs };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("hex");
  return `${encoded}.${sig}`;
}

export function verifyToken(token, expectedType) {
  if (!token || typeof token !== "string") return null;

  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const encoded = token.slice(0, lastDot);
  const sig     = token.slice(lastDot + 1);

  // Re-derive the expected signature
  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    const sigBuf      = Buffer.from(sig.padEnd(64, "0").slice(0, 64), "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    if (sig !== expectedSig) return null; // catch padding trick
  } catch {
    return null;
  }

  // Decode and parse payload
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }

  // Check expiry
  if (!payload.exp || Date.now() > payload.exp) return null;

  // Check token type if requested
  if (expectedType && payload.type !== expectedType) return null;

  return payload;
}

// ── Allow-list check ──────────────────────────────────────────────────────────
// Primary store: Vercel KV (populated automatically via the /api/webhooks/wp
//   endpoint when FluentCart orders complete or subscriptions change).
// Fallback:      ALLOWED_EMAILS env var (local dev + your own admin email).
//
// isEmailAllowed is async because KV lookups are network calls.

export async function isEmailAllowed(email) {
  const normalised = email.trim().toLowerCase();

  // ── Try Upstash Redis first (production) ─────────────────────────────────
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const user = await redis.get(`user:${normalised}`);
      if (user !== null) return true;
      // If not in Redis, also check ALLOWED_EMAILS below
      // (keeps your admin email working even before Redis is populated)
    } catch (err) {
      console.error("Redis lookup failed, falling back to ALLOWED_EMAILS:", err.message);
    }
  }

  // ── Fall back to ALLOWED_EMAILS env var (local dev / pre-KV setup) ───────
  const raw     = process.env.ALLOWED_EMAILS || "";
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalised);
}

// ── Basic email format check ──────────────────────────────────────────────────
export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
