import { useEffect, useRef, useState } from 'react'
import PUZZLES from '../data/strands.json'
import { isWord, loadDict } from '../dict'
import { usePeersOn, useRoom } from '../room'
import type { Room } from '../sync'

type Cell = [number, number]
export type StrandsData = { id: string; clue: string; level: 'easy' | 'hard'; spangram: string; grid: string[]; words: Record<string, number[][]> }

export const STRANDS = PUZZLES as unknown as StrandsData[]
const ROWS = 8
const COLS = 6
const BONUS_PER_HINT = 3
const SPANGRAM_COLOR = '#e3b23c'

/** Numbered name like "Strands #2"; the theme hint is only shown inside the puzzle. */
export function strandsLabel(p: StrandsData) {
  const n = STRANDS.filter((q) => q.level === p.level).indexOf(p) + 1
  return `${p.level === 'hard' ? 'Hard Strands' : 'Strands'} #${n}`
}

/** Neutral URL slug like "hard-4". */
export function strandsSlug(p: StrandsData) {
  return `${p.level}-${STRANDS.filter((q) => q.level === p.level).indexOf(p) + 1}`
}

export function findStrands(param: string) {
  return STRANDS.find((p) => strandsSlug(p) === param) ?? STRANDS.find((p) => p.id === param)
}

export function strandsProgress(room: Room, p: StrandsData) {
  const total = Object.keys(p.words).length
  const found = room.scan(`st/${p.id}/f/`).length
  return { total, found, done: found >= total }
}

const same = (a: number[][], b: number[][]) => a.length === b.length && a.every(([r, c], i) => b[i][0] === r && b[i][1] === c)
const adjacent = (a: Cell, b: Cell) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1

export default function Strands({ id }: { id: string }) {
  const puzzle = findStrands(id)
  if (!puzzle) return <p className="empty">Puzzle not found. <a href="#/">Back home</a></p>
  return <StrandsGame puzzle={puzzle} />
}

