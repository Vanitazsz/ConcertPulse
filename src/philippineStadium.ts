import * as THREE from 'three'
import type { Pt } from './arenaGeometry'
import { PH_BLOCKS, PH_CENTER, PH_FAN, type PhBlock } from './philippineGeometry'
import { bindSeatIdentity, buildConcertStage, chairGeometry, deckTextures, seatFabric } from './stadium'
import type { TierId } from './types'

/** Map units → metres. Chosen so a 55,000-seat fan keeps about half a metre between chairs. */
const SCALE = 0.32
const SEAT_CLEARANCE = -0.08
const STAGE = { width: 46, depth: 14, deckY: 2.8 }

type SeatRecord = { tierId: TierId; blockKey: string }

function mapToWorld(x: number, y: number) {
  return { x: (x - PH_CENTER.x) * SCALE, z: (y - PH_CENTER.y) * SCALE }
}

function bowlY(x: number, z: number) {
  return 0.45 + Math.hypot(x, z) * 0.145
}

function sectionFloorY(id: TierId, x: number, z: number) {
  const step = id === 'svip' ? 0 : id.startsWith('lower') ? 0.05 : id.startsWith('upper') ? 0.16 : 0.28
  return bowlY(x, z) + step
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

function ellipseShape(rx: number, rz: number, holeRx = 0, holeRz = 0) {
  const shape = new THREE.Shape()
  const steps = 96
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const x = Math.cos(angle) * rx
    const y = -Math.sin(angle) * rz
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  if (holeRx > 0) {
    const hole = new THREE.Path()
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2
      const x = Math.cos(angle) * holeRx
      const y = -Math.sin(angle) * holeRz
      if (i === 0) hole.moveTo(x, y)
      else hole.lineTo(x, y)
    }
    shape.holes.push(hole)
  }
  return shape
}

function expandPolygon(points: Pt[], pad: number): Pt[] {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length
  return points.map((point) => {
    const dx = point.x - cx
    const dy = point.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: point.x + (dx / len) * pad, y: point.y + (dy / len) * pad }
  })
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

function sectionDeck(points: Pt[]) {
  const shape = new THREE.Shape()
  points.forEach((point, index) => {
    const world = mapToWorld(point.x, point.y)
    if (index === 0) shape.moveTo(world.x, -world.z)
    else shape.lineTo(world.x, -world.z)
  })
  let geo: THREE.BufferGeometry = new THREE.ShapeGeometry(shape)
  for (let pass = 0; pass < 3; pass += 1) geo = subdivideTriangles(geo)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, bowlY(x, z) + 0.04)
    uv[i * 2] = x / 2
    uv[i * 2 + 1] = z / 2
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}

function polar(angle: number, mapR: number) {
  const radius = mapR * SCALE
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, radius }
}

/** Concentric rows. The gap between chairs stays the same along a row and between rows. */
function evenSeats(block: PhBlock) {
  const span = Math.max(block.a1 - block.a0, 0.04)
  const depth = (block.r1 - block.r0) * SCALE
  const midArc = ((block.r0 + block.r1) / 2) * SCALE * span
  const pitch = Math.sqrt((depth * midArc) / Math.max(block.capacity, 1))
  const rowPitch = Math.max(0.7, pitch * 1.12)
  const seatPitch = Math.max(0.46, pitch * 0.9)
  const rows = Math.max(2, Math.round(depth / rowPitch))
  const seats: { x: number; y: number; row: number; number: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    const mapR = block.r0 + ((block.r1 - block.r0) * (row + 0.5)) / rows
    const worldR = mapR * SCALE
    const inset = 0.46 / worldR
    const a0 = block.a0 + inset
    const a1 = block.a1 - inset
    if (a1 <= a0 + 0.01) continue
    const count = Math.max(2, Math.round((worldR * (a1 - a0)) / seatPitch))
    for (let col = 0; col < count; col += 1) {
      const angle = a0 + ((a1 - a0) * (col + 0.5)) / count
      seats.push({
        x: PH_CENTER.x + Math.cos(angle) * mapR,
        y: PH_CENTER.y + Math.sin(angle) * mapR,
        row: row + 1,
        number: col + 1,
      })
    }
  }
  return seats
}

