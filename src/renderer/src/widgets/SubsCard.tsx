import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { yd } from '../api'
import { useFeed } from '../hooks'
import { useLightTheme } from '../light/Light'
import { Refraction } from '../light/Refraction'
import type { CalendarMark, SubDraft } from '@shared/types'

const getCal = () => yd.getCalendar()
const onCal = yd.onCalendar

// The owner's fixed rate for payments in dollars (the household accounts use the same, 2026-10-25).
const USD_JPY = 165

type Sub = { name: string; month?: number; day: number; next: Date; left: number; yen: string | null; usd: string | null; amount: number | null; currency: 'JPY' | 'USD' }

const yen = (n: number) => `${Math.round(n).toLocaleString('en-US')}円`

/** "12USD" / "5,000円" / "約1,000円" from the note beside the name; anything else is shown as it is. */
function priceOf(note?: string): Pick<Sub, 'yen' | 'usd' | 'amount' | 'currency'> {
  const m = /^(約)?\s*([\d,]+(?:\.\d+)?)\s*(円|USD)$/i.exec((note ?? '').trim())
  if (!m) return { yen: note?.trim() || null, usd: null, amount: null, currency: 'JPY' }
  const n = Number(m[2].replace(/,/g, ''))
  if (m[3].toUpperCase() === 'USD') return { yen: `${m[1] ?? ''}${yen(n * USD_JPY)}`, usd: `${m[2]}USD`, amount: n, currency: 'USD' }
  return { yen: `${m[1] ?? ''}${yen(n)}`, usd: null, amount: n, currency: 'JPY' }
}

/** The next renewal on or after today (a 31st falls on the month's last day in shorter months). */
function nextOf(m: CalendarMark, today: Date): Date {
  const at = (y: number, mo: number) => new Date(y, mo, Math.min(m.day, new Date(y, mo + 1, 0).getDate()))
  if (m.month) {
    const d = at(today.getFullYear(), m.month - 1)
    return d >= today ? d : at(today.getFullYear() + 1, m.month - 1)
  }
  const d = at(today.getFullYear(), today.getMonth())
  return d >= today ? d : at(today.getFullYear(), today.getMonth() + 1)
}

const leftWord = (n: number) => (n === 0 ? '今日' : n === 1 ? '明日' : `あと${n}日`)

/**
 * The tops of the name and the price sit on the top of the large day (owner, 2026-10-29). The three
 * columns share a baseline, and each is lowered by how much taller its ink stands than the day's,
 * measured from the text itself: kanji and kana stand taller than Latin letters and digits, so one
 * fixed amount left names in Latin letters low.
 */
function useInkTops(card: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const root = card.current
    if (!root) return
    let alive = true
    const ctx = document.createElement('canvas').getContext('2d')!
    const ascent = (el: Element | null | undefined) => {
      if (!el) return 0
      const cs = getComputedStyle(el)
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      return ctx.measureText(el.textContent ?? '').actualBoundingBoxAscent
    }
    const apply = () => {
      if (!alive) return
      root.querySelectorAll<HTMLElement>('.sr').forEach((r) => {
        const day = ascent(r.querySelector('.num'))
        r.querySelectorAll<HTMLElement>('.nm, .amt').forEach((col) => { col.style.top = `${(ascent(col.firstElementChild) - day).toFixed(2)}px` })
      })
    }
    apply()
    void document.fonts.ready.then(apply)
    return () => { alive = false }
  }, deps)
}

/**
 * The subscriptions (2026-10-28, design 4 of 5, chosen by the owner): monthly and yearly apart, the
 * day as a large number, the nearest renewal first; prices in yen, with the dollar price small
 * beside those paid in dollars. A line chosen opens its buttons; adding and editing happen in the
 * same card. Everything is written to the Vault list the calendar's stars come from.
 */
export function SubsCard() {
  useLightTheme()
  const cal = useFeed(getCal, onCal)
  // null = the list; otherwise the form, for a new one or for `original`
  const [form, setForm] = useState<{ original?: Sub } | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const ready = cal !== null

  useEffect(() => { document.body.style.background = 'transparent' }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') yd.calCardClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const report = () => yd.calCardPlace(el.offsetHeight, form ? 'subform' : 'subs')
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [form, ready])

  const subs = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return (cal?.marks ?? []).filter((m) => m.kind === 'sub').map((m): Sub => {
      const next = nextOf(m, today)
      return { name: m.name, month: m.month, day: m.day, next, left: Math.round((+next - +today) / 86400000), ...priceOf(m.note) }
    }).sort((a, b) => +a.next - +b.next)
  }, [cal])
  useInkTops(ref, [subs, form, chosen])

  return (
    <div className="calcard subs-card">
      <div ref={ref} className="gcard subs">
        <Refraction />
        {form
          ? <SubForm original={form.original} onDone={() => setForm(null)} />
          : <SubList subs={subs} chosen={chosen} setChosen={setChosen} onEdit={(s) => setForm({ original: s })} onAdd={() => setForm({})} />}
      </div>
    </div>
  )
}

