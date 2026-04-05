// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/verify?token=...
//
// The user arrives here by clicking the magic link in their email.
// We verify the token, issue a session token, then return a tiny HTML page
// that stores it in localStorage and redirects to the app.
// ─────────────────────────────────────────────────────────────────────────────

import { verifyToken, createToken } from "./_utils.js";

const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = req.query?.token;

  if (!token) {
    return res.status(400).send(redirectPage("/", "missing_token"));
  }

  // Verify the magic token (must be type "magic" and not expired)
  const payload = verifyToken(token, "magic");

  if (!payload || !payload.email) {
    return res.status(200).send(redirectPage("/", "link_expired"));
  }

  // Issue a session token
  const sessionToken = createToken(
    { email: payload.email, type: "session" },
    SESSION_EXPIRY_MS
  );

  // Return a micro HTML page that stores the session and redirects to "/"
  return res.status(200).send(sessionPage(sessionToken));
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

// Stores the session token in localStorage then sends the user home.
function sessionPage(sessionToken) {
  const safe = JSON.stringify(sessionToken); // quotes + escapes any special chars
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Signing you in…</title>
</head>
<body>
  <p style="font-family:sans-serif;color:#666;padding:40px">Signing you in…</p>
  <script>
    try {
      localStorage.setItem('pa_session', ${safe});
    } catch (e) {}
    window.location.replace('/');
  </script>
</body>
</html>`;
}

// Redirects to the app with an error query param so the gate can show a message.
function redirectPage(destination, errorCode) {
  const url = errorCode ? `${destination}?auth_error=${errorCode}` : destination;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Redirecting…</title>
</head>
<body>
  <p style="font-family:sans-serif;color:#666;padding:40px">Redirecting…</p>
  <script>
    window.location.replace(${JSON.stringify(url)});
  </script>
</body>
</html>`;
}
