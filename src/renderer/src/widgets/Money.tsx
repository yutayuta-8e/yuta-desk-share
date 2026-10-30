import { useEffect, useMemo, useRef, useState } from 'react'
import { Glass } from '../Glass'
import { Glow, StrokeDigits } from '../light/Light'
import { drawBlink, drawLashes, eyeGlass, paintEye, unitArea, type EyeDesign, type GlassEye } from '../light/glassEyes'
import { useBounds, useFeed, useNow } from '../hooks'
import { yd } from '../api'
import { monthNum, monthRows, plain, sumMonth, ymOf, yen } from '../money'

const get = () => yd.getMoney()
const on = yd.onMoney

/**
 * A sum written in light, three digits at a time with a small comma of light between the groups.
 * StrokeDigits leaves three strokes of air on each side of its ink; that is taken back here, so the
 * first digit stands on the left edge of whatever is above and below it.
 */
export function LightAmount({ n, size }: { n: number; size: number }) {
  const groups = plain(Math.abs(n)).split(',')
  const stroke = Math.max(1.6, size * 0.05), air = stroke * 3, comma = size * 0.17 - air
  return (
    <span className="lt-amount" style={{ marginLeft: -air, marginRight: -air }}>
      {n < 0 && <Glow className="sign">−</Glow>}
      {groups.map((g, i) => (
        <span key={i} className="grp">
          {i > 0 && <i className="comma" style={{ height: size * 0.2, marginLeft: comma, marginRight: comma }} />}
          <StrokeDigits text={g} size={size} stroke={stroke} breathe={false} kern />
        </span>
      ))}
    </span>
  )
}

/* ---------- the eyes ---------- */
// One scale for every eye and every month: the area of an eye is its money, so the eyes grow as the
// month goes on and a category with nothing spent yet has no eye. (A food eye of 33,900 yen is 176 wide.)
const YEN_PER_AREA = 33900 / (unitArea('wide') * 176 * 176)
const MIN_WIDTH = 16
// the largest categories have their own design; the rest share the hollow eye
const DESIGNS: EyeDesign[] = ['wide', 'bloodshot', 'lashes', 'heavy']
const query = new URLSearchParams(location.search)
const FROZEN = query.get('blink') // checks only: every eye held at this much closed, nothing moving
// the place of the eyes changes with each start of the app, then stays
const SEED = Number(query.get('eyeseed')) || Math.floor(Math.random() * 1e8) + 1
const still = () => FROZEN !== null || matchMedia('(prefers-reduced-motion: reduce)').matches

type Rect = { x: number; y: number; w: number; h: number }
type Spot = { x: number; y: number; rot: number; seed: number }
const dice = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647 }

/** Places the eyes by chance: tilted any way, not on the text, not on each other. null if they do not fit. `reach` is how far an eye's lashes stick out. */
function scatter(radii: number[], reach: number[], W: number, H: number, keep: Rect[], seed: number): Spot[] | null {
  const r = dice(seed)
  const onText = (x: number, y: number, q: number) => keep.some((k) => x + q > k.x && x - q < k.x + k.w && y + q * 0.72 > k.y && y - q * 0.72 < k.y + k.h)
  for (let attempt = 0; attempt < 300; attempt++) {
    const placed: (Spot & { q: number })[] = []
    const fits = radii.every((q, i) => {
      for (let t = 0; t < 200; t++) {
        const x = q + 10 + r() * Math.max(0, W - 2 * q - 20), y = q * 0.72 + 10 + r() * Math.max(0, H - 1.44 * q - 20)
        if (onText(x, y, q + reach[i]) || placed.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.25) < p.q + q + 6)) continue
        placed.push({ x, y, q, rot: (r() - 0.5) * 1.5, seed: Math.floor(r() * 1e6) + 1 })
        return true
      }
      return false
    })
    if (fits) return placed
  }
  return null
}

