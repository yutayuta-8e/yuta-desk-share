import { readFileSync, existsSync, watchFile, unwatchFile } from 'node:fs'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getConfig } from '../config'
import type { TaskItem, TaskList } from '../../shared/types'

export const taskEvents = new EventEmitter()

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export function parseTasks(md: string): TaskItem[] {
  const items: TaskItem[] = []
  for (const raw of md.split(/\r?\n/)) {
    const m = /^- \[ \] (.+)$/.exec(raw.trim())
    if (!m) continue
    const parts = m[1].split('|').map((s) => s.trim())
    const head = parts[0] ?? ''
    const title = parts[1] ?? ''
    const note = parts.slice(2).join(' | ')
    const dm = /^期限\s*(\d{4}-\d{2}-\d{2})/.exec(head)
    const due = dm ? dm[1] : null
    const today = todayStr()
    items.push({
      id: createHash('sha1').update(raw).digest('hex').slice(0, 10),
      due,
      title,
      note,
      waiting: title.startsWith('返事待ち'),
      overdueDays: due ? daysBetween(due, today) : null
    })
  }
  return items
}

/** Sample tasks for screenshots (YD_DEMO_TASKS=1), so real task names never appear in them. */
function demoTasks(): TaskList {
  const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const t = (id: string, title: string, offset: number): TaskItem => ({ id, title, due: day(offset), note: '', waiting: title.startsWith('返事待ち'), overdueDays: -offset })
  return {
    items: [
      t('d1', '新曲のサビの歌詞を仕上げる', -1),
      t('d2', 'MV の絵コンテを描く', 0),
      t('d3', 'ジャケット画像を3案つくる', 0),
      t('d4', 'ミックスを聴き直してメモする', 1),
      t('d5', '公開日の告知文を考える', 3),
      t('d6', '返事待ち: コラボ相手からの音源', -2)
    ],
    updatedAt: Date.now()
  }
}

/** The task file: the configured one, or (checks only) the one in YUTA_VAULT, which `yuta` uses too. */
function taskFile(): string {
  return process.env.YUTA_VAULT ? join(process.env.YUTA_VAULT, 'admin', 'タスク.md') : getConfig().tasks.vaultTaskFile
}

export function readTasks(): TaskList {
  if (process.env.YD_DEMO_TASKS) return demoTasks()
  const file = taskFile()
  if (!existsSync(file)) return { items: [], updatedAt: Date.now(), error: `見つからない: ${file}` }
  try {
    const all = parseTasks(readFileSync(file, 'utf8'))
    const ahead = getConfig().tasks.daysAhead
    const items = all
      .filter((t) => t.due !== null && (t.overdueDays ?? 0) >= -ahead)
      .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0))
    return { items, updatedAt: Date.now() }
  } catch (e) {
    return { items: [], updatedAt: Date.now(), error: String(e) }
  }
}

let watched = ''
export function startTaskWatcher(): void {
  const file = taskFile()
  if (watched) unwatchFile(watched)
  watched = file
  if (existsSync(file)) watchFile(file, { interval: 3000 }, () => taskEvents.emit('changed', readTasks()))
  // Day rollover: re-evaluate overdue flags.
  setInterval(() => taskEvents.emit('changed', readTasks()), 10 * 60 * 1000)
}

/** Tasks are written through the `yuta` CLI so the Vault file keeps its canonical format. */
function yutaExe(): string {
  const local = join(homedir(), '.local', 'bin', 'yuta.exe')
  return existsSync(local) ? local : 'yuta'
}

type YutaResult = { ok: boolean; message: string; result?: Record<string, unknown> }

/** Runs `yuta task …` as the owner (--by user). No shell: titles hold spaces and Japanese, so each
 *  argument is passed as one argv entry. YD_TASK_DRYRUN=1 adds --dry-run (checks only). */
function runYuta(args: string[]): Promise<YutaResult> {
  return new Promise((resolve) => {
    const full = ['task', ...args, '--json', '--by', 'user', ...(process.env.YD_TASK_DRYRUN ? ['--dry-run'] : [])]
    execFile(yutaExe(), full, { windowsHide: true, timeout: 30000 }, (err, out, errOut) => {
      let parsed: { ok?: boolean; error?: string; result?: Record<string, unknown> } | null = null
      try { parsed = JSON.parse(String(out)) } catch { /* not JSON */ }
      if (err || (parsed && parsed.ok === false)) {
        return resolve({ ok: false, message: (parsed?.error || String(errOut) || String(out) || String(err)).trim().slice(0, 300) })
      }
      resolve({ ok: true, message: String(out).trim().slice(0, 300), result: parsed?.result })
    })
  })
}

export function markTaskDone(title: string): Promise<YutaResult> {
  return runYuta(['done', title])
}

export type TaskDraft = { content: string; due: string | null; note?: string }

export function addTask(d: TaskDraft): Promise<YutaResult> {
  return runYuta(['add', d.content, ...(d.due ? ['--due', d.due] : []), ...(d.note ? ['--note', d.note] : [])])
}

export function editTask(title: string, d: TaskDraft): Promise<YutaResult> {
  return runYuta(['edit', title, '--content', d.content, ...(d.due ? ['--due', d.due] : ['--no-due'])])
}

/** To the Vault's trash (ゴミ箱/タスク.md); nothing is erased. */
export function deleteTask(title: string): Promise<YutaResult> {
  return runYuta(['delete', title])
}

export async function listTrash(): Promise<{ content: string; due: string | null; deleted: string; days_left: number }[]> {
  const r = await runYuta(['trash'])
  return (r.ok && Array.isArray(r.result?.tasks) ? r.result!.tasks : []) as { content: string; due: string | null; deleted: string; days_left: number }[]
}

export function restoreTask(content: string): Promise<YutaResult> {
  return runYuta(['restore', content])
}
