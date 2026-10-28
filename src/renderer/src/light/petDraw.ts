/**
 * The pet's look, drawn as one line of light (no fill, no shadow). Six looks share one face and
 * one set of expressions, so every behaviour in Pet.tsx works with any of them (2026-10-26: the
 * owner likes the ghost and asked for five variations in the same mood).
 */
export const PET_VARIANTS: { id: string; label: string; note: string }[] = [
  { id: 'classic', label: 'いまの子', note: 'まるい頭とまっすぐなすそ。飛ぶとすそが波打つ' },
  { id: 'drop', label: 'しずく', note: '頭のてっぺんがくるんと巻いたしずく形。向いている方へ先が傾く' },
  { id: 'ears', label: 'ねこみみ', note: '小さな耳がふたつ。いたずらの時はぴんと立つ' },
  { id: 'wisp', label: 'ひとだま', note: '下がしっぽになって流れる。歩かずにいつも少し浮いている' },
  { id: 'sheet', label: 'シーツ', note: 'すそが4つの波、ほっぺは大きな丸で輪郭がゆらゆら波打つ、ちょこんとした棒の足が2本。足はゆらゆら、歩くと交互に上がる' },
  { id: 'lantern', label: 'ちょうちん', note: '小さな光の玉を連れている。寝ると玉も足もとで休む' }
]

export type PetPose = {
  state: string
  t: number
  dir: 1 | -1
  eyeX: number
  eyeY: number
  blink: number
  jumpY: number
  flee: boolean
  /** which pair of eyes and mouth (PET_FACES); the other expressions are shared */
  faceStyle?: number
}

/** Eye-and-mouth pairs for the usual, open-eyed look (2026-10-27: the owner asked for five cuter ones). */
export const PET_FACES: { id: string; label: string }[] = [
  { id: 'line', label: 'いまの顔（たて線の目）' },
  { id: 'round', label: 'まんまる目＋ちいさな口' },
  { id: 'happy', label: 'にこにこ目＋あいた口' },
  { id: 'omega', label: 'てん目＋ω口' },
  { id: 'sparkle', label: 'きらきら目＋おちょぼ口' },
  { id: 'droopy', label: 'たれ目＋にょろ口' }
]
export type PetInk = { core: string; halo: string }

const BODY = 64

type Geo = { cx: number; bottom: number; bw: number; bh: number; top: number; ey: number; air: boolean; cheeky: boolean; closed: boolean }

function geometry(size: number, p: PetPose, variant: string): Geo {
  const st = p.state
  let squash = 1 + Math.sin(p.t * 3) * 0.02
  if (st === 'walk') squash = 1 + Math.sin(p.t * 12) * 0.05
  if (st === 'sleep') squash = 0.9 + Math.sin(p.t * 2) * 0.02
  if (st === 'perch') squash = 0.94 + Math.sin(p.t * 2.5) * 0.015
  if (st === 'stretch') { const k = Math.sin(Math.min(1, (p.t % 1.8) / 1.8) * Math.PI); squash = 1 + 0.28 * k }
  const air = st === 'fly' || st === 'hover'
  if (air) squash = 1.06 + Math.sin(p.t * 5) * 0.03
  const scale = variant === 'lantern' ? 0.88 : variant === 'wisp' ? 0.92 : 1
  const bw = BODY * scale * (2 - squash), bh = BODY * scale * squash
  // the wisp never quite touches the ground
  const float = variant === 'wisp' && !air && st !== 'sleep' ? 8 + Math.sin(p.t * 2.2) * 2 : 0
  const bob = air ? Math.sin(p.t * 4) * 4 : 0
  // the wisp floats higher; the sheet stands on its short legs
  const bottom = size - 8 + p.jumpY + bob - float - (variant === 'wisp' ? 14 : variant === 'sheet' ? 8 : 0)
  return {
    cx: size / 2, bottom, bw, bh, top: bottom - bh * 0.85, ey: bottom - bh * 0.55 + p.eyeY, air,
    cheeky: st === 'tease' || p.flee,
    closed: st === 'sleep' || st === 'stretch' || st === 'yawn' || p.blink > 0
  }
}

/** A row of soft waves from (x0, y) leftwards to (x1, y). */
function hem(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, n: number, amp: number, t: number, moving: boolean) {
  const w = (x0 - x1) / n
  for (let i = 0; i < n; i++) {
    const a = x0 - i * w
    const wob = moving ? Math.sin(t * 8 + i) * 2 : 0
    ctx.quadraticCurveTo(a - w / 2, y + amp + wob, a - w, y)
  }
}

function dome(ctx: CanvasRenderingContext2D, g: Geo, lift = 1.1) {
  ctx.moveTo(g.cx - g.bw / 2, g.bottom)
  ctx.bezierCurveTo(g.cx - g.bw / 2, g.bottom - g.bh * lift, g.cx + g.bw / 2, g.bottom - g.bh * lift, g.cx + g.bw / 2, g.bottom)
}

