// Word list for Wordle guesses and Strands bonus words, loaded on first use.
let words: Set<string> | null = null
let loading: Promise<Set<string>> | null = null

export function loadDict(): Promise<Set<string>> {
  if (words) return Promise.resolve(words)
  loading ??= fetch(`${import.meta.env.BASE_URL}words.txt`)
    .then((r) => r.text())
    .then((t) => (words = new Set(t.split('\n'))))
  return loading
}

/** True if `w` is a word or a regular inflection of one. Null while the list is loading. */
export function isWord(w: string): boolean | null {
  if (!words) return null
  const s = w.toLowerCase()
  const d = words
  if (d.has(s)) return true
  const bases: string[] = []
  if (s.endsWith('s')) bases.push(s.slice(0, -1))
  if (s.endsWith('es')) bases.push(s.slice(0, -2))
  if (s.endsWith('ies')) bases.push(s.slice(0, -3) + 'y')
  if (s.endsWith('ed')) bases.push(s.slice(0, -2), s.slice(0, -1))
  if (s.endsWith('ied')) bases.push(s.slice(0, -3) + 'y')
  if (s.endsWith('ing')) bases.push(s.slice(0, -3), s.slice(0, -3) + 'e')
  if (s.endsWith('er')) bases.push(s.slice(0, -2), s.slice(0, -1))
  if (s.endsWith('ly')) bases.push(s.slice(0, -2))
  return bases.some((b) => b.length >= 3 && d.has(b))
}
