// Eyes cut from stained glass for the household accounts (2026-10-30, owner). Light through glass, not
// paint: deep colour, panes with their own grain and direction, lead between them, the light bleeding
// back over the lead. The iris holds the month's money: a crystal laid out on a disk (every facet one
// purchase, its area the amount) and carried out around the pupil by an area-keeping map. An eye is
// painted once, into canvases that are then only moved; the blink and the lashes are drawn on top.
import type { MoneyRow } from '@shared/types'

export type Pt = [number, number]
export type EyeDesign = 'wide' | 'bloodshot' | 'heavy' | 'lashes' | 'hollow'
export type EyeSpec = {
  design: EyeDesign
  width: number
  /** the categories in this eye's iris, and their net spending */
  items: { name: string; total: number }[]
  /** this month's rows, for the purchases in the iris and each day's largest category */
  rows: MoneyRow[]
  /** net spending per day of the month, for the veins and the lashes */
  days: number[]
  today: number
  seed: number
}
export type Lash = { root: Pt; dir: number; len: number; base: number; fill: string; phase: number }
export type GlassEye = {
  design: EyeDesign; w: number; h: number; half: number; k: number; R: number; r0: number; irisAt: Pt; clipPath: string
  sclera: HTMLCanvasElement; veins: { near: HTMLCanvasElement; far: HTMLCanvasElement } | null; iris: HTMLCanvasElement; pupil: HTMLCanvasElement; heavy: HTMLCanvasElement | null
  rim: HTMLCanvasElement; lid: HTMLCanvasElement; top: HTMLCanvasElement; lashCanvas: HTMLCanvasElement | null; up: Pt[]; low: Pt[]; lashes: Lash[] | null
}

type Glass = [number[], number[]]
const TAU = Math.PI * 2
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
const css = (c: number[], a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`
const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
const sum = (x: number[]) => x.reduce((a, b) => a + b, 0)

// few hues, deep, in the key of the wallpaper: the old windows hold together by their small palette
const GLASS: Record<string, Glass> = {
  ruby: [hex('#2e0512'), hex('#a81c38')], sapphire: [hex('#050d33'), hex('#23509f')], amethyst: [hex('#160829'), hex('#6339a6')],
  emerald: [hex('#031f1d'), hex('#1b7263')], amber: [hex('#2c1a04'), hex('#c08a2a')], rose: [hex('#26101c'), hex('#a0607c')],
  pale: [hex('#26231f'), hex('#b9ae95')], plum: [hex('#0d0518'), hex('#3a1c60')], bone: [hex('#1d1a14'), hex('#b8ad8c')], ash: [hex('#0c0a10'), hex('#4c4656')],
  pupil: [hex('#1a0208'), hex('#6a0a20')]
}
const HUE: Record<string, string> = { 食費: 'ruby', 娯楽: 'amethyst', サブスク: 'emerald', 通信: 'sapphire', 日用品: 'amber', 制作: 'rose', 交通: 'pale', 医療: 'pale', その他: 'pale' }
const hueOf = (name: string) => GLASS[HUE[name] ?? 'pale']
/** The category's lit colour, for the small marks beside its name. */
export const eyeColour = (name: string) => css(hueOf(name)[1])

/* ---------- glass grain: tiles of grey, where 0.5 changes nothing under 'overlay' ---------- */
function latticeNoise(n: number, fx: number, fy: number, seed: number): Float32Array {
  const r = seeded(seed), gw = Math.ceil(n * fx) + 2, gh = Math.ceil(n * fy) + 2, g = new Float32Array(gw * gh).map(() => r()), out = new Float32Array(n * n)
  const sm = (t: number) => t * t * (3 - 2 * t), p = (q: number, w: number) => g[(w % gh) * gw + (q % gw)]
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x * fx, v = y * fy, i = Math.floor(u), j = Math.floor(v), a = sm(u - i), b = sm(v - j)
    out[y * n + x] = (p(i, j) * (1 - a) + p(i + 1, j) * a) * (1 - b) + (p(i, j + 1) * (1 - a) + p(i + 1, j + 1) * a) * b
  }
  return out
}
function tile(kind: 'streaky' | 'hammered' | 'water'): HTMLCanvasElement {
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n
  const g = c.getContext('2d')!, im = g.createImageData(n, n)
  let v: (x: number, y: number) => number
  if (kind === 'streaky') { const a = latticeNoise(n, 0.012, 0.09, 11), b = latticeNoise(n, 0.03, 0.3, 23), w = latticeNoise(n, 0.008, 0.012, 31); v = (x, y) => 0.5 + (a[y * n + x] - 0.5) * 1.2 + (b[y * n + x] - 0.5) * 0.45 + (w[y * n + x] - 0.5) * 0.5 }
  else if (kind === 'hammered') { const a = latticeNoise(n, 0.06, 0.06, 41), b = latticeNoise(n, 0.14, 0.14, 43); v = (x, y) => { const i = y * n + x, j = y * n + Math.min(n - 1, x + 2), k = Math.min(n - 1, y + 2) * n + x; return 0.5 + (a[j] - a[i] + a[k] - a[i]) * 3.2 + (b[j] - b[i]) * 1.1 } }
  else { const a = latticeNoise(n, 0.015, 0.015, 53), b = latticeNoise(n, 0.05, 0.05, 59); v = (x, y) => 0.5 + (a[y * n + x] - 0.5) * 0.7 + (b[y * n + x] - 0.5) * 0.25 }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = Math.max(0, Math.min(255, v(x, y) * 255)), i = (y * n + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = q; im.data[i + 3] = 255 }
  g.putImageData(im, 0, 0)
  if (kind === 'water') { const r = seeded(77); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.35})`; g.beginPath(); g.ellipse(r() * n, r() * n, 0.6 + r() * 1.4, 0.5 + r() * 1, r() * 3, 0, 7); g.fill() } }
  return c
}
let textures: HTMLCanvasElement[] | null = null
const tiles = () => (textures ??= [tile('streaky'), tile('hammered'), tile('water')])

