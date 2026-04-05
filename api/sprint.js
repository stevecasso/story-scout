// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sprint
//
// Runs a single research sprint and returns a structured JSON card.
// Supports two modes:
//   useWebSearch: false  — uses Claude's built-in knowledge (fast)
//   useWebSearch: true   — two-step: live web search then JSON conversion
//
// Request body: { topic, novelCtx, useWebSearch }
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { verifyToken } from "./auth/_utils.js";

function buildSprintSchema() {
  return `{"title":"concise sprint title","keyQuestions":["question 1","question 2","question 3"],"essentialFacts":"one focused paragraph of key facts","authenticityFlags":["specific mistake or anachronism 1","specific mistake or anachronism 2","specific mistake or anachronism 3"],"sensoryDetails":"2 to 3 sentences of vivid sensory and atmospheric texture","sources":["source 1","source 2","source 3"]}`;
}

function buildDirectSystem(novelCtx) {
  return `You are Research Rabbit, an expert research assistant for fiction writers. Novel context: ${novelCtx}. Respond ONLY with valid JSON, no markdown fences or preamble. Use British English spelling, punctuation and grammar throughout all text values. Never use em-dashes; use commas or full stops instead. Be specific to this novel context, never generic. Structure your response exactly as: ${buildSprintSchema()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  // ── Auth check ────────────────────────────────────────────────────────────
  const authHeader   = req.headers["authorization"] || "";
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sessionData  = verifyToken(sessionToken, "session");
  if (!sessionData || !sessionData.email) {
    return res.status(401).json({ error: "Not authenticated. Please sign in.", code: "AUTH_REQUIRED" });
  }

  // ── Validate payload ──────────────────────────────────────────────────────
  const { topic, novelCtx, useWebSearch } = req.body || {};

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "topic is required." });
  }
  if (!novelCtx || typeof novelCtx !== "string" || !novelCtx.trim()) {
    return res.status(400).json({ error: "novelCtx is required." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API key not configured." });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    if (useWebSearch) {
      // ── Step 1: web search to gather research ──────────────────────────
      const step1 = await client.messages.create({
        model:   "claude-sonnet-4-5",
        max_tokens: 1000,
        system:  `You are a research assistant for fiction writers. Novel context: ${novelCtx}. Search the web and return a plain-text brief covering: key facts, common author mistakes or anachronisms, sensory details, and three specific sources. British English only. No em-dashes.`,
        tools:   [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: `Research this topic for a novelist: ${topic}` }],
      });
      const researchText = step1.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      // ── Step 2: convert research to JSON card ─────────────────────────
      const step2 = await client.messages.create({
        model:   "claude-sonnet-4-5",
        max_tokens: 1000,
        system:  `Convert the research brief into ONLY valid JSON with no markdown fences or preamble, using this exact structure: ${buildSprintSchema()}. British English only. No em-dashes.`,
        messages: [{ role: "user", content: `Convert this research into the JSON structure:\n\n${researchText}` }],
      });
      const raw = step2.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      return res.status(200).json({ result: raw });

    } else {
      // ── Direct sprint using Claude's knowledge ────────────────────────
      const message = await client.messages.create({
        model:   "claude-sonnet-4-5",
        max_tokens: 1000,
        system:  buildDirectSystem(novelCtx),
        messages: [{ role: "user", content: `Research sprint: ${topic}` }],
      });
      const raw = message.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      return res.status(200).json({ result: raw });
    }

  } catch (error) {
    console.error("Sprint error:", error);
    return res.status(500).json({ error: "Sprint failed. Please try again." });
  }
}
