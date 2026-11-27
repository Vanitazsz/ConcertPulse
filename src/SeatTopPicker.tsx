import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { SeatSpot } from './types'

const MIN_SCALE = 1
const MAX_SCALE = 8

type View = { x: number; y: number; scale: number }

function clampView(next: View, width: number, height: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale))
  if (width <= 0 || height <= 0) return { x: 0, y: 0, scale }
  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), next.x)),
    y: Math.min(0, Math.max(height * (1 - scale), next.y)),
  }
}

function zoomAt(current: View, px: number, py: number, scale: number): View {
  const contentX = (px - current.x) / current.scale
  const contentY = (py - current.y) / current.scale
  return { scale, x: px - contentX * scale, y: py - contentY * scale }
}

function paintView(frame: HTMLDivElement | null, svg: SVGSVGElement | null, next: View) {
  const view = clampView(next, frame?.clientWidth ?? 0, frame?.clientHeight ?? 0)
  if (svg) svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
  if (frame) {
    frame.dataset.scale = view.scale > 1.001 ? 'in' : 'fit'
    frame.querySelectorAll<HTMLButtonElement>('[data-zoom-lock]').forEach((button) => {
      button.disabled = view.scale <= 1.001
    })
  }
  return view
}

type Props = {
  seats: SeatSpot[]
  selected: string[]
  accent: string
  onToggle: (seatId: string, available: boolean) => void
}

/** Upright seat that stays inside its cell, even after it turns toward the stage. */
function SeatIcon({
  x,
  y,
  angle,
  size,
  fill,
  stroke,
  selected,
}: {
  x: number
  y: number
  angle: number
  size: number
  fill: string
  stroke: string
  selected: boolean
}) {
  const s = size
  const strokeWidth = Math.max(0.35, s * (selected ? 0.09 : 0.045))
  return (
    <g transform={`translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`}>
      <rect
        x={-s * 0.34}
        y={-s * 0.02}
        width={s * 0.68}
        height={s * 0.4}
        rx={s * 0.12}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <rect
        x={-s * 0.38}
        y={-s * 0.4}
        width={s * 0.76}
        height={s * 0.26}
        rx={s * 0.1}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  )
}

/** Typical gap between seat centers on one axis. Ignores duplicate coordinates. */
function axisPitch(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1]
    if (gap > 0.15) gaps.push(gap)
  }
  if (!gaps.length) return 4
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

