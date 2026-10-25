"""Write the Wordle answer list and the guess/bonus-word dictionary.

Usage: python3 scripts/gen_words.py
"""
import json
import random
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from words import FIVE, FOUR, THREE  # noqa: E402

root = os.path.join(os.path.dirname(__file__), "..")

answers = sorted(set(FIVE))
random.Random(2026).shuffle(answers)
with open(os.path.join(root, "src/data/wordle-answers.json"), "w") as f:
    json.dump([w.upper() for w in answers], f)

words = set(FIVE) | set(FOUR) | set(THREE)
with open("/usr/share/dict/web2") as f:
    for line in f:
        w = line.strip()
        if 3 <= len(w) <= 10 and w.isalpha() and w.islower():
            words.add(w)
with open(os.path.join(root, "public/words.txt"), "w") as f:
    f.write("\n".join(sorted(words)))
print(len(answers), "answers,", len(words), "dictionary words")
