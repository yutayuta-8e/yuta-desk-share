import { useEffect, useState } from 'react'

/**
 * The time every widget agrees on. Debug only: YD_TIME="12:59,13:00" (passed as ?time=) shows
 * those times in turn, 4 s each, in every window, so the hourly chime, the pet's announcements and
 * the clock can be checked without waiting for the real hour.
 */
export const DEBUG_TIMES = new URLSearchParams(location.search).get('time')?.split(',').filter((t) => /^\d\d:\d\d$/.test(t)) ?? []

export function debugTimeNow(): string | null {
  return DEBUG_TIMES.length ? DEBUG_TIMES[Math.floor(Date.now() / 4000) % DEBUG_TIMES.length] : null
}

/** "HH:MM" now (the debug time when one is set). */
export function hmNow(): string {
  const d = debugTimeNow()
  if (d) return d
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

/** Ticks once per minute, on the minute (the clock has no seconds). */
export function useMinute(): Date {
  const [now, set] = useState(() => new Date())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const arm = () => {
      const d = new Date()
      t = setTimeout(() => { set(new Date()); arm() }, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 30)
    }
    arm()
    return () => clearTimeout(t)
  }, [])
  return now
}

/** The debug time, re-checked 4 times a second (null when no debug time is set). */
export function useDebugTime(): string | null {
  const [t, set] = useState(debugTimeNow)
  useEffect(() => {
    if (!DEBUG_TIMES.length) return
    const h = window.setInterval(() => set(debugTimeNow()), 250)
    return () => window.clearInterval(h)
  }, [])
  return t
}
