"""Lay out Strands boards: 8 rows x 6 cols, every letter used exactly once.

Usage: python3 scripts/gen_strands.py > src/data/strands.json
"""
import json
import random
import sys

ROWS, COLS = 8, 6

# (id, theme hint, spangram, words, level). Append new puzzles at the end: the shared
# random seed means earlier boards keep their layout.
PUZZLES = [
    ("date-night", "Out and about", "DATENIGHT", ["DINNER", "MOVIE", "PICNIC", "BOWLING", "DANCING", "STARGAZE"], "easy"),
    ("breakfast", "First things first", "BREAKFAST", ["PANCAKE", "WAFFLE", "BACON", "TOAST", "OMELET", "CEREAL", "EGGS"], "easy"),
    ("pet-names", "Called by another name", "PETNAMES", ["HONEY", "DARLING", "SWEETIE", "SUGAR", "CUTIE", "PUMPKIN", "DEAR"], "easy"),
    ("board-games", "Roll with it", "BOARDGAMES", ["CHESS", "CLUE", "RISK", "TROUBLE", "MONOPOLY", "CATAN", "SORRY"], "easy"),
    ("baking", "Rising action", "BAKING", ["FLOUR", "SUGAR", "BUTTER", "WHISK", "MIXER", "DOUGH", "YEAST", "MUFFIN"], "easy"),
    ("stargazing", "Look up", "STARGAZING", ["ORION", "COMET", "GALAXY", "NEBULA", "METEOR", "PLANET", "MOON"], "easy"),
    ("beach-trip", "Salt in the air", "BEACHTRIP", ["SAND", "WAVES", "SHELLS", "SUNSCREEN", "TOWEL", "SURF", "COOLER"], "easy"),
    ("utensils", "Drawer pulls", "UTENSILS", ["LADLE", "SPATULA", "TONGS", "PEELER", "GRATER", "ZESTER", "SIEVE"], "hard"),
    ("in-no-time", "Be right back", "INNOTIME", ["JIFFY", "MOMENT", "INSTANT", "TRICE", "FLASH", "SECOND", "MINUTE"], "hard"),
    ("key-holders", "Important things", "KEYHOLDERS", ["PIANO", "LOCK", "FLORIDA", "CIPHER", "ANSWER", "SONG", "LAPTOP"], "hard"),
    ("go-fish", "Something's fishy", "GOFISH", ["SWORD", "JELLY", "ANGEL", "MONK", "LION", "SAIL", "GOLD", "STAR", "TRIGGER"], "hard"),
    ("the-bard", "Exit, pursued by a bear", "THEBARD", ["HAMLET", "MACBETH", "OTHELLO", "TEMPEST", "LEAR", "CORIOLANUS"], "hard"),
    ("coffee-bar", "Grounds for celebration", "COFFEEBAR", ["LATTE", "MOCHA", "CORTADO", "LUNGO", "AMERICANO", "AFFOGATO"], "hard"),
    ("checkmate", "Your move", "CHECKMATE", ["GAMBIT", "PAWN", "KNIGHT", "BISHOP", "BLUNDER", "CASTLE", "KING"], "hard"),
    ("all-aboard", "Get on it", "ALLABOARD", ["SKATE", "SURF", "DASH", "CHALK", "CLIP", "SPRING", "SCORE", "CHEESE"], "hard"),
    ("its-all-greek", "Frat row", "ITSALLGREEK", ["ALPHA", "GAMMA", "DELTA", "SIGMA", "OMEGA", "EPSILON", "THETA"], "hard"),
    ("al-dente", "Use your noodle", "ALDENTE", ["LINGUINE", "FUSILLI", "ORZO", "RIGATONI", "FARFALLE", "ROTINI"], "hard"),
]

DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def inside(r, c):
    return 0 <= r < ROWS and 0 <= c < COLS


class Board:
    def __init__(self):
        self.letters = {}
        self.links = set()  # frozenset pairs of consecutive cells, to forbid crossing diagonals

    def can_step(self, a, b):
        if b in self.letters:
            return False
        (r1, c1), (r2, c2) = a, b
        if r1 != r2 and c1 != c2:
            if frozenset([(r1, c2), (r2, c1)]) in self.links:
                return False
        return True

    def components(self):
        empty = {(r, c) for r in range(ROWS) for c in range(COLS)} - set(self.letters)
        sizes = []
        while empty:
            stack = [empty.pop()]
            n = 0
            while stack:
                r, c = stack.pop()
                n += 1
                for dr, dc in DIRS:
                    p = (r + dr, c + dc)
                    if p in empty:
                        empty.discard(p)
                        stack.append(p)
            sizes.append(n)
        return sizes


