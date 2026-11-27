import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ARENA_CENTER } from './arenaGeometry'
import type { SeatSpot } from './types'

type Props = {
  seats: SeatSpot[]
  selected: string[]
  accent: string
  onToggle: (seatId: string, available: boolean) => void
}

/** Merged chair — InstancedMesh keeps large sections in real 3D. */
function createChairGeometry() {
  const geos = [
    new THREE.BoxGeometry(0.72, 0.2, 0.62).translate(0, 0.12, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.72, 0.5, 0.1).translate(0, 0.4, 0.28).toNonIndexed(),
    new THREE.BoxGeometry(0.08, 0.26, 0.48).translate(-0.38, 0.28, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.08, 0.26, 0.48).translate(0.38, 0.28, 0).toNonIndexed(),
  ]
  const allPos: number[] = []
  const allNor: number[] = []
  geos.forEach((geo) => {
    const pos = geo.attributes.position
    const nor = geo.attributes.normal
    for (let i = 0; i < pos.count; i += 1) {
      allPos.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      allNor.push(nor.getX(i), nor.getY(i), nor.getZ(i))
    }
    geo.dispose()
  })
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNor, 3))
  merged.computeBoundingSphere()
  return merged
}

/** Map chart coords → local 3D so the section footprint matches the 2D map. */
function useSectionLayout(seats: SeatSpot[]) {
  return useMemo(() => {
    const xs = seats.map((s) => s.mapX)
    const ys = seats.map((s) => s.mapY)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const span = Math.max(maxX - minX, maxY - minY, 1)

    // Fit section into ~14 world units; keep aspect of the map block
    const worldScale = 14 / span

    // Face chairs toward arena stage
    // +π so chair fronts (−Z) face the stage / camera
    const faceAngle = Math.atan2(ARENA_CENTER.x - cx, ARENA_CENTER.y - cy) + Math.PI
    const nearest = Math.min(...seats.map((s) => Math.hypot(s.mapX - ARENA_CENTER.x, s.mapY - ARENA_CENTER.y)))

    const positions = seats.map((seat) => {
      const lx = (seat.mapX - cx) * worldScale
      const lz = (seat.mapY - cy) * worldScale
      const stageDist = Math.hypot(seat.mapX - ARENA_CENTER.x, seat.mapY - ARENA_CENTER.y)
      const y = 0.16 + (stageDist - nearest) * 0.012
      return { x: lx, y, z: lz, yaw: faceAngle }
    })

    return {
      positions,
      spanX: (maxX - minX) * worldScale,
      spanZ: (maxY - minY) * worldScale,
      faceAngle,
      worldScale,
    }
  }, [seats])
}

