import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Armchair, BadgeCheck, CalendarDays, Check, ChevronDown, Clock3, MapPin, Printer, QrCode, Ticket, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import QRCode from 'qrcode'
import BookingWizard from './BookingWizard'
import LandingPage from './LandingPage'
import { formatPeso, initialConcerts } from './data'
import type { Concert, Reservation, TierId } from './types'

const STORAGE_KEY = 'vybe-state-v1'
const eventPalette: Record<string, { accent: string; secondary: string }> = {
  bini: { accent: '#F76C6C', secondary: '#F8E9A1' },
  niki: { accent: '#A8D0E6', secondary: '#374785' },
  sabrina: { accent: '#F9A8D4', secondary: '#7C3AED' },
  weeknd: { accent: '#F43F5E', secondary: '#111827' },
  billie: { accent: '#86EFAC', secondary: '#14532D' },
  benandben: { accent: '#F8E9A1', secondary: '#F76C6C' },
  olivia: { accent: '#C4B5FD', secondary: '#DB2777' },
  bruno: { accent: '#FBBF24', secondary: '#7C2D12' },
  coldplay: { accent: '#F76C6C', secondary: '#A8D0E6' },
  dojacat: { accent: '#FB7185', secondary: '#3B0764' },
  chaseatlantic: { accent: '#A8D0E6', secondary: '#F76C6C' },
  tameimpala: { accent: '#67E8F9', secondary: '#312E81' },
  'wave-to-earth': { accent: '#F8E9A1', secondary: '#A8D0E6' },
}
const retiredConcertIds = new Set(['bini'])

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('pulsetix-state-v1')
    if (!raw) return { concerts: initialConcerts, reservations: [] as Reservation[] }
    const value = JSON.parse(raw) as { concerts?: Concert[]; reservations?: Reservation[] }
    const savedConcerts = Array.isArray(value.concerts) ? value.concerts : initialConcerts
    const concerts = initialConcerts.map((current) => {
      const saved = savedConcerts.find((item) => item.id === current.id)
      if (!saved) return current
      return {
        ...current,
        tiers: current.tiers.map((tier) => {
          const savedTier = saved.tiers.find((item) => item.id === tier.id)
          return savedTier
            ? {
                ...tier,
                stock: savedTier.total > 0 && savedTier.total !== tier.total
                  ? Math.max(0, Math.min(tier.total, Math.round(tier.total * (savedTier.stock / savedTier.total))))
                  : Math.max(0, Math.min(tier.total, savedTier.stock)),
                soldSeatIds: savedTier.soldSeatIds ?? [],
              }
            : tier
        }),
      }
    })
    const additionalConcerts = savedConcerts
      .filter((saved) => !initialConcerts.some((item) => item.id === saved.id))
      .map((concert) => ({ ...concert, ...(eventPalette[concert.id] ?? {}) }))
    return {
      concerts: [...concerts, ...additionalConcerts],
      reservations: Array.isArray(value.reservations) ? value.reservations : [],
    }
  } catch {
    return { concerts: initialConcerts, reservations: [] as Reservation[] }
  }
}

function newReference(existing: Reservation[]) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const create = () => {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    return `TIX-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`
  }
  let id = create()
  while (existing.some((reservation) => reservation.id === id)) id = create()
  return id
}

