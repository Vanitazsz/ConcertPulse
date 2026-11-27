import { buildSeatsForBlock } from './blockSeats'
import type { SeatSpot, Tier, TierId } from './types'

export const MAX_TICKETS = 6
/** Only Patron / SVIP pit is standing. GA and all boxes are seated. */
export const STANDING_TIER_IDS: TierId[] = ['svip']

export function isStandingTier(id: TierId) {
  return STANDING_TIER_IDS.includes(id)
}

/** @deprecated Prefer buildSeatsForBlock — kept for any tier-wide fallback. */
export function buildSeatsForTier(tier: Tier): SeatSpot[] {
  const sold = new Set(tier.soldSeatIds ?? [])
  const cols = tier.total <= 12 ? 4 : tier.total <= 24 ? 6 : 8
  const seats: SeatSpot[] = []

  for (let index = 0; index < tier.total; index += 1) {
    const row = Math.floor(index / cols)
    const col = index % cols
    const label = `${String.fromCharCode(65 + row)}${col + 1}`
    const id = `${tier.id}-${label}`
    seats.push({
      id,
      label,
      row,
      col,
      available: !sold.has(id),
      mapX: 280 + col * 18,
      mapY: 300 + row * 18,
    })
  }

  let remaining = tier.stock
  return seats.map((seat) => {
    if (!seat.available) return seat
    if (remaining <= 0) return { ...seat, available: false }
    remaining -= 1
    return seat
  })
}

export { buildSeatsForBlock }

export function toggleSeatSelection(selected: string[], seatId: string, available: boolean) {
  if (!available) return selected
  if (selected.includes(seatId)) return selected.filter((id) => id !== seatId)
  if (selected.length >= MAX_TICKETS) return selected
  return [...selected, seatId]
}
