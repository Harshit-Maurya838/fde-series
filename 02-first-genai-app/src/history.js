import { callGemini } from "./llm.js";

/**
 * In-memory storage for active chat sessions.
 * Maps sessionId -> { history: Array, summary: string }
 */
export const sessions = new Map();

/**
 * Retrieves an existing session or initializes a new one.
 * @param {string} sessionId
 * @returns {Object} Session object
 */
export function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      summary: "",
    });
  }
  return sessions.get(sessionId);
}

/**
 * Appends a user or model message to session history.
 * @param {string} sessionId
 * @param {'user'|'model'} role
 * @param {string} text
 */
export function recordMessage(sessionId, role, text) {
  const session = getOrCreateSession(sessionId);
  session.history.push({
    role,
    parts: [{ text }],
  });
}

/**
 * Clears history for a specific session (useful for resets & testing).
 * @param {string} sessionId
 */
export function clearSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Builds the array of contents to pass to Gemini according to the chosen history strategy.
 *
 * Strategies:
 * 1. "full": Sends the entire recorded history plus the new message.
 * 2. "first_n": Sends the first N messages of history plus the new message.
 * 3. "first_n_last_n": Sends the first N and last N messages of history plus the new message.
 * 4. "summary": Summarizes older messages beyond the recent window using an extra LLM call,
 *               then sends [summary context] + recent messages + new message.
 *
 * @param {string} sessionId
 * @param {string} userMessage
 * @param {string} strategy - "full" | "first_n" | "first_n_last_n" | "summary"
 * @param {number} n - N parameter for slicing (defaults to env or 2)
 * @returns {Promise<{contents: Array, summaryUsage?: Object}>}
 */
export async function buildHistoryContents(sessionId, userMessage, strategy = "full", n = 2) {
  const session = getOrCreateSession(sessionId);
  const history = session.history;
  const numN = Math.max(1, parseInt(n, 10) || 2);
  const newUserTurn = { role: "user", parts: [{ text: userMessage }] };

  let selectedHistory = [];
  let summaryUsage = null;

  switch (strategy) {
    case "first_n": {
      // Retain the initial N messages (e.g. user intro, account details)
      selectedHistory = history.slice(0, numN);
      break;
    }

    case "first_n_last_n": {
      if (history.length <= 2 * numN) {
        // Not enough messages to prune middle; send all
        selectedHistory = [...history];
      } else {
        // First N + Last N messages
        selectedHistory = [
          ...history.slice(0, numN),
          ...history.slice(-numN),
        ];
      }
      break;
    }

    case "summary": {
      // Keep the most recent 2*N messages intact as recent context
      const recentWindowSize = Math.max(2, numN * 2);

      if (history.length <= recentWindowSize) {
        // Conversation is short; no compression needed yet
        selectedHistory = [...history];
      } else {
        const olderMessages = history.slice(0, history.length - recentWindowSize);
        const recentMessages = history.slice(-recentWindowSize);

        // Format older messages as transcript text for the summarizer
        const transcript = olderMessages
          .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.parts[0]?.text || ""}`)
          .join("\n");

        const summaryPrompt = session.summary
          ? `You are an AI assistant updating a conversation summary for a food delivery support ticket.
Existing Summary:
${session.summary}

New conversation turns to integrate:
${transcript}

Write an updated, highly concise summary (max 3 sentences) capturing key entities (customer name, order ID, items, delivery issues, refunds):`
          : `You are an AI assistant summarizing a food delivery support conversation.
Conversation turns:
${transcript}

Write a concise summary (max 3 sentences) capturing key entities (customer name, order ID, items, delivery issues, refunds):`;

        // Extra LLM call to produce running summary
        const summaryResult = await callGemini(summaryPrompt, {
          temperature: 0.2,
        });

        session.summary = summaryResult.text.trim();
        summaryUsage = summaryResult.usage;

        // Inject summary as an initial context turn, followed by recent messages
        selectedHistory = [
          {
            role: "user",
            parts: [{ text: `[Prior Conversation Summary]:\n${session.summary}` }],
          },
          {
            role: "model",
            parts: [{ text: "Understood. I have the context of our previous discussion." }],
          },
          ...recentMessages,
        ];
      }
      break;
    }

    case "full":
    default: {
      selectedHistory = [...history];
      break;
    }
  }

  return {
    contents: [...selectedHistory, newUserTurn],
    summaryUsage,
  };
}

