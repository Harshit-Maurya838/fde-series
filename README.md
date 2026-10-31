# FDE Series: From Text to Tokens & Next-Token Prediction

How an LLM turns text into tokens and picks the next one.

---

## How to Run

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure your Gemini API key:**
   Create a `.env` file or export your key directly:
   ```bash
   echo "GEMINI_API_KEY=your_gemini_api_key_here" > .env
   # Or: export GEMINI_API_KEY="your_gemini_api_key_here"
   ```

3. **Run the scripts:**
   ```bash
   python 01_tokenizer.py
   python 02_temperature.py
   python 03_bigram.py
   ```

---

## Findings

| Experiment | What I found |
| :--- | :--- |
| **“I love coding”** | **3 tokens** in `cl100k_base` (`['I', ' love', ' coding']`) / **4 tokens** in Gemini (`gemini-3.5-flash-lite`). Common English words form complete subwords efficiently. |
| **Hindi sentence** (`मुझे कोडिंग पसंद है`) | **21 tokens** for 19 characters. Non-Latin scripts suffer from subword fragmentation into single bytes/graphemes—demonstrating the "token tax" on non-English text. |
| **Temp 0 vs 1** | **Temp 0.0 is deterministic** (greedy argmax, outputting `morning.` 5/5 times). **Temp 1.0 flattens the distribution**, allowing diverse outputs (`morning.`, `day.`). |
| **Bigram model** | **Fails on context and long-range memory.** Greedy decoding gets trapped in a cycle (`i like machine learning i like machine...`), and sampling loses semantic coherence because it only considers the immediately preceding word ($N=2$). |

---

## Key Takeaways

1. **Tokens are numbers:** LLMs do not read characters or words—text is broken into subword pieces and mapped to integer IDs in a fixed vocabulary.
2. **Context needs attention:** Local statistical transitions (like bigrams) fail to maintain memory; self-attention is required to dynamically attend to relevant words across the sequence.
3. **Generation is sampling:** An LLM does not generate fixed answers—it generates a probability distribution over the vocabulary via logits and softmax, which is sampled.
4. **Predicts likely text, not true text:** LLMs are trained to maximize next-token probability based on data patterns, optimizing for statistical likelihood rather than factual verification.

---

## How This Connects to Your Post

| Post section | Code that backs it up |
| :--- | :--- |
| **1. Text → tokens → IDs** | [`01_tokenizer.py`](01_tokenizer.py) |
| **2. Attention (“bank”)** | [`03_bigram.py`](03_bigram.py) shows the problem, and the explanation covers the fix |
| **3. Logits → next token** | Explanation in the README (see below) |
| **4. Why answers change** | [`02_temperature.py`](02_temperature.py) |

---

### Deep Dive: 2. Attention (“bank”)

#### The Problem: Context Blindness in N-grams
A bigram model models probability as $P(w_t \mid w_{t-1})$. It only knows the single word immediately before it. 

Consider the ambiguous word **"bank"**:
- *"The fisherman walked along the river **bank**..."* (geographic feature)
- *"The company deposited money in the commercial **bank**..."* (financial institution)

If a bigram model sees the word `"bank"`, it cannot look back 5 or 10 words to check whether the sentence previously talked about *"river"* or *"money"*. It is completely blind to context beyond $w_{t-1}$, causing it to mix concepts or get stuck in repetitive loops (as seen in [`03_bigram.py`](03_bigram.py)).

#### The Fix: Self-Attention in Transformers
Transformers solve this with **Self-Attention** ($Q, K, V$ vectors). For every token, the attention mechanism computes attention scores with every other token in the prompt:
$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$
When processing `"bank"`, the model assigns high attention weight to earlier clues like `"river"` or `"money"`. This creates a contextualized embedding that resolves polysemy and preserves long-range intent across the entire text.

---

### Deep Dive: 3. Logits → Next Token

#### From Neural Activations to Output Words
When an LLM processes an input sequence, the final linear layer outputs a vector of raw, unnormalized scores called **logits** ($z \in \mathbb{R}^{|V|}$), with one scalar score per token in the vocabulary $V$ (often 32,000 to 256,000+ words).

To turn logits into valid probabilities that sum to 1, we apply the **Softmax** function with temperature scaling ($T$):

$$P(w_i) = \frac{e^{z_i / T}}{\sum_{j=1}^{|V|} e^{z_j / T}}$$

```
[Context Tokens]
       ↓
[Transformer Layers]
       ↓
[Logits (Raw Scores)] ──> e.g. ["morning": 8.5, "day": 6.2, "night": 1.1]
       ↓
[Scale by Temperature T]
       ↓
[Softmax Function]    ──> e.g. ["morning": 89%, "day": 10%, "night": 1%]
       ↓
[Sampling / Selection]──> Selected Next Token
```

- **Temperature $T \to 0$ (Greedy / Argmax):** The highest logit dominates with probability $\approx 1$. The model becomes strictly deterministic.
- **Moderate Temperature ($T \approx 0.7 - 1.0$):** Softens the distribution. The top tokens remain most probable, but second- and third-ranked tokens have a realistic chance to be sampled, enabling creative variety.
- **High Temperature ($T > 1.5$):** Flattens the distribution toward uniform probability, introducing randomness and hallucination.

---

## Credit

Based on Coder Army’s FDE course, episodes 1-2.

