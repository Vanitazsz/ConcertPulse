import { ARENA_BLOCKS, blockBounds, pointInPolygon, type ArenaBlock } from './arenaGeometry'
import { phBlockByKey } from './philippineGeometry'
import type { SeatSpot, Tier, TierId } from './types'

export type BlockSeatSpot = {
  index: number
  row: number
  col: number
  label: string
  x: number
  y: number
}

/**
 * Seats packed on the section’s real chart footprint.
 * row/col follow the map grid (gaps allowed for L-shapes) — pick-a-seat matches the section.
 */
export function layoutBlockSeats(block: ArenaBlock): BlockSeatSpot[] {
  if (block.id === 'svip') return []

  const target = block.capacity
  const bounds = blockBounds(block.points)
  const aspect = bounds.w / Math.max(bounds.h, 1)

  type Raw = { x: number; y: number; row: number; col: number }
  let raw: Raw[] = []
  let density = Math.max(2, Math.ceil(Math.sqrt(target * aspect)))

  for (let attempt = 0; attempt < 14; attempt += 1) {
    raw = []
    const cols = density
    const rows = Math.max(2, Math.ceil(density / aspect))
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = bounds.minX + ((col + 0.5) / cols) * bounds.w
        const y = bounds.minY + ((row + 0.5) / rows) * bounds.h
        if (!pointInPolygon(x, y, block.points)) continue
        raw.push({ x, y, row, col })
      }
    }
    if (raw.length >= target) break
    density = Math.ceil(density * 1.35)
  }

  if (raw.length < target) {
    const fine = Math.ceil(Math.sqrt(target * 12))
    for (let row = 0; row < fine && raw.length < target * 2; row += 1) {
      for (let col = 0; col < fine && raw.length < target * 2; col += 1) {
        const x = bounds.minX + ((col + 0.37) / fine) * bounds.w
        const y = bounds.minY + ((row + 0.61) / fine) * bounds.h
        if (!pointInPolygon(x, y, block.points)) continue
        raw.push({ x, y, row, col })
      }
    }
  }

  // Keep spatial order (row-major on the map), not a remapped square
  raw.sort((a, b) => (a.row - b.row) || (a.col - b.col))
  const picked = raw.slice(0, target)

  return picked.map((spot, index) => ({
    index,
    row: spot.row,
    col: spot.col,
    // Unique labels even when grid indices collide after polygon filtering
    label: `${String.fromCharCode(65 + (Math.floor(index / 26) % 26))}${(index % 26) + 1}`,
    x: spot.x,
    y: spot.y,
  }))
}

export function findBlock(blockKey: string): ArenaBlock | undefined {
  return ARENA_BLOCKS.find((item) => item.key === blockKey) ?? phBlockByKey(blockKey)
}

export function layoutBlockSeatsByKey(blockKey: string) {
  const block = findBlock(blockKey)
  return block ? layoutBlockSeats(block) : []
}

export function seatedCapacityForTier(tierId: TierId) {
  return ARENA_BLOCKS.filter((block) => block.id === tierId).reduce(
    (sum, block) => sum + (block.id === 'svip' ? 0 : block.capacity),
    0,
  )
}

export function standingCapacityForTier(tierId: TierId) {
  return ARENA_BLOCKS.filter((block) => block.id === tierId).reduce(
    (sum, block) => sum + (block.id === 'svip' ? block.capacity : 0),
    0,
  )
}

/** Pick-a-seat list — footprint + count match the chosen map section. */
export function buildSeatsForBlock(blockKey: string, tier: Tier): SeatSpot[] {
  const layout = layoutBlockSeatsByKey(blockKey)
  const sold = new Set(tier.soldSeatIds ?? [])
  const seats: SeatSpot[] = layout.map((spot) => {
    const id = `${blockKey}-${spot.index}-${spot.label}`
    return {
      id,
      label: spot.label,
      row: spot.row,
      col: spot.col,
      available: !sold.has(id),
      mapX: spot.x,
      mapY: spot.y,
    }
  })

  const blockCap = layout.length
  const share = tier.total > 0 ? Math.round(tier.stock * (blockCap / tier.total)) : tier.stock
  const remaining = Math.min(blockCap, Math.max(0, share))
  const open = seats.filter((seat) => seat.available)
  if (open.length <= remaining) return seats

  const keep = new Set<string>()
  if (remaining > 0) {
    const step = open.length / remaining
    for (let i = 0; i < remaining; i += 1) {
      const seat = open[Math.min(open.length - 1, Math.floor((i + 0.5) * step))]
      keep.add(seat.id)
    }
  }

  return seats.map((seat) => (
    seat.available && !keep.has(seat.id) ? { ...seat, available: false } : seat
  ))
}
