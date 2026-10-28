import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { yd } from '../api'
import { useConfig, useFeed, useWallpaper } from '../hooks'
import { Glow, StrokeDigits } from '../light/Light'
import { useMinute } from '../light/clockTime'
import { DIGIT_BOX } from '../digits'
import { Icon, PREV, NEXT, PLAY, PAUSE, SHRINK, SPEAKER, CLOUD, useTicker } from './Media'

// Design 10 of 2026-10-27 (the owner's choice): the wallpaper untouched, everything along the bottom
// edge. One line of light runs across the bottom; the artwork (left), the title (centre) and the clock
// (right) stand on the title's baseline; the clock and its date end exactly where the line ends.
// Sizes are CSS px (the owner's screen is 1536 x 960 at 125%).
const M = 48 // side margin: the seek line runs from M to the right edge minus M
const ART = 200 // artwork height; its width follows the picture (never cropped)
const CLOCK = 114 // clock size (digit box height)
const STROKE = 2.4 // clock stroke, as the clock widget
const DATE_GAP = 22 // date above the digits (owner: "a little higher", 2026-10-27)
const DOW = ['日', '月', '火', '水', '木', '金', '土']

const pad2 = (n: number) => String(n).padStart(2, '0')
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** 1:38, or 1:02:05 past an hour */
function clockText(sec: number): string {
  const t = Math.max(0, Math.floor(sec)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

/** The baseline of the first line of `el`, in viewport px (a zero-size marker sitting on it). */
function baselineOf(el: HTMLElement): number {
  const m = document.createElement('span')
  m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
  el.appendChild(m)
  const y = m.getBoundingClientRect().top
  m.remove()
  return y
}

/** The empty space a font leaves right of the last character, so right-aligned text ends in ink. */
function rightBearing(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  const c = document.createElement('canvas').getContext('2d')
  const last = (el.textContent ?? '').slice(-1)
  if (!c || !last) return 0
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const m = c.measureText(last)
  return Math.max(0, m.width - m.actualBoundingBoxRight)
}

/**
 * The full-screen player, opened from the media widget: artwork, title, a seek line across the whole
 * bottom with play controls under it, volume, and the clock with the date. The times show only while
 * the pointer is on the seek line. Esc or the arrows (bottom right) go back to the widgets.
 */
export function Player() {
  const m = useFeed(yd.getMedia, yd.onMedia)
  const wp = useWallpaper()
  const likes = useConfig()?.media?.soundcloudUrl
  const now = useMinute()
  const active = m && m.kind !== 'idle' ? m : null
  const playing = active?.status === 'Playing'
  const tick = useTicker(playing)
  const title = active ? active.title || '（タイトルなし）' : ''

  // Esc goes back to the widgets; Space plays / pauses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') yd.playerClose()
      else if (e.key === ' ' && active) { e.preventDefault(); yd.mediaCommand('toggle') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!!active])

  // the shelf (the title's baseline) and the date's right bearing depend on the loaded font
  const titleRef = useRef<HTMLHeadingElement>(null)
  const dateRef = useRef<HTMLDivElement>(null)
  const [shelf, setShelf] = useState<number | null>(null)
  const [bearing, setBearing] = useState(0)
  useLayoutEffect(() => {
    const measure = () => {
      if (titleRef.current) setShelf(baselineOf(titleRef.current))
      if (dateRef.current) setBearing(rightBearing(dateRef.current))
    }
    measure()
    void document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [title, now.getDate()])
  const shelfY = shelf ?? window.innerHeight - 165

  // position: extrapolated while playing; right after a seek, where it was sent until the source says
  const [drag, setDrag] = useState<number | null>(null)
  const [sent, setSent] = useState<{ sec: number; at: number } | null>(null)
  const dur = active?.duration ?? 0
  let pos = active ? Math.min(dur, active.position + (playing ? (tick - active.updatedAt) / 1000 : 0)) : 0
  if (sent && active && active.updatedAt < sent.at && Date.now() - sent.at < 4000) pos = sent.sec + (playing ? Math.max(0, tick - sent.at) / 1000 : 0)
  const frac = dur > 0 ? clamp01(drag ?? pos / dur) : 0

  const seekRef = useRef<HTMLDivElement>(null)
  const seekAt = (x: number) => { const r = seekRef.current!.getBoundingClientRect(); return clamp01((x - r.left) / r.width) }
  const onSeekDown = (e: PointerEvent) => { if (!dur) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(seekAt(e.clientX)) }
  const onSeekMove = (e: PointerEvent) => { if (drag !== null) setDrag(seekAt(e.clientX)) }
  const onSeekUp = (e: PointerEvent) => {
    if (drag === null) return
    const sec = seekAt(e.clientX) * dur
    setDrag(null)
    setSent({ sec, at: Date.now() })
    yd.mediaSeek(sec)
  }

  // volume of what is playing (our player's own, or that app's mixer slider); null = cannot be changed
  const [vol, setVol] = useState<number | null>(null)
  const [volHeld, setVolHeld] = useState(false)
  const source = active ? `${active.kind}|${active.app ?? ''}` : ''
  useEffect(() => {
    if (!source) { setVol(null); return }
    let alive = true
    void yd.getMediaVolume().then((v) => { if (alive) setVol(v) })
    return () => { alive = false }
  }, [source])
  const volRef = useRef<HTMLSpanElement>(null)
  const lastSent = useRef(0)
  const volAt = (x: number) => { const r = volRef.current!.getBoundingClientRect(); return clamp01((x - r.left) / r.width) }
  const sendVol = (v: number, now = false) => {
    setVol(v)
    if (now || Date.now() - lastSent.current > 80) { lastSent.current = Date.now(); yd.mediaVolume(v) }
  }
  const onVolDown = (e: PointerEvent) => { if (vol === null) return; e.currentTarget.setPointerCapture(e.pointerId); setVolHeld(true); sendVol(volAt(e.clientX)) }
  const onVolMove = (e: PointerEvent) => { if (volHeld) sendVol(volAt(e.clientX)) }
  const onVolUp = (e: PointerEvent) => { if (!volHeld) return; setVolHeld(false); sendVol(volAt(e.clientX), true) }

  // the clock: flat digit bottoms (glyph y 114) stand on the shelf; the date sits DATE_GAP above the
  // digits' top ink (y 16). Its ink is 3 strokes in from the box (StrokeDigits kern), so the box's
  // right edge goes 3 strokes past the line's end.
  const s = CLOCK / DIGIT_BOX.h, sw = STROKE / s
  const clockTop = shelfY - (108 + sw / 2) * s
  const capY = clockTop + (10 - sw / 2) * s
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const date = `${now.getMonth() + 1}月${now.getDate()}日 ${DOW[now.getDay()]}曜日`

  return (
    <div className="player">
      {wp && <img className="pl-bg" src={wp.url} alt="" draggable={false} />}
      {active?.thumbnail && <img className="pl-art" src={active.thumbnail} alt="" draggable={false} style={{ top: shelfY - ART }} />}

      {active ? (
        <div className="pl-text">
          <h1 className="pl-title" ref={titleRef} title={title}>{title}</h1>
          {active.artist && <div className="pl-artist">{active.artist}</div>}
        </div>
      ) : likes ? (
        <button className="pl-sc sc-entry" onClick={() => yd.mediaSoundCloud()} title="SoundCloud のいいねを流す">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CLOUD} /><path d="M10.5 10 L15 12.6 L10.5 15.2 Z" /></svg>
          <Glow>SoundCloud のいいねを流す</Glow>
        </button>
      ) : null}

      <div className="pl-date" ref={dateRef} style={{ top: capY - DATE_GAP, right: M - bearing }}>{date}</div>
      <div className="pl-clock" style={{ top: clockTop, right: M - 3 * STROKE }}>
        <StrokeDigits text={time} size={CLOCK} stroke={STROKE} kern pin={false} />
      </div>

      {active && (
        <div ref={seekRef} className={`pl-seek ${drag !== null ? 'dragging' : ''} ${dur ? '' : 'off'}`}
          onPointerDown={onSeekDown} onPointerMove={onSeekMove} onPointerUp={onSeekUp} onPointerCancel={() => setDrag(null)}>
          <span className="lt-line"><i style={{ width: `${frac * 100}%` }} /></span>
          {dur > 0 && <span className="pl-dot" style={{ left: `${frac * 100}%` }} />}
          {dur > 0 && (
            <span className="pl-times" aria-hidden="true">
              {/* set in the text font (Handlee), not the drawn digits (owner, 2026-10-28) */}
              <span className="pl-elapsed" style={{ left: `${frac * 100}%` }}>{clockText(frac * dur)}</span>
              <span className="pl-total">{clockText(dur)}</span>
            </span>
          )}
        </div>
      )}

      {active && (
        <div className="pl-controls">
          <Icon d={PREV} label="前へ" onClick={() => yd.mediaCommand('prev')} disabled={!active.canPrev} />
          <Icon d={playing ? PAUSE : PLAY} label={playing ? '一時停止' : '再生'} onClick={() => yd.mediaCommand('toggle')} big />
          <Icon d={NEXT} label="次へ" onClick={() => yd.mediaCommand('next')} disabled={!active.canNext} />
        </div>
      )}

      <div className="pl-side">
        {active && (
          <span className={`pl-vol ${vol === null ? 'off' : ''}`} title={vol === null ? 'この再生元の音量は変えられません' : `音量 ${Math.round(vol * 100)}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={SPEAKER} /></svg>
            <span className="pl-vol-line" ref={volRef} onPointerDown={onVolDown} onPointerMove={onVolMove} onPointerUp={onVolUp} onPointerCancel={() => setVolHeld(false)}>
              <span className="lt-line"><i style={{ width: `${(vol ?? 0) * 100}%` }} /></span>
              {vol !== null && <span className="pl-knob" style={{ left: `${vol * 100}%` }} />}
            </span>
          </span>
        )}
        <Icon d={SHRINK} label="ウィジェットに戻る（Esc）" onClick={() => yd.playerClose()} />
      </div>
    </div>
  )
}
