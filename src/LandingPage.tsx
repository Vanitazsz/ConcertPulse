import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Volume2, VolumeX } from 'lucide-react'

type LandingPageProps = {
  onChooseConcert: () => void
}

const BARS = 48
const BEAT = 60 / 128

function Waveform({ className, waveRef }: { className: string; waveRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className={className} ref={waveRef} aria-hidden="true">
      {Array.from({ length: BARS }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  )
}

function tone(ctx: AudioContext, dest: AudioNode, time: number, freq: number, duration: number, type: OscillatorType, gain: number) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, time)
  amp.gain.setValueAtTime(0.0001, time)
  amp.gain.exponentialRampToValueAtTime(gain, time + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, time + duration)
  osc.connect(amp)
  amp.connect(dest)
  osc.start(time)
  osc.stop(time + duration + 0.02)
}

function startTrack(ctx: AudioContext) {
  const master = ctx.createGain()
  master.gain.value = 0.22
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.65
  master.connect(analyser)
  analyser.connect(ctx.destination)

  const noiseLen = Math.floor(ctx.sampleRate * 0.18)
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
  const noiseData = noiseBuf.getChannelData(0)
  for (let index = 0; index < noiseLen; index += 1) noiseData[index] = Math.random() * 2 - 1

  const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 523.25]
  const bass = [65.41, 98, 87.31, 73.42]
  const stepDur = BEAT / 4
  let next = ctx.currentTime + 0.05
  let stepIndex = 0

  const clap = (time: number) => {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1400
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.22, time)
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.12)
    src.connect(filter)
    filter.connect(amp)
    amp.connect(master)
    src.start(time)
    src.stop(time + 0.14)
  }

  const timer = window.setInterval(() => {
    const horizon = ctx.currentTime + 0.28
    while (next < horizon) {
      const step = stepIndex % 16
      if (step % 4 === 0) tone(ctx, master, next, 72, 0.11, 'sine', 0.8)
      if (step === 4 || step === 12) clap(next)
      if (step % 2 === 1) tone(ctx, master, next, 5200, 0.03, 'square', 0.035)
      if (step % 4 === 0) tone(ctx, master, next, bass[step / 4], 0.16, 'triangle', 0.16)
      if (step % 2 === 0) tone(ctx, master, next, melody[step / 2], 0.11, 'triangle', 0.12)
      stepIndex += 1
      next += stepDur
    }
  }, 25)

  return {
    analyser,
    stop() {
      window.clearInterval(timer)
      try { master.disconnect() } catch { /* already stopped */ }
      try { analyser.disconnect() } catch { /* already stopped */ }
    },
  }
}

