import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-3.8-flash"

PROMPT = "Complete this in one short line: I drink coffee every"
RUNS = 5

for temp in (0.0, 1.0):
    print(f"\n=== temperature {temp} ===")
    for i in range(RUNS):
        interaction = client.interactions.create(
            model=MODEL,
            input=PROMPT,
            generation_config={"temperature": temp},
        )
        print(f"{i+1}. {interaction.output_text.strip()}")

# token count by the model's own tokenizer
n = client.models.count_tokens(model=MODEL, contents="I love coding").total_tokens
print("\nGemini token count for 'I love coding':", n)