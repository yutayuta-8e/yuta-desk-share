// Day arithmetic shared by the calendar and its card.
import type { CalendarEvent, CalendarMark } from '@shared/types'

export const DOW = ['日', '月', '火', '水', '木', '金', '土']
const pad = (v: number) => String(v).padStart(2, '0')

export function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export function parseDay(day: string): Date { return new Date(`${day.slice(0, 10)}T00:00:00`) }
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export function hm(iso: string): string { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
/** "10/30(金)" */
export function md(d: Date): string { return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` }
/** "今日", "明日" or "10/30(金)" */
export function dayLabel(d: Date, today: Date): string {
  const diff = Math.round((parseDay(ymd(d)).getTime() - parseDay(ymd(today)).getTime()) / 86400000)
  return diff === 0 ? '今日' : diff === 1 ? '明日' : md(d)
}

/** The first and last day an event covers (Google's all-day end is the day after the last). */
export function spanOf(e: CalendarEvent): [Date, Date] {
  if (e.allDay) {
    const s = parseDay(e.start)
    const last = e.end && e.end.slice(0, 10) > e.start.slice(0, 10) ? addDays(parseDay(e.end), -1) : s
    return [s, last]
  }
  const s = new Date(e.start)
  const end = new Date(Math.max(new Date(e.end || e.start).getTime() - 1, s.getTime()))
  return [parseDay(ymd(s)), parseDay(ymd(end))]
}
export function isLong(e: CalendarEvent): boolean { const [a, b] = spanOf(e); return b > a }

/** "10/30〜11/1" for an event over several days */
export function rangeLabel(e: CalendarEvent): string {
  const [a, b] = spanOf(e)
  return `${a.getMonth() + 1}/${a.getDate()}〜${b.getMonth() + 1}/${b.getDate()}`
}

/** a renewal / money day on the 31st falls on the month's last day in shorter months */
export function markOn(m: CalendarMark, d: Date): boolean {
  if (m.month !== undefined && m.month !== d.getMonth() + 1) return false
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() === Math.min(m.day, last)
}
