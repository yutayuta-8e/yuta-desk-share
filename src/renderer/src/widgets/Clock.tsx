import { useEffect, useRef, useState } from 'react'
import { useDebugTime, useMinute } from '../light/clockTime'
import { Glass } from '../Glass'
import { Glow, StrokeDigits } from '../light/Light'
import { useBounds } from '../hooks'
import { yd } from '../api'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
/** Night stars around the time (percent of the window), placed off the digits. */
const STARS = [
  { x: 4, y: 18, r: 2.5, o: 0.9 }, { x: 13, y: 78, r: 2, o: 0.6 }, { x: 31, y: 8, r: 1.5, o: 0.7 },
  { x: 58, y: 90, r: 2, o: 0.55 }, { x: 74, y: 6, r: 2.5, o: 0.85 }, { x: 90, y: 30, r: 1.5, o: 0.6 }, { x: 96, y: 72, r: 2, o: 0.75 }
]

const NO_KERN = new URLSearchParams(location.search).get('nokern') === '1'

/** The clock: the time is written as one stroke of light, and every changed digit is re-written each minute. */
export function Clock() {
  const now = useMinute()
  const debugTime = useDebugTime()
  const bounds = useBounds()
  const time = debugTime ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const date = `${now.getMonth() + 1}月${now.getDate()}日 ${DOW[now.getDay()]}曜日`
  const preview = new URLSearchParams(location.search).get('digits') === '1'
  // The pet's mischief: it flies over and gives the digits a nudge.
  const [poked, setPoked] = useState(0)
  useEffect(() => yd.onPoke(() => { setPoked(Date.now()); window.setTimeout(() => setPoked(0), 1000) }), [])
  // Hourly chime: when the time turns HH:00, a spark of light runs along every stroke once.
  const [chime, setChime] = useState(0)
  const prevTime = useRef(time)
  useEffect(() => {
    const before = prevTime.current
    prevTime.current = time
    if (before === time || !time.endsWith(':00')) return
    setChime(Date.now())
    const t = window.setTimeout(() => setChime(0), 4200)
    return () => window.clearTimeout(t)
  }, [time])
  const W = (bounds?.width ?? 700) - 40
  // 4 digits + colon is about 4.7 digit boxes wide; keep the time inside the window
  const size = Math.max(60, Math.min(140, W / 4.75))
  return (
    <Glass id="clock" className={`v2-clock ${poked ? 'poked' : ''}`}>
      {preview
        ? <><StrokeDigits text="01234" size={96} /><StrokeDigits text="56789:" size={96} /></>
        : <>
            <span className="stars" aria-hidden="true">
              {STARS.map((s, i) => <i key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, '--o': s.o } as React.CSSProperties} />)}
            </span>
            <StrokeDigits text={time} size={size} stroke={2.4} kern={!NO_KERN} run={chime} />
            <Glow breathe className="date">{date}</Glow>
          </>}
    </Glass>
  )
}
