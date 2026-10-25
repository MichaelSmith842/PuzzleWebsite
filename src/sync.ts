import mqtt, { type MqttClient } from 'mqtt'

/**
 * Shared room state, synced through a public MQTT broker.
 *
 * State is a last-writer-wins map: every key holds a value plus a timestamp and
 * the id of whoever wrote it. Merging two maps is just "keep the newer entry per
 * key", so either player can play offline and everything merges later. Each
 * browser keeps its own copy in localStorage.
 *
 * Topics under `twodown-v2/<room>/`:
 *   op                each change as it happens (live play)
 *   state/<userId>    retained, gzipped snapshot of that user's whole map, so the
 *                     other player gets it on their next visit even if you're offline
 *   presence/<userId> retained "where am I" (cleared by the broker when you drop)
 *
 * The broker relays over a normal secure WebSocket, so this works on any network.
 * It is a free public broker: anyone guessing the room name could read puzzle
 * letters and first names, nothing else.
 */

export type Entry = { v: unknown; t: number; by: string }
export type User = { id: string; name: string; color: string }
export type Presence = { route: string; data?: unknown }
export type PeerState = User & Presence & { seen: number }
export type Status = 'connecting' | 'connected' | 'offline'

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt']
const PRESENCE_EVERY = 20_000
const PRESENCE_STALE = 65_000

type OpMsg = { from: string; key: string; entry: Entry }
type PresenceMsg = { user: User; presence: Presence; t: number }

export class Room {
  readonly code: string
  readonly me: User
  private entries: Record<string, Entry>
  private clock = 0
  private client: MqttClient
  private base: string
  private peerStates = new Map<string, PeerState>()
  private myPresence: Presence = { route: '' }
  private listeners = new Set<() => void>()
  private saveTimer: number | undefined
  private snapshotTimer: number | undefined
  private heartbeat: number | undefined
  status: Status = 'connecting'
  version = 0

  constructor(code: string, me: User) {
    this.code = code
    this.me = me
    this.base = `twodown-v2/${code}`
    this.entries = loadEntries(code)
    for (const e of Object.values(this.entries)) this.clock = Math.max(this.clock, e.t)
    this.set(`users/${me.id}`, { name: me.name, color: me.color })

    const brokers = BROKERS.map((url) => {
      const u = new URL(url)
      return { host: u.hostname, port: Number(u.port), protocol: 'wss' as const }
    })
    this.client = mqtt.connect(BROKERS[0], {
      servers: brokers,
      clientId: `twodown-${me.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
      reconnectPeriod: 3000,
      connectTimeout: 10_000,
      keepalive: 30,
      will: { topic: this.topic('presence', me.id), payload: '', retain: true, qos: 1 },
    })
    this.client.on('connect', () => {
      this.client.subscribe(`${this.base}/#`, { qos: 1 })
      this.setStatus('connected')
      this.publishPresence()
      this.publishSnapshot()
    })
    this.client.on('reconnect', () => this.setStatus('connecting'))
    this.client.on('offline', () => this.setStatus('offline'))
    this.client.on('close', () => this.status !== 'offline' && this.setStatus('connecting'))
    this.client.on('message', (topic, payload) => this.receive(topic, payload))
    this.heartbeat = window.setInterval(() => {
      this.publishPresence()
      this.changed(false) // re-evaluate stale peers
    }, PRESENCE_EVERY)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private topic(kind: 'op' | 'state' | 'presence', id?: string) {
    return id ? `${this.base}/${kind}/${id}` : `${this.base}/${kind}`
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
    if (this.client?.connected) {
      this.client.publish(this.topic('op'), JSON.stringify({ from: this.me.id, key, entry } satisfies OpMsg), { qos: 1 })
    }
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
    this.publishPresence()
  }

  private publishPresence() {
    if (!this.client?.connected) return
    const msg: PresenceMsg = { user: this.me, presence: this.myPresence, t: Date.now() }
    this.client.publish(this.topic('presence', this.me.id), JSON.stringify(msg), { retain: true, qos: 0 })
  }

  peers(): PeerState[] {
    const now = Date.now()
    return [...this.peerStates.values()].filter((p) => p.id !== this.me.id && now - p.seen < PRESENCE_STALE)
  }

  // ---- snapshots ----

  private async publishSnapshot() {
    if (!this.client?.connected) return
    const payload = toBase64(await gzip(JSON.stringify(this.entries)))
    this.client.publish(this.topic('state', this.me.id), payload, { retain: true, qos: 1 })
  }

  private onVisibility = () => {
    // phones suspend background tabs: save a snapshot on the way out, refresh presence on the way back
    if (document.visibilityState === 'hidden') this.publishSnapshot()
    else this.publishPresence()
  }

  // ---- incoming ----

  private async receive(topic: string, payload: Uint8Array) {
    const [kind, id] = topic.slice(this.base.length + 1).split('/')
    try {
      if (kind === 'op') {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as OpMsg
        if (msg.from !== this.me.id && this.merge(msg.key, msg.entry)) this.changed()
      } else if (kind === 'state' && id !== this.me.id && payload.length) {
        const theirs = JSON.parse(await gunzip(fromBase64(new TextDecoder().decode(payload)))) as Record<string, Entry>
        let any = false
        for (const [k, e] of Object.entries(theirs)) any = this.merge(k, e) || any
        if (any) this.changed()
      } else if (kind === 'presence' && id !== this.me.id) {
        if (!payload.length) this.peerStates.delete(id)
        else {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as PresenceMsg
          this.peerStates.set(id, { ...msg.user, ...msg.presence, seen: Math.min(msg.t, Date.now()) })
        }
        this.changed(false)
      }
    } catch {
      /* ignore malformed messages */
    }
  }

  // ---- subscription (for useSyncExternalStore) ----

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  private changed(dataChanged = true) {
    this.version++
    for (const fn of this.listeners) fn()
    if (!dataChanged) return
    clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => saveEntries(this.code, this.entries), 300)
    clearTimeout(this.snapshotTimer)
    this.snapshotTimer = window.setTimeout(() => this.publishSnapshot(), 3000)
  }

  private setStatus(s: Status) {
    if (this.status !== s) {
      this.status = s
      this.changed(false)
    }
  }

  destroy() {
    clearInterval(this.heartbeat)
    document.removeEventListener('visibilitychange', this.onVisibility)
    saveEntries(this.code, this.entries)
    this.client.end(true)
  }
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const storageKey = (code: string) => `duopuzzle:room:${code}`

function loadEntries(code: string): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(code)) || '{}')
  } catch {
    return {}
  }
}

function saveEntries(code: string, entries: Record<string, Entry>) {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(entries))
  } catch {
    /* storage full or blocked; the broker snapshot still has a copy */
  }
}

/** Fold progress saved under older room codes into `code`, so nothing is lost. */
export function migrateOldRooms(code: string) {
  try {
    const into = loadEntries(code)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (!k.startsWith('duopuzzle:room:') || k === storageKey(code)) continue
      const old = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, Entry>
      for (const [key, e] of Object.entries(old)) {
        const cur = into[key]
        if (!cur || cur.t < e.t) into[key] = e
      }
    }
    saveEntries(code, into)
  } catch {
    /* best effort */
  }
}