/** Top-down picker — fitted on first view, then zoom and drag to inspect seats. */
export default function SeatTopPicker({ seats, selected, accent, onToggle }: Props) {
  const picked = useMemo(() => new Set(selected), [selected])
  const frameRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })
  const suppressClick = useRef(false)
  const chartKey = `${seats.length}:${seats[0]?.id ?? ''}:${seats[seats.length - 1]?.id ?? ''}`

  const apply = (next: View) => {
    viewRef.current = paintView(frameRef.current, svgRef.current, next)
  }

  useEffect(() => {
    apply({ x: 0, y: 0, scale: 1 })
  }, [chartKey])

  useEffect(() => {
    apply(viewRef.current)
  })

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      const current = viewRef.current
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1
      const factor = Math.exp(-event.deltaY * unit * 0.0015)
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor))
      apply(zoomAt(current, event.clientX - rect.left, event.clientY - rect.top, scale))
    }
    const onResize = () => apply(viewRef.current)
    frame.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(onResize)
    observer.observe(frame)
    return () => {
      frame.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [])

  const zoomBy = (factor: number) => {
    const frame = frameRef.current
    if (!frame) return
    const current = viewRef.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor))
    apply(zoomAt(current, frame.clientWidth / 2, frame.clientHeight / 2, scale))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const frame = frameRef.current
    if (!frame) return
    const startX = event.clientX
    const startY = event.clientY
    const origin = viewRef.current
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 5) return
      moved = true
      frame.classList.add('is-panning')
      apply({ scale: origin.scale, x: origin.x + dx, y: origin.y + dy })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      frame.classList.remove('is-panning')
      if (!moved) return
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 80)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const layout = useMemo(() => {
    const xs = seats.map((s) => s.mapX)
    const ys = seats.map((s) => s.mapY)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = maxX - minX
    const spanY = maxY - minY
    const horizontal = spanY > spanX
    const cell = 18
    const pitch = Math.min(
      axisPitch(horizontal ? ys : xs),
      axisPitch(horizontal ? xs : ys),
    )
    const scale = cell / pitch
    const size = cell * 0.62
    const pad = cell
    const width = Math.max((horizontal ? spanY : spanX) * scale, cell * 4) + pad * 2
    const height = Math.max((horizontal ? spanX : spanY) * scale, cell * 4) + pad * 2
    return { minX, minY, width, height, pad, size, scale, cell, horizontal }
  }, [seats])

  return (
    <div className="seat-top-shell">
      <div className="seat-top-stage" aria-hidden="true">STAGE ↑</div>
      <div
        ref={frameRef}
        className="seat-top-scroll"
        data-scale="fit"
        onPointerDown={onPointerDown}
        onClickCapture={(event) => {
          if (!suppressClick.current) return
          suppressClick.current = false
          event.stopPropagation()
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="seat-top-svg"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`${seats.length} seats in this section. Scroll to zoom, drag to move. Select up to 6.`}
        >
          <rect x={0} y={0} width={layout.width} height={layout.height} fill="#f4f1ea" rx={10} />
          {seats.map((seat) => {
            const along = layout.horizontal ? seat.mapY - layout.minY : seat.mapX - layout.minX
            const depth = layout.horizontal ? seat.mapX - layout.minX : seat.mapY - layout.minY
            const x = along * layout.scale + layout.pad
            const y = depth * layout.scale + layout.pad
            const isOn = picked.has(seat.id)
            const fill = !seat.available ? '#8e959d' : isOn ? '#e8893a' : '#fffdf8'
            const stroke = !seat.available ? '#62686f' : isOn ? accent : '#c9bfb0'
            return (
              <g key={seat.id} className={seat.available ? undefined : 'seat-top-off'}>
                <title>{`${seat.label}${!seat.available ? ' (unavailable)' : isOn ? ' (selected)' : ''}`}</title>
                <SeatIcon
                  x={x}
                  y={y}
                  angle={0}
                  size={layout.size}
                  fill={fill}
                  stroke={stroke}
                  selected={isOn}
                />
                <rect
                  x={x - layout.cell * 0.42}
                  y={y - layout.cell * 0.42}
                  width={layout.cell * 0.84}
                  height={layout.cell * 0.84}
                  fill="transparent"
                  className={seat.available || isOn ? 'seat-top-hit' : 'seat-top-hit is-unavailable'}
                  style={{ cursor: seat.available || isOn ? 'pointer' : 'not-allowed' }}
                  tabIndex={seat.available || isOn ? 0 : -1}
                  role="button"
                  aria-disabled={!seat.available}
                  aria-pressed={isOn}
                  aria-label={`Seat ${seat.label}${!seat.available ? ', unavailable' : isOn ? ', selected' : ''}`}
                  onClick={() => {
                    if (!seat.available && !isOn) return
                    onToggle(seat.id, seat.available || isOn)
                  }}
                  onKeyDown={(event) => {
                    if (!seat.available && !isOn) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onToggle(seat.id, seat.available || isOn)
                    }
                  }}
                />
              </g>
            )
          })}
        </svg>
        <div className="seat-zoom" onPointerDown={(event) => event.stopPropagation()}>
          <span className="seat-zoom-hint">Scroll to zoom · drag to move</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.35)}>+</button>
          <button type="button" data-zoom-lock aria-label="Zoom out" onClick={() => zoomBy(1 / 1.35)}>−</button>
          <button type="button" className="is-fit" data-zoom-lock aria-label="Fit all seats" onClick={() => apply({ x: 0, y: 0, scale: 1 })}>Fit</button>
        </div>
      </div>
      <div className="seat-top-legend" aria-hidden="true">
        <span><i className="seat-swatch is-free" /> Available</span>
        <span><i className="seat-swatch is-picked" style={{ background: '#e8893a' }} /> Selected</span>
        <span><i className="seat-swatch is-sold" /> Unavailable</span>
        <span className="seat-top-count">{seats.length.toLocaleString()} seats</span>
      </div>
    </div>
  )
}
