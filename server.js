// ─────────────────────────────────────────────────────────────────────────────
// Prompt Architect for Authors — Local Dev Server
//
// Run with:  node server.js
// Or via:    npm run dev
//
// Serves the frontend from /public and handles /api/chat — no Vercel login
// needed. Uses Node's built-in http module, zero extra dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Load .env file so ANTHROPIC_API_KEY is available without needing Vercel CLI
// ─────────────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    // Always set from .env — overrides empty shell variables
    if (key) {
      process.env[key] = value;
    }
  }
}
loadEnv();

// ─────────────────────────────────────────────────────────────────────────────
// Import API handlers (same files Vercel uses — no duplication)
// ─────────────────────────────────────────────────────────────────────────────
import sprintHandler      from "./api/sprint.js";
import reportHandler      from "./api/report.js";
import authRequestHandler from "./api/auth/request.js";
import authVerifyHandler  from "./api/auth/verify.js";
import wpWebhookHandler   from "./api/webhooks/wp.js";
// Note: api/auth/_utils.js is a shared module, not a route

// Map URL paths to their handlers
const API_ROUTES = {
  "/api/sprint":         sprintHandler,
  "/api/report":         reportHandler,
  "/api/auth/request":   authRequestHandler,
  "/api/auth/verify":    authVerifyHandler,
  "/api/webhooks/wp":    wpWebhookHandler,
};

// ─────────────────────────────────────────────────────────────────────────────
// MIME types for static files
// ─────────────────────────────────────────────────────────────────────────────
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
};

// ─────────────────────────────────────────────────────────────────────────────
// Serve a static file from /public
// ─────────────────────────────────────────────────────────────────────────────
function serveStatic(req, res) {
  // Normalise the URL path and map to /public
  const urlPath = req.url.split("?")[0];
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(
    __dirname,
    "public",
    safePath === "/" ? "index.html" : safePath
  );

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fall back to index.html for single-page app style routing
      const indexPath = path.join(__dirname, "public", "index.html");
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrap Node's native req/res to match the Vercel handler interface.
// The chat handler expects:  req.method, req.body, req.headers
//                            res.status(code).json(data)
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiRoute(req, res) {
  // Add CORS headers for local dev convenience
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle pre-flight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Read and parse request body
  let body = {};
  try {
    const raw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    if (raw) body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON in request body." }));
    return;
  }

  // Parse query string into an object (needed by /api/auth/verify?token=...)
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const query  = Object.fromEntries(urlObj.searchParams.entries());

  // Build a Vercel-compatible request object
  const vercelReq = {
    method: req.method,
    headers: req.headers,
    body,
    query,
  };

  // Build a Vercel-compatible response object
  let statusCode = 200;
  const vercelRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    },
    // Used by /api/auth/verify to return HTML pages
    send(body) {
      const isHtml   = typeof body === "string" && body.trimStart().startsWith("<");
      const mimeType = isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
      res.writeHead(statusCode, { "Content-Type": mimeType });
      res.end(body);
    },
  };

  // Look up the correct handler for this route
  const urlPath = req.url.split("?")[0];
  const handler = API_ROUTES[urlPath];

  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "API route not found." }));
    return;
  }

  try {
    await handler(vercelReq, vercelRes);
  } catch (err) {
    console.error("Unhandled error in handler:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error." }));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main server
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath.startsWith("/api/")) {
    handleApiRoute(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log("\n  Prompt Architect for Authors");
  console.log("  ─────────────────────────────");
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log("\n  Press Ctrl+C to stop.\n");
});
