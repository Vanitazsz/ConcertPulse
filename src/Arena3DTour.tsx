import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ARENA_CAPACITY } from './arenaGeometry'
import { PH_CAPACITY } from './philippineGeometry'
import { createPhilippineStadium } from './philippineStadium'
import { createStadium } from './stadium'
import type { Tier, TierId } from './types'

type Props = {
  tiers: Tier[]
  selectedTier: TierId | null
  selectedBlock: string | null
  accent: string
  onSelect: (tierId: TierId, blockKey: string) => void
  variant?: 'moa' | 'philippine'
}

type Shot = { id: string; label: string; pos: THREE.Vector3; look: THREE.Vector3 }

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

function verticalFov(aspect: number) {
  const base = 38
  if (aspect >= 16 / 9) return base
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * (16 / 9) / Math.max(aspect, 0.2)))
}

function shotFov(stop: number, aspect: number) {
  if (stop < 0) return 42
  if (stop === 0) return 40
  if (stop === 1) return 54
  return verticalFov(aspect)
}

export default function Arena3DTour({ tiers, selectedTier, selectedBlock, accent, onSelect, variant = 'moa' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const controlRef = useRef({ selectedTier, selectedBlock, onSelect, accent, tiers })
  controlRef.current = { selectedTier, selectedBlock, onSelect, accent, tiers }
  const stopRef = useRef(1)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.25, 700)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.shadowMap.enabled = true
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const stadium = variant === 'philippine' ? createPhilippineStadium(scene, renderer, accent) : createStadium(scene, renderer, accent)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const shots: Shot[] = variant === 'philippine'
      ? [
          { id: 'outside', label: 'Outside', pos: new THREE.Vector3(0, 32, 340), look: new THREE.Vector3(0, 16, 0) },
          { id: 'top', label: 'Top', pos: new THREE.Vector3(0, 280, 18), look: new THREE.Vector3(0, 0, -24) },
        ]
      : [
          { id: 'outside', label: 'Outside', pos: new THREE.Vector3(48, 34, 198), look: new THREE.Vector3(0, 24, 48) },
          { id: 'top', label: 'Top', pos: new THREE.Vector3(0, 132, 28), look: new THREE.Vector3(0, 0, 0) },
        ]

    const raycaster = new THREE.Raycaster()
    raycaster.layers.enable(1)
    const pointer = new THREE.Vector2()
    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0
    let yaw = 0
    let pitch = 0
    let flight = 1
    const fromPos = shots[1].pos.clone()
    const fromLook = shots[1].look.clone()
    const toPos = shots[1].pos.clone()
    const toLook = shots[1].look.clone()
    const eye = new THREE.Vector3()
    const gaze = new THREE.Vector3()
    const offset = new THREE.Vector3()
    const spherical = new THREE.Spherical()
    let painted = ''
    let framed = ''

    const rail = document.createElement('div')
    rail.className = 'tour-rail'
    rail.setAttribute('role', 'toolbar')
    rail.setAttribute('aria-label', 'Stadium views')
    const hint = document.createElement('p')
    hint.className = 'tour-hint'
    hint.textContent = 'Drag to look · Arrows change the view · Click a seat'

    const goToStop = (index: number) => {
      const next = (index + shots.length) % shots.length
      stopRef.current = next
      fromPos.copy(eye)
      fromLook.copy(gaze)
      toPos.copy(shots[next].pos)
      toLook.copy(shots[next].look)
      yaw = 0
      pitch = 0
      flight = reducedMotion ? 1 : 0
    }

    shots.forEach((shot, index) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tour-stop'
      btn.textContent = shot.label
      btn.addEventListener('click', () => goToStop(index))
      rail.appendChild(btn)
    })
    mount.appendChild(rail)
    mount.appendChild(hint)

    const trySelect = (tierId: TierId, blockKey: string) => {
      const tier = controlRef.current.tiers.find((item) => item.id === tierId)
      if (!tier || tier.stock <= 0) return
      controlRef.current.onSelect(tierId, blockKey)
    }

    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      yaw -= dx * 0.005
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.0035, -0.7, 0.85)
      lastX = event.clientX
      lastY = event.clientY
    }
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      moved = false
      lastX = event.clientX
      lastY = event.clientY
      mount.focus()
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onUp = () => { dragging = false }
    const onClick = (event: MouseEvent) => {
      if (moved) {
        moved = false
        return
      }
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(stadium.pickables, false)
      const seatHit = hits.find((hit) => hit.object === stadium.seats && hit.instanceId !== undefined)
      const sectionHit = hits.find((hit) => hit.object !== stadium.seats && hit.object.userData.blockKey)
      if (seatHit && seatHit.instanceId !== undefined && (!sectionHit || seatHit.distance <= sectionHit.distance + 1.2)) {
        const seat = stadium.records[seatHit.instanceId]
        if (!seat) return
        trySelect(seat.tierId, seat.blockKey)
        return
      }
      const tierId = sectionHit?.object.userData.tierId as TierId | undefined
      const blockKey = sectionHit?.object.userData.blockKey as string | undefined
      if (!tierId || !blockKey) return
      trySelect(tierId, blockKey)
    }
    const onKey = (event: KeyboardEvent) => {
      if (!mount.contains(document.activeElement)) return
      if (event.key === 'ArrowRight' || event.key === ']') {
        event.preventDefault()
        goToStop(stopRef.current + 1)
      } else if (event.key === 'ArrowLeft' || event.key === '[') {
        event.preventDefault()
        goToStop(stopRef.current - 1)
      } else if (event.key === 'Escape') {
        goToStop(0)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)

    let frame = 0
    let disposed = false
    let lastTick = performance.now()
    let elapsed = 0
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1)
      const height = Math.max(mount.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.fov = shotFov(stopRef.current, camera.aspect)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()
    eye.copy(shots[1].pos)
    gaze.copy(shots[1].look)

    const animate = () => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now()
      const delta = Math.min(0.05, (now - lastTick) / 1000)
      lastTick = now
      elapsed += delta
      if (flight < 1) flight = Math.min(1, flight + delta / (reducedMotion ? 0.01 : 1.15))
      const k = smooth(flight)
      eye.lerpVectors(fromPos, toPos, k)
      gaze.lerpVectors(fromLook, toLook, k)
      if (stopRef.current < 0) eye.y += Math.sin(Math.PI * k) * 6
      offset.copy(gaze).sub(eye)
      spherical.setFromVector3(offset)
      spherical.theta += yaw
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitch, 0.12, Math.PI - 0.08)
      camera.position.copy(eye)
      camera.lookAt(offset.setFromSpherical(spherical).add(eye))
      const nextFov = shotFov(stopRef.current, camera.aspect)
      if (Math.abs(camera.fov - nextFov) > 0.05) {
        camera.fov = nextFov
        camera.updateProjectionMatrix()
      }
      const hot = controlRef.current.selectedBlock ?? ''
      const accentNow = controlRef.current.accent
      const paintKey = `${hot}|${accentNow}`
      if (paintKey !== painted) {
        stadium.paint(hot || null, accentNow)
        painted = paintKey
      }
      stadium.tick(elapsed, reducedMotion ? 0 : 0.85)
      stadium.setOverview?.(stopRef.current === 1)
      const blockNow = controlRef.current.selectedBlock ?? ''
      if (blockNow !== framed) {
        framed = blockNow
        const view = blockNow ? stadium.viewOf(blockNow, camera.aspect) : null
        if (view) {
          stopRef.current = -1
          fromPos.copy(eye)
          fromLook.copy(gaze)
          toPos.copy(view.pos)
          toLook.copy(view.look)
          yaw = 0
          pitch = 0
          flight = reducedMotion ? 1 : 0
        }
      }
      Array.from(rail.children).forEach((child, index) => {
        child.classList.toggle('is-active', index === stopRef.current && flight > 0.85 && Math.abs(yaw) + Math.abs(pitch) < 0.08)
      })
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
      window.removeEventListener('keydown', onKey)
      rail.remove()
      hint.remove()
      stadium.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [tiers, accent, variant])

  return (
    <div
      ref={mountRef}
      className="arena-3d-tour"
      tabIndex={0}
      aria-label={variant === 'philippine'
        ? `Philippine Arena. ${PH_CAPACITY.toLocaleString()} seats. Drag to look. Click a section.`
        : `Oval stadium in the park. ${ARENA_CAPACITY.toLocaleString()} seats. Drag to look. Click a seat to select its section.`}
    />
  )
}
