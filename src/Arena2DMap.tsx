import type { Tier, TierId } from './types'
import {
  ARENA_BLOCKS,
  ARENA_CAPACITY,
  ARENA_CENTER,
  TIER_COLOR,
  blockBounds,
  blockByKey,
  fillForBlock,
  labelAnchor,
  labelFontSize,
  polygonPath,
} from './arenaGeometry'
import { layoutBlockSeats } from './blockSeats'
import { formatPeso } from './data'
import { isStandingTier } from './seats'

type Props = {
  tiers: Tier[]
  selectedTier: TierId | null
  selectedBlock: string | null
  accent: string
  venue?: string
  onSelect: (tierId: TierId, blockKey: string) => void
}

function runningLow(left: number) {
  return left > 0 && left <= 20
}

const LEGEND: { id: TierId; label: string; color: string; tiers: TierId[] }[] = [
  { id: 'svip', label: 'Patron / SVIP Pit', color: TIER_COLOR.svip, tiers: ['svip'] },
  { id: 'lower-center', label: 'Lower Box Center', color: TIER_COLOR['lower-center'], tiers: ['lower-center'] },
  { id: 'lower-left', label: 'Lower Box Side', color: TIER_COLOR['lower-left'], tiers: ['lower-left', 'lower-right'] },
  { id: 'upper-center', label: 'Upper Box', color: TIER_COLOR['upper-center'], tiers: ['upper-left', 'upper-center', 'upper-right'] },
  { id: 'ga', label: 'General Admission', color: TIER_COLOR.ga, tiers: ['ga'] },
]

/** Short labels for thin blocks so text stays inside the shape. */
function displayCode(blockKey: string, code: string, points: { x: number; y: number }[]) {
  const { w, h } = blockBounds(points)
  const thin = Math.min(w, h) < 36
  if (!thin) return code
  if (blockKey.startsWith('svip')) return code === 'PIT' ? 'PIT' : 'P'
  if (code.startsWith('LB')) return code
  if (code.startsWith('UB')) return code
  return code
}

