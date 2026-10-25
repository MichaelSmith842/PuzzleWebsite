import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { PeerState, Room } from './sync'

export const RoomContext = createContext<Room | null>(null)

/** The current room; re-renders the caller whenever shared state or presence changes. */
export function useRoom(): Room {
  const room = useContext(RoomContext)!
  useSyncExternalStore(room.subscribe, room.getVersion)
  return room
}

/** Partners currently looking at `route`. */
export function usePeersOn(route: string): PeerState[] {
  return useRoom().peers().filter((p) => p.route === route)
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, ''))
  useEffect(() => {
    const on = () => setRoute(location.hash.replace(/^#\/?/, ''))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
