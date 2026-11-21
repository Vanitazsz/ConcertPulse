import { useEffect, useMemo, useState } from 'react'
import { Armchair, ArrowDownRight, ArrowUpRight, BadgeCheck, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock3, Compass, CreditCard, Eye, MapPin, Minus, Plus, QrCode, RotateCcw, Ticket, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import QRCode from 'qrcode'
import Arena3DViewer from './Arena3DViewer'
import { formatPeso, initialConcerts } from './data'
import type { Concert, Reservation, Tier, TierId } from './types'

const STORAGE_KEY = 'pulsetix-state-v1'
const SERVICE_FEE = 150
const eventPalette: Record<string, { accent: string; secondary: string }> = {
  bini: { accent: '#F76C6C', secondary: '#F8E9A1' },
  niki: { accent: '#A8D0E6', secondary: '#374785' },
  benandben: { accent: '#F8E9A1', secondary: '#F76C6C' },
  coldplay: { accent: '#F76C6C', secondary: '#A8D0E6' },
  chaseatlantic: { accent: '#A8D0E6', secondary: '#F76C6C' },
  'wave-to-earth': { accent: '#F8E9A1', secondary: '#A8D0E6' },
}
const retiredConcertIds = new Set(['bini'])

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
          return savedTier ? { ...tier, stock: Math.max(0, Math.min(tier.total, savedTier.stock)) } : tier
        }),
      }
    })
    const additionalConcerts = savedConcerts.filter((saved) => !initialConcerts.some((item) => item.id === saved.id)).map((concert) => ({
      ...concert,
      ...(eventPalette[concert.id] ?? {}),
    }))
    return {
      concerts: [...concerts, ...additionalConcerts],
      reservations: Array.isArray(value.reservations) ? value.reservations : [],
    }
  } catch {
    return { concerts: initialConcerts, reservations: [] as Reservation[] }
  }
}

function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
function isValidName(value: string) { return value.trim().length >= 2 }
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
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close ticket"><X size={18} /></button>
      <div className="ticket-brand"><span className="brand-mark mini-mark">P</span><span>PULSETIX <i>LIVE ACCESS</i></span></div>
      <div className="ticket-success"><span className="success-orbit"><Check size={21} /></span><span>YOU’RE ON THE LIST</span></div>
      <h2 id="ticket-title">Your night starts here.</h2>
      <p className="ticket-event-name">{reservation.concertName}</p>
      <div className="ticket-art"><span className="ticket-art-glow" /><span className="ticket-art-word">LIVE<br /><b>LOUD.</b></span><span className="ticket-art-date">{reservation.date.split(' · ')[0]}</span><span className="ticket-art-code">PTX&nbsp; / &nbsp;2026</span></div>
      <div className="ticket-meta">
        <div><span>ATTENDEE</span><strong><UserRound size={14} /> {reservation.name}</strong></div>
        <div><span>SECTION</span><strong><Armchair size={14} /> {reservation.tierName} · {reservation.section}</strong></div>
        <div><span>ADMIT</span><strong><UsersRound size={14} /> {reservation.quantity} {reservation.quantity === 1 ? 'GUEST' : 'GUESTS'}</strong></div>
        <div><span>PAID</span><strong className="tabular-nums">{formatPeso(reservation.total)}</strong></div>
      </div>
      <div className="ticket-stub">
        <div className="ticket-reference"><span>BOOKING REFERENCE</span><strong>{reservation.id}</strong><small>{reservation.date} · {reservation.venue}</small></div>
        <QRGraphic value={reservation.id} />
      </div>
      <p className="ticket-footnote"><BadgeCheck size={14} /> Keep this pass ready at the gate. Screenshot for offline access.</p>
    </section>
  </div>
}

function EventCard({ concert, active, onClick }: { concert: Concert; active: boolean; onClick: () => void }) {
  const logoClass = concert.id === 'chaseatlantic' ? 'artist-compact' : concert.id === 'wave-to-earth' ? 'artist-wave' : ''
  return <button className={`event-card ${active ? 'event-active' : ''}`} onClick={onClick} style={{ '--event-accent': concert.accent, '--event-secondary': concert.secondary } as React.CSSProperties}>
    <div className="event-visual"><span className="event-scanlines" /><span className="event-orb" /><span className={`event-artist ${logoClass}`}>{concert.id === 'chaseatlantic' ? <>CHASE<br />ATLANTIC</> : concert.id === 'wave-to-earth' ? <>wave to<br />earth</> : concert.artist}</span><span className="event-tag">{concert.tag}</span></div>
    <div className="event-info"><strong>{concert.title}</strong><span><CalendarDays size={12} /> {concert.date}</span><span><MapPin size={12} /> {concert.venue}</span></div>
    {active && <span className="event-check"><Check size={12} /></span>}
  </button>
}

