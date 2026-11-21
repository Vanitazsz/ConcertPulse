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
  total: number
  createdAt: string
}
