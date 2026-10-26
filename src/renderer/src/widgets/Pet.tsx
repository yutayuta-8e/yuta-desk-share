import { useEffect, useRef, useState } from 'react'
import { yd } from '../api'
import { useConfig, useWallpaper } from '../hooks'
import type { Bounds, PetState, WidgetId } from '@shared/types'
import { TEST_BG, TestUnderlay } from '../light/testBg'
import { timeOfDay } from '../light/timeOfDay'
import { hmNow } from '../light/clockTime'
import { PET_VARIANTS, drawPet, trailOrigin } from '../light/petDraw'

/**
 * The pet: a little creature drawn as one line of light. Its look is provisional (the owner will
 * choose a design once everything else is done); its behaviour is decided (2026-10-26 grill):
 *  - personality: mischievous and at its own pace (いたずらっ子＋マイペース)
 *  - it roams the whole desktop: walks along the bottom, floats anywhere (the centre too), sits on
 *    the top edge of widgets, and sometimes flies over to tease one (the clock's digits jiggle, a
 *    launcher icon wobbles), then runs off giggling
 *  - time of day: stretches in the morning, wanders by day, gets sleepy at dusk, sleeps at night;
 *    says "おはよう" the first time the mouse moves after 6:00 and "おやすみ" at midnight
 *  - every hour from 6:00 to 23:00 it calls out the time ("15時だよ"); quiet from 0:00 to 6:00
 *  - when a task is marked done it hops for joy
 * The window moves with the pet, so the pet is the only clickable area.
 */
const SIZE = 160
const BODY = 64
/** Debug only: ?petvariant=ears shows that look regardless of the config. */
const DEBUG_VARIANT = new URLSearchParams(location.search).get('petvariant')
const WALK = 38 // px/s
const FLY = 150 // px/s
const PHRASES = ['やっほ〜', 'ねむい…', 'おつかれ！', 'なでて？', '…？', 'がんばろ', 'ひま〜']
const CHEERS = ['えらい！', 'やったね！', 'おつかれさま！']
const DEMO = new URLSearchParams(location.search).get('petdemo') === '1'

