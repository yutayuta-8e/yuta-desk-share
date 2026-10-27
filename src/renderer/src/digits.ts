/**
 * yuta-desk's own clock digits: a single rounded stroke per glyph on a 100x150 box, drawn with
 * round caps and joins so every shape reads as a thick bead of liquid. Only 0-9 and ':'.
 */
export type Glyph = { d: string; advance: number; fill?: boolean }

export const DIGITS: Record<string, Glyph> = {
  // wide, squat glyphs on a 130x130 box; every segment is a curve
  // a true ellipse (94x98), the same curve as the loops of 6, 8 and 9
  '0': { d: 'M65,16 C91,16 112,37.9 112,65 C112,92.1 91,114 65,114 C39,114 18,92.1 18,65 C18,37.9 39,16 65,16 Z', advance: 130 },
  '1': { d: 'M28,50 C44,44 58,32 66,18 C68,48 68,82 68,114', advance: 92 },
  '2': { d: 'M20,42 C22,10 110,10 110,44 C110,70 46,80 24,104 C18,112 26,114 44,114 C66,114 90,114 112,114', advance: 130 },
  '3': { d: 'M24,30 C40,12 106,8 108,38 C110,58 82,64 66,64 C84,64 114,72 112,96 C110,122 40,124 20,100', advance: 130 },
  '4': { d: 'M88,114 C88,82 88,48 88,18 C66,44 44,66 22,84 C44,90 78,90 112,88', advance: 130 },
  '5': { d: 'M102,18 C78,16 56,16 36,18 C32,34 30,50 28,66 C56,52 112,56 112,86 C112,120 44,124 22,100', advance: 130 },
  '6': { d: 'M94,20 C50,22 18,52 18,80 C18,118 112,122 112,86 C112,56 40,56 24,78', advance: 130 },
  '7': { d: 'M20,22 C50,14 82,14 110,20 C94,52 76,82 62,112', advance: 130 },
  // two true ellipses like the loops of 6 and 9 (top 76x46, bottom 92x52), touching at the waist
  '8': { d: 'M65,62 C44,62 27,51.7 27,39 C27,26.3 44,16 65,16 C86,16 103,26.3 103,39 C103,51.7 86,62 65,62 C39.6,62 19,73.6 19,88 C19,102.4 39.6,114 65,114 C90.4,114 111,102.4 111,88 C111,73.6 90.4,62 65,62', advance: 130 },
  // 5% larger than the others around the box centre, same stroke weight (本人の指示 2026-10-27)
  '9': { d: 'M110.15,51.35 C110.15,11.45 19.85,9.35 19.85,45.05 C19.85,76.55 93.35,78.65 110.15,55.55 C114.35,84.95 95.45,114.35 47.15,116.45', advance: 130 },
  ':': { d: 'M20,46 m-13,0 a13,13 0 1,0 26,0 a13,13 0 1,0 -26,0 M20,92 m-13,0 a13,13 0 1,0 26,0 a13,13 0 1,0 -26,0', advance: 40, fill: true }
}

export const DIGIT_BOX = { w: 130, h: 130, stroke: 46 }

export function measureDigits(text: string, scale: number, gap = 6): number {
  let w = 0
  for (const ch of text) w += (DIGITS[ch]?.advance ?? 60) * scale + gap * scale
  return w
}

/** Draws the glyph silhouette into ctx (white), origin at (x, y) top-left, box height = 150 * scale. */
export function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, extra = 0, gap = 6): void {
  ctx.save()
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.lineWidth = DIGIT_BOX.stroke * scale + extra * 2
  let cx = x
  for (const ch of text) {
    const g = DIGITS[ch]
    if (g) {
      ctx.save(); ctx.translate(cx, y); ctx.scale(scale, scale)
      ctx.lineWidth = DIGIT_BOX.stroke + (extra * 2) / scale
      const p = new Path2D(g.d)
      if (g.fill) { ctx.fill(p); ctx.lineWidth = (extra * 2) / scale; if (extra > 0) ctx.stroke(p) } else ctx.stroke(p)
      ctx.restore()
      cx += g.advance * scale + gap * scale
    } else cx += 60 * scale
  }
  ctx.restore()
}
