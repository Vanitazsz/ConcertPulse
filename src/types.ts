export type TierId = 'svip' | 'lower-left' | 'lower-center' | 'lower-right' | 'upper-left' | 'upper-center' | 'upper-right' | 'ga'

export interface Tier {
  id: TierId
  name: string
  section: string
  price: number
  stock: number
  total: number
  elevation: string
  position: [number, number, number]
  soldSeatIds?: string[]
}

export interface Concert {
  id: string
  artist: string
  title: string
  date: string
  venue: string
  doors: string
  accent: string
  secondary: string
  tag: string
  tiers: Tier[]
}

export interface SeatSpot {
  id: string
  label: string
  row: number
  col: number
  available: boolean
  /** Chart coordinates — pick-a-seat footprint matches the section map */
  mapX: number
  mapY: number
}

export type PaymentId = 'cash' | 'gcash' | 'bank' | 'card'

export interface Reservation {
  id: string
  concertId: string
  concertName: string
  date: string
  venue: string
  name: string
  email: string
  tierId: TierId
  tierName: string
  section: string
  quantity: number
  seatIds?: string[]
  total: number
  payment: PaymentId
  paid: boolean
  createdAt: string
}

export type BookingStep = 1 | 2 | 3 | 4