/** Drifts on its own, very slowly, returning to where it began every 36 s; only moved, never redrawn. */
function drift(el: HTMLElement, seed: number): Animation | undefined {
  if (still()) return undefined
  const r = dice(seed), a = 4 + r() * 5, ph = [r() * 6.28, r() * 6.28, r() * 6.28], n = [1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2)]
  const frames = Array.from({ length: 49 }, (_, i) => {
    const t = i / 48 * 6.2832
    const x = a * Math.sin(n[0] * t + ph[0]) + a * 0.4 * Math.sin((n[0] + 1) * t + ph[1]), y = a * 0.8 * Math.sin(n[1] * t + ph[2])
    return { transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(0.04 * Math.sin(n[1] * t + ph[1])).toFixed(4)}rad) scale(${(1 + 0.015 * Math.sin(t + ph[0])).toFixed(4)})` }
  })
  return el.animate(frames, { duration: 36000, iterations: Infinity, easing: 'linear' })
}
/** A slow breath between two states, there and back, each eye at its own pace. */
const breathe = (el: Element | null | undefined, from: Keyframe, to: Keyframe, ms: number, delay: number) =>
  el?.animate([from, to], { duration: ms, delay: -delay, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' })

// how far the lid has come down on each step of a blink, 55 ms apart: down slowly, a moment shut, up more slowly
const CLOSE = [0.04, 0.12, 0.24, 0.4, 0.58, 0.74, 0.87, 0.96, 1, 1, 1, 1, 0.97, 0.9, 0.8, 0.68, 0.55, 0.42, 0.3, 0.19, 0.1, 0.04, 0]
// how far the pupil opens and closes, across and down
const PUPIL: Record<EyeDesign, [number, number, number, number]> = { wide: [0.5, 0.96, 1.4, 1.04], lashes: [0.5, 0.96, 1.4, 1.04], bloodshot: [0.74, 0.74, 1.14, 1.14], heavy: [0.7, 0.7, 1.2, 1.2], hollow: [0.92, 0.92, 1.03, 1.03] }

// where the pointer is on the screen; the eyes turn to it for a while after it moves
const pointer = { x: 0, y: 0, at: 0 }
let screenOrigin = { x: 0, y: 0 }

/** A canvas made elsewhere, placed here. */
function Part({ c, x = 0, y = 0 }: { c: HTMLCanvasElement | null; x?: number; y?: number }) {
  return <span className="me-part" style={{ left: x, top: y }} ref={(n) => { if (n && c && n.firstChild !== c) n.replaceChildren(c) }} />
}

/** One eye and all that moves in it. `wave` makes it blink with the others. */
function Eye({ eye, spot, label, sub, wave, tag }: { eye: GlassEye; spot: Spot; label: string; sub: string; wave: number; tag: string }) {
  const box = useRef<HTMLDivElement>(null)
  const gaze = useRef<HTMLDivElement>(null)
  const size = eye.half * 2, sz = (c: HTMLCanvasElement) => c.width / eye.k

  const blink = useRef<() => void>(() => {})
  useEffect(() => {
    drawBlink(eye, FROZEN ? Number(FROZEN) : 0)
    if (still()) return
    const r = dice(spot.seed), slow = eye.w > 120 ? 1.25 : 1, rare = eye.design === 'hollow' ? 1.7 : 1
    let alive = true, timer = 0, busy = false
    const plan = () => { window.clearTimeout(timer); timer = window.setTimeout(run, (16000 + r() * r() * 50000) * rare) }
    const run = () => {
      if (busy) return
      if (document.hidden) { plan(); return }
      busy = true
      let i = 0
      const step = () => {
        if (!alive) return
        drawBlink(eye, CLOSE[i++])
        if (i < CLOSE.length) timer = window.setTimeout(step, 55 * slow)
        else { busy = false; plan() }
      }
      step()
    }
    blink.current = run
    plan()
    return () => { alive = false; window.clearTimeout(timer) }
  }, [eye, spot.seed])
  // now and then they all blink, one just after another
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = window.setTimeout(() => blink.current(), (spot.seed % 7) * 160)
    return () => window.clearTimeout(t)
  }, [wave, spot.seed])

  // everything that only breathes: moved by the compositor, nothing redrawn
  useEffect(() => {
    const on = [drift(box.current!, spot.seed)]
    if (!still()) {
      const r = dice(spot.seed + 5), [ax, ay, bx, by] = PUPIL[eye.design]
      on.push(breathe(eye.pupil, { transform: `scale(${ax}, ${ay})` }, { transform: `scale(${bx}, ${by})` }, 11000 + r() * 8000, r() * 8000))
      on.push(eye.iris.animate([{ transform: 'rotate(0turn)' }, { transform: `rotate(${r() > 0.5 ? 1 : -1}turn)` }], { duration: 240000 + r() * 180000, iterations: Infinity, easing: 'linear' }))
      if (eye.veins) {
        const beat = 9000 + r() * 6000
        on.push(breathe(eye.veins.near, { opacity: 0.45 }, { opacity: 1 }, beat, 0))
        on.push(breathe(eye.veins.far, { opacity: 0 }, { opacity: 1 }, beat, beat * 0.25))
      }
      if (eye.heavy) on.push(breathe(eye.heavy, { transform: `translateY(${(-eye.h * 0.05).toFixed(1)}px)` }, { transform: `translateY(${(eye.h * 0.13).toFixed(1)}px)` }, 15000 + r() * 8000, r() * 8000))
    }
    return () => { for (const a of on) a?.cancel() }
  }, [eye, spot.seed])

  // the gaze: to the pointer for a while after it moves, otherwise wandering now and then
  useEffect(() => {
    const el = gaze.current!
    if (still()) return
    const r = dice(spot.seed + 9), far = eye.design === 'hollow' ? 0.5 : 1, mx = eye.R * 0.24 * far, my = eye.R * 0.1 * far
    let next = Date.now() + 3000 + r() * 9000
    const look = (x: number, y: number, ms: number) => { el.style.transition = `transform ${ms}ms cubic-bezier(.4, 0, .3, 1)`; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }
    const t = window.setInterval(() => {
      const now = Date.now()
      if (now - pointer.at < 7000) {
        const b = box.current!.getBoundingClientRect(), dx = pointer.x - screenOrigin.x - (b.left + b.width / 2), dy = pointer.y - screenOrigin.y - (b.top + b.height / 2), d = Math.hypot(dx, dy) || 1, near = Math.min(1, d / 220)
        const lx = dx / d * Math.cos(spot.rot) + dy / d * Math.sin(spot.rot), ly = -dx / d * Math.sin(spot.rot) + dy / d * Math.cos(spot.rot)
        look(lx * mx * near, ly * my * near, 1800); next = now + 4000
      } else if (now > next) {
        const a = r() * 6.2832, q = r() < 0.3 ? 0 : 0.4 + r() * 0.6
        look(Math.cos(a) * mx * q, Math.sin(a) * my * q, 2600); next = now + 9000 + r() * 20000
      }
    }, 400)
    return () => window.clearInterval(t)
  }, [eye, spot.seed, spot.rot])

  // the lashes sway, 15 times a second, only on the eye that has them
  useEffect(() => {
    if (!eye.lashes) return
    drawLashes(eye, spot.seed)
    if (still()) return
    let raf = 0, last = 0
    const tick = (now: number) => { raf = requestAnimationFrame(tick); if (now - last < 66) return; last = now; drawLashes(eye, now / 1000 + spot.seed) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [eye, spot.seed])

  const irisS = sz(eye.iris), pupS = sz(eye.pupil), shine = eye.R * (eye.design === 'hollow' ? 0.05 : 0.075)
  return (
    <div ref={box} className="me-eye" style={{ left: spot.x, top: spot.y }}>
      <div className="me-turn" style={{ transform: `rotate(${spot.rot}rad)`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}>
        <Part c={eye.lashCanvas} />
        <Part c={eye.sclera} />
        <div className="me-clip" style={{ width: size, height: size, clipPath: `path("${eye.clipPath}")` }}>
          {eye.veins && <Part c={eye.veins.near} />}
          {eye.veins && <Part c={eye.veins.far} />}
          <div ref={gaze} className="me-gaze" style={{ left: eye.irisAt[0], top: eye.irisAt[1] }}>
            <Part c={eye.iris} x={-irisS / 2} y={-irisS / 2} />
            <Part c={eye.pupil} x={-pupS / 2} y={-pupS / 2} />
            <i className="me-shine" style={{ left: -eye.R * 0.34 - shine, top: -eye.R * 0.42 - shine, width: shine * 2, height: shine * 2 }} />
          </div>
          <Part c={eye.heavy} />
        </div>
        <Part c={eye.top} />
      </div>
      <div className="me-hit" style={{ width: eye.w * 0.8, height: eye.h * 0.9, marginLeft: -eye.w * 0.4, marginTop: -eye.h * 0.45 }}>
        <span className={`me-tag ${tag}`} style={tag.includes('up') ? undefined : { top: eye.h * 0.9 + 4 }}><Glow>{label}</Glow> {sub}</span>
      </div>
    </div>
  )
}

/** The month's money as one strip of the eyes' glass, each pane as long as its share. */
function GlassStrip({ groups }: { groups: { label: string; total: number }[] }) {
  return (
    <div className="mw-strip">
      {[...groups].sort((a, b) => b.total - a.total).map((g) => {
        const [deep, lit] = eyeGlass(g.label)
        return <i key={g.label} style={{ flexGrow: Math.max(0, g.total), background: `linear-gradient(112deg, ${deep} -10%, ${lit} 46%, color-mix(in srgb, ${lit} 72%, #fff 20%) 60%, ${lit} 72%, ${deep} 118%)` }} />
      })}
    </div>
  )
}