function StockLabel({ tier }: { tier: Tier }) {
  const low = tier.stock <= 5
  return <span className={`stock-label ${low ? 'stock-low' : ''}`}><i />{tier.stock === 0 ? 'SOLD OUT' : low ? `ONLY ${tier.stock} LEFT` : `${tier.stock} AVAILABLE`}</span>
}

export default function App() {
  const saved = useMemo(readSaved, [])
  const [concerts, setConcerts] = useState<Concert[]>(saved.concerts)
  const [reservations, setReservations] = useState<Reservation[]>(saved.reservations)
  const [concertId, setConcertId] = useState(saved.concerts.find((item) => !retiredConcertIds.has(item.id))?.id ?? saved.concerts[0]?.id ?? 'niki')
  const [selectedTier, setSelectedTier] = useState<TierId>('lower-center')
  const [tab, setTab] = useState<'book' | 'reservations'>('book')
  const [mode, setMode] = useState<'overview' | 'pov'>('overview')
  const [angle, setAngle] = useState<'left' | 'center' | 'right'>('center')
  const [hoveredTier, setHoveredTier] = useState<TierId | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [touched, setTouched] = useState({ name: false, email: false })
  const [bannerError, setBannerError] = useState('')
  const [activeTicket, setActiveTicket] = useState<Reservation | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ concerts, reservations })) }, [concerts, reservations])

  const selectableConcerts = concerts.filter((item) => !retiredConcertIds.has(item.id))
  const concert = concerts.find((item) => item.id === concertId) ?? selectableConcerts[0] ?? concerts[0]
  const tier = concert.tiers.find((item) => item.id === selectedTier) ?? concert.tiers[0]
  const displayTierId = hoveredTier ?? selectedTier
  const displayTier = concert.tiers.find((item) => item.id === displayTierId) ?? tier
  const maxQuantity = Math.max(1, Math.min(6, tier.stock))
  const validName = isValidName(fullName)
  const validEmail = isValidEmail(email)
  const amount = tier.price * quantity
  const total = amount + SERVICE_FEE
  const totalTickets = reservations.reduce((sum, item) => sum + item.quantity, 0)

  useEffect(() => { setQuantity((current) => Math.max(1, Math.min(current, maxQuantity))) }, [maxQuantity])
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setActiveTicket(null); setCancelId(null) } }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const chooseTier = (id: TierId) => {
    setSelectedTier(id)
    setQuantity(1)
    setHoveredTier(null)
    setBannerError('')
  }
  const changeConcert = (id: string) => {
    const next = concerts.find((item) => item.id === id)
    setConcertId(id)
    if (next && !next.tiers.some((item) => item.id === selectedTier)) setSelectedTier('lower-center')
    setBannerError('')
    setMode('overview')
  }
  const submitReservation = () => {
    setTouched({ name: true, email: true })
    if (!validName || !validEmail) { setBannerError('Add a valid name and email to continue.'); return }
    if (tier.stock < quantity || tier.stock <= 0) { setBannerError('That section just sold out. Choose another tier to continue.'); return }
    const reservation: Reservation = {
      id: newReference(reservations), concertId: concert.id, concertName: concert.title, date: concert.date, venue: concert.venue,
      name: fullName.trim(), email: email.trim(), tierId: tier.id, tierName: tier.name, section: tier.section,
      quantity, total, createdAt: new Date().toISOString(),
    }
    setConcerts((current) => current.map((item) => item.id !== concert.id ? item : ({ ...item, tiers: item.tiers.map((t) => t.id === tier.id ? { ...t, stock: t.stock - quantity } : t) })))
    setReservations((current) => [reservation, ...current])
    setBannerError('')
    setActiveTicket(reservation)
  }
  const cancelReservation = () => {
    const reservation = reservations.find((item) => item.id === cancelId)
    if (!reservation) return
    setConcerts((current) => current.map((item) => item.id !== reservation.concertId ? item : ({ ...item, tiers: item.tiers.map((t) => t.id === reservation.tierId ? { ...t, stock: Math.min(t.total, t.stock + reservation.quantity) } : t) })))
    setReservations((current) => current.filter((item) => item.id !== reservation.id))
    setCancelId(null)
  }

  return <div className="app-shell" style={{ '--accent': concert.accent, '--secondary': concert.secondary } as React.CSSProperties}>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="PULSETIX home"><span className="brand-mark">P</span><span>PULSETIX<span className="brand-dot">.</span><small>LIVE FROM HERE</small></span></a>
      <div className="topbar-center"><span className="live-dot" /> BOX OFFICE <span className="topbar-divider">/</span> MANILA, PH</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={tab === 'book' ? 'nav-active' : ''} onClick={() => setTab('book')}><Compass size={15} /> Book tickets</button>
        <button className={tab === 'reservations' ? 'nav-active' : ''} onClick={() => setTab('reservations')}><Ticket size={15} /> My reservations{totalTickets > 0 && <span className="nav-count">{totalTickets}</span>}</button>
      </nav>
      <button className="profile-chip" title={fullName || 'Guest profile'}><span className="profile-avatar">{fullName ? fullName.trim().slice(0, 1).toUpperCase() : 'G'}</span><span>{fullName ? fullName.split(' ')[0] : 'Guest'}</span><ChevronDown size={13} /></button>
    </header>

    <main id="top">
      <section className="progress-row" aria-label="Reservation progress">
        <div className="progress-copy"><span className="eyebrow">THE LIVE EXPERIENCE</span><span className="progress-sub">Your night. Your view. Your call.</span></div>
        <ol className="steps">
          <li className="step-done"><span className="step-number"><Check size={12} /></span><span>Choose a show</span></li><span className="step-line" />
          <li className={tab === 'book' ? 'step-current' : 'step-done'}><span className="step-number">{tab === 'book' ? '02' : <Check size={12} />}</span><span>Explore your view</span></li><span className="step-line" />
          <li className={tab === 'reservations' ? 'step-current' : ''}><span className="step-number">03</span><span>Your e-ticket</span></li>
        </ol>
      </section>

      <section className="event-strip" aria-label="Choose a concert">
        <div className="strip-label"><span className="eyebrow">ON THE BILL</span><span>Pick your next<br />core memory.</span></div>
        <div className="events-row">{selectableConcerts.map((item) => <EventCard key={item.id} concert={item} active={concert.id === item.id} onClick={() => changeConcert(item.id)} />)}</div>
        <div className="strip-more" aria-hidden="true"><ChevronRight size={18} /></div>
      </section>

      {tab === 'book' ? <section className="booking-grid">
        <div className="experience-column">
          <div className="section-heading"><div><span className="eyebrow accent-eyebrow"><span className="live-dot" /> LIVE SEAT FINDER</span><h1>Find your <em>frequency.</em></h1><p>Pick a section. Feel the room. Find your spot.</p></div><div className="show-meta"><span><CalendarDays size={14} /> {concert.date}</span><span><MapPin size={14} /> {concert.venue}</span></div></div>
          <div className="arena-wrap">
            <div className="arena-hud"><span className="hud-led" /><span>VIEWFINDER <i>/</i> {mode === 'overview' ? 'ARENA OVERVIEW' : 'SEAT POV'}</span><span className="hud-live">LIVE RENDER</span></div>
            <Arena3DViewer tiers={concert.tiers} selected={selectedTier} accent={concert.accent} secondary={concert.secondary} mode={mode} angle={angle} onSelect={chooseTier} onHover={setHoveredTier} />
            <div className="telemetry"><span className="telemetry-icon"><Eye size={14} /></span><span><b>POV: {displayTier.name} {displayTier.section === 'Center' ? 'Center' : `· ${displayTier.section}`}</b><small><span><ArrowDownRight size={11} /> ~{Math.round(Math.sqrt((displayTier.position[0]) ** 2 + (displayTier.position[2] + 12) ** 2))}m to stage</span><i />{displayTier.elevation}<i />Clear sightline</small></span></div>
            <div className="camera-toggle"><button className={mode === 'overview' ? 'camera-active' : ''} onClick={() => setMode('overview')}><Compass size={14} /> Arena overview</button><button className={mode === 'pov' ? 'camera-active' : ''} onClick={() => setMode('pov')}><Eye size={14} /> Seat POV</button></div>
            {mode === 'pov' && <div className="angle-picker"><span>COMPARE ANGLE</span>{(['left', 'center', 'right'] as const).map((position) => <button key={position} className={angle === position ? 'angle-active' : ''} onClick={() => setAngle(position)}>{position === 'left' ? 'Left wing' : position === 'center' ? 'Center stage' : 'Right wing'}</button>)}</div>}
            <div className="arena-hint"><span>DRAG TO ORBIT</span><span>·</span><span>CLICK A SECTION TO SELECT</span></div>
          </div>
          <div className="tier-heading"><div><span className="eyebrow">CHOOSE YOUR VIEW</span><span className="tier-hint"><span className="tier-legend" /> Available seats <i /> <span className="tier-legend legend-selected" /> Selected</span></div><span className="tier-sort">{concert.tiers.length} SECTIONS</span></div>
          <div className="tier-grid">{concert.tiers.map((item) => {
            const active = selectedTier === item.id
            const shortName = item.name === 'Lower Box' || item.name === 'Upper Box' ? `${item.name} ${item.section}` : item.name
            return <button key={item.id} className={`tier-card ${active ? 'tier-selected' : ''} ${item.stock === 0 ? 'tier-soldout' : ''}`} onClick={() => chooseTier(item.id)} disabled={item.stock === 0}>
              <span className="tier-card-top"><span className="tier-spot" /><span className="tier-price">{formatPeso(item.price)}</span></span>
              <strong>{shortName}</strong><span className="tier-card-bottom"><StockLabel tier={item} />{active && <CheckCircle2 size={14} className="selected-check" />}</span>
            </button>
          })}</div>
          <p className="inventory-note"><span className="status-pulse" />Inventory refreshes live as fans book their seats.</p>
        </div>

        <aside className="checkout-column"><div className="checkout-card">
          <div className="checkout-topline"><span className="eyebrow">SECURE YOUR SPOT</span><span className="secure-badge"><span /> SECURE CHECKOUT</span></div>
          <div className="checkout-show"><div className="checkout-thumb" style={{ background: `linear-gradient(140deg, ${concert.accent}, ${concert.secondary})` }}><span>{concert.artist}</span></div><div><strong>{concert.title}</strong><span><CalendarDays size={12} /> {concert.date}</span><span><MapPin size={12} /> {concert.venue}</span></div></div>
          <div className="selected-section"><div className="section-icon"><Armchair size={16} /></div><div><span>YOUR SECTION</span><strong>{tier.name} <i>· {tier.section}</i></strong><small><StockLabel tier={tier} /></small></div><button className="edit-section" onClick={() => document.querySelector('.tier-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>CHANGE</button></div>
          <div className="quantity-row"><div><strong>Tickets</strong><span>Up to 6 per order</span></div><div className="stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Decrease tickets"><Minus size={14} /></button><span className="tabular-nums">{quantity}</span><button onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} aria-label="Increase tickets"><Plus size={14} /></button></div></div>
          <div className="field-group"><label htmlFor="full-name">FULL NAME</label><div className={`input-wrap ${touched.name && !validName ? 'input-error' : ''} ${validName ? 'input-valid' : ''}`}><UserRound size={15} /><input id="full-name" value={fullName} onChange={(event) => { setFullName(event.target.value); setBannerError('') }} onBlur={() => setTouched((value) => ({ ...value, name: true }))} placeholder="e.g. Alex Reyes" autoComplete="name" />{validName && <CheckCircle2 size={15} className="field-check" />}</div>{touched.name && !validName && <small className="field-error">Enter your name as it appears on your ID.</small>}</div>
          <div className="field-group"><label htmlFor="email-address">EMAIL ADDRESS</label><div className={`input-wrap ${touched.email && !validEmail ? 'input-error' : ''} ${validEmail ? 'input-valid' : ''}`}><span className="at-icon">@</span><input id="email-address" value={email} onChange={(event) => { setEmail(event.target.value); setBannerError('') }} onBlur={() => setTouched((value) => ({ ...value, email: true }))} placeholder="you@example.com" autoComplete="email" inputMode="email" />{validEmail && <CheckCircle2 size={15} className="field-check" />}</div>{touched.email && !validEmail && <small className="field-error">Enter a valid email for your e-ticket.</small>}</div>
          <div className="price-breakdown"><div><span>{formatPeso(tier.price)} × {quantity} {quantity === 1 ? 'ticket' : 'tickets'}</span><strong className="tabular-nums">{formatPeso(amount)}</strong></div><div><span>Service fee <i>ⓘ</i></span><strong className="tabular-nums">{formatPeso(SERVICE_FEE)}</strong></div><div className="price-total"><span>Total payable</span><strong className="tabular-nums">{formatPeso(total)}</strong></div></div>
          {bannerError && <div className="error-banner"><CircleAlert size={15} /> {bannerError}</div>}
          <button className="reserve-button" onClick={submitReservation} disabled={tier.stock === 0}>{tier.stock === 0 ? 'SECTION SOLD OUT' : <>Reserve my tickets <ArrowUpRight size={17} /></>}</button>
          <div className="checkout-assurance"><span><CreditCard size={13} /> No payment needed now</span><span><RotateCcw size={13} /> Easy cancellation</span></div>
          <p className="terms-copy">By reserving, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div><div className="help-card"><span className="help-icon">?</span><span><strong>Need a hand?</strong><small>Our box office crew is here for you.</small></span><button onClick={() => setBannerError('Box office support: hello@pulsetix.ph')}>GET HELP <ArrowUpRight size={12} /></button></div></aside>
      </section> : <section className="reservations-page">
        <div className="reservations-heading"><div><span className="eyebrow accent-eyebrow"><span className="live-dot" /> YOUR PULSETIX</span><h1>The nights you’ve <em>locked in.</em></h1><p>Your passes are ready when you are. Bring the QR code to the gate.</p></div><div className="reservation-total"><Ticket size={17} /><span><strong>{totalTickets}</strong><small>CONFIRMED TICKETS</small></span></div></div>
        {reservations.length === 0 ? <div className="empty-state"><div className="empty-ticket"><Ticket size={32} /></div><span className="eyebrow">NOTHING ON THE CALENDAR (YET)</span><h2>Big nights are waiting.</h2><p>Once you reserve a show, your e-tickets will live here.</p><button className="reserve-button" onClick={() => setTab('book')}>Explore upcoming shows <ArrowUpRight size={16} /></button></div> : <div className="reservation-list">{reservations.map((reservation) => <article className="reservation-card" key={reservation.id}>
          <div className="reservation-art" style={{ '--ticket-accent': concerts.find((item) => item.id === reservation.concertId)?.accent ?? '#F76C6C' } as React.CSSProperties}><span>LIVE<br /><b>LOUD.</b></span><small>PTX / 2026</small></div>
          <div className="reservation-details"><div className="reservation-status"><span><span className="live-dot" /> CONFIRMED</span><span>REF. {reservation.id}</span></div><h2>{reservation.concertName}</h2><div className="reservation-facts"><span><CalendarDays size={14} /> {reservation.date}</span><span><MapPin size={14} /> {reservation.venue}</span><span><Armchair size={14} /> {reservation.tierName} · {reservation.section}</span><span><UsersRound size={14} /> {reservation.quantity} {reservation.quantity === 1 ? 'ticket' : 'tickets'}</span></div><div className="reservation-bottom"><span>PAID <strong className="tabular-nums">{formatPeso(reservation.total)}</strong></span><small>Booked for {reservation.name}</small></div></div>
          <div className="reservation-qr"><QRGraphic value={reservation.id} small /><span>SCAN AT GATE</span></div>
          <div className="reservation-actions"><button onClick={() => setActiveTicket(reservation)}><QrCode size={14} /> Open pass</button><button className="cancel-link" onClick={() => setCancelId(reservation.id)}><Trash2 size={14} /> Cancel</button></div>
        </article>)}</div>}
      </section>}

      <footer className="site-footer"><span><span className="brand-mark mini-mark">P</span> PULSETIX <i>© 2026</i></span><span>MAKE IT A NIGHT TO REMEMBER.</span><span><Clock3 size={12} /> BOX OFFICE OPEN <b>24/7</b></span></footer>
    </main>

    {activeTicket && <TicketModal reservation={activeTicket} onClose={() => setActiveTicket(null)} />}
    {cancelId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelId(null) }}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><button className="icon-button modal-close" onClick={() => setCancelId(null)} aria-label="Close dialog"><X size={18} /></button><div className="confirm-icon"><Trash2 size={20} /></div><span className="eyebrow">CHANGE OF PLANS?</span><h2 id="cancel-title">Cancel this reservation?</h2><p>Your tickets will be released and returned to live inventory. You can reserve again while seats last.</p><div className="confirm-actions"><button className="secondary-button" onClick={() => setCancelId(null)}>Keep my tickets</button><button className="danger-button" onClick={cancelReservation}>Yes, cancel reservation</button></div></section></div>}
  </div>
}
