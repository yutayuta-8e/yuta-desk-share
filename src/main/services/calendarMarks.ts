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
import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { EventEmitter } from 'node:events'
import { getConfig } from '../config'
import type { CalendarMark } from '../../shared/types'

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
