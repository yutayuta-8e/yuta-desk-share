import { useEffect, useRef, useState } from 'react'
import { useBounds, useWallpaper } from '../hooks'
import { wallpaperPlacement } from '../Glass'
import type { Bounds, WallpaperInfo } from '@shared/types'

/**
 * The see-through cards as a slab of glass floating over the wallpaper (2026-10-29, owner: "like it
 * refracts, as if it floats"). The wallpaper behind the card is drawn inside it at its exact place
 * and bent near the edges the way a thick glass edge bends light: the rim pulls in what lies just
 * outside, the colours part a little there, the edges facing the light (top, left) catch it and the
 * far ones dim a little. The corners stay square: the two edges meet on the diagonal like a picture
 * frame (owner: no round shading in the corners). The middle stays clear, under the same 10 % film
 * as before. Drawn once for each place and size, so an open card costs nothing.
 */
type Look = { bevel: number; pull: number; chroma: number; zoom: number; light: number }
const LOOKS: Record<string, Look> = {
  soft: { bevel: 14, pull: 6, chroma: 0.06, zoom: 1, light: 0.5 },
  clear: { bevel: 22, pull: 11, chroma: 0.1, zoom: 1.015, light: 0.8 },
  thick: { bevel: 32, pull: 18, chroma: 0.16, zoom: 1.03, light: 1 }
}
// ?refract=soft|thick shows the other strengths, for comparing
const LOOK = LOOKS[new URLSearchParams(location.search).get('refract') ?? ''] ?? LOOKS.clear
const FILM = [18, 12, 24] // #120c18, the card's film
const TINT = 0.1
const LIGHT = [-0.6, -0.8] // toward the light: up and to the left

type Box = { x: number; y: number; w: number; h: number }

let cached: { url: string; img: Promise<HTMLImageElement> } | null = null
function load(url: string): Promise<HTMLImageElement> {
  if (cached?.url !== url) {
    const img = new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous' // main serves the wallpaper readable (wallpaper.ts), so its pixels can be bent
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    cached = { url, img }
  }
  return cached.img
}

/** Where the element sits in its window, before any transform (the bubble pops in scaled). */
function boxOf(el: HTMLElement): Box {
  let x = 0, y = 0
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

type Shape = 'rect' | 'pill'

/**
 * Put first inside a see-through card, a widget's frame (Glass.tsx) or the pet's bubble: it fills its
 * parent, behind the contents. `pill`: a fully rounded shape (the bubble). `at`: the window's place on
 * the screen, for a window that moves itself (the pet) and so is not told; it also redraws whenever
 * it changes, as the bubble follows the pet's head.
 */
export function Refraction({ shape = 'rect', at }: { shape?: Shape; at?: { x: number; y: number; k?: number } }) {
  const wp = useWallpaper()
  const bounds = useBounds()
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0) // bumped when the parent's size changes (fields opening)

  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => setSize((n) => n + 1))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    const parent = c?.parentElement
    const win = at ? { x: at.x, y: at.y, width: 0, height: 0 } : bounds
    if (!c || !parent || !wp || !win || !wp.width) return
    let cancelled = false
    // at most one drawing a frame (a widget being dragged reports every step)
    const raf = requestAnimationFrame(() => {
      const box = boxOf(parent)
      if (box.w < 1 || box.h < 1) return
      load(wp.url).then((img) => { if (!cancelled) paint(c, img, wp, win, box, shape) }, () => {})
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [wp, bounds, size, shape, at?.x, at?.y, at?.k])

  return <canvas ref={ref} className={`refract ${shape}`} aria-hidden="true" />
}

function paint(c: HTMLCanvasElement, img: HTMLImageElement, wp: WallpaperInfo, win: Bounds, box: Box, shape: Shape): void {
  const dpr = window.devicePixelRatio || 1
  const W = Math.round(box.w * dpr), H = Math.round(box.h * dpr)
  // the wallpaper under the card and a margin around it (the rim samples from just outside)
  const m = Math.ceil((LOOK.pull + 4) * dpr)
  const sw = W + 2 * m, sh = H + 2 * m
  const src = document.createElement('canvas')
  src.width = sw; src.height = sh
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  const p = wallpaperPlacement(wp, win, 1)
  sctx.drawImage(img, (p.left - box.x) * dpr + m, (p.top - box.y) * dpr + m, p.width * dpr, p.height * dpr)
  let from: ImageData
  try { from = sctx.getImageData(0, 0, sw, sh) } catch { return } // unreadable: the plain film stays
  const S = from.data
  const out = new ImageData(W, H)
  const O = out.data
  const B = Math.min(LOOK.bevel * dpr, Math.min(W, H) / 2), A = LOOK.pull * dpr * (shape === 'pill' ? 0.6 : 1)
  const cx = W / 2, cy = H / 2

  // one channel at (x, y) in the source, between pixels
  const at = (x: number, y: number, ch: number): number => {
    x = Math.min(Math.max(x, 0), sw - 1.001); y = Math.min(Math.max(y, 0), sh - 1.001)
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0
    const i = (y0 * sw + x0) * 4 + ch
    const a = S[i] + (S[i + 4] - S[i]) * fx
    const b = S[i + sw * 4] + (S[i + sw * 4 + 4] - S[i + sw * 4]) * fx
    return a + (b - a) * fy
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5
      // distance in from the nearest edge and the way out through it: square corners for a card, or
      // round all along for the bubble (from the line through its middle)
      let d: number, nx = 0, ny = 0
      if (shape === 'pill') {
        const r = Math.min(W, H) / 2
        const lx = Math.min(Math.max(px, r), W - r), ly = Math.min(Math.max(py, r), H - r)
        const ox = px - lx, oy = py - ly, len = Math.hypot(ox, oy) || 1
        d = r - len; nx = ox / len; ny = oy / len
      } else {
        const qx = Math.min(px, W - px), qy = Math.min(py, H - py)
        if (qx < qy) { d = qx; nx = px < cx ? -1 : 1 } else { d = qy; ny = py < cy ? -1 : 1 }
      }
      const t = d >= B ? 0 : 1 - Math.max(0, d) / B
      const bend = A * t * t
      // the slab magnifies a touch around its middle
      const zx = cx + (px - cx) / LOOK.zoom + m - 0.5, zy = cy + (py - cy) / LOOK.zoom + m - 0.5
      // the rim: lit where it faces the light, dimmed where it faces away, a fine bright line at the very edge
      const f = nx * LIGHT[0] + ny * LIGHT[1]
      const rim = t * t * t, edge = t ** 10
      const lit = (f > 0 ? f * f * (55 * rim + 70 * edge) : -f * f * 22 * rim) * LOOK.light
      const o = (y * W + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        // red bends least, blue most: the colours part along the rim
        const k = bend * (1 + (ch - 1) * LOOK.chroma)
        const v = at(zx + nx * k, zy + ny * k, ch)
        O[o + ch] = v * (1 - TINT) + FILM[ch] * TINT + lit
      }
      O[o + 3] = 255
    }
  }
  c.width = W; c.height = H
  c.getContext('2d')!.putImageData(out, 0, 0)
}
