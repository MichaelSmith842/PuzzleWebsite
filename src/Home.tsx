import { useState } from 'react'
import { CROSSWORDS } from './data/crosswords'
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

export default function Home({ onSwitchRoom, onEditMe }: { onSwitchRoom: (c: string) => void; onEditMe: (u: User) => void }) {
  const room = useRoom()
  const peers = room.peers()
  const today = todayId()
  const freeGames = room
    .scan('wd/games/')
    .map(([k, e]) => ({ id: k.slice('wd/games/'.length), at: e.v as number }))
    .filter((g) => g.id.startsWith('free-'))
    .sort((a, b) => b.at - a.at)
    .slice(0, 4)

  return (
    <div className="home">
      <InviteCard peerCount={peers.length} onSwitchRoom={onSwitchRoom} onEditMe={onEditMe} />

      <section className="shelf">
        <div className="shelf-head">
          <h2>Mini crosswords</h2>
          <p>Fill the grid together. Your letters show in your ink color.</p>
        </div>
        <div className="cards">
          {CROSSWORDS.map((p) => {
            const pr = crosswordProgress(room, p)
            return (
              <a key={p.id} href={`#/crossword/${p.id}`} className={`pcard ${pr.done ? 'done' : ''}`}>
                <MiniGrid grid={p.grid} />
                <span className="pcard-title">{p.title}</span>
                <span className="pcard-sub">{pr.done ? 'Solved ✓' : pr.filled ? `${pr.filled}/${pr.total} squares` : '5×5'}</span>
                <PartnerDots route={`crossword/${p.id}`} />
              </a>
            )
          })}
        </div>
      </section>

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

function InviteCard({ peerCount, onSwitchRoom, onEditMe }: { peerCount: number; onSwitchRoom: (c: string) => void; onEditMe: (u: User) => void }) {
  const room = useRoom()
  const link = `${location.origin}${location.pathname}?room=${room.code}`
  const [copied, setCopied] = useState(false)
  const [panel, setPanel] = useState<'none' | 'profile' | 'room'>('none')
  const [joinCode, setJoinCode] = useState('')
  const peers = room.peers()

  const canShare = typeof navigator.share === 'function'
  const share = async () => {
    try {
      await navigator.share({ title: 'Two Down', text: 'Come solve puzzles with me!', url: link })
    } catch {
      /* share sheet dismissed */
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the link is selectable below */
    }
  }

  return (
    <section className="card invite">
      <div className="invite-main">
        <div>
          <h1>Hi {room.me.name}!</h1>
          {peerCount ? (
            <p className="lede">{peers.map((p) => p.name).join(' & ')} is here with you. Pick a puzzle, or tap their name up top to join them.</p>
          ) : (
            <p className="lede">Send your partner the invite link. Progress syncs whenever you're both online.</p>
          )}
        </div>
        {!peerCount && (
          <div className="invite-link">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            {canShare && (
              <button className="btn primary" onClick={share}>
                Send invite
              </button>
            )}
            <button className={`btn ${canShare ? '' : 'primary'}`} onClick={copy}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        )}
      </div>
      <div className="invite-actions">
        <button className="link" onClick={() => setPanel(panel === 'profile' ? 'none' : 'profile')}>Change name or color</button>
        <button className="link" onClick={() => setPanel(panel === 'room' ? 'none' : 'room')}>Join a different room</button>
      </div>
      {panel === 'profile' && (
        <ProfileForm
          initial={room.me}
          cta="Save"
          onSave={(u) => {
            setPanel('none')
            onEditMe(u)
          }}
        />
      )}
      {panel === 'room' && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault()
            const m = joinCode.match(/room=([a-z0-9]+)/i)
            const code = (m ? m[1] : joinCode).toLowerCase().replace(/[^a-z0-9]/g, '')
            if (code) onSwitchRoom(code)
          }}
        >
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Paste an invite link or room code" />
          <button className="btn">Join</button>
          <span className="muted small">Current room: {room.code}</span>
        </form>
      )}
    </section>
  )
}
