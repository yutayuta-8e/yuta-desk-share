import { useEffect, useState } from 'react'
import { Glass } from '../Glass'
import { Glow, LightLine } from '../light/Light'
import { useConfig, useFeed } from '../hooks'
import { yd } from '../api'
import type { MediaState } from '@shared/types'

/** A readable name for the app Windows says is playing ("Brave", "Spotify", ...). */
function serviceName(kind: string, app?: string): string {
  if (kind === 'soundcloud') return 'SoundCloud'
  const a = (app ?? '').toLowerCase()
  if (a.includes('brave')) return 'Brave'
  if (a.includes('spotify')) return 'Spotify'
  if (a.includes('msedge') || a.includes('edge')) return 'Edge'
  if (a.includes('chrome')) return 'Chrome'
  if (a.includes('firefox') || a === '308046b0af4a39cb') return 'Firefox'
  if (a.includes('zunemusic') || a.includes('media')) return 'メディア プレーヤー'
  if (a.includes('applemusic') || a.includes('itunes')) return 'Apple Music'
  const base = (app ?? '').split(/[\\/!]/).pop() ?? ''
  return base.replace(/\.exe$/i, '') || 'アプリ'
}

/** The service on the thumbnail's corner: the app's own icon, or a cloud of light for SoundCloud. */
function ServiceIcon({ m }: { m: Extract<MediaState, { kind: 'app' | 'soundcloud' }> }) {
  const name = serviceName(m.kind, m.app)
  if (m.kind === 'soundcloud') {
    return <svg className="service-icon cloud" viewBox="0 0 24 24" role="img" aria-label={name}><title>{name}</title><path d={CLOUD} /></svg>
  }
  if (m.appIcon) return <img className="service-icon" src={m.appIcon} alt={name} title={name} draggable={false} />
  return <span className="service">{name}</span>
}

const get = () => yd.getMedia()
const on = yd.onMedia

/** Ticks every second while something is playing, so the position line moves. */
export function useTicker(on: boolean): number {
  const [now, set] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [on])
  return now
}

export const Icon = ({ d, label, onClick, big = false, disabled = false }: { d: string; label: string; onClick: () => void; big?: boolean; disabled?: boolean }) => (
  <button className={`media-btn ${big ? 'big' : ''}`} onClick={onClick} aria-label={label} title={label} disabled={disabled} data-nodrag>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
  </button>
)
export const PREV = 'M18 6 L10 12 L18 18 Z M6 6 V18'
export const NEXT = 'M6 6 L14 12 L6 18 Z M18 6 V18'
export const PLAY = 'M8 5.5 L19 12 L8 18.5 Z'
export const PAUSE = 'M8.5 5.5 V18.5 M15.5 5.5 V18.5'
/** arrows out to the corners (open full screen) and back in (return to the widgets) */
export const EXPAND = 'M14.5 3.5 H20.5 V9.5 M20.5 3.5 L14.5 9.5 M9.5 20.5 H3.5 V14.5 M3.5 20.5 L9.5 14.5'
export const SHRINK = 'M3.5 9.5 H9.5 V3.5 M3.5 3.5 L9.5 9.5 M20.5 14.5 H14.5 V20.5 M20.5 20.5 L14.5 14.5'
export const SPEAKER = 'M3.5 9.5 H7 L11.5 5.8 V18.2 L7 14.5 H3.5 Z M15 9.2 C16.5 10.7 16.5 13.3 15 14.8 M17.8 6.8 C21 9.8 21 14.2 17.8 17.2'
export const CLOUD ='M7 18 H18 C20.5 18 22 16.4 22 14.4 C22 12.4 20.4 10.9 18.5 10.9 C18 7.9 15.6 6 12.9 6 C10.2 6 8.1 7.8 7.5 10.3 C5.4 10.3 3.5 11.9 3.5 14.2 C3.5 16.3 5.1 18 7 18 Z'

/**
 * Now playing: the thumbnail exactly as the app provides it (no cropping or effects, owner's
 * choice), the title and artist as light, prev / play-pause / next, and a thin line of light for
 * the position. With nothing playing, a SoundCloud entrance that plays the owner's likes, shown only
 * when the owner's config sets them (media.soundcloudUrl).
 */
export function Media() {
  const m = useFeed(get, on)
  const playing = !!m && m.kind !== 'idle' && m.status === 'Playing'
  const now = useTicker(playing)
  const likes = useConfig()?.media?.soundcloudUrl
  if (!m || m.kind === 'idle') {
    if (!likes) return <Glass id="media" className="v2-media idle">{null}</Glass>
    return (
      <Glass id="media" className="v2-media idle">
        <button className="sc-entry" onClick={() => yd.mediaSoundCloud()} data-nodrag title="SoundCloud のいいねを流す">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CLOUD} /><path d="M10.5 10 L15 12.6 L10.5 15.2 Z" /></svg>
          <Glow>SoundCloud のいいねを流す</Glow>
        </button>
      </Glass>
    )
  }
  const pos = Math.min(m.duration || 0, m.position + (playing ? (now - m.updatedAt) / 1000 : 0))
  const frac = m.duration > 0 ? pos / m.duration : undefined
  return (
    <Glass id="media" className="v2-media">
      <div className="row">
        {m.thumbnail
          ? <span className="thumb-wrap"><img className="thumb" src={m.thumbnail} alt="" draggable={false} /><ServiceIcon m={m} /></span>
          : null}
        <div className="info">
          <Glow className="title">{m.title || '（タイトルなし）'}</Glow>
          <span className="artist">{m.artist}{m.thumbnail ? '' : `　${serviceName(m.kind, m.app)}`}</span>
          {frac !== undefined && <LightLine width={190} value={frac} />}
        </div>
        <div className="controls">
          <Icon d={PREV} label="前へ" onClick={() => yd.mediaCommand('prev')} />
          <Icon d={playing ? PAUSE : PLAY} label={playing ? '一時停止' : '再生'} onClick={() => yd.mediaCommand('toggle')} big />
          <Icon d={NEXT} label="次へ" onClick={() => yd.mediaCommand('next')} />
          <Icon d={EXPAND} label="全画面で開く" onClick={() => yd.playerOpen()} />
          {m.kind === 'soundcloud' && <button className="media-close" onClick={() => yd.mediaCommand('close')} aria-label="SoundCloud を止めて閉じる" title="止めて閉じる" data-nodrag>×</button>}
        </div>
      </div>
    </Glass>
  )
}