function SubList({ subs, chosen, setChosen, onEdit, onAdd }: {
  subs: Sub[]; chosen: string | null; setChosen: (n: string | null) => void; onEdit: (s: Sub) => void; onAdd: () => void
}) {
  const [sure, setSure] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setSure(false); setErr('') }, [chosen])
  // deleting asks twice; the line goes to the Vault's ゴミ箱, not away
  const remove = async (s: Sub) => {
    if (!sure) { setSure(true); return }
    const r = await yd.subsDelete(s.name)
    if (r.ok) setChosen(null)
    else { setErr(r.message); setSure(false) }
  }
  const row = (s: Sub) => {
    const on = chosen === s.name
    return (
      <div key={s.name} className="sr-wrap">
        <div className={`sr ${on ? 'on' : ''}`} onClick={() => setChosen(on ? null : s.name)}>
          <span className={`num ${s.month ? 'md' : ''}`}>{s.month ? `${s.month}/${s.day}` : s.day}</span>
          <span className="nm"><span>{s.name}</span><small>{leftWord(s.left)}</small></span>
          <span className="amt">{s.yen && <span>{s.yen}</span>}{s.usd && <small>{s.usd}</small>}</span>
        </div>
        {on && (
          <div className="acts">
            <button type="button" onClick={() => void remove(s)}>{sure ? 'もう一度で削除' : '削除'}</button>
            <button type="button" className="primary" onClick={() => onEdit(s)}>編集する</button>
          </div>
        )}
      </div>
    )
  }
  const monthly = subs.filter((s) => !s.month)
  const yearly = subs.filter((s) => s.month)
  return (
    <>
      <div className="subs-top"><h1>サブスク</h1><span className="count">{subs.length}件</span></div>
      {monthly.length > 0 && <div className="sec"><span className="sh">毎月</span>{monthly.map(row)}</div>}
      {yearly.length > 0 && <div className={`sec ${monthly.length ? 'rule' : ''}`}><span className="sh">毎年</span>{yearly.map(row)}</div>}
      {!subs.length && <div className="note">まだありません。下から足せます。</div>}
      {err && <div className="err" role="alert">{err}</div>}
      <button type="button" className="add" onClick={onAdd}>＋ サブスクを足す</button>
    </>
  )
}

function SubForm({ original, onDone }: { original?: Sub; onDone: () => void }) {
  const [name, setName] = useState(original?.name ?? '')
  const [yearly, setYearly] = useState(!!original?.month)
  const [month, setMonth] = useState(String(original?.month ?? new Date().getMonth() + 1))
  const [day, setDay] = useState(String(original?.day ?? new Date().getDate()))
  const [amount, setAmount] = useState(original?.amount != null ? String(original.amount) : '')
  const [currency, setCurrency] = useState<'JPY' | 'USD'>(original?.currency ?? 'JPY')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const a = amount.trim() === '' ? null : Number(amount.replace(/,/g, ''))
    const d: SubDraft = { name: name.trim(), day: Number(day), amount: a, currency, ...(yearly ? { month: Number(month) } : {}) }
    setBusy(true); setErr('')
    const r = await yd.subsSave(d, original?.name)
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.message)
  }

  return (
    <form onSubmit={save} style={{ display: 'contents' }}>
      <h1>{original ? 'サブスクを編集' : 'サブスクを足す'}</h1>
      <label>名前<input ref={input} type="text" value={name} maxLength={60} spellCheck={false} onChange={(e) => setName(e.target.value)} /></label>
      <div className="field">
        <span className="lab">更新</span>
        <div className="chips">
          <button type="button" className={`chip ${!yearly ? 'on' : ''}`} onClick={() => setYearly(false)}>毎月</button>
          <button type="button" className={`chip ${yearly ? 'on' : ''}`} onClick={() => setYearly(true)}>毎年</button>
        </div>
      </div>
      <div className="two">
        {yearly && <label>月<input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /></label>}
        <label>日<input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} /></label>
      </div>
      <div className="two">
        <label>金額<input type="number" min={0} step="any" value={amount} placeholder="なし" onChange={(e) => setAmount(e.target.value)} /></label>
        <div className="chips unit">
          <button type="button" className={`chip ${currency === 'JPY' ? 'on' : ''}`} onClick={() => setCurrency('JPY')}>円</button>
          <button type="button" className={`chip ${currency === 'USD' ? 'on' : ''}`} onClick={() => setCurrency('USD')}>USD</button>
        </div>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="buttons">
        <button type="button" onClick={onDone}>やめる</button>
        <button type="submit" className="primary" disabled={busy}>{original ? '保存する' : '足す'}</button>
      </div>
    </form>
  )
}
