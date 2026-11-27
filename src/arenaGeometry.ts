import type { TierId } from './types'

export const ARENA_CAPACITY = 15_000

export const TIER_COLOR: Record<TierId, string> = {
  svip: '#E53935',
  'lower-center': '#64B5F6',
  'lower-left': '#1565C0',
  'lower-right': '#1565C0',
  'upper-left': '#6D4C41',
  'upper-center': '#EF6C00',
  'upper-right': '#6D4C41',
  ga: '#78909C',
}

/** Per-block color overrides to match MOA chart (pit pink, LB side mid-blue, etc.). */
export const BLOCK_TINT: Record<string, string | undefined> = {
  'svip-top': '#F48FB1',
  'svip-bottom': '#F48FB1',
  'lower-nw': '#1E88E5',
  'lower-ne': '#1E88E5',
  'lower-sw': '#1E88E5',
  'lower-se': '#1E88E5',
}

export type Pt = { x: number; y: number }

export type ArenaBlock = {
  key: string
  id: TierId
  code: string
  /** Seats (or standing spots) in this block — arena totals 15,000 */
  capacity: number
  points: Pt[]
}

export const CX = 320
export const CY = 340
export const ARENA_CENTER = { x: CX, y: CY }

/**
 * Tight MOA stadium mosaic — rounded-rect footprint, ~3px aisle gaps only.
 * Capacities sum to ARENA_CAPACITY (15,000).
 */
export const ARENA_BLOCKS: ArenaBlock[] = [
  // —— Patron / Pit (standing) — 200 ——
  {
    key: 'svip-left', id: 'svip', code: 'P', capacity: 50,
    points: [
      { x: 248, y: 262 }, { x: 268, y: 262 }, { x: 268, y: 418 }, { x: 248, y: 418 },
    ],
  },
  {
    key: 'svip-right', id: 'svip', code: 'P', capacity: 50,
    points: [
      { x: 372, y: 262 }, { x: 392, y: 262 }, { x: 392, y: 418 }, { x: 372, y: 418 },
    ],
  },
  {
    key: 'svip-top', id: 'svip', code: 'PIT', capacity: 50,
    points: [
      { x: 248, y: 234 }, { x: 392, y: 234 }, { x: 392, y: 259 }, { x: 248, y: 259 },
    ],
  },
  {
    key: 'svip-bottom', id: 'svip', code: 'PIT', capacity: 50,
    points: [
      { x: 248, y: 421 }, { x: 392, y: 421 }, { x: 392, y: 446 }, { x: 248, y: 446 },
    ],
  },

  // —— Lower box — 3,000 ——
  {
    key: 'lower-left-main', id: 'lower-left', code: 'LB L', capacity: 700,
    points: [
      { x: 168, y: 262 }, { x: 245, y: 262 }, { x: 245, y: 418 }, { x: 168, y: 418 },
    ],
  },
  {
    key: 'lower-right-main', id: 'lower-right', code: 'LB R', capacity: 700,
    points: [
      { x: 395, y: 262 }, { x: 472, y: 262 }, { x: 472, y: 418 }, { x: 395, y: 418 },
    ],
  },
  {
    key: 'lower-center-top', id: 'lower-center', code: 'LB C', capacity: 400,
    points: [
      { x: 248, y: 172 }, { x: 392, y: 172 }, { x: 392, y: 231 }, { x: 248, y: 231 },
    ],
  },
  {
    key: 'lower-center-bot', id: 'lower-center', code: 'LB C', capacity: 400,
    points: [
      { x: 248, y: 449 }, { x: 392, y: 449 }, { x: 392, y: 508 }, { x: 248, y: 508 },
    ],
  },
  {
    key: 'lower-nw', id: 'lower-left', code: 'LB S', capacity: 200,
    points: [
      { x: 168, y: 172 }, { x: 245, y: 172 }, { x: 245, y: 259 }, { x: 168, y: 259 },
    ],
  },
  {
    key: 'lower-ne', id: 'lower-right', code: 'LB S', capacity: 200,
    points: [
      { x: 395, y: 172 }, { x: 472, y: 172 }, { x: 472, y: 259 }, { x: 395, y: 259 },
    ],
  },
  {
    key: 'lower-sw', id: 'lower-left', code: 'LB S', capacity: 200,
    points: [
      { x: 168, y: 421 }, { x: 245, y: 421 }, { x: 245, y: 508 }, { x: 168, y: 508 },
    ],
  },
  {
    key: 'lower-se', id: 'lower-right', code: 'LB S', capacity: 200,
    points: [
      { x: 395, y: 421 }, { x: 472, y: 421 }, { x: 472, y: 508 }, { x: 395, y: 508 },
    ],
  },

  // —— Upper box — 4,400 ——
  {
    key: 'upper-left-main', id: 'upper-left', code: 'UB L', capacity: 1000,
    points: [
      { x: 98, y: 234 }, { x: 165, y: 234 }, { x: 165, y: 446 }, { x: 98, y: 446 },
    ],
  },
  {
    key: 'upper-right-main', id: 'upper-right', code: 'UB R', capacity: 1000,
    points: [
      { x: 475, y: 234 }, { x: 542, y: 234 }, { x: 542, y: 446 }, { x: 475, y: 446 },
    ],
  },
  {
    key: 'upper-center-top', id: 'upper-center', code: 'UB C', capacity: 600,
    points: [
      { x: 220, y: 100 }, { x: 420, y: 100 }, { x: 420, y: 169 }, { x: 220, y: 169 },
    ],
  },
  {
    key: 'upper-center-bot', id: 'upper-center', code: 'UB C', capacity: 600,
    points: [
      { x: 220, y: 511 }, { x: 420, y: 511 }, { x: 420, y: 580 }, { x: 220, y: 580 },
    ],
  },
  {
    key: 'upper-nw', id: 'upper-left', code: 'UB S', capacity: 300,
    points: [
      { x: 98, y: 100 }, { x: 217, y: 100 }, { x: 217, y: 169 }, { x: 165, y: 169 },
      { x: 165, y: 231 }, { x: 98, y: 231 },
    ],
  },
  {
    key: 'upper-ne', id: 'upper-right', code: 'UB S', capacity: 300,
    points: [
      { x: 423, y: 100 }, { x: 542, y: 100 }, { x: 542, y: 231 }, { x: 475, y: 231 },
      { x: 475, y: 169 }, { x: 423, y: 169 },
    ],
  },
  {
    key: 'upper-sw', id: 'upper-left', code: 'UB S', capacity: 300,
    points: [
      { x: 98, y: 449 }, { x: 165, y: 449 }, { x: 165, y: 511 }, { x: 217, y: 511 },
      { x: 217, y: 580 }, { x: 98, y: 580 },
    ],
  },
  {
    key: 'upper-se', id: 'upper-right', code: 'UB S', capacity: 300,
    points: [
      { x: 475, y: 449 }, { x: 542, y: 449 }, { x: 542, y: 580 }, { x: 423, y: 580 },
      { x: 423, y: 511 }, { x: 475, y: 511 },
    ],
  },

  // —— General admission — 7,400 ——
  {
    key: 'ga-n', id: 'ga', code: 'GA', capacity: 1000,
    points: [
      { x: 200, y: 40 }, { x: 440, y: 40 }, { x: 440, y: 97 }, { x: 200, y: 97 },
    ],
  },
  {
    key: 'ga-s', id: 'ga', code: 'GA', capacity: 1000,
    points: [
      { x: 200, y: 583 }, { x: 440, y: 583 }, { x: 440, y: 640 }, { x: 200, y: 640 },
    ],
  },
  {
    key: 'ga-w', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 40, y: 220 }, { x: 95, y: 220 }, { x: 95, y: 460 }, { x: 40, y: 460 },
    ],
  },
  {
    key: 'ga-e', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 545, y: 220 }, { x: 600, y: 220 }, { x: 600, y: 460 }, { x: 545, y: 460 },
    ],
  },
  {
    key: 'ga-nw', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 40, y: 40 }, { x: 197, y: 40 }, { x: 197, y: 97 }, { x: 95, y: 97 },
      { x: 95, y: 217 }, { x: 40, y: 217 },
    ],
  },
  {
    key: 'ga-ne', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 443, y: 40 }, { x: 600, y: 40 }, { x: 600, y: 217 }, { x: 545, y: 217 },
      { x: 545, y: 97 }, { x: 443, y: 97 },
    ],
  },
  {
    key: 'ga-sw', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 40, y: 463 }, { x: 95, y: 463 }, { x: 95, y: 583 }, { x: 197, y: 583 },
      { x: 197, y: 640 }, { x: 40, y: 640 },
    ],
  },
  {
    key: 'ga-se', id: 'ga', code: 'GA', capacity: 900,
    points: [
      { x: 545, y: 463 }, { x: 600, y: 463 }, { x: 600, y: 640 }, { x: 443, y: 640 },
      { x: 443, y: 583 }, { x: 545, y: 583 },
    ],
  },
]