/* ---------- shapes ---------- */
const path = (pts: Pt[]) => { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); p.closePath(); return p }
const circle = (x: number, y: number, r: number, n = 32): Pt[] => Array.from({ length: n }, (_, i) => [x + r * Math.cos(i / n * TAU), y + r * Math.sin(i / n * TAU)] as Pt)
const ring = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.sin(a), c[1] - r * Math.cos(a)]
const sector = (c: Pt, r0: number, r1: number, a0: number, a1: number, n = 3): Pt[] => [...Array.from({ length: n + 1 }, (_, i) => ring(c, r1, a0 + (a1 - a0) * i / n)), ...Array.from({ length: n + 1 }, (_, i) => ring(c, r0, a1 - (a1 - a0) * i / n))]
const area = (p: Pt[]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1] }, 0)) / 2
function centroid(p: Pt[]): Pt { let x = 0, y = 0, A = 0; p.forEach((q, i) => { const r = p[(i + 1) % p.length], c = q[0] * r[1] - r[0] * q[1]; A += c; x += (q[0] + r[0]) * c; y += (q[1] + r[1]) * c }); return A ? [x / (3 * A), y / (3 * A)] : p[0] }
function clip(p: Pt[], nx: number, ny: number, d: number): Pt[] {
  const o: Pt[] = []
  p.forEach((q, i) => { const r = p[(i + 1) % p.length], a = q[0] * nx + q[1] * ny - d, b = r[0] * nx + r[1] * ny - d; if (a <= 0) o.push(q); if ((a < 0 && b > 0) || (a > 0 && b < 0)) { const t = a / (a - b); o.push([q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t]) } })
  return o
}
/** The opening of an eye, its top higher than its bottom and leaning toward the inner corner. */
function almond(c: Pt, w: number, h: number) {
  const n = 40, up: Pt[] = [], low: Pt[] = []
  for (let i = 0; i <= n; i++) { const t = i / n, x = c[0] - w / 2 + w * t, u = Math.pow(t, 0.84); up.push([x, c[1] - h * 0.58 * Math.pow(Math.sin(Math.PI * u), 0.72)]); low.push([x, c[1] + h * 0.42 * Math.pow(Math.sin(Math.PI * t), 0.86)]) }
  return { up, low, all: [...up, ...low.slice().reverse().slice(1, -1)] }
}
const lens = (c: Pt, wide: number, tall: number, sideways = false): Pt[] => {
  const hh = tall / 2, hw = wide / 2, R = (hh * hh + hw * hw) / (2 * hw), n = 22, right: Pt[] = [], left: Pt[] = []
  for (let i = 0; i <= n; i++) { const y = -hh + tall * i / n, x = Math.sqrt(R * R - y * y) - (R - hw); right.push([x, y]); if (i > 0 && i < n) left.unshift([-x, y]) }
  return [...right, ...left].map((q) => (sideways ? [c[0] + q[1], c[1] + q[0]] : [c[0] + q[0], c[1] + q[1]]) as Pt)
}

