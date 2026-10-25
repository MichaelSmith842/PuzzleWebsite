import { useEffect, useState } from 'react'
import ANSWERS from '../data/wordle-answers.json'
import { isWord, loadDict } from '../dict'
import { usePeersOn, useRoom } from '../room'
import type { Room } from '../sync'
import Keyboard, { type KeyState } from '../Keyboard'

const MAX_GUESSES = 6
const EPOCH = Date.UTC(2026, 0, 1)

export function todayId() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `daily-${y}-${m}-${day}`
}

/** Daily games walk the (pre-shuffled) answer list by date; free-play games hash their id. */
export function answerFor(id: string): string {
  const daily = id.match(/^daily-(\d{4})-(\d{2})-(\d{2})$/)
  if (daily) {
    const days = Math.floor((Date.UTC(+daily[1], +daily[2] - 1, +daily[3]) - EPOCH) / 86400000)
    return ANSWERS[((days % ANSWERS.length) + ANSWERS.length) % ANSWERS.length]
  }
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ANSWERS[(h >>> 0) % ANSWERS.length]
}

export function wordleTitle(id: string) {
  const daily = id.match(/^daily-(\d{4})-(\d{2})-(\d{2})$/)
  if (daily) {
    const d = new Date(+daily[1], +daily[2] - 1, +daily[3])
    return `Daily · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }
  return 'Free play'
}

export function guessesFor(room: Room, id: string) {
  const out: { word: string; by: string }[] = []
  for (let i = 0; i < MAX_GUESSES; i++) {
    const e = room.entry(`wd/${id}/g/${i}`)
    if (!e) break
    out.push({ word: e.v as string, by: e.by })
  }
  return out
}

export function wordleStatus(room: Room, id: string) {
  const answer = answerFor(id)
  const guesses = guessesFor(room, id)
  const won = guesses.some((g) => g.word === answer)
  return { guesses: guesses.length, won, lost: !won && guesses.length >= MAX_GUESSES }
}

export function score(guess: string, answer: string): KeyState[] {
  const res: KeyState[] = Array(5).fill('absent')
  const left: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct'
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== 'correct' && left[guess[i]]) {
      res[i] = 'present'
      left[guess[i]]--
    }
  }
  return res
}

export default function Wordle({ id }: { id: string }) {
  const room = useRoom()
  const route = `wordle/${id}`
  const partners = usePeersOn(route)
  const answer = answerFor(id)
  const guesses = guessesFor(room, id)
  const draftEntry = room.entry(`wd/${id}/draft`)
  const draft = (draftEntry?.v as string | undefined) ?? ''
  const won = guesses.some((g) => g.word === answer)
  const over = won || guesses.length >= MAX_GUESSES
  const [toast, setToast] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    loadDict()
    if (!room.get(`wd/games/${id}`)) room.set(`wd/games/${id}`, Date.now())
  }, [room, id])

  const flash = (msg: string) => {
    setToast(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
    setTimeout(() => setToast(''), 1600)
  }

  const onKey = (k: string) => {
    if (over) return
    if (k === 'BACK') room.set(`wd/${id}/draft`, draft.slice(0, -1))
    else if (k === 'ENTER') {
      if (draft.length < 5) return flash('Not enough letters')
      if (isWord(draft) === false && !ANSWERS.includes(draft)) return flash('Not in word list')
      room.set(`wd/${id}/g/${guesses.length}`, draft)
      room.set(`wd/${id}/draft`, '')
    } else if (/^[A-Z]$/.test(k) && draft.length < 5) room.set(`wd/${id}/draft`, draft + k)
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
  for (const g of guesses) {
    score(g.word, answer).forEach((s, i) => {
      const k = g.word[i]
      if (!keyStates[k] || rank[s] > rank[keyStates[k]]) keyStates[k] = s
    })
  }

  const drafter = draftEntry && draft ? room.user(draftEntry.by) : undefined
  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => i)

  return (
    <div className="game wordle">
      <div className="game-head">
        <a href="#/" className="back">← All puzzles</a>
        <h1>{wordleTitle(id)}</h1>
        <span className="timer">{guesses.length}/{MAX_GUESSES}</span>
      </div>

      <div className="wd-board">
        {toast && <div className="toast">{toast}</div>}
        {rows.map((i) => {
          const g = guesses[i]
          const isDraft = !g && i === guesses.length && !over
          const word = g ? g.word : isDraft ? draft : ''
          const states = g ? score(g.word, answer) : []
          const by = g ? room.user(g.by) : isDraft ? drafter : undefined
          return (
            <div key={i} className={`wd-row ${isDraft && shake ? 'shake' : ''}`}>
              <span className="wd-by" style={by ? { background: by.color } : undefined} title={by ? `${g ? 'Guessed' : 'Typing'}: ${by.name}` : undefined} />
              {Array.from({ length: 5 }, (_, j) => (
                <div
                  key={j}
                  className={`wd-tile ${states[j] ?? ''} ${word[j] ? 'filled' : ''}`}
                  style={g ? { transitionDelay: `${j * 90}ms` } : undefined}
                >
                  {word[j] ?? ''}
                </div>
              ))}
              <span className="wd-by spacer" />
            </div>
          )
        })}
      </div>

      <p className="hint-line">
        {over ? (
          won ? (
            <span className="banner success inline">Got it in {guesses.length}! 🎉</span>
          ) : (
            <span className="banner inline">The word was <b>{answer}</b></span>
          )
        ) : partners.length ? (
          <>You and {partners.map((p) => p.name).join(', ')} share one board. Either of you can type.</>
        ) : (
          <>Your partner will see every letter as you type it.</>
        )}
      </p>
      {over && (
        <p className="center">
          <button className="btn primary" onClick={() => (location.hash = `#/wordle/free-${Date.now().toString(36)}`)}>
            Play another
          </button>
        </p>
      )}

      <Keyboard onKey={onKey} states={keyStates} />
    </div>
  )
}
