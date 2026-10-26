// Reads rate-limit usage for the user's own AI subscriptions using the credentials those
// tools already keep on this PC. Token values never leave the main process and are never logged.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { UsageData, UsageService, UsageWindow } from '../../shared/types'

const CLAUDE_CRED = join(homedir(), '.claude', '.credentials.json')
const CODEX_AUTH = join(homedir(), '.codex', 'auth.json')

function windowLabel(seconds: number | undefined, fallback: string): string {
  if (!seconds) return fallback
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 時間`
  if (seconds < 86400 * 10) return `${Math.round(seconds / 86400)} 日`
  return `${Math.round(seconds / 86400)} 日`
}

function win(percent: number | null | undefined, resetsAt: string | number | null | undefined, label: string): UsageWindow | null {
  if (percent === null || percent === undefined || Number.isNaN(Number(percent))) return null
  let reset: string | null = null
  if (typeof resetsAt === 'number') reset = new Date(resetsAt * (resetsAt < 1e12 ? 1000 : 1)).toISOString()
  else if (typeof resetsAt === 'string') reset = resetsAt
  return { percent: Math.max(0, Math.min(100, Number(percent))), resetsAt: reset, label }
}

async function claude(): Promise<UsageService> {
  const name = 'Claude Code'
  if (!existsSync(CLAUDE_CRED)) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: '未ログイン' }
  try {
    const j = JSON.parse(readFileSync(CLAUDE_CRED, 'utf8'))
    const tok: string | undefined = j?.claudeAiOauth?.accessToken
    if (!tok) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: '未ログイン' }
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${tok}`, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' }
    })
    if (r.status === 401 || r.status === 403) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: 'claude で再ログインが必要' }
    if (!r.ok) return { name, status: 'error', fiveHour: null, sevenDay: null, message: `HTTP ${r.status}` }
    const u = await r.json() as Record<string, { utilization?: number; resets_at?: string } | null>
    const five = u.five_hour ?? null
    const seven = u.seven_day ?? null
    return {
      name, status: 'ok',
      fiveHour: five ? win(five.utilization, five.resets_at, '5 時間') : null,
      sevenDay: seven ? win(seven.utilization, seven.resets_at, '1 週間') : null
    }
  } catch (e) {
    return { name, status: 'error', fiveHour: null, sevenDay: null, message: String(e).slice(0, 120) }
  }
}

// Codex CLI's public OAuth client id; used only to refresh the user's own token in memory.
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
let codexRefreshed: { token: string; at: number } | null = null

async function codexRefresh(refreshToken: string): Promise<string | null> {
  if (codexRefreshed && Date.now() - codexRefreshed.at < 50 * 60 * 1000) return codexRefreshed.token
  try {
    const r = await fetch('https://auth.openai.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CODEX_CLIENT_ID })
    })
    if (!r.ok) return null
    const j = await r.json() as { access_token?: string }
    if (!j.access_token) return null
    codexRefreshed = { token: j.access_token, at: Date.now() }
    return j.access_token
  } catch { return null }
}

async function codexFetchUsage(tok: string, acct: string | undefined): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${tok}`, Accept: 'application/json' }
  if (acct) headers['ChatGPT-Account-Id'] = acct
  return fetch('https://chatgpt.com/backend-api/wham/usage', { headers })
}

async function codex(): Promise<UsageService> {
  const name = 'Codex'
  if (!existsSync(CODEX_AUTH)) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: '未ログイン' }
  try {
    const j = JSON.parse(readFileSync(CODEX_AUTH, 'utf8'))
    const tok: string | undefined = codexRefreshed?.token ?? j?.tokens?.access_token
    const acct: string | undefined = j?.tokens?.account_id
    if (!tok) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: '未ログイン' }
    let r = await codexFetchUsage(tok, acct)
    if ((r.status === 401 || r.status === 403) && j?.tokens?.refresh_token) {
      const fresh = await codexRefresh(j.tokens.refresh_token)
      if (fresh) r = await codexFetchUsage(fresh, acct)
    }
    if (r.status === 401 || r.status === 403) return { name, status: 'unauth', fiveHour: null, sevenDay: null, message: 'codex で再ログインが必要' }
    if (!r.ok) return { name, status: 'error', fiveHour: null, sevenDay: null, message: `HTTP ${r.status}` }
    const u = await r.json() as { rate_limit?: { primary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number }; secondary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number } } }
    const p = u.rate_limit?.primary_window ?? null
    const s = u.rate_limit?.secondary_window ?? null
    // primary is usually the 5h window, secondary the weekly one; sort by window length to be safe.
    const wins = [p, s].filter(Boolean) as NonNullable<typeof p>[]
    wins.sort((a, b) => (a.limit_window_seconds ?? 0) - (b.limit_window_seconds ?? 0))
    const short = wins.find((x) => (x.limit_window_seconds ?? 0) <= 6 * 3600) ?? null
    const long = wins.find((x) => (x.limit_window_seconds ?? 0) > 6 * 3600) ?? null
    return {
      name, status: 'ok',
      fiveHour: short ? win(short.used_percent, short.reset_at, windowLabel(short.limit_window_seconds, '5 時間')) : null,
      sevenDay: long ? win(long.used_percent, long.reset_at, windowLabel(long.limit_window_seconds, '1 週間')) : null
    }
  } catch (e) {
    return { name, status: 'error', fiveHour: null, sevenDay: null, message: String(e).slice(0, 120) }
  }
}

function grok(): UsageService {
  return { name: 'Grok Bot', status: 'unsupported', fiveHour: null, sevenDay: null, message: '公開 API なし（未対応）' }
}

export async function readUsage(): Promise<UsageData> {
  const services = await Promise.all([claude(), codex(), Promise.resolve(grok())])
  return { services, updatedAt: Date.now() }
}
