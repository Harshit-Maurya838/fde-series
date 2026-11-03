import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { callGemini } from "./llm.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import {
  sessions,
  getOrCreateSession,
  recordMessage,
  buildHistoryContents,
  clearSession,
} from "./history.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Enable text/plain body parsing for /api/summarize
app.use(express.text({ type: ["text/plain", "text/*"] }));

app.use(express.static(path.join(__dirname, "../public")));

/**
 * Health check endpoint for UI connectivity status.
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    time: new Date().toISOString(),
  });
});

/**
 * 1. POST /api/summarize
 * Summarizes a customer support ticket in 2 lines.
 * Stateless, single LLM call. Body is text/plain.
 */
app.post("/api/summarize", async (req, res) => {
  try {
    const ticketText = typeof req.body === "string" ? req.body : req.body?.text;
    if (!ticketText || !ticketText.trim()) {
      return res.status(400).json({
        error: "Body must contain customer ticket text (text/plain or JSON { text }).",
      });
    }

    const prompt = `Summarize the following customer support ticket in exactly 2 concise lines:\n\n${ticketText.trim()}`;
    const result = await callGemini(prompt, { temperature: 0.2 });

    return res.json({
      summary: result.text.trim(),
      usage: result.usage,
    });
  } catch (err) {
    console.error("Error in /api/summarize:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 2. POST /api/chat/stateless
 * Sends ONLY the latest message to Gemini, ignoring all prior history.
 * Demonstrates that the model has no inherent memory across requests.
 */
app.post("/api/chat/stateless", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Missing "message" in request body.' });
    }

    const result = await callGemini(message.trim(), {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    });

    return res.json({
      reply: result.text.trim(),
      usage: result.usage,
    });
  } catch (err) {
    console.error("Error in /api/chat/stateless:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 3. POST /api/chat
 * Multi-turn chat endpoint with stateful in-memory history.
 * Body: { sessionId, message, strategy, n }
 * Strategies: "full" | "first_n" | "first_n_last_n" | "summary"
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Missing "message" in request body.' });
    }

    const activeSessionId = sessionId || `session_${Date.now()}`;
    const strategy = req.body.strategy || req.query.strategy || "full";
    const n = req.query.n || req.body.n || process.env.DEFAULT_HISTORY_N || 2;

    // Build the contents according to the selected history strategy
    const { contents, summaryUsage } = await buildHistoryContents(
      activeSessionId,
      message.trim(),
      strategy,
      n
    );

    // Call Gemini with the assembled contents and system prompt
    const result = await callGemini(contents, {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    });

    const reply = result.text.trim();

    // Record turn into persistent in-memory session history
    recordMessage(activeSessionId, "user", message.trim());
    recordMessage(activeSessionId, "model", reply);

    const session = getOrCreateSession(activeSessionId);

    return res.json({
      reply,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
      historyLength: session.history.length,
      strategy,
      sessionId: activeSessionId,
      ...(summaryUsage ? { summaryUsage } : {}),
    });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /api/history/:sessionId
 * Inspect session history and running summary for debugging.
 */
app.get("/api/history/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: `Session "${sessionId}" not found.` });
  }

  const session = sessions.get(sessionId);
  return res.json({
    sessionId,
    historyLength: session.history.length,
    history: session.history,
    summary: session.summary || null,
  });
});

/**
 * DELETE /api/history/:sessionId
 * Reset or clear session history.
 */
app.delete("/api/history/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  clearSession(sessionId);
  return res.json({
    success: true,
    message: `Session "${sessionId}" has been cleared.`,
  });
});

let serverInstance = null;

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
      resolve(serverInstance);
    });
  });
}

export function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => resolve());
    } else {
      resolve();
    }
  });
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("server.js");
if (isDirectRun) {
  startServer();
}

export { app };

