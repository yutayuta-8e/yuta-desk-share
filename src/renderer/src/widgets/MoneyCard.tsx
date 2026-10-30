import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { yd } from '../api'
import { useConfig, useFeed } from '../hooks'
import { useLightTheme } from '../light/Light'
import { Refraction } from '../light/Refraction'
import { LightAmount } from './Money'
import { addMonths, categoryOrder, dayLabel, daysIn, memoHabits, monthNum, monthRows, payOrder, plain, splitMemo, sumMonth, ymOf, ymdOf, yen } from '../money'
import { INCOME, MONEY_CATEGORIES, USD_JPY, type MoneyData, type MoneyDraft, type MoneyRow } from '@shared/types'

const get = () => yd.getMoney()
const on = yd.onMoney

type Tab = 'list' | 'cats' | 'months'
type Flash = { date: string; amount: number; memo: string }

// who wrote a row, in the owner's words (the `by` column)
const WRITERS: Record<string, string> = { user: '自分', 'grok-bot': 'くろーどちゃん', 'claude-code': 'Claude Code', boka: '墨家', codex: 'Codex', dots: 'Dots' }
// the categories a spending row can be moved to at once (income stays income)
const CATS_SPENT = MONEY_CATEGORIES.filter((c) => c !== INCOME)
// columns of figures carry no 円: their right edges line up, and the sums above say what they are in
const signed = (r: MoneyRow) => (r.category === INCOME ? `+${plain(r.amount)}` : r.amount < 0 ? `−${plain(-r.amount)}` : plain(r.amount))

/**
 * The household accounts' card (2026-10-29), beside the money widget: one month at a time, as the
 * rows of each day, as what the money went on, or as the months side by side; and the form for
 * writing one down or changing it. Everything is written through `yuta money` (main/services/money.ts).
 */
export function MoneyCard() {
  useLightTheme()
  const data = useFeed(get, on)
  const thisMonth = ymOf(new Date())
  const params = new URLSearchParams(location.search)
  const [month, setMonth] = useState(params.get('month') ?? thisMonth)
  // a day pressed in the widget's sky (YYYY-MM-DD), the rows scrolled to it
  const [goto, setGoto] = useState<string | null>(params.get('month') && params.get('day') ? `${params.get('month')}-${params.get('day')!.padStart(2, '0')}` : null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('list')
  const [cat, setCat] = useState<string | null>(null)
  // null = the month; otherwise the form, for a new row or for `original`
  const [form, setForm] = useState<{ original?: MoneyRow } | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const ready = data !== null

  useEffect(() => { document.body.style.background = 'transparent' }, [])
  useEffect(() => yd.onMoneyGoto(({ month: m, day }) => {
    setForm(null); setMonth(m); setTab('list'); setCat(null); setQuery('')
    setGoto(day ? `${m}-${String(day).padStart(2, '0')}` : null)
  }), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (form) setForm(null); else yd.moneyCardClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [form])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const report = () => yd.moneyCardPlace(el.offsetHeight, form ? 'form' : 'month')
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [form, ready])

  const written = (f: Flash) => {
    setForm(null); setMonth(f.date.slice(0, 7)); setTab('list'); setCat(null); setFlash(f)
    window.setTimeout(() => setFlash(null), 2600)
  }

  return (
    <div className="moneycard">
      <div ref={ref} className="gcard mcard">
        <Refraction />
        {form
          ? <MoneyForm data={data} original={form.original} onCancel={() => setForm(null)} onDone={written} />
          : <MonthView data={data} month={month} setMonth={(m) => { setMonth(m); setGoto(null) }} thisMonth={thisMonth} tab={tab} setTab={setTab} cat={cat} setCat={setCat}
              flash={flash} goto={goto} query={query} setQuery={setQuery} onAdd={() => setForm({})} onEdit={(r) => setForm({ original: r })} />}
      </div>
    </div>
  )
}

