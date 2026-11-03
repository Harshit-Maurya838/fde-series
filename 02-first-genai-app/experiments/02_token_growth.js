import { setupTestServer, saveResult } from "./helpers.js";

const SCRIPTED_CONVERSATION = [
  "Hi, I need help with my account.",
  "My order ID is #48291 and my name is Harshit.", // Critical detail in Turn 2
  "Is my pizza on the way?",
  "How long does delivery usually take during peak dinner hours?",
  "Can I add garlic bread to my order now?",
  "What payment methods do you accept for online orders?",
  "Do you have any discount coupons available today?",
  "Can I leave special instructions for the delivery partner?",
  "Do you provide contactless doorstep drop-off?",
  "What happens if an item is missing from my bag?",
  "How do refund credits work on QuickBite?",
  "Are beverage drinks delivered in insulated thermal bags?",
  "Can I change my delivery address to my office address?",
  "What should I do if the food packaging is damaged upon arrival?",
  "Is cutlery automatically included with the order?",
  "Can I tip the delivery driver via the app after delivery?",
  "What is your cancellation policy once food is being prepared?",
  "Do you offer late-night delivery after midnight in downtown?",
  "How can I rate the restaurant and driver after delivery?",
  "What was the order ID and customer name I gave you earlier?", // Question verifying recall of Turn 2
];

async function runStrategy(baseUrl, strategy, n = 2) {
  const sessionId = `exp2_${strategy}_${Date.now()}`;
  const tokenLogs = [];
  let finalReply = "";

  console.log(`\n--- Running Strategy: "${strategy}" (N=${n}) ---`);

  for (let i = 0; i < SCRIPTED_CONVERSATION.length; i++) {
    const userMsg = SCRIPTED_CONVERSATION[i];
    const turnNum = i + 1;

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: userMsg,
        strategy,
        n,
      }),
    }).then((r) => r.json());

    const inputTok = res.usage?.inputTokens ?? 0;
    const outputTok = res.usage?.outputTokens ?? 0;
    const replyText = res.reply ?? "";

    tokenLogs.push({
      turn: turnNum,
      userMsg,
      inputTokens: inputTok,
      outputTokens: outputTok,
      reply: replyText,
    });

    if (turnNum === SCRIPTED_CONVERSATION.length) {
      finalReply = replyText;
    }

    // Pacing to stay within 15 RPM limit smoothly
    await new Promise((r) => setTimeout(r, 1800));

    process.stdout.write(`Turn ${turnNum}/20: in=${inputTok} tok | `);
    if (turnNum % 5 === 0) console.log("");
  }

  // Check if answer contains the key details (Harshit and 48291)
  const lower = (finalReply || "").toLowerCase();
  const hasHarshit = lower.includes("harshit");
  const hasOrderId = lower.includes("48291");
  const isAccurate = hasHarshit && hasOrderId;

  return {
    strategy,
    tokenLogs,
    finalReply,
    isAccurate,
    hasHarshit,
    hasOrderId,
  };
}

