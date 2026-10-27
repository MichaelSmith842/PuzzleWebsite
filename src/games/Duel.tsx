import { useEffect, useState } from 'react'
import ANSWERS from '../data/wordle-answers.json'
import { isWord, loadDict } from '../dict'
import { useRoom } from '../room'
import type { Room } from '../sync'
import Keyboard, { type KeyState } from '../Keyboard'
import { answerFor, score, todayId } from './Wordle'

/**
 * Wordle Duel: same secret word, separate boards. Your partner's guesses stay
 * hidden while you play; you only see how many they've used. Once you finish
 * you see their colors, and their letters once they finish too.
 */

const MAX_GUESSES = 6

export function todayDuelId() {
  return todayId().replace('daily-', 'day-')
}

export function duelTitle(id: string) {
  const day = id.match(/^day-(\d{4})-(\d{2})-(\d{2})$/)
  if (day) {
    const d = new Date(+day[1], +day[2] - 1, +day[3])
    return `Duel · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }
  return 'Duel round'
}

function guessesOf(room: Room, id: string, userId: string): string[] {
  const out: string[] = []
  for (let i = 0; i < MAX_GUESSES; i++) {
    const g = room.get<string>(`duel/${id}/${userId}/g/${i}`)
    if (!g) break
    out.push(g)
  }
  return out
}

export type DuelResult = { userId: string; guesses: number; solved: boolean; done: boolean }

export function duelResult(room: Room, id: string, userId: string): DuelResult {
  const answer = answerFor(id)
  const gs = guessesOf(room, id, userId)
  const solved = gs.includes(answer)
  return { userId, guesses: gs.length, solved, done: solved || gs.length >= MAX_GUESSES }
}

/** Everyone who has ever joined the room. */
export function players(room: Room): { id: string; name: string; color: string }[] {
  return room.scan('users/').map(([k, e]) => ({ id: k.slice('users/'.length), ...(e.v as { name: string; color: string }) }))
}

/** Fewer guesses wins; a miss counts as 7. Null until both have finished. */
export function duelWinner(room: Room, id: string, a: string, b: string): string | 'tie' | null {
  const ra = duelResult(room, id, a)
  const rb = duelResult(room, id, b)
  if (!ra.done || !rb.done) return null
  const sa = ra.solved ? ra.guesses : 7
  const sb = rb.solved ? rb.guesses : 7
  return sa === sb ? 'tie' : sa < sb ? a : b
}

export function duelRounds(room: Room): string[] {
  const ids = room
    .scan('duel/rounds/')
    .map(([k, e]) => ({ id: k.slice('duel/rounds/'.length), at: e.v as number }))
    .sort((x, y) => y.at - x.at)
    .map((r) => r.id)
  const today = todayDuelId()
  return [today, ...ids.filter((i) => i !== today)]
}

export default function Duel({ id }: { id: string }) {
  const room = useRoom()
  const me = room.me
  const answer = answerFor(id)
  const mine = guessesOf(room, id, me.id)
  const won = mine.includes(answer)
  const done = won || mine.length >= MAX_GUESSES
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState('')
  const [shake, setShake] = useState(false)
  const rivals = players(room).filter((p) => p.id !== me.id)

  useEffect(() => {
    loadDict()
    if (!room.get(`duel/rounds/${id}`)) room.set(`duel/rounds/${id}`, Date.now())
  }, [room, id])

  const flash = (msg: string) => {
    setToast(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
    setTimeout(() => setToast(''), 1600)
  }

  const onKey = (k: string) => {
    if (done) return
    if (k === 'BACK') setDraft((d) => d.slice(0, -1))
    else if (k === 'ENTER') {
      if (draft.length < 5) return flash('Not enough letters')
      if (isWord(draft) === false && !ANSWERS.includes(draft)) return flash('Not in word list')
      room.set(`duel/${id}/${me.id}/g/${mine.length}`, draft)
      setDraft('')
    } else if (/^[A-Z]$/.test(k)) setDraft((d) => (d.length < 5 ? d + k : d))
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') onKey('ENTER')
      else if (e.key === 'Backspace') onKey('BACK')
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase())
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const keyStates: Record<string, KeyState> = {}
  const rank = { absent: 0, present: 1, correct: 2 }
  for (const g of mine) {
    score(g, answer).forEach((s, i) => {
      const k = g[i]
      if (!keyStates[k] || rank[s] > rank[keyStates[k]]) keyStates[k] = s
    })
  }

  return (
    <div className="game wordle duel">
      <div className="game-head">
        <a href="#/" className="back">← <span className="wide-only">All puzzles</span></a>
        <h1>{duelTitle(id)}</h1>
        <span className="count">{mine.length}/{MAX_GUESSES}</span>
      </div>

      {rivals.map((r) => {
        const theirs = guessesOf(room, id, r.id)
        const res = duelResult(room, id, r.id)
        const winner = done ? duelWinner(room, id, me.id, r.id) : null
        return (
          <div className="duel-rival" key={r.id} style={{ borderColor: r.color }}>
            <div className="duel-rival-head">
              <b style={{ color: r.color }}>{r.name}</b>
              <span className="muted small">
                {res.done ? (res.solved ? `solved in ${res.guesses}` : 'missed it') : theirs.length ? `${theirs.length} guess${theirs.length > 1 ? 'es' : ''} so far` : 'hasn’t started'}
              </span>
            </div>
            {done ? (
              <div className="duel-mini">
                {theirs.map((g, i) => (
                  <div key={i} className="duel-mini-row">
                    {score(g, answer).map((s, j) => (
                      <i key={j} className={s}>{res.done ? g[j] : ''}</i>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">Their board unlocks when you finish.</p>
            )}
            {winner && (
              <p className="duel-verdict">
                {winner === 'tie' ? 'It’s a tie!' : winner === me.id ? 'You win this round! 🏆' : `${r.name} wins this round 🏆`}
              </p>
            )}
            {done && !winner && <p className="muted small">Waiting for {r.name} to finish…</p>}
          </div>
        )
      })}

      <div className="wd-board">
        {toast && <div className="toast">{toast}</div>}
        {Array.from({ length: MAX_GUESSES }, (_, i) => {
          const g = mine[i]
          const isDraft = !g && i === mine.length && !done
          const word = g ?? (isDraft ? draft : '')
          const states = g ? score(g, answer) : []
          return (
            <div key={i} className={`wd-row ${isDraft && shake ? 'shake' : ''}`}>
              {Array.from({ length: 5 }, (_, j) => (
                <div key={j} className={`wd-tile ${states[j] ?? ''} ${word[j] ? 'filled' : ''}`}>
                  {word[j] ?? ''}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <p className="hint-line">
        {done ? (
          won ? <span className="banner success inline">Got it in {mine.length}!</span> : <span className="banner inline">The word was <b>{answer}</b></span>
        ) : (
          <>Same word as your partner. Your guesses stay hidden until they finish.</>
        )}
      </p>

      <Keyboard onKey={onKey} states={keyStates} />
    </div>
  )
}
