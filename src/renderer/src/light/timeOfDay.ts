/**
 * Time of day as light (2026-10-26, 本人「朝っぽい、夜っぽい」; colours stay the wallpaper's own).
 *
 * No colour changes: the halo keeps the wallpaper's colour and white. What changes is how the
 * light behaves: gentle and quiet in the morning, plain at noon, deeper at dusk, and strongest at
 * night, when a few small stars come out around the clock. Values glide between the anchors.
 */
type Anchor = { h: number; k: number; night: number; name: string }

const ANCHORS: Anchor[] = [
  { h: 4.5, k: 1.1, night: 0.6, name: '明け方' },
  { h: 6.5, k: 0.8, night: 0, name: '朝' },
  { h: 9, k: 0.7, night: 0, name: '朝' },
  { h: 12, k: 0.8, night: 0, name: '昼' },
  { h: 16.5, k: 0.88, night: 0, name: '午後' },
  { h: 18, k: 1.0, night: 0.2, name: '夕方' },
  { h: 19.5, k: 1.12, night: 0.65, name: '夜' },
  { h: 22, k: 1.25, night: 1, name: '夜' }
]

export type TimeOfDay = { k: number; night: number; name: string }

/** Debug only: ?hour=7.5 pins the time of day. */
const PINNED = (() => { const v = Number(new URLSearchParams(location.search).get('hour')); return isFinite(v) && v > 0 ? v % 24 : null })()

export function timeOfDay(d = new Date()): TimeOfDay {
  let x = PINNED ?? d.getHours() + d.getMinutes() / 60
  if (x < ANCHORS[0].h) x += 24
  const list = [...ANCHORS, { ...ANCHORS[0], h: ANCHORS[0].h + 24 }]
  let i = 0
  while (i < list.length - 2 && x >= list[i + 1].h) i++
  const a = list[i], b = list[i + 1]
  const t0 = (x - a.h) / (b.h - a.h)
  const t = t0 * t0 * (3 - 2 * t0) // ease between anchors
  return { k: a.k + (b.k - a.k) * t, night: a.night + (b.night - a.night) * t, name: t < 0.5 ? a.name : b.name }
}