/* ---------- a weighted Voronoi layout: every cell's area true to its value ---------- */
type Site = { x: number; y: number; w: number; t: number }
const cells = (poly: Pt[], sites: Site[]) => sites.map((a, i) => { let p = poly; for (let j = 0; j < sites.length && p.length > 2; j++) { if (i === j) continue; const b = sites[j], nx = 2 * (b.x - a.x), ny = 2 * (b.y - a.y), d = b.x * b.x + b.y * b.y - b.w - a.x * a.x - a.y * a.y + a.w; if (nx || ny) p = clip(p, nx, ny, d) } return p })
function layout(poly: Pt[], values: number[], seed: number): Pt[][] {
  if (values.length === 1) return [poly]
  const r = seeded(seed), T = sum(values), A = area(poly), c0 = centroid(poly), rad = Math.sqrt(A / Math.PI)
  const sites: Site[] = values.map((v, i) => { const a = i * 2.39996, d = Math.sqrt((i + 0.5) / values.length) * rad * 0.7; return { x: c0[0] + d * Math.cos(a) + r() * 2, y: c0[1] + d * Math.sin(a) + r() * 2, w: 0, t: A * v / T } })
  for (let it = 0; it < 180; it++) cells(poly, sites).forEach((p, i) => {
    const s = sites[i]
    if (p.length < 3) { s.w += s.t * 0.3; return }
    const cen = centroid(p)
    if (it < 150) { s.x += (cen[0] - s.x) * 0.5; s.y += (cen[1] - s.y) * 0.5 }
    s.w += (s.t - area(p)) * 0.55
  })
  return cells(poly, sites)
}

/* ---------- painting ---------- */
class Painter {
  G: CanvasRenderingContext2D
  L: CanvasRenderingContext2D
  grain: () => number
  constructor(readonly size: number, readonly k: number, seed: number) {
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = Math.ceil(size * k); const g = c.getContext('2d')!; g.scale(k, k); return g }
    this.G = mk(); this.L = mk(); this.grain = seeded(seed)
  }
  /** One cut pane: lit from behind, darker where the lead shades its edges, with its own grain. */
  pane(pts: Pt[], col: Glass, l: number, o: { c?: Pt; r?: number; lead?: number; plain?: boolean; grain?: number; ga?: number } = {}) {
    if (pts.length < 3) return
    const { G, grain } = this, p = path(pts), c = o.c ?? centroid(pts), r = o.r ?? Math.max(4, Math.sqrt(area(pts)) * 0.82)
    const core = mix(col[0], col[1], l), edge = mix(mix(col[0], [0, 0, 0], 0.45), col[1], l * 0.42)
    G.save(); G.clip(p)
    const g = G.createRadialGradient(c[0] - r * 0.12, c[1] - r * 0.16, r * 0.05, c[0], c[1], r * 1.15)
    g.addColorStop(0, css(mix(core, col[1], 0.18 * l))); g.addColorStop(0.3, css(mix(core, col[1], 0.08 * l))); g.addColorStop(0.62, css(core)); g.addColorStop(0.85, css(mix(core, edge, 0.6))); g.addColorStop(1, css(edge))
    G.fillStyle = g; G.fill(p)
    if (!o.plain && r > 3) {
      const t = tiles()[Math.floor(grain() * 3)], a = grain() * TAU, s = (o.grain ?? 0.5) * (0.8 + grain() * 0.5)
      G.globalCompositeOperation = 'overlay'; G.globalAlpha = (o.ga ?? 0.85) * 0.5
      G.translate(c[0], c[1]); G.rotate(a); G.scale(s, s); G.drawImage(t, -256 + (grain() - 0.5) * 200, -256 + (grain() - 0.5) * 200)
    }
    G.restore()
    if (o.lead !== 0) this.lead(pts, o.lead ?? 1.4)
  }
  lead(pts: Pt[], w: number, gold = 0, open = false) {
    const { L } = this
    const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); if (!open) p.closePath()
    L.lineJoin = 'round'; L.lineCap = 'round'; L.strokeStyle = '#08050c'; L.lineWidth = w; L.stroke(p)
    L.save(); L.translate(-w * 0.16, -w * 0.2); L.strokeStyle = gold ? `rgba(238,214,160,${gold})` : 'rgba(150,132,170,.34)'; L.lineWidth = Math.max(0.3, w * 0.2); L.stroke(p); L.restore()
  }
  /** The glass with one light behind it, the lead over it, and the light bleeding back over the lead. */
  finish(light: Pt, radius: number): HTMLCanvasElement {
    const { G, L, k } = this, W = G.canvas.width, H = G.canvas.height
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }
    const lit = mk(), lg = lit.getContext('2d')!, map = mk(), mg = map.getContext('2d')!
    mg.fillStyle = '#39364a'; mg.fillRect(0, 0, W, H); mg.globalCompositeOperation = 'lighter'
    const g = mg.createRadialGradient(light[0] * k, light[1] * k, 0, light[0] * k, light[1] * k, radius * k)
    g.addColorStop(0, 'rgba(255,246,235,1)'); g.addColorStop(0.35, 'rgba(222,212,214,.82)'); g.addColorStop(0.72, 'rgba(120,112,130,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    mg.fillStyle = g; mg.fillRect(0, 0, W, H)
    lg.drawImage(G.canvas, 0, 0); lg.globalCompositeOperation = 'multiply'; lg.drawImage(map, 0, 0); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(G.canvas, 0, 0)
    const out = mk(), o = out.getContext('2d')!, b = (n: number) => `blur(${n * k}px)`
    o.save(); o.filter = `${b(radius * 0.05)} brightness(0)`; o.globalAlpha = 0.72; o.drawImage(G.canvas, 0, 1.5 * k); o.restore()
    o.drawImage(lit, 0, 0); o.drawImage(L.canvas, 0, 0)
    o.save(); o.globalCompositeOperation = 'lighter'
    for (const [blur, a] of [[1.2, 0.13], [Math.max(2, radius * 0.04), 0.13], [Math.max(4, radius * 0.12), 0.13]]) { o.filter = b(blur); o.globalAlpha = a; o.drawImage(lit, 0, 0) }
    o.restore()
    return out
  }
}