export default function Arena2DMap({
  tiers,
  selectedTier,
  selectedBlock,
  accent,
  venue = 'Arena seat plan',
  onSelect,
}: Props) {
  const byId = new Map(tiers.map((tier) => [tier.id, tier]))
  const selected = selectedBlock ? blockByKey(selectedBlock) : null
  const selectedTierData = selectedTier ? byId.get(selectedTier) : null
  const selectedSeatCount = selected ? layoutBlockSeats(selected).length : 0
  const selectedLow = Boolean(selectedTierData && runningLow(selectedTierData.stock))
  const venueLabel = venue.length > 42 ? `${venue.slice(0, 40)}…` : venue

  return (
    <div className="arena-chart">
      <div className="arena-chart-map arena-chart-map--paper">
        <svg viewBox="0 0 640 680" role="img" aria-label="Stadium oval seating chart">
          <defs>
            <linearGradient id="arenaPaper" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbfaf8" />
              <stop offset="100%" stopColor="#f0ebe3" />
            </linearGradient>
            <filter id="blockGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2.2" floodColor={accent} floodOpacity="0.55" />
            </filter>
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1a1520" floodOpacity="0.12" />
            </filter>
          </defs>

          <rect x="0" y="0" width="640" height="680" fill="url(#arenaPaper)" rx="14" />

          <rect
            x="36"
            y="36"
            width="568"
            height="608"
            rx="26"
            ry="26"
            fill="#ebe6de"
            stroke="#c9bfb2"
            strokeWidth="2"
          />

          <text
            x={ARENA_CENTER.x}
            y="26"
            textAnchor="middle"
            fill="#5c5348"
            fontSize="10"
            fontWeight="700"
            letterSpacing="0.1em"
          >
            {venueLabel.toUpperCase()} · {ARENA_CAPACITY.toLocaleString()} SEATS
          </text>

          {ARENA_BLOCKS.map((block) => {
            const tier = byId.get(block.id)
            if (!tier) return null
            const active = selectedBlock === block.key
            const soldOut = tier.stock <= 0
            const mid = labelAnchor(block.points)
            const code = displayCode(block.key, block.code, block.points)
            const fontSize = labelFontSize(block.points, code)
            return (
              <g key={block.key} opacity={soldOut ? 0.32 : 1} filter={active ? 'url(#blockGlow)' : undefined}>
                <path
                  d={polygonPath(block.points)}
                  fill={fillForBlock(block)}
                  stroke={active ? '#111827' : 'rgba(255,255,255,0.92)'}
                  strokeWidth={active ? 3.4 : 2}
                  className={soldOut ? undefined : 'arena-chart-block'}
                  style={{ cursor: soldOut ? 'not-allowed' : 'pointer' }}
                  onClick={() => { if (!soldOut) onSelect(block.id, block.key) }}
                />
                <text
                  x={mid.x}
                  y={mid.y + fontSize * 0.35}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={fontSize}
                  fontWeight="800"
                  style={{ pointerEvents: 'none' }}
                >
                  {code}
                </text>
              </g>
            )
          })}

          <g filter="url(#softShadow)">
            <rect
              x={ARENA_CENTER.x - 52}
              y={ARENA_CENTER.y - 78}
              width="104"
              height="156"
              rx="8"
              fill="#4F7FE8"
              stroke="#1e3a8a"
              strokeWidth="2"
            />
            <text
              x={ARENA_CENTER.x}
              y={ARENA_CENTER.y - 4}
              textAnchor="middle"
              fill="#fff"
              fontSize="13"
              fontWeight="800"
              letterSpacing="0.16em"
            >
              STAGE
            </text>
            <text
              x={ARENA_CENTER.x}
              y={ARENA_CENTER.y + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize="8"
              fontWeight="600"
              letterSpacing="0.08em"
            >
              FLOOR
            </text>
          </g>
        </svg>
      </div>

      <aside className="arena-chart-legend arena-chart-legend--clean">
        <div className="arena-legend-head">
          <strong>SEAT PLAN</strong>
          <p>{tiers.reduce((sum, tier) => sum + tier.stock, 0).toLocaleString()} seats remaining.</p>
        </div>

        <div className="arena-legend-list">
          {LEGEND.map((item) => {
            const left = item.tiers.reduce((sum, id) => sum + (byId.get(id)?.stock ?? 0), 0)
            const low = runningLow(left)
            return (
              <div key={item.id} className={`arena-legend-row${low ? ' is-low' : ''}`}>
                <i style={{ background: item.color }} />
                <span>
                  {item.label}
                  {low && <small>Running low</small>}
                </span>
                <em>{left > 0 ? `${left.toLocaleString()} remaining` : 'Sold out'}</em>
              </div>
            )
          })}
        </div>

        {selected && selectedTierData && (
          <div
            className={`arena-legend-pick${selectedLow ? ' is-low' : ''}`}
            style={{ ['--section' as string]: fillForBlock(selected) }}
          >
            <span>Selected section</span>
            <strong>{labelFor(selectedTierData)}</strong>
            <em>{selectedTierData.section} · {selected.code}</em>
            <p className="arena-legend-meta">
              {selectedLow ? 'Running low · ' : ''}
              {isStandingTier(selected.id)
                ? `${selectedTierData.stock.toLocaleString()} spots remaining`
                : `${selectedSeatCount.toLocaleString()} seats in this block · ${selectedTierData.stock.toLocaleString()} seats remaining`}
            </p>
            <b>{formatPeso(selectedTierData.price)}</b>
          </div>
        )}
      </aside>
    </div>
  )
}

function labelFor(tier: Tier) {
  if (tier.name === 'Lower Box' || tier.name === 'Upper Box') return `${tier.name} · ${tier.section}`
  return tier.name
}
