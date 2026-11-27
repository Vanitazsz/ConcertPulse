import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import { ARENA_BLOCKS, ARENA_CENTER, blockBounds, fillForBlock, pointInPolygon, polygonCentroid, type Pt } from './arenaGeometry'
import type { TierId } from './types'

/**
 * Rounded-rect concert bowl, in metres.
 * Same plan as the 2D chart: nearly square, a little longer north–south,
 * flat sides, rounded corners, stage in the middle.
 * Three tiers, twelve bays, a radial aisle between each bay.
 */
const TAU = Math.PI * 2
const ROW_D = 0.9
const RISE = 0.46
/** Map units → metres. Outer chart (~300 units from center) sits inside the shell. */
const MAP_SCALE = 0.18

export type StadiumSeat = {
  tier: 1 | 2 | 3
  row: number
  number: number
  section: number
  tierId: TierId
  blockKey: string
}

export type StadiumFrame = {
  pitchA: number
  pitchB: number
  roofY: number
  outerA: number
  outerB: number
}

type TierSpec = { tier: 1 | 2 | 3; rows: number; a0: number; b0: number; y0: number }

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function bowlMetrics() {
  // Half-width (x) slightly under half-depth (z), matching the 2D chart's 280:300 plan.
  const lower: TierSpec = { tier: 1, rows: 9, a0: 30, b0: 34, y0: 3.1 }
  const lowerOuterA = lower.a0 + lower.rows * ROW_D
  const lowerOuterB = lower.b0 + lower.rows * ROW_D
  const lowerTop = lower.y0 + (lower.rows - 1) * RISE
  const boxDepth = 4.2
  const boxGap = 1.15
  const middle: TierSpec = {
    tier: 2,
    rows: 8,
    a0: lowerOuterA + boxGap + boxDepth,
    b0: lowerOuterB + boxGap + boxDepth,
    y0: lowerTop + 0.04,
  }
  const middleOuterA = middle.a0 + middle.rows * ROW_D
  const middleOuterB = middle.b0 + middle.rows * ROW_D
  const middleTop = middle.y0 + (middle.rows - 1) * RISE
  const upper: TierSpec = {
    tier: 3,
    rows: 11,
    a0: middleOuterA + 3.4,
    b0: middleOuterB + 3.4,
    y0: middleTop + 2.15,
  }
  const upperOuterA = upper.a0 + upper.rows * ROW_D
  const upperOuterB = upper.b0 + upper.rows * ROW_D
  const upperTop = upper.y0 + (upper.rows - 1) * RISE
  const roofY = upperTop + 22.4
  return {
    lower,
    middle,
    upper,
    tiers: [lower, middle, upper] as TierSpec[],
    lowerOuterA,
    lowerOuterB,
    lowerTop,
    boxInnerA: lowerOuterA + 0.65,
    boxInnerB: lowerOuterB + 0.65,
    boxDepth,
    middleOuterA,
    middleOuterB,
    middleTop,
    upperOuterA,
    upperOuterB,
    upperTop,
    facadeA: upperOuterA + 2.2,
    facadeB: upperOuterB + 2.2,
    roof: {
      // Open over the whole 2D chart so the middle reads as sections, not an oval hole.
      a0: upperOuterA - 1.2,
      b0: upperOuterB - 1.2,
      a1: upperOuterA + 16,
      b1: upperOuterB + 16,
      y0: roofY,
      crown: 2.6,
    },
  }
}

/**
 * Point on a rounded rectangle. theta 0 is +Z, same as the old ellipse,
 * so aisles and section compass stay put while the plan matches the 2D chart.
 */
function ellipse(a: number, b: number, theta: number, y: number) {
  const radius = Math.min(a, b) * 0.3
  const hw = Math.max(a - radius, 0.01)
  const hd = Math.max(b - radius, 0.01)
  const dx = Math.sin(theta)
  const dz = Math.cos(theta)
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  const phi = Math.atan2(ax, Math.max(az, 1e-8))
  const flatZ = Math.atan2(hw, b)
  const flatX = Math.atan2(a, hd)
  const sx = Math.sign(dx) || 1
  const sz = Math.sign(dz) || 1
  if (phi <= flatZ) {
    return [sx * ((b * ax) / Math.max(az, 1e-8)), y, sz * b] as const
  }
  if (phi >= flatX) {
    return [sx * a, y, sz * ((a * az) / Math.max(ax, 1e-8))] as const
  }
  const cx = sx * hw
  const cz = sz * hd
  const dot = dx * cx + dz * cz
  const disc = Math.max(0, dot * dot - (cx * cx + cz * cz - radius * radius))
  const t = dot + Math.sqrt(disc)
  return [dx * t, y, dz * t] as const
}

function ring(a: number, b: number, y: number, segs: number) {
  const pts: Array<[number, number, number]> = []
  for (let i = 0; i <= segs; i += 1) {
    const p = ellipse(a, b, (i / segs) * TAU, y)
    pts.push([p[0], p[1], p[2]])
  }
  return pts
}

class Strip {
  pos: number[] = []
  idx: number[] = []

  add(inner: Array<[number, number, number]>, outer: Array<[number, number, number]>) {
    const base = this.pos.length / 3
    for (let i = 0; i < inner.length; i += 1) {
      this.pos.push(inner[i][0], inner[i][1], inner[i][2], outer[i][0], outer[i][1], outer[i][2])
    }
    for (let i = 0; i < inner.length - 1; i += 1) {
      const a = base + i * 2
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

function canvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat = false,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = colorSpace
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

export function deckTextures() {
  const color = canvasTex(1024, 1024, (ctx) => {
    const rand = rng(21)
    ctx.fillStyle = '#c9d2ce'
    ctx.fillRect(0, 0, 1024, 1024)
    for (let i = 0; i < 48; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(120,138,136,0.1)'
      ctx.beginPath()
      ctx.ellipse(rand() * 1024, rand() * 1024, 50 + rand() * 140, 36 + rand() * 90, rand() * TAU, 0, TAU)
      ctx.fill()
    }
    for (let i = 0; i < 9000; i += 1) {
      const tone = 170 + Math.floor(rand() * 50)
      ctx.fillStyle = `rgba(${tone},${tone + 2},${tone},${0.22})`
      ctx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 2.2, 1 + rand() * 2.2)
    }
  }, true)
  const rough = canvasTex(512, 512, (ctx) => {
    const rand = rng(22)
    const image = ctx.createImageData(512, 512)
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 168 + Math.floor((rand() - 0.5) * 50)
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  }, true, THREE.NoColorSpace)
  return { color, rough }
}

/** Neutral weave. Instance color tints it per section, so the map stays light. */
export function seatFabric() {
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#e6e1d8'
    ctx.fillRect(0, 0, 512, 512)
    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(40,36,32,0.16)' : 'rgba(255,255,255,0.07)'
      ctx.fillRect(0, y, 512, 1)
    }
    for (let x = 0; x < 512; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(40,36,32,0.1)' : 'rgba(255,255,255,0.04)'
      ctx.fillRect(x, 0, 1, 512)
    }
  }, true)
}