function StrandsGame({ puzzle }: { puzzle: StrandsData }) {
  const room = useRoom()
  const route = `strands/${strandsSlug(puzzle)}`
  const partners = usePeersOn(route)
  const [path, setPath] = useState<Cell[]>([])
  const [msg, setMsg] = useState<{ text: string; tone?: 'good' | 'bad' } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ down: false, moved: false, submitOnUp: false })

  useEffect(() => {
    loadDict()
  }, [])
  useEffect(() => {
    room.setPresence({ route, data: { path } })
  }, [room, route, path])

  const themeWords = Object.keys(puzzle.words)
  const found = new Map(room.scan(`st/${puzzle.id}/f/`).map(([k, e]) => [k.split('/').pop()!, e.by]))
  const bonus = room.scan(`st/${puzzle.id}/b/`).length
  const hints = room.scan(`st/${puzzle.id}/h/`).map(([, e]) => e.v as string)
  const activeHint = hints.find((w) => !found.has(w))
  const hintsEarned = Math.floor(bonus / BONUS_PER_HINT)
  const canHint = hintsEarned > hints.length && !activeHint && found.size < themeWords.length
  const done = found.size >= themeWords.length

  const owner = new Map<string, string>() // "r,c" -> word that claims it
  for (const w of found.keys()) for (const [r, c] of puzzle.words[w]) owner.set(`${r},${c}`, w)
  const hinted = new Set(activeHint ? puzzle.words[activeHint].map(([r, c]) => `${r},${c}`) : [])

  const colorOf = (w: string) => (w === puzzle.spangram ? SPANGRAM_COLOR : room.user(found.get(w)!)?.color ?? '#7aa7e8')

  const say = (text: string, tone?: 'good' | 'bad') => {
    setMsg({ text, tone })
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 1800)
  }

  const submit = (p: Cell[]) => {
    setPath([])
    const word = p.map(([r, c]) => puzzle.grid[r][c]).join('')
    if (p.length < 4) return say('Too short', 'bad')
    const match = themeWords.find((w) => same(puzzle.words[w], p))
    if (match) {
      if (found.has(match)) return say('Already found')
      room.set(`st/${puzzle.id}/f/${match}`, true)
      return say(match === puzzle.spangram ? 'SPANGRAM!' : 'Theme word!', 'good')
    }
    if (room.get(`st/${puzzle.id}/b/${word}`)) return say('Already found')
    if (isWord(word)) {
      room.set(`st/${puzzle.id}/b/${word}`, true)
      return say(`${word} — +1 toward a hint`)
    }
    return say('Not in word list', 'bad')
  }

  const cellFromPoint = (x: number, y: number, strict: boolean): Cell | null => {
    const rect = gridRef.current!.getBoundingClientRect()
    const fx = ((x - rect.left) / rect.width) * COLS
    const fy = ((y - rect.top) / rect.height) * ROWS
    const c = Math.floor(fx)
    const r = Math.floor(fy)
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null
    // while dragging, only count the middle of a cell so diagonals are easy to hit
    if (strict && Math.hypot(fx - c - 0.5, fy - r - 0.5) > 0.42) return null
    return [r, c]
  }

  const onDown = (e: React.PointerEvent) => {
    if (done) return
    const cell = cellFromPoint(e.clientX, e.clientY, false)
    if (!cell || owner.has(`${cell[0]},${cell[1]}`)) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { down: true, moved: false, submitOnUp: false }
    const last = path[path.length - 1]
    const idx = path.findIndex(([r, c]) => r === cell[0] && c === cell[1])
    if (last && idx === path.length - 1) drag.current.submitOnUp = true
    else if (idx >= 0) setPath(path.slice(0, idx + 1))
    else if (last && adjacent(last, cell)) setPath([...path, cell])
    else setPath([cell])
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.down) return
    const cell = cellFromPoint(e.clientX, e.clientY, true)
    if (!cell) return
    setPath((p) => {
      const last = p[p.length - 1]
      if (!last || (last[0] === cell[0] && last[1] === cell[1])) return p
      const prev = p[p.length - 2]
      drag.current.moved = true
      drag.current.submitOnUp = false
      if (prev && prev[0] === cell[0] && prev[1] === cell[1]) return p.slice(0, -1)
      if (!adjacent(last, cell) || owner.has(`${cell[0]},${cell[1]}`)) return p
      if (p.some(([r, c]) => r === cell[0] && c === cell[1])) return p
      return [...p, cell]
    })
  }

  const onUp = () => {
    const { down, moved, submitOnUp } = drag.current
    drag.current.down = false
    if (!down) return
    if ((moved && path.length > 1) || submitOnUp) submit(path)
  }

  const takeHint = () => {
    const next = themeWords.find((w) => w !== puzzle.spangram && !found.has(w) && !hints.includes(w))
      ?? themeWords.find((w) => !found.has(w))
    if (next) room.set(`st/${puzzle.id}/h/${hints.length}`, next)
  }

  const line = (cells: number[][]) => cells.map(([r, c]) => `${c + 0.5},${r + 0.5}`).join(' ')
  const current = path.map(([r, c]) => puzzle.grid[r][c]).join('')
  const partnerPaths = partners
    .map((p) => ({ p, path: ((p.data as { path?: Cell[] } | undefined)?.path ?? []) as Cell[] }))
    .filter((x) => x.path.length)

  return (
    <div className="game strands">
      <div className="game-head">
        <a href="#/" className="back">← <span className="wide-only">All puzzles</span></a>
        <h1>{strandsLabel(puzzle)}</h1>
        <span className="count">{found.size}/{themeWords.length}</span>
      </div>

      <div className="st-theme">
        <span>Today's theme</span>
        <b>{puzzle.clue}</b>
      </div>

      <div className="st-current" aria-live="polite">
        {current ? (
          <span>{current}</span>
        ) : msg ? (
          <span className={`st-msg ${msg.tone ?? ''}`}>{msg.text}</span>
        ) : partnerPaths.length ? (
          <span className="st-partner-word" style={{ color: partnerPaths[0].p.color }}>
            {partnerPaths[0].p.name}: {partnerPaths[0].path.map(([r, c]) => puzzle.grid[r][c]).join('')}
          </span>
        ) : (
          <span className="muted">{done ? 'All found!' : 'Drag or tap letters'}</span>
        )}
      </div>

      <div
        className="st-grid"
        ref={gridRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (drag.current.down = false)}
      >
        <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="st-lines" aria-hidden>
          {[...found.keys()].map((w) => (
            <polyline key={w} points={line(puzzle.words[w])} stroke={colorOf(w)} className="st-line" />
          ))}
          {partnerPaths.map(({ p, path: pp }) => (
            <polyline key={p.id} points={line(pp)} stroke={p.color} className="st-line partner" />
          ))}
          {path.length > 0 && <polyline points={line(path)} stroke={room.me.color} className="st-line mine" />}
        </svg>
        {puzzle.grid.flatMap((row, r) =>
          [...row].map((ch, c) => {
            const k = `${r},${c}`
            const w = owner.get(k)
            const inPath = path.some(([y, x]) => y === r && x === c)
            const partner = partnerPaths.find(({ path: pp }) => pp.some(([y, x]) => y === r && x === c))
            const style: React.CSSProperties = {}
            if (w) style.background = colorOf(w)
            else if (inPath) style.background = room.me.color
            else if (partner) style.boxShadow = `0 0 0 3px ${partner.p.color}`
            return (
              <div
                key={k}
                className={['st-cell', w && 'found', inPath && 'selected', hinted.has(k) && 'hinted'].filter(Boolean).join(' ')}
                style={style}
              >
                {ch}
              </div>
            )
          }),
        )}
      </div>

      <div className="st-foot">
        <button className="btn" disabled={!canHint} onClick={takeHint}>
          Hint
          <span className="meter" aria-label={`${bonus % BONUS_PER_HINT} of ${BONUS_PER_HINT} bonus words`}>
            {Array.from({ length: BONUS_PER_HINT }, (_, i) => (
              <i key={i} className={canHint || i < bonus % BONUS_PER_HINT ? 'on' : ''} />
            ))}
          </span>
        </button>
        <p className="muted small">
          {activeHint
            ? 'The dashed letters spell a theme word.'
            : canHint
              ? 'You earned a hint!'
              : `Find ${BONUS_PER_HINT - (bonus % BONUS_PER_HINT)} more non-theme word${BONUS_PER_HINT - (bonus % BONUS_PER_HINT) === 1 ? '' : 's'} (4+ letters) to earn a hint.`}
        </p>
      </div>

      {found.size > 0 && (
        <ul className="st-found">
          {[...found.entries()].map(([w, by]) => {
            const u = room.user(by)
            return (
              <li key={w} style={{ borderColor: colorOf(w) }}>
                {w}
                {u && <small style={{ color: u.color }}> · {u.name}</small>}
              </li>
            )
          })}
        </ul>
      )}
      {done && <div className="banner success">You found every word together! 🎉</div>}
    </div>
  )
}
