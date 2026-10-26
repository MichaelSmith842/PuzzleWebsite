"""Generate 7x7 / 9x9 crossword fills with common words.

Needs the `wordfreq` package (pip install wordfreq) for word commonness.

Usage:
  python3 scripts/gen_big_crosswords.py SIZE COUNT [--min-zipf 3.3] [--theme law,books,code] [--seed N]

Prints one JSON fill per line: {"grid": [...], "words": [...], "theme": [...]}.
Good fills are then clued by hand in src/data/crosswords.ts.
"""
import argparse
import json
import math
import random
import re
import sys
import time

from wordfreq import top_n_list, zipf_frequency

sys.path.insert(0, __import__("os").path.dirname(__file__))
from words import THREE  # noqa: E402  (hand-picked 3-letter words; wordfreq's are too junky)

DULL = set("""
the and are was his her its our you your they them their theres these those this that than then thus with
from into onto upon have has had having been being were will would shall should could might must does did
done doing what when where which while whom whose why how who there here also just very much many such some
any each every both either neither other another more most less least only own same too
""".split())

BLOCK = set("""
anal anus arse bitch bitches boob boobs butt cock cocks crap cum damn dick dicks dyke fag fags fuck fucked fucker
fucking gay gays hell homo horny jizz kike nazi nazis negro nude nudes orgy penis piss porn pussy rape raped rapes
rapist sex sexy shit shits slut sluts spic tits titty turd twat vagina whore whores wank kill killed killer drug drugs
cancer dead death die died dies suicide gun guns bomb bombs war wars racist rapes hitler meth cocaine heroin
""".split())

THEMES = {
    "law": """tort torts brief briefs juror jurors jury bar motion motions clerk lsat writ writs plea pleas verdict
appeal appeals counsel docket statute estate lien liens oath oaths sue sued lawsuit deed deeds trust bail parole
object sustain overrule hearsay dicta dictum case cases court courts judge judges trial trials bench gavel legal
claim claims accord contract tenant equity remedy damages title patent moot amicus testate will wills probate
arbiter subpoena affidavit liable negligence due process civil trespass nuisance felony alibi acquit convict
lawyer attorney defense defendant plaintiff witness evidence motive justice law laws legal bylaw bylaws counsel
summons ruling rulings statute statutes precedent tribunal juris dissent opinion holding remand vacate tenure
lease leases escrow estoppel easement merger torts treaty clause clauses consent repeal decree decrees
mediator arbitrate hearing hearings indict indicted perjury custody felon libel slander rule rules bill fee fees
term order party stay seal heir heirs asset assets suit suits act acts code fine void case moot
plaintiff defendant precedent affidavit testimony arbitrate jurist sentence litigate contracts deposed
injunct counselor tenancy codicil grantor grantee lessor lessee bailiff docket sidebar recess verdicts
statutes damages juries appellate certiorari habeas corpus mens rea dicta torts estoppel lawful unlawful
lawyers barrister solicitor notary probate escrow trustee fiduciary covenant mortgage liable libel""",
    "books": """novel novels prose poem poems plot plots page pages chapter chapters author authors reader readers
shelf spine tome tomes epic epics saga sagas poe austen orwell bronte eliot twain wilde homer dante keats byron
plath library book books bookmark ebook kindle memoir essay essays verse verses rhyme stanza sonnet ode odes haiku
fable fables myth myths legend genre fiction mystery romance thriller trope motif theme irony arc hero heroine
villain prologue epilogue preface index edition editor publish print read reads ink quill paperback hardcover
classic gatsby hamlet emma dracula narrator poet poets poetry story stories tale tales sequel novella fantasy
literary library prose author title titles plot cover jacket blurb draft drafts critic review reviews scene
lit lyric lyrical bard verse folio chapter fairy lore tale pen alcott twain shelf cover moral
character narrative allegory metaphor satire tragedy comedy trilogy novelist biography dickens tolstoy
hemingway odyssey iliad ulysses protagonist antagonist climax denouement fable parable sonnets stanzas
couplet limerick elegy ballad dante milton chaucer bronte woolf joyce kafka camus steinbeck faulkner
nabokov tolkien rowling gatsby austen darcy bennet ahab ishmael gothic romantic novella anthology
manuscript memoirs footnote epigraph syntax diction imagery rhetoric""",
    "code": """code coder coders bug bugs debug array arrays loop loops stack queue api git merge commit commits branch
python server cache linux deploy script syntax compile binary byte bytes bit bits pixel data query table hash
node nodes tree graph lambda class object method string float integer boolean null void return error errors
patch release build test tests lint rebase push pull fork clone docker cloud kernel shell bash regex token
sprint agile scrum standup laptop mouse cursor tab space vim emacs rust java ruby perl swift react async await
thread mutex crash boot reboot admin root sudo login password encrypt cipher algorithm heap sort search console
terminal prompt model neural robot chip cpu gpu ram disk byte program programs software hardware runtime
compiler library framework backend frontend database schema backup bitwise logic logs latency socket packet
router widget input output inputs outputs click website web online offline app apps update upload download
debugger keyboard monitor screen tech refactor iterate vector matrix tensor pointer variable function repo diff
key email site link hack hacker true false tab ram dev devs ship merge spec specs port ports
algorithm debugger compiler database frontend backend recursion interface protocol endpoint program
variable function overflow semicolon boolean integer docker github stack heap queue linked pointer
iterator closure promise callback runtime bytecode unicode ascii server servers cluster latency
deploying deployed commits branches rebased hotfix release staging sandbox virtual cookie cookies
session tokens encrypt hashing parser lexer syntax compile compiled kernel threads""",
}