function curtain(samples: { x: number; z: number; y0: number; y1: number }[]) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  samples.forEach((sample, index) => {
    pos.push(sample.x, sample.y0, sample.z, sample.x, sample.y1, sample.z)
    uv.push(index * 0.18, 0, index * 0.18, (sample.y1 - sample.y0) / 4)
    if (index > 0) {
      const a = (index - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function arcWall(mapR: number, top: number) {
  const samples = []
  for (let i = 0; i <= 80; i += 1) {
    const angle = PH_FAN.a0 + ((PH_FAN.a1 - PH_FAN.a0) * i) / 80
    const point = polar(angle, mapR)
    samples.push({ x: point.x, z: point.z, y0: bowlY(point.x, point.z) - 0.2, y1: top })
  }
  return curtain(samples)
}

function sideWall(angle: number, top: number) {
  const samples = []
  for (let i = 0; i <= 28; i += 1) {
    const mapR = 80 + ((342 - 80) * i) / 28
    const point = polar(angle, mapR)
    samples.push({ x: point.x, z: point.z, y0: bowlY(point.x, point.z) - 0.2, y1: top })
  }
  return curtain(samples)
}

function fanFloor() {
  const angSegs = 72
  const radSegs = 40
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= angSegs; i += 1) {
    const angle = PH_FAN.a0 + ((PH_FAN.a1 - PH_FAN.a0) * i) / angSegs
    for (let j = 0; j <= radSegs; j += 1) {
      const mapR = 18 + ((342 - 18) * j) / radSegs
      const point = polar(angle, mapR)
      pos.push(point.x, bowlY(point.x, point.z), point.z)
      uv.push(point.x / 2, point.z / 2)
    }
  }
  const stride = radSegs + 1
  for (let i = 0; i < angSegs; i += 1) {
    for (let j = 0; j < radSegs; j += 1) {
      const a = i * stride + j
      const b = a + stride
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function addEnclosure(root: THREE.Group, floorMat: THREE.Material, anisotropy: number) {
  const floor = new THREE.Mesh(fanFloor(), floorMat)
  floor.receiveShadow = true
  root.add(floor)

  // The oval roof is a full ring. The seats only fill one half, so the other half needs a floor and a wall or the lawn shows through.
  const concourseMat = (floorMat as THREE.MeshStandardMaterial).clone()
  concourseMat.polygonOffset = false
  const concourse = new THREE.Mesh(new THREE.CircleGeometry(1, 96), concourseMat)
  concourse.scale.set(132, 138, 1)
  concourse.rotation.x = -Math.PI / 2
  concourse.position.set(0, 0.25, 8)
  concourse.receiveShadow = true
  root.add(concourse)

  const hallSamples = []
  for (let i = 0; i <= 48; i += 1) {
    const angle = 0.12 + ((Math.PI - 0.24) * i) / 48
    const x = Math.cos(angle) * 120
    const z = Math.sin(angle) * 126 + 6
    hallSamples.push({ x, z, y0: 0.08, y1: 25.2 })
  }
  const hallWall = new THREE.Mesh(curtain(hallSamples), new THREE.MeshStandardMaterial({ color: '#e4dfd6', roughness: 0.78, metalness: 0, side: THREE.DoubleSide }))
  hallWall.receiveShadow = true
  hallWall.castShadow = true
  root.add(hallWall)

  const wallTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e4dfd6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(92, 86, 78, 0.18)'
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 3, h)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    for (let y = 70; y < h; y += 110) ctx.fillRect(0, y, w, 4)
  }, true)
  wallTex.anisotropy = anisotropy
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#ffffff', roughness: 0.78, metalness: 0, side: THREE.DoubleSide })
  const outer = new THREE.Mesh(arcWall(338, 25.4), wallMat)
  const left = new THREE.Mesh(sideWall(PH_FAN.a0, 25.4), wallMat)
  const right = new THREE.Mesh(sideWall(PH_FAN.a1, 25.4), wallMat)
  const knee = new THREE.Mesh(arcWall(36, 1.7), wallMat)
  ;[outer, left, right, knee].forEach((wall) => {
    wall.castShadow = true
    wall.receiveShadow = true
    root.add(wall)
  })

  const railMat = new THREE.MeshStandardMaterial({ color: '#d5dde4', roughness: 0.32, metalness: 0.62 })
  const stepMat = new THREE.MeshStandardMaterial({ color: '#d9d3c8', roughness: 0.84, metalness: 0 })
  const postGeo = new THREE.CylinderGeometry(0.035, 0.04, 1, 6)
  const barGeo = new THREE.BoxGeometry(1, 1, 1)
  const treadGeo = new THREE.BoxGeometry(1, 1, 1)
  const postCount = PH_BLOCKS.length * 2 * 24
  const barCount = PH_BLOCKS.length * 2 * 2 * 24 + 8 * 64
  const treadCount = PH_BLOCKS.length * 24 + 4 * 4 * 48
  const posts = new THREE.InstancedMesh(postGeo, railMat, postCount)
  const bars = new THREE.InstancedMesh(barGeo, railMat, barCount)
  const treads = new THREE.InstancedMesh(treadGeo, stepMat, treadCount)
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3(0, 0, 1)
  let postAt = 0
  let barAt = 0
  let treadAt = 0

  const placeBar = (from: THREE.Vector3, to: THREE.Vector3) => {
    if (barAt >= barCount) return
    const dir = to.clone().sub(from)
    const len = dir.length()
    if (len < 0.05) return
    dummy.position.copy(from).add(to).multiplyScalar(0.5)
    dummy.scale.set(0.05, 0.04, len)
    dummy.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len))
    dummy.updateMatrix()
    bars.setMatrixAt(barAt, dummy.matrix)
    barAt += 1
    dummy.quaternion.identity()
    dummy.scale.set(1, 1, 1)
  }

  const placeRail = (angle: number, r0: number, r1: number) => {
    const steps = Math.max(2, Math.ceil(((r1 - r0) * SCALE) / 1.35))
    const high: THREE.Vector3[] = []
    const mid: THREE.Vector3[] = []
    for (let i = 0; i <= steps; i += 1) {
      const mapR = r0 + ((r1 - r0) * i) / steps
      const point = polar(angle, mapR)
      const floorY = bowlY(point.x, point.z)
      if (postAt < postCount) {
        dummy.position.set(point.x, floorY + 0.48, point.z)
        dummy.scale.set(1, 0.96, 1)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(postAt, dummy.matrix)
        postAt += 1
        dummy.scale.set(1, 1, 1)
      }
      high.push(new THREE.Vector3(point.x, floorY + 0.96, point.z))
      mid.push(new THREE.Vector3(point.x, floorY + 0.52, point.z))
      if (i > 0 && i % 2 === 0 && treadAt < treadCount) {
        dummy.position.set(point.x, floorY + 0.05, point.z)
        dummy.scale.set(0.78, 0.07, 0.24)
        dummy.rotation.set(0, Math.PI / 2 - angle, 0)
        dummy.updateMatrix()
        treads.setMatrixAt(treadAt, dummy.matrix)
        treadAt += 1
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
      }
    }
    for (let i = 1; i < high.length; i += 1) {
      placeBar(high[i - 1], high[i])
      placeBar(mid[i - 1], mid[i])
    }
  }

  PH_BLOCKS.forEach((block) => {
    placeRail(block.a0 - 0.008, block.r0, block.r1)
    placeRail(block.a1 + 0.008, block.r0, block.r1)
  })

  const crosses: Array<[number, number]> = [[118, 124], [176, 182], [236, 242], [268, 274]]
  crosses.forEach(([inner, outer]) => {
    for (let step = 0; step < 4; step += 1) {
      const mapR = inner + ((outer - inner) * (step + 0.5)) / 4
      for (let i = 0; i < 48; i += 1) {
        if (treadAt >= treadCount) break
        const a0 = PH_FAN.a0 + ((PH_FAN.a1 - PH_FAN.a0) * i) / 48
        const a1 = PH_FAN.a0 + ((PH_FAN.a1 - PH_FAN.a0) * (i + 1)) / 48
        const mid = (a0 + a1) / 2
        const point = polar(mid, mapR)
        const width = Math.max(0.4, point.radius * (a1 - a0) * 0.92)
        dummy.position.set(point.x, bowlY(point.x, point.z) + 0.06, point.z)
        dummy.scale.set(width, 0.08, 0.36)
        dummy.rotation.set(0, Math.PI / 2 - mid, 0)
        dummy.updateMatrix()
        treads.setMatrixAt(treadAt, dummy.matrix)
        treadAt += 1
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
      }
    }
    ;[inner, outer].forEach((mapR) => {
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 48; i += 1) {
        const angle = PH_FAN.a0 + ((PH_FAN.a1 - PH_FAN.a0) * i) / 48
        const point = polar(angle, mapR)
        points.push(new THREE.Vector3(point.x, bowlY(point.x, point.z) + 0.96, point.z))
      }
      for (let i = 1; i < points.length; i += 1) placeBar(points[i - 1], points[i])
    })
  })

  posts.count = postAt
  bars.count = barAt
  treads.count = treadAt
  posts.instanceMatrix.needsUpdate = true
  bars.instanceMatrix.needsUpdate = true
  treads.instanceMatrix.needsUpdate = true
  root.add(posts, bars, treads)
}