const STYLE: Record<EyeDesign, { ratio: number; rk: number; r0k: number; sclera: Glass; pupil: 'slit' | 'round'; lid?: number; veins?: boolean; lashes?: boolean; crease?: boolean }> = {
  wide: { ratio: 0.62, rk: 0.46, r0k: 0.34, sclera: GLASS.bone, pupil: 'slit', crease: true },
  bloodshot: { ratio: 0.62, rk: 0.42, r0k: 0.42, sclera: GLASS.bone, pupil: 'round', veins: true, crease: true },
  heavy: { ratio: 0.56, rk: 0.5, r0k: 0.3, sclera: GLASS.ash, pupil: 'round', lid: 0.42 },
  lashes: { ratio: 0.56, rk: 0.46, r0k: 0.34, sclera: GLASS.ash, pupil: 'slit', lashes: true },
  hollow: { ratio: 0.66, rk: 0.47, r0k: 0.72, sclera: GLASS.ash, pupil: 'round' }
}
export const eyeRatio = (d: EyeDesign) => STYLE[d].ratio
/** The area of an eye of width 1, so a width can be found for an amount. */
export const unitArea = (d: EyeDesign) => area(almond([0, 0], 1, STYLE[d].ratio).all)

const dayTop = (rows: MoneyRow[], d: number) => {
  const o = new Map<string, number>()
  for (const r of rows) if (Number(r.date.slice(8, 10)) === d + 1 && r.category !== '収入') o.set(r.category, (o.get(r.category) ?? 0) + r.amount)
  return [...o].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function paintIris(P: Painter, c: Pt, R: number, r0: number, spec: EyeSpec, sc: number) {
  const toRing = (q: Pt): Pt => { const dx = q[0] - c[0], dy = q[1] - c[1], r = Math.hypot(dx, dy) / R; if (r < 1e-6) return [c[0], c[1] - r0]; const rho = Math.sqrt(r0 * r0 + r * r * (R * R - r0 * r0)); return [c[0] + dx / (r * R) * rho, c[1] + dy / (r * R) * rho] }
  const dense = (p: Pt[]) => { const out: Pt[] = []; p.forEach((q, i) => { const b = p[(i + 1) % p.length]; for (let k = 0; k < 6; k++) out.push(toRing([q[0] + (b[0] - q[0]) * k / 6, q[1] + (b[1] - q[1]) * k / 6])) }); return out }
  const disk = circle(c[0], c[1], R, 72), regions = layout(disk, spec.items.map((e) => e.total), 31)
  spec.items.forEach((item, i) => {
    const reg = regions[i]; if (reg.length < 3) return
    const bought = spec.rows.filter((r) => r.category === item.name && r.amount > 0)
    if (!bought.length) { P.pane(dense(reg), hueOf(item.name), 0.8, { lead: 0.9 * sc, grain: 0.42, ga: 0.75 }); return }
    const facets = layout(reg, bought.map((r) => r.amount), 97 + i), most = Math.max(...bought.map((r) => r.amount))
    facets.forEach((f, j) => { if (f.length > 2) P.pane(dense(f), hueOf(item.name), 0.52 + 0.48 * Math.sqrt(bought[j].amount / most), { lead: 0.9 * sc, grain: 0.42, ga: 0.75 }) })
    P.lead(dense(reg), 1.5 * sc, 0.16)
  })
}
const sized = (c: HTMLCanvasElement, k: number) => { c.style.width = `${c.width / k}px`; c.style.height = `${c.height / k}px`; return c }
const blank = (size: number, k: number) => { const c = document.createElement('canvas'); c.width = c.height = Math.ceil(size * k); const g = c.getContext('2d')!; g.scale(k, k); return { c, g } }
function vein(g: CanvasRenderingContext2D, pts: Pt[], w: number, a: number) {
  const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])))
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = `rgba(214,28,56,${a})`; g.lineWidth = w; g.stroke(p); g.strokeStyle = `rgba(255,120,120,${a * 0.5})`; g.lineWidth = w * 0.34; g.stroke(p); g.restore()
}

