/**
 * Line-art marks for launcher icons (ids in shared/glyphs.ts). Each is drawn as strokes in a
 * 48x48 box, in the same light as everything else (no fills).
 */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`
const pt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)]
}

function flower(): string {
  let d = circle(24, 24, 4.2)
  for (let i = 0; i < 5; i++) {
    const a = -90 + i * 72
    const [x0, y0] = pt(24, 24, 5.2, a - 30), [x1, y1] = pt(24, 24, 5.2, a + 30)
    const [c0x, c0y] = pt(24, 24, 16, a - 26), [c1x, c1y] = pt(24, 24, 16, a + 26)
    d += ` M${x0} ${y0} C${c0x} ${c0y} ${c1x} ${c1y} ${x1} ${y1}`
  }
  return d
}

function star(): string {
  const p: string[] = []
  for (let i = 0; i < 10; i++) {
    const [x, y] = pt(24, 25, i % 2 ? 6.6 : 15, -90 + i * 36)
    p.push(`${i ? 'L' : 'M'}${x} ${y}`)
  }
  return p.join(' ') + ' Z'
}

function sun(): string {
  let d = circle(24, 24, 6.5)
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = pt(24, 24, 10.5, i * 45), [x1, y1] = pt(24, 24, 14.5, i * 45)
    d += ` M${x0} ${y0} L${x1} ${y1}`
  }
  return d
}

export const GLYPH_PATHS: Record<string, string> = {
  apple: 'M24 16 C19 12 10 13 10 23 C10 33 17 41 21.5 40 C23 39.6 25 39.6 26.5 40 C31 41 38 33 38 23 C38 13 29 12 24 16 Z M24 16 C24 12 25 9 27.5 7 M26 12.5 C28 8.5 32.5 8 35 9.5 C33 13 29 13.5 26 12.5',
  flower: flower(),
  star: star(),
  heart: 'M24 38 C14 31 8 25 8 18 C8 12 13 9 17 9 C20 9 22.5 11 24 13.5 C25.5 11 28 9 31 9 C35 9 40 12 40 18 C40 25 34 31 24 38 Z',
  moon: 'M30.57 11.64 A14 14 0 1 0 36.36 30.57 A11 11 0 0 1 30.57 11.64 Z',
  sun: sun(),
  note: `${circle(17.5, 34, 3.5)} ${circle(31, 31, 3.5)} M21 34 V13 L34.5 10 V31 M21 17 L34.5 14`,
  film: 'M12 12 H36 C37.5 12 38.5 13 38.5 14.5 V33.5 C38.5 35 37.5 36 36 36 H12 C10.5 36 9.5 35 9.5 33.5 V14.5 C9.5 13 10.5 12 12 12 Z M9.5 18 H38.5 M9.5 30 H38.5 M15 12 V18 M21 12 V18 M27 12 V18 M33 12 V18 M15 30 V36 M21 30 V36 M27 30 V36 M33 30 V36',
  camera: `M11 17 H17 L19.5 13 H28.5 L31 17 H37 C38.2 17 39 17.8 39 19 V35 C39 36.2 38.2 37 37 37 H11 C9.8 37 9 36.2 9 35 V19 C9 17.8 9.8 17 11 17 Z ${circle(24, 26.5, 6.2)}`,
  mail: 'M11.5 14 H36.5 C38 14 39 15 39 16.5 V31.5 C39 33 38 34 36.5 34 H11.5 C10 34 9 33 9 31.5 V16.5 C9 15 10 14 11.5 14 Z M9.5 15.5 L24 26 L38.5 15.5',
  chat: 'M12 12.5 H36 C37.7 12.5 39 13.8 39 15.5 V28.5 C39 30.2 37.7 31.5 36 31.5 H22 L15 37.5 V31.5 H12 C10.3 31.5 9 30.2 9 28.5 V15.5 C9 13.8 10.3 12.5 12 12.5 Z M17 22 h0.01 M24 22 h0.01 M31 22 h0.01',
  book: 'M24 14 C20 11 14 11 9 12.5 V35 C14 33.5 20 33.5 24 36.5 C28 33.5 34 33.5 39 35 V12.5 C34 11 28 11 24 14 Z M24 14 V36.5',
  leaf: 'M11 37 C11 21 21 11 37 11 C37 27 27 37 11 37 Z M11 37 L28 20',
  drop: 'M24 9 C24 9 13 22 13 29 C13 35 18 39 24 39 C30 39 35 35 35 29 C35 22 24 9 24 9 Z',
  cat: 'M12 18 L13 8 L20 14 C22.5 13.3 25.5 13.3 28 14 L35 8 L36 18 C38 21 38.5 25 37.5 28.5 C35.5 35 30 38 24 38 C18 38 12.5 35 10.5 28.5 C9.5 25 10 21 12 18 Z M19 24.5 V27 M29 24.5 V27 M22.5 30.5 L24 31.8 L25.5 30.5',
  house: 'M9.5 23 L24 11 L38.5 23 M14 20 V37 H34 V20 M21 37 V28.5 H27 V37',
  folder: 'M9 15 C9 13.5 10 12.5 11.5 12.5 H19 L22.5 16 H36.5 C38 16 39 17 39 18.5 V34 C39 35.5 38 36.5 36.5 36.5 H11.5 C10 36.5 9 35.5 9 34 Z M9 20.5 H39',
  code: 'M17 15 L9 24 L17 33 M31 15 L39 24 L31 33 M27 12 L21 36'
}