export function arenaCapacityTotal() {
  return ARENA_BLOCKS.reduce((sum, block) => sum + block.capacity, 0)
}

export function polygonPath(points: Pt[]) {
  if (!points.length) return ''
  const [first, ...rest] = points
  return [`M ${first.x} ${first.y}`, ...rest.map((p) => `L ${p.x} ${p.y}`), 'Z'].join(' ')
}

export function polygonCentroid(points: Pt[]) {
  const n = points.length || 1
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / n, y: sum.y / n }
}

export function blockBounds(points: Pt[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  points.forEach((p) => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  })
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

export function pointInPolygon(x: number, y: number, points: Pt[]) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x
    const yi = points[i].y
    const xj = points[j].x
    const yj = points[j].y
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2))
  const qx = ax + abx * t
  const qy = ay + aby * t
  return Math.hypot(px - qx, py - qy)
}

function minDistToEdges(px: number, py: number, points: Pt[]) {
  let min = Infinity
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    min = Math.min(min, distToSegment(px, py, points[j].x, points[j].y, points[i].x, points[i].y))
  }
  return min
}

/**
 * Label anchor deep inside the polygon (pole of inaccessibility).
 * Fixes L-shaped GA corners where bbox-center sits in the hole / on the elbow.
 */
export function labelAnchor(points: Pt[]) {
  const bounds = blockBounds(points)
  let best = { x: bounds.minX + bounds.w / 2, y: bounds.minY + bounds.h / 2 }
  let bestScore = -1
  const steps = 28
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      const x = bounds.minX + (bounds.w * i) / steps
      const y = bounds.minY + (bounds.h * j) / steps
      if (!pointInPolygon(x, y, points)) continue
      const score = minDistToEdges(x, y, points)
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
    }
  }
  return best
}

export function labelFontSize(points: Pt[], code: string) {
  const { w, h } = blockBounds(points)
  const minSide = Math.min(w, h)
  if (minSide < 36) return 7.5
  if (minSide < 55) return 9
  if (code.length >= 6) return 9
  return 10.5
}

export function blockByKey(key: string) {
  return ARENA_BLOCKS.find((block) => block.key === key)
}

export function fillForBlock(block: ArenaBlock) {
  return BLOCK_TINT[block.key] ?? TIER_COLOR[block.id]
}
