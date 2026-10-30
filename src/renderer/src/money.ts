import { INCOME, MONEY_CATEGORIES, MONEY_PAYS, type MoneyData, type MoneyRow } from '@shared/types'

// Sums for the household accounts, shared by the widget and its card. Spending is net of refunds
// (a negative row lowers its own category); income (収入) is kept apart, as `yuta money month` does.

export type MonthSums = {
  month: string
  expense: number
  refund: number
  net: number
  income: number
  /** net spending per category, largest first (categories that net to 0 or less are left out) */
  cats: { name: string; total: number; count: number }[]
  /** net spending per day of the month, index 0 = the 1st */
  days: number[]
  count: number
}

export const plain = (n: number) => Math.round(n).toLocaleString('en-US')
export const yen = (n: number) => `${plain(n)}円`
export const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const ymdOf = (d: Date) => `${ymOf(d)}-${String(d.getDate()).padStart(2, '0')}`
export const daysIn = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate() }
export const monthNum = (ym: string) => Number(ym.slice(5, 7))
export const addMonths = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); return ymOf(new Date(y, m - 1 + k, 1)) }

export function sumMonth(month: string, rows: MoneyRow[], uptoDay = 31): MonthSums {
  const days = new Array<number>(daysIn(month)).fill(0)
  const cats = new Map<string, { total: number; count: number }>()
  let expense = 0, refund = 0, income = 0, count = 0
  for (const r of rows) {
    const d = Number(r.date.slice(8, 10))
    if (d > uptoDay) continue
    count++
    if (r.category === INCOME) { income += r.amount; continue }
    if (r.amount > 0) expense += r.amount
    else refund -= r.amount
    days[d - 1] += r.amount
    const c = cats.get(r.category) ?? { total: 0, count: 0 }
    c.total += r.amount; c.count++
    cats.set(r.category, c)
  }
  return {
    month, expense, refund, net: expense - refund, income, count, days,
    cats: [...cats].map(([name, c]) => ({ name, ...c })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total)
  }
}

export function monthRows(data: MoneyData | null, month: string): MoneyRow[] {
  return data?.months.find((m) => m.month === month)?.rows ?? []
}

/**
 * A memo as yuta's writers leave it: "Shop / 支払:Card / note / mail:ID". The card shows the first part
 * as the name and the rest (without the mail id, which is for the machines) as the note. Full-width
 * letters and digits from card notices are made ordinary.
 */
export function splitMemo(memo: string): { name: string; note: string } {
  const parts = memo.normalize('NFKC').split(/\s*\/\s+/).map((s) => s.trim()).filter((s) => s && !/^mail:/i.test(s))
  return { name: parts[0] ?? '', note: parts.slice(1).join(' / ') }
}

/** For the form: the names written before, most used first, each with its usual category and payment. */
export function memoHabits(data: MoneyData | null): Map<string, { category: string; pay: string; n: number }> {
  const tally = new Map<string, Map<string, number>>()
  for (const m of data?.months ?? []) for (const r of m.rows) {
    if (r.amount < 0) continue
    const name = splitMemo(r.memo).name.replace(/\s+\d+(\.\d+)?USD x\d+$/, '')
    if (!name) continue
    const t = tally.get(name) ?? new Map<string, number>()
    const k = `${r.category}\t${r.pay}`
    t.set(k, (t.get(k) ?? 0) + 1)
    tally.set(name, t)
  }
  const out = [...tally].map(([name, t]) => {
    const best = [...t].sort((a, b) => b[1] - a[1])[0][0]
    const total = [...t.values()].reduce((a, b) => a + b, 0)
    const [category, pay] = best.split('\t')
    return [name, { category, pay, n: total }] as const
  }).sort((a, b) => b[1].n - a[1].n)
  return new Map(out)
}

/** Categories in the README's order first, then any others the files use. */
export function categoryOrder(names: Iterable<string>): string[] {
  const known = MONEY_CATEGORIES as readonly string[]
  const extra = [...new Set(names)].filter((n) => !known.includes(n))
  return [...known, ...extra]
}

/** The ways of paying to offer, between cash and "other": those of the config, then any others the rows have used, most used first. */
export function payOrder(names: Iterable<string>, own: string[] = []): string[] {
  const known = MONEY_PAYS as readonly string[]
  const used = new Map<string, number>()
  for (const n of names) if (n && !known.includes(n) && !own.includes(n)) used.set(n, (used.get(n) ?? 0) + 1)
  return [known[0], ...own, ...[...used.keys()].sort((a, b) => used.get(b)! - used.get(a)!), known[1]]
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
export function dayLabel(ymd: string): string {
  const d = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEK[d.getDay()]}`
}
