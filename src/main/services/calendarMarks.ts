// Subscription renewals and money days for the calendar, from a list in the Vault (owner, 2026-10-28).
// The file is plain Markdown so the owner and the other AIs can edit it:
//
//   ## サブスク
//   - 動画サービス | 毎月 15
//   - パスワード管理 | 毎年 4/1
//   ## お金の日
//   - カードの引き落とし | 毎月 27 | 5,000円
//
// A line is "- name | 毎月 <day>" or "- name | 毎年 <month>/<day>", with an optional third part shown
// beside the name (an amount, a note). Only the lines under a heading that is exactly 「サブスク」 or
// 「お金の日」 count; the page title (「サブスクとお金の日」) and the format help above it are not marks.
//
// The subscriptions card writes here too (2026-10-28): it adds and edits lines under 「サブスク」 and,
// following the Vault's rule, never deletes one outright but moves it to the Vault's ゴミ箱 with the date.
import { existsSync, mkdirSync, readFileSync, unwatchFile, watchFile, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { EventEmitter } from 'node:events'
import { getConfig } from '../config'
import type { CalendarMark, SubDraft } from '../../shared/types'

export const DEFAULT_MARKS_FILE = join(homedir(), 'library', '資料', 'ai-context', 'life', 'サブスクとお金の日.md')
export const marksEvents = new EventEmitter()

export function marksFile(): string {
  return getConfig().calendar.marksFile || DEFAULT_MARKS_FILE
}

export function parseMarks(text: string): CalendarMark[] {
  const out: CalendarMark[] = []
  let kind: CalendarMark['kind'] | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^#{1,6}\s*(.+?)\s*$/.exec(line)
    if (head) { kind = head[1] === 'サブスク' ? 'sub' : head[1] === 'お金の日' ? 'money' : null; continue }
    if (!kind || !line.startsWith('- ')) continue
    const parts = line.slice(2).split('|').map((p) => p.trim())
    if (parts.length < 2 || !parts[0]) continue
    const monthly = /^毎月\s*(\d{1,2})(?:日)?$/.exec(parts[1])
    const yearly = /^毎年\s*(\d{1,2})\s*[/月]\s*(\d{1,2})(?:日)?$/.exec(parts[1])
    const note = parts[2] || undefined
    if (monthly) out.push({ kind, name: parts[0], day: Number(monthly[1]), note })
    else if (yearly) out.push({ kind, name: parts[0], month: Number(yearly[1]), day: Number(yearly[2]), note })
  }
  return out.filter((m) => m.day >= 1 && m.day <= 31 && (m.month === undefined || (m.month >= 1 && m.month <= 12)))
}

export function readMarks(): CalendarMark[] {
  const f = marksFile()
  try { return existsSync(f) ? parseMarks(readFileSync(f, 'utf8')) : [] } catch { return [] }
}

let watched = ''
/** Tells the calendar when the owner edits the list. */
export function startMarksWatcher(): void {
  const f = marksFile()
  if (watched) unwatchFile(watched)
  watched = f
  watchFile(f, { interval: 3000 }, () => marksEvents.emit('changed'))
}

// ---------------------------------------------------------------- writing (the subscriptions card)

type Result = { ok: boolean; message: string }
const SUB_HEAD = 'サブスク'
const TRASH_SECTION = '削除した行'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const headOf = (line: string): string | null => /^#{1,6}\s*(.+?)\s*$/.exec(line.trim())?.[1] ?? null

/** The line for a subscription: "- name | 毎月 15 | 12USD" / "- name | 毎年 4/1 | 5,000円". */
export function subLine(d: SubDraft): string {
  const when = d.month ? `毎年 ${d.month}/${d.day}` : `毎月 ${d.day}`
  let amt = ''
  if (d.amount !== null) amt = d.currency === 'USD' ? `${Number(d.amount.toFixed(2))}USD` : `${Math.round(d.amount).toLocaleString('en-US')}円`
  return `- ${d.name} | ${when}${amt ? ` | ${amt}` : ''}`
}

function check(d: SubDraft): string | null {
  if (!d.name) return '名前を入れてください'
  if (/[|\r\n]/.test(d.name)) return '名前に「|」や改行は使えません'
  if (d.name.length > 60) return '名前が長すぎます（60 文字まで）'
  if (d.month !== undefined && !(Number.isInteger(d.month) && d.month >= 1 && d.month <= 12)) return '月は 1〜12 で入れてください'
  const last = d.month ? new Date(2024, d.month, 0).getDate() : 31
  if (!(Number.isInteger(d.day) && d.day >= 1 && d.day <= last)) return `日は 1〜${last} で入れてください`
  if (d.amount !== null && !(Number.isFinite(d.amount) && d.amount > 0)) return '金額は 0 より大きい数で入れてください'
  return null
}

