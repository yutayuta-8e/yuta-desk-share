import type { ReactNode } from 'react'
import { Glass } from '../Glass'
import { Glow, LightLine, StrokeDigits, strokeDigitsWidth } from '../light/Light'
import { useFeed } from '../hooks'
import { yd } from '../api'

const get = () => yd.getBattery()
const on = yd.onBattery
export const STAT_NUM = 46

/** One stat: the number written in light, a small %, a name and an optional note, and a line of light. */
export function Stat({ value, label, sub, line, hot }: { value: number; label: ReactNode; sub?: ReactNode; line?: boolean; hot?: boolean }) {
  // kerned digits, right-aligned in a column as wide as "100", so every %, name and line starts at the same x
  const col = strokeDigitsWidth('100', STAT_NUM, 2)
  return (
    <div className="v2-stat">
      <span className="num">
        <span className="digits" style={{ width: col }}>
          <StrokeDigits text={String(Math.round(value))} size={STAT_NUM} stroke={2} breathe={false} write={false} kern />
        </span>
        <Glow className="pct">%</Glow>
      </span>
      <span className="lbl">
        <Glow>{label}</Glow>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {line && <LightLine width={200} value={value / 100} hot={hot} />}
    </div>
  )
}

export function Battery() {
  const b = useFeed(get, on)
  return (
    <Glass id="battery" className="v2-stats">
      {b?.pc && <Stat value={b.pc.percent} label="PC" sub={b.pc.charging ? '充電中' : undefined} line={b.pc.percent <= 30} hot />}
      {b?.devices.map((d) => (
        <Stat key={d.name} value={d.percent} label={d.name.replace(/^myAir\.0\s*/, '')} line={d.percent <= 30} hot />
      ))}
    </Glass>
  )
}