function body(ctx: CanvasRenderingContext2D, variant: string, g: Geo, p: PetPose) {
  const { cx, bottom, bw, bh, top, air, cheeky } = g
  ctx.beginPath()
  switch (variant) {
    case 'drop': {
      const tipX = cx + p.dir * 6, tipY = bottom - bh * 1.22
      ctx.moveTo(cx - bw / 2, bottom)
      ctx.bezierCurveTo(cx - bw / 2, bottom - bh * 0.72, cx - bw * 0.16, bottom - bh * 1.02, tipX, tipY)
      ctx.bezierCurveTo(cx + bw * 0.16, bottom - bh * 1.02, cx + bw / 2, bottom - bh * 0.72, cx + bw / 2, bottom)
      hem(ctx, cx + bw / 2, cx - bw / 2, bottom, air ? 3 : 2, air ? 5 : 3, p.t, air)
      ctx.stroke()
      // the curl at the tip, swinging a little
      const sw = Math.sin(p.t * 3) * 2
      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.quadraticCurveTo(tipX + p.dir * (9 + sw), tipY - 7, tipX + p.dir * (13 + sw), tipY + 1)
      ctx.stroke()
      return
    }
    case 'ears': {
      const perk = cheeky ? -4 : Math.sin(p.t * 1.7) > 0.96 ? -2 : 0
      ctx.moveTo(cx - bw / 2, bottom)
      ctx.bezierCurveTo(cx - bw / 2, bottom - bh * 0.55, cx - bw * 0.46, top + 7, cx - bw * 0.31, top + 3)
      ctx.quadraticCurveTo(cx - bw * 0.34, top - 6, cx - bw * 0.29, top - 12 + perk)
      ctx.quadraticCurveTo(cx - bw * 0.21, top - 6, cx - bw * 0.13, top + 0.5)
      ctx.quadraticCurveTo(cx, top - 2, cx + bw * 0.13, top + 0.5)
      ctx.quadraticCurveTo(cx + bw * 0.21, top - 6, cx + bw * 0.29, top - 12 + perk)
      ctx.quadraticCurveTo(cx + bw * 0.34, top - 6, cx + bw * 0.31, top + 3)
      ctx.bezierCurveTo(cx + bw * 0.46, top + 7, cx + bw / 2, bottom - bh * 0.55, cx + bw / 2, bottom)
      if (air) hem(ctx, cx + bw / 2, cx - bw / 2, bottom, 3, 5, p.t, true)
      else ctx.quadraticCurveTo(cx, bottom + 3, cx - bw / 2, bottom)
      ctx.stroke()
      return
    }
    case 'wisp': {
      // a round head whose lower edge flows into one tail behind it
      // drawn for a tail trailing to the left, mirrored when the pet faces left
      const sway = Math.sin(p.t * 3.2) * 4
      const m = (x: number) => cx + (x - cx) * p.dir // mirror around the centre when facing left
      const tx = cx - bw * 0.62 + sway * 0.4, ty = bottom + 18 + sway * 0.5
      ctx.moveTo(m(cx - bw / 2), bottom)
      ctx.bezierCurveTo(m(cx - bw / 2), bottom - bh * 1.1, m(cx + bw / 2), bottom - bh * 1.1, m(cx + bw / 2), bottom)
      // the lower edge sweeps back into a long tail with a small upward flick at the tip
      ctx.bezierCurveTo(m(cx + bw / 2), bottom + 16, m(cx - bw * 0.1), bottom + 20, m(tx), ty)
      ctx.quadraticCurveTo(m(tx - 9), ty + 1, m(tx - 12), ty - 6)
      ctx.quadraticCurveTo(m(tx - 4), ty - 4, m(cx - bw * 0.35), bottom + 4)
      ctx.quadraticCurveTo(m(cx - bw * 0.48), bottom + 2, m(cx - bw / 2), bottom)
      ctx.stroke()
      return
    }
    case 'sheet': {
      dome(ctx, g, 1.14)
      hem(ctx, cx + bw / 2, cx - bw / 2, bottom, 4, air ? 5 : 3.5, p.t, air)
      ctx.stroke()
      // two short stick legs under the hem (2026-10-28: the owner chose them over the L shape): they
      // sway gently, step in turn when walking, dangle in the air
      const walk = p.state === 'walk'
      const asleep = p.state === 'sleep'
      const speed = walk ? 12 : air ? 4.5 : 2.2
      const amp = asleep ? 0 : walk ? 2.6 : air ? 3.2 : 1.3
      for (const [i, side] of [[0, -1], [1, 1]] as const) {
        const phase = i ? Math.PI : 0
        const swing = Math.sin(p.t * speed + phase) * amp
        const lift = walk ? Math.max(0, Math.sin(p.t * speed + phase)) * 3 : 0
        const x0 = cx + side * 10, y0 = bottom + 2
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + swing * 0.5, bottom + 8 - lift)
        ctx.stroke()
      }
      return
    }
    case 'lantern':
    case 'classic':
    default: {
      dome(ctx, g)
      if (air) hem(ctx, cx + bw / 2, cx - bw / 2, bottom, 3, 5, p.t, true)
      else ctx.quadraticCurveTo(cx, bottom + 3, cx - bw / 2, bottom)
      ctx.stroke()
    }
  }
}