/** Where the 「サブスク」 lines are: [heading, end) where end is the next heading or the end of the file. */
function subSection(lines: string[]): [number, number] | null {
  const h = lines.findIndex((l) => headOf(l) === SUB_HEAD)
  if (h < 0) return null
  let e = h + 1
  while (e < lines.length && headOf(lines[e]) === null) e++
  return [h, e]
}

const nameOf = (line: string): string | null => {
  const t = line.trim()
  return t.startsWith('- ') ? t.slice(2).split('|')[0].trim() : null
}

/** Marks the file as just written by the owner (through the card), as the Vault's front matter asks. */
function touch(lines: string[]): string[] {
  if (lines[0]?.trim() !== '---') return lines
  const end = lines.indexOf('---', 1)
  for (let i = 1; i > 0 && i < end; i++) {
    if (/^updated:/.test(lines[i])) lines[i] = `updated: ${today()}`
    else if (/^by:/.test(lines[i])) lines[i] = 'by: user'
  }
  return lines
}

function readLines(f: string): { lines: string[]; eol: string } {
  const text = readFileSync(f, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return { lines: text.split(/\r?\n/), eol }
}

/** Adds a subscription, or replaces the one named `original`. */
export function saveSub(d: SubDraft, original?: string): Result {
  const draft = { ...d, name: d.name.trim() }
  const bad = check(draft)
  if (bad) return { ok: false, message: bad }
  const f = marksFile()
  try {
    if (!existsSync(f)) return { ok: false, message: `一覧のファイルがありません: ${f}` }
    const { lines, eol } = readLines(f)
    const sec = subSection(lines)
    if (!sec) return { ok: false, message: '一覧に「## サブスク」の見出しがありません' }
    const [h, e] = sec
    const at = (name: string) => { for (let i = h + 1; i < e; i++) if (nameOf(lines[i]) === name) return i; return -1 }
    if (draft.name !== original && at(draft.name) >= 0) return { ok: false, message: `「${draft.name}」はもう一覧にあります` }
    const line = subLine(draft)
    if (original !== undefined) {
      const i = at(original)
      if (i < 0) return { ok: false, message: `「${original}」が一覧に見つかりません（誰かが先に直したかもしれません）` }
      lines[i] = line
    } else {
      // after the last item of the section (not after the blank lines that close it)
      let i = e
      while (i > h + 1 && lines[i - 1].trim() === '') i--
      lines.splice(i, 0, line)
    }
    writeFileSync(f, touch(lines).join(eol), 'utf8')
    marksEvents.emit('changed')
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: `書き込めませんでした: ${String(err)}` }
  }
}

/** The Vault's ゴミ箱 copy of this list (it sits next to the folder the list is in). */
function trashFile(f: string): string {
  return join(dirname(dirname(f)), 'ゴミ箱', basename(f))
}

const TRASH_HEAD = (src: string) => [
  '---', `updated: ${today()}`, 'by: user', '---', '',
  `# ゴミ箱: ${basename(src, '.md')}`, '',
  `\`${src}\` から外した行。行末の「削除 YYYY-MM-DD」から 180 日たったら消してよい（本人が決めた例外、2026-10-27）。戻すときは、バッククォートの中の行を元のファイルの見出しの下に足す。`, '',
  `## ${TRASH_SECTION}`, ''
]

/** Takes a subscription off the list: its line goes to the Vault's ゴミ箱 first, then leaves the list. */
export function deleteSub(name: string): Result {
  const f = marksFile()
  try {
    const { lines, eol } = readLines(f)
    const sec = subSection(lines)
    if (!sec) return { ok: false, message: '一覧に「## サブスク」の見出しがありません' }
    let i = -1
    for (let k = sec[0] + 1; k < sec[1]; k++) if (nameOf(lines[k]) === name) { i = k; break }
    if (i < 0) return { ok: false, message: `「${name}」が一覧に見つかりません` }
    const entry = `- \`${lines[i].trim()}\` | yuta-desk のサブスク画面から外した | 削除 ${today()}`
    const t = trashFile(f)
    // the trash first: if writing the list fails afterwards, the line is in both places, never lost
    if (existsSync(t)) {
      const tr = readLines(t)
      let at = tr.lines.findIndex((l) => headOf(l) === TRASH_SECTION)
      if (at < 0) { tr.lines.push('', `## ${TRASH_SECTION}`, ''); at = tr.lines.length - 2 }
      let e = at + 1
      while (e < tr.lines.length && headOf(tr.lines[e]) === null) e++
      while (e > at + 1 && tr.lines[e - 1].trim() === '') e--
      tr.lines.splice(e, 0, entry)
      writeFileSync(t, touch(tr.lines).join(tr.eol), 'utf8')
    } else {
      mkdirSync(dirname(t), { recursive: true })
      const rel = `life/${basename(f)}`
      writeFileSync(t, [...TRASH_HEAD(rel), entry, ''].join(eol), 'utf8')
    }
    lines.splice(i, 1)
    writeFileSync(f, touch(lines).join(eol), 'utf8')
    marksEvents.emit('changed')
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: `書き込めませんでした: ${String(err)}` }
  }
}
