import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crosswordLabel, crosswordSlug, findCrossword, slotsFor, type CrosswordData, type Slot } from '../data/crosswords'
import { usePeersOn, useRoom } from '../room'
import type { Room } from '../sync'
import Keyboard from '../Keyboard'

type Dir = 'across' | 'down'
type Cursor = { r: number; c: number; dir: Dir }

const cellKey = (id: string, r: number, c: number) => `xw/${id}/c/${r},${c}`

export function crosswordProgress(room: Room, p: CrosswordData) {
  let total = 0
  let filled = 0
  p.grid.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '#') return
      total++
      if (room.get(cellKey(p.id, r, c))) filled++
    }),
  )
  return { total, filled, done: !!room.get(`xw/${p.id}/done`) }
}

export default function Crossword({ id }: { id: string }) {
  const puzzle = findCrossword(id)
  if (!puzzle) return <p className="empty">Puzzle not found. <a href="#/">Back home</a></p>
  return <CrosswordGame puzzle={puzzle} />
}

function CrosswordGame({ puzzle }: { puzzle: CrosswordData }) {
  const room = useRoom()
  const route = `crossword/${crosswordSlug(puzzle)}`
  const partners = usePeersOn(route)
  const n = puzzle.grid.length
  const { numbers, slots } = useMemo(() => slotsFor(puzzle), [puzzle])
  const open = useCallback((r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && puzzle.grid[r][c] !== '#', [n, puzzle])
  const firstOpen = useMemo(() => {
    for (let c = 0; c < n; c++) if (open(0, c)) return c
    return 0
  }, [n, open])
  const [cur, setCur] = useState<Cursor>({ r: 0, c: firstOpen, dir: 'across' })

  const slotAt = useCallback(
    (r: number, c: number, dir: Dir) => slots.find((s) => s.dir === dir && s.cells.some(([y, x]) => y === r && x === c)),
    [slots],
  )
  const activeSlot = slotAt(cur.r, cur.c, cur.dir) ?? slotAt(cur.r, cur.c, cur.dir === 'across' ? 'down' : 'across')

  // share cursor with partner
  useEffect(() => {
    room.setPresence({ route, data: { r: cur.r, c: cur.c, dir: cur.dir } })
  }, [room, route, cur])

  const value = (r: number, c: number) => (room.get<string>(cellKey(puzzle.id, r, c)) ?? '')
  const done = !!room.get(`xw/${puzzle.id}/done`)

  const allCells = useMemo(() => {
    const out: [number, number][] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (open(r, c)) out.push([r, c])
    return out
  }, [n, open])

  // detect a solve (either player can trigger it; LWW keeps the first one close enough)
  useEffect(() => {
    if (done) return
    const solved = allCells.every(([r, c]) => value(r, c) === puzzle.grid[r][c])
    if (solved) room.set(`xw/${puzzle.id}/done`, Date.now())
  })

  const write = (r: number, c: number, letter: string) => {
    if (done || room.get(`xw/${puzzle.id}/rv/${r},${c}`)) return
    room.set(cellKey(puzzle.id, r, c), letter)
    room.set(`xw/${puzzle.id}/x/${r},${c}`, false)
  }

  const step = (r: number, c: number, dir: Dir, delta: number): [number, number] | null => {
    let [y, x] = [r, c]
    do {
      if (dir === 'across') x += delta
      else y += delta
    } while (y >= 0 && x >= 0 && y < n && x < n && !open(y, x))
    return open(y, x) ? [y, x] : null
  }

  const jumpSlot = (delta: number) => {
    const ordered = [...slots.filter((s) => s.dir === 'across'), ...slots.filter((s) => s.dir === 'down')]
    const i = activeSlot ? ordered.indexOf(activeSlot) : -1
    const next = ordered[(i + delta + ordered.length) % ordered.length]
    const empty = next.cells.find(([r, c]) => !value(r, c)) ?? next.cells[0]
    setCur({ r: empty[0], c: empty[1], dir: next.dir })
  }

  const onKey = (k: string) => {
    const { r, c, dir } = cur
    if (/^[A-Z]$/.test(k)) {
      write(r, c, k)
      // advance to next cell in the word, preferring empty ones
      const s = activeSlot
      if (s) {
        const idx = s.cells.findIndex(([y, x]) => y === r && x === c)
        const after = s.cells.slice(idx + 1).find(([y, x]) => !value(y, x)) ?? s.cells[idx + 1]
        if (after) setCur({ r: after[0], c: after[1], dir: s.dir })
        else jumpSlot(1)
      }
    } else if (k === 'BACK') {
      if (value(r, c)) write(r, c, '')
      else {
        const prev = step(r, c, dir, -1)
        if (prev) {
          write(prev[0], prev[1], '')
          setCur({ r: prev[0], c: prev[1], dir })
        }
      }
    } else if (k === 'ENTER') {
      jumpSlot(1)
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const arrows: Record<string, [Dir, number]> = {
        ArrowRight: ['across', 1],
        ArrowLeft: ['across', -1],
        ArrowDown: ['down', 1],
        ArrowUp: ['down', -1],
      }
      if (arrows[e.key]) {
        e.preventDefault()
        const [dir, d] = arrows[e.key]
        if (cur.dir !== dir) setCur({ ...cur, dir })
        else {
          const nxt = step(cur.r, cur.c, dir, d)
          if (nxt) setCur({ r: nxt[0], c: nxt[1], dir })
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        jumpSlot(e.shiftKey ? -1 : 1)
      } else if (e.key === ' ') {
        e.preventDefault()
        setCur({ ...cur, dir: cur.dir === 'across' ? 'down' : 'across' })
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onKey('BACK')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onKey('ENTER')
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault()
        onKey(e.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const clickCell = (r: number, c: number) => {
    if (!open(r, c)) return
    if (r === cur.r && c === cur.c) setCur({ r, c, dir: cur.dir === 'across' ? 'down' : 'across' })
    else {
      const hasDir = slotAt(r, c, cur.dir)
      setCur({ r, c, dir: hasDir ? cur.dir : cur.dir === 'across' ? 'down' : 'across' })
    }
  }

  const check = (cells: [number, number][]) => {
    for (const [r, c] of cells) {
      const v = value(r, c)
      if (v && v !== puzzle.grid[r][c]) room.set(`xw/${puzzle.id}/x/${r},${c}`, true)
    }
  }
  const reveal = (cells: [number, number][]) => {
    for (const [r, c] of cells) {
      if (value(r, c) === puzzle.grid[r][c]) continue
      room.set(cellKey(puzzle.id, r, c), puzzle.grid[r][c])
      room.set(`xw/${puzzle.id}/rv/${r},${c}`, true)
    }
  }
  const clearAll = () => {
    for (const [r, c] of allCells) {
      room.set(cellKey(puzzle.id, r, c), '')
      room.set(`xw/${puzzle.id}/x/${r},${c}`, false)
      room.set(`xw/${puzzle.id}/rv/${r},${c}`, false)
    }
    room.set(`xw/${puzzle.id}/done`, null)
  }
  const [confirmClear, setConfirmClear] = useState(false)

  const inActive = (r: number, c: number) => !!activeSlot?.cells.some(([y, x]) => y === r && x === c)
  const partnerHighlights = partners.map((p) => {
    const d = p.data as Cursor | undefined
    const s = d ? slotAt(d.r, d.c, d.dir) : undefined
    return { p, d, cells: s?.cells ?? [] }
  })

  return (
    <div className="game crossword">
      <div className="game-head">
        <a href="#/" className="back">← <span className="wide-only">All puzzles</span></a>
        <h1>{crosswordLabel(puzzle)}</h1>
        <Menu label="Help">
          <span className="menu-label">Check</span>
          <button onClick={() => check([[cur.r, cur.c]])}>Check square</button>
          <button onClick={() => activeSlot && check(activeSlot.cells)}>Check word</button>
          <button onClick={() => check(allCells)}>Check puzzle</button>
          <span className="menu-label">Reveal</span>
          <button onClick={() => reveal([[cur.r, cur.c]])}>Reveal square</button>
          <button onClick={() => activeSlot && reveal(activeSlot.cells)}>Reveal word</button>
          <button onClick={() => reveal(allCells)}>Reveal puzzle</button>
          <hr />
          <button className="danger-text" onClick={() => setConfirmClear(true)}>Clear puzzle…</button>
        </Menu>
      </div>

      {done && <div className="banner success">Solved together! 🎉</div>}
      {confirmClear && (
        <div className="banner confirm">
          Clear this puzzle for both of you?
          <button className="btn small danger" onClick={() => { clearAll(); setConfirmClear(false) }}>Clear</button>
          <button className="btn small" onClick={() => setConfirmClear(false)}>Cancel</button>
        </div>
      )}

      <div className="xw-layout">
        <div className="xw-board">
          <ClueBar
            slot={activeSlot}
            onPrev={() => jumpSlot(-1)}
            onNext={() => jumpSlot(1)}
            onToggle={() => setCur({ ...cur, dir: cur.dir === 'across' ? 'down' : 'across' })}
          />
          <div className="xw-grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, '--n': n } as React.CSSProperties}>
            {puzzle.grid.flatMap((row, r) =>
              [...row].map((ch, c) => {
                if (ch === '#') return <div key={`${r}-${c}`} className="xw-cell black" />
                const v = value(r, c)
                const entry = room.entry(cellKey(puzzle.id, r, c))
                const author = entry && v ? room.user(entry.by) : undefined
                const isCur = r === cur.r && c === cur.c
                const wrong = room.get(`xw/${puzzle.id}/x/${r},${c}`)
                const revealed = room.get(`xw/${puzzle.id}/rv/${r},${c}`)
                const ph = partnerHighlights.find((h) => h.cells.some(([y, x]) => y === r && x === c))
                const pc = partnerHighlights.find((h) => h.d && h.d.r === r && h.d.c === c)
                const style: Record<string, string> = {}
                if (ph) style['--partner'] = ph.p.color
                if (pc) style['--partner-cursor'] = pc.p.color
                return (
                  <button
                    key={`${r}-${c}`}
                    className={[
                      'xw-cell',
                      inActive(r, c) && 'in-word',
                      isCur && 'cursor',
                      ph && 'partner-word',
                      pc && 'partner-cursor',
                      wrong && 'wrong',
                      revealed && 'revealed',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={style}
                    onClick={() => clickCell(r, c)}
                    aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${v}` : ''}`}
                  >
                    {numbers[`${r},${c}`] && <span className="num">{numbers[`${r},${c}`]}</span>}
                    <span className="letter" style={author ? { color: author.color } : undefined}>
                      {v}
                    </span>
                    {pc && <span className="partner-tag" style={{ background: pc.p.color }}>{pc.p.name}</span>}
                  </button>
                )
              }),
            )}
          </div>
          <Keyboard className="touch-only" onKey={onKey} enterLabel="Next" />
        </div>

        <div className="xw-clues">
          {(['across', 'down'] as const).map((dir) => (
            <section key={dir}>
              <h2>{dir === 'across' ? 'Across' : 'Down'}</h2>
              <ol>
                {slots
                  .filter((s) => s.dir === dir)
                  .map((s) => {
                    const complete = s.cells.every(([r, c]) => value(r, c))
                    const partnerHere = partnerHighlights.find((h) => h.cells === s.cells)
                    return (
                      <li
                        key={`${dir}${s.num}`}
                        className={[s === activeSlot && 'active', complete && 'complete'].filter(Boolean).join(' ')}
                        style={partnerHere ? { boxShadow: `inset 3px 0 0 ${partnerHere.p.color}` } : undefined}
                        onClick={() => {
                          const empty = s.cells.find(([r, c]) => !value(r, c)) ?? s.cells[0]
                          setCur({ r: empty[0], c: empty[1], dir })
                        }}
                      >
                        <b>{s.num}</b> {s.clue}
                      </li>
                    )
                  })}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClueBar({ slot, onPrev, onNext, onToggle }: { slot?: Slot; onPrev: () => void; onNext: () => void; onToggle: () => void }) {
  return (
    <div className="cluebar">
      <button className="icon" onClick={onPrev} aria-label="Previous clue">‹</button>
      <button className="clue-text" onClick={onToggle} aria-label="Switch across/down">
        {slot && (
          <>
            <b>
              {slot.num}
              {slot.dir === 'across' ? 'A' : 'D'}
            </b>{' '}
            {slot.clue}
          </>
        )}
      </button>
      <button className="icon" onClick={onNext} aria-label="Next clue">›</button>
    </div>
  )
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const [openMenu, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // close when tapping anywhere outside the menu
  useEffect(() => {
    if (!openMenu) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [openMenu])
  return (
    <div className="menu" ref={ref}>
      <button className="btn small" onClick={() => setOpen(!openMenu)} aria-expanded={openMenu}>
        {label} ▾
      </button>
      {openMenu && (
        <div className="menu-pop" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
