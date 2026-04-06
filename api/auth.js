// ─────────────────────────────────────────────────────────────────────────────
// Story Scout for Authors — Password Auth Route
// Runs as a Vercel serverless function at: POST /api/auth
//
// The frontend sends a password. This checks it against the ACCESS_PASSWORD
// environment variable. The real password never touches the browser.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { password } = req.body;

  // Check that ACCESS_PASSWORD is configured
  if (!process.env.ACCESS_PASSWORD) {
    return res.status(500).json({
      error: "Access password is not configured on the server.",
    });
  }

  // Compare submitted password against the environment variable
  if (!password || password !== process.env.ACCESS_PASSWORD) {
    // Small delay to slow down brute-force guessing
    await new Promise((resolve) => setTimeout(resolve, 500));
    return res.status(401).json({ error: "Incorrect password. Please try again." });
  }

  // Password is correct — return success
  // We do not issue a token here. The frontend stores a simple session flag.
  // This is intentionally lightweight. For stronger security in a future
  // version, replace this with a signed JWT or a session token.
  return res.status(200).json({ ok: true });
}
