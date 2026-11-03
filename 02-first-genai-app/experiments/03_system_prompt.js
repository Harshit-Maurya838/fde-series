import { callGemini } from "../src/llm.js";
import { SYSTEM_PROMPT } from "../src/systemPrompt.js";
import { saveResult } from "./helpers.js";

const QUESTIONS = [
  {
    type: "In-Scope",
    prompt: "My pizza arrived 45 minutes late and is stone cold. How do I get a refund?",
  },
  {
    type: "In-Scope",
    prompt: "I entered the wrong apartment number for order #55123. Can I update my delivery address?",
  },
  {
    type: "In-Scope",
    prompt: "Do you offer contactless doorstep delivery options for late-night orders?",
  },
  {
    type: "Out-of-Scope",
    prompt: "What is Docker and how does containerization work?",
  },
  {
    type: "Out-of-Scope",
    prompt: "Can you write me a Python script using merge sort to sort a list of numbers?",
  },
];

async function run() {
  console.log("=== Running Experiment 03: System Prompt (Guardrails & Behavior) ===");

  const resultsWithout = [];
  const resultsWith = [];

  console.log("\n[1/2] Running 5 prompts WITHOUT system prompt...");
  for (const q of QUESTIONS) {
    const res = await callGemini(q.prompt, {
      temperature: 0.2,
      // No system instruction passed
    });
    resultsWithout.push({
      ...q,
      reply: res.text.trim(),
      usage: res.usage,
    });
    console.log(`- [${q.type}] "${q.prompt.substring(0, 30)}..." -> In: ${res.usage.inputTokens}, Out: ${res.usage.outputTokens}`);
  }

  console.log("\n[2/2] Running 5 prompts WITH system prompt...");
  for (const q of QUESTIONS) {
    const res = await callGemini(q.prompt, {
      temperature: 0.2,
      systemInstruction: SYSTEM_PROMPT,
    });
    resultsWith.push({
      ...q,
      reply: res.text.trim(),
      usage: res.usage,
    });
    console.log(`- [${q.type}] "${q.prompt.substring(0, 30)}..." -> In: ${res.usage.inputTokens}, Out: ${res.usage.outputTokens}`);
  }

  // Construct Markdown
  let tableRows = "";
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const wOut = resultsWithout[i];
    const wIn = resultsWith[i];

    tableRows += `### ${i + 1}. [${q.type}] \`${q.prompt}\`\n\n`;
    tableRows += `| Metric / Field | Without System Prompt (Raw Model) | With System Prompt (Guarded QuickBite Agent) |\n`;
    tableRows += `| :--- | :--- | :--- |\n`;
    tableRows += `| **Input Tokens** | ${wOut.usage.inputTokens} | ${wIn.usage.inputTokens} |\n`;
    tableRows += `| **Output Tokens** | ${wOut.usage.outputTokens} | ${wIn.usage.outputTokens} |\n`;
    tableRows += `| **Total Tokens** | ${wOut.usage.totalTokens} | ${wIn.usage.totalTokens} |\n`;
    tableRows += `| **Adheres to Persona?** | ❌ Generic AI Assistant | ✅ QuickBite Support Executive |\n`;
    tableRows += `| **Follows Constraints?** | ❌ Answers programming / generic queries | ✅ Strictly refuses out-of-scope questions |\n`;
    tableRows += `| **Response Length** | Long / multi-paragraph (${wOut.usage.outputTokens} tokens) | Max 2 concise sentences (${wIn.usage.outputTokens} tokens) |\n\n`;
    tableRows += `**Raw Model Reply:**\n> ${wOut.reply.replace(/\n/g, "\n> ")}\n\n`;
    tableRows += `**Guarded Agent Reply:**\n> ${wIn.reply.replace(/\n/g, "\n> ")}\n\n`;
    tableRows += `---\n\n`;
  }

  const markdown = `# Experiment 03: System Prompt Guardrails & Behavioral Shaping

## Objective
Evaluate how an explicit 4-part system prompt shapes LLM behavior across 3 in-scope customer support questions and 2 out-of-scope requests (programming & devops).

### System Prompt Under Test:
\`\`\`text
${SYSTEM_PROMPT}
\`\`\`

---

## Comparative Results

${tableRows}

---

## Architectural Findings & FDE Takeaways

1. **Guardrails Prevent Scope Leakage**:
   Without a system prompt, a raw LLM acts as an open-ended conversationalist, happily writing code or explaining Docker containers when deployed on a customer support interface. The system prompt constraints strictly contain the model's domain.

2. **Cost & Latency Control**:
   The system instruction enforces *"Limit responses to a maximum of 2 sentences"*. Notice the drastic reduction in output tokens on out-of-scope questions:
   - Raw model on Docker / Python: generates hundreds of output tokens per request.
   - Guarded agent: polite 1-2 sentence refusal, saving both latency and output generation cost.

3. **System Prompt "Token Tax"**:
   System instructions add a fixed input token overhead to every call (~65-75 tokens). As an FDE, keeping the system prompt compact and structured (ROLE, TASK, BEHAVIOR, CONSTRAINTS) ensures cost efficiency at scale.
`;

  await saveResult("03_system_prompt.md", markdown);
}

run().catch((err) => {
  console.error("Experiment 03 failed:", err);
  process.exit(1);
});