function grassTexture(pitch: boolean) {
  return canvasTex(512, 512, (ctx) => {
    const rand = rng(pitch ? 4 : 9)
    ctx.fillStyle = pitch ? '#2f6d38' : '#3c8a46'
    ctx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 36; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(186,214,132,0.2)' : 'rgba(18,72,32,0.16)'
      ctx.beginPath()
      ctx.ellipse(rand() * 512, rand() * 512, 28 + rand() * 90, 18 + rand() * 48, rand() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 0.5
    for (let i = 0; i < 8000; i += 1) {
      const x = rand() * 512
      const y = rand() * 512
      ctx.strokeStyle = rand() > 0.5 ? '#b7e0a4' : '#1c5a2c'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (rand() - 0.5) * 2.2, y - 2 - rand() * 6)
      ctx.stroke()
    }
  }, true)
}

/** Glazed curtain wall: cool panes and pale mullions, no baked sun. */
function glassTexture() {
  return canvasTex(256, 256, (ctx) => {
    const rand = rng(21)
    ctx.fillStyle = '#c3d3de'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 22; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(62,104,132,0.14)'
      ctx.fillRect(rand() * 256, rand() * 256, 28 + rand() * 70, 24 + rand() * 48)
    }
    ctx.fillStyle = '#f7fafc'
    for (let x = 0; x <= 256; x += 32) ctx.fillRect(x, 0, 3, 256)
    for (let y = 0; y <= 256; y += 64) ctx.fillRect(0, y, 256, 4)
  }, true)
}

/** Silver standing-seam cladding. Seams are paint, not a baked highlight. */
function claddingTexture() {
  return canvasTex(256, 256, (ctx) => {
    const rand = rng(9)
    ctx.fillStyle = '#e4edf2'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 16; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(86,108,122,0.05)'
      ctx.fillRect(0, rand() * 256, 256, 10 + rand() * 28)
    }
    ctx.fillStyle = 'rgba(118,136,148,0.55)'
    for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 2)
    ctx.fillStyle = 'rgba(150,166,176,0.4)'
    for (let x = 0; x < 256; x += 86) ctx.fillRect(x, 0, 1, 256)
  }, true)
}

/** Curtain wall for the eye. One tile covers the whole opening. */
function eyeGlassTexture() {
  return canvasTex(1024, 640, (ctx, w, h) => {
    const rand = rng(4)
    const paneX = 22
    const paneY = 70
    ctx.fillStyle = '#a9c0d0'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += paneY) {
      for (let x = 0; x < w; x += paneX) {
        const shift = rand()
        const g = 164 + Math.floor(shift * 30)
        ctx.fillStyle = `rgb(${g - 20},${g},${g + 18})`
        ctx.fillRect(x + 2, y + 2, paneX - 4, paneY - 4)
      }
    }
    ctx.fillStyle = '#f5f8fa'
    for (let x = 0; x <= w; x += paneX) ctx.fillRect(x, 0, 3, h)
    for (let y = 0; y <= h; y += paneY) ctx.fillRect(0, y, w, 4)
  })
}

/** Eye opening on the south face. Corners meet; the right canthus sits higher. */
function eyeLids(xNorm: number) {
  const span = Math.pow(Math.max(0, 1 - xNorm * xNorm), 0.48)
  const mid = 28.6 + xNorm * 3.8
  return {
    top: mid + span * 19.4,
    bot: mid - span * 8.2,
    lean: span,
  }
}

function gridGeometry(
  cols: number,
  rows: number,
  at: (u: number, v: number) => [number, number, number],
) {
  const pos: number[] = []
  const uv: number[] = []
  for (let j = 0; j <= rows; j += 1) {
    const v = j / rows
    for (let i = 0; i <= cols; i += 1) {
      const u = i / cols
      const p = at(u, v)
      pos.push(p[0], p[1], p[2])
      uv.push(u, v)
    }
  }
  const stride = cols + 1
  const idx: number[] = []
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * stride + i
      idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** Front sign: eye outline, venue line, and ARENA. Painted color, not a light bake. */
function arenaSignTexture() {
  return canvasTex(1024, 420, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1a4fd6'
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.moveTo(86, h * 0.58)
    ctx.quadraticCurveTo(w * 0.5, 36, w - 86, h * 0.54)
    ctx.quadraticCurveTo(w * 0.5, h - 10, 86, h * 0.58)
    ctx.stroke()
    ctx.beginPath()
    ctx.lineWidth = 14
    ctx.arc(w * 0.5, 86, 34, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = '#1a4fd6'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 30px Arial'
    ctx.fillText('SM', w * 0.5, 88)
    ctx.fillStyle = '#e10600'
    ctx.font = '700 28px Arial'
    ctx.fillText('MALL OF ASIA', w * 0.5, h * 0.48)
    ctx.fillStyle = '#1a4fd6'
    ctx.font = '800 108px Arial'
    ctx.fillText('ARENA', w * 0.5, h * 0.7)
  })
}

function metreUv(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position')
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 3)
  uv.needsUpdate = true
}

/**
 * South elevation: silver cheeks and a swept lid around an eye of glass.
 * The right corner is the near canthus from the outside camera.
 */
function addEyeFront(root: THREE.Group, facadeB: number, aniso: number) {
  const halfW = 46
  const eyeW = 34
  const zWall = facadeB + 1.15
  const steps = 56
  const cladding = claddingTexture()
  cladding.anisotropy = aniso
  const metal = new THREE.MeshStandardMaterial({
    map: cladding,
    color: '#f4f8fa',
    roughness: 0.4,
    metalness: 0.44,
    side: THREE.DoubleSide,
  })
  const glassMap = eyeGlassTexture()
  glassMap.anisotropy = aniso
  const glass = new THREE.MeshStandardMaterial({
    map: glassMap,
    color: '#ffffff',
    roughness: 0.14,
    metalness: 0.02,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
  })

  const shellTop = (xNorm: number) => {
    const span = Math.pow(Math.max(0, 1 - xNorm * xNorm), 0.4)
    return 31.4 + xNorm * 4.2 + span * 18.2
  }
  const shape = new THREE.Shape()
  shape.moveTo(-halfW, 0.4)
  shape.lineTo(-halfW, shellTop(-1))
  for (let i = 1; i <= steps; i += 1) {
    const xNorm = -1 + (i / steps) * 2
    shape.lineTo(xNorm * halfW, shellTop(xNorm))
  }
  shape.lineTo(halfW, 0.4)

  const hole = new THREE.Path()
  hole.moveTo(eyeW, eyeLids(1).top)
  for (let i = 1; i <= steps; i += 1) {
    const xNorm = 1 - (i / steps) * 2
    const open = eyeLids(xNorm)
    hole.lineTo(xNorm * eyeW, open.bot + open.lean * 0.4)
  }
  for (let i = 1; i <= steps; i += 1) {
    const xNorm = -1 + (i / steps) * 2
    const open = eyeLids(xNorm)
    hole.lineTo(xNorm * eyeW, open.top - open.lean * 0.95)
  }
  shape.holes.push(hole)

  const skinGeo = new THREE.ShapeGeometry(shape, 1)
  metreUv(skinGeo)
  const skin = new THREE.Mesh(skinGeo, metal)
  skin.position.z = zWall
  skin.castShadow = false
  skin.receiveShadow = true
  root.add(skin)

  const eye = gridGeometry(64, 26, (u, v) => {
    const xNorm = u * 2 - 1
    const lids = eyeLids(xNorm)
    const inset = lids.lean * 1.05
    const y = THREE.MathUtils.lerp(lids.bot + inset * 0.35, lids.top - inset, v)
    return [xNorm * eyeW, y, zWall + 0.35]
  })
  const eyeMesh = new THREE.Mesh(eye, glass)
  eyeMesh.castShadow = false
  eyeMesh.receiveShadow = true
  root.add(eyeMesh)

  const signMap = arenaSignTexture()
  signMap.anisotropy = Math.min(4, aniso)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22 * (420 / 1024)),
    new THREE.MeshStandardMaterial({
      map: signMap,
      emissiveMap: signMap,
      emissive: '#ffffff',
      emissiveIntensity: 0.4,
      transparent: true,
      depthWrite: false,
      roughness: 0.42,
      metalness: 0,
    }),
  )
  sign.position.set(0, 26.4, zWall + 0.85)
  root.add(sign)
}

