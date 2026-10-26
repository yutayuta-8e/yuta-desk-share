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

export function readTasks(): TaskList {
  const file = getConfig().tasks.vaultTaskFile
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
  const file = getConfig().tasks.vaultTaskFile
  if (watched) unwatchFile(watched)
  watched = file
  if (existsSync(file)) watchFile(file, { interval: 3000 }, () => taskEvents.emit('changed', readTasks()))
  // Day rollover: re-evaluate overdue flags.
  setInterval(() => taskEvents.emit('changed', readTasks()), 10 * 60 * 1000)
}

/** Marks a task done through the `yuta` CLI so the Vault file keeps its canonical format. */
function yutaExe(): string {
  const local = join(homedir(), '.local', 'bin', 'yuta.exe')
  return existsSync(local) ? local : 'yuta'
}

export function markTaskDone(title: string, dryRun = false): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const args = ['task', 'done', title, '--json', ...(dryRun ? ['--dry-run'] : [])]
    // No shell: the title contains spaces, parentheses and Japanese, so it must be passed as one argv entry.
    execFile(yutaExe(), args, { windowsHide: true, timeout: 30000 }, (err, out, errOut) => {
      if (err) return resolve({ ok: false, message: (errOut || out || String(err)).trim().slice(0, 300) })
      resolve({ ok: true, message: out.trim().slice(0, 300) })
    })
  })
}
