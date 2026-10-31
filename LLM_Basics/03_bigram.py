import random
from collections import defaultdict, Counter

corpus = """
i like machine learning
i like java
i like machine learning models
you like coffee
i drink coffee every morning
i drink tea every evening
"""

words = corpus.split()
nxt = defaultdict(Counter)
for a, b in zip(words, words[1:]):
    nxt[a][b] += 1

def predict(word, greedy=True):
    options = nxt.get(word)
    if not options:
        return None
    if greedy:
        return options.most_common(1)[0][0]
    return random.choices(list(options), weights=options.values())[0]

def generate(start, n=6, greedy=True):
    out = [start]
    for _ in range(n):
        w = predict(out[-1], greedy)
        if not w:
            break
        out.append(w)
    return " ".join(out)

print("greedy :", generate("i"))
print("sampled:", [generate("i", greedy=False) for _ in range(3)])
print("after 'like':", dict(nxt["like"]))