/** Lift only the south brim into an eyelid. Plan and the bowl stay put. */
function sculptSouthLid(geo: THREE.BufferGeometry, facadeB: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (z < facadeB - 2) continue
    const front = THREE.MathUtils.smoothstep(z, facadeB, facadeB + 12)
    const xNorm = THREE.MathUtils.clamp(x / 46, -1, 1)
    const span = Math.pow(Math.max(0, 1 - xNorm * xNorm), 0.45)
    const lift = (3.2 + span * 7.5 + xNorm * 1.4) * front
    pos.setY(i, y + lift)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

function stageDeckTexture() {
  return canvasTex(512, 768, (ctx, w, h) => {
    const rand = rng(17)
    ctx.fillStyle = '#3a4048'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 28) {
      const tone = 52 + ((y / 28) % 3) * 7
      ctx.fillStyle = `rgb(${tone},${tone + 2},${tone + 5})`
      ctx.fillRect(0, y + 1, w, 26)
      ctx.fillStyle = 'rgba(18,20,24,0.55)'
      ctx.fillRect(0, y, w, 2)
    }
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fillRect(rand() * w, rand() * h, 8 + rand() * 40, 2)
    }
    const padX = w * 0.16
    const padY = h * 0.22
    ctx.fillStyle = '#4c545e'
    ctx.fillRect(padX, padY, w - padX * 2, h - padY * 2)
    ctx.strokeStyle = 'rgba(236,232,224,0.72)'
    ctx.lineWidth = 5
    ctx.strokeRect(padX, padY, w - padX * 2, h - padY * 2)
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.58, 28, 0, TAU)
    ctx.stroke()
  })
}

function ledWallTexture() {
  return canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#f4f7fb'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = 'rgba(8,12,20,0.22)'
    for (let y = 0; y < 256; y += 3) ctx.fillRect(0, y, 256, 1)
    for (let x = 0; x < 256; x += 3) ctx.fillRect(x, 0, 1, 256)
  }, true)
}

export function buildConcertStage(
  accent: string,
  aniso: number,
  size?: { width?: number; depth?: number; deckY?: number; led?: boolean },
) {
  const stageW = size?.width ?? 104 * MAP_SCALE
  const stageD = size?.depth ?? 156 * MAP_SCALE
  const deckY = size?.deckY ?? 3.05
  const root = new THREE.Group()
  const black = new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.88, metalness: 0.04 })
  const metal = new THREE.MeshStandardMaterial({ color: '#d5dee6', roughness: 0.34, metalness: 0.62 })
  const deckMap = stageDeckTexture()
  deckMap.anisotropy = aniso
  const deckMat = new THREE.MeshStandardMaterial({ map: deckMap, color: '#ffffff', roughness: 0.74, metalness: 0 })
  const ledMap = ledWallTexture()
  ledMap.anisotropy = Math.min(4, aniso)
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledMap,
    color: accent,
    emissive: accent,
    emissiveMap: ledMap,
    emissiveIntensity: 1.45,
    roughness: 0.38,
    metalness: 0,
  })
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#fff6e4',
    emissive: '#ffd59a',
    emissiveIntensity: 1.15,
    roughness: 0.42,
    metalness: 0,
  })
  const speakerMat = new THREE.MeshStandardMaterial({ color: '#24282e', roughness: 0.7, metalness: 0.08 })
  const grille = new THREE.MeshStandardMaterial({ color: '#aeb6be', roughness: 0.48, metalness: 0.16 })

  const add = (mesh: THREE.Mesh) => {
    root.add(mesh)
    return mesh
  }

  const plinth = add(new THREE.Mesh(new THREE.BoxGeometry(stageW, deckY, stageD), black))
  plinth.position.set(0, deckY / 2, 0)
  plinth.castShadow = true
  plinth.receiveShadow = true

  const deck = add(new THREE.Mesh(new THREE.BoxGeometry(stageW - 0.16, 0.08, stageD - 0.16), deckMat))
  deck.position.set(0, deckY + 0.04, 0)
  deck.receiveShadow = true

  const fascia = add(
    new THREE.Mesh(
      new THREE.BoxGeometry(stageW * 0.62, 0.7, 0.14),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.22,
        roughness: 0.48,
        metalness: 0.04,
      }),
    ),
  )
  fascia.position.set(0, deckY * 0.55, stageD / 2 + 0.04)

  const beam = 0.72
  const spanX = stageW - 2.6
  const spanZ = stageD * 0.5
  const trussZ = stageD * 0.06
  const trussY = deckY + 4.7
  const place = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat))
    mesh.position.set(x, y, z)
    return mesh
  }
  place(spanX, beam, beam, 0, trussY, trussZ - spanZ / 2, metal)
  place(spanX, beam, beam, 0, trussY, trussZ + spanZ / 2, metal)
  place(beam, beam, spanZ, spanX / 2, trussY, trussZ, metal)
  place(beam, beam, spanZ, -spanX / 2, trussY, trussZ, metal)
  for (const x of [spanX / 2, -spanX / 2]) {
    for (const z of [trussZ - spanZ / 2, trussZ + spanZ / 2]) {
      place(0.48, trussY - deckY, 0.48, x, deckY + (trussY - deckY) / 2, z, metal)
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const x = -spanX / 2 + ((i + 0.5) * spanX) / 6
    place(0.62, 0.42, 0.62, x, trussY - 0.7, trussZ + spanZ / 2, lampMat)
    place(0.62, 0.42, 0.62, x, trussY - 0.7, trussZ - spanZ / 2, lampMat)
  }

  if (size?.led !== false) {
    const ledH = 4.4
    const tilt = -0.62
    const half = ledH / 2
    const bottomZ = -stageD / 2 + 3.2
    const led = add(new THREE.Mesh(new THREE.BoxGeometry(stageW * 0.7, ledH, 0.22), ledMat))
    led.rotation.x = tilt
    led.position.set(0, deckY + half * Math.cos(tilt), bottomZ + half * Math.sin(tilt))
    const bezel = add(new THREE.Mesh(new THREE.BoxGeometry(stageW * 0.76, ledH + 0.36, 0.16), black))
    bezel.rotation.x = tilt
    bezel.position.set(led.position.x, led.position.y - 0.14, led.position.z - 0.2)
  }

  place(4.6, 0.34, 3.4, 0, deckY + 0.2, trussZ - spanZ / 2 + 2.4, black)

  ;[-1, 1].forEach((side) => {
    const x = side * (stageW / 2 - 1.35)
    const z = stageD / 2 - 1.7
    place(1.7, 2.7, 1.15, x, deckY + 1.35, z, speakerMat).castShadow = true
    place(1.35, 2.15, 0.08, x, deckY + 1.4, z + 0.58, grille)
  })
  return root
}