function QRGraphic({ value, small = false }: { value: string; small?: boolean }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let mounted = true
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#09090b', light: '#ffffff' } })
      .then((result) => { if (mounted) setSvg(result) })
      .catch(() => { if (mounted) setSvg('') })
    return () => { mounted = false }
  }, [value])
  return <div className={small ? 'qr-code qr-small' : 'qr-code'} role="img" aria-label={`Ticket QR for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

function TicketModal({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-title">
        <header className="ticket-header">
          <div className="ticket-brand"><span className="brand-mark mini-mark">V</span><span>VYBE <i>LIVE ACCESS</i></span></div>
          <span className="ticket-type"><Ticket size={13} /> PRINT READY E-TICKET</span>
          <button className="icon-button modal-close" onClick={onClose} aria-label="Close ticket"><X size={18} /></button>
        </header>
        <div className="ticket-intro">
          <div className="ticket-success"><span className="success-orbit"><Check size={17} /></span><span>RESERVATION CONFIRMED</span></div>
          <h2 id="ticket-title">Your night starts here.</h2>
          <p className="ticket-event-name">{reservation.concertName}</p>
        </div>
        <div className="ticket-content">
          <div className="ticket-main">
            <div className="ticket-art">
              <span className="ticket-art-glow" />
              <span className="ticket-art-word">LIVE<br /><b>LOUD.</b></span>
              <div className="ticket-art-details"><span><CalendarDays size={16} /> {reservation.date}</span><span><MapPin size={16} /> {reservation.venue}</span></div>
              <span className="ticket-art-code">VYBE&nbsp; / &nbsp;LIVE ACCESS</span>
            </div>
            <div className="ticket-meta">
              <div><span>ATTENDEE</span><strong><UserRound size={18} /> {reservation.name}</strong></div>
              <div><span>SECTION</span><strong><Armchair size={18} /> {reservation.tierName} · {reservation.section}</strong></div>
              <div><span>ADMIT</span><strong><UsersRound size={18} /> {reservation.quantity} {reservation.quantity === 1 ? 'GUEST' : 'GUESTS'}</strong></div>
              <div><span>SEATS</span><strong>{reservation.seatIds?.length ? reservation.seatIds.map((id) => id.split('-').pop()).join(', ') : 'Standing / GA'}</strong></div>
              <div><span>TOTAL PAID</span><strong className="tabular-nums">{formatPeso(reservation.total)}</strong></div>
            </div>
          </div>
          <aside className="ticket-stub">
            <div className="ticket-reference"><span>BOOKING REFERENCE</span><strong>{reservation.id}</strong><small>Show this code at the gate</small></div>
            <div className="ticket-qr-block"><QRGraphic value={reservation.id} /><span>SCAN AT ENTRY</span></div>
          </aside>
        </div>
        <footer className="ticket-footer">
          <p className="ticket-footnote"><BadgeCheck size={18} /> Keep your pass ready at the gate.</p>
          <button className="ticket-print-button" onClick={() => window.print()}><Printer size={18} /> Print ticket</button>
        </footer>
      </section>
    </div>
  )
}

export default function App() {
  const saved = useMemo(readSaved, [])
  const [concerts, setConcerts] = useState<Concert[]>(saved.concerts)
  const [reservations, setReservations] = useState<Reservation[]>(saved.reservations)
  const [tab, setTab] = useState<'book' | 'reservations'>('book')
  const [screen, setScreen] = useState<'landing' | 'book'>('landing')
  const [wizardKey, setWizardKey] = useState(0)
  const [fullName, setFullName] = useState('')
  const [activeTicket, setActiveTicket] = useState<Reservation | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)

  const selectableConcerts = concerts.filter((item) => !retiredConcertIds.has(item.id))
  const [theme, setTheme] = useState(() => {
    const opening = selectableConcerts.find((item) => item.id === 'bruno') ?? selectableConcerts[0]
    return {
      accent: opening?.accent ?? '#FBBF24',
      secondary: opening?.secondary ?? '#7C2D12',
    }
  })
  const handleConcertChange = useCallback((concert: Concert) => {
    setTheme({ accent: concert.accent, secondary: concert.secondary })
  }, [])
  const totalTickets = reservations.length
  const confirmedTickets = reservations.filter((item) => item.paid).length
  const awaitingTickets = totalTickets - confirmedTickets

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ concerts, reservations }))
  }, [concerts, reservations])

  useEffect(() => {
    const lock = screen === 'landing' || (screen === 'book' && tab === 'book')
    document.body.style.overflow = lock ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [screen, tab])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveTicket(null)
        setCancelId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const handleReserve = (payload: {
    concertId: string
    tierId: TierId
    quantity: number
    seatIds?: string[]
    name: string
    email: string
    total: number
    payment: Reservation['payment']
  }): Reservation | string => {
    const concert = concerts.find((item) => item.id === payload.concertId)
    const tier = concert?.tiers.find((item) => item.id === payload.tierId)
    if (!concert || !tier) return 'Concert or section not found.'
    if (tier.stock < payload.quantity) return 'Not enough seats left in that section.'

    const reservation: Reservation = {
      id: newReference(reservations),
      concertId: concert.id,
      concertName: concert.title,
      date: concert.date,
      venue: concert.venue,
      name: payload.name,
      email: payload.email,
      tierId: tier.id,
      tierName: tier.name,
      section: tier.section,
      quantity: payload.quantity,
      seatIds: payload.seatIds,
      total: payload.total,
      payment: payload.payment,
      paid: false,
      createdAt: new Date().toISOString(),
    }

    setConcerts((current) => current.map((item) => {
      if (item.id !== concert.id) return item
      return {
        ...item,
        tiers: item.tiers.map((entry) => {
          if (entry.id !== tier.id) return entry
          return {
            ...entry,
            stock: entry.stock - payload.quantity,
            soldSeatIds: [...(entry.soldSeatIds ?? []), ...(payload.seatIds ?? [])],
          }
        }),
      }
    }))
    setReservations((current) => [reservation, ...current])
    setFullName(payload.name)
    setTab('reservations')
    setWizardKey((value) => value + 1)
    return reservation
  }

  const markPaid = (id: string) => {
    const reservation = reservations.find((item) => item.id === id)
    if (!reservation || reservation.paid) return
    const paid = { ...reservation, paid: true }
    setReservations((current) => current.map((item) => (item.id === id ? paid : item)))
    setActiveTicket(paid)
  }

  const cancelReservation = () => {
    const reservation = reservations.find((item) => item.id === cancelId)
    if (!reservation) return
    setConcerts((current) => current.map((item) => {
      if (item.id !== reservation.concertId) return item
      return {
        ...item,
        tiers: item.tiers.map((tier) => {
          if (tier.id !== reservation.tierId) return tier
          const released = new Set(reservation.seatIds ?? [])
          return {
            ...tier,
            stock: Math.min(tier.total, tier.stock + reservation.quantity),
            soldSeatIds: (tier.soldSeatIds ?? []).filter((id) => !released.has(id)),
          }
        }),
      }
    }))
    setReservations((current) => current.filter((item) => item.id !== reservation.id))
    setCancelId(null)
  }

  return (
    <div
      className={`app-shell booking-shell ${screen === 'book' && tab === 'book' ? 'booking-mode' : ''}`}
      style={{ '--accent': theme.accent, '--secondary': theme.secondary } as React.CSSProperties}
    >
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <LandingPage
            key="landing"
            onChooseConcert={() => {
              setTab('book')
              setScreen('book')
            }}
          />
        )}
      </AnimatePresence>

      <header className={`topbar ${screen === 'book' ? 'booking-enter' : ''}`}>
        <a
          className="brand"
          href="#top"
          aria-label="VYBE home"
          onClick={(event) => {
            event.preventDefault()
            setScreen('landing')
          }}
        >
          <span className="brand-mark">V</span>
          <span>VYBE<span className="brand-dot">.</span><small>LIVE FROM HERE</small></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> BOX OFFICE <span className="topbar-divider">/</span> MANILA, PH</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={tab === 'book' ? 'nav-active' : ''} onClick={() => { setTab('book'); setScreen('book') }}>
            <Ticket size={15} /> Book tickets
          </button>
          <button className={tab === 'reservations' ? 'nav-active' : ''} onClick={() => { setTab('reservations'); setScreen('book') }}>
            <Ticket size={15} /> My reservations
            {totalTickets > 0 && <span className="nav-count">{totalTickets}</span>}
          </button>
        </nav>
        <button className="profile-chip" title={fullName || 'Guest profile'}>
          <span className="profile-avatar">{fullName ? fullName.trim().slice(0, 1).toUpperCase() : 'G'}</span>
          <span>{fullName ? fullName.split(' ')[0] : 'Guest'}</span>
          <ChevronDown size={13} />
        </button>
      </header>

      <main id="top" className={screen === 'book' ? 'booking-enter' : undefined}>
        {tab === 'book' ? (
          <BookingWizard key={wizardKey} concerts={selectableConcerts} onConcertChange={handleConcertChange} onReserve={handleReserve} />
        ) : (
          <section className="reservations-page">
            <div className="reservations-heading">
              <div>
                <span className="eyebrow accent-eyebrow"><span className="live-dot" /> YOUR VYBE</span>
                <h1>The nights you’ve <em>locked in.</em></h1>
                <p>Your passes are ready when you are.</p>
              </div>
              <div className="reservation-total">
                <Ticket size={17} />
                <span>
                  <strong>{confirmedTickets > 0 ? confirmedTickets : awaitingTickets}</strong>
                  <small>{confirmedTickets > 0 ? 'CONFIRMED TICKETS' : 'AWAITING PAYMENT'}</small>
                </span>
              </div>
            </div>

            {reservations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-ticket"><Ticket size={32} /></div>
                <span className="eyebrow">NOTHING ON THE CALENDAR (YET)</span>
                <h2>Big nights are waiting.</h2>
                <p>Reserve a show to see your e-tickets here.</p>
                <button className="reserve-button" onClick={() => setTab('book')}>Book a concert</button>
              </div>
            ) : (
              <div className="reservation-list">
                {reservations.map((reservation) => (
                  <article
                    className={`reservation-card${reservation.paid ? '' : ' is-unpaid'}`}
                    key={reservation.id}
                    style={{ '--ticket-accent': concerts.find((item) => item.id === reservation.concertId)?.accent ?? '#A8D0E6' } as React.CSSProperties}
                  >
                    <div className="reservation-art">
                      <span>LIVE<br /><b>LOUD.</b></span>
                    </div>
                    <div className="reservation-details">
                      <div className="reservation-status">
                        <span><span className="live-dot" /> {reservation.paid ? 'Confirmed' : 'Awaiting payment'}</span>
                        <span>{reservation.id}</span>
                      </div>
                      <h2>{reservation.concertName}</h2>
                      <ul className="reservation-facts">
                        <li><CalendarDays size={15} /> {reservation.date}</li>
                        <li><MapPin size={15} /> {reservation.venue}</li>
                        <li><Armchair size={15} /> {reservation.tierName} · {reservation.section}</li>
                        <li><UsersRound size={15} /> {reservation.seatIds?.length ? reservation.seatIds.map((id) => id.split('-').pop()).join(', ') : `${reservation.quantity} tickets`}</li>
                      </ul>
                      <div className="reservation-bottom">
                        <span>{reservation.paid ? 'Paid' : 'Due'} <strong className="tabular-nums">{formatPeso(reservation.total)}</strong></span>
                        <small>{reservation.payment === 'gcash' ? 'GCash' : reservation.payment === 'bank' ? 'Bank transfer' : reservation.payment === 'card' ? 'Card' : 'Cash'} · {reservation.name}</small>
                      </div>
                    </div>
                    <div className="reservation-side">
                      {reservation.paid ? (
                        <div className="reservation-qr">
                          <QRGraphic value={reservation.id} small />
                          <span>Scan at gate</span>
                        </div>
                      ) : (
                        <div className="reservation-qr is-locked">
                          <span>Pass unlocks after payment</span>
                        </div>
                      )}
                      <div className="reservation-actions">
                        {reservation.paid ? (
                          <button onClick={() => setActiveTicket(reservation)}><QrCode size={14} /> Open pass</button>
                        ) : (
                          <button onClick={() => markPaid(reservation.id)}><BadgeCheck size={14} /> Pay now</button>
                        )}
                        <button className="cancel-link" onClick={() => setCancelId(reservation.id)}><Trash2 size={14} /> Cancel</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!(screen === 'book' && tab === 'book') && (
          <footer className="site-footer">
            <span><span className="brand-mark mini-mark">V</span> VYBE <i>© 2026</i></span>
            <span>MAKE IT A NIGHT TO REMEMBER.</span>
            <span><Clock3 size={12} /> BOX OFFICE OPEN <b>24/7</b></span>
          </footer>
        )}
      </main>

      {activeTicket && <TicketModal reservation={activeTicket} onClose={() => setActiveTicket(null)} />}
      {cancelId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelId(null) }}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
            <button className="icon-button modal-close" onClick={() => setCancelId(null)} aria-label="Close dialog"><X size={18} /></button>
            <div className="confirm-icon"><Trash2 size={20} /></div>
            <span className="eyebrow">CHANGE OF PLANS?</span>
            <h2 id="cancel-title">Cancel this reservation?</h2>
            <p>Your tickets will be released back to inventory.</p>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setCancelId(null)}>Keep my tickets</button>
              <button className="danger-button" onClick={cancelReservation}>Yes, cancel reservation</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
