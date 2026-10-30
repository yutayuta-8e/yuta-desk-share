import { existsSync, readdirSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { EventEmitter } from 'node:events'
import { dirname, join } from 'node:path'
import { getConfig } from '../config'
import { runYutaGroup, type YutaResult } from './tasks'
import { USD_JPY, type MoneyData, type MoneyDraft, type MoneyMonth, type MoneyRef, type MoneyRow } from '../../shared/types'

// The household accounts (2026-10-29): the month files of the Vault's life/家計簿/, read here as they
// are; every write goes through `yuta money` so its duplicate checks, its trash and its format apply.

export const moneyEvents = new EventEmitter()

/** The Vault folder: YUTA_VAULT (as `yuta` uses), or the one that holds the task file. */
function moneyDir(): string {
  const vault = process.env.YUTA_VAULT ?? dirname(dirname(getConfig().tasks.vaultTaskFile))
  return join(vault, 'life', '家計簿')
}

/** One CSV record per line; a quoted field may hold commas and doubled quotes (yuta writes no line breaks inside). */
function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

export function parseMonth(csv: string): MoneyRow[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const head = parseLine(lines.shift() ?? '')
  const col = (name: string) => head.indexOf(name)
  const at = { date: col('date'), amount: col('amount'), category: col('category'), memo: col('memo'), pay: col('pay'), by: col('by') }
  const rows: MoneyRow[] = []
  lines.forEach((l, idx) => {
    const f = parseLine(l)
    const amount = Number(f[at.amount])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f[at.date] ?? '') || !Number.isFinite(amount) || amount === 0) return
    rows.push({ idx, date: f[at.date], amount, category: f[at.category] ?? '', memo: f[at.memo] ?? '', pay: f[at.pay] ?? '', by: f[at.by] ?? '' })
  })
  return rows
}

export function readMoney(): MoneyData {
  if (process.env.YD_DEMO_MONEY) return demoMoney()
  const dir = moneyDir()
  if (!existsSync(dir)) return { months: [], updatedAt: Date.now(), error: `見つからない: ${dir}` }
  try {
    const months: MoneyMonth[] = readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}\.csv$/.test(f))
      .sort()
      .map((f) => ({ month: f.slice(0, 7), rows: parseMonth(readFileSync(join(dir, f), 'utf8')) }))
    return { months, updatedAt: Date.now() }
  } catch (e) {
    return { months: [], updatedAt: Date.now(), error: String(e) }
  }
}

let watcher: FSWatcher | null = null
export function startMoneyWatcher(): void {
  watcher?.close()
  watcher = null
  if (process.env.YD_DEMO_MONEY) return
  const dir = moneyDir()
  if (!existsSync(dir)) return
  // yuta and the Grok side write whole files; one push after the writes settle
  let t: NodeJS.Timeout | null = null
  try {
    watcher = watch(dir, () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => moneyEvents.emit('changed', readMoney()), 400)
    })
  } catch { /* no watching: the card still reads on open */ }
}

const dry = () => !!(process.env.YD_MONEY_DRYRUN || process.env.YD_DEMO_MONEY)

/** The row's place among the rows of its month with the same day and amount (yuta's --index, from 1). */
function indexOf(ref: MoneyRef): number | null {
  const m = readMoney().months.find((x) => x.month === ref.month)
  const same = (m?.rows ?? []).filter((r) => r.date === ref.date && r.amount === ref.amount)
  const i = same.findIndex((r) => r.idx === ref.idx)
  return i < 0 ? null : i + 1
}

const gone: YutaResult = { ok: false, message: 'その行が見つかりません（ほかで書き換えられたかもしれません）' }

export async function addMoney(d: MoneyDraft): Promise<YutaResult> {
  const r = await runYutaGroup('money', ['add', `--amount=${d.amount}`, '--cat', d.category, '--date', d.date, `--pay=${d.pay}`, ...(d.force ? ['--force'] : []), '--', d.memo], dry())
  if (r.ok) moneyEvents.emit('changed', readMoney())
  return r
}

