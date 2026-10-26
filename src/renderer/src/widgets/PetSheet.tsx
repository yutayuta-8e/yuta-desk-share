import { useEffect, useRef } from 'react'
import { PET_VARIANTS, drawPet, type PetPose } from '../light/petDraw'

/**
 * Dev-only sheet (scripts/pet-sheet.js): every pet look in every main pose, animated with the same
 * drawing code as the real pet, over a wallpaper. Not one of the desktop widgets.
 */
const POSES: { state: string; label: string }[] = [
  { state: 'idle', label: 'ふだん' },
  { state: 'walk', label: 'おさんぽ' },
  { state: 'hover', label: 'ふわふわ' },
  { state: 'tease', label: 'いたずら' },
  { state: 'stretch', label: 'のび' },
  { state: 'sleep', label: 'すやすや' }
]
const CELL = 160
const SCALE = 1
// the pet lives in the lower part of its 160 px box; show only that
const CROP_TOP = 48
const ROW = CELL - CROP_TOP
const params = new URLSearchParams(location.search)
const BG = params.get('bg')
const HALO = params.get('halo') ?? 'rgb(214, 190, 232)'

function Cell({ variant, state, seed }: { variant: string; state: string; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    c.width = CELL * SCALE * dpr; c.height = ROW * SCALE * dpr
    const ctx = c.getContext('2d')!
    let raf = 0
    const t0 = performance.now() - seed * 700
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      ctx.setTransform(dpr * SCALE, 0, 0, dpr * SCALE, 0, -CROP_TOP * dpr * SCALE)
      ctx.clearRect(0, 0, CELL, CELL)
      const dir: 1 | -1 = state === 'walk' ? (Math.floor(t / 3) % 2 ? -1 : 1) : 1
      const pose: PetPose = {
        state, t, dir,
        eyeX: state === 'sleep' ? 0 : Math.sin(t * 0.7) * 3, eyeY: state === 'sleep' ? 0 : Math.cos(t * 0.5) * 1.5,
        blink: state === 'idle' && t % 4 < 0.14 ? 0.1 : 0,
        jumpY: state === 'tease' ? -Math.abs(Math.sin(t * 3.2)) * 10 : 0,
        flee: false
      }
      const breath = 0.45 + 0.55 * (1 - Math.cos(((Date.now() % 6000) / 6000) * Math.PI * 2)) / 2
      drawPet(ctx, CELL, variant, pose, { core: '#ffffff', halo: HALO }, breath, 1.1)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [variant, state, seed])
  return <canvas ref={ref} style={{ width: CELL * SCALE, height: ROW * SCALE, display: 'block' }} />
}

export function PetSheet() {
  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: "'Zen Kurenaido', sans-serif", color: '#fff',
      background: BG ? `linear-gradient(rgba(10,6,16,0.45), rgba(10,6,16,0.45)), url("${BG}") center / cover` : '#141019'
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${POSES.length}, ${CELL * SCALE}px)`, padding: '18px 24px', columnGap: 4 }}>
        <div />
        {POSES.map((p) => <div key={p.state} style={{ textAlign: 'center', fontSize: 17, textShadow: `0 0 8px ${HALO}` }}>{p.label}</div>)}
        {PET_VARIANTS.map((v, i) => [
          <div key={v.id + '-l'} style={{ alignSelf: 'center', fontSize: 19, textShadow: `0 0 8px ${HALO}` }}>{i}. {v.label}</div>,
          ...POSES.map((p, j) => <Cell key={v.id + p.state} variant={v.id} state={p.state} seed={i * 7 + j} />)
        ])}
      </div>
    </div>
  )
}
