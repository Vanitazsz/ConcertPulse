import type { SeatSpot } from './types'

type Props = {
  seats: SeatSpot[]
  selected: string[]
  accent: string
  onToggle: (seatId: string, available: boolean) => void
}

/** Fast 2D grid for large MOA sections (hundreds of seats). */
export default function SeatGridPicker({ seats, selected, accent, onToggle }: Props) {
  const cols = Math.max(...seats.map((s) => s.col), 0) + 1
  const picked = new Set(selected)

  return (
    <div className="seat-grid-shell" aria-label="Seat grid. Click a seat to select it.">
      <div className="seat-grid-stage">STAGE</div>
      <div
        className="seat-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {seats.map((seat) => {
          const isOn = picked.has(seat.id)
          const state = !seat.available ? 'is-sold' : isOn ? 'is-picked' : 'is-free'
          return (
            <button
              key={seat.id}
              type="button"
              className={`seat-grid-cell ${state}`}
              style={isOn ? { background: accent, borderColor: accent } : undefined}
              disabled={!seat.available && !isOn}
              onClick={() => onToggle(seat.id, seat.available || isOn)}
              title={seat.label}
              aria-pressed={isOn}
            >
              {seat.label}
            </button>
          )
        })}
      </div>
      <p className="seat-grid-hint">{seats.length.toLocaleString()} seats in this section · tap to select</p>
    </div>
  )
}