export default function LandingPage({ onChooseConcert }: LandingPageProps) {
  const reduceMotion = useReducedMotion()
  const [soundOn, setSoundOn] = useState(false)
  const track = useRef<ReturnType<typeof startTrack> | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const topWave = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bars = [...(topWave.current?.children ?? [])] as HTMLElement[]
    if (reduceMotion || bars.length === 0) return
    let frame = 0
    const data = new Uint8Array(64)
    const draw = (now: number) => {
      const analyser = track.current?.analyser
      if (analyser) analyser.getByteFrequencyData(data)
      bars.forEach((bar, index) => {
        const slot = index % BARS
        const song = Math.abs(Math.sin(now / 120 + slot * 0.45)) * 0.42
          + Math.abs(Math.sin(now / 260 + slot * 0.18)) * 0.28
          + (Math.sin(now / (BEAT * 1000) * Math.PI * 2) > 0.55 ? 0.4 : 0)
        const sample = analyser ? data[Math.floor((slot / BARS) * data.length)] / 255 : 0
        const level = Math.min(1, analyser ? song * 0.35 + sample * 1.15 : song)
        bar.style.transform = `scaleY(${0.18 + level * 0.82})`
      })
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frame)
  }, [reduceMotion])

  useEffect(() => () => {
    track.current?.stop()
    void audio.current?.close()
  }, [])

  const toggleSound = async () => {
    if (soundOn) {
      track.current?.stop()
      track.current = null
      setSoundOn(false)
      return
    }
    const ctx = audio.current ?? new AudioContext()
    audio.current = ctx
    if (ctx.state === 'suspended') await ctx.resume()
    track.current = startTrack(ctx)
    setSoundOn(true)
  }

  const choose = () => {
    try { track.current?.stop() } catch { /* keep the click working if audio already stopped */ }
    track.current = null
    onChooseConcert()
  }

  return (
    <motion.section
      className="vybe-landing"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg className="poster-art" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="poster-warm" cx="50%" cy="40%" r="42%">
            <stop offset="0%" stopColor="#ffd29a" />
            <stop offset="28%" stopColor="#ff7a18" />
            <stop offset="58%" stopColor="#9a3412" />
            <stop offset="100%" stopColor="#07060b" />
          </radialGradient>
          <linearGradient id="poster-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9be7ff" />
            <stop offset="24%" stopColor="#fff3b0" />
            <stop offset="48%" stopColor="#ff8a1f" />
            <stop offset="74%" stopColor="#ff5ea8" />
            <stop offset="100%" stopColor="#7dd3fc" />
          </linearGradient>
          <filter id="poster-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <rect width="1200" height="760" fill="#07060b" />
        <ellipse className="poster-glow" cx="600" cy="340" rx="380" ry="320" fill="url(#poster-warm)" />
        <path
          className="poster-ribbon"
          d="M390 310 C 430 150, 700 110, 790 250 C 860 360, 720 450, 590 340 C 500 260, 540 190, 710 210"
          fill="none"
          stroke="url(#poster-ribbon)"
          strokeWidth="34"
          strokeLinecap="round"
          filter="url(#poster-glow)"
          opacity="0.85"
        />
        <path
          className="poster-ribbon"
          d="M390 310 C 430 150, 700 110, 790 250 C 860 360, 720 450, 590 340 C 500 260, 540 190, 710 210"
          fill="none"
          stroke="url(#poster-ribbon)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <g fill="#07060b">
          <path d="M250 760 C 330 560, 470 500, 600 498 C 730 500, 870 560, 950 760 Z" />
          <rect x="568" y="392" width="64" height="120" rx="22" />
          <circle cx="600" cy="292" r="108" />
          <path d="M492 292 C 500 168, 700 168, 708 292" fill="none" stroke="#07060b" strokeWidth="16" strokeLinecap="round" />
          <rect x="470" y="262" width="36" height="78" rx="16" />
          <rect x="694" y="262" width="36" height="78" rx="16" />
          <ellipse cx="458" cy="312" rx="34" ry="42" />
          <ellipse cx="742" cy="312" rx="34" ry="42" />
          <rect x="438" y="248" width="11" height="62" rx="5" />
          <rect x="454" y="236" width="11" height="70" rx="5" />
          <rect x="470" y="242" width="11" height="58" rx="5" />
          <rect x="720" y="242" width="11" height="58" rx="5" />
          <rect x="736" y="236" width="11" height="70" rx="5" />
          <rect x="752" y="248" width="11" height="62" rx="5" />
        </g>
      </svg>

      <div className="poster-fx" aria-hidden="true">
        <span className="poster-ring" />
        <span className="poster-ring" />
        <span className="poster-ring" />
        <span className="poster-sweep" />
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            className="poster-particle"
            style={{
              left: `${(index * 37) % 100}%`,
              top: `${(index * 53) % 100}%`,
              animationDelay: `${(index % 9) * 0.4}s`,
              animationDuration: `${4.5 + (index % 5)}s`,
            }}
          />
        ))}
      </div>
      <div className="poster-grain" aria-hidden="true" />
      <Waveform className="poster-top-wave" waveRef={topWave} />

      <button type="button" className="sound-toggle" onClick={() => void toggleSound()} aria-pressed={soundOn}>
        {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        {soundOn ? 'Sound on' : 'Sound off'}
      </button>

      <div className="poster-copy">
        <h1 className="poster-title">VYBE</h1>
        <button type="button" className="poster-cta" onClick={choose}>
          Choose a show
        </button>
      </div>
    </motion.section>
  )
}