export default function Seat3DPicker({ seats, selected, accent, onToggle }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const controlRef = useRef({ selected, onToggle, accent })
  controlRef.current = { selected, onToggle, accent }
  const layout = useSectionLayout(seats)

  useEffect(() => {
    const mount = mountRef.current
    const shell = shellRef.current
    if (!mount || seats.length === 0) return
    if (shell) shell.style.transform = 'perspective(1200px) rotateX(8deg) rotateY(0deg)'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#050508')
    scene.fog = new THREE.FogExp2('#050508', seats.length > 200 ? 0.016 : 0.024)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220)
    // Camera on stage side — seats face this way (front view)
    const viewAngle = layout.faceAngle - Math.PI
    const startDist = Math.max(12, Math.max(layout.spanX, layout.spanZ) * 0.95 + 6)
    camera.position.set(
      Math.sin(viewAngle) * startDist,
      9.5,
      Math.cos(viewAngle) * startDist,
    )

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.shadowMap.enabled = seats.length <= 200
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#f3e8ff', '#0f0a1a', 1.35))
    const key = new THREE.DirectionalLight('#ffffff', 2.35)
    key.position.set(4, 14, -8)
    scene.add(key)
    const rim = new THREE.PointLight(accent, 28, 36, 2)
    rim.position.set(0, 5, 0)
    scene.add(rim)

    const floorSize = Math.max(22, Math.max(layout.spanX, layout.spanZ) + 10)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      new THREE.MeshStandardMaterial({ color: '#0c0b12', roughness: 0.94, metalness: 0.04 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    // Stage marker toward the front of this section
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(10, layout.spanX * 0.7 + 4), 0.28, 2.2),
      new THREE.MeshStandardMaterial({
        color: '#1e1b2e',
        emissive: accent,
        emissiveIntensity: 0.2,
        roughness: 0.55,
      }),
    )
    stage.position.set(
      Math.sin(viewAngle) * (Math.max(layout.spanX, layout.spanZ) * 0.55 + 3.2),
      0.14,
      Math.cos(viewAngle) * (Math.max(layout.spanX, layout.spanZ) * 0.55 + 3.2),
    )
    stage.rotation.y = viewAngle
    scene.add(stage)

    const seatScale = seats.length > 400 ? 0.55 : seats.length > 200 ? 0.7 : 0.9
    const chairGeo = createChairGeometry()
    const mat = new THREE.MeshStandardMaterial({ color: '#4a4270', roughness: 0.78, metalness: 0.05 })
    const mesh = new THREE.InstancedMesh(chairGeo, mat, seats.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(seats.length * 3), 3)
    scene.add(mesh)

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const baseY: number[] = []
    const availableFlags: boolean[] = []
    const seatIds: string[] = []
    const locals = layout.positions

    seats.forEach((seat, i) => {
      const p = locals[i]
      baseY[i] = p.y
      availableFlags[i] = seat.available
      seatIds[i] = seat.id
      dummy.position.set(p.x, p.y, p.z)
      // Chair local front is −Z; rotate so front faces stage
      dummy.rotation.set(-0.03, p.yaw, 0)
      dummy.scale.setScalar(seatScale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.set(seat.available ? '#4a4270' : '#14121c')
      mesh.setColorAt(i, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let dragging = false
    let moved = false
    let lastX = 0
    // Orbit around section; start from stage / front
    let yaw = viewAngle
    let elevation = 0.48
    let pointerYaw = 0
    let pointerPitch = 0
    let targetPointerYaw = 0
    let targetPointerPitch = 0

    const paint = () => {
      const picked = new Set(controlRef.current.selected)
      const accentColor = new THREE.Color(controlRef.current.accent)
      const free = new THREE.Color('#4a4270')
      const sold = new THREE.Color('#14121c')

      seats.forEach((seat, i) => {
        const p = locals[i]
        const isPicked = picked.has(seat.id)
        dummy.position.set(p.x, baseY[i] + (isPicked ? 0.28 : 0), p.z)
        dummy.rotation.set(-0.03, p.yaw, 0)
        dummy.scale.setScalar(seatScale * (isPicked ? 1.08 : 1))
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (!availableFlags[i]) mesh.setColorAt(i, sold)
        else if (isPicked) mesh.setColorAt(i, accentColor)
        else mesh.setColorAt(i, free)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      targetPointerYaw = nx * 0.16
      targetPointerPitch = ny * 0.09
      if (shell) {
        shell.style.transform = `perspective(1200px) rotateX(${8 - ny * 5}deg) rotateY(${nx * 7}deg)`
      }
      if (!dragging) return
      const dx = event.clientX - lastX
      if (Math.abs(dx) > 2) moved = true
      yaw -= dx * 0.005
      lastX = event.clientX
    }
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      moved = false
      lastX = event.clientX
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onUp = () => { dragging = false }
    const onLeave = () => {
      targetPointerYaw = 0
      targetPointerPitch = 0
      if (shell) shell.style.transform = 'perspective(1200px) rotateX(8deg) rotateY(0deg)'
    }
    const onClick = (event: MouseEvent) => {
      if (moved) { moved = false; return }
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit || hit.instanceId == null) return
      const seatId = seatIds[hit.instanceId]
      if (!seatId) return
      controlRef.current.onToggle(seatId, availableFlags[hit.instanceId])
    }

    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('click', onClick)

    let frame = 0
    let disposed = false
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1)
      const height = Math.max(mount.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    const radius = Math.max(11, Math.max(layout.spanX, layout.spanZ) * 0.85 + 5)
    const desired = new THREE.Vector3()
    const look = new THREE.Vector3(0, 1.0, 0)

    const animate = () => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      pointerYaw += (targetPointerYaw - pointerYaw) * 0.08
      pointerPitch += (targetPointerPitch - pointerPitch) * 0.08
      const liveYaw = yaw + pointerYaw
      const liveElevation = THREE.MathUtils.clamp(elevation + pointerPitch, 0.28, 1.0)
      desired.set(
        radius * Math.cos(liveElevation) * Math.sin(liveYaw),
        radius * Math.sin(liveElevation) + 1.5,
        radius * Math.cos(liveElevation) * Math.cos(liveYaw),
      )
      camera.position.lerp(desired, 0.1)
      camera.lookAt(look)
      paint()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('click', onClick)
      chairGeo.dispose()
      mat.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj !== mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose())
        }
      })
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      if (shell) shell.style.transform = ''
    }
  }, [seats, layout, accent])

  return (
    <div ref={shellRef} className="seat-3d-shell" aria-label="3D seat picker matching section layout. Drag to orbit. Click to select.">
      <div ref={mountRef} className="seat-3d-canvas" />
      <div className="seat-3d-hint" aria-hidden="true">
        {seats.length.toLocaleString()} SEATS · SECTION FOOTPRINT · FRONT VIEW · CLICK TO SELECT
      </div>
    </div>
  )
}
