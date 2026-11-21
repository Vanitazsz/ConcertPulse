import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Tier, TierId } from './types'

interface Props {
  tiers: Tier[]
  selected: TierId
  accent: string
  mode: 'overview' | 'pov'
  angle: 'left' | 'center' | 'right'
  onSelect: (id: TierId) => void
  onHover: (id: TierId | null) => void
}

const seatColors = ['#B23850', '#3B8BEB', '#8590AA', '#E7E3D4']

export default function Arena3DViewer({ tiers, selected, accent, mode, angle, onSelect, onHover }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneState = useRef<{ camera: THREE.PerspectiveCamera; zones: Map<TierId, THREE.Mesh[]>; renderer: THREE.WebGLRenderer; scene: THREE.Scene } | null>(null)
  const controlRef = useRef({ selected, mode, angle, accent, onSelect, onHover })
  controlRef.current = { selected, mode, angle, accent, onSelect, onHover }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#3B8BEB')
    scene.fog = new THREE.FogExp2('#3B8BEB', 0.012)
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180)
    camera.position.set(24, 25, 33)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.style.touchAction = 'none'
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#E7E3D4', '#8590AA', 2.0))
    const key = new THREE.DirectionalLight('#ffffff', 3.1)
    key.position.set(-7, 22, 8)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const stageGlow = new THREE.PointLight(accent, 80, 36, 1.8)
    stageGlow.position.set(0, 6, -12)
    scene.add(stageGlow)
    const cyanGlow = new THREE.PointLight('#C4DBF6', 28, 24, 2)
    cyanGlow.position.set(0, 8, 1)
    scene.add(cyanGlow)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 52), new THREE.MeshStandardMaterial({ color: '#8590AA', roughness: 0.8, metalness: 0.15 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -0.15, 4)
    floor.receiveShadow = true
    scene.add(floor)

    const stage = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 4.2), new THREE.MeshStandardMaterial({ color: '#B23850', roughness: 0.42, metalness: 0.25 }))
    stage.position.set(0, 0.25, -12)
    stage.receiveShadow = true
    stage.castShadow = true
    scene.add(stage)
    const thrust = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 7.8), new THREE.MeshStandardMaterial({ color: '#E7E3D4', roughness: 0.42, metalness: 0.12 }))
    thrust.position.set(0, 0.1, -6.9)
    thrust.receiveShadow = true
    scene.add(thrust)
    const ledMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.9, roughness: 0.24, metalness: 0.15 })
    const led = new THREE.Mesh(new THREE.BoxGeometry(10.4, 5.1, 0.28), ledMat)
    led.position.set(0, 4.4, -14.05)
    scene.add(led)
    const trussMat = new THREE.MeshStandardMaterial({ color: '#8590AA', metalness: 0.3, roughness: 0.4 })
    const truss = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.16, 0.2), trussMat)
    truss.position.set(0, 8, -13.6)
    scene.add(truss)
    for (let i = -4; i <= 4; i += 2) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.35, 12), new THREE.MeshStandardMaterial({ color: '#fff4ff', emissive: accent, emissiveIntensity: 2.4 }))
      lamp.position.set(i, 7.72, -13.5)
      scene.add(lamp)
      const spot = new THREE.SpotLight(accent, 62, 32, Math.PI / 9, 0.65, 1)
      spot.position.set(i, 7.5, -13)
      spot.target.position.set(i * 0.55, 0, -3)
      scene.add(spot, spot.target)
    }

    // Procedural seating blocks make each section individually raycastable.
    const zones = new Map<TierId, THREE.Mesh[]>()
    tiers.forEach((tier, index) => {
      const [x, y, z] = tier.position
      const isPit = tier.id === 'svip'
      const isGa = tier.id === 'ga'
      const isBox = tier.id.startsWith('lower') || tier.id.startsWith('upper')
      const width = isPit ? 8 : isGa ? 17 : 6.8
      const depth = isPit ? 4.2 : isGa ? 4.4 : 4
      const height = isPit ? 0.8 : isGa ? 1.4 : tier.id.startsWith('upper') ? 1.65 : 1.35
      const group: THREE.Mesh[] = []
      const zoneMat = new THREE.MeshStandardMaterial({ color: seatColors[index % seatColors.length], emissive: seatColors[index % seatColors.length], emissiveIntensity: 0.22, roughness: 0.58, metalness: 0.28, transparent: true, opacity: 0.78 })
      const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), zoneMat)
      block.position.set(x, y, z)
      block.castShadow = true
      block.receiveShadow = true
      block.userData.tierId = tier.id
      scene.add(block)
      group.push(block)
      if (isBox || isGa) {
        const rows = isGa ? 5 : 4
        const cols = isGa ? 15 : 8
        const seatMat = new THREE.MeshStandardMaterial({ color: '#E7E3D4', roughness: 0.72, metalness: 0.04 })
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(isGa ? 0.68 : 0.62, 0.36, 0.52), seatMat)
            const offsetX = (col - (cols - 1) / 2) * (isGa ? 0.95 : 0.86)
            const offsetZ = (row - (rows - 1) / 2) * 0.76
            seat.position.set(x + offsetX, y + height / 2 + 0.17 + row * 0.18, z + offsetZ)
            seat.rotation.x = -0.08
            seat.userData.tierId = tier.id
            seat.castShadow = true
            scene.add(seat)
            group.push(seat)
          }
        }
      } else if (isPit) {
        // Standing pit light strips suggest crowd lanes at a glance.
        for (let lane = -3; lane <= 3; lane++) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 3.8), new THREE.MeshBasicMaterial({ color: lane % 2 ? '#8b5cf6' : accent }))
          strip.position.set(lane, 0.62, z)
          scene.add(strip)
          group.push(strip)
        }
      }
      zones.set(tier.id, group)
    })

    // Concentric roof arcs frame the bowl without external assets.
    const rimMat = new THREE.MeshStandardMaterial({ color: '#8590AA', metalness: 0.22, roughness: 0.45 })
    for (let radius = 16; radius <= 25; radius += 4) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.11, 5, 90, Math.PI), rimMat)
      arc.rotation.x = Math.PI / 2
      arc.position.set(0, radius * 0.25 + 1.3, 5)
      scene.add(arc)
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? '#C4DBF6' : '#B23850' }))
      dot.position.set(Math.cos(a) * 22, 7.8, 5 + Math.sin(a) * 13)
      scene.add(dot)
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hovered: TierId | null = null
    let dragging = false
    let movedDuringDrag = false
    let lastX = 0
    let lastY = 0
    let overviewYaw = Math.atan2(24, 34)
    let overviewElevation = Math.asin(24 / Math.sqrt(24 * 24 + 24 * 24 + 34 * 34))
    const tierAt = (event: PointerEvent | MouseEvent): TierId | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(Array.from(zones.values()).flat(), false)[0]
      return (hit?.object.userData.tierId as TierId | undefined) ?? null
    }
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        const dx = event.clientX - lastX
        const dy = event.clientY - lastY
        if (Math.abs(dx) + Math.abs(dy) > 2) movedDuringDrag = true
        if (movedDuringDrag) {
          overviewYaw -= dx * 0.006
          overviewElevation = THREE.MathUtils.clamp(overviewElevation + dy * 0.004, 0.24, 1.18)
        }
        lastX = event.clientX
        lastY = event.clientY
        mount.style.cursor = 'grabbing'
        return
      }
      const id = tierAt(event)
      if (hovered !== id) {
        hovered = id
        mount.style.cursor = id ? 'pointer' : 'grab'
        controlRef.current.onHover(id)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || controlRef.current.mode !== 'overview') return
      dragging = true
      movedDuringDrag = false
      lastX = event.clientX
      lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerUp = () => { dragging = false; mount.style.cursor = hovered ? 'pointer' : 'grab' }
    const onClick = (event: MouseEvent) => {
      if (movedDuringDrag) { movedDuringDrag = false; return }
      const id = tierAt(event) ?? hovered
      if (id) controlRef.current.onSelect(id)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('click', onClick)
    let frame = 0
    let disposed = false
    const desired = new THREE.Vector3()
    const look = new THREE.Vector3()
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1)
      const height = Math.max(mount.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()
    const animate = () => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const ctl = controlRef.current
      const picked = tiers.find((tier) => tier.id === ctl.selected) ?? tiers[0]
      if (ctl.mode === 'overview') {
        const radius = Math.sqrt(24 * 24 + 24 * 24 + 34 * 34)
        desired.set(radius * Math.cos(overviewElevation) * Math.sin(overviewYaw), radius * Math.sin(overviewElevation), radius * Math.cos(overviewElevation) * Math.cos(overviewYaw))
        look.set(0, 2, 1)
      } else {
        const side = ctl.angle === 'left' ? -2.6 : ctl.angle === 'right' ? 2.6 : 0
        desired.set(picked.position[0] + side, picked.position[1] + 1.5, picked.position[2] - 1.55)
        look.set(0, 2.4, -11.3)
      }
      camera.position.lerp(desired, 0.035)
      camera.lookAt(look)
      zones.forEach((meshes, id) => {
        const hot = id === ctl.selected || id === hovered
        for (const mesh of meshes) {
          const mat = mesh.material
          if (Array.isArray(mat)) continue
          if (mat instanceof THREE.MeshStandardMaterial && mat.emissive) mat.emissiveIntensity = hot ? (id === ctl.selected ? 0.85 : 0.55) : 0.22
        }
      })
      stageGlow.color.set(ctl.accent)
      ledMat.color.set(ctl.accent)
      ledMat.emissive.set(ctl.accent)
      renderer.render(scene, camera)
    }
    animate()
    sceneState.current = { camera, zones, renderer, scene }

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
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
      sceneState.current = null
    }
  }, [tiers])

  return <div ref={mountRef} className="arena-canvas" aria-label="Interactive 3D concert arena. Click a seating section to select it." />
}