type After = 'hover' | 'perch' | 'tease' | 'land'
type Sim = {
  x: number; y: number; dir: 1 | -1; state: PetState; until: number
  vy: number; jumpY: number; blink: number; eyeX: number; eyeY: number; t: number
  tx: number; ty: number; after: After; teaseId: WidgetId | null; flee: boolean
  surfaceY: number; perch: Bounds | null; trail: { x: number; y: number }[]
  route: { x: number; y: number }[]
}
type Rect = Bounds & { id: WidgetId }

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function weighted<T extends string>(w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][]
  let r = Math.random() * entries.reduce((s, [, v]) => s + Math.max(0, v), 0)
  for (const [k, v] of entries) { r -= Math.max(0, v); if (r <= 0) return k }
  return entries[0][0]
}
const hourOf = (hm: string) => parseInt(hm.slice(0, 2), 10)
const today = () => new Date().toDateString()
function readStore(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function writeStore(key: string, v: string): void { try { localStorage.setItem(key, v) } catch { /* private storage off: greet again next time */ } }

export function Pet() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wp = useWallpaper()
  const cfg = useConfig()
  const sim = useRef<Sim | null>(null)
  const cursor = useRef({ x: 0, y: 0 })
  const [bubble, setBubble] = useState('')
  // test harness only: where the pet window is, so the test wallpaper can be drawn behind it
  const [testPos, setTestPos] = useState<{ x: number; y: number } | null>(null)
  const bubbleTimer = useRef<number | null>(null)
  const sayRef = useRef<(t: string, ms?: number) => void>(() => {})
  // the look can change from the menu without restarting the animation loop
  const variantRef = useRef('classic')
  variantRef.current = DEBUG_VARIANT ?? PET_VARIANTS[cfg?.pet.variant ?? 0]?.id ?? 'classic'

  const say = (t: string, ms = 1800) => {
    setBubble(t)
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => setBubble(''), ms)
  }
  sayRef.current = say

  useEffect(() => {
    if (!wp) return
    const screenW = wp.screenW, screenH = wp.screenH
    const floorY = (wp.workH || screenH - 48) - SIZE + 2 // stand on the taskbar's top edge
    const speed = DEMO ? 2.2 : 1
    const dur = (min: number, span: number) => (min + Math.random() * span) * (DEMO ? 0.35 : 1)
    let rects: Rect[] = []
    const loadRects = () => {
      void yd.getWidgetRects().then((r) => {
        rects = r
        const s = sim.current
        if (s && !airborne(s) && blocked(s.x, s.y)) {
          const fx = floorSpot(s.x)
          if (fx !== null) { s.x = fx; s.y = floorY; s.perch = null; yd.petMove(s.x, s.y) }
        }
      })
    }
    loadRects()
    const rectTimer = window.setInterval(loadRects, 10_000)

    if (!sim.current) {
      void yd.getBounds().then((b) => {
        const x = b ? b.x : screenW / 2
        sim.current = {
          x, y: floorY, dir: 1, state: 'idle', until: performance.now() + 1500, vy: 0, jumpY: 0, blink: 0, eyeX: 0, eyeY: 0, t: 0,
          tx: x, ty: floorY, after: 'land', teaseId: null, flee: false, surfaceY: floorY, perch: null, trail: [], route: []
        }
        yd.petMove(x, floorY)
      })
    }

    let raf = 0
    let last = performance.now()
    let lastAnnounced = hmNow()
    let lastCursor = { x: -1, y: -1 }
    let lastDodge = 0
    const cursorTimer = window.setInterval(() => {
      void yd.getCursor().then((c) => {
        const moved = lastCursor.x >= 0 && Math.hypot(c.x - lastCursor.x, c.y - lastCursor.y) > 3
        lastCursor = c
        cursor.current = c
        if (moved) maybeGreet()
      })
    }, 120)

    const clampX = (x: number) => Math.min(screenW - SIZE, Math.max(0, x))
    const clampY = (y: number) => Math.min(floorY, Math.max(0, y))
    const airborne = (s: Sim) => s.state === 'fly' || s.state === 'hover'

    // Windows inside the desktop do not blend with each other: wherever the pet's window overlaps a
    // widget, that part of the widget is replaced by bare wallpaper. So the pet never crosses a
    // widget; it flies around them, sits on their top edge and teases them from the side.
    const M = 10 // widget windows have empty margins; touching them is fine
    const blocked = (x: number, y: number) => rects.some((r) =>
      x < r.x + r.width - M && x + SIZE > r.x + M && y < r.y + r.height - M && y + SIZE > r.y + M)
    const pathFree = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16))
      for (let i = 0; i <= n; i++) if (blocked(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false
      return true
    }
    const randomFree = (tries = 40): { x: number; y: number } | null => {
      for (let i = 0; i < tries; i++) {
        const x = Math.random() * (screenW - SIZE), y = 40 + Math.random() * (floorY - 40)
        if (!blocked(x, y)) return { x, y }
      }
      return null
    }
    /** A path to (x, y): straight if clear, else through one free waypoint, else null. */
    const routeTo = (s: Sim, x: number, y: number): { x: number; y: number }[] | null => {
      if (blocked(x, y)) return null
      if (pathFree(s.x, s.y, x, y)) return [{ x, y }]
      for (let i = 0; i < 60; i++) {
        const w = randomFree(1)
        if (w && pathFree(s.x, s.y, w.x, w.y) && pathFree(w.x, w.y, x, y)) return [w, { x, y }]
      }
      return null
    }
    const flyTo = (s: Sim, x: number, y: number, after: After): boolean => {
      const route = routeTo(s, clampX(x), clampY(y))
      if (!route) return false
      s.route = route
      const first = route[0]
      s.tx = first.x; s.ty = first.y; s.after = after; s.perch = null
      s.state = 'fly'; s.until = Infinity
      s.dir = s.tx < s.x ? -1 : 1
      yd.petRaise()
      return true
    }
    /** Somewhere free on the floor, as near as possible to x. */
    const floorSpot = (x: number): number | null => {
      for (let d = 0; d < screenW; d += 24) {
        for (const c of [x + d, x - d]) if (c >= 0 && c <= screenW - SIZE && !blocked(c, floorY)) return c
      }
      return null
    }
    const land = (s: Sim) => {
      const fx = floorSpot(s.x + (Math.random() - 0.5) * 300)
      if (fx === null || !flyTo(s, fx, floorY, 'land')) { s.state = 'hover'; s.until = performance.now() + 3000 }
    }
    const flyAnywhere = (s: Sim): boolean => {
      for (let i = 0; i < 12; i++) { const p = randomFree(); if (p && flyTo(s, p.x, p.y, 'hover')) return true }
      return false
    }

    /** Somewhere to sit: the top edge of a widget with room above it (the pet's feet on the edge). */
    const perchSpot = (): { x: number; y: number; r: Rect } | null => {
      const spots = rects.filter((r) => r.y - SIZE + 8 > 0 && r.width > SIZE * 0.8)
        .map((r) => ({ r, x: r.x + Math.random() * Math.max(0, r.width - SIZE), y: r.y - SIZE + 8 }))
        .filter((p) => !blocked(p.x, p.y))
      return spots.length ? pick(spots) : null
    }
    /** Right beside a widget to tease (only widgets that react). */
    const teaseSpot = (): { x: number; y: number; id: WidgetId } | null => {
      const ok = rects.filter((r) => r.id === 'launcher' || r.id === 'clock')
      if (!ok.length) return null
      const r = pick(ok)
      // from just outside the widget: below the clock, beside the launcher
      if (r.id === 'clock') return { id: r.id, x: r.x + r.width * (0.25 + Math.random() * 0.5) - SIZE / 2, y: r.y + r.height - M }
      const left = r.x > screenW / 2
      return { id: r.id, x: left ? r.x - SIZE + M : r.x + r.width - M, y: r.y + r.height * (0.2 + Math.random() * 0.5) - SIZE / 2 }
    }

    const sleepy = () => { const h = hourOf(hmNow()); return h < 6 }

    const pickState = (s: Sim, now: number) => {
      const tod = timeOfDay()
      const h = hourOf(hmNow())
      const morning = h >= 6 && h < 10
      if (sleepy() && airborne(s)) return land(s)
      if (s.state === 'hover') {
        // in the air: drift somewhere else, or come down
        const r = Math.random()
        if (r < 0.35 && flyAnywhere(s)) return
        if (r < 0.6) { const p = perchSpot(); if (p && flyTo(s, p.x, p.y, 'perch')) { s.perch = p.r; return } }
        return land(s)
      }
      if (sleepy()) {
        if (airborne(s)) return land(s)
        s.state = Math.random() < 0.85 ? 'sleep' : 'look'
        s.until = now + dur(15000, 20000)
        return
      }
      const onPerch = s.perch !== null
      const next = weighted({
        walk: onPerch ? 0.12 : 0.24,
        idle: 0.16,
        look: 0.1,
        sleep: 0.04 + 0.32 * tod.night,
        stretch: morning ? 0.16 : 0.03,
        yawn: 0.02 + 0.14 * tod.night,
        fly: (0.14 + (DEMO ? 0.2 : 0)) * (1 - tod.night * 0.6),
        perch: onPerch ? 0 : 0.09 * (1 - tod.night * 0.5),
        tease: (0.07 + (DEMO ? 0.25 : 0)) * (1 - tod.night * 0.8),
        hop: onPerch ? 0.1 : 0
      })
      if (next === 'fly' && flyAnywhere(s)) return
      if (next === 'perch') { const p = perchSpot(); if (p && flyTo(s, p.x, p.y, 'perch')) { s.perch = p.r; return } }
      if (next === 'tease') { const p = teaseSpot(); if (p && flyTo(s, p.x, p.y, 'tease')) { s.teaseId = p.id; return } }
      if (next === 'hop') return land(s) // hop down from a widget
      if (next === 'walk') { s.state = 'walk'; s.dir = Math.random() < 0.5 ? -1 : 1; s.until = now + dur(2000, 4000); return }
      if (next === 'sleep') { s.state = 'sleep'; s.until = now + dur(8000, 12000); return }
      if (next === 'stretch') { s.state = 'stretch'; s.until = now + 1800; return }
      if (next === 'yawn') { s.state = 'yawn'; s.until = now + 1600; return }
      if (next === 'look') { s.state = 'look'; s.until = now + dur(2000, 2000); return }
      s.state = 'idle'; s.until = now + dur(1500, 3000)
    }

    const wake = (s: Sim, now: number) => { if (s.state === 'sleep') { s.state = 'idle'; s.until = now + 1200 } }
    const hop = (s: Sim) => { if (!airborne(s)) { s.state = 'jump'; s.vy = -420; s.jumpY = 0 } }

    // "おはよう": the first time the mouse moves after 6:00 (before noon), once a day
    const maybeGreet = () => {
      const s = sim.current
      if (!s) return
      const h = hourOf(hmNow())
      if (h < 6 || h >= 12 || readStore('yd-pet-morning') === today()) return
      writeStore('yd-pet-morning', today())
      const now = performance.now()
      wake(s, now)
      s.state = 'stretch'; s.until = now + 1800
      sayRef.current('おはよう', 2600)
    }

    // every hour: "15時だよ" (6:00-23:00), "おやすみ" at midnight, quiet until 6:00
    const checkHour = (s: Sim, now: number) => {
      const hm = hmNow()
      if (hm === lastAnnounced) return
      lastAnnounced = hm
      if (!hm.endsWith(':00')) return
      const h = hourOf(hm)
      if (h === 0) { sayRef.current('おやすみ', 3000); if (airborne(s)) land(s); else { s.state = 'sleep'; s.until = now + 30000 } return }
      if (h < 6) return
      wake(s, now)
      hop(s)
      sayRef.current(`${h}時だよ`, 2600)
    }

    // colours follow the light theme (white light on dark wallpapers, dark ink on bright ones)
    const ink = { core: '#ffffff', halo: '#ffffff' }
    const readInk = () => {
      const cs = getComputedStyle(document.documentElement)
      ink.core = cs.getPropertyValue('--ink').trim() || '#ffffff'
      ink.halo = cs.getPropertyValue('--halo').trim() || '#ffffff'
    }
    readInk()
    const inkTimer = window.setInterval(readInk, 3000)

    /** The pet is a single line of light (see light/petDraw.ts for the six looks). */
    const draw = (s: Sim) => {
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      if (c.width !== SIZE * dpr) { c.width = SIZE * dpr; c.height = SIZE * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, SIZE, SIZE)
      const phase = (Date.now() % 6000) / 6000
      const k = timeOfDay().k
      const breath = Math.min(1, (0.45 + 0.55 * (1 - Math.cos(phase * Math.PI * 2)) / 2) * Math.min(1.15, k))
      const variant = variantRef.current
      // a fading trail of light while flying
      if (s.trail.length) {
        const o = trailOrigin(SIZE, s, variant)
        ctx.fillStyle = ink.halo
        s.trail.forEach((pt, i) => {
          const tx = o.x + (pt.x - s.x), ty = o.y + (pt.y - s.y)
          if (tx < 0 || tx > SIZE || ty < 0 || ty > SIZE) return
          ctx.globalAlpha = (i + 1) / s.trail.length * 0.5 * breath
          ctx.beginPath(); ctx.arc(tx, ty, 1.6, 0, Math.PI * 2); ctx.fill()
        })
        ctx.globalAlpha = 1
      }
      drawPet(ctx, SIZE, variant, s, ink, breath, k)
    }

    const step = (now: number) => {
      const s = sim.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (s) {
        s.t += dt
        checkHour(s, now)
        if (now > s.until && s.state !== 'jump' && s.state !== 'fly') pickState(s, now)
        if (s.state === 'walk') {
          const lo = s.perch ? s.perch.x - SIZE * 0.2 : 0
          const hi = s.perch ? s.perch.x + s.perch.width - SIZE * 0.8 : screenW - SIZE
          const nx = s.x + s.dir * WALK * speed * dt
          if (nx < lo || nx > hi || blocked(nx, s.y)) {
            s.dir = s.dir === 1 ? -1 : 1
            if (blocked(s.x + s.dir * 2, s.y)) { s.state = s.perch ? 'perch' : 'idle'; s.until = now + 1500 }
          } else s.x = nx
          yd.petMove(s.x, s.y)
        }
        if (s.state === 'fly') {
          const dx = s.tx - s.x, dy = s.ty - s.y
          const d = Math.hypot(dx, dy)
          const v = FLY * speed * (s.flee ? 1.6 : 1) * Math.min(1, 0.35 + d / 160)
          s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 8) s.trail.shift()
          if (d < 3) {
            s.x = s.tx; s.y = s.ty
            s.trail = []
            if (s.route.length > 1) { s.route.shift(); s.tx = s.route[0].x; s.ty = s.route[0].y; s.dir = s.tx < s.x ? -1 : 1; yd.petMove(s.x, s.y) }
            else if (s.after === 'perch') { s.state = 'perch'; s.surfaceY = s.y; s.until = now + dur(5000, 8000) }
            else if (s.after === 'tease' && s.teaseId) {
              yd.petPoke(s.teaseId)
              s.state = 'tease'; s.until = now + 1100
              sayRef.current('えいっ', 1200)
            } else if (s.after === 'land') { s.state = 'idle'; s.y = floorY; s.surfaceY = floorY; s.until = now + 1200 }
            else { s.state = 'hover'; s.until = now + dur(3000, 4000) }
            s.flee = false
          } else {
            s.x += dx / d * Math.min(d, v * dt); s.y += dy / d * Math.min(d, v * dt)
            if (Math.abs(dx) > 4) s.dir = dx < 0 ? -1 : 1
          }
          yd.petMove(s.x, s.y)
        }
        if (s.state === 'tease' && now > s.until) {
          // run off giggling
          s.flee = true
          sayRef.current('えへへ', 1600)
          if (!flyTo(s, s.x + (s.x > screenW / 2 ? -1 : 1) * (260 + Math.random() * 260), 80 + Math.random() * (floorY - 160), 'hover') && !flyAnywhere(s)) land(s)
          s.teaseId = null
        }
        if (s.state === 'jump') {
          s.vy += 1400 * dt
          s.jumpY += s.vy * dt
          if (s.jumpY >= 0) { s.jumpY = 0; s.vy = 0; s.state = s.perch ? 'perch' : 'idle'; s.until = now + 800 }
        }
        // mischief: a cursor rushing at the pet sometimes gets dodged
        const pcx = s.x + SIZE / 2, pcy = s.y + SIZE - BODY / 2
        const dx = cursor.current.x - pcx, dy = cursor.current.y - pcy
        const dist = Math.hypot(dx, dy) || 1
        if (dist < 70 && now - lastDodge > 20000 && s.state !== 'sleep' && s.state !== 'fly' && !sleepy() && Math.random() < 0.02) {
          lastDodge = now
          s.flee = true
          sayRef.current('べーっ', 1400)
          if (!flyTo(s, s.x - Math.sign(dx) * (140 + Math.random() * 120), s.y - 60 - Math.random() * 120, 'hover')) s.flee = false
        }
        // eyes follow the cursor (except while sleeping)
        const want = s.state === 'sleep' ? 0 : Math.min(1, dist / 400)
        s.eyeX += ((dx / dist) * want * 4 - s.eyeX) * 0.15
        s.eyeY += ((dy / dist) * want * 3 - s.eyeY) * 0.15
        const calm = s.state === 'idle' || s.state === 'perch' || s.state === 'hover'
        if (calm && Math.abs(dx) < 220 && Math.abs(dy) < 220) s.dir = dx < 0 ? -1 : 1
        s.blink = s.blink > 0 ? s.blink - dt : (Math.random() < 0.006 ? 0.14 : 0)
        draw(s)
        if (TEST_BG) setTestPos((p) => (p && Math.abs(p.x - s.x) < 1 && Math.abs(p.y - s.y) < 1 ? p : { x: s.x, y: s.y }))
      }
      // resting: ~12 fps is plenty; moving: 30 fps
      const slow = !s || ['sleep', 'idle', 'look', 'perch'].includes(s.state)
      raf = window.setTimeout(() => requestAnimationFrame(step), slow ? 80 : 33) as unknown as number
    }

    const offEvent = yd.onPetEvent((ev) => {
      const s = sim.current
      if (!s || ev.type !== 'task-done') return
      wake(s, performance.now())
      hop(s)
      sayRef.current(pick(CHEERS), 2200)
    })

    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf); clearTimeout(raf)
      clearInterval(cursorTimer); clearInterval(inkTimer); clearInterval(rectTimer)
      offEvent()
    }
  }, [wp])

  const onClick = () => {
    const s = sim.current
    if (!s) return
    if (s.state === 'sleep') { s.state = 'idle'; s.until = performance.now() + 1500; say(cfg?.pet.wakePhrase ?? '…はっ！'); return }
    if (s.state === 'fly' || s.state === 'hover') { say(pick(cfg?.pet.phrases?.length ? cfg.pet.phrases : PHRASES)); return }
    s.state = 'jump'; s.vy = -420; s.jumpY = 0
    say(pick(cfg?.pet.phrases?.length ? cfg.pet.phrases : PHRASES))
  }

  return (
    <div className="pet-root" onClick={onClick} onContextMenu={(e) => { e.preventDefault(); yd.contextMenu('pet') }}>
      {TEST_BG && testPos && <TestUnderlay wp={wp} bounds={{ x: testPos.x, y: testPos.y, width: SIZE, height: SIZE }} zoom={1} />}
      <canvas ref={canvas} />
      {bubble && <div className="bubble">{bubble}</div>}
    </div>
  )
}
