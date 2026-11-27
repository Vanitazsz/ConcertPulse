import type { ArenaBlock, Pt } from './arenaGeometry'
import type { TierId } from './types'

/** Fan-shaped concert plan for Philippine Arena. Stage sits at the bottom. */
export const PH_CENTER = { x: 360, y: 430 }

export const PH_COLOR = {
  vip: '#F5A623',
  red: '#E53935',
  level100: '#7E57C2',
  level200: '#29B6F6',
  level300: '#8BC34A',
  level400: '#C4A574',
  stage: '#161616',
}

export type PhBlock = ArenaBlock & { color: string; a0: number; a1: number; r0: number; r1: number }

export const PH_FAN = { a0: Math.PI + 0.05, a1: Math.PI * 2 - 0.05 }

const A0 = PH_FAN.a0
const A1 = PH_FAN.a1

function sector(r0: number, r1: number, a0: number, a1: number): Pt[] {
  const steps = 7
  const points: Pt[] = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = a0 + ((a1 - a0) * i) / steps
    points.push({
      x: PH_CENTER.x + Math.cos(angle) * r1,
      y: PH_CENTER.y + Math.sin(angle) * r1,
    })
  }
  for (let i = steps; i >= 0; i -= 1) {
    const angle = a0 + ((a1 - a0) * i) / steps
    points.push({
      x: PH_CENTER.x + Math.cos(angle) * r0,
      y: PH_CENTER.y + Math.sin(angle) * r0,
    })
  }
  return points
}

function sideTier(index: number, count: number, left: TierId, center: TierId, right: TierId): TierId {
  const t = (index + 0.5) / count
  if (t < 0.34) return left
  if (t > 0.66) return right
  return center
}

function ring(
  blocks: PhBlock[],
  prefix: string,
  start: number,
  count: number,
  r0: number,
  r1: number,
  color: string,
  tierAt: (index: number, count: number) => TierId,
  capacity: number,
) {
  const span = A1 - A0
  const gap = 0.01
  for (let i = 0; i < count; i += 1) {
    const a0 = A0 + (span * i) / count + gap
    const a1 = A0 + (span * (i + 1)) / count - gap
    blocks.push({
      key: `ph-${prefix}-${start + i}`,
      id: tierAt(i, count),
      code: String(start + i),
      capacity,
      points: sector(r0, r1, a0, a1),
      color,
      a0,
      a1,
      r0,
      r1,
    })
  }
}

function buildBlocks(): PhBlock[] {
  const blocks: PhBlock[] = []
  const mid = (Math.PI * 3) / 2
  blocks.push({
    key: 'ph-vip',
    id: 'svip',
    code: 'VIP',
    capacity: 120,
    color: PH_COLOR.vip,
    a0: mid - 0.72,
    a1: mid + 0.28,
    r0: 52,
    r1: 118,
    points: sector(52, 118, mid - 0.72, mid + 0.28),
  })
  blocks.push({
    key: 'ph-red',
    id: 'lower-center',
    code: 'RED',
    capacity: 36,
    color: PH_COLOR.red,
    a0: mid + 0.32,
    a1: mid + 0.92,
    r0: 52,
    r1: 118,
    points: sector(52, 118, mid + 0.32, mid + 0.92),
  })
  ring(blocks, '100', 101, 14, 124, 176, PH_COLOR.level100, (i, n) => sideTier(i, n, 'lower-left', 'lower-center', 'lower-right'), 32)
  ring(blocks, '200', 201, 18, 182, 236, PH_COLOR.level200, (i, n) => sideTier(i, n, 'upper-left', 'upper-center', 'upper-right'), 28)
  ring(blocks, '300', 301, 14, 242, 268, PH_COLOR.level300, () => 'ga', 24)
  ring(blocks, '400', 401, 20, 274, 328, PH_COLOR.level400, () => 'ga', 24)
  assignCapacity(blocks, 55000)
  return blocks
}

function polygonArea(points: Pt[]) {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length]
    sum += points[i].x * next.y - next.x * points[i].y
  }
  return Math.abs(sum) / 2
}

/** Spread the real 55,000-seat capacity across the fan in proportion to each wedge. */
function assignCapacity(blocks: PhBlock[], target: number) {
  const areas = blocks.map((block) => polygonArea(block.points))
  const areaSum = areas.reduce((sum, area) => sum + area, 0) || 1
  const caps = areas.map((area) => Math.max(1, Math.floor((area / areaSum) * target)))
  let drift = target - caps.reduce((sum, count) => sum + count, 0)
  const order = caps.map((_, index) => index).sort((a, b) => areas[b] - areas[a])
  let cursor = 0
  while (drift > 0) {
    caps[order[cursor % order.length]] += 1
    drift -= 1
    cursor += 1
  }
  while (drift < 0) {
    const index = order[cursor % order.length]
    if (caps[index] > 1) {
      caps[index] -= 1
      drift += 1
    }
    cursor += 1
  }
  blocks.forEach((block, index) => {
    block.capacity = caps[index]
  })
}

export const PH_BLOCKS: PhBlock[] = buildBlocks()

export const PH_CAPACITY = PH_BLOCKS.reduce((sum, block) => sum + block.capacity, 0)

export function phBlockByKey(key: string) {
  return PH_BLOCKS.find((block) => block.key === key)
}

export function phLevelName(block: PhBlock) {
  if (block.key === 'ph-vip') return 'VIP floor'
  if (block.key === 'ph-red') return 'Red Zone'
  if (block.key.startsWith('ph-100')) return 'Lower box'
  if (block.key.startsWith('ph-200')) return 'Upper box A'
  if (block.key.startsWith('ph-300')) return 'Upper box B'
  return 'Gen Ad'
}

export function phLabel(points: Pt[]) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