function insideRoundedRect(x: number, z: number, a: number, b: number) {
  const radius = Math.min(a, b) * 0.3
  const hw = Math.max(a - radius, 0)
  const hd = Math.max(b - radius, 0)
  const ax = Math.abs(x)
  const az = Math.abs(z)
  if (ax <= hw) return az <= b
  if (az <= hd) return ax <= a
  const dx = ax - hw
  const dz = az - hd
  return dx * dx + dz * dz <= radius * radius
}

/** Center-hung video cube. Mall of Asia hangs its LED screens over center court, not on the stage. */
function addCenterScreen(root: THREE.Group, accent: string, aniso: number, roofY: number) {
  const ledMap = ledWallTexture()
  ledMap.anisotropy = Math.min(4, aniso)
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledMap,
    color: accent,
    emissive: accent,
    emissiveMap: ledMap,
    emissiveIntensity: 1.35,
    roughness: 0.4,
    metalness: 0,
  })
  const housing = new THREE.MeshStandardMaterial({ color: '#1c2128', roughness: 0.62, metalness: 0.18 })
  const metal = new THREE.MeshStandardMaterial({ color: '#c5ced6', roughness: 0.34, metalness: 0.62 })
  const w = 18
  const h = 6.5
  const d = 12
  const hang = 2.2
  const group = new THREE.Group()
  group.position.set(0, roofY - hang - h / 2, 0)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), housing)
  group.add(body)
  const faces: Array<[number, number, number, number, number, number]> = [
    [w * 0.9, h * 0.78, 0.14, 0, 0, d / 2 + 0.04],
    [w * 0.9, h * 0.78, 0.14, 0, 0, -(d / 2 + 0.04)],
    [0.14, h * 0.78, d * 0.86, w / 2 + 0.04, 0, 0],
    [0.14, h * 0.78, d * 0.86, -(w / 2 + 0.04), 0, 0],
    [w * 0.9, 0.14, d * 0.86, 0, -(h / 2 + 0.04), 0],
  ]
  faces.forEach(([fw, fh, fd, x, y, z]) => {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), ledMat)
    screen.position.set(x, y, z)
    group.add(screen)
  })
  const truss = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.32, d + 1.4), metal)
  truss.position.y = h / 2 + 0.7
  group.add(truss)
  ;[
    [w / 2 - 0.5, d / 2 - 0.5],
    [w / 2 - 0.5, -(d / 2 - 0.5)],
    [-(w / 2 - 0.5), d / 2 - 0.5],
    [-(w / 2 - 0.5), -(d / 2 - 0.5)],
  ].forEach(([x, z]) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, hang + 0.6, 6), metal)
    stem.position.set(x, h / 2 + hang / 2, z)
    group.add(stem)
  })
  root.add(group)
}

function addConcertStage(root: THREE.Group, accent: string, aniso: number) {
  root.add(buildConcertStage(accent, aniso, { led: false }))
}

function asphaltTexture() {
  return canvasTex(256, 256, (ctx) => {
    const rand = rng(8)
    ctx.fillStyle = '#59616a'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4000; i += 1) {
      const tone = 70 + Math.floor(rand() * 40)
      ctx.fillStyle = `rgba(${tone},${tone + 2},${tone + 4},0.35)`
      ctx.fillRect(rand() * 256, rand() * 256, 1, 1)
    }
  }, true)
}

function skyTexture() {
  return canvasTex(8, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#7eafd4')
    g.addColorStop(0.42, '#d7e7f3')
    g.addColorStop(1, '#f6f4ee')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 512)
  })
}

export function chairGeometry() {
  const cushion = new THREE.BoxGeometry(0.44, 0.09, 0.4)
  cushion.translate(0, 0.2, 0.04)
  const back = new THREE.BoxGeometry(0.44, 0.36, 0.055)
  back.translate(0, 0.44, -0.155)
  const merged = mergeGeometries([cushion, back])
  if (!merged) throw new Error('chair geometry')
  merged.computeVertexNormals()
  return merged
}

function mapToWorld(x: number, y: number) {
  return {
    x: (x - ARENA_CENTER.x) * MAP_SCALE,
    z: (y - ARENA_CENTER.y) * MAP_SCALE,
  }
}

/** Puts the cushion just above the deck. The chair mesh itself starts 0.16 m above its origin. */
const SEAT_CLEARANCE = -0.08
function bowlY(x: number, z: number) {
  return 0.4 + Math.hypot(x, z) * 0.15
}

function sectionFloorY(id: TierId, x: number, z: number) {
  const step = id === 'svip' ? 0 : id.startsWith('lower') ? 0.06 : id.startsWith('upper') ? 0.12 : 0.18
  return bowlY(x, z) + step
}

/** Push each corner out from the block center so the ~3px chart aisles stop showing grass. */
function expandPolygon(points: Pt[], pad: number): Pt[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return points.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad }
  })
}

function tierRank(id: TierId): 1 | 2 | 3 {
  if (id.startsWith('upper')) return 2
  if (id === 'ga') return 3
  return 1
}

type SeatDraft = StadiumSeat & { x: number; y: number; z: number; yaw: number; color: string }

function clearOfEdge(x: number, y: number, points: Pt[], margin: number) {
  if (!pointInPolygon(x, y, points)) return false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const ax = points[j].x
    const ay = points[j].y
    const bx = points[i].x
    const by = points[i].y
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / len2))
    if (Math.hypot(x - (ax + abx * t), y - (ay + aby * t)) < margin) return false
  }
  return true
}

/** Even rows and columns inside each block, held back from the aisle the same way on every side. */
function layoutSeats(): SeatDraft[] {
  const seats: SeatDraft[] = []
  const margin = 2.1
  ARENA_BLOCKS.forEach((block, blockIndex) => {
    if (block.id === 'svip') return
    const bounds = blockBounds(block.points)
    const worldW = Math.max(bounds.w - margin * 2, 4) * MAP_SCALE
    const worldH = Math.max(bounds.h - margin * 2, 4) * MAP_SCALE
    const pitch = Math.sqrt((worldW * worldH) / Math.max(block.capacity, 1))
    const seatPitch = Math.max(0.48, pitch * 0.92)
    const cols = Math.max(2, Math.round(worldW / seatPitch))
    const rows = Math.max(2, Math.round(worldH / (seatPitch * 1.12)))
    const color = fillForBlock(block)
    let number = 0
    for (let row = 0; row < rows; row += 1) {
      const y = bounds.minY + margin + ((bounds.h - margin * 2) * (row + 0.5)) / rows
      for (let col = 0; col < cols; col += 1) {
        const x = bounds.minX + margin + ((bounds.w - margin * 2) * (col + 0.5)) / cols
        if (!clearOfEdge(x, y, block.points, margin * 0.65)) continue
        number += 1
        const w = mapToWorld(x, y)
        seats.push({
          tier: tierRank(block.id),
          row: row + 1,
          number,
          section: blockIndex,
          tierId: block.id,
          blockKey: block.key,
          x: w.x,
          y: sectionFloorY(block.id, w.x, w.z) + SEAT_CLEARANCE,
          z: w.z,
          yaw: Math.atan2(-w.x, -w.z),
          color,
        })
      }
    }
  })
  return seats
}

