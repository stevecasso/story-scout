// ─────────────────────────────────────────────────────────────────────────────
// POST /api/report
//
// Compiles all research sprint cards into a single formatted Research Report.
//
// Request body: { sprints: [{id, topic, data: {title, keyQuestions, essentialFacts,
//                authenticityFlags, sensoryDetails, sources}}], ctx: {genre, period, setting, premise} }
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { verifyToken } from "./auth/_utils.js";

function buildReportSystem(count) {
  return `You are a research editor compiling a working brief for a novelist. Produce a concise, complete research report. Every section must be present and finished. Never truncate. A short finished report is better than a long unfinished one.

Write in British English throughout. Use British spelling. Never use em-dashes; use commas or full stops instead.

Use EXACTLY this structure:

# Research Brief: [derive a short title from the novel context]
*[Genre] · [Period] · [Setting]*

---

## Overview
Two to three sentences summarising the research scope.

## Key Themes and Context
Four to six bullet points covering the most important facts across all sprints. No repetition.

## Authenticity Watchpoints
Bullet list of the most critical mistakes to avoid. Maximum six points.

## Atmosphere and Sensory Detail
Three to four sentences drawing together the strongest sensory notes.

## Research Threads to Pursue
Four to six bullet points listing the most useful sources and avenues.

---
*Research brief compiled from ${count} research sprint${count !== 1 ? "s" : ""}.*

RULES: Use only # ## * ** _text_ - and --- for markdown. Keep sections short. Never truncate. End with the footer line above.`;
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
  const { sprints, ctx } = req.body || {};

  if (!Array.isArray(sprints) || sprints.length === 0) {
    return res.status(400).json({ error: "sprints must be a non-empty array." });
  }
  if (!ctx || !ctx.genre || !ctx.period || !ctx.setting) {
    return res.status(400).json({ error: "ctx with genre, period, and setting is required." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API key not configured." });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Compile all sprint data into a single briefing document
  const compiled = sprints.map((s, i) =>
    `SPRINT ${i + 1}: ${s.data.title}
Facts: ${s.data.essentialFacts}
Flags: ${s.data.authenticityFlags.join(" | ")}
Sensory: ${s.data.sensoryDetails}
Sources: ${s.data.sources.join(", ")}`
  ).join("\n\n");

  try {
    const message = await client.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 1500,
      system:     buildReportSystem(sprints.length),
      messages: [{
        role:    "user",
        content: `Novel context: ${ctx.genre} | ${ctx.period} | ${ctx.setting}${ctx.premise ? ` | ${ctx.premise}` : ""}\n\nSprint data:\n\n${compiled}`,
      }],
    });

    const report = message.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    return res.status(200).json({ result: report });

  } catch (error) {
    console.error("Report error:", error);
    return res.status(500).json({ error: "Report generation failed. Please try again." });
  }
}
