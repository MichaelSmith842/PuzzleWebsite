import { useEffect, useMemo, useState } from 'react'
import { Room, newRoomCode, type User } from './sync'
import { RoomContext, initials, useHashRoute, useRoom } from './room'
import Home, { routeLabel } from './Home'
import Crossword from './games/Crossword'
import Wordle from './games/Wordle'
import Strands from './games/Strands'

export const COLORS = ['#e8664f', '#3d7be0', '#2f9e6b', '#8a5cd6', '#d49a1f', '#d6529a']

const ME_KEY = 'duopuzzle:me'
const ROOM_KEY = 'duopuzzle:room'

function loadMe(): User | null {
  try {
    return JSON.parse(localStorage.getItem(ME_KEY) || 'null')
  } catch {
    return null
  }
}

/** Room code from an invite link (?room=...) wins over the remembered one. */
function pickRoomCode(): string {
  const params = new URLSearchParams(location.search)
  const fromLink = params.get('room')?.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (fromLink) {
    localStorage.setItem(ROOM_KEY, fromLink)
    history.replaceState(null, '', location.pathname + location.hash)
    return fromLink
  }
  const saved = localStorage.getItem(ROOM_KEY)
  if (saved) return saved
  const code = newRoomCode()
  localStorage.setItem(ROOM_KEY, code)
  return code
}

export default function App() {
  const [me, setMe] = useState<User | null>(loadMe)
  const [code, setCode] = useState(pickRoomCode)
  const room = useMemo(() => (me ? new Room(code, me) : null), [code, me])
  useEffect(() => () => room?.destroy(), [room])

  if (!me || !room) {
    return (
      <Onboarding
        onDone={(u) => {
          localStorage.setItem(ME_KEY, JSON.stringify(u))
          setMe(u)
        }}
      />
    )
  }

  return (
    <RoomContext.Provider value={room}>
      <Shell
        onSwitchRoom={(c) => {
          localStorage.setItem(ROOM_KEY, c)
          setCode(c)
        }}
        onEditMe={(u) => {
          localStorage.setItem(ME_KEY, JSON.stringify(u))
          setMe(u)
        }}
      />
    </RoomContext.Provider>
  )
}

function Shell({ onSwitchRoom, onEditMe }: { onSwitchRoom: (c: string) => void; onEditMe: (u: User) => void }) {
  const room = useRoom()
  const route = useHashRoute()
  const [game, id] = route.split('/')

  useEffect(() => {
    room.setPresence({ route })
    window.scrollTo(0, 0)
  }, [room, route])

  let page
  if (game === 'crossword' && id) page = <Crossword id={id} key={route} />
  else if (game === 'wordle' && id) page = <Wordle id={id} key={route} />
  else if (game === 'strands' && id) page = <Strands id={id} key={route} />
  else page = <Home onSwitchRoom={onSwitchRoom} onEditMe={onEditMe} />

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden>
            <i /><i /><i /><i />
          </span>
          Two Down
        </a>
        <PartnerBar route={route} />
      </header>
      <main>{page}</main>
    </div>
  )
}

function PartnerBar({ route }: { route: string }) {
  const room = useRoom()
  const peers = room.peers()
  const elsewhere = peers.find((p) => p.route !== route)
  return (
    <div className="partners">
      {elsewhere && elsewhere.route && (
        <a className="follow" href={`#/${elsewhere.route}`}>
          {elsewhere.name} is on {routeLabel(elsewhere.route)} →
        </a>
      )}
      <span className="avatars">
        <Avatar name={room.me.name} color={room.me.color} title={`${room.me.name} (you)`} />
        {peers.map((p) => (
          <Avatar key={p.id} name={p.name} color={p.color} title={`${p.name} is online`} />
        ))}
      </span>
      <span className={`status status-${room.status}`} title={statusText(room.status, peers.length)}>
        {statusText(room.status, peers.length)}
      </span>
    </div>
  )
}

export function statusText(status: Room['status'], peerCount: number) {
  if (peerCount > 0) return 'Together'
  if (status === 'connecting') return 'Connecting…'
  if (status === 'offline') return 'Offline'
  return 'Solo'
}

export function Avatar({ name, color, title }: { name: string; color: string; title?: string }) {
  return (
    <span className="avatar" style={{ background: color }} title={title ?? name}>
      {initials(name)}
    </span>
  )
}

export function ProfileForm({ initial, onSave, cta }: { initial?: User; onSave: (u: User) => void; cta: string }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim().slice(0, 20), color })
      }}
    >
      <label>
        Your name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={20} />
      </label>
      <fieldset>
        <legend>Your ink color</legend>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>
      </fieldset>
      <button className="btn primary" disabled={!name.trim()}>
        {cta}
      </button>
    </form>
  )
}

function Onboarding({ onDone }: { onDone: (u: User) => void }) {
  return (
    <div className="onboarding">
      <div className="card onboarding-card">
        <h1>Two Down</h1>
        <p className="lede">Crosswords, Wordle and Strands, solved together in real time.</p>
        <ProfileForm onSave={onDone} cta="Let's play" />
      </div>
    </div>
  )
}