function subdivideTriangles(geo: THREE.BufferGeometry) {
  const srcPos = geo.attributes.position
  const index = geo.getIndex()
  if (!index) return geo
  const src = index.array
  const verts: number[] = []
  const idx: number[] = []
  const mid = new Map<string, number>()
  const add = (x: number, y: number, z: number) => {
    const at = verts.length / 3
    verts.push(x, y, z)
    return at
  }
  for (let i = 0; i < srcPos.count; i += 1) add(srcPos.getX(i), srcPos.getY(i), srcPos.getZ(i))
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const found = mid.get(key)
    if (found !== undefined) return found
    const at = add(
      (srcPos.getX(a) + srcPos.getX(b)) / 2,
      (srcPos.getY(a) + srcPos.getY(b)) / 2,
      (srcPos.getZ(a) + srcPos.getZ(b)) / 2,
    )
    mid.set(key, at)
    return at
  }
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t]
    const b = src[t + 1]
    const c = src[t + 2]
    const ab = midpoint(a, b)
    const bc = midpoint(b, c)
    const ca = midpoint(c, a)
    idx.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca)
  }
  const next = new THREE.BufferGeometry()
  next.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  next.setIndex(idx)
  return next
}

/** Deck follows the same rake as the seats, including the middle of each section. */
function sectionDeck(points: Pt[], id: TierId) {
  const shape = new THREE.Shape()
  points.forEach((p, i) => {
    const w = mapToWorld(p.x, p.y)
    if (i === 0) shape.moveTo(w.x, -w.z)
    else shape.lineTo(w.x, -w.z)
  })
  let geo: THREE.BufferGeometry = new THREE.ShapeGeometry(shape)
  for (let pass = 0; pass < 4; pass += 1) geo = subdivideTriangles(geo)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, sectionFloorY(id, x, z))
    uv[i * 2] = x / 2
    uv[i * 2 + 1] = z / 2
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}

