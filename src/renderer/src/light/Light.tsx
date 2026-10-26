import { useEffect, useId, type ReactNode } from 'react'
import { useWallpaper } from '../hooks'
import { DIGITS, DIGIT_BOX } from '../digits'
import { TEST_BG, probeTestBg } from './testBg'
import { clockLayout, kernLayout } from './kerning'
import { yd } from '../api'
import { timeOfDay } from './timeOfDay'

/** Windows that have breathing elements; the others skip the timer entirely. */
const BREATHES = new Set(['clock', 'calendar'])

/**
 * v2 "呼吸する光": every glyph is light drawn on the wallpaper, never a surface.
 *  - colours come from the wallpaper (its vivid accent) plus white; nothing else
 *  - on dark wallpapers the ink is white light with an accent halo; on bright ones the ink turns
 *    dark and the halo turns white, so text sinks instead of glowing
 *  - one shared 6 s breath, phase-locked to the wall clock so every window breathes together;
 *    only the large elements breathe (cheap: opacity on their own compositor layer)
 */
export function useLightTheme(): void {
  const wp = useWallpaper()
  // The shared breath: 6 s, phase taken from the wall clock so every window is in step. 10 fps is
  // plenty for a slow fade and keeps the compositor mostly idle (a CSS animation would run at 60).
  // Time of day: tint and glow strength follow the sky (checked every minute; CSS glides 3 s).
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const t = timeOfDay()
      root.style.setProperty('--glow-k', t.k.toFixed(3))
      root.style.setProperty('--night', t.night.toFixed(3))
      root.dataset.tod = t.name
    }
    apply()
    const h = window.setInterval(apply, 60_000)
    return () => window.clearInterval(h)
  }, [])
  useEffect(() => {
    if (!BREATHES.has(String(yd.widgetId))) return
    const root = document.documentElement
    let last = ''
    const tick = () => {
      const phase = (Date.now() % 6000) / 6000
      // gentle in the morning (k < 1), deeper and steadier at night (k > 1)
      const k = timeOfDay().k
      const lo = Math.min(0.75, 0.45 * k), hi = Math.min(1, 0.98 * k + 0.05)
      const v = (lo + (hi - lo) * (1 - Math.cos(phase * Math.PI * 2)) / 2).toFixed(3)
      if (v !== last) { root.style.setProperty('--breath', v); last = v }
    }
    tick()
    const t = window.setInterval(tick, 100)
    return () => window.clearInterval(t)
  }, [])
  useEffect(() => {
    if (!wp) return
    const root = document.documentElement
    const apply = (luma: number, accent: string) => {
      root.dataset.light = luma > 150 ? 'bright' : 'dark'
      root.style.setProperty('--accent', accent)
    }
    if (TEST_BG) { void probeTestBg().then((t) => apply(t.luma, t.accent)); return }
    apply(wp.luma ?? 40, wp.accent)
  }, [wp?.accent, wp?.luma])
}

/** Text as light. `breathe` gives it a separate glow layer that rides the shared breath. */
export function Glow({ children, breathe = false, className, title }: { children: ReactNode; breathe?: boolean; className?: string; title?: string }) {
  if (!breathe) return <span className={`lt-soft ${className ?? ''}`} title={title}>{children}</span>
  return (
    <span className={`lt ${className ?? ''}`} title={title}>
      <span className="lt-glow" aria-hidden="true">{children}</span>
      <span className="lt-core">{children}</span>
    </span>
  )
}

/**
 * Digits written as a single stroke of light. A digit that changes is re-written (the stroke
 * travels its path in 1.2 s); unchanged digits stay put. The colon breathes.
 */
