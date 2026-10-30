import { DIGITS } from '../digits'

/**
 * Optical kerning for the single-stroke clock digits.
 *
 * Each glyph's ink is measured as a left and a right contour on horizontal bands. For a pair, the
 * gap is a blend of the narrowest distance and the average distance between the two contours (open
 * space is capped so a hole like the one under the arm of a 7 does not suck the next digit in).
 * Every pair is then spaced to the same optical gap as "00", with a hard minimum so strokes never
 * crowd. The colon is spaced by its nearest distance only, so it sits evenly between the hours and
 * the minutes.
 */
const Y0 = 10, Y1 = 120, BANDS = 28
const BAND_H = (Y1 - Y0) / BANDS
const HALF_STROKE = 1.4 // ink half width in glyph units (the core stroke is about 2.4 px on a 140 px clock)
const TIGHTEN = 0.85 // optical gap relative to "00" at the old fixed spacing
const MIN_GAP = 12 // closest any two strokes may come, in glyph units
const COLON_R = 4.4
// Hand-tuned on top of the optical spacing (2026-10-26, 本人の指示). Debug: ?kern=round,before,after
const TUNE = (() => {
  const q = new URLSearchParams(location.search).get('kern')?.split(',').map(Number)
  return {
    round: q && isFinite(q[0]) ? q[0] : 8, // extra pull for a bowl next to a bowl (00, 08, 90 ...)
    colonBefore: q && isFinite(q[1]) ? q[1] : 0.85, // hours -> colon, relative to the digit gap
    colonAfter: q && isFinite(q[2]) ? q[2] : 0.7 // colon -> minutes (the minutes sit closer)
  }
})()
const RIGHT_ROUND = '03689' // glyphs whose right side is a bowl
const LEFT_ROUND = '0689' // glyphs whose left side is a bowl
// Per pair, on top of everything above (glyph units, + opens): every one of the 100 pairs and the
// colon pairs was looked at large, and these are the ones that read wrong. Mostly a top-right end
// (5's bar, 6's hook, the loop of 9) running into a top-left start (1's flag, 7's bar, 9's loop).
// Approved by the owner on a before/after sheet (2026-10-28); the other pairs stay as computed.
// The pairs of 2 were looked at again when the 2 became smaller (2026-10-31): its top is now lower, so
// what stands high to its right (7's bar, 3's top) would slide over it.
const PAIR_TUNE: Record<string, number> = {
  '51': 8, '61': 6, '69': 6, '97': 5, '27': 10, '23': 8, '24': 3, '59': 4, '87': 3,
  '81': 2, '91': 2, '37': 2, '57': 2, '40': -3,
  '7:': -6, ':1': -4, ':4': -3
}

type Profile = { left: (number | null)[]; right: (number | null)[]; minX: number; maxX: number }
const cache = new Map<string, Profile>()

function emptyProfile(): Profile {
  return { left: new Array(BANDS).fill(null), right: new Array(BANDS).fill(null), minX: Infinity, maxX: -Infinity }
}

function addInk(p: Profile, x: number, y: number, r: number): void {
  const b0 = Math.max(0, Math.floor((y - r - Y0) / BAND_H))
  const b1 = Math.min(BANDS - 1, Math.floor((y + r - Y0) / BAND_H))
  for (let b = b0; b <= b1; b++) {
    const l = p.left[b], rr = p.right[b]
    p.left[b] = l === null ? x - r : Math.min(l, x - r)
    p.right[b] = rr === null ? x + r : Math.max(rr, x + r)
  }
  p.minX = Math.min(p.minX, x - r)
  p.maxX = Math.max(p.maxX, x + r)
}

let probe: SVGPathElement | null = null
function profileOf(ch: string): Profile | null {
  const hit = cache.get(ch)
  if (hit) return hit
  const g = DIGITS[ch]
  if (!g) return null
  const p = emptyProfile()
  if (ch === ':') {
    for (const cy of [46, 92]) addInk(p, 20, cy, COLON_R)
  } else {
    if (!probe) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0')
      svg.style.position = 'absolute'; svg.style.visibility = 'hidden'
      probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svg.appendChild(probe)
      document.body.appendChild(svg)
    }
    probe.setAttribute('d', g.d)
    const total = probe.getTotalLength()
    const n = Math.max(120, Math.ceil(total))
    for (let i = 0; i <= n; i++) {
      const pt = probe.getPointAtLength((total * i) / n)
      addInk(p, pt.x, pt.y, HALF_STROKE)
    }
  }
  cache.set(ch, p)
  return p
}

