import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ARENA_BLOCKS, ARENA_CAPACITY, fillForBlock, type Pt } from './arenaGeometry'
import { layoutBlockSeats } from './blockSeats'
import { isStandingTier } from './seats'
import type { Tier, TierId } from './types'

type Props = {
  tiers: Tier[]
  selectedTier: TierId | null
  selectedBlock: string | null
  accent: string
  onSelect: (tierId: TierId, blockKey: string) => void
}

const SX = 0.055
const SZ = 0.055

function toWorld(p: Pt) {
  return { x: (p.x - 320) * SX, z: (p.y - 340) * SZ }
}

function shapeFromPoints(points: Pt[]) {
  const shape = new THREE.Shape()
  points.forEach((p, index) => {
    const w = toWorld(p)
    if (index === 0) shape.moveTo(w.x, -w.z)
    else shape.lineTo(w.x, -w.z)
  })
  shape.closePath()
  return shape
}

/** Top-down MOA bowl — section platforms + instanced seats (15k capacity). */
export default function Arena3DTopView({ tiers, selectedTier, selectedBlock, accent, onSelect }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const controlRef = useRef({ selectedTier, selectedBlock, onSelect, accent })
  controlRef.current = { selectedTier, selectedBlock, onSelect, accent }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#14101f')

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
    camera.position.set(0, 52, 6)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#f5e9ff', '#1a1030', 1.35))
    const key = new THREE.DirectionalLight('#ffffff', 2.05)
    key.position.set(8, 42, 10)
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 42),
      new THREE.MeshStandardMaterial({ color: '#0e0a18', roughness: 0.96 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(5.7, 0.28, 8.6),
      new THREE.MeshStandardMaterial({
        color: '#3b82f6',
        emissive: accent,
        emissiveIntensity: 0.2,
        roughness: 0.45,
      }),
    )
    stage.position.y = 0.14
    scene.add(stage)

    const pickables: THREE.Object3D[] = []
    const platformMats = new Map<string, THREE.MeshStandardMaterial>()
    const platformMeshes = new Map<string, THREE.Mesh>()
    const seatInstances = new Map<string, THREE.InstancedMesh>()
    const seatDummy = new THREE.Object3D()
    const seatGeo = new THREE.BoxGeometry(0.14, 0.1, 0.14)

    ARENA_BLOCKS.forEach((block) => {
      const color = fillForBlock(block)
      const shape = shapeFromPoints(block.points)
      const platformGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false })
      platformGeo.rotateX(-Math.PI / 2)
      const platformMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.12,
        roughness: 0.72,
        metalness: 0.05,
        transparent: true,
        opacity: 0.95,
      })
      const platform = new THREE.Mesh(platformGeo, platformMat)
      platform.position.y = 0.02
      platform.userData.tierId = block.id
      platform.userData.blockKey = block.key
      scene.add(platform)
      pickables.push(platform)
      platformMats.set(block.key, platformMat)
      platformMeshes.set(block.key, platform)

      if (isStandingTier(block.id)) return

      const layout = layoutBlockSeats(block)
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.55,
        metalness: 0.1,
      })
      const mesh = new THREE.InstancedMesh(seatGeo, mat, layout.length)
      mesh.userData.tierId = block.id
      mesh.userData.blockKey = block.key
      layout.forEach((spot, i) => {
        const w = toWorld({ x: spot.x, y: spot.y })
        seatDummy.position.set(w.x, 0.28, w.z)
        seatDummy.updateMatrix()
        mesh.setMatrixAt(i, seatDummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      scene.add(mesh)
      pickables.push(mesh)
      seatInstances.set(block.key, mesh)
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let yaw = 0.12
    let dragging = false
    let moved = false
    let lastX = 0

    const paint = () => {
      const hot = controlRef.current.selectedBlock
      const accentColor = controlRef.current.accent
      ARENA_BLOCKS.forEach((block) => {
        const active = block.key === hot
        const base = fillForBlock(block)
        const platformMat = platformMats.get(block.key)
        const platform = platformMeshes.get(block.key)
        if (platformMat && platform) {
          if (active) {
            platformMat.color.set(accentColor)
            platformMat.emissive.set(accentColor)
            platformMat.emissiveIntensity = 0.55
            platformMat.opacity = 1
            platform.position.y = 0.12
            platform.scale.set(1, 1.4, 1)
          } else {
            platformMat.color.set(base)
            platformMat.emissive.set(base)
            platformMat.emissiveIntensity = hot ? 0.05 : 0.12
            platformMat.opacity = hot ? 0.4 : 0.95
            platform.position.y = 0.02
            platform.scale.set(1, 1, 1)
          }
        }
        const seats = seatInstances.get(block.key)
        if (seats) {
          const mat = seats.material as THREE.MeshStandardMaterial
          if (active) {
            mat.color.set(accentColor)
            mat.emissive.set(accentColor)
            mat.emissiveIntensity = 1
          } else {
            mat.color.set(base)
            mat.emissive.set(base)
            mat.emissiveIntensity = hot ? 0.08 : 0.3
          }
        }
      })
    }

    const onMove = (event: PointerEvent) => {
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
    const onClick = (event: MouseEvent) => {
      if (moved) { moved = false; return }
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickables, false)[0]
      const tierId = hit?.object.userData.tierId as TierId | undefined
      const blockKey = hit?.object.userData.blockKey as string | undefined
      if (!tierId || !blockKey) return
      const tier = tiers.find((item) => item.id === tierId)
      if (!tier || tier.stock <= 0) return
      controlRef.current.onSelect(tierId, blockKey)
    }

    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
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

    const desired = new THREE.Vector3()
    const animate = () => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      desired.set(Math.sin(yaw) * 8, 50, Math.cos(yaw) * 8)
      camera.position.lerp(desired, 0.08)
      camera.lookAt(0, 0, 0)
      paint()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((mat) => mat.dispose())
        }
      })
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [tiers, accent])

  return (
    <div
      ref={mountRef}
      className="arena-3d-top"
      aria-label={`3D top-view MOA arena, ${ARENA_CAPACITY.toLocaleString()} seats. Drag to rotate. Click one section.`}
    />
  )
}
