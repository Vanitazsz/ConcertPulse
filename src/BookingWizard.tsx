import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Armchair, ArrowLeft, ArrowRight, Banknote, CalendarDays, Check, CreditCard, Landmark, MapPin, Minus, Plus, Smartphone, Ticket } from 'lucide-react'
import Arena2DMap from './Arena2DMap'
import Arena3DTour from './Arena3DTour'
import Philippine2DMap from './Philippine2DMap'
import SeatTopPicker from './SeatTopPicker'
import { fillForBlock } from './arenaGeometry'
import { findBlock, layoutBlockSeatsByKey } from './blockSeats'
import { phBlockByKey, phLevelName } from './philippineGeometry'
import { formatPeso, SHOW_STILLS } from './data'
import { buildSeatsForBlock, isStandingTier, MAX_TICKETS, toggleSeatSelection } from './seats'
import type { BookingStep, Concert, PaymentId, Reservation, Tier, TierId } from './types'

const SERVICE_FEE = 150
const STEPS = [
  { id: 1 as const, label: 'Choose a show' },
  { id: 2 as const, label: 'Pick a section' },
  { id: 3 as const, label: 'Pick a seat' },
  { id: 4 as const, label: 'Your e-ticket' },
]

type Props = {
  concerts: Concert[]
  onConcertChange?: (concert: Concert) => void
  onReserve: (payload: {
    concertId: string
    tierId: TierId
    quantity: number
    seatIds?: string[]
    name: string
    email: string
    total: number
    payment: PaymentId
  }) => Reservation | string
}

const PAYMENTS: { id: PaymentId; label: string; detail: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Cash', detail: 'Pay at the box office', icon: Banknote },
  { id: 'gcash', label: 'GCash', detail: 'Mobile wallet', icon: Smartphone },
  { id: 'bank', label: 'Bank transfer', detail: 'BDO, BPI, or UnionBank', icon: Landmark },
  { id: 'card', label: 'Card', detail: 'Visa, Mastercard, or JCB', icon: CreditCard },
]

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidName(value: string) {
  return value.trim().length >= 2
}

function SectionPick({ tier, blockKey }: { tier: Tier; blockKey: string }) {
  const block = findBlock(blockKey)
  const philippine = phBlockByKey(blockKey)
  const color = philippine?.color ?? (block ? fillForBlock(block) : '#7c3aed')
  const count = layoutBlockSeatsByKey(blockKey).length
  return (
    <div className="arena-legend-pick" style={{ ['--section' as string]: color }}>
      <span>Selected section</span>
      <strong>{philippine ? phLevelName(philippine) : tier.name}</strong>
      <em>{philippine ? (philippine.code === 'VIP' || philippine.code === 'RED' ? philippine.code : `Section ${philippine.code}`) : block ? `${tier.section} · ${block.code}` : tier.section}</em>
      <p className="arena-legend-meta">
        {isStandingTier(tier.id)
          ? `${tier.stock.toLocaleString()} spots remaining`
          : `${count.toLocaleString()} seats in this block · ${tier.stock.toLocaleString()} seats remaining`}
      </p>
      <b>{formatPeso(tier.price)}</b>
    </div>
  )
}

