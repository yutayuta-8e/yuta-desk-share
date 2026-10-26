import { Glass } from '../Glass'
import { Stat } from './Battery'
import { useConfig, useFeed } from '../hooks'
import { yd } from '../api'
import type { UsageWindow } from '@shared/types'

const get = () => yd.getUsage()
const on = yd.onUsage

/** "残り 2時間10分" until the window resets. */
function left(w: UsageWindow): string {
  if (!w.resetsAt) return ''
  const diff = new Date(w.resetsAt).getTime() - Date.now()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `残り ${Math.floor(h / 24)}日${h % 24 ? `${h % 24}時間` : ''}`
  return h > 0 ? `残り ${h}時間${m}分` : `残り ${m}分`
}

const NOTE: Record<string, string> = { unauth: 'ログインし直すと表示されます', error: '取得できませんでした' }

export function Usage() {
  const u = useFeed(get, on)
  const hidden = useConfig()?.usage.hidden ?? []
  return (
    <Glass id="usage" className="v2-stats">
      {u?.services.map((s) => {
        if (s.status === 'unsupported' || hidden.includes(s.name)) return null
        if (s.status !== 'ok') return <div key={s.name} className="v2-note">{s.name}: {s.message ?? NOTE[s.status] ?? s.status}</div>
        return [s.fiveHour, s.sevenDay].filter((w): w is UsageWindow => !!w).map((w) => (
          <Stat key={`${s.name}-${w.label}`} value={w.percent} label={`${s.name} ${w.label.replace(/\s/g, '')}`} sub={left(w)} line hot={w.percent >= 70} />
        ))
      })}
    </Glass>
  )
}
