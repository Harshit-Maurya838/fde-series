import { startServer, stopServer } from "../src/server.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures the Express app is running.
 * If a server is already running on the port, uses it.
 * Otherwise, spins up an in-process instance.
 */
export async function setupTestServer(port = 3000) {
  const baseUrl = `http://localhost:${port}`;
  let ownsServer = false;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
    });
    // If it returns any response, server is already active
    return { baseUrl, teardown: async () => {} };
  } catch (err) {
    // Server is not running; start our own
    await startServer(port);
    ownsServer = true;
    return {
      baseUrl,
      teardown: async () => {
        if (ownsServer) {
          await stopServer();
        }
      },
    };
  }
}

/**
 * Saves markdown content to the results directory.
 * @param {string} filename e.g. "01_memory.md"
 * @param {string} content Markdown text
 */
export async function saveResult(filename, content) {
  const resultsDir = path.join(__dirname, "../results");
  await fs.mkdir(resultsDir, { recursive: true });
  const filePath = path.join(resultsDir, filename);
  await fs.writeFile(filePath, content, "utf-8");
  console.log(`Saved results to: ${filePath}`);
}