def subset_sums(lengths):
    sums = {0}
    for l in lengths:
        sums |= {s + l for s in sums}
    return sums


def place_path(board, word, start, rng, end_ok=None, budget=None):
    """Random DFS for a path spelling `word` from `start`. Returns list of cells or None."""
    path = [start]
    board.letters[start] = word[0]
    budget = budget if budget is not None else [3000]

    def dfs():
        budget[0] -= 1
        if budget[0] < 0:
            return False
        if len(path) == len(word):
            return end_ok is None or end_ok(path[-1])
        r, c = path[-1]
        dirs = DIRS[:]
        rng.shuffle(dirs)
        for dr, dc in dirs:
            nxt = (r + dr, c + dc)
            if not inside(*nxt) or not board.can_step(path[-1], nxt):
                continue
            link = frozenset([path[-1], nxt])
            board.letters[nxt] = word[len(path)]
            board.links.add(link)
            path.append(nxt)
            if dfs():
                return True
            path.pop()
            board.links.discard(link)
            del board.letters[nxt]
        return False

    if dfs():
        return path[:]
    del board.letters[start]
    return None


def remove_path(board, path):
    for a, b in zip(path, path[1:]):
        board.links.discard(frozenset([a, b]))
    for p in path:
        del board.letters[p]


def solve(spangram, words, rng):
    board = Board()
    # spangram: top->bottom if it is long enough, else left->right
    if len(spangram) >= ROWS and rng.random() < 0.6:
        starts = [(0, c) for c in range(COLS)]
        end_ok = lambda p: p[0] == ROWS - 1
    else:
        starts = [(r, 0) for r in range(ROWS)]
        end_ok = lambda p: p[1] == COLS - 1
    start = rng.choice(starts)
    sp = place_path(board, spangram, start, rng, end_ok)
    if not sp:
        return None
    placed = {spangram: sp}
    remaining = words[:]
    rng.shuffle(remaining)

    def ok_regions(rem):
        sums = subset_sums([len(w) for w in rem])
        return all(s in sums for s in board.components())

    if not ok_regions(remaining):
        return None

    steps = [0]

    def fill(rem):
        if not rem:
            return True
        steps[0] += 1
        if steps[0] > 300:
            return False
        empties = [(r, c) for r in range(ROWS) for c in range(COLS) if (r, c) not in board.letters]
        # most constrained empty cell: fewest empty neighbours; it is likely a word's endpoint
        cell = min(empties, key=lambda p: (sum(1 for dr, dc in DIRS if inside(p[0] + dr, p[1] + dc) and (p[0] + dr, p[1] + dc) not in board.letters), rng.random()))
        options = [(w, d) for w in rem for d in (1, -1)]
        rng.shuffle(options)
        for w, d in options:
            spelled = w if d == 1 else w[::-1]
            for _ in range(3):
                path = place_path(board, spelled, cell, rng, budget=[400])
                if not path:
                    break
                rest = [x for x in rem if x is not w]
                if ok_regions(rest):
                    placed[w] = path if d == 1 else path[::-1]
                    if fill(rest):
                        return True
                    del placed[w]
                remove_path(board, path)
        return False

    if fill(remaining):
        return placed
    return None


def main():
    rng = random.Random(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
    out = []
    for pid, clue, spangram, words, level in PUZZLES:
        assert len(spangram) + sum(map(len, words)) == ROWS * COLS, pid
        for attempt in range(5000):
            placed = solve(spangram, words, rng)
            if placed:
                break
        else:
            raise SystemExit(f"could not lay out {pid}")
        grid = [[""] * COLS for _ in range(ROWS)]
        for w, path in placed.items():
            for (r, c), ch in zip(path, w):
                grid[r][c] = ch
        out.append({
            "id": pid,
            "clue": clue,
            "level": level,
            "spangram": spangram,
            "grid": ["".join(row) for row in grid],
            "words": {w: [[r, c] for r, c in path] for w, path in placed.items()},
        })
        print(f"{pid}: {attempt + 1} attempts", file=sys.stderr)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
