import type { Concert, Tier } from './types'

const makeTiers = (modifier = 0): Tier[] => [
  { id: 'svip', name: 'SVIP Standing Pit', section: 'Pit A', price: 12800, stock: 4 - modifier, total: 4, elevation: 'Floor', position: [0, 1.1, -1.9] },
  { id: 'lower-left', name: 'Lower Box', section: 'Left Wing', price: 8800, stock: 18 - modifier, total: 18, elevation: 'Mid-tier', position: [-7.4, 3.7, 4.8] },
  { id: 'lower-center', name: 'Lower Box', section: 'Center', price: 10800, stock: 12 - modifier, total: 12, elevation: 'Mid-tier', position: [0, 3.8, 5.7] },
  { id: 'lower-right', name: 'Lower Box', section: 'Right Wing', price: 8800, stock: 18 - modifier, total: 18, elevation: 'Mid-tier', position: [7.4, 3.7, 4.8] },
  { id: 'upper-left', name: 'Upper Box', section: 'Left Wing', price: 5800, stock: 32 - modifier, total: 32, elevation: 'Upper tier', position: [-8.1, 6.4, 12.6] },
  { id: 'upper-center', name: 'Upper Box', section: 'Center', price: 6800, stock: 24 - modifier, total: 24, elevation: 'Upper tier', position: [0, 6.7, 13.7] },
  { id: 'upper-right', name: 'Upper Box', section: 'Right Wing', price: 5800, stock: 32 - modifier, total: 32, elevation: 'Upper tier', position: [8.1, 6.4, 12.6] },
  { id: 'ga', name: 'General Admission', section: 'Grandstand', price: 2800, stock: 86 - modifier * 2, total: 86, elevation: 'Panoramic', position: [0, 8.9, 19.3] },
]

export const initialConcerts: Concert[] = [
  {
    id: 'niki', artist: 'NIKI', title: 'Buzz World Tour', date: 'SAT, JAN 23 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#A8D0E6', secondary: '#374785', tag: 'JUST ANNOUNCED', tiers: makeTiers(0),
  },
  {
    id: 'benandben', artist: 'BEN&BEN', title: 'The Traveller Across Dimensions', date: 'SUN, FEB 07 2027 · 7:00 PM', venue: 'Araneta Coliseum · Quezon City', doors: 'Doors open 5:30 PM', accent: '#F8E9A1', secondary: '#F76C6C', tag: 'FEW DATES LEFT', tiers: makeTiers(1),
  },
  {
    id: 'coldplay', artist: 'COLDPLAY', title: 'Live in Manila', date: 'FRI, MAR 19 2027 · 7:30 PM', venue: 'Philippine Arena · Bulacan', doors: 'Doors open 5:00 PM', accent: '#F76C6C', secondary: '#A8D0E6', tag: 'DEMO LISTING', tiers: makeTiers(0),
  },
  {
    id: 'chaseatlantic', artist: 'CHASE ATLANTIC', title: 'Live in Manila', date: 'FRI, APR 09 2027 · 8:00 PM', venue: 'SM Mall of Asia Arena · Pasay', doors: 'Doors open 6:00 PM', accent: '#A8D0E6', secondary: '#F76C6C', tag: 'DEMO LISTING', tiers: makeTiers(2),
  },
  {
    id: 'wave-to-earth', artist: 'wave to earth', title: 'Live in Manila', date: 'SAT, MAY 01 2027 · 7:00 PM', venue: 'Araneta Coliseum · Quezon City', doors: 'Doors open 5:30 PM', accent: '#F8E9A1', secondary: '#A8D0E6', tag: 'DEMO LISTING', tiers: makeTiers(0),
  },
]

export const formatPeso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`