export async function fixMoney(ref: MoneyRef, d: MoneyDraft): Promise<YutaResult> {
  const n = indexOf(ref)
  if (n === null) return gone
  const r = await runYutaGroup('money', ['fix', `${ref.date}/${ref.amount}`, '--month', ref.month, '--index', String(n),
    `--memo=${d.memo}`, '--cat', d.category, `--pay=${d.pay}`, '--date', d.date, `--amount=${d.amount}`], dry())
  if (r.ok) moneyEvents.emit('changed', readMoney())
  return r
}

/** To the Vault's trash (ゴミ箱/家計簿.md); `yuta money restore` puts it back. */
export async function removeMoney(ref: MoneyRef): Promise<YutaResult> {
  const n = indexOf(ref)
  if (n === null) return gone
  const r = await runYutaGroup('money', ['remove', `${ref.date}/${ref.amount}`, '--month', ref.month, '--index', String(n), '--reason', 'yuta-desk の家計簿から外した'], dry())
  if (r.ok) moneyEvents.emit('changed', readMoney())
  return r
}

/**
 * Made-up accounts for screenshots (YD_DEMO_MONEY=1), so the owner's own spending never appears in
 * them: eleven months up to today, the same every time (a fixed seed).
 */
function demoMoney(): MoneyData {
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const now = new Date()
  const months: MoneyMonth[] = []
  for (let k = 10; k >= 0; k--) {
    const first = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const y = first.getFullYear(), mo = first.getMonth()
    const last = k === 0 ? now.getDate() : new Date(y, mo + 1, 0).getDate()
    const ymd = (d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const rows: Omit<MoneyRow, 'idx'>[] = []
    const add = (d: number, amount: number, category: string, memo: string, pay: string) => { if (d <= last) rows.push({ date: ymd(d), amount, category, memo, pay, by: 'user' }) }
    add(3, 980, 'サブスク', '音楽ストリーミング', 'カード')
    add(10, 20 * USD_JPY, 'サブスク', `AI ツール 20USD x${USD_JPY}`, 'デビットカード')
    add(14, 1490, 'サブスク', '動画配信', 'カード')
    add(18, 2980, '通信', 'スマホ代', 'カード')
    add(25, 212000, '収入', '給与', '銀行')
    for (let d = 1; d <= last; d++) {
      if (rnd() < 0.62) add(d, 120 + Math.round(rnd() * 9) * 70, '食費', pick(['コンビニ', 'パン屋', 'カフェ', 'おにぎり']), pick(['現金', '交通系 IC', 'あと払い']))
      if (rnd() < 0.28) add(d, 1200 + Math.round(rnd() * 26) * 100, '食費', pick(['スーパー', 'スーパー', '八百屋', '精肉店']), pick(['交通系 IC', 'カード']))
      if (rnd() < 0.12) add(d, 240 + Math.round(rnd() * 6) * 80, '交通', pick(['電車', 'バス']), '交通系 IC')
      if (rnd() < 0.07) add(d, 300 + Math.round(rnd() * 20) * 60, '日用品', pick(['ドラッグストア', '100円ショップ', '洗剤']), pick(['現金', 'あと払い']))
      if (rnd() < 0.05) add(d, 1400 + Math.round(rnd() * 16) * 200, '娯楽', pick(['映画', '本', 'ライブのチケット', 'ゲーム']), pick(['カード', 'あと払い']))
      if (rnd() < 0.04) add(d, 800 + Math.round(rnd() * 30) * 150, '制作', pick(['画材', 'フォント', '素材集', 'イヤホン']), pick(['カード', 'デビットカード']))
      if (rnd() < 0.015) add(d, 1800 + Math.round(rnd() * 10) * 100, '医療', '病院', '現金')
    }
    if (k === 2) add(20, -1600, '娯楽', 'チケット 払い戻し', 'カード')
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    months.push({ month: ymd(1).slice(0, 7), rows: rows.map((r, idx) => ({ ...r, idx })) })
  }
  return { months, updatedAt: Date.now() }
}