export default function BookingWizard({ concerts, onConcertChange, onReserve }: Props) {
  const [step, setStep] = useState<BookingStep>(1)
  const [concertId, setConcertId] = useState(() => concerts.find((item) => item.id === 'bruno')?.id ?? concerts[0]?.id ?? '')
  const [tierId, setTierId] = useState<TierId | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [quantity, setQuantity] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState({ name: false, email: false })
  const [error, setError] = useState('')
  const [payment, setPayment] = useState<PaymentId | null>(null)
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d')

  const pickSection = (id: TierId, blockKey: string) => {
    setTierId(id)
    setSelectedBlock(blockKey)
  }

  const concert = concerts.find((item) => item.id === concertId) ?? concerts[0]

  useEffect(() => {
    if (concert) onConcertChange?.(concert)
  }, [concert, onConcertChange])

  const orderedConcerts = useMemo(() => {
    const selected = concerts.find((item) => item.id === concertId)
    if (!selected) return concerts
    return [selected, ...concerts.filter((item) => item.id !== concertId)]
  }, [concerts, concertId])

  const chooseShow = (id: string) => {
    const apply = () => {
      setConcertId(id)
      setTierId(null)
      setSelectedBlock(null)
      setSelectedSeats([])
      setQuantity(1)
    }
    const grid = document.querySelector('.concert-pick-grid')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const reveal = () => grid?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    if (id === concertId || reduced || !document.startViewTransition) {
      apply()
      reveal()
      return
    }
    const transition = document.startViewTransition(() => flushSync(apply))
    transition.finished.then(reveal).catch(() => {})
  }
  const tier = concert?.tiers.find((item) => item.id === tierId) ?? null
  const standing = tier ? isStandingTier(tier.id) : false
  const seats = useMemo(
    () => (tier && selectedBlock && !standing ? buildSeatsForBlock(selectedBlock, tier) : []),
    [tier, selectedBlock, standing],
  )
  const blockSeatCount = selectedBlock ? layoutBlockSeatsByKey(selectedBlock).length : 0
  const ticketCount = standing ? quantity : selectedSeats.length
  const amount = tier ? tier.price * ticketCount : 0
  const total = ticketCount > 0 ? amount + SERVICE_FEE : 0

  const canContinue = () => {
    if (step === 1) return Boolean(concert)
    if (step === 2) return Boolean(tier && selectedBlock && tier.stock > 0)
    if (step === 3) {
      if (standing) return quantity > 0 && quantity <= Math.min(MAX_TICKETS, tier?.stock ?? 0)
      return selectedSeats.length > 0 && selectedSeats.length <= MAX_TICKETS
    }
    return isValidName(fullName) && isValidEmail(email) && ticketCount > 0 && Boolean(tier) && Boolean(payment)
  }

  const goNext = () => {
    setError('')
    if (step < 4) {
      if (step === 1) setMapMode('2d')
      if (step === 2) {
        setSelectedSeats([])
        setQuantity(1)
      }
      setStep((current) => (current + 1) as BookingStep)
      return
    }
    if (!tier || !concert) return
    setTouched({ name: true, email: true })
    if (!isValidName(fullName) || !isValidEmail(email)) {
      setError('Add a valid name and email to continue.')
      return
    }
    if (!payment) {
      setError('Choose a payment method to get your e-ticket.')
      return
    }
    const result = onReserve({
      concertId: concert.id,
      tierId: tier.id,
      quantity: ticketCount,
      seatIds: selectedSeats.length > 0 ? selectedSeats : undefined,
      name: fullName.trim(),
      email: email.trim(),
      total,
      payment,
    })
    if (typeof result === 'string') setError(result)
  }

  const goBack = () => {
    setError('')
    if (step === 1) return
    setStep((current) => (current - 1) as BookingStep)
  }

  return (
    <div className="wizard-frame">
      <div className="wizard-progress">
        <div className="wizard-progress-inner">
          <ol aria-label="Booking progress">
            {STEPS.map((item, index) => {
              const state = step === item.id ? 'is-current' : step > item.id ? 'is-done' : ''
              return (
                <li key={item.id} className={state}>
                  <span className="wizard-step-num">
                    {step > item.id ? <Check size={12} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{item.label}</span>
                  {index < STEPS.length - 1 && <span className="wizard-step-line" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className="wizard-content">
        {step === 1 && (
          <section className="wizard-step">
            <div className="wizard-heading">
              <span className="wizard-eyebrow">Step 01</span>
              <h1>Choose a show</h1>
              <p>Pick your night. You can change this before checkout.</p>
            </div>
            <div className="concert-pick-grid">
              {orderedConcerts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`concert-pick-card ${concertId === item.id ? 'is-active' : ''}`}
                  onClick={() => chooseShow(item.id)}
                  style={{
                    '--event-accent': item.accent,
                    '--event-secondary': item.secondary,
                    viewTransitionName: `show-${item.id}`,
                  } as React.CSSProperties}
                >
                  <div
                    className="concert-pick-art"
                    style={{ background: `radial-gradient(circle at 70% 20%, ${item.accent}aa, transparent 48%), linear-gradient(140deg, ${item.secondary}, #17121e 80%)` }}
                  >
                    {item.artist}
                    <span className="concert-pick-tag">{item.tag}</span>
                  </div>
                  <div className="concert-pick-meta">
                    <strong>{item.title}</strong>
                    <span><CalendarDays size={13} /> {item.date}</span>
                    <span>
                      <MapPin size={13} />
                      <span>{item.venue}</span>
                      {concertId === item.id && <b className="concert-pick-chosen">Selected</b>}
                    </span>
                  </div>
                  {concertId === item.id && (
                    <span className="concert-pick-photos" aria-hidden="true">
                      {(SHOW_STILLS[item.id] ?? []).map((src) => (
                        <img key={src} src={src} alt="" />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && concert && (
          <section className="wizard-step">
            <div className="wizard-heading wizard-heading-row">
              <div>
                <span className="wizard-eyebrow">Step 02 · {concert.artist}</span>
                <h1>Pick a section</h1>
                <p>{concert.tiers.reduce((sum, tier) => sum + tier.stock, 0).toLocaleString()} seats remaining — tap one block to select it.</p>
              </div>
              <div className="map-mode-toggle" role="group" aria-label="Map view">
                <button type="button" className={mapMode === '2d' ? 'is-active' : ''} onClick={() => setMapMode('2d')}>2D Map</button>
                <button type="button" className={mapMode === '3d' ? 'is-active' : ''} onClick={() => setMapMode('3d')}>3D Tour</button>
              </div>
            </div>
            {mapMode === '2d' ? (
              concert.venue.includes('Philippine Arena') ? (
                <Philippine2DMap
                  tiers={concert.tiers}
                  selectedTier={tierId}
                  selectedBlock={selectedBlock}
                  onSelect={pickSection}
                />
              ) : (
                <Arena2DMap
                  tiers={concert.tiers}
                  selectedTier={tierId}
                  selectedBlock={selectedBlock}
                  accent={concert.accent}
                  venue={concert.venue}
                  onSelect={pickSection}
                />
              )
            ) : (
              <div className="arena-chart">
                <div className="arena-chart-map arena-3d-wrap">
                  <Arena3DTour
                    tiers={concert.tiers}
                    selectedTier={tierId}
                    selectedBlock={selectedBlock}
                    accent={concert.accent}
                    onSelect={pickSection}
                    variant={concert.venue.includes('Philippine Arena') ? 'philippine' : 'moa'}
                  />
                </div>
                <aside className="arena-chart-legend arena-chart-legend--clean">
                  <div className="arena-legend-head">
                    <strong>{concert.venue.includes('Philippine Arena') ? 'PHILIPPINE ARENA' : 'THE BOWL'}</strong>
                    <p>{concert.tiers.reduce((sum, tier) => sum + tier.stock, 0).toLocaleString()} seats remaining. Click a section to select it.</p>
                  </div>
                  {tierId && selectedBlock && concert.tiers.find((item) => item.id === tierId) && (
                    <SectionPick
                      tier={concert.tiers.find((item) => item.id === tierId)!}
                      blockKey={selectedBlock}
                    />
                  )}
                </aside>
              </div>
            )}
          </section>
        )}

        {step === 3 && concert && tier && (
          <section className="wizard-step">
            <div className="wizard-heading">
              <span className="wizard-eyebrow">Step 03 · {selectedBlock} · {tier.name}</span>
              <h1>{standing ? 'How many tickets?' : 'Pick a seat'}</h1>
              <p>
                {standing
                  ? 'Patron / pit is standing — choose a quantity (max 6).'
                  : `${selectedBlock} has ${blockSeatCount.toLocaleString()} seats. Gray seats are unavailable. Pick up to ${MAX_TICKETS}.`}
              </p>
            </div>

            {standing ? (
              <div className="qty-panel">
                <strong>{tier.name}</strong>
                <p className="checkout-hint">{tier.stock} spots left · {formatPeso(tier.price)} each</p>
                <div className="qty-stepper">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">
                    <Minus size={16} />
                  </button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(MAX_TICKETS, tier.stock, value + 1))} disabled={quantity >= Math.min(MAX_TICKETS, tier.stock)} aria-label="Increase quantity">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="seat-layout">
                <div className="seat-stage">
                  <SeatTopPicker
                    seats={seats}
                    selected={selectedSeats}
                    accent={concert.accent}
                    onToggle={(seatId, available) => setSelectedSeats((current) => toggleSeatSelection(current, seatId, available))}
                  />
                </div>
                <aside className="seat-summary">
                  <div>
                    <h2>{selectedSeats.length} selected</h2>
                    <p>
                      {selectedSeats.length === 0
                        ? 'Tap a seat.'
                        : selectedSeats.map((id) => id.split('-').pop()).join(', ')}
                    </p>
                  </div>
                  <strong className="price">{formatPeso(amount || 0)}</strong>
                </aside>
              </div>
            )}
          </section>
        )}

        {step === 4 && concert && tier && (
          <section className="wizard-step">
            <div className="wizard-heading">
              <span className="wizard-eyebrow">Step 04</span>
              <h1>Confirm & reserve</h1>
              <p>Add your details and choose how you’ll pay. Your e-ticket is issued after that.</p>
            </div>
            <div className="checkout-grid">
              <div className="checkout-panel checkout-fields">
                <div className={touched.name && !isValidName(fullName) ? 'is-invalid' : ''}>
                  <label htmlFor="vybe-name">FULL NAME</label>
                  <input
                    id="vybe-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    onBlur={() => setTouched((value) => ({ ...value, name: true }))}
                    placeholder="Alex Reyes"
                    autoComplete="name"
                  />
                </div>
                <div className={touched.email && !isValidEmail(email) ? 'is-invalid' : ''}>
                  <label htmlFor="vybe-email">EMAIL</label>
                  <input
                    id="vybe-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setTouched((value) => ({ ...value, email: true }))}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <fieldset className="pay-methods">
                  <legend>Payment</legend>
                  <div className="pay-grid">
                    {PAYMENTS.map((method) => {
                      const Icon = method.icon
                      const on = payment === method.id
                      return (
                        <button
                          key={method.id}
                          type="button"
                          className={on ? 'is-on' : ''}
                          aria-pressed={on}
                          onClick={() => setPayment(method.id)}
                        >
                          <Icon size={18} />
                          <span>
                            <strong>{method.label}</strong>
                            <small>{method.detail}</small>
                          </span>
                          {on && <Check size={16} />}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                {error && <p className="wizard-error">{error}</p>}
              </div>
              <aside className="checkout-panel checkout-receipt">
                <span className="checkout-kicker">Your order</span>
                <h2>{concert.title}</h2>
                <p className="checkout-hint">{concert.artist}</p>
                <ul className="checkout-meta">
                  <li><CalendarDays size={15} /> {concert.date}</li>
                  <li><MapPin size={15} /> {concert.venue}</li>
                  <li><Armchair size={15} /> {tier.name} · {tier.section}</li>
                  <li>
                    <Ticket size={15} />
                    {selectedSeats.length > 0
                      ? `${selectedSeats.length} ticket${selectedSeats.length === 1 ? '' : 's'} · ${selectedSeats.map((id) => id.split('-').pop()).join(', ')}`
                      : `${quantity} ticket${quantity === 1 ? '' : 's'}`}
                  </li>
                </ul>
                <dl className="checkout-lines">
                  <div><dt>Tickets</dt><dd>{formatPeso(amount)}</dd></div>
                  <div><dt>Service fee</dt><dd>{formatPeso(SERVICE_FEE)}</dd></div>
                  <div className="checkout-total"><dt>Total</dt><dd>{formatPeso(total)}</dd></div>
                </dl>
              </aside>
            </div>
          </section>
        )}
      </div>

      <div className="wizard-footer">
        <button type="button" className="ghost-btn" onClick={goBack} disabled={step === 1}>
          <ArrowLeft size={16} /> Back
        </button>
        <button type="button" className="primary-btn" onClick={goNext} disabled={!canContinue()}>
          {step === 4 ? 'Reserve tickets' : 'Continue'}
          {step < 4 && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  )
}
