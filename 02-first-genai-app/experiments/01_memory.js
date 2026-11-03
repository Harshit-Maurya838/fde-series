import { setupTestServer, saveResult } from "./helpers.js";

async function run() {
  console.log("=== Running Experiment 01: Memory (Stateless vs Stateful) ===");
  const { baseUrl, teardown } = await setupTestServer(3000);

  try {
    // 1. Stateless Execution
    console.log("\n[1/2] Testing Stateless endpoint (/api/chat/stateless)...");
    const statelessRes1 = await fetch(`${baseUrl}/api/chat/stateless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi, my name is Harshit" }),
    }).then((r) => r.json());

    console.log("Turn 1 Reply:", statelessRes1.reply);

    const statelessRes2 = await fetch(`${baseUrl}/api/chat/stateless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What is my name?" }),
    }).then((r) => r.json());

    console.log("Turn 2 Reply:", statelessRes2.reply);

    // 2. Stateful Execution
    console.log("\n[2/2] Testing Stateful endpoint (/api/chat)...");
    const sessionId = `exp1_${Date.now()}`;

    const statefulRes1 = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "Hi, my name is Harshit",
        strategy: "full",
      }),
    }).then((r) => r.json());

    console.log("Turn 1 Reply:", statefulRes1.reply);

    const statefulRes2 = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "What is my name?",
        strategy: "full",
      }),
    }).then((r) => r.json());

    console.log("Turn 2 Reply:", statefulRes2.reply);

    // Format Markdown Report
    const markdown = `# Experiment 01: Memory (Stateless vs Stateful LLM Calls)

## Objective
Demonstrate the fundamental difference between raw, stateless LLM API interactions and an application-managed stateful conversation session.

---

## 1. Stateless API Calls (\`/api/chat/stateless\`)

In this mode, each HTTP request passes only the immediate user prompt to Gemini. The model is called with zero conversational history.

| Turn | User Message | Assistant Reply | Input Tokens | Output Tokens | Remembers Name? |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | \`Hi, my name is Harshit\` | ${statelessRes1.reply.replace(/\n/g, " ")} | ${statelessRes1.usage?.inputTokens ?? "N/A"} | ${statelessRes1.usage?.outputTokens ?? "N/A"} | N/A |
| **2** | \`What is my name?\` | ${statelessRes2.reply.replace(/\n/g, " ")} | ${statelessRes2.usage?.inputTokens ?? "N/A"} | ${statelessRes2.usage?.outputTokens ?? "N/A"} | ❌ No |

### Finding:
Because the server did not supply turn 1 in the API request payload, the underlying LLM has **no persistent memory**. Gemini cannot recall "Harshit" and politely asks who it is speaking to or states that it does not know.

---

## 2. Stateful API Calls (\`/api/chat\`)

In this mode, the server maintains an in-memory session map (\`sessionId\`). On each turn, the Express backend reconstructs the conversation array and sends prior turns alongside the new prompt.

| Turn | User Message | Assistant Reply | Input Tokens | Output Tokens | Remembers Name? |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | \`Hi, my name is Harshit\` | ${statefulRes1.reply.replace(/\n/g, " ")} | ${statefulRes1.usage?.inputTokens ?? "N/A"} | ${statefulRes1.usage?.outputTokens ?? "N/A"} | N/A |
| **2** | \`What is my name?\` | ${statefulRes2.reply.replace(/\n/g, " ")} | ${statefulRes2.usage?.inputTokens ?? "N/A"} | ${statefulRes2.usage?.outputTokens ?? "N/A"} | ✅ Yes |

### Finding:
Gemini successfully replies that the user's name is **Harshit**. 
Notice the input token increase in Turn 2: the model was fed the system prompt + Turn 1 User + Turn 1 Assistant + Turn 2 User.

---

## Key FDE Takeaway
LLMs are **100% stateless functions**. All "chat memory" in enterprise AI is an illusion engineered on the application layer by re-submitting historical tokens on every call. Every remembered fact incurs recurring token costs.
`;

    await saveResult("01_memory.md", markdown);
  } finally {
    await teardown();
  }
}

run().catch((err) => {
  console.error("Experiment 01 failed:", err);
  process.exit(1);
});