/**
 * Paints one eye, in parts that can move on their own: the white, the veins, the iris, the pupil, a heavy
 * lid. Each is painted once and then only moved, by the compositor. The lashes are returned as data,
 * because they sway.
 */
export function paintEye(spec: EyeSpec, k: number): GlassEye {
  const st = STYLE[spec.design], w = spec.width, h = w * st.ratio, half = Math.ceil(w * 0.86), c: Pt = [half, half], sc = Math.max(0.42, w / 260)
  const shape = almond(c, w, h), R = h * st.rk, I: Pt = [c[0], c[1] - h * 0.06], r0 = R * st.r0k, rng = seeded(spec.seed || 5150), most = Math.max(1, ...spec.days)
  const clipPath = `M${shape.all.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' L')} Z`

  // the white of the eye, in wedges that run out from the iris
  const S = new Painter(half * 2, k, 4242 + spec.seed)
  S.G.save(); S.G.clip(path(shape.all)); S.L.save(); S.L.clip(path(shape.all))
  const N = 18
  for (let i = 0; i < N; i++) { const a0 = i / N * TAU + 0.1, a1 = (i + 1) / N * TAU + 0.1; S.pane(sector(I, R * 0.9, w, a0, a1), st.sclera, 0.16 + rng() * 0.26, { lead: 0.8 * sc, grain: 0.5, ga: 0.7, c: ring(I, R * 1.28, (a0 + a1) / 2), r: w * 0.24 }) }
  S.G.restore(); S.L.restore()
  const sclera = sized(S.finish(I, w * 0.68), k)

  // veins: one for each day so far, as long as that day's spending. The ends and a flush of red are
  // apart from the roots, so the blood can come and go.
  let veins: GlassEye['veins'] = null
  if (st.veins) {
    const near = blank(half * 2, k), far = blank(half * 2, k)
    const flush = far.g.createRadialGradient(I[0], I[1], R, I[0], I[1], R + w * 0.38)
    flush.addColorStop(0, 'rgba(176,14,38,.5)'); flush.addColorStop(0.45, 'rgba(150,10,30,.2)'); flush.addColorStop(1, 'rgba(120,6,24,0)')
    far.g.fillStyle = flush; far.g.fillRect(0, 0, half * 2, half * 2)
    spec.days.forEach((v, i) => {
      if (i >= spec.today || v <= 0) return
      const th = (i + 0.5) / spec.days.length * TAU, L = w * (0.08 + 0.42 * v / most), width = Math.max(0.75, 1.25 * sc * (0.6 + 0.7 * v / most)); let x = I[0] + (R + 0.5) * Math.sin(th), y = I[1] - (R + 0.5) * Math.cos(th), dir = th
      const pts: Pt[] = [[x, y]]
      for (let s = 0; s < 7; s++) {
        dir += (rng() - 0.5) * 0.9; x += L / 7 * Math.sin(dir); y -= L / 7 * Math.cos(dir); pts.push([x, y])
        if (s === 3) { const b: Pt[] = [[x, y]]; let bx = x, by = y, bd = dir + (rng() > 0.5 ? 0.8 : -0.8); for (let q = 0; q < 3; q++) { bx += L / 8 * Math.sin(bd); by -= L / 8 * Math.cos(bd); b.push([bx, by]); bd += (rng() - 0.5) * 0.9 } vein(far.g, b, Math.max(0.5, 0.7 * sc), 0.85) }
      }
      vein(near.g, pts.slice(0, 5), width, 1); vein(far.g, pts.slice(4), width * 0.8, 1)
    })
    veins = { near: sized(near.c, k), far: sized(far.c, k) }
  }

  // the iris, around its own centre, so it can turn and look about; the pupil and its light apart from it
  const irisSize = Math.ceil(R * 2.7), ic: Pt = [irisSize / 2, irisSize / 2], P = new Painter(irisSize, k, 7 + spec.seed)
  paintIris(P, ic, R, r0, spec, sc)
  P.pane(circle(ic[0], ic[1], r0, 36), GLASS.pupil, 0.75, { lead: 0.8 * sc, plain: true })
  const iris = sized(P.finish(ic, R * 1.5), k)
  const pupilSize = Math.ceil(r0 * 2.6) + 4, pc: Pt = [pupilSize / 2, pupilSize / 2], pu = blank(pupilSize, k), pts = st.pupil === 'slit' ? lens(pc, r0 * 0.62, r0 * 1.98) : circle(pc[0], pc[1], r0, 48)
  const pg = pu.g.createRadialGradient(pc[0], pc[1], 0, pc[0], pc[1], Math.max(r0, 6)); pg.addColorStop(0, '#000'); pg.addColorStop(1, 'rgb(14,2,7)')
  pu.g.fillStyle = pg; pu.g.fill(path(pts)); pu.g.lineWidth = 0.8 * sc; pu.g.strokeStyle = 'rgba(8,5,12,.9)'; pu.g.stroke(path(pts))

  // a heavy lid that sinks over the top of the eye and lifts again
  let heavy: HTMLCanvasElement | null = null
  if (st.lid) {
    const H = new Painter(half * 2, k, 55 + spec.seed), yL = I[1] - R + 2 * R * st.lid, arc = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [c[0] - w * 0.6 + w * 1.2 * t, yL + h * 0.1 * Math.sin(Math.PI * t) - h * 0.13 * Math.pow(2 * t - 1, 2)] as Pt })
    H.pane([[c[0] - w, c[1] - h * 2], [c[0] + w, c[1] - h * 2], ...arc.slice().reverse()], GLASS.plum, 0.32, { lead: 0, c: [c[0], yL - h * 0.3], r: w * 0.5, grain: 0.6 })
    H.lead(arc, 3 * sc, 0.32, true)
    heavy = sized(H.finish(I, w * 0.68), k)
  }

  // the rim of the eye, over everything inside it
  const T = new Painter(half * 2, k, 1)
  T.lead(shape.up, 3.2 * sc, 0.72, true); T.lead(shape.low, 2 * sc, 0.34, true)
  if (st.crease) T.lead(shape.up.slice(7, -7).map((q) => [q[0], q[1] - h * 0.075 * Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, (q[0] - c[0] + w / 2) / w))), 0.7)] as Pt), 1.1 * sc, 0.2, true)

  // the closed lid: dark glass cut in a few long panes, shown by the blink
  const L = new Painter(half * 2, k, 909 + spec.seed), rl = seeded(spec.seed + 3)
  L.G.save(); L.G.clip(path(shape.all)); L.L.save(); L.L.clip(path(shape.all))
  for (let i = 0; i < 7; i++) { const x0 = c[0] - w / 2 + w * i / 7, x1 = c[0] - w / 2 + w * (i + 1) / 7, tilt = (i - 3) * w * 0.012; L.pane([[x0 - tilt, c[1] - h], [x1 - tilt, c[1] - h], [x1 + tilt, c[1] + h], [x0 + tilt, c[1] + h]], GLASS.plum, 0.26 + rl() * 0.2, { lead: 0.8 * sc, grain: 0.55, ga: 0.8, c: [(x0 + x1) / 2, c[1] - h * 0.08], r: w * 0.2 }) }
  L.G.restore(); L.L.restore()
  const lid = L.finish(I, w * 0.68)

  // lashes: one for each day of the month, as long as that day's spending
  let lashes: Lash[] | null = null
  if (st.lashes) {
    lashes = spec.days.map((v, i) => {
      const t = (i + 0.5) / spec.days.length, q = shape.up[Math.round(2 + t * (shape.up.length - 5))], dir = Math.atan2(q[1] - (I[1] + h * 0.25), q[0] - I[0]), fut = i >= spec.today, top = !fut && v > 0 ? dayTop(spec.rows, i) : null
      const col = top ? hueOf(top) : GLASS.ash
      return { root: q, dir, len: fut || v <= 0 ? h * 0.06 : h * (0.1 + 0.62 * v / most), base: Math.max(0.6, w * 0.012), fill: css(mix(col[0], col[1], top ? 0.72 : 0.3)), phase: i * 0.55 + rng() * 0.6 }
    })
  }
  const display = document.createElement('canvas'); display.width = display.height = Math.ceil(half * 2 * k); sized(display, k)
  const lashCanvas = lashes ? sized((() => { const q = document.createElement('canvas'); q.width = q.height = Math.ceil(half * 2 * k); return q })(), k) : null
  return { design: spec.design, w, h, half, k, R, r0, irisAt: I, clipPath, sclera, veins, iris, pupil: sized(pu.c, k), heavy, rim: T.L.canvas, lid, top: display, lashCanvas, up: shape.up, low: shape.low, lashes }
}