/**
 * Blush: a big round cheek on each side (2026-10-28: the owner chose round cheeks, much larger),
 * its outline gently rippling, as if the light were wavering. The ripple drifts slowly round.
 */
function cheeks(ctx: CanvasRenderingContext2D, g: Geo, p: PetPose) {
  const float = Math.sin(p.t * 2.4) * 0.8
  const y = g.ey + 7.5 + float
  // three slow bumps: at this size more of them read as corners (a heptagon), not as a wave
  const rx = 7, ry = 4.4, bumps = 3, depth = 0.07, steps = 72
  for (const side of [-1, 1]) {
    const c = g.cx + side * (g.bw / 2 - 12) + p.dir * 1
    const drift = p.t * 1.3 + (side > 0 ? 1.7 : 0)
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const k = 1 + depth * Math.sin(a * bumps + drift)
      const x = c + Math.cos(a) * rx * k, yy = y + Math.sin(a) * ry * k
      if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy)
    }
    ctx.closePath()
    ctx.stroke()
  }
}

function face(ctx: CanvasRenderingContext2D, g: Geo, p: PetPose) {
  const { cx, ey, closed, cheeky } = g
  const ex = cx + p.eyeX + p.dir * 4
  const st = p.state
  for (const off of [-11, 11]) {
    ctx.beginPath()
    if (cheeky) { const d = off < 0 ? 1 : -1; ctx.moveTo(ex + off - 4 * d, ey - 4); ctx.lineTo(ex + off + 3 * d, ey); ctx.lineTo(ex + off - 4 * d, ey + 4) }
    else if (closed) { ctx.moveTo(ex + off - 5, ey); ctx.quadraticCurveTo(ex + off, st === 'stretch' ? ey - 4 : ey + 4, ex + off + 5, ey) }
    else eye(ctx, PET_FACES[p.faceStyle ?? 0]?.id ?? 'line', ex + off, ey, off)
    ctx.stroke()
  }
  ctx.beginPath()
  const mx = cx + p.dir * 4
  if (st === 'sleep') ctx.arc(mx, ey + 14, 2.5, 0, Math.PI * 2)
  else if (st === 'yawn') { const o = 3 + 5 * Math.sin(Math.min(1, (p.t % 1.6) / 1.6) * Math.PI); ctx.ellipse(mx, ey + 15, 4, o, 0, 0, Math.PI * 2) }
  else if (cheeky) { ctx.moveTo(mx - 7, ey + 11); ctx.quadraticCurveTo(mx, ey + 19, mx + 7, ey + 11) }
  else mouth(ctx, PET_FACES[p.faceStyle ?? 0]?.id ?? 'line', mx, ey)
  ctx.stroke()
}

/** One open eye in the given style, centred at (x, y); `off` < 0 for the left eye. Adds to the current path. */
function eye(ctx: CanvasRenderingContext2D, style: string, x: number, y: number, off: number) {
  switch (style) {
    case 'round': // a solid round eye
      ctx.stroke(); ctx.beginPath(); ctx.fillStyle = ctx.strokeStyle
      ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath()
      return
    case 'happy': // ∩ smiling eyes
      ctx.moveTo(x - 5, y + 2); ctx.quadraticCurveTo(x, y - 6, x + 5, y + 2)
      return
    case 'omega': // small dots
      ctx.stroke(); ctx.beginPath(); ctx.fillStyle = ctx.strokeStyle
      ctx.arc(x, y + 1, 2.1, 0, Math.PI * 2); ctx.fill(); ctx.beginPath()
      return
    case 'sparkle': { // a ring with a tiny light inside, up and to the outside
      ctx.moveTo(x + 4, y); ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.stroke(); ctx.beginPath(); ctx.fillStyle = ctx.strokeStyle
      ctx.arc(x + (off < 0 ? -1.3 : 1.3), y - 1.4, 1.3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath()
      return
    }
    case 'droopy': { // gentle eyes sloping down to the outside
      const s = off < 0 ? -1 : 1
      ctx.moveTo(x - s * 4, y - 1.5); ctx.quadraticCurveTo(x, y - 2.5, x + s * 4.5, y + 2)
      return
    }
    default: // 'line': the original upright strokes
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4)
  }
}