function roofGeometry(roof: { a0: number; b0: number; a1: number; b1: number; y0: number; crown: number }) {
  const angSegs = 144
  const radSegs = 28
  const ribs = 28
  const pos: number[] = []
  const col: number[] = []
  for (let i = 0; i < angSegs; i += 1) {
    const theta = (i / angSegs) * TAU
    const rib = Math.cos(theta * ribs)
    for (let j = 0; j <= radSegs; j += 1) {
      const t = j / radSegs
      const a = roof.a0 + (roof.a1 - roof.a0) * t
      const b = roof.b0 + (roof.b1 - roof.b0) * t
      const arch = Math.sin(Math.PI * t) * roof.crown
      const sag = (1 - Math.max(rib, 0)) * 0.22 * Math.sin(Math.PI * t)
      const p = ellipse(a, b, theta, roof.y0 + arch - sag)
      pos.push(p[0], p[1], p[2])
      const band = rib > 0 ? rib ** 8 : 0
      const shade = 1 - band * 0.34
      col.push(shade * 0.78, shade * 0.84, shade * 0.9)
    }
  }
  const stride = radSegs + 1
  const idx: number[] = []
  for (let i = 0; i < angSegs; i += 1) {
    for (let j = 0; j < radSegs; j += 1) {
      const a = i * stride + j
      const c = ((i + 1) % angSegs) * stride + j
      idx.push(a, c, a + 1, a + 1, c, c + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function bindSeatIdentity(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTier;
        attribute float aRow;
        attribute float aNumber;
        varying float vTier;
        varying float vRow;
        varying float vNumber;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTier = aTier;
        vRow = aRow;
        vNumber = aNumber;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vTier;
        varying float vRow;
        varying float vNumber;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb *= 0.985 + 0.015 * fract(vNumber * 0.17 + vRow * 0.13 + vTier);`,
      )
  }
  return material
}

function swayCanopy(material: THREE.MeshStandardMaterial) {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.85 } }
  const patch = (shader: { vertexShader: string; uniforms: Record<string, { value: number }> }) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWind = uniforms.uWind
    shader.vertexShader = `uniform float uTime; uniform float uWind;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float ph = position.x * 1.7 + position.z;
      transformed.x += sin(uTime * 1.6 + ph) * 0.035 * uWind * position.y;
      transformed.z += cos(uTime * 1.25 + ph) * 0.028 * uWind * position.y;`,
    )}`
  }
  material.onBeforeCompile = patch
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  depth.onBeforeCompile = patch
  return { uniforms, depth }
}

export function createStadium(scene: THREE.Scene, renderer: THREE.WebGLRenderer, accent: string) {
  const m = bowlMetrics()
  const root = new THREE.Group()
  root.name = 'stadium'
  scene.add(root)

  const skyTex = skyTexture()
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 28, 18),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false }),
  )
  sky.frustumCulled = false
  root.add(sky)

  scene.background = new THREE.Color('#d5e4f0')
  scene.fog = new THREE.FogExp2('#c5d5e2', 0.00115)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), sky.material))
  const envMap = pmrem.fromScene(envScene, 0.04).texture
  scene.environment = envMap
  scene.environmentIntensity = 0.85
  pmrem.dispose()

  const hemi = new THREE.HemisphereLight('#e7f1f8', '#8a9478', 1.28)
  root.add(hemi)
  root.add(new THREE.AmbientLight('#fff4e4', 0.22))
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.65)
  sun.position.set(32, 72, 28)
  sun.target.position.set(0, 2, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -120
  sun.shadow.camera.right = 120
  sun.shadow.camera.top = 120
  sun.shadow.camera.bottom = -120
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 220
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.12
  root.add(sun)
  root.add(sun.target)
  const fill = new THREE.DirectionalLight('#d7e4f4', 0.72)
  fill.position.set(-40, 26, -24)
  root.add(fill)

  const glassMap = glassTexture()
  glassMap.repeat.set(42, 8)
  const glassMat = new THREE.MeshStandardMaterial({
    map: glassMap,
    color: '#ffffff',
    roughness: 0.16,
    metalness: 0.04,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  })
  const stone = new THREE.MeshStandardMaterial({ color: '#d5dde4', roughness: 0.84, metalness: 0.02 })
  const parkTex = grassTexture(false)
  parkTex.repeat.set(22, 22)
  const parkMat = new THREE.MeshStandardMaterial({ map: parkTex, color: '#ffffff', roughness: 0.96, metalness: 0 })

  const park = new THREE.Mesh(new THREE.PlaneGeometry(980, 980), parkMat)
  park.rotation.x = -Math.PI / 2
  park.receiveShadow = true
  root.add(park)

  const segs = 96
  const walks = new Strip()
  const plinthOuterA = m.facadeA + 9
  const plinthOuterB = m.facadeB + 9
  walks.add(ring(m.facadeA - 0.4, m.facadeB - 0.4, 0.42, segs), ring(plinthOuterA, plinthOuterB, 0.42, segs))
  walks.add(ring(plinthOuterA, plinthOuterB, 0, segs), ring(plinthOuterA, plinthOuterB, 0.42, segs))

  const walkMesh = new THREE.Mesh(walks.geometry(), stone)
  walkMesh.castShadow = true
  walkMesh.receiveShadow = true
  root.add(walkMesh)

  const wall = new Strip()
  const facadeH = m.roof.y0 - 0.6
  wall.add(ring(m.facadeA, m.facadeB, 0.42, segs), ring(m.facadeA, m.facadeB, facadeH, segs))
  const wallGeo = wall.geometry()
  const wallPos = wallGeo.attributes.position
  const wallUv = new Float32Array(wallPos.count * 2)
  for (let i = 0; i < wallPos.count; i += 1) {
    wallUv[i * 2] = (Math.atan2(wallPos.getX(i), wallPos.getZ(i)) / TAU + 1) * 7
    wallUv[i * 2 + 1] = wallPos.getY(i) / facadeH
  }
  wallGeo.setAttribute('uv', new THREE.BufferAttribute(wallUv, 2))
  const wallMesh = new THREE.Mesh(wallGeo, glassMat)
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  root.add(wallMesh)

  const pickables: THREE.Object3D[] = []
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  addConcertStage(root, accent, aniso)
  addCenterScreen(root, accent, aniso, m.roof.y0)
  parkTex.anisotropy = aniso
  glassMap.anisotropy = aniso
  const deckMaps = deckTextures()
  deckMaps.color.anisotropy = aniso
  deckMaps.rough.anisotropy = aniso
  const concrete = new THREE.MeshStandardMaterial({
    map: deckMaps.color,
    roughnessMap: deckMaps.rough,
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })
  const slabMat = concrete.clone()
  slabMat.polygonOffset = false
  const slabN = 96
  const slabExtent = Math.max(m.facadeA, m.facadeB) + 1
  const slabPos: number[] = []
  const slabUv: number[] = []
  const slabIdx: number[] = []
  const insideBowl = (x: number, z: number) => insideRoundedRect(x, z, m.facadeA - 0.35, m.facadeB - 0.35)
  for (let iz = 0; iz <= slabN; iz += 1) {
    for (let ix = 0; ix <= slabN; ix += 1) {
      const x = -slabExtent + (slabExtent * 2 * ix) / slabN
      const z = -slabExtent + (slabExtent * 2 * iz) / slabN
      slabPos.push(x, insideBowl(x, z) ? bowlY(x, z) : -4, z)
      slabUv.push(x / 2, z / 2)
    }
  }
  const slabStride = slabN + 1
  for (let iz = 0; iz < slabN; iz += 1) {
    for (let ix = 0; ix < slabN; ix += 1) {
      const x0 = -slabExtent + (slabExtent * 2 * ix) / slabN
      const z0 = -slabExtent + (slabExtent * 2 * iz) / slabN
      const x1 = -slabExtent + (slabExtent * 2 * (ix + 1)) / slabN
      const z1 = -slabExtent + (slabExtent * 2 * (iz + 1)) / slabN
      if (!insideBowl(x0, z0) || !insideBowl(x1, z0) || !insideBowl(x0, z1) || !insideBowl(x1, z1)) continue
      const a = iz * slabStride + ix
      slabIdx.push(a, a + slabStride, a + 1, a + 1, a + slabStride, a + slabStride + 1)
    }
  }
  const slabGeo = new THREE.BufferGeometry()
  slabGeo.setAttribute('position', new THREE.Float32BufferAttribute(slabPos, 3))
  slabGeo.setAttribute('uv', new THREE.Float32BufferAttribute(slabUv, 2))
  slabGeo.setIndex(slabIdx)
  slabGeo.computeVertexNormals()
  const slab = new THREE.Mesh(slabGeo, slabMat)
  slab.receiveShadow = true
  root.add(slab)

  const apronPos = [0, 0.2, 0]
  const apronUv = [0.5, 0.5]
  const apronIdx: number[] = []
  const apronSegs = 96
  for (let i = 0; i <= apronSegs; i += 1) {
    const point = ellipse(m.facadeA - 0.35, m.facadeB - 0.35, (i / apronSegs) * TAU, 0.2)
    apronPos.push(point[0], point[1], point[2])
    apronUv.push(point[0] / 4, point[2] / 4)
  }
  for (let i = 1; i <= apronSegs; i += 1) apronIdx.push(0, i + 1, i)
  const apronGeo = new THREE.BufferGeometry()
  apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronPos, 3))
  apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(apronUv, 2))
  apronGeo.setIndex(apronIdx)
  apronGeo.computeVertexNormals()
  const apron = new THREE.Mesh(apronGeo, slabMat)
  apron.receiveShadow = true
  root.add(apron)

  const railMat = new THREE.MeshStandardMaterial({ color: '#d5dde4', roughness: 0.32, metalness: 0.62 })
  const treadMat = new THREE.MeshStandardMaterial({ color: '#d9d3c8', roughness: 0.84, metalness: 0 })
  const postGeo = new THREE.CylinderGeometry(0.035, 0.04, 1, 6)
  const barGeo = new THREE.BoxGeometry(1, 1, 1)
  const treadGeo = new THREE.BoxGeometry(1, 1, 1)
  const posts = new THREE.InstancedMesh(postGeo, railMat, 6000)
  const bars = new THREE.InstancedMesh(barGeo, railMat, 8000)
  const treads = new THREE.InstancedMesh(treadGeo, treadMat, 4000)
  const aisleDummy = new THREE.Object3D()
  const aisleUp = new THREE.Vector3(0, 0, 1)
  let postAt = 0
  let barAt = 0
  let treadAt = 0
  const onStage = (x: number, z: number) => Math.abs(x) < 11.2 && Math.abs(z) < 16.2
  const placeBar = (from: THREE.Vector3, to: THREE.Vector3) => {
    if (barAt >= bars.count) return
    const dir = to.clone().sub(from)
    const len = dir.length()
    if (len < 0.08) return
    aisleDummy.position.copy(from).add(to).multiplyScalar(0.5)
    aisleDummy.scale.set(0.05, 0.04, len)
    aisleDummy.quaternion.setFromUnitVectors(aisleUp, dir.multiplyScalar(1 / len))
    aisleDummy.updateMatrix()
    bars.setMatrixAt(barAt, aisleDummy.matrix)
    barAt += 1
    aisleDummy.quaternion.identity()
    aisleDummy.scale.set(1, 1, 1)
  }
  ARENA_BLOCKS.forEach((block) => {
    const center = polygonCentroid(block.points)
    block.points.forEach((start, index) => {
      const end = block.points[(index + 1) % block.points.length]
      const span = Math.hypot(end.x - start.x, end.y - start.y)
      if (span < 8) return
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      const dx = end.x - start.x
      const dy = end.y - start.y
      const len = span || 1
      let nx = -dy / len
      let ny = dx / len
      if ((center.x - midX) * nx + (center.y - midY) * ny > 0) {
        nx = -nx
        ny = -ny
      }
      const steps = Math.max(2, Math.ceil((span * MAP_SCALE) / 1.35))
      const high: THREE.Vector3[] = []
      const mid: THREE.Vector3[] = []
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const mapX = start.x + (end.x - start.x) * t + nx * 1.15
        const mapY = start.y + (end.y - start.y) * t + ny * 1.15
        const world = mapToWorld(mapX, mapY)
        if (onStage(world.x, world.z)) continue
        const floorY = bowlY(world.x, world.z)
        if (postAt < posts.count) {
          aisleDummy.position.set(world.x, floorY + 0.48, world.z)
          aisleDummy.scale.set(1, 0.96, 1)
          aisleDummy.rotation.set(0, 0, 0)
          aisleDummy.updateMatrix()
          posts.setMatrixAt(postAt, aisleDummy.matrix)
          postAt += 1
          aisleDummy.scale.set(1, 1, 1)
        }
        high.push(new THREE.Vector3(world.x, floorY + 0.96, world.z))
        mid.push(new THREE.Vector3(world.x, floorY + 0.52, world.z))
        if (step > 0 && step % 2 === 0 && treadAt < treads.count) {
          aisleDummy.position.set(world.x, floorY + 0.05, world.z)
          aisleDummy.scale.set(0.72, 0.07, 0.22)
          aisleDummy.rotation.set(0, Math.atan2(dx, dy), 0)
          aisleDummy.updateMatrix()
          treads.setMatrixAt(treadAt, aisleDummy.matrix)
          treadAt += 1
          aisleDummy.rotation.set(0, 0, 0)
          aisleDummy.scale.set(1, 1, 1)
        }
      }
      for (let step = 1; step < high.length; step += 1) {
        placeBar(high[step - 1], high[step])
        placeBar(mid[step - 1], mid[step])
      }
    })
  })
  posts.count = Math.max(postAt, 1)
  bars.count = Math.max(barAt, 1)
  treads.count = Math.max(treadAt, 1)
  posts.instanceMatrix.needsUpdate = true
  bars.instanceMatrix.needsUpdate = true
  treads.instanceMatrix.needsUpdate = true
  root.add(posts, bars, treads)

  const deckByKey = new Map<string, THREE.MeshStandardMaterial>()
  ARENA_BLOCKS.forEach((block) => {
    const material = concrete.clone()
    deckByKey.set(block.key, material)
    const deck = new THREE.Mesh(sectionDeck(expandPolygon(block.points, 0.7), block.id), material)
    deck.userData.tierId = block.id
    deck.userData.blockKey = block.key
    deck.receiveShadow = true
    if (block.id === 'svip') {
      deck.position.y = 0.22
      deck.renderOrder = 2
    }
    root.add(deck)
    pickables.push(deck)
  })

  const asphalt = asphaltTexture()
  asphalt.anisotropy = aniso
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: '#ffffff', roughness: 0.94, metalness: 0 })
  const belt = new Strip()
  const roadOuterA = plinthOuterA + 18
  const roadOuterB = plinthOuterB + 18
  belt.add(ring(plinthOuterA + 0.8, plinthOuterB + 0.8, 0.05, segs), ring(roadOuterA, roadOuterB, 0.05, segs))
  const beltGeo = belt.geometry()
  const beltPos = beltGeo.attributes.position
  const beltUv = new Float32Array(beltPos.count * 2)
  for (let i = 0; i < beltPos.count; i += 1) {
    beltUv[i * 2] = beltPos.getX(i) / 8
    beltUv[i * 2 + 1] = beltPos.getZ(i) / 8
  }
  beltGeo.setAttribute('uv', new THREE.BufferAttribute(beltUv, 2))
  const beltMesh = new THREE.Mesh(beltGeo, roadMat)
  beltMesh.receiveShadow = true
  root.add(beltMesh)

  addEyeFront(root, m.facadeB, aniso)

  const roadNear = roadOuterB + 0.4
  const roadLength = 48
  const approach = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.06, roadLength),
    roadMat,
  )
  approach.position.set(0, 0.05, roadNear + roadLength / 2)
  approach.receiveShadow = true
  root.add(approach)

  const roofMat = new THREE.MeshStandardMaterial({
    color: '#e4ebf0',
    roughness: 0.38,
    metalness: 0.46,
    side: THREE.DoubleSide,
    vertexColors: true,
  })
  const roofGeo = roofGeometry(m.roof)
  sculptSouthLid(roofGeo, m.facadeB)
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.castShadow = false
  roof.receiveShadow = true
  root.add(roof)
  const lip = new Strip()
  lip.add(ring(m.roof.a0, m.roof.b0, m.roof.y0 - 0.15, segs), ring(m.roof.a0, m.roof.b0, m.roof.y0 + 0.7, segs))
  const lipMesh = new THREE.Mesh(lip.geometry(), new THREE.MeshStandardMaterial({ color: '#eef3f6', roughness: 0.34, metalness: 0.4, side: THREE.DoubleSide }))
  lipMesh.castShadow = false
  root.add(lipMesh)

  const finGeo = new THREE.BoxGeometry(1, 1, 1)
  const finMat = new THREE.MeshStandardMaterial({ color: '#f4f8fa', roughness: 0.32, metalness: 0.55 })
  const finCount = 84
  const fins = new THREE.InstancedMesh(finGeo, finMat, finCount)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < finCount; i += 1) {
    const theta = (i / finCount) * TAU
    const onEye = theta < 0.62 || theta > TAU - 0.62
    const p = ellipse(m.facadeA + 0.35, m.facadeB + 0.35, theta, 0)
    dummy.position.set(p[0], 0.42 + (facadeH - 0.42) / 2, p[2])
    dummy.rotation.y = Math.atan2(p[0], p[2])
    dummy.scale.set(onEye ? 0.0001 : 0.1, onEye ? 0.0001 : facadeH - 0.4, onEye ? 0.0001 : 0.55)
    dummy.updateMatrix()
    fins.setMatrixAt(i, dummy.matrix)
  }
  fins.instanceMatrix.needsUpdate = true
  root.add(fins)

  const drafts = layoutSeats()
  const records: StadiumSeat[] = drafts.map(({ tier, row, number, section, tierId, blockKey }) => ({
    tier, row, number, section, tierId, blockKey,
  }))
  const chair = chairGeometry()
  const tiersA = new Float32Array(drafts.length)
  const rowsA = new Float32Array(drafts.length)
  const numsA = new Float32Array(drafts.length)
  drafts.forEach((seat, i) => {
    tiersA[i] = seat.tier
    rowsA[i] = seat.row
    numsA[i] = seat.number
  })
  chair.setAttribute('aTier', new THREE.InstancedBufferAttribute(tiersA, 1))
  chair.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowsA, 1))
  chair.setAttribute('aNumber', new THREE.InstancedBufferAttribute(numsA, 1))
  const fabric = seatFabric()
  fabric.anisotropy = aniso
  const seatMat = bindSeatIdentity(new THREE.MeshStandardMaterial({
    map: fabric,
    color: '#ffffff',
    roughness: 0.86,
    metalness: 0,
  }))
  const seats = new THREE.InstancedMesh(chair, seatMat, drafts.length)
  seats.name = 'seats'
  seats.userData.seats = records
  const scratch = new THREE.Color()
  drafts.forEach((seat, i) => {
    dummy.position.set(seat.x, seat.y, seat.z)
    dummy.rotation.set(0, seat.yaw, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    seats.setMatrixAt(i, dummy.matrix)
    const jitter = 0.9 + ((seat.section * 17 + seat.row * 3 + seat.number) % 7) * 0.02
    scratch.set(seat.color).multiplyScalar(jitter)
    seats.setColorAt(i, scratch)
  })
  seats.instanceMatrix.needsUpdate = true
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true
  seats.castShadow = false
  seats.receiveShadow = true
  seats.computeBoundingSphere()
  root.add(seats)
  pickables.push(seats)

  const canopyGeo = new THREE.IcosahedronGeometry(1.7, 1)
  canopyGeo.scale(1, 0.7, 1)
  canopyGeo.translate(0, 3.5, 0)
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0 })
  const sway = swayCanopy(canopyMat)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 3.1, 6)
  trunkGeo.translate(0, 1.55, 0)
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6a4630', roughness: 0.9 })
  const treeRand = rng(11)
  const spots: Array<{ x: number; z: number; s: number; g: number }> = []
  let guard = 0
  while (spots.length < 70 && guard < 5000) {
    guard += 1
    const theta = treeRand() * TAU
    if (theta < 0.34 || theta > TAU - 0.34) continue
    const rad = 1.42 + treeRand() * 0.55
    const p = ellipse(m.facadeA * rad, m.facadeB * rad, theta, 0)
    const x = p[0]
    const z = p[2]
    if (spots.some((spot) => (spot.x - x) ** 2 + (spot.z - z) ** 2 < 42)) continue
    spots.push({ x, z, s: 0.75 + treeRand() * 0.7, g: treeRand() })
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length)
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length)
  canopies.customDepthMaterial = sway.depth
  const greens = [new THREE.Color('#1e6a38'), new THREE.Color('#2f8a49'), new THREE.Color('#174e2b'), new THREE.Color('#46a15a')]
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0, spot.z)
    dummy.rotation.set(0, spot.g * TAU, 0)
    dummy.scale.set(spot.s, spot.s, spot.s)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    canopies.setMatrixAt(i, dummy.matrix)
    canopies.setColorAt(i, greens[i % greens.length])
  })
  trunks.instanceMatrix.needsUpdate = true
  canopies.instanceMatrix.needsUpdate = true
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
  trunks.castShadow = true
  canopies.castShadow = true
  canopies.receiveShadow = true
  root.add(trunks)
  root.add(canopies)

  const baseColors = seats.instanceColor ? new Float32Array(seats.instanceColor.array) : new Float32Array()
  const paintScratch = new THREE.Color()
  const paint = (blockKey: string | null, hotAccent: string) => {
    if (seats.instanceColor) {
      const hot = blockKey ? new THREE.Color(hotAccent) : null
      for (let i = 0; i < records.length; i += 1) {
        if (hot && records[i].blockKey === blockKey) paintScratch.copy(hot)
        else if (hot) paintScratch.setRGB(baseColors[i * 3] * 0.38, baseColors[i * 3 + 1] * 0.38, baseColors[i * 3 + 2] * 0.38)
        else paintScratch.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])
        seats.setColorAt(i, paintScratch)
      }
      seats.instanceColor.needsUpdate = true
    }
    deckByKey.forEach((material, key) => {
      const block = ARENA_BLOCKS.find((item) => item.key === key)
      const standing = block?.id === 'svip'
      if (blockKey && key === blockKey && standing && block) {
        material.color.set(fillForBlock(block))
        material.emissive.set(hotAccent)
        material.emissiveIntensity = 0.85
      } else {
        material.color.set('#ffffff')
        material.emissive.set('#000000')
        material.emissiveIntensity = 0
      }
    })
  }

  const viewOf = (blockKey: string, aspect = 1.7) => {
    const block = ARENA_BLOCKS.find((item) => item.key === blockKey)
    if (!block) return null
    const center = polygonCentroid(block.points)
    const w = mapToWorld(center.x, center.y)
    const reach = Math.hypot(w.x, w.z) || 1
    const inX = -w.x / reach
    const inZ = -w.z / reach
    const corners: { x: number; y: number; z: number }[] = []
    block.points.forEach((point) => {
      const q = mapToWorld(point.x, point.y)
      const floor = sectionFloorY(block.id, q.x, q.z)
      corners.push({ x: q.x, y: floor + 0.08, z: q.z })
      corners.push({ x: q.x, y: floor + 0.9, z: q.z })
    })
    const look = new THREE.Vector3(
      w.x,
      corners.reduce((sum, point) => sum + point.y, 0) / corners.length,
      w.z,
    )
    const fovY = THREE.MathUtils.degToRad(42)
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(aspect, 0.7))
    const limitX = Math.tan(fovX / 2) * 0.86
    const limitY = Math.tan(fovY / 2) * 0.86
    const stageHalfX = (104 * MAP_SCALE) / 2 + 0.6
    const stageHalfZ = (156 * MAP_SCALE) / 2 + 0.6
    const stageClear = 3.05 + 4.7 + 1.4
    const poseAt = (dist: number) => {
      const pitch = 0.32
      const cam = new THREE.Vector3(
        w.x + inX * dist * Math.cos(pitch),
        look.y + dist * Math.sin(pitch),
        w.z + inZ * dist * Math.cos(pitch),
      )
      const ground = bowlY(cam.x, cam.z) + 1.7
      if (cam.y < ground) cam.y = ground
      if (Math.abs(cam.x) < stageHalfX && Math.abs(cam.z) < stageHalfZ && cam.y < stageClear) cam.y = stageClear
      return cam
    }
    const fits = (dist: number) => {
      const cam = poseAt(dist)
      const forward = look.clone().sub(cam)
      const span = forward.length()
      if (span < 1) return null
      forward.multiplyScalar(1 / span)
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
      if (right.lengthSq() < 1e-6) return null
      right.normalize()
      const up = new THREE.Vector3().crossVectors(right, forward).normalize()
      for (let i = 0; i < corners.length; i += 1) {
        const point = corners[i]
        const dx = point.x - cam.x
        const dy = point.y - cam.y
        const dz = point.z - cam.z
        const depth = dx * forward.x + dy * forward.y + dz * forward.z
        if (depth < 1.2) return null
        const x = (dx * right.x + dy * right.y + dz * right.z) / depth
        const y = (dx * up.x + dy * up.y + dz * up.z) / depth
        if (Math.abs(x) > limitX || Math.abs(y) > limitY) return null
      }
      return cam
    }
    let hi = 8
    let cam = fits(hi)
    while (!cam && hi < 96) {
      hi += 4
      cam = fits(hi)
    }
    if (cam) {
      let lo = 4
      for (let i = 0; i < 14; i += 1) {
        const mid = (lo + hi) / 2
        const trial = fits(mid)
        if (trial) {
          hi = mid
          cam = trial
        } else lo = mid
      }
    }
    return { pos: cam ?? poseAt(28), look }
  }

  const dispose = () => {
    scene.remove(root)
    scene.environment = null
    scene.fog = null
    scene.background = null
    envMap.dispose()
    const geos = new Set<THREE.BufferGeometry>()
    const mats = new Set<THREE.Material>()
    const tex = new Set<THREE.Texture>()
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geos.add(obj.geometry)
        const list = Array.isArray(obj.material) ? obj.material : [obj.material]
        list.forEach((mat) => {
          mats.add(mat)
          const maps = mat as THREE.MeshStandardMaterial
          if (maps.map) tex.add(maps.map)
          if (maps.roughnessMap) tex.add(maps.roughnessMap)
        })
      }
    })
    geos.forEach((geo) => geo.dispose())
    mats.forEach((mat) => mat.dispose())
    tex.forEach((map) => map.dispose())
    concrete.dispose()
    sway.depth.dispose()
  }

  const frame: StadiumFrame = {
    pitchA: m.lower.a0,
    pitchB: m.lower.b0,
    roofY: m.roof.y0 + m.roof.crown,
    outerA: m.facadeA,
    outerB: m.facadeB,
  }

  return {
    seats,
    records,
    pickables,
    paint,
    viewOf,
    frame,
    setOverview(_overview?: boolean) {},
    tick(seconds: number, wind: number) {
      sway.uniforms.uTime.value = seconds
      sway.uniforms.uWind.value = wind
    },
    dispose,
  }
}