/** The rim of the eye with the upper lid come down `p` of the way (0 open, 1 closed): its edge moves from the upper curve to the lower. */
export function drawBlink(e: GlassEye, p: number) {
  const g = e.top.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, e.top.width, e.top.height)
  if (p > 0) {
    const edge = e.up.map((q, i) => { const b = e.low[i]; return [q[0] + (b[0] - q[0]) * p, q[1] + (b[1] - q[1]) * p] as Pt })
    const m = new Path2D(); e.up.forEach((q, i) => (i ? m.lineTo(q[0] * e.k, q[1] * e.k) : m.moveTo(q[0] * e.k, q[1] * e.k))); edge.slice().reverse().forEach((q) => m.lineTo(q[0] * e.k, q[1] * e.k)); m.closePath()
    g.save(); g.clip(m); g.drawImage(e.lid, 0, 0); g.restore()
    g.save(); g.scale(e.k, e.k); g.beginPath(); edge.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#08050c'; g.lineWidth = Math.max(1, e.w / 90); g.stroke(); g.restore()
  }
  g.drawImage(e.rim, 0, 0)
}

/** The lashes at time t (seconds): each sways slowly on its own, the tip further than the middle, a wave running along them. */
export function drawLashes(e: GlassEye, t: number) {
  const c = e.lashCanvas; if (!c) return
  const g = c.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, c.width, c.height)
  g.setTransform(e.k, 0, 0, e.k, 0, 0)
  g.strokeStyle = 'rgba(8,5,12,.85)'; g.lineWidth = Math.max(0.35, e.w / 400); g.lineJoin = 'round'
  for (const l of e.lashes ?? []) {
    const sway = 0.11 * Math.sin(t * 0.62 + l.phase) + 0.05 * Math.sin(t * 1.15 + l.phase * 1.7)
    const midA = l.dir + sway * 0.45, tipA = l.dir + sway * 1.3
    const mx = l.root[0] + Math.cos(midA) * l.len * 0.55, my = l.root[1] + Math.sin(midA) * l.len * 0.55
    const tx = mx + Math.cos(tipA) * l.len * 0.45, ty = my + Math.sin(tipA) * l.len * 0.45
    const nx = -Math.sin(l.dir) * l.base, ny = Math.cos(l.dir) * l.base
    g.beginPath(); g.moveTo(l.root[0] - nx, l.root[1] - ny); g.quadraticCurveTo(mx - nx * 0.5, my - ny * 0.5, tx, ty); g.quadraticCurveTo(mx + nx * 0.5, my + ny * 0.5, l.root[0] + nx, l.root[1] + ny); g.closePath()
    g.fillStyle = l.fill; g.fill(); g.stroke()
  }
}
