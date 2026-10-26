// Google Calendar, read-only. The user creates an OAuth "Desktop app" client in Google Cloud and
// drops the downloaded JSON at <userData>/google-credentials.json (see docs/GOOGLE-OAUTH.md).
// Tokens are stored at <userData>/google-token.json, outside the Vault.
import { app, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import { getConfig } from '../config'
import type { CalendarData, CalendarEvent } from '../../shared/types'

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

function credPath(): string { return join(app.getPath('userData'), 'google-credentials.json') }
function tokenPath(): string { return join(app.getPath('userData'), 'google-token.json') }

export function hasCredentials(): boolean { return existsSync(credPath()) }
export function isConnected(): boolean { return existsSync(tokenPath()) }

function makeClient(redirect?: string): OAuth2Client | null {
  if (!hasCredentials()) return null
  const raw = JSON.parse(readFileSync(credPath(), 'utf8'))
  const c = raw.installed ?? raw.web
  if (!c) return null
  const client = new OAuth2Client({ clientId: c.client_id, clientSecret: c.client_secret, redirectUri: redirect })
  if (isConnected()) {
    try { client.setCredentials(JSON.parse(readFileSync(tokenPath(), 'utf8'))) } catch { /* ignore */ }
  }
  client.on('tokens', (t) => {
    try {
      const prev = isConnected() ? JSON.parse(readFileSync(tokenPath(), 'utf8')) : {}
      writeFileSync(tokenPath(), JSON.stringify({ ...prev, ...t }, null, 2))
    } catch { /* ignore */ }
  })
  return client
}

/** Opens the browser for consent; resolves when the loopback redirect receives the code. */
export function connectGoogle(): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    if (!hasCredentials()) return resolve({ ok: false, message: `google-credentials.json がない: ${credPath()}` })
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return resolve({ ok: false, message: 'ポートを開けない' })
      const redirect = `http://127.0.0.1:${addr.port}/oauth`
      const client = makeClient(redirect)
      if (!client) { server.close(); return resolve({ ok: false, message: 'credentials の形式が違う' }) }
      const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
      server.on('request', async (req, res) => {
        const u = new URL(req.url ?? '/', redirect)
        if (u.pathname !== '/oauth') { res.statusCode = 404; return res.end() }
        const code = u.searchParams.get('code')
        res.setHeader('content-type', 'text/html; charset=utf-8')
        if (!code) { res.end('<p>失敗。ウィンドウを閉じてください。</p>'); server.close(); return resolve({ ok: false, message: u.searchParams.get('error') ?? 'code なし' }) }
        try {
          const { tokens } = await client.getToken(code)
          writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2))
          res.end('<p style="font-family:sans-serif">yuta-desk と Google カレンダーを接続しました。このタブは閉じて OK。</p>')
          server.close()
          resolve({ ok: true, message: '接続した' })
        } catch (e) {
          res.end('<p>トークン取得に失敗</p>')
          server.close()
          resolve({ ok: false, message: String(e).slice(0, 200) })
        }
      })
      void shell.openExternal(url)
      setTimeout(() => { server.close(); resolve({ ok: false, message: 'タイムアウト（5分）' }) }, 5 * 60 * 1000)
    })
  })
}

type GCalList = { items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string }[] }
type GEvents = { items?: { id: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; status?: string }[] }

export async function readCalendar(rangeStart: Date, rangeEnd: Date): Promise<CalendarData> {
  const base: CalendarData = { connected: isConnected(), calendars: [], events: [], updatedAt: Date.now() }
  if (!isConnected()) return { ...base, error: hasCredentials() ? '未接続' : 'credentials 未設置' }
  const client = makeClient()
  if (!client) return { ...base, error: 'credentials が読めない' }
  try {
    const hidden = new Set(getConfig().calendar.hiddenIds)
    const list = (await client.request<GCalList>({ url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList' })).data
    const cals = (list.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor ?? '#7aa2ff', hidden: hidden.has(c.id) }))
    const events: CalendarEvent[] = []
    await Promise.all(cals.filter((c) => !c.hidden).map(async (c) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events`)
      url.searchParams.set('timeMin', rangeStart.toISOString())
      url.searchParams.set('timeMax', rangeEnd.toISOString())
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '250')
      const r = (await client.request<GEvents>({ url: url.toString() })).data
      for (const e of r.items ?? []) {
        if (e.status === 'cancelled') continue
        const allDay = !!e.start?.date
        events.push({
          id: `${c.id}:${e.id}`, calendarId: c.id, calendarName: c.name, color: c.color,
          title: e.summary ?? '(無題)', allDay,
          start: e.start?.dateTime ?? e.start?.date ?? '', end: e.end?.dateTime ?? e.end?.date ?? ''
        })
      }
    }))
    events.sort((a, b) => a.start.localeCompare(b.start))
    return { connected: true, calendars: cals, events, updatedAt: Date.now() }
  } catch (e) {
    const msg = String(e)
    return { ...base, error: /invalid_grant|401/.test(msg) ? '再接続が必要' : msg.slice(0, 200) }
  }
}
