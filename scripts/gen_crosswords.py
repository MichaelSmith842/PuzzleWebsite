"""Find 5x5 mini-crossword fills from the common word lists.

Usage: python3 scripts/gen_crosswords.py [count]
Prints candidate fills; good ones are clued by hand in src/data/crosswords.ts.
"""
import random
import sys
from words import FIVE, FOUR, THREE

WORDS = set(FIVE) | set(FOUR) | set(THREE)

# '#' = black square, '.' = open
PATTERNS = [
    ["#....", ".....", ".....", ".....", "....#"],
    ["##...", ".....", ".....", ".....", "...##"],
    ["...##", ".....", ".....", ".....", "##..."],
    ["#...#", ".....", ".....", ".....", "#...#"],
    ["....#", ".....", ".....", ".....", "#...."],
]


def slots(pattern):
    n = len(pattern)
    out = []
    for r in range(n):
        c = 0
        while c < n:
            if pattern[r][c] == "#":
                c += 1
                continue
            start = c
            while c < n and pattern[r][c] != "#":
                c += 1
            if c - start >= 3:
                out.append([(r, x) for x in range(start, c)])
    for c in range(n):
        r = 0
        while r < n:
            if pattern[r][c] == "#":
                r += 1
                continue
            start = r
            while r < n and pattern[r][c] != "#":
                r += 1
            if r - start >= 3:
                out.append([(y, c) for y in range(start, r)])
    return out


def fill(pattern, rng):
    """Fill row by row; every column segment must stay a prefix of a real word."""
    n = len(pattern)
    by_len, prefixes = {}, set()
    for w in WORDS:
        by_len.setdefault(len(w), []).append(w)
        for i in range(1, len(w) + 1):
            prefixes.add((len(w), w[:i]))
    # for each cell: (column segment length, row index where the segment starts)
    col_seg = {}
    for s in slots(pattern):
        if s[0][1] == s[-1][1]:
            for p in s:
                col_seg[p] = (len(s), s[0][0])
    row_slots = [[s for s in slots(pattern) if s[0][0] == s[-1][0] and s[0][0] == r] for r in range(n)]
    rows = [["#"] * n for _ in range(n)]
    used = set()

    def ok_cols(r):
        for c in range(n):
            if (r, c) not in col_seg:
                continue
            length, start = col_seg[(r, c)]
            seg = "".join(rows[y][c] for y in range(start, r + 1))
            if (length, seg) not in prefixes:
                return False
        return True

    def solve(r):
        if r == n:
            return True
        options = [[]]
        for s in row_slots[r]:
            ws = by_len[len(s)][:]
            rng.shuffle(ws)
            options = [o + [w] for o in options for w in ws[:400]] if len(options) == 1 else None
            if options is None:
                break
        # only rows with a single slot are supported by the patterns above
        for (w,) in options:
            if w in used:
                continue
            s = row_slots[r][0]
            for (y, x), ch in zip(s, w):
                rows[y][x] = ch
            if ok_cols(r):
                used.add(w)
                if solve(r + 1):
                    return True
                used.discard(w)
            for (y, x) in s:
                rows[y][x] = "#"
        return False

    if solve(0):
        # reject duplicate words across/down
        words = ["".join(rows[y][x] for y, x in s) for s in slots(pattern)]
        if len(set(words)) == len(words):
            return ["".join(r) for r in rows]
    return None


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    found = 0
    tries = 0
    while found < count and tries < count * 20:
        tries += 1
        g = fill(rng.choice(PATTERNS), rng)
        if g:
            found += 1
            print(" ".join(g))
