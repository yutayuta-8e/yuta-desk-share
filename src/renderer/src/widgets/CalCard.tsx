import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { yd } from '../api'
import { useFeed } from '../hooks'
import { useLightTheme } from '../light/Light'
import type { EventDetail, EventDraft } from '@shared/types'
import { ymd, md, hm, spanOf, dayLabel } from './calendarDays'
import { SubsCard } from './SubsCard'

const params = new URLSearchParams(location.search)
const getCal = () => yd.getCalendar()
const onCal = yd.onCalendar

const REMIND: { v: number | null; label: string }[] = [
  { v: null, label: 'なし' }, { v: 10, label: '10分前' }, { v: 30, label: '30分前' }, { v: 60, label: '1時間前' }, { v: 1440, label: '前日' }
]
const REPEAT: { v: EventDraft['repeat']; label: string }[] = [
  { v: 'none', label: 'しない' }, { v: 'weekly', label: '毎週' }, { v: 'monthly', label: '毎月' }, { v: 'yearly', label: '毎年' }
]
const REPEAT_WORD: Record<EventDetail['repeat'], string> = { none: 'しない', daily: '毎日', weekly: '毎週', monthly: '毎月', yearly: '毎年', other: 'くり返す' }

function remindWord(mins: number[]): string {
  if (!mins.length) return 'なし'
  return mins.map((m) => (m >= 1440 && m % 1440 === 0 ? (m === 1440 ? '前日' : `${m / 1440}日前`) : m >= 60 && m % 60 === 0 ? `${m / 60}時間前` : `${m}分前`)).join('、')
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => { const c = Math.min(Math.max(m, 0), 23 * 60 + 59); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}` }
/** today: the next full hour; another day: 10:00 */
function firstTime(day: string): string {
  const now = new Date()
  return day === ymd(now) ? toTime(Math.min(now.getHours() + 1, 23) * 60) : '10:00'
}

/** The card beside the calendar: an event's (below), or the subscriptions (SubsCard.tsx). */
export function CalCard() {
  return params.get('mode') === 'subs' ? <SubsCard /> : <EventCard />
}

/**
 * The event card (design 2, 2026-10-28): an event's details, opened from the list under the month,
 * or the window for adding / editing one, with the rarer fields folded away. See-through.
 */
function EventCard() {
  useLightTheme()
  const [view, setView] = useState<'detail' | 'form'>(params.get('mode') === 'detail' ? 'detail' : 'form')
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [tether, setTether] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const ready = view === 'form' || detail !== null || missing

  useEffect(() => { document.body.style.background = 'transparent' }, [])
  useEffect(() => yd.onCalCardTether(setTether), [])
  useEffect(() => {
    const id = params.get('id')
    if (id) void yd.calEventDetail(id).then((d) => (d ? setDetail(d) : setMissing(true)))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') yd.calCardClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // the window takes the card's height; main places it beside the calendar (and shows it the first time)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const report = () => yd.calCardPlace(el.offsetHeight, view)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, ready])

  return (
    <div className={`calcard ${view}`}>
      <div ref={ref} className="gcard">
        {view === 'form'
          ? <EventForm edit={detail} />
          : detail ? <Detail d={detail} onEdit={() => setView('form')} />
          : missing ? <Missing /> : null}
      </div>
      {view === 'detail' && tether !== null && <i className="tether" style={{ top: tether }} />}
    </div>
  )
}

function Detail({ d, onEdit }: { d: EventDetail; onEdit: () => void }) {
  const [sure, setSure] = useState(false)
  const [err, setErr] = useState('')
  const [a, b] = spanOf(d)
  const near = dayLabel(a, new Date())
  const when = +a === +b ? (near === md(a) ? md(a) : `${near} ${md(a)}`) : `${md(a)}〜${md(b)}`
  const time = d.allDay ? '終日' : `${hm(d.start)}〜${hm(d.end)}`
  // deleting asks twice: the first press only changes the word
  const remove = async () => {
    if (!sure) { setSure(true); return }
    const r = await yd.calEventDelete(d.id)
    if (r.ok) yd.calCardClose()
    else { setErr(r.message); setSure(false) }
  }
  return (
    <>
      <div className="d-when">{when}</div>
      <div className="d-title lt-soft">{d.title}</div>
      <div className="d-time lt-soft">{time}</div>
      <div className="d-rows rule">
        {d.location && <><span className="lab">場所</span><span className="v">{d.location}</span></>}
        {d.description && <><span className="lab">メモ</span><span className="v">{d.description}</span></>}
        <span className="lab">通知</span><span className="v">{remindWord(d.reminders)}</span>
        <span className="lab">繰り返し</span><span className="v">{REPEAT_WORD[d.repeat]}</span>
        <span className="lab">カレンダー</span><span className="v">{d.calendarName}</span>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="buttons detail-buttons">
        {d.htmlLink && <button type="button" className="quiet" onClick={() => yd.openExternal(d.htmlLink!)}>Google で開く</button>}
        {d.writable && <button type="button" onClick={remove}>{sure ? 'もう一度で削除' : '削除'}</button>}
        {d.writable && <button type="button" className="primary" onClick={onEdit}>編集する</button>}
      </div>
    </>
  )
}

function Missing() {
  return (
    <>
      <div className="d-when">予定が見つかりません</div>
      <div className="note">消されたか、Google から読めませんでした。</div>
      <div className="buttons"><button type="button" onClick={() => yd.calCardClose()}>閉じる</button></div>
    </>
  )
}

function EventForm({ edit }: { edit: EventDetail | null }) {
  const cal = useFeed(getCal, onCal)
  const cals = (cal?.calendars ?? []).filter((c) => c.writable && !c.hidden)
  const primary = cals.find((c) => c.primary)?.id ?? cals[0]?.id ?? 'primary'
  const span = edit ? spanOf(edit) : null
  const day0 = span ? ymd(span[0]) : params.get('date') ?? ymd(new Date())
  const t0 = edit && !edit.allDay ? hm(edit.start) : firstTime(day0)
  const [title, setTitle] = useState(edit?.title ?? '')
  const [startDate, setStartDate] = useState(day0)
  const [endDate, setEndDate] = useState(span ? ymd(span[1]) : day0)
  const [allDay, setAllDay] = useState(edit?.allDay ?? false)
  const [startTime, setStartTime] = useState(t0)
  const [endTime, setEndTime] = useState(edit && !edit.allDay ? hm(edit.end) : toTime(toMin(t0) + 60))
  const [place, setPlace] = useState(edit?.location ?? '')
  const [memo, setMemo] = useState(edit?.description ?? '')
  const [reminder, setReminder] = useState<number | null>(edit ? (edit.reminders[0] ?? null) : 10)
  const [repeat, setRepeat] = useState<EventDraft['repeat']>('none')
  const [calendarId, setCalendarId] = useState('')
  // the rarer fields stay folded unless the event already uses them
  const [more, setMore] = useState(!!(edit?.location || edit?.description))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  // moving the start takes the end along (same length)
  const onStartDate = (v: string) => {
    if (!v) return
    const len = (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000
    const e = new Date(`${v}T00:00:00`); e.setDate(e.getDate() + Math.max(0, Math.round(len)))
    setStartDate(v); setEndDate(ymd(e))
  }
  const onStartTime = (v: string) => {
    if (!v) return
    setEndTime(toTime(toMin(v) + Math.max(15, toMin(endTime) - toMin(startTime))))
    setStartTime(v)
  }
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const d: EventDraft = { calendarId: calendarId || primary, title, startDate, endDate, allDay, startTime, endTime, location: place, description: memo, reminder, repeat }
    setBusy(true); setErr('')
    const r = await yd.calEventSave(d, edit?.id)
    setBusy(false)
    if (r.ok) yd.calCardClose()
    else setErr(r.message)
  }

  return (
    <form onSubmit={save} style={{ display: 'contents' }}>
      <h1>{edit ? '予定を編集' : '予定を追加'}</h1>
      <label>予定の名前<input ref={input} type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="two">
        <label>日付<input type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} /></label>
        <span className="sep">〜</span>
        <label>終わり<input type="date" value={endDate} min={startDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} /></label>
      </div>
      <div className="two">
        <label>時間<input type="time" value={startTime} disabled={allDay} onChange={(e) => onStartTime(e.target.value)} /></label>
        <span className="sep">〜</span>
        <label aria-label="終わりの時間"><input type="time" value={endTime} disabled={allDay} onChange={(e) => e.target.value && setEndTime(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />終日</label>
      </div>
      <div className={`acc rule ${more ? 'open' : ''}`}>
        <button type="button" className="acc-head" aria-expanded={more} onClick={() => setMore(!more)}>
          <span className="chev" />その他の詳細{!more && <span className="acc-sum">場所・メモ・通知・繰り返し・カレンダー</span>}
        </button>
        {more && (
          <div className="acc-body">
            <label>場所<input type="text" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
            <label>メモ<textarea value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
            <div className="field">
              <span className="lab">通知</span>
              <div className="chips">{REMIND.map((r) => <button type="button" key={String(r.v)} className={`chip ${reminder === r.v ? 'on' : ''}`} onClick={() => setReminder(r.v)}>{r.label}</button>)}</div>
            </div>
            {edit
              ? edit.recurring && <div className="note">くり返す予定の、この日だけが変わります</div>
              : (
                <div className="field">
                  <span className="lab">繰り返し</span>
                  <div className="chips">{REPEAT.map((r) => <button type="button" key={r.v} className={`chip ${repeat === r.v ? 'on' : ''}`} onClick={() => setRepeat(r.v)}>{r.label}</button>)}</div>
                </div>
              )}
            {!edit && cals.length > 0 && (
              <label>カレンダー
                <select value={calendarId || primary} onChange={(e) => setCalendarId(e.target.value)}>
                  {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
      <div className="note">{edit ? `${edit.calendarName} の予定` : 'Google カレンダーに入ります'}</div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="buttons">
        <button type="button" onClick={() => yd.calCardClose()}>やめる</button>
        <button type="submit" className="primary" disabled={busy}>{edit ? '保存する' : '追加する'}</button>
      </div>
    </form>
  )
}
