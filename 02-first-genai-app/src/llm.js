import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let clientInstance = null;

/**
 * Returns a cached instance of GoogleGenAI or initializes a new one.
 * Validates that GEMINI_API_KEY is present.
 */
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY environment variable. Please define it in your .env file or export it."
    );
  }
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey });
  }
  return clientInstance;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls Gemini using the official @google/genai SDK.
 * Includes automatic rate-limit (429) and high-load (503) retry with backoff.
 *
 * @param {string|Array} contents - Text prompt string or structured message array
 * @param {Object} options - Optional parameters:
 *   - model: Model name (defaults to GEMINI_MODEL env var or "gemini-3.5-flash-lite")
 *   - systemInstruction: String for system prompt
 *   - temperature: Sampling temperature (e.g., 0.2 for deterministic or 0.7)
 *   - maxRetries: Maximum retry attempts for rate limits (default 5)
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number, totalTokens: number}}>}
 */
export async function callGemini(contents, options = {}) {
  const ai = getClient();
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const maxRetries = options.maxRetries ?? 5;

  // Normalize input contents to standard SDK shape
  let formattedContents = contents;
  if (Array.isArray(contents)) {
    formattedContents = contents.map((item) => {
      if (typeof item === "string") {
        return { role: "user", parts: [{ text: item }] };
      }
      if (item.parts) {
        return item;
      }
      // Support simplified { role, text/content } format
      const role = item.role === "assistant" ? "model" : (item.role || "user");
      return {
        role,
        parts: [{ text: item.text || item.content || "" }],
      };
    });
  }

  // Build config object
  const config = {};
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  if (typeof options.temperature === "number") {
    config.temperature = options.temperature;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: formattedContents,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      });

      const usageMetadata = response.usageMetadata || {};

      return {
        text: response.text ?? "",
        usage: {
          inputTokens: usageMetadata.promptTokenCount ?? 0,
          outputTokens: usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: usageMetadata.totalTokenCount ?? 0,
        },
      };
    } catch (err) {
      const errMsg = err.message || "";
      const isRateLimit =
        errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
      const isOverloaded =
        errMsg.includes("503") || errMsg.includes("UNAVAILABLE");

      if ((isRateLimit || isOverloaded) && attempt < maxRetries) {
        // Parse retry delay from Google's response if available
        let delayMs = Math.min(35000, 2000 * Math.pow(2, attempt - 1));
        const match =
          errMsg.match(/retry in\s+([0-9.]+)\s*s/i) ||
          errMsg.match(/retryDelay"?:\s*"([0-9.]+)s"/i);
        if (match && match[1]) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1500;
        }

        console.warn(
          `\n[Rate Limit / Spikes] Backing off for ${Math.round(
            delayMs / 1000
          )}s before retry ${attempt}/${maxRetries}...`
        );
        await sleep(delayMs);
        continue;
      }

      // Enhance error message with context for beginner-friendly debugging
      const message = err.message || "Unknown error calling Gemini API";
      throw new Error(`Gemini API Error (${model}): ${message}`);
    }
  }
}