export function createPhilippineStadium(scene: THREE.Scene, renderer: THREE.WebGLRenderer, accent: string) {
  const root = new THREE.Group()
  scene.add(root)
  scene.background = new THREE.Color('#8ec8f0')
  scene.fog = new THREE.Fog('#c5dff2', 160, 520)

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const sun = new THREE.DirectionalLight('#fff4e2', 2.5)
  sun.position.set(80, 140, 90)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 20
  sun.shadow.camera.far = 420
  sun.shadow.camera.left = -150
  sun.shadow.camera.right = 150
  sun.shadow.camera.top = 150
  sun.shadow.camera.bottom = -150
  sun.shadow.bias = -0.0004
  root.add(sun)
  const fill = new THREE.DirectionalLight('#d5e4f6', 0.65)
  fill.position.set(-80, 50, -40)
  root.add(fill)
  root.add(new THREE.HemisphereLight('#e7f3fb', '#7d8f62', 1.15))
  root.add(new THREE.AmbientLight('#fff6ea', 0.22))

  const groundTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6d9a48'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 1800; i += 1) {
      ctx.fillStyle = i % 2 ? '#5d8a3c' : '#7eaa58'
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 2)
    }
  }, true)
  groundTex.repeat.set(28, 28)
  groundTex.anisotropy = anisotropy
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(240, 64),
    new THREE.MeshStandardMaterial({ map: groundTex, color: '#ffffff', roughness: 0.92, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)

  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 54),
    new THREE.MeshStandardMaterial({ color: '#cfc8bc', roughness: 0.86, metalness: 0 }),
  )
  plaza.rotation.x = -Math.PI / 2
  plaza.position.set(0, 0.02, 214)
  plaza.receiveShadow = true
  root.add(plaza)

  const roofTex = canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#f3f0ea'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(180, 176, 168, 0.45)'
    ctx.lineWidth = 2
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
  }, true)
  roofTex.repeat.set(4, 4)
  roofTex.anisotropy = anisotropy
  const roofGeo = new THREE.ExtrudeGeometry(ellipseShape(142, 148, 122, 128), { depth: 3.2, bevelEnabled: false, curveSegments: 48 })
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, 26, 8)
  const roof = new THREE.Mesh(
    roofGeo,
    new THREE.MeshStandardMaterial({ map: roofTex, color: '#ffffff', roughness: 0.62, metalness: 0.04 }),
  )
  roof.receiveShadow = true
  root.add(roof)

  const soffitTex = canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#ebe6de'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(150, 144, 136, 0.45)'
    ctx.lineWidth = 3
    for (let x = 0; x < w; x += 96) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += 96) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }, true)
  soffitTex.repeat.set(3, 3)
  soffitTex.anisotropy = anisotropy
  const bowlRoofGeo = new THREE.ExtrudeGeometry(ellipseShape(128, 134), { depth: 0.45, bevelEnabled: false, curveSegments: 64 })
  bowlRoofGeo.rotateX(-Math.PI / 2)
  bowlRoofGeo.translate(0, 25.55, 8)
  const bowlRoof = new THREE.Mesh(
    bowlRoofGeo,
    new THREE.MeshStandardMaterial({ map: soffitTex, color: '#ffffff', roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide }),
  )
  bowlRoof.visible = false
  root.add(bowlRoof)

  const sign = canvasTex(2048, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#1a1a1a'
    ctx.font = '800 118px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('PHILIPPINE ARENA', w / 2, h / 2 + 4)
  })
  sign.anisotropy = anisotropy
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(78, 8.2),
    new THREE.MeshStandardMaterial({ map: sign, transparent: true, roughness: 0.55, metalness: 0.05, depthWrite: false }),
  )
  signMesh.position.set(0, 24.2, 156.6)
  root.add(signMesh)

  const ribMat = new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.4, metalness: 0.42 })
  const ribGeo = new THREE.CylinderGeometry(0.42, 0.62, 22, 8)
  for (let i = 0; i < 22; i += 1) {
    const theta = -1.05 + (2.1 * i) / 21
    const x = Math.sin(theta) * 118
    const z = Math.cos(theta) * 96 + 18
    const rib = new THREE.Mesh(ribGeo, ribMat)
    rib.position.set(x, 13, z)
    rib.lookAt(x * 1.08, 26, z + 10)
    rib.rotateX(Math.PI / 2)
    rib.castShadow = true
    root.add(rib)
  }

  const finMat = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.45, metalness: 0.22 })
  const finGeo = new THREE.BoxGeometry(0.55, 11, 1.6)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i += 1) {
      const theta = side * (0.35 + i * 0.06)
      const fin = new THREE.Mesh(finGeo, finMat)
      fin.position.set(Math.sin(theta) * 100, 7, Math.cos(theta) * 86 + 16)
      fin.lookAt(0, 6.2, 8)
      fin.castShadow = true
      root.add(fin)
    }
  }

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 12),
    new THREE.MeshPhysicalMaterial({
      color: '#c5dcea',
      roughness: 0.08,
      metalness: 0,
      transmission: 0.55,
      thickness: 0.4,
      transparent: true,
      opacity: 0.85,
    }),
  )
  glass.position.set(0, 9.2, 132)
  root.add(glass)

  const ledTex = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#121418'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let y = 0; y < h; y += 8) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  })
  const facadeLed = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 10),
    new THREE.MeshStandardMaterial({ map: ledTex, color: '#141820', emissive: '#141820', emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.08 }),
  )
  facadeLed.position.set(0, 9, 132.4)
  root.add(facadeLed)

  const stepMat = new THREE.MeshStandardMaterial({ color: '#d5d0c6', roughness: 0.88, metalness: 0 })
  for (let i = 0; i < 8; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(28 - i * 0.4, 0.42, 3.2), stepMat)
    step.position.set(0, 0.24 + i * 0.36, 188 - i * 3.4)
    step.receiveShadow = true
    step.castShadow = true
    root.add(step)
  }

  const deckMaps = deckTextures()
  deckMaps.color.anisotropy = anisotropy
  deckMaps.rough.anisotropy = anisotropy
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
  addEnclosure(root, concrete, anisotropy)
  const deckByKey = new Map<string, THREE.MeshStandardMaterial>()
  const pickables: THREE.Object3D[] = []
  PH_BLOCKS.forEach((block) => {
    const material = concrete.clone()
    deckByKey.set(block.key, material)
    const deck = new THREE.Mesh(sectionDeck(expandPolygon(block.points, 0.8)), material)
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

  const stage = buildConcertStage(accent, anisotropy, STAGE)
  stage.rotation.y = Math.PI
  stage.traverse((obj) => {
    if (Math.abs(obj.rotation.x) > 0.4) obj.rotation.x = -obj.rotation.x
  })
  root.add(stage)

  const backdropTex = canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e4dfd6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(92, 86, 78, 0.16)'
    for (let x = 0; x < w; x += 48) ctx.fillRect(x, 0, 3, h)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    for (let y = 40; y < h; y += 72) ctx.fillRect(0, y, w, 5)
  }, true)
  backdropTex.anisotropy = anisotropy
  const backdrop = new THREE.Mesh(
    new THREE.BoxGeometry(250, 26.2, 0.9),
    new THREE.MeshStandardMaterial({ map: backdropTex, color: '#ffffff', roughness: 0.78, metalness: 0 }),
  )
  backdrop.position.set(0, 13.1, STAGE.depth / 2 + 1.8)
  backdrop.castShadow = true
  backdrop.receiveShadow = true
  root.add(backdrop)

  const drafts: Array<{ x: number; y: number; z: number; yaw: number; color: string; tier: number; row: number; number: number; block: PhBlock }> = []
  PH_BLOCKS.forEach((block) => {
    if (block.id === 'svip') return
    evenSeats(block).forEach((seat) => {
      const world = mapToWorld(seat.x, seat.y)
      drafts.push({
        x: world.x,
        y: bowlY(world.x, world.z) + SEAT_CLEARANCE,
        z: world.z,
        yaw: Math.atan2(-world.x, -world.z),
        color: block.color,
        tier: block.key.startsWith('ph-200') ? 2 : block.key.startsWith('ph-300') || block.key.startsWith('ph-400') ? 3 : 1,
        row: seat.row,
        number: seat.number,
        block,
      })
    })
  })

  const records: SeatRecord[] = drafts.map((seat) => ({ tierId: seat.block.id, blockKey: seat.block.key }))
  const chair = chairGeometry()
  const tiersA = new Float32Array(drafts.length)
  const rowsA = new Float32Array(drafts.length)
  const numsA = new Float32Array(drafts.length)
  drafts.forEach((seat, index) => {
    tiersA[index] = seat.tier
    rowsA[index] = seat.row
    numsA[index] = seat.number
  })
  chair.setAttribute('aTier', new THREE.InstancedBufferAttribute(tiersA, 1))
  chair.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowsA, 1))
  chair.setAttribute('aNumber', new THREE.InstancedBufferAttribute(numsA, 1))
  const fabric = seatFabric()
  fabric.anisotropy = anisotropy
  const seatMat = bindSeatIdentity(new THREE.MeshStandardMaterial({
    map: fabric,
    color: '#ffffff',
    roughness: 0.86,
    metalness: 0,
  }))
  const seats = new THREE.InstancedMesh(chair, seatMat, Math.max(drafts.length, 1))
  seats.name = 'seats'
  const dummy = new THREE.Object3D()
  const scratch = new THREE.Color()
  drafts.forEach((seat, index) => {
    dummy.position.set(seat.x, seat.y, seat.z)
    dummy.rotation.set(0, seat.yaw, 0)
    dummy.updateMatrix()
    seats.setMatrixAt(index, dummy.matrix)
    const jitter = 0.9 + ((index * 17 + seat.row * 3) % 7) * 0.02
    scratch.set(seat.color).multiplyScalar(jitter)
    seats.setColorAt(index, scratch)
  })
  seats.instanceMatrix.needsUpdate = true
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true
  seats.castShadow = false
  seats.receiveShadow = true
  seats.computeBoundingSphere()
  root.add(seats)
  pickables.push(seats)

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
      const block = PH_BLOCKS.find((item) => item.key === key)
      if (blockKey && key === blockKey && block?.id === 'svip') {
        material.color.set(block.color)
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
    const block = PH_BLOCKS.find((item) => item.key === blockKey)
    if (!block) return null
    const center = block.points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
    const w = mapToWorld(center.x / block.points.length, center.y / block.points.length)
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
    const stageHalfX = STAGE.width / 2 + 0.6
    const stageHalfZ = STAGE.depth / 2 + 0.6
    const stageClear = STAGE.deckY + 4.7 + 1.4
    const poseAt = (dist: number) => {
      const pitch = 0.32
      const cam = new THREE.Vector3(
        w.x + inX * dist * Math.cos(pitch),
        look.y + dist * Math.sin(pitch),
        w.z + inZ * dist * Math.cos(pitch),
      )
      const groundLimit = bowlY(cam.x, cam.z) + 1.7
      if (cam.y < groundLimit) cam.y = groundLimit
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
    while (!cam && hi < 140) {
      hi += 6
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
    return { pos: cam ?? poseAt(36), look }
  }

  return {
    pickables,
    seats,
    records,
    paint,
    tick: () => {},
    setOverview: (overview: boolean) => {
      bowlRoof.visible = !overview
    },
    viewOf,
    dispose: () => {
      scene.remove(root)
      const geos = new Set<THREE.BufferGeometry>()
      const mats = new Set<THREE.Material>()
      const tex = new Set<THREE.Texture>()
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          geos.add(obj.geometry)
          const list = Array.isArray(obj.material) ? obj.material : [obj.material]
          list.forEach((material) => {
            mats.add(material)
            const maps = material as THREE.MeshStandardMaterial
            if (maps.map) tex.add(maps.map)
            if (maps.roughnessMap) tex.add(maps.roughnessMap)
            if (maps.emissiveMap) tex.add(maps.emissiveMap)
          })
        }
      })
      geos.forEach((geo) => geo.dispose())
      mats.forEach((material) => material.dispose())
      tex.forEach((map) => map.dispose())
      concrete.dispose()
    },
  }
}