/** Optical gap between L (origin 0) and R (origin o). */
function gapAt(L: Profile, R: Profile, o: number, cap: number, nearestOnly: boolean): { gap: number; nearest: number } {
  let nearest = Infinity, sum = 0, n = 0
  for (let b = 0; b < BANDS; b++) {
    const lr = L.right[b], rl = R.left[b]
    if (lr === null && rl === null) continue
    if (lr === null || rl === null) { sum += cap; n++; continue }
    const d = o + rl - lr
    nearest = Math.min(nearest, d)
    sum += Math.min(d, cap); n++
  }
  if (!isFinite(nearest)) nearest = cap
  const mean = n ? sum / n : cap
  return { gap: nearestOnly ? nearest : 0.5 * nearest + 0.5 * mean, nearest }
}

let target: number | null = null
function targetGap(): number {
  if (target !== null) return target
  const z = profileOf('0')!
  // old layout: advance 130 + gap 10
  target = gapAt(z, z, 140, 1e9, false).gap * TIGHTEN
  return target
}

const pairCache = new Map<string, number>()
/** Distance from L's origin to R's origin. */
export function pairAdvance(l: string, r: string): number {
  const key = l + r
  const hit = pairCache.get(key)
  if (hit !== undefined) return hit
  const L = profileOf(l), R = profileOf(r)
  if (!L || !R) return (DIGITS[l]?.advance ?? 60) + 10
  const colon = l === ':' || r === ':'
  const T = l === ':' ? targetGap() * TUNE.colonAfter : r === ':' ? targetGap() * TUNE.colonBefore : targetGap()
  if (colon) {
    // Next to the colon, measure from the digit's outer edge, not band by band: a digit that is
    // open on that side (3, 4, 7 ...) must not slide under the dots (bug seen at 19:38).
    const o = T + L.maxX - R.minX + (PAIR_TUNE[key] ?? 0)
    pairCache.set(key, o)
    return o
  }
  const cap = targetGap() * 1.6
  let lo = -200, hi = 400
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (gapAt(L, R, mid, cap, colon).gap < T) lo = mid; else hi = mid
  }
  let o = hi
  if (RIGHT_ROUND.includes(l) && LEFT_ROUND.includes(r)) o -= TUNE.round
  // never let strokes crowd
  let need = -Infinity
  for (let b = 0; b < BANDS; b++) {
    const lr = L.right[b], rl = R.left[b]
    if (lr !== null && rl !== null) need = Math.max(need, lr - rl + MIN_GAP)
  }
  if (isFinite(need)) o = Math.max(o, need)
  // the hand-tuned pairs were judged on this final spacing, so they apply after the minimum
  o += PAIR_TUNE[key] ?? 0
  pairCache.set(key, o)
  return o
}

export type KernLayout = { xs: number[]; inkLeft: number; inkRight: number }

/** Origins of each glyph (glyph units) and the ink extent of the whole string. */
export function kernLayout(text: string): KernLayout {
  const chars = [...text].filter((c) => DIGITS[c])
  const xs: number[] = []
  let x = 0
  chars.forEach((c, i) => {
    if (i > 0) x += pairAdvance(chars[i - 1], c)
    xs.push(x)
  })
  const first = chars.length ? profileOf(chars[0]) : null
  const last = chars.length ? profileOf(chars[chars.length - 1]) : null
  return { xs, inkLeft: first ? first.minX : 0, inkRight: last ? xs[xs.length - 1] + last.maxX : 0 }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
let clockHalf: number | null = null
/** Half the width a "HH:MM" clock needs when its colon is pinned to the centre (widest hours / minutes). */
function clockHalfWidth(): number {
  if (clockHalf !== null) return clockHalf
  const colon = profileOf(':')!
  const cc = (colon.minX + colon.maxX) / 2
  let half = 0
  for (let h = 0; h < 24; h++) {
    const s = pad2(h)
    const x1 = -pairAdvance(s[1], ':') - pairAdvance(s[0], s[1])
    half = Math.max(half, cc - (x1 + profileOf(s[0])!.minX))
  }
  for (let m = 0; m < 60; m++) {
    const s = pad2(m)
    const x2 = pairAdvance(':', s[0]) + pairAdvance(s[0], s[1])
    half = Math.max(half, x2 + profileOf(s[1])!.maxX - cc)
  }
  clockHalf = half
  return half
}

/**
 * "HH:MM" with the colon pinned to the centre of a fixed box: the hours are kerned leftwards from
 * the colon and the minutes rightwards, so the colon never moves when the time changes.
 */
export function clockLayout(text: string): { xs: number[]; boxW: number } {
  const [h1, h2, , m1, m2] = [...text]
  const half = clockHalfWidth()
  const colon = profileOf(':')!
  const co = half - (colon.minX + colon.maxX) / 2
  const x2 = co - pairAdvance(h2, ':')
  const x1 = x2 - pairAdvance(h1, h2)
  const x3 = co + pairAdvance(':', m1)
  const x4 = x3 + pairAdvance(m1, m2)
  return { xs: [x1, x2, co, x3, x4], boxW: half * 2 }
}
