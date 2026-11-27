import type { Tier, TierId } from './types'
import { PH_BLOCKS, PH_CAPACITY, PH_CENTER, PH_COLOR, phLabel, phLevelName, type PhBlock } from './philippineGeometry'
import { formatPeso } from './data'
import { isStandingTier } from './seats'

type Props = {
  tiers: Tier[]
  selectedTier: TierId | null
  selectedBlock: string | null
  onSelect: (tierId: TierId, blockKey: string) => void
}

const GROUPS: { label: string; color: string; match: (block: PhBlock) => boolean }[] = [
  { label: 'VIP floor', color: PH_COLOR.vip, match: (block) => block.key === 'ph-vip' },
  { label: 'Lower box', color: PH_COLOR.level100, match: (block) => block.key.startsWith('ph-100') || block.key === 'ph-red' },
  { label: 'Upper box A', color: PH_COLOR.level200, match: (block) => block.key.startsWith('ph-200') },
  { label: 'Upper box B', color: PH_COLOR.level300, match: (block) => block.key.startsWith('ph-300') },
  { label: 'Gen Ad', color: PH_COLOR.level400, match: (block) => block.key.startsWith('ph-400') },
]

function remainingFor(match: (block: PhBlock) => boolean, byId: Map<TierId, Tier>) {
  const chosen = PH_BLOCKS.filter(match)
  const tierIds = [...new Set(chosen.map((block) => block.id))]
  return tierIds.reduce((sum, id) => {
    const tier = byId.get(id)
    if (!tier) return sum
    const family = PH_BLOCKS.filter((block) => block.id === id)
    const familyCap = family.reduce((total, block) => total + block.capacity, 0) || 1
    const partCap = chosen.filter((block) => block.id === id).reduce((total, block) => total + block.capacity, 0)
    return sum + Math.round(tier.stock * partCap / familyCap)
  }, 0)
}

function pathOf(block: PhBlock) {
  return block.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') + 'Z'
}

export default function Philippine2DMap({ tiers, selectedTier, selectedBlock, onSelect }: Props) {
  const byId = new Map(tiers.map((tier) => [tier.id, tier]))
  const selected = PH_BLOCKS.find((block) => block.key === selectedBlock) ?? null
  const selectedTierData = selectedTier ? byId.get(selectedTier) : null

  return (
    <div className="arena-chart">
      <div className="arena-chart-map arena-chart-map--paper">
        <svg viewBox="20 70 680 430" role="img" aria-label="Philippine Arena seating chart">
          <rect x="20" y="70" width="680" height="430" fill="#f7f4ee" rx="14" />
          <text x="360" y="96" textAnchor="middle" fill="#5c5348" fontSize="11" fontWeight="800" letterSpacing="0.14em">
            PHILIPPINE ARENA · {PH_CAPACITY.toLocaleString()} SEATS
          </text>
          {PH_BLOCKS.map((block) => {
            const tier = byId.get(block.id)
            const soldOut = !tier || tier.stock <= 0
            const active = selectedBlock === block.key
            const label = phLabel(block.points)
            const darkText = block.color === PH_COLOR.vip || block.color === PH_COLOR.level300 || block.color === PH_COLOR.level400
            return (
              <g key={block.key} opacity={soldOut ? 0.38 : 1}>
                <path
                  d={pathOf(block)}
                  fill={block.color}
                  stroke={active ? '#111827' : 'rgba(255,255,255,0.9)'}
                  strokeWidth={active ? 2.6 : 1.2}
                  className={soldOut ? undefined : 'arena-chart-block'}
                  style={{ cursor: soldOut ? 'not-allowed' : 'pointer' }}
                  onClick={() => { if (!soldOut && tier) onSelect(block.id, block.key) }}
                />
                <text
                  x={label.x}
                  y={label.y + 3}
                  textAnchor="middle"
                  fill={darkText ? '#1c1917' : '#fff'}
                  fontSize={block.code.length > 3 ? 8 : 9}
                  fontWeight="800"
                  style={{ pointerEvents: 'none' }}
                >
                  {block.code === 'VIP' ? 'VIP' : block.code === 'RED' ? 'RED' : block.code}
                </text>
              </g>
            )
          })}
          <rect x={PH_CENTER.x - 78} y={PH_CENTER.y + 6} width="156" height="34" rx="4" fill={PH_COLOR.stage} />
          <text x={PH_CENTER.x} y={PH_CENTER.y + 28} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" letterSpacing="0.16em">
            STAGE
          </text>
        </svg>
      </div>
      <aside className="arena-chart-legend arena-chart-legend--clean">
        <div className="arena-legend-head">
          <strong>PHILIPPINE ARENA</strong>
          <p>{tiers.reduce((sum, tier) => sum + tier.stock, 0).toLocaleString()} seats remaining.</p>
        </div>
        <div className="arena-legend-list">
          {GROUPS.map((group) => {
            const left = remainingFor(group.match, byId)
            const low = left > 0 && left <= 20
            return (
              <div key={group.label} className={`arena-legend-row${low ? ' is-low' : ''}`}>
                <i style={{ background: group.color }} />
                <span>
                  {group.label}
                  {low && <small>Running low</small>}
                </span>
                <em>{left > 0 ? `${left.toLocaleString()} remaining` : 'Sold out'}</em>
              </div>
            )
          })}
        </div>
        {selected && selectedTierData && (
          <div className="arena-legend-pick" style={{ ['--section' as string]: selected.color }}>
            <span>Selected section</span>
            <strong>{selected.code === 'VIP' || selected.code === 'RED' ? phLevelName(selected) : `Section ${selected.code}`}</strong>
            <em>{phLevelName(selected)}</em>
            <p className="arena-legend-meta">
              {(selectedTierData.stock > 0 && selectedTierData.stock <= 20) ? 'Running low · ' : ''}
              {isStandingTier(selected.id)
                ? `${selectedTierData.stock.toLocaleString()} spots remaining`
                : `${selectedTierData.stock.toLocaleString()} seats remaining`}
            </p>
            <b>{formatPeso(selectedTierData.price)}</b>
          </div>
        )}
      </aside>
    </div>
  )
}