function MonthView({ data, month, setMonth, thisMonth, tab, setTab, cat, setCat, flash, goto, query, setQuery, onAdd, onEdit }: {
  data: MoneyData | null; month: string; setMonth: (m: string) => void; thisMonth: string; tab: Tab; setTab: (t: Tab) => void
  cat: string | null; setCat: (c: string | null) => void; flash: Flash | null; goto: string | null; query: string; setQuery: (q: string) => void
  onAdd: () => void; onEdit: (r: MoneyRow) => void
}) {
  const all = useMemo(() => (data?.months ?? []).flatMap((m) => m.rows), [data])
  const first = data?.months[0]?.month ?? thisMonth
  const rows = monthRows(data, month)
  const sums = useMemo(() => sumMonth(month, rows), [month, rows])
  const isNow = month === thisMonth
  const prev = addMonths(month, -1)
  const hasPrev = !!data?.months.some((m) => m.month === prev)
  // this month: last month up to the same day; a month gone by: all of the month before
  const before = useMemo(() => {
    if (!hasPrev) return null
    const upto = isNow ? Math.min(new Date().getDate(), daysIn(prev)) : 31
    return sumMonth(prev, monthRows(data, prev), upto).net
  }, [data, prev, hasPrev, isNow])
  const year = month.slice(0, 4)

  return (
    <>
      <div className="m-top">
        <h1>{monthNum(month)}月{year !== thisMonth.slice(0, 4) && <small> {year}</small>}</h1>
        <div className="m-nav">
          <button type="button" className="quiet" disabled={month <= first} onClick={() => { setMonth(addMonths(month, -1)); setCat(null) }} aria-label="前の月">‹</button>
          <button type="button" className="quiet" disabled={month >= thisMonth} onClick={() => { setMonth(addMonths(month, 1)); setCat(null) }} aria-label="次の月">›</button>
        </div>
        <span className="count">{sums.count}件</span>
      </div>
      <div className="m-sum">
        <div className="m-net"><LightAmount n={sums.net} size={30} /><span className="yen">円</span></div>
        <div className="m-side">
          {before !== null && <span>{isNow ? '先月の同じ日まで' : '前の月'} {yen(before)}</span>}
          {sums.refund > 0 && <span>返金 {yen(sums.refund)}</span>}
          {sums.income > 0 && <span>収入 {yen(sums.income)}</span>}
        </div>
      </div>
      <div className="chips m-tabs">
        {([['list', '明細'], ['cats', '区分'], ['months', '月ごと']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'list' && <ListTab rows={rows} all={all} cat={cat} setCat={setCat} flash={flash} goto={goto} query={query} setQuery={setQuery} onEdit={onEdit} />}
      {tab === 'cats' && <CatsTab sums={sums} onPick={(c) => { setCat(c); setTab('list') }} />}
      {tab === 'months' && <MonthsTab data={data} month={month} thisMonth={thisMonth} onPick={(m) => { setMonth(m); setCat(null) }} />}
      {data?.error && <div className="err" role="alert">{data.error}</div>}
      <button type="button" className="add" onClick={onAdd}>＋ 記帳する</button>
    </>
  )
}

/** A row's key across the months (idx counts from 0 in each month file). */
const keyOf = (r: MoneyRow) => `${r.date.slice(0, 7)}:${r.idx}`
const norm = (t: string) => t.normalize('NFKC').toLowerCase()

/**
 * The rows, newest first, under the day they belong to. With words to look for, the rows of every
 * month whose memo, category or payment holds them, with their count and sum. A row chosen opens its
 * note, who wrote it, its category to change at once, and its buttons.
 */
function ListTab({ rows, all, cat, setCat, flash, goto, query, setQuery, onEdit }: {
  rows: MoneyRow[]; all: MoneyRow[]; cat: string | null; setCat: (c: string | null) => void; flash: Flash | null
  goto: string | null; query: string; setQuery: (q: string) => void; onEdit: (r: MoneyRow) => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setSure(false); setErr('') }, [chosen])
  const q = norm(query.trim())
  const shown = (q ? all.filter((r) => norm(`${r.memo} ${r.category} ${r.pay}`).includes(q)) : rows)
    .filter((r) => !cat || r.category === cat)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.idx - a.idx))
  const found = q ? shown.reduce((a, r) => a + (r.category === INCOME ? 0 : r.amount), 0) : 0
  // the row just written glows a moment (the last one of that day, amount and memo)
  const flashKey = flash ? shown.filter((r) => r.date === flash.date && r.amount === flash.amount && r.memo === flash.memo).map(keyOf)[0] ?? null : null
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { if (flashKey) scroller.current?.querySelector('.mr.flash')?.scrollIntoView({ block: 'nearest' }) }, [flashKey])
  // a day pressed in the widget's sky: scrolled to the top of the list
  useEffect(() => {
    const el = goto ? scroller.current?.querySelector<HTMLElement>(`[data-day="${goto}"]`) : null
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - scroller.current.offsetTop
  }, [goto, rows])
  const days: { date: string; rows: MoneyRow[]; net: number }[] = []
  for (const r of shown) {
    const d = days[days.length - 1]
    const v = r.category === INCOME ? 0 : r.amount
    if (d?.date === r.date) { d.rows.push(r); d.net += v } else days.push({ date: r.date, rows: [r], net: v })
  }
  const refOf = (r: MoneyRow) => ({ month: r.date.slice(0, 7), date: r.date, amount: r.amount, idx: r.idx })
  // deleting asks twice; the row goes to the Vault's ゴミ箱, not away
  const remove = async (r: MoneyRow) => {
    if (!sure) { setSure(true); return }
    const res = await yd.moneyRemove(refOf(r))
    if (res.ok) setChosen(null)
    else { setErr(res.message); setSure(false) }
  }
  const recat = async (r: MoneyRow, c: string) => {
    if (busy || c === r.category) return
    setBusy(true); setErr('')
    const res = await yd.moneyFix(refOf(r), { date: r.date, amount: r.amount, category: c, memo: r.memo, pay: r.pay })
    setBusy(false)
    if (!res.ok) setErr(res.message)
  }
  const thisYear = String(new Date().getFullYear())
  return (
    <>
      <input className="m-search" type="text" value={query} spellCheck={false} placeholder="さがす（すべての月から）" onChange={(e) => { setQuery(e.target.value); setChosen(null) }} />
      {(cat || q) && (
        <div className="m-filter">
          <span>{q ? `${shown.length}件 ${yen(found)}` : ''}{cat ? `${q ? '　' : ''}${cat}だけ` : ''}</span>
          <button type="button" className="quiet" onClick={() => { setCat(null); setQuery('') }}>すべて表示</button>
        </div>
      )}
      <div ref={scroller} className="m-list">
        {!shown.length && <div className="note">{q ? '見つかりませんでした。' : 'この月はまだありません。下から書けます。'}</div>}
        {days.map((d) => (
          <div key={d.date} className={`m-day ${goto === d.date ? 'goto' : ''}`} data-day={d.date}>
            <div className="dh">
              <span>{q && d.date.slice(0, 4) !== thisYear ? `${d.date.slice(0, 4)}年 ` : ''}{dayLabel(d.date)}</span>
              {d.net !== 0 && <span>{d.net < 0 ? `−${plain(-d.net)}` : plain(d.net)}</span>}
            </div>
            {d.rows.map((r) => {
              const m = splitMemo(r.memo)
              const k = keyOf(r)
              const isOn = chosen === k
              return (
                <div key={k} className="mr-wrap">
                  <div className={`mr ${isOn ? 'on' : ''} ${r.amount < 0 ? 'refund' : ''} ${r.category === INCOME ? 'income' : ''} ${k === flashKey ? 'flash' : ''}`}
                    onClick={() => setChosen(isOn ? null : k)}>
                    <span className="mn">{m.name || '（メモなし）'}</span>
                    <span className="mc">{r.category}</span>
                    <span className="ma">{signed(r)}</span>
                  </div>
                  {isOn && (
                    <div className="mdet">
                      {m.note && <div className="mnote">{m.note}</div>}
                      <div className="mmeta">
                        {r.pay && <span>{r.pay}</span>}
                        <span>書いた人 {WRITERS[r.by] ?? r.by}</span>
                      </div>
                      {r.category !== INCOME && (
                        <div className="chips m-recat" aria-label="区分を変える">
                          {CATS_SPENT.map((c) => <button key={c} type="button" className={`chip ${r.category === c ? 'on' : ''}`} disabled={busy} onClick={() => void recat(r, c)}>{c}</button>)}
                        </div>
                      )}
                      {err && <div className="err" role="alert">{err}</div>}
                      <div className="acts">
                        <button type="button" onClick={() => void remove(r)}>{sure ? 'もう一度でゴミ箱へ' : 'ゴミ箱へ'}</button>
                        <button type="button" className="primary" onClick={() => onEdit(r)}>直す</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

/** What the money went on: a line of light for each category, as long as its share of the largest. */
function CatsTab({ sums, onPick }: { sums: ReturnType<typeof sumMonth>; onPick: (c: string) => void }) {
  const max = sums.cats[0]?.total ?? 1
  return (
    <div className="m-cats">
      {!sums.cats.length && <div className="note">この月はまだありません。</div>}
      {sums.cats.map((c) => (
        <button key={c.name} type="button" className="mcat" onClick={() => onPick(c.name)}>
          <span className="cn">{c.name}</span>
          <span className="cbar"><i style={{ width: `${Math.max(2, (c.total / max) * 100)}%` }} /></span>
          <span className="ca">{plain(c.total)}</span>
          <span className="cp">{Math.round((c.total / Math.max(1, sums.net)) * 100)}%</span>
        </button>
      ))}
      {sums.income > 0 && (
        <div className="mcat income">
          <span className="cn">{INCOME}</span><span className="cbar" /><span className="ca">+{plain(sums.income)}</span><span className="cp" />
        </div>
      )}
    </div>
  )
}

/**
 * The months side by side as upright lines of light; the average of the finished months as a faint line.
 * The month the records began in is left out of the average when they began after its first week
 * (the accounts start on 2025-12-23), and its line is faint.
 */
function MonthsTab({ data, month, thisMonth, onPick }: { data: MoneyData | null; month: string; thisMonth: string; onPick: (m: string) => void }) {
  const months = data?.months ?? []
  const firstDay = months[0]?.rows.reduce((d, r) => (r.date < d ? r.date : d), '9999')
  const begun = months[0] && Number(firstDay?.slice(8, 10)) > 7 ? months[0].month : null
  const list = months.slice(-12).map((m) => sumMonth(m.month, m.rows))
  const done = list.filter((s) => s.month !== thisMonth && s.month !== begun)
  const avg = done.length ? done.reduce((a, s) => a + s.net, 0) / done.length : 0
  const max = Math.max(1, ...list.map((s) => s.net), avg)
  const H = 118
  const chosen = list.find((s) => s.month === month)
  return (
    <div className="m-months">
      <div className="bars" style={{ height: H + 18 }}>
        {avg > 0 && <i className="avg" style={{ bottom: 18 + (avg / max) * H }} />}
        {list.map((s) => (
          <div key={s.month} role="button" tabIndex={0} className={`mbar ${s.month === month ? 'on' : ''} ${s.month === thisMonth ? 'now' : ''} ${s.month === begun ? 'begun' : ''}`} onClick={() => onPick(s.month)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick(s.month) }} aria-label={`${monthNum(s.month)}月 ${yen(s.net)}`}>
            <span className="col"><i style={{ height: Math.max(2, (Math.max(0, s.net) / max) * H) }} /></span>
            <small>{monthNum(s.month)}</small>
          </div>
        ))}
      </div>
      <div className="m-legend">
        {chosen && <span>{monthNum(chosen.month)}月 {yen(chosen.net)}{chosen.month === thisMonth ? `（${new Date().getDate()}日まで）` : chosen.month === begun ? `（${Number(firstDay?.slice(8, 10))}日から）` : ''}</span>}
        {avg > 0 && <span className="dim">先月までの平均 {yen(avg)}</span>}
      </div>
    </div>
  )
}

function MoneyForm({ data, original, onCancel, onDone }: { data: MoneyData | null; original?: MoneyRow; onCancel: () => void; onDone: (f: Flash) => void }) {
  const habits = useMemo(() => memoHabits(data), [data])
  const cats = useMemo(() => categoryOrder((data?.months ?? []).flatMap((m) => m.rows.map((r) => r.category))), [data])
  const own = useConfig()?.money?.pays
  const pays = useMemo(() => payOrder((data?.months ?? []).flatMap((m) => m.rows.map((r) => r.pay)), own), [data, own])
  const [amount, setAmount] = useState(original ? String(Math.abs(original.amount)) : '')
  const [refund, setRefund] = useState(!!original && original.amount < 0)
  const [usd, setUsd] = useState(false)
  const [memo, setMemo] = useState(original?.memo ?? '')
  const [category, setCategory] = useState(original?.category ?? '食費')
  const [pay, setPay] = useState(original?.pay ?? '現金')
  const [date, setDate] = useState(original?.date ?? ymdOf(new Date()))
  // the category and payment follow the memo's habit until the owner picks one by hand
  const [picked, setPicked] = useState(!!original)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dup, setDup] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  const onMemo = (v: string) => {
    setMemo(v); setDup('')
    const h = habits.get(v.trim())
    if (h && !picked) { setCategory(h.category); if (h.pay) setPay(h.pay) }
  }
  const n = Number(amount.replace(/[,，円¥$\s]/g, ''))
  const yenAmount = usd ? Math.round(n * USD_JPY) : Math.round(n)
  const valid = Number.isFinite(n) && n > 0 && yenAmount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const save = async (force = false, e?: React.FormEvent) => {
    e?.preventDefault()
    if (!valid || busy) return
    // the memo keeps the dollars and the rate (the household rule, e.g. "… 39.50USD x165")
    const text = usd ? `${memo.trim()} ${n}USD x${USD_JPY}`.trim() : memo.trim()
    const d: MoneyDraft = { date, amount: (refund && category !== INCOME ? -1 : 1) * yenAmount, category, memo: text, pay, force }
    setBusy(true); setErr(''); setDup('')
    const r = original
      ? await yd.moneyFix({ month: original.date.slice(0, 7), date: original.date, amount: original.amount, idx: original.idx }, d)
      : await yd.moneyAdd(d)
    setBusy(false)
    if (r.ok) { onDone({ date: d.date, amount: d.amount, memo: d.memo }); return }
    if (r.code === 'duplicate') {
      const rows = (r.detail?.duplicates as { row?: { memo?: string } }[] | undefined) ?? []
      setDup(splitMemo(rows[0]?.row?.memo ?? '').name || '同じ日・同じ金額の行')
    } else setErr(r.message)
  }

  const names = useMemo(() => [...habits.keys()].slice(0, 60), [habits])
  return (
    <form onSubmit={(e) => void save(false, e)} style={{ display: 'contents' }}>
      <h1>{original ? '直す' : '記帳する'}</h1>
      <div className="two">
        <label>金額<input ref={input} type="text" inputMode="decimal" value={amount} placeholder="0" spellCheck={false} onChange={(e) => { setAmount(e.target.value); setDup('') }} /></label>
        <div className="chips unit">
          <button type="button" className={`chip ${!usd ? 'on' : ''}`} onClick={() => setUsd(false)}>円</button>
          <button type="button" className={`chip ${usd ? 'on' : ''}`} onClick={() => setUsd(true)}>USD</button>
        </div>
      </div>
      {usd && valid && <div className="m-conv">{yen(yenAmount)}</div>}
      <label>メモ<input type="text" list="money-names" value={memo} maxLength={120} spellCheck={false} placeholder="お店や中身" onChange={(e) => onMemo(e.target.value)} /></label>
      <datalist id="money-names">{names.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="field">
        <span className="lab">区分</span>
        <div className="chips">
          {cats.map((c) => <button key={c} type="button" className={`chip ${category === c ? 'on' : ''}`} onClick={() => { setCategory(c); setPicked(true) }}>{c}</button>)}
        </div>
      </div>
      <div className="field">
        <span className="lab">支払方法</span>
        <div className="chips">
          {pays.map((p) => <button key={p} type="button" className={`chip ${pay === p ? 'on' : ''}`} onClick={() => { setPay(p); setPicked(true) }}>{p}</button>)}
        </div>
      </div>
      <div className="two">
        <label>日付<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDup('') }} /></label>
        {category !== INCOME && <label className="check"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />返金・取消</label>}
      </div>
      {dup && (
        <div className="m-dup" role="alert">
          <span>同じ日・同じ金額の「{dup}」があります。</span>
          <button type="button" onClick={() => void save(true)}>別の買い物として書く</button>
        </div>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="buttons">
        <button type="button" onClick={onCancel}>やめる</button>
        <button type="submit" className="primary" disabled={busy || !valid}>{original ? '保存する' : '記帳する'}</button>
      </div>
    </form>
  )
}
