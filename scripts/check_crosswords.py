"""Check src/data/crosswords-more.json: every across/down answer has a clue, no extra clues, no repeats.

Usage: python3 scripts/check_crosswords.py
"""
import json
import os

path = os.path.join(os.path.dirname(__file__), "..", "src/data/crosswords-more.json")
data = json.load(open(path))


def answers(grid):
    n = len(grid)
    out = []
    lines = [(grid[r], None) for r in range(n)] + [("".join(grid[r][c] for r in range(n)), None) for c in range(n)]
    for line, _ in lines:
        for chunk in line.split("#"):
            if len(chunk) >= 3:
                out.append(chunk)
            elif chunk:
                raise ValueError(f"short run {chunk!r}")
    return out


bad = 0
ids = set()
for level, puzzles in data.items():
    for p in puzzles:
        assert p["id"] not in ids, p["id"]
        ids.add(p["id"])
        n = len(p["grid"])
        assert all(len(r) == n for r in p["grid"]), p["id"]
        a = answers(p["grid"])
        missing = [w for w in a if w not in p["clues"]]
        extra = [w for w in p["clues"] if w not in a]
        dupes = {w for w in a if a.count(w) > 1}
        if missing or extra or dupes:
            bad += 1
            print(f"{level}/{p['id']}: missing={missing} extra={extra} dupes={dupes}")
print(f"{sum(len(v) for v in data.values())} puzzles checked, {bad} with problems")
