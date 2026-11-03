# Experiment 01: Memory (Stateless vs Stateful LLM Calls)

## Objective
Demonstrate the fundamental difference between raw, stateless LLM API interactions and an application-managed stateful conversation session.

---

## 1. Stateless API Calls (`/api/chat/stateless`)

In this mode, each HTTP request passes only the immediate user prompt to Gemini. The model is called with zero conversational history.

| Turn | User Message | Assistant Reply | Input Tokens | Output Tokens | Remembers Name? |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | `Hi, my name is Harshit` | Hello Harshit! How can I help you with your QuickBite order today? | 110 | 17 | N/A |
| **2** | `What is my name?` | I'm sorry, but I can only assist with food delivery support such as order status and refunds. Could you please share your order ID so I can help you with your delivery? | 108 | 37 | ❌ No |

### Finding:
Because the server did not supply turn 1 in the API request payload, the underlying LLM has **no persistent memory**. Gemini cannot recall "Harshit" and politely asks who it is speaking to or states that it does not know.

---

## 2. Stateful API Calls (`/api/chat`)

In this mode, the server maintains an in-memory session map (`sessionId`). On each turn, the Express backend reconstructs the conversation array and sends prior turns alongside the new prompt.

| Turn | User Message | Assistant Reply | Input Tokens | Output Tokens | Remembers Name? |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | `Hi, my name is Harshit` | Hello Harshit! Welcome to QuickBite support, how can I help you with your order today? Please provide your order ID if you are inquiring about a specific delivery. | 110 | 35 | N/A |
| **2** | `What is my name?` | You told me your name is Harshit! How can I assist you with your QuickBite order today? | 152 | 22 | ✅ Yes |

### Finding:
Gemini successfully replies that the user's name is **Harshit**. 
Notice the input token increase in Turn 2: the model was fed the system prompt + Turn 1 User + Turn 1 Assistant + Turn 2 User.

---

## Key FDE Takeaway
LLMs are **100% stateless functions**. All "chat memory" in enterprise AI is an illusion engineered on the application layer by re-submitting historical tokens on every call. Every remembered fact incurs recurring token costs.