async function run() {
  console.log("=== Running Experiment 02: Token Growth Across 4 History Strategies ===");
  const { baseUrl, teardown } = await setupTestServer(3000);

  try {
    const strategies = ["full", "first_n", "first_n_last_n", "summary"];
    const results = {};

    for (const strat of strategies) {
      results[strat] = await runStrategy(baseUrl, strat, 2);
    }

    // Build markdown table
    let tableRows = "";
    for (let i = 0; i < SCRIPTED_CONVERSATION.length; i++) {
      const turnNum = i + 1;
      const promptSnippet = SCRIPTED_CONVERSATION[i].length > 35
        ? SCRIPTED_CONVERSATION[i].substring(0, 32) + "..."
        : SCRIPTED_CONVERSATION[i];

      const fullTok = results["full"].tokenLogs[i].inputTokens;
      const firstNTok = results["first_n"].tokenLogs[i].inputTokens;
      const firstLastTok = results["first_n_last_n"].tokenLogs[i].inputTokens;
      const summaryTok = results["summary"].tokenLogs[i].inputTokens;

      tableRows += `| **${turnNum}** | \`${promptSnippet}\` | ${fullTok} | ${firstNTok} | ${firstLastTok} | ${summaryTok} |\n`;
    }

    const markdown = `# Experiment 02: Chat History Strategies & Token Growth

## Objective
Benchmark how input tokens scale across a 20-message customer conversation using 4 different history management strategies:
1. **Full History (\`full\`)**: Re-sends every historical turn.
2. **First N (\`first_n\`)**: Keeps only the first N (N=2) messages + current prompt.
3. **First N + Last N (\`first_n_last_n\`)**: Keeps first N and last N messages.
4. **Running Summary (\`summary\`)**: Compresses older turns into an evolving synopsis via an auxiliary LLM call, passing summary + recent turns.

At Turn 20, the customer asks: *"What was the order ID and customer name I gave you earlier?"* (stated in Turn 2 as **"Harshit"** and **"#48291"**).

---

## Token Growth Benchmark Table (Input Tokens per Turn)

| Message # | Prompt Snippet | \`full\` (Input Tok) | \`first_n\` (Input Tok) | \`first_n_last_n\` (Input Tok) | \`summary\` (Input Tok) |
| :---: | :--- | :---: | :---: | :---: | :---: |
${tableRows}

---

## Final Recall Evaluation (Turn 20)

**Question:** *"What was the order ID and customer name I gave you earlier?"*  
**Ground Truth:** Name: **Harshit**, Order ID: **#48291**

| Strategy | Final Assistant Response | Recalled Name? | Recalled Order ID? | Turn 20 Input Tokens |
| :--- | :--- | :---: | :---: | :---: |
| **\`full\`** | ${results["full"].finalReply.replace(/\n/g, " ")} | ${results["full"].hasHarshit ? "✅ Yes" : "❌ No"} | ${results["full"].hasOrderId ? "✅ Yes" : "❌ No"} | ${results["full"].tokenLogs[19].inputTokens} |
| **\`first_n\`** (N=2) | ${results["first_n"].finalReply.replace(/\n/g, " ")} | ${results["first_n"].hasHarshit ? "✅ Yes" : "❌ No"} | ${results["first_n"].hasOrderId ? "✅ Yes" : "❌ No"} | ${results["first_n"].tokenLogs[19].inputTokens} |
| **\`first_n_last_n\`** (N=2) | ${results["first_n_last_n"].finalReply.replace(/\n/g, " ")} | ${results["first_n_last_n"].hasHarshit ? "✅ Yes" : "❌ No"} | ${results["first_n_last_n"].hasOrderId ? "✅ Yes" : "❌ No"} | ${results["first_n_last_n"].tokenLogs[19].inputTokens} |
| **\`summary\`** | ${results["summary"].finalReply.replace(/\n/g, " ")} | ${results["summary"].hasHarshit ? "✅ Yes" : "❌ No"} | ${results["summary"].hasOrderId ? "✅ Yes" : "❌ No"} | ${results["summary"].tokenLogs[19].inputTokens} |

---

## Architectural Analysis & FDE Takeaways

1. **The Cost of Linear Growth (\`full\`)**:
   Under \`full\`, input tokens grow linearly $O(M)$ on every turn ($M$ = total tokens accumulated so far). Over a 20-turn chat, you end up re-paying for turn 1 twenty times. In high-traffic enterprise deployments, this causes exponential API bills and context latency.

2. **The Risk of Blind Slicing (\`first_n\` / \`first_n_last_n\`)**:
   While \`first_n\` and \`first_n_last_n\` keep token counts bounded and cheap, any critical context that falls outside the sliced window is permanently forgotten by the model.

3. **The Power of Running Summaries (\`summary\`)**:
   The \`summary\` strategy trades a small auxiliary summarization cost to keep prompt tokens bounded while retaining key business entities (customer name, order number, pending complaints). This is the foundation of production Agentic memory.
`;

    await saveResult("02_token_growth.md", markdown);
  } finally {
    await teardown();
  }
}

run().catch((err) => {
  console.error("Experiment 02 failed:", err);
  process.exit(1);
});
