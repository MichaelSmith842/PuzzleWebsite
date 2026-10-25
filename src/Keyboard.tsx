const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

export type KeyState = 'correct' | 'present' | 'absent'

/** On-screen keyboard. Emits 'A'-'Z', 'ENTER' or 'BACK'. */
export default function Keyboard({
  onKey,
  states,
  enterLabel = 'Enter',
  className = '',
}: {
  onKey: (k: string) => void
  states?: Record<string, KeyState>
  enterLabel?: string
  className?: string
}) {
  return (
    <div className={`keyboard ${className}`}>
      {ROWS.map((row, i) => (
        <div className="kb-row" key={row}>
          {i === 2 && (
            <button className="key wide" onClick={() => onKey('ENTER')}>
              {enterLabel}
            </button>
          )}
          {[...row].map((k) => (
            <button key={k} className={`key ${states?.[k] ?? ''}`} onClick={() => onKey(k)}>
              {k}
            </button>
          ))}
          {i === 2 && (
            <button className="key wide" onClick={() => onKey('BACK')} aria-label="Backspace">
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