/**
 * The household accounts on the desktop (2026-10-30, owner): this month's spending in light with one
 * spaced line under it, as the clock has its date, and the money as a swarm of stained-glass eyes
 * floating around it. The area of an eye is what went on that category; its iris is cut into one facet
 * per purchase. A click on the words or an eye opens the card with the details.
 */
export function Money() {
  const data = useFeed(get, on)
  const now = useNow(60_000)
  const [open, setOpen] = useState(false)
  useEffect(() => yd.onMoneyCardState(setOpen), [])
  const field = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const [eyes, setEyes] = useState<{ eye: GlassEye; spot: Spot; label: string; sub: string; key: string; tag: string }[]>([])
  const [wave, setWave] = useState(0)
  const bounds = useBounds()
  useEffect(() => { if (bounds) screenOrigin = { x: bounds.x, y: bounds.y } }, [bounds])
  useEffect(() => yd.onCursor((p) => { pointer.x = p.x; pointer.y = p.y; pointer.at = Date.now() }), [])

  const month = ymOf(now)
  const today = now.getDate()
  const rows = useMemo(() => monthRows(data, month), [data, month])
  const sums = useMemo(() => sumMonth(month, rows), [month, rows])

  const groups = useMemo(() => {
    const own = sums.cats.slice(0, 4).map((c) => ({ label: c.name, items: [c] }))
    const rest = sums.cats.slice(4)
    return rest.length ? [...own, { label: 'ほか', items: rest }] : own
  }, [sums])
  const paintKey = useMemo(() => JSON.stringify([month, today, rows.map((r) => [r.date, r.amount, r.category])]), [month, today, rows])

  // painted once for each change in the data; a little at a time, so the desktop never stutters
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const el = field.current, t = top.current
      if (!el || !t) return
      const base = el.getBoundingClientRect(), b = t.getBoundingClientRect()
      // with room for the eyes' drift, so the words are never touched
      const keep: Rect[] = [{ x: b.left - base.left - 4, y: b.top - base.top - 2, w: b.width + 16, h: b.height + 12 }]
      const designs = groups.map((g, i) => (i < 4 && g.label !== 'ほか' ? DESIGNS[i] : 'hollow') as EyeDesign)
      const widthAt = (g: (typeof groups)[number], i: number, scale: number) => Math.max(MIN_WIDTH, Math.sqrt(g.items.reduce((a, c) => a + c.total, 0) / YEN_PER_AREA / unitArea(designs[i])) * scale)
      // the same scale always, unless the month has grown too large to fit: then all shrink together
      let widths: number[] = [], spots: Spot[] | null = null
      for (let scale = 1; scale > 0.3 && !spots; scale *= 0.94) {
        widths = groups.map((g, i) => widthAt(g, i, scale))
        spots = scatter(widths.map((w) => w * 0.46), widths.map((w, i) => (designs[i] === 'lashes' ? w * 0.22 : 0)), base.width, base.height, keep, SEED)
      }
      if (!spots) return
      const k = Math.min(3, (window.devicePixelRatio || 1) * 1.5)
      const out: typeof eyes = []
      for (let i = 0; i < groups.length; i++) {
        await new Promise((r) => setTimeout(r, 0))
        if (cancelled) return
        const g = groups[i], eye = paintEye({ design: designs[i], width: widths[i], items: g.items, rows, days: sums.days, today, seed: 11 + i * 13 }, k)
        // the tag goes under the eye, or over it when the window ends first, and keeps inside the window at the sides
        const s = spots[i], tag = `${s.y + eye.h * 0.45 + 28 > base.height ? 'up' : ''} ${s.x < 72 ? 'l' : s.x > base.width - 72 ? 'r' : ''}`
        out.push({ eye, spot: s, label: g.label, sub: yen(g.items.reduce((a, c) => a + c.total, 0)), key: g.label, tag })
      }
      if (!cancelled) setEyes(out)
    })()
    return () => { cancelled = true }
  }, [paintKey, groups, sums.days, today, rows])

  useEffect(() => {
    if (still()) return
    let t = 0
    const plan = () => { t = window.setTimeout(() => { setWave((w) => w + 1); plan() }, 180000 + Math.random() * 240000) }
    plan()
    return () => window.clearTimeout(t)
  }, [])

  return (
    <Glass id="money" className={`v2-money ${open ? 'on' : ''}`}>
      <div className="mw" role="button" tabIndex={-1} aria-label="家計簿を開く" onClick={(e) => { if ((e.target as Element).closest('.mw-top, .me-hit')) yd.moneyCardOpen() }}>
        <div ref={field} className="me-field">
          {eyes.map((e) => <Eye key={e.key} eye={e.eye} spot={e.spot} label={e.label} sub={e.sub} wave={wave} tag={e.tag} />)}
        </div>
        <div ref={top} className="mw-top">
          {data?.error
            ? <div className="v2-note">{data.error}</div>
            : (
              <div className="mw-total">
                <LightAmount n={sums.net} size={42} />
                <Glow className="yen">円</Glow>
              </div>
            )}
          {sums.net > 0 && <GlassStrip groups={groups.map((g) => ({ label: g.label, total: g.items.reduce((a, c) => a + c.total, 0) }))} />}
          <Glow className="mw-label">{monthNum(month)}月の支出</Glow>
        </div>
      </div>
    </Glass>
  )
}