/** The usual mouth for each face style. Adds to the current path. */
function mouth(ctx: CanvasRenderingContext2D, style: string, x: number, ey: number) {
  switch (style) {
    case 'round': // a small u
      ctx.moveTo(x - 3.5, ey + 11); ctx.quadraticCurveTo(x, ey + 14.5, x + 3.5, ey + 11)
      return
    case 'happy': // an open, laughing mouth
      ctx.moveTo(x - 5, ey + 10); ctx.lineTo(x + 5, ey + 10); ctx.quadraticCurveTo(x + 4.5, ey + 17, x, ey + 17); ctx.quadraticCurveTo(x - 4.5, ey + 17, x - 5, ey + 10)
      return
    case 'omega': // ω
      ctx.moveTo(x - 6, ey + 10); ctx.quadraticCurveTo(x - 5.5, ey + 15, x - 3, ey + 14.5); ctx.quadraticCurveTo(x, ey + 14, x, ey + 11)
      ctx.quadraticCurveTo(x, ey + 14, x + 3, ey + 14.5); ctx.quadraticCurveTo(x + 5.5, ey + 15, x + 6, ey + 10)
      return
    case 'sparkle': // a tiny o
      ctx.moveTo(x + 2, ey + 13); ctx.arc(x, ey + 13, 2, 0, Math.PI * 2)
      return
    case 'droopy': // a soft wavy line
      ctx.moveTo(x - 6, ey + 12); ctx.quadraticCurveTo(x - 3, ey + 9.5, x, ey + 12); ctx.quadraticCurveTo(x + 3, ey + 14.5, x + 6, ey + 12)
      return
    default:
      ctx.moveTo(x - 5, ey + 12); ctx.quadraticCurveTo(x, ey + 16, x + 5, ey + 12)
  }
}

/** The lantern's little light: floats beside the pet on the side it faces; rests at its feet when asleep. */
function lanternOrb(g: Geo, p: PetPose): { x: number; y: number } {
  if (p.state === 'sleep') return { x: g.cx + p.dir * (g.bw / 2 + 8), y: g.bottom - 3 }
  return { x: g.cx + p.dir * (g.bw / 2 + 14) + Math.sin(p.t * 1.3) * 3, y: g.bottom - g.bh * 0.7 + Math.sin(p.t * 2.1) * 5 }
}

/** Draws the pet at the centre bottom of a size x size canvas (already cleared and scaled). */
export function drawPet(ctx: CanvasRenderingContext2D, size: number, variant: string, p: PetPose, ink: PetInk, breath: number, k: number): void {
  const g = geometry(size, p, variant)
  const lines = () => { body(ctx, variant, g, p); face(ctx, g, p); if (variant === 'sheet') cheeks(ctx, g, p) }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // halo (breathes with every other widget), then the thin core line
  ctx.globalAlpha = breath
  ctx.strokeStyle = ink.halo; ctx.lineWidth = 3; ctx.shadowColor = ink.halo; ctx.shadowBlur = 14 * Math.min(1.2, k)
  lines()
  ctx.globalAlpha = 1; ctx.shadowBlur = 0
  ctx.strokeStyle = ink.core; ctx.lineWidth = 1.8
  lines()
  if (variant === 'lantern') {
    const o = lanternOrb(g, p)
    const dim = p.state === 'sleep' ? 0.45 : 1
    ctx.fillStyle = ink.core; ctx.shadowColor = ink.halo
    ctx.globalAlpha = dim * (0.6 + 0.4 * breath); ctx.shadowBlur = 18
    ctx.beginPath(); ctx.arc(o.x, o.y, 4.2, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = dim; ctx.shadowBlur = 6
    ctx.beginPath(); ctx.arc(o.x, o.y, 2.4, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
  }
  if (p.state === 'sleep') {
    ctx.fillStyle = ink.core; ctx.font = '400 15px "YD Latin", "Zen Kurenaido", sans-serif'
    ctx.shadowColor = ink.halo; ctx.shadowBlur = 8
    const z = (p.t % 2) / 2
    ctx.globalAlpha = 1 - z; ctx.fillText('z', g.cx + 26, g.top - 6 - z * 18); ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }
}

/** The top of the pet's head in its box (y), so the speech bubble can follow it. */
export function headTop(size: number, p: PetPose, variant: string): number {
  const g = geometry(size, p, variant)
  return g.top - (variant === 'ears' ? 10 : variant === 'drop' ? 12 : 0)
}

/** Where the trail of light starts (under the body), for the flying trail in Pet.tsx. */
export function trailOrigin(size: number, p: PetPose, variant: string): { x: number; y: number } {
  const g = geometry(size, p, variant)
  return { x: g.cx, y: g.bottom - 6 }
}
