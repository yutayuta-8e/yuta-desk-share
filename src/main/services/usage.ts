// Reads the plan usage of the user's own AI tools, only through what those tools officially hand
// out. yuta-desk never reads their login files and never talks to their servers itself
// (2026-10-27: the earlier direct requests were outside what the providers intend).
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { app, powerMonitor } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { UsageData, UsageService, UsageWindow } from '../../shared/types'
import { bootLog } from '../boot'
import { getConfig } from '../config'

function win(percent: number | null | undefined, resetsAt: string | number | null | undefined, label: string): UsageWindow | null {
  if (percent === null || percent === undefined || Number.isNaN(Number(percent))) return null
  let reset: string | null = null
  if (typeof resetsAt === 'number') reset = new Date(resetsAt * (resetsAt < 1e12 ? 1000 : 1)).toISOString()
  else if (typeof resetsAt === 'string') reset = resetsAt
  return { percent: Math.max(0, Math.min(100, Number(percent))), resetsAt: reset, label }
}

// ---- Claude Code ----
// 1. Preferred: the numbers Claude Code hands its status line while the terminal `claude` runs
//    (scripts/claude-statusline.js saves them to <userData>/claude-rate-limits.json).
// 2. Otherwise run Claude Code's own `/usage` in print mode. It is a local command: no model call,
//    no tokens. At most every 15 minutes, one run at a time, and the last numbers are kept on disk
//    and shown meanwhile, so app restarts do not start new runs. Skipped while nobody is at the PC
//    (no keyboard or mouse for 10 minutes, or the screen is locked); main asks again on unlock.
const STATUSLINE_FILE = () => join(app.getPath('userData'), 'claude-rate-limits.json')
const CACHE_FILE = () => join(app.getPath('userData'), 'usage-cache.json')
const STATUSLINE_FRESH_MS = 30 * 60 * 1000
const MIN_RUN_GAP_MS = 15 * 60 * 1000
const AWAY_AFTER_S = 10 * 60

type ClaudeCache = { fetchedAt: number; service: UsageService | null }
function readCache(): ClaudeCache {
  try {
    const c = JSON.parse(readFileSync(CACHE_FILE(), 'utf8')).claude
    return { fetchedAt: Number(c?.fetchedAt) || 0, service: c?.service ?? null }
  } catch { return { fetchedAt: 0, service: null } }
}
function writeCache(c: ClaudeCache): void {
  try { writeFileSync(CACHE_FILE(), JSON.stringify({ claude: c })) } catch (e) { bootLog(`usage cache write failed ${String(e).slice(0, 80)}`) }
}

type StatusWin = { used_percentage?: number; resets_at?: number | string } | null
function fromStatusLine(now: number): UsageService | null {
  try {
    const j = JSON.parse(readFileSync(STATUSLINE_FILE(), 'utf8')) as { captured_at?: number; five_hour?: StatusWin; seven_day?: StatusWin }
    if (!j.captured_at || now - j.captured_at > STATUSLINE_FRESH_MS) return null
    const mk = (w: StatusWin, label: string) => {
      if (!w) return null
      const reset = typeof w.resets_at === 'number' ? w.resets_at : typeof w.resets_at === 'string' ? Date.parse(w.resets_at) / 1000 : null
      if (reset && reset * 1000 < now) return null // that window has rolled over since the capture
      return win(w.used_percentage, reset ?? null, label)
    }
    const fiveHour = mk(j.five_hour ?? null, '5 時間'), sevenDay = mk(j.seven_day ?? null, '1 週間')
    if (!fiveHour && !sevenDay) return null
    return { name: 'Claude Code', status: 'ok', fiveHour, sevenDay, asOf: j.captured_at }
  } catch { return null }
}

let claudeInFlight: Promise<UsageService> | null = null
async function claude(): Promise<UsageService> {
  const now = Date.now()
  const fromLine = fromStatusLine(now)
  if (fromLine) return fromLine
  const cache = readCache()
  if (cache.service && now - cache.fetchedAt < MIN_RUN_GAP_MS) return { ...cache.service, asOf: cache.fetchedAt }
  const presence = powerMonitor.getSystemIdleState(AWAY_AFTER_S)
  if (presence === 'idle' || presence === 'locked') {
    if (cache.service) return { ...cache.service, asOf: cache.fetchedAt }
    return { name: 'Claude Code', status: 'error', fiveHour: null, sevenDay: null, message: '離席中。戻ったら取得します' }
  }
  if (!claudeInFlight) claudeInFlight = claudeUsageCommand(cache).finally(() => { claudeInFlight = null })
  return claudeInFlight
}

function claudeExe(): string {
  const local = join(homedir(), '.local', 'bin', 'claude.exe')
  return existsSync(local) ? local : 'claude'
}

type UsageRow = { kind?: string; percent?: number; resets_at?: string | null }

/** Runs `claude -p /usage` and reads the structured report Claude Code prints with it
 *  (`usage_report`, documented in the Agent SDK reference as experimental). No shell, so the
 *  slash is passed as is. Session files are not kept and MCP servers are not started. */
function claudeUsageCommand(cache: ClaudeCache): Promise<UsageService> {
  const name = 'Claude Code'
  const cached = cache.service ? { ...cache.service, asOf: cache.fetchedAt } : null
  const args = ['-p', '/usage', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--no-session-persistence']
  return new Promise((resolve) => {
    const child = execFile(claudeExe(), args, { windowsHide: true, timeout: 60000, cwd: app.getPath('userData'), maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      const now = Date.now()
      let rows: UsageRow[] | null = null
      for (const line of String(out).split('\n')) {
        if (!line.includes('usage_report')) continue
        try { rows = JSON.parse(line)?.usage_report?.rate_limits?.limits ?? null } catch { /* not this line */ }
        if (rows) break
      }
      const session = rows?.find((r) => r.kind === 'session'), weekly = rows?.find((r) => r.kind === 'weekly_all')
      if (!session && !weekly) {
        const why = (err as NodeJS.ErrnoException | null)?.code === 'ENOENT' ? 'claude が見つからない' : 'Claude Code から取れなかった'
        bootLog(`usage claude /usage failed: ${why}${err ? ` (${String(err.message).slice(0, 80)})` : ''}`)
        writeCache({ ...cache, fetchedAt: now })
        return resolve(cached ?? { name, status: 'error', fiveHour: null, sevenDay: null, message: why })
      }
      const service: UsageService = {
        name, status: 'ok',
        fiveHour: session ? win(session.percent, session.resets_at, '5 時間') : null,
        sevenDay: weekly ? win(weekly.percent, weekly.resets_at, '1 週間') : null
      }
      writeCache({ fetchedAt: now, service })
      bootLog('usage claude /usage ok')
      resolve({ ...service, asOf: now })
    })
    child.stdin?.end() // nothing to send; otherwise Claude Code waits for input first
  })
}

function grok(): UsageService {
  return { name: 'Grok Bot', status: 'unsupported', fiveHour: null, sevenDay: null, message: '公開 API なし（未対応）' }
}

export async function readUsage(): Promise<UsageData> {
  // services the owner hid are not asked at all
  const hidden = new Set(getConfig().usage.hidden ?? [])
  const skip = (name: string): UsageService => ({ name, status: 'unsupported', fiveHour: null, sevenDay: null, message: '非表示' })
  const services = await Promise.all([
    hidden.has('Claude Code') ? skip('Claude Code') : claude(),
    Promise.resolve(grok())
  ])
  return { services, updatedAt: Date.now() }
}