def build_wordlist(min_zipf, theme_names, max_len=9):
    web2 = set()
    with open("/usr/share/dict/web2") as f:
        for line in f:
            w = line.strip()
            if w.islower():
                web2.add(w)

    def real(w):
        if w in web2:
            return True
        bases = []
        if w.endswith("s"): bases.append(w[:-1])
        if w.endswith("es"): bases.append(w[:-2])
        if w.endswith("ies"): bases.append(w[:-3] + "y")
        if w.endswith("ed"): bases += [w[:-2], w[:-1]]
        if w.endswith("ied"): bases.append(w[:-3] + "y")
        if w.endswith("ing"): bases += [w[:-3], w[:-3] + "e"]
        if w.endswith("er"): bases += [w[:-2], w[:-1]]
        if w.endswith("ly"): bases.append(w[:-2])
        return any(len(b) >= 3 and b in web2 for b in bases)

    score = {}
    for w in top_n_list("en", 250000):
        if not re.fullmatch("[a-z]{3,%d}" % max_len, w) or w in BLOCK or w in DULL:
            continue
        if len(w) == 3 and w not in THREE:
            continue
        z = zipf_frequency(w, "en")
        # rarer words must look English: not more common in a neighbouring language (haus, dich, ...)
        if z < 3.2 and any(zipf_frequency(w, lang) > z for lang in ("de", "fr", "es", "it", "nl", "pt")):
            continue
        # short words have plenty of common options, so obscure ones (shee, alco, parr) aren't needed
        if len(w) <= 4 and z < 2.8:
            continue
        if z >= min_zipf and real(w):
            score[w] = z
    theme = set()
    for name in theme_names:
        for w in THEMES[name].split():
            if 3 <= len(w) <= max_len and w not in BLOCK:
                theme.add(w)
                score[w] = max(score.get(w, 0), zipf_frequency(w, "en")) + 3  # strongly prefer theme words
    return score, theme


def make_pattern(n, rng, black_range):
    """Random rotationally symmetric grid where every white square is in an across AND down word of 3+."""
    for _ in range(20000):
        black = set()
        target = rng.randint(*black_range)
        cells = [(r, c) for r in range(n) for c in range(n) if (r, c) <= (n - 1 - r, n - 1 - c)]
        rng.shuffle(cells)
        for r, c in cells:
            if len(black) >= target:
                break
            black.add((r, c))
            black.add((n - 1 - r, n - 1 - c))
        if valid_pattern(n, black):
            return ["".join("#" if (r, c) in black else "." for c in range(n)) for r in range(n)]
    return None


