import tiktoken

enc = tiktoken.get_encoding("cl100k_base")

samples = [
    "I love coding",
    "invisible",
    "मुझे कोडिंग पसंद है",
    "Harshit",
    "The capital of India is Delhi",
]

for text in samples:
    ids = enc.encode(text)
    pieces = [b.decode("utf-8", errors="replace") for b in enc.decode_tokens_bytes(ids)]
    print(f"\n{text!r}")
    print(f"  characters: {len(text)} | tokens: {len(ids)}")
    print(f"  ids:    {ids}")
    print(f"  pieces: {pieces}")