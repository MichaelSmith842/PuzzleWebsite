import Peer, { type DataConnection } from 'peerjs'

/**
 * Shared room state, synced peer-to-peer.
 *
 * State is a last-writer-wins map: every key holds a value plus a timestamp and
 * the id of whoever wrote it. Merging two maps is just "keep the newer entry per
 * key", so either player can play offline and everything merges when you meet
 * again. Each browser keeps its own copy in localStorage.
 *
 * Networking uses the free PeerJS cloud broker to find each other, then WebRTC.
 * The first tab in a room claims peer id `<room>-0` and becomes the hub; others
 * claim `<room>-1..` and dial the hub, which relays between them. If the hub
 * leaves, the others rejoin and one of them takes over.
 */

export type Entry = { v: unknown; t: number; by: string }
export type User = { id: string; name: string; color: string }
export type Presence = { route: string; data?: unknown }
export type PeerState = User & Presence
export type Status = 'connecting' | 'waiting' | 'connected' | 'offline'

type Msg =
  | { type: 'hello'; user: User; entries: Record<string, Entry>; presence: Presence }
  | { type: 'set'; key: string; entry: Entry }
  | { type: 'presence'; user: User; presence: Presence }
  | { type: 'leave'; id: string }

const PREFIX = 'duopuzzle-v1-'
const MAX_SLOTS = 6

export class Room {
  readonly code: string
  readonly me: User
  private entries: Record<string, Entry>
  private clock = 0
  private peer: Peer | null = null
  private isHub = false
  private conns = new Map<DataConnection, string | null>() // conn -> remote user id
  private peerStates = new Map<string, PeerState>()
  private myPresence: Presence = { route: '' }
  private listeners = new Set<() => void>()
  private saveTimer: number | undefined
  private retryTimer: number | undefined
  private destroyed = false
  status: Status = 'connecting'
  version = 0

  constructor(code: string, me: User) {
    this.code = code
    this.me = me
    this.entries = loadEntries(code)
    for (const e of Object.values(this.entries)) this.clock = Math.max(this.clock, e.t)
    this.set(`users/${me.id}`, { name: me.name, color: me.color })
    this.join(0)
  }

  // ---- state ----

  get<T = unknown>(key: string): T | undefined {
    return this.entries[key]?.v as T | undefined
  }

  entry(key: string): Entry | undefined {
    return this.entries[key]
  }

  /** All entries whose key starts with `prefix`. */
  scan(prefix: string): [string, Entry][] {
    return Object.entries(this.entries).filter(([k]) => k.startsWith(prefix))
  }

  set(key: string, v: unknown) {
    const cur = this.entries[key]
    if (cur && cur.v === v) return
    this.clock = Math.max(Date.now(), this.clock + 1)
    const entry: Entry = { v, t: this.clock, by: this.me.id }
    this.entries[key] = entry
    this.broadcast({ type: 'set', key, entry })
    this.changed()
  }

  user(id: string): { name: string; color: string } | undefined {
    if (id === this.me.id) return this.me
    return this.get(`users/${id}`)
  }

  private merge(key: string, entry: Entry): boolean {
    const cur = this.entries[key]
    if (cur && (cur.t > entry.t || (cur.t === entry.t && cur.by >= entry.by))) return false
    this.entries[key] = entry
    this.clock = Math.max(this.clock, entry.t)
    return true
  }

  // ---- presence ----

  setPresence(p: Presence) {
    this.myPresence = p
    this.broadcast({ type: 'presence', user: this.me, presence: p })
  }

  peers(): PeerState[] {
    return [...this.peerStates.values()].filter((p) => p.id !== this.me.id)
  }

  // ---- subscription (for useSyncExternalStore) ----

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  private changed() {
    this.version++
    for (const fn of this.listeners) fn()
    clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => saveEntries(this.code, this.entries), 300)
  }

  // ---- networking ----

  private setStatus(s: Status) {
    if (this.status !== s) {
      this.status = s
      this.changed()
    }
  }

  private join(slot: number) {
    if (this.destroyed) return
    this.setStatus('connecting')
    const peer = new Peer(`${PREFIX}${this.code}-${slot}`, { debug: 0 })
    this.peer = peer
    peer.on('open', () => {
      if (slot === 0) {
        this.isHub = true
        this.setStatus(this.conns.size ? 'connected' : 'waiting')
      } else {
        this.dial(peer)
      }
    })
    peer.on('connection', (conn) => {
      if (this.isHub) this.setupConn(conn)
      else conn.close()
    })
    peer.on('disconnected', () => {
      // lost the broker (not the peers); keep data channels, try to get the id back
      if (!this.destroyed && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000)
    })
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type
      if (type === 'unavailable-id' && slot + 1 < MAX_SLOTS) {
        peer.destroy()
        this.join(slot + 1)
      } else if (type === 'peer-unavailable' || type === 'unavailable-id') {
        // hub is gone (or every slot busy): start over, maybe as the new hub
        this.restart()
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        this.setStatus('offline')
        this.restart(5000)
      }
    })
  }

  private dial(peer: Peer) {
    const conn = peer.connect(`${PREFIX}${this.code}-0`, { reliable: true })
    this.setupConn(conn)
  }

  private restart(delay = 600 + Math.random() * 1400) {
    clearTimeout(this.retryTimer)
    for (const c of this.conns.keys()) c.close()
    this.conns.clear()
    this.peerStates.clear()
    this.peer?.destroy()
    this.peer = null
    this.isHub = false
    this.changed()
    this.retryTimer = window.setTimeout(() => this.join(0), delay)
  }

  private setupConn(conn: DataConnection) {
    this.conns.set(conn, null)
    conn.on('open', () => {
      conn.send({ type: 'hello', user: this.me, entries: this.entries, presence: this.myPresence } satisfies Msg)
      // the hub also tells newcomers who else is already here
      if (this.isHub) {
        for (const p of this.peerStates.values()) {
          conn.send({ type: 'presence', user: p, presence: { route: p.route, data: p.data } } satisfies Msg)
        }
      }
      this.setStatus('connected')
    })
    conn.on('data', (raw) => this.receive(conn, raw as Msg))
    conn.on('close', () => this.dropConn(conn))
    conn.on('error', () => this.dropConn(conn))
  }

  private dropConn(conn: DataConnection) {
    if (!this.conns.has(conn)) return
    const uid = this.conns.get(conn)
    this.conns.delete(conn)
    if (uid) {
      this.peerStates.delete(uid)
      this.relay(conn, { type: 'leave', id: uid })
    }
    if (this.isHub) {
      this.setStatus(this.conns.size ? 'connected' : 'waiting')
    } else {
      this.restart()
    }
  }

  private receive(conn: DataConnection, msg: Msg) {
    switch (msg.type) {
      case 'hello': {
        this.conns.set(conn, msg.user.id)
        this.peerStates.set(msg.user.id, { ...msg.user, ...msg.presence })
        for (const [k, e] of Object.entries(msg.entries)) {
          if (this.merge(k, e)) this.relay(conn, { type: 'set', key: k, entry: e })
        }
        // send back anything they were missing or had older
        for (const [k, e] of Object.entries(this.entries)) {
          const theirs = msg.entries[k]
          if (!theirs || theirs.t < e.t) conn.send({ type: 'set', key: k, entry: e } satisfies Msg)
        }
        this.relay(conn, { type: 'presence', user: msg.user, presence: msg.presence })
        break
      }
      case 'set':
        if (this.merge(msg.key, msg.entry)) this.relay(conn, msg)
        break
      case 'presence':
        this.peerStates.set(msg.user.id, { ...msg.user, ...msg.presence })
        this.relay(conn, msg)
        break
      case 'leave':
        this.peerStates.delete(msg.id)
        break
    }
    this.changed()
  }

  /** Hub forwards a message from one peer to everyone else. */
  private relay(from: DataConnection, msg: Msg) {
    if (!this.isHub) return
    for (const c of this.conns.keys()) if (c !== from && c.open) c.send(msg)
  }

  private broadcast(msg: Msg) {
    for (const c of this.conns.keys()) if (c.open) c.send(msg)
  }

  destroy() {
    this.destroyed = true
    clearTimeout(this.retryTimer)
    saveEntries(this.code, this.entries)
    this.peer?.destroy()
  }
}

function loadEntries(code: string): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(`duopuzzle:room:${code}`) || '{}')
  } catch {
    return {}
  }
}

function saveEntries(code: string, entries: Record<string, Entry>) {
  try {
    localStorage.setItem(`duopuzzle:room:${code}`, JSON.stringify(entries))
  } catch {
    /* storage full or blocked; the partner still has a copy */
  }
}

export function newRoomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) s += alphabet[b % alphabet.length]
  return s
}