export function StrokeDigits({ text, size, stroke = 2.4, breathe = true, write = true, kern = false, run = 0 }: { text: string; size: number; stroke?: number; breathe?: boolean; write?: boolean; kern?: boolean; run?: number }) {
  const id = useId().replace(/:/g, '')
  const s = size / DIGIT_BOX.h
  const sw = stroke / s
  const gap = 10
  const items: { key: string; x: number; ch: string; d?: string }[] = []
  let vbW: number
  if (kern) {
    // Optical kerning (big clock only). For "HH:MM" the colon is pinned to the centre of a fixed box
    // and the hours / minutes are kerned away from it, so the colon never moves; digits that stay
    // glide to their new kerned place when the time changes (see .lt-kern).
    let xs: number[], boxW: number
    if (/^\d\d:\d\d$/.test(text)) {
      ({ xs, boxW } = clockLayout(text))
    } else {
      const lay = kernLayout(text)
      boxW = lay.inkRight - lay.inkLeft
      xs = lay.xs.map((x) => x - lay.inkLeft)
    }
    ;[...text].filter((ch) => DIGITS[ch]).forEach((ch, i) => {
      items.push({ key: `${i}-${ch}`, x: xs[i], ch, d: ch === ':' ? undefined : DIGITS[ch].d })
    })
    vbW = boxW + sw * 6
  } else {
    let x = 0
    ;[...text].forEach((ch, i) => {
      const g = DIGITS[ch]
      if (!g) { x += 50; return }
      items.push({ key: `${i}-${ch}`, x, ch, d: ch === ':' ? undefined : g.d })
      x += g.advance + gap
    })
    vbW = Math.max(1, x - gap) + sw * 6
  }
  const vbY = 6, vbH = 118
  const w = vbW * s, h = vbH * s
  const body = (cls: string) => items.map((it, i) => it.ch === ':'
    ? <g key={it.key} style={{ transform: `translate(${it.x + sw * 3}px,0px)` }} className={kern ? 'lt-colon lt-kern' : 'lt-colon'}>
        <circle cx={20} cy={46} r={sw * 2} />
        <circle cx={20} cy={92} r={sw * 2} />
      </g>
    : <path key={it.key} d={it.d} pathLength={1}
        className={`${write ? 'lt-write' : ''} ${kern ? 'lt-kern' : ''} ${cls}`}
        style={{ transform: `translate(${it.x + sw * 3}px,0px)`, animationDelay: `${i * 0.09}s` }} />)
  return (
    <span className={`lt-digits ${run ? 'lt-chime' : ''}`} style={{ width: w, height: h }}>
      {breathe && (
        <svg className="lt-digits-glow" width={w} height={h} viewBox={`0 ${vbY} ${vbW} ${vbH}`} aria-hidden="true">
          <defs><filter id={`b${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={sw * 2.6} /></filter></defs>
          <g filter={`url(#b${id})`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw * 4.5}>{body('')}</g>
        </svg>
      )}
      <svg className="lt-digits-core" width={w} height={h} viewBox={`0 ${vbY} ${vbW} ${vbH}`} role="img" aria-label={text}>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw}>{body('')}</g>
      </svg>
      {run > 0 && (
        // the hourly spark: a short bright segment that travels each stroke once, after the rewrite
        <svg key={run} className="lt-digits-run" width={w} height={h} viewBox={`0 ${vbY} ${vbW} ${vbH}`} aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw * 3.2}>
            {items.filter((it) => it.d).map((it, i) => (
              <path key={it.key} d={it.d} pathLength={1} className="lt-run"
                style={{ transform: `translate(${it.x + sw * 3}px,0px)`, animationDelay: `${1.25 + i * 0.14}s` }} />
            ))}
          </g>
        </svg>
      )}
    </span>
  )
}

/** Width in px that StrokeDigits takes for this text (kerned), so columns of numbers can line up. */
export function strokeDigitsWidth(text: string, size: number, stroke = 2.4): number {
  const s = size / DIGIT_BOX.h
  const lay = kernLayout(text)
  return (lay.inkRight - lay.inkLeft + (stroke / s) * 6) * s
}

/** A thin line of light. `value` 0..1 lights that fraction of it. */
export function LightLine({ width, value, hot = false }: { width: number; value?: number; hot?: boolean }) {
  return (
    <span className="lt-line" style={{ width }}>
      {value !== undefined && <i className={hot ? 'hot' : ''} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />}
    </span>
  )
}
