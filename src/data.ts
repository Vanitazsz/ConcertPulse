import { ARENA_BLOCKS, ARENA_CAPACITY } from './arenaGeometry'
import { PH_BLOCKS } from './philippineGeometry'
import type { Concert, Tier, TierId } from './types'

export { ARENA_CAPACITY }

function tierTotal(blocks: { id: TierId; capacity: number }[], id: TierId) {
  return blocks.filter((block) => block.id === id).reduce((sum, block) => sum + block.capacity, 0)
}

const makeTiers = (modifier = 0, blocks: { id: TierId; capacity: number }[] = ARENA_BLOCKS): Tier[] => {
  const svip = tierTotal(blocks, 'svip')
  const lowerL = tierTotal(blocks, 'lower-left')
  const lowerC = tierTotal(blocks, 'lower-center')
  const lowerR = tierTotal(blocks, 'lower-right')
  const upperL = tierTotal(blocks, 'upper-left')
  const upperC = tierTotal(blocks, 'upper-center')
  const upperR = tierTotal(blocks, 'upper-right')
  const ga = tierTotal(blocks, 'ga')

  return [
    { id: 'svip', name: 'Patron / SVIP Pit', section: 'Standing', price: 12800, stock: Math.max(0, svip - modifier), total: svip, elevation: 'Floor', position: [0, 1.1, -1.9] },
    { id: 'lower-left', name: 'Lower Box', section: 'Left Wing', price: 8800, stock: Math.max(0, lowerL - modifier), total: lowerL, elevation: 'Mid-tier', position: [-7.4, 3.7, 4.8] },
    { id: 'lower-center', name: 'Lower Box', section: 'Center', price: 10800, stock: Math.max(0, lowerC - modifier), total: lowerC, elevation: 'Mid-tier', position: [0, 3.8, 5.7] },
    { id: 'lower-right', name: 'Lower Box', section: 'Right Wing', price: 8800, stock: Math.max(0, lowerR - modifier), total: lowerR, elevation: 'Mid-tier', position: [7.4, 3.7, 4.8] },
    { id: 'upper-left', name: 'Upper Box', section: 'Left Wing', price: 5800, stock: Math.max(0, upperL - modifier), total: upperL, elevation: 'Upper tier', position: [-8.1, 6.4, 12.6] },
    { id: 'upper-center', name: 'Upper Box', section: 'Center', price: 6800, stock: Math.max(0, upperC - modifier), total: upperC, elevation: 'Upper tier', position: [0, 6.7, 13.7] },
    { id: 'upper-right', name: 'Upper Box', section: 'Right Wing', price: 5800, stock: Math.max(0, upperR - modifier), total: upperR, elevation: 'Upper tier', position: [8.1, 6.4, 12.6] },
    { id: 'ga', name: 'General Admission', section: 'Grandstand', price: 2800, stock: Math.max(0, ga - modifier * 2), total: ga, elevation: 'Panoramic', position: [0, 8.9, 19.3] },
  ]
}

export const initialConcerts: Concert[] = [
  {
    id: 'niki', artist: 'NIKI', title: 'Buzz World Tour', date: 'SAT, JAN 23 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#A8D0E6', secondary: '#374785', tag: 'JUST ANNOUNCED', tiers: makeTiers(0),
  },
  {
    id: 'sabrina', artist: 'SABRINA CARPENTER', title: 'Short n’ Sweet Tour', date: 'FRI, FEB 12 2027 · 8:00 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 5:30 PM', accent: '#F9A8D4', secondary: '#7C3AED', tag: 'HOT TICKET', tiers: makeTiers(1, PH_BLOCKS),
  },
  {
    id: 'weeknd', artist: 'THE WEEKND', title: 'After Hours Til Dawn', date: 'SAT, FEB 27 2027 · 8:30 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 5:00 PM', accent: '#F43F5E', secondary: '#111827', tag: 'WORLD TOUR', tiers: makeTiers(0, PH_BLOCKS),
  },
  {
    id: 'billie', artist: 'BILLIE EILISH', title: 'Hit Me Hard and Soft', date: 'SUN, MAR 14 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#86EFAC', secondary: '#14532D', tag: 'SELLING FAST', tiers: makeTiers(2),
  },
  {
    id: 'benandben', artist: 'BEN&BEN', title: 'The Traveller Across Dimensions', date: 'SUN, MAR 28 2027 · 7:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 5:30 PM', accent: '#F8E9A1', secondary: '#F76C6C', tag: 'FEW DATES LEFT', tiers: makeTiers(1),
  },
  {
    id: 'olivia', artist: 'OLIVIA RODRIGO', title: 'GUTS World Tour', date: 'FRI, APR 09 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#C4B5FD', secondary: '#DB2777', tag: 'JUST ANNOUNCED', tiers: makeTiers(0),
  },
  {
    id: 'bruno', artist: 'BRUNO MARS', title: 'Live in Manila', date: 'SAT, APR 24 2027 · 8:00 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 5:00 PM', accent: '#FBBF24', secondary: '#7C2D12', tag: 'LIMITED RUN', tiers: makeTiers(1, PH_BLOCKS),
  },
  {
    id: 'coldplay', artist: 'COLDPLAY', title: 'Music of the Spheres', date: 'FRI, MAY 07 2027 · 7:30 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 5:00 PM', accent: '#F76C6C', secondary: '#A8D0E6', tag: 'STADIUM NIGHT', tiers: makeTiers(0, PH_BLOCKS),
  },
  {
    id: 'dojacat', artist: 'DOJA CAT', title: 'Scarlet Tour', date: 'SAT, MAY 22 2027 · 8:30 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 6:00 PM', accent: '#FB7185', secondary: '#3B0764', tag: 'DEMO LISTING', tiers: makeTiers(2, PH_BLOCKS),
  },
  {
    id: 'chaseatlantic', artist: 'CHASE ATLANTIC', title: 'Live in Manila', date: 'FRI, JUN 11 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#A8D0E6', secondary: '#F76C6C', tag: 'DEMO LISTING', tiers: makeTiers(2),
  },
  {
    id: 'tameimpala', artist: 'TAME IMPALA', title: 'Deadbeat Tour', date: 'SAT, JUN 26 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#67E8F9', secondary: '#312E81', tag: 'JUST ANNOUNCED', tiers: makeTiers(0),
  },
  {
    id: 'wave-to-earth', artist: 'wave to earth', title: 'Live in Manila', date: 'SAT, JUL 10 2027 · 7:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 5:30 PM', accent: '#F8E9A1', secondary: '#A8D0E6', tag: 'DEMO LISTING', tiers: makeTiers(0),
  },
]

const SHOW_IDS = ['niki', 'sabrina', 'weeknd', 'billie', 'benandben', 'olivia', 'bruno', 'coldplay', 'dojacat', 'chaseatlantic', 'tameimpala', 'wave-to-earth'] as const

export const SHOW_STILLS: Record<string, string[]> = Object.fromEntries(
  SHOW_IDS.map((id) => [id, [1, 2, 3, 4].map((shot) => `/shows/${id}-${shot}.jpg`)]),
)

export function formatPeso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}
