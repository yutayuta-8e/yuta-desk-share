// Japanese national holidays, computed here so the calendar needs no network or Google for them
// (owner, 2026-10-28). The rules as they stand since 2020; the equinox formula holds for 1980-2099.

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** the n-th Monday of a month (month 1-12) */
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay()
  return 1 + ((8 - first) % 7) + (n - 1) * 7
}

const cache = new Map<number, Map<string, string>>()

/** YYYY-MM-DD -> name, for one year */
export function holidaysOf(y: number): Map<string, string> {
  const hit = cache.get(y)
  if (hit) return hit
  const h = new Map<string, string>()
  const add = (m: number, d: number, name: string) => h.set(ymd(y, m, d), name)
  add(1, 1, '元日')
  add(1, nthMonday(y, 1, 2), '成人の日')
  add(2, 11, '建国記念の日')
  add(2, 23, '天皇誕生日')
  add(3, Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)), '春分の日')
  add(4, 29, '昭和の日')
  add(5, 3, '憲法記念日')
  add(5, 4, 'みどりの日')
  add(5, 5, 'こどもの日')
  add(7, nthMonday(y, 7, 3), '海の日')
  add(8, 11, '山の日')
  add(9, nthMonday(y, 9, 3), '敬老の日')
  add(9, Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)), '秋分の日')
  add(10, nthMonday(y, 10, 2), 'スポーツの日')
  add(11, 3, '文化の日')
  add(11, 23, '勤労感謝の日')
  const named = [...h.keys()]
  const key = (d: Date) => ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())
  // a day between two holidays is a holiday too (国民の休日)
  for (const k of named) {
    const d = new Date(`${k}T00:00:00`)
    const mid = new Date(d); mid.setDate(d.getDate() + 1)
    const after = new Date(d); after.setDate(d.getDate() + 2)
    if (!h.has(key(mid)) && h.has(key(after)) && mid.getDay() !== 0) h.set(key(mid), '国民の休日')
  }
  // a holiday on a Sunday moves to the next day that is not one (振替休日)
  for (const k of named) {
    const d = new Date(`${k}T00:00:00`)
    if (d.getDay() !== 0) continue
    const n = new Date(d)
    do n.setDate(n.getDate() + 1); while (h.has(key(n)))
    h.set(key(n), '振替休日')
  }
  cache.set(y, h)
  return h
}

export function holidayName(day: string): string | undefined {
  return holidaysOf(Number(day.slice(0, 4))).get(day)
}