def make_big_pattern(n, rng, max_run, max_black):
    """Symmetric pattern for big grids by local search: split runs that are too long,
    fix runs that are too short (1-2 squares), until every run is 3..max_run."""
    def lines(black):
        out = []
        for r in range(n):
            out.append([(r, c) for c in range(n)])
        for c in range(n):
            out.append([(r, c) for r in range(n)])
        return out

    all_lines = lines(None)
    for _ in range(300):
        black = set()

        def add(cell):
            black.add(cell)
            black.add((n - 1 - cell[0], n - 1 - cell[1]))

        def rm(cell):
            black.discard(cell)
            black.discard((n - 1 - cell[0], n - 1 - cell[1]))

        for _ in range(6000):
            bad = []
            for line in all_lines:
                run = []
                for cell in line + [None]:
                    if cell is not None and cell not in black:
                        run.append(cell)
                        continue
                    if run and (len(run) < 3 or len(run) > max_run):
                        bad.append((line, run))
                    run = []
            if not bad:
                break
            line, run = rng.choice(bad)
            if len(run) > max_run:
                add(run[rng.randint(3, len(run) - 4)])
            elif rng.random() < 0.5:
                for cell in run:
                    add(cell)
            else:
                # lengthen the run by opening a black square at one of its ends
                i0, i1 = line.index(run[0]), line.index(run[-1])
                ends = [line[i] for i in (i0 - 1, i1 + 1) if 0 <= i < n and line[i] in black]
                if ends:
                    rm(rng.choice(ends))
                else:
                    for cell in run:
                        add(cell)
        else:
            continue
        rows = ["".join("#" if (r, c) in black else "." for c in range(n)) for r in range(n)]
        cols = ["".join(rows[r][c] for r in range(n)) for c in range(n)]
        walls = any("#####" in line for line in rows + cols)  # no long black bars
        if not walls and len(black) <= max_black and valid_pattern(n, black):
            return ["".join("#" if (r, c) in black else "." for c in range(n)) for r in range(n)]
    return None


def runs(line):
    out, start = [], None
    for i, ch in enumerate(line + "#"):
        if ch != "#" and start is None:
            start = i
        elif ch == "#" and start is not None:
            out.append((start, i - start))
            start = None
    return out


