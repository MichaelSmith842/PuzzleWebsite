import { useState } from 'react'
import { CROSSWORDS, type CrosswordData, type Level } from './data/crosswords'
import { crosswordProgress } from './games/Crossword'
import { answerFor, todayId, wordleStatus, wordleTitle } from './games/Wordle'
import { STRANDS, strandsProgress } from './games/Strands'
import { useRoom } from './room'
import type { User } from './sync'
import { Avatar, ProfileForm } from './App'

export function routeLabel(route: string) {
  const [game, id] = route.split('/')
  if (game === 'crossword') return `the “${CROSSWORDS.find((p) => p.id === id)?.title ?? id}” crossword`
  if (game === 'wordle') return `Wordle (${wordleTitle(id ?? '')})`
  if (game === 'strands') return `Strands: ${STRANDS.find((p) => p.id === id)?.clue ?? id}`
  return 'the home page'
}

function PartnerDots({ route }: { route: string }) {
  const peers = useRoom().peers().filter((p) => p.route === route)
  if (!peers.length) return null
  return (
    <span className="here">
      {peers.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} title={`${p.name} is here`} />
      ))}
    </span>
  )
}

export default function Home({ onEditMe }: { onEditMe: (u: User) => void }) {
  const room = useRoom()
  const today = todayId()
  const freeGames = room
    .scan('wd/games/')
    .map(([k, e]) => ({ id: k.slice('wd/games/'.length), at: e.v as number }))
    .filter((g) => g.id.startsWith('free-'))
    .sort((a, b) => b.at - a.at)
    .slice(0, 4)

  return (
    <div className="home">
      <WelcomeCard onEditMe={onEditMe} />

      {CROSSWORD_SHELVES.map((shelf) => (
        <section className="shelf" key={shelf.level}>
          <div className="shelf-head">
            <h2>{shelf.title}</h2>
            <p>{shelf.blurb}</p>
          </div>
          <div className="cards">
            {CROSSWORDS.filter((p) => p.level === shelf.level).map((p) => (
              <CrosswordCard key={p.id} puzzle={p} />
            ))}
          </div>
        </section>
      ))}

      <section className="shelf">
        <div className="shelf-head">
          <h2>Wordle</h2>
          <p>One shared board: six guesses between the two of you.</p>
        </div>
        <div className="cards">
          <WordleCard id={today} />
          {freeGames.map((g) => (
            <WordleCard key={g.id} id={g.id} />
          ))}
          <a href={`#/wordle/free-${Date.now().toString(36)}`} className="pcard new">
            <span className="plus">+</span>
            <span className="pcard-title">New game</span>
            <span className="pcard-sub">Random word</span>
          </a>
        </div>
      </section>

      <section className="shelf">
        <div className="shelf-head">
          <h2>Strands</h2>
          <p>Find the hidden theme words. Every letter gets used exactly once.</p>
        </div>
        <div className="cards">
          {STRANDS.map((p) => {
            const pr = strandsProgress(room, p)
            return (
              <a key={p.id} href={`#/strands/${p.id}`} className={`pcard ${pr.done ? 'done' : ''}`}>
                <span className="st-thumb">{p.grid[0].slice(0, 4)}</span>
                <span className="pcard-title">{p.clue}</span>
                <span className="pcard-sub">{pr.done ? 'Solved ✓' : pr.found ? `${pr.found}/${pr.total} words` : `${pr.total} words`}</span>
                <PartnerDots route={`strands/${p.id}`} />
              </a>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const CROSSWORD_SHELVES: { level: Level; title: string; blurb: string }[] = [
  { level: 'ours', title: 'Just for us', blurb: 'Law, books and code: a little of each of our worlds.' },
  { level: 'mini', title: 'Mini crosswords', blurb: 'Quick 5×5s. Your letters show in your ink color.' },
  { level: 'medium', title: 'Medium crosswords', blurb: '7×7 grids with trickier clues.' },
  { level: 'hard', title: 'Hard crosswords', blurb: '9×9 grids with misdirection. Bring coffee.' },
]

function CrosswordCard({ puzzle: p }: { puzzle: CrosswordData }) {
  const room = useRoom()
  const pr = crosswordProgress(room, p)
  const n = p.grid.length
  return (
    <a href={`#/crossword/${p.id}`} className={`pcard ${pr.done ? 'done' : ''}`}>
      <MiniGrid grid={p.grid} />
      <span className="pcard-title">{p.title}</span>
      <span className="pcard-sub">{pr.done ? 'Solved ✓' : pr.filled ? `${pr.filled}/${pr.total} squares` : `${n}×${n}`}</span>
      <PartnerDots route={`crossword/${p.id}`} />
    </a>
  )
}

function WordleCard({ id }: { id: string }) {
  const room = useRoom()
  const s = wordleStatus(room, id)
  const sub = s.won ? `Solved in ${s.guesses} ✓` : s.lost ? `Missed: ${answerFor(id)}` : s.guesses ? `${s.guesses}/6 guesses` : 'Not started'
  return (
    <a href={`#/wordle/${id}`} className={`pcard ${s.won || s.lost ? 'done' : ''}`}>
      <span className="wd-thumb">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="pcard-title">{wordleTitle(id)}</span>
      <span className="pcard-sub">{sub}</span>
      <PartnerDots route={`wordle/${id}`} />
    </a>
  )
}

function MiniGrid({ grid }: { grid: string[] }) {
  return (
    <span className="mini-grid" style={{ gridTemplateColumns: `repeat(${grid.length}, 1fr)` }}>
      {grid.flatMap((row, r) => [...row].map((ch, c) => <i key={`${r}${c}`} className={ch === '#' ? 'b' : ''} />))}
    </span>
  )
}

function WelcomeCard({ onEditMe }: { onEditMe: (u: User) => void }) {
  const room = useRoom()
  const [editing, setEditing] = useState(false)
  const online = room.peers()
  // everyone who has ever opened the site, other than me
  const others = room
    .scan('users/')
    .map(([k, e]) => ({ id: k.slice('users/'.length), ...(e.v as { name: string; color: string }) }))
    .filter((u) => u.id !== room.me.id)
  const names = others.map((u) => u.name).join(' & ')
  const link = `${location.origin}${location.pathname}`

  let line
  if (online.length) {
    const p = online[0]
    line = (
      <>
        {online.map((o) => o.name).join(' & ')} {online.length > 1 ? 'are' : 'is'} here
        {p.route ? (
          <>
            {' '}on <a href={`#/${p.route}`}>{routeLabel(p.route)}</a>
          </>
        ) : null}
        .
      </>
    )
  } else if (others.length) {
    line = <>Progress with {names} syncs automatically, even when you're not on at the same time.</>
  } else {
    line = <>Send your partner this site ({link}). Once they open it, you'll share every puzzle.</>
  }

  return (
    <section className="card invite">
      <div>
        <h1>Hi {room.me.name}!</h1>
        <p className="lede">{line}</p>
      </div>
      <div className="invite-actions">
        <button className="link" onClick={() => setEditing(!editing)}>Change name or color</button>
      </div>
      {editing && (
        <ProfileForm
          initial={room.me}
          cta="Save"
          onSave={(u) => {
            setEditing(false)
            onEditMe(u)
          }}
        />
      )}
    </section>
  )
}
