// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/wp
//
// Called by WordPress (via a WPCode PHP snippet) when a FluentCart order
// completes or a subscription changes.  Grants or revokes access in Vercel KV.
//
// Request body:  { email, action: "grant"|"revoke", tier?: "vip"|"standalone" }
// Auth header:   X-Webhook-Secret: <WP_WEBHOOK_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  // ── Verify the shared secret ──────────────────────────────────────────────
  const secret = req.headers["x-webhook-secret"] || "";
  if (!process.env.WP_WEBHOOK_SECRET || secret !== process.env.WP_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorised." });
  }

  // ── Validate payload ──────────────────────────────────────────────────────
  const { email, action, tier } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required." });
  }
  if (!["grant", "revoke"].includes(action)) {
    return res.status(400).json({ error: "action must be grant or revoke." });
  }
  if (action === "grant" && !["vip", "standalone"].includes(tier)) {
    return res.status(400).json({ error: "tier must be vip or standalone when action is grant." });
  }

  const normalised = email.trim().toLowerCase();

  // ── KV operations ─────────────────────────────────────────────────────────
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("[webhook] Redis not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.");
    return res.status(503).json({ error: "User store not configured." });
  }

  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (action === "grant") {
    await redis.set(`user:${normalised}`, {
      tier,
      grantedAt: new Date().toISOString(),
    });
    console.log(`[webhook] Granted ${tier} access → ${normalised}`);
    return res.status(200).json({ ok: true, action: "granted", email: normalised, tier });
  }

  if (action === "revoke") {
    await redis.del(`user:${normalised}`);
    console.log(`[webhook] Revoked access → ${normalised}`);
    return res.status(200).json({ ok: true, action: "revoked", email: normalised });
  }
}