def valid_pattern(n, black):
    rows = ["".join("#" if (r, c) in black else "." for c in range(n)) for r in range(n)]
    cols = ["".join(rows[r][c] for r in range(n)) for c in range(n)]
    for line in rows + cols:
        if any(length < 3 for _, length in runs(line)):
            return False
    whites = [(r, c) for r in range(n) for c in range(n) if (r, c) not in black]
    if not whites:
        return False
    seen, stack = {whites[0]}, [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (r + dr, c + dc)
            if 0 <= p[0] < n and 0 <= p[1] < n and p not in black and p not in seen:
                seen.add(p)
                stack.append(p)
    return len(seen) == len(whites)


def slots_of(pattern):
    n = len(pattern)
    slots = []
    for r in range(n):
        for start, length in runs(pattern[r]):
            slots.append([(r, c) for c in range(start, start + length)])
    for c in range(n):
        col = "".join(pattern[r][c] for r in range(n))
        for start, length in runs(col):
            slots.append([(r, c) for r in range(start, start + length)])
    return slots


class Filler:
    def __init__(self, score, theme=()):
        self.by_len = {}
        for w in score:
            self.by_len.setdefault(len(w), []).append(w)
        self.score = score
        self.index = {}  # (len, pos, letter) -> bitmask of word ids
        self.full = {}
        self.theme_mask = {}  # len -> bitmask of theme words
        for L, ws in self.by_len.items():
            self.full[L] = (1 << len(ws)) - 1
            for i, w in enumerate(ws):
                if w in theme:
                    self.theme_mask[L] = self.theme_mask.get(L, 0) | (1 << i)
                for p, ch in enumerate(w):
                    k = (L, p, ch)
                    self.index[k] = self.index.get(k, 0) | (1 << i)

    def mask(self, slot, grid, themed=False):
        L = len(slot)
        m = self.theme_mask.get(L, 0) if themed else self.full.get(L, 0)
        for p, cell in enumerate(slot):
            ch = grid.get(cell)
            if ch:
                m &= self.index.get((L, p, ch), 0)
                if not m:
                    return 0
        return m

    def least_constraining(self, cands, slot, grid, crossing, slots, rest, themed):
        """Order candidates by how many options they leave the crossing slots (dead ends dropped)."""
        rest_set = set(rest)
        open_cells = [cell for cell in slot if cell not in grid]
        cross = {j for cell in open_cells for j in crossing[cell] if j in rest_set}
        scored = []
        for w in cands:
            for cell, ch in zip(slot, w):
                grid.setdefault(cell, ch)
            total = 0.0
            for j in cross:
                cnt = self.mask(slots[j], grid, j in themed).bit_count()
                if not cnt:
                    total = None
                    break
                total += math.log(cnt)
            for cell in open_cells:
                del grid[cell]
            if total is not None:
                scored.append((total + 2 * self.score[w], w))
        scored.sort(reverse=True)
        return [w for _, w in scored]

    def fill(self, pattern, rng, budget_s=4.0, tries_per_slot=20, themed_slots=0, lcv=0, start=None):
        """Fill `pattern`. `start` may hold letters (non-'.' and non-'#') to keep, for repairs."""
        slots = slots_of(pattern)
        # the longest slots must hold theme words
        order = sorted(range(len(slots)), key=lambda i: (-len(slots[i]), rng.random()))
        themed = set(order[:themed_slots])
        grid = {}
        if start:
            for r, row in enumerate(start):
                for c, ch in enumerate(row):
                    if ch not in "#.":
                        grid[(r, c)] = ch.lower()
        used = {"".join(grid[c] for c in s) for s in slots if all(c in grid for c in s)}
        deadline = time.time() + budget_s
        crossing = {}
        for i, s in enumerate(slots):
            for cell in s:
                crossing.setdefault(cell, []).append(i)

        def words_from(mask, L):
            ws = self.by_len[L]
            out = []
            i = 0
            while mask:
                if mask & 1:
                    out.append(ws[i])
                mask >>= 1
                i += 1
            return out

        def solve(open_slots):
            if time.time() > deadline:
                return False
            if not open_slots:
                return True
            best, best_mask, best_n = None, 0, None
            for i in open_slots:
                m = self.mask(slots[i], grid, i in themed)
                cnt = m.bit_count()
                if cnt == 0:
                    return False
                if best_n is None or cnt < best_n:
                    best, best_mask, best_n = i, m, cnt
            slot = slots[best]
            cands = [w for w in words_from(best_mask, len(slot)) if w not in used]
            cands.sort(key=lambda w: -(self.score[w] + rng.uniform(0, 1.8)))
            rest = [i for i in open_slots if i != best]
            if lcv:
                cands = self.least_constraining(cands[:lcv], slot, grid, crossing, slots, rest, themed)
            for w in cands[:tries_per_slot]:
                placed = [cell for cell in slot if cell not in grid]
                for cell, ch in zip(slot, w):
                    grid[cell] = ch
                used.add(w)
                # forward check crossings
                ok = all(self.mask(slots[j], grid, j in themed) for cell in placed for j in crossing[cell] if j in rest)
                if ok and solve(rest):
                    return True
                used.discard(w)
                for cell in placed:
                    del grid[cell]
            return False

        if not solve([i for i, s in enumerate(slots) if not all(c in grid for c in s)]):
            return None
        n = len(pattern)
        rows = ["".join("#" if pattern[r][c] == "#" else grid[(r, c)] for c in range(n)) for r in range(n)]
        words = ["".join(grid[c] for c in s) for s in slots]
        # every complete slot must be distinct
        if len(set(words)) != len(words):
            return None
        return rows, words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("size", type=int)
    ap.add_argument("count", type=int)
    ap.add_argument("--min-zipf", type=float, default=3.3)
    ap.add_argument("--theme", default="")
    ap.add_argument("--min-theme", type=int, default=0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--themed-slots", type=int, default=0, help="force theme words into the N longest slots")
    ap.add_argument("--blacks", default=None, help="min,max black squares")
    ap.add_argument("--patterns", default=None, help="JSON file of grid shapes to reuse instead of random ones")
    ap.add_argument("--exclude", default="", help="comma-separated words to leave out (e.g. already used)")
    ap.add_argument("--max-len", type=int, default=9, help="longest answer allowed")
    ap.add_argument("--max-black", type=int, default=0, help="big grids: most black squares allowed")
    ap.add_argument("--budget", type=float, default=6.0, help="seconds per fill attempt")
    ap.add_argument("--lcv", type=int, default=0, help="big grids: rank this many candidates by crossing options")
    ap.add_argument("--tries", type=int, default=20, help="candidates tried per slot")
    ap.add_argument("--repair", default=None, help="JSON fill whose --bad answers should be replaced")
    ap.add_argument("--bad", default="", help="comma-separated answers to replace when repairing")
    args = ap.parse_args()
    rng = random.Random(args.seed)
    themes = [t for t in args.theme.split(",") if t]
    score, theme = build_wordlist(args.min_zipf, themes, args.max_len)
    for w in filter(None, args.exclude.lower().split(",")):
        score.pop(w, None)
        theme.discard(w)
    print(f"{len(score)} words", file=sys.stderr)
    filler = Filler(score, theme)
    n = args.size
    black_range = tuple(map(int, args.blacks.split(","))) if args.blacks else ((8, 12) if n == 7 else (14, 20))
    if args.repair:
        # blank the bad answers in an existing fill, then refill just those squares
        grid = json.load(open(args.repair))["grid"]
        bad = set(args.bad.upper().split(","))
        rows = [list(r) for r in grid]
        all_slots = slots_of(grid)
        bad_cells = {cell for sl in all_slots if "".join(grid[r][c] for r, c in sl) in bad for cell in sl}
        # free the bad answers and every answer crossing them
        for sl in all_slots:
            if bad_cells & set(sl):
                for r, c in sl:
                    rows[r][c] = "."
        start = ["".join(r) for r in rows]
        pattern = ["".join("#" if ch == "#" else "." for ch in r) for r in grid]
        for attempt in range(40):
            res = filler.fill(pattern, rng, budget_s=args.budget, lcv=args.lcv, tries_per_slot=args.tries, start=start)
            if res:
                rows, words = res
                print(json.dumps({"grid": [r.upper() for r in rows], "words": words, "theme": [w for w in words if w in theme]}))
                return
        raise SystemExit("repair failed")

    fixed = json.load(open(args.patterns)) if args.patterns else None
    found = 0
    attempts = 0
    while found < args.count and attempts < args.count * 200:
        attempts += 1
        if fixed:
            pattern = rng.choice(fixed)
        elif n > 9:
            pattern = make_big_pattern(n, rng, args.max_len, args.max_black or n * n // 5)
        else:
            pattern = make_pattern(n, rng, black_range)
        if not pattern:
            continue
        res = filler.fill(pattern, rng, budget_s=args.budget, themed_slots=args.themed_slots, lcv=args.lcv, tries_per_slot=args.tries)
        if not res:
            continue
        rows, words = res
        tw = [w for w in words if w in theme]
        if len(tw) < args.min_theme:
            continue
        found += 1
        print(json.dumps({"grid": [r.upper() for r in rows], "words": words, "theme": tw}), flush=True)
    print(f"{found} fills in {attempts} attempts", file=sys.stderr)


if __name__ == "__main__":
    main()
