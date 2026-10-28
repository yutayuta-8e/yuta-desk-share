// Google Calendar: read, and add / change / delete events. The user creates an OAuth "Desktop app"
// client in Google Cloud and drops the downloaded JSON at <userData>/google-credentials.json
// (see docs/GOOGLE-OAUTH.md).
// Tokens are stored at <userData>/google-token.json, outside the Vault.
import { app, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import { getConfig } from '../config'
import { readMarks } from './calendarMarks'
import type { CalendarData, CalendarEvent, EventDetail, EventDraft, EventRepeat } from '../../shared/types'

// reading every calendar, and adding / changing / deleting events from the calendar's cards (2026-10-28)
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events']

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

type GCal = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; accessRole?: string; primary?: boolean; defaultReminders?: { method: string; minutes: number }[] }
type GCalList = { items?: GCal[] }
type GTime = { date?: string; dateTime?: string; timeZone?: string }
type GEvent = {
  id: string; summary?: string; location?: string; description?: string; start?: GTime; end?: GTime; status?: string
  recurringEventId?: string; recurrence?: string[]; htmlLink?: string
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] }
}
type GEvents = { items?: GEvent[] }
type Result = { ok: boolean; message: string }

const API = 'https://www.googleapis.com/calendar/v3'
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo'
const enc = encodeURIComponent
const pad = (v: number) => String(v).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const writable = (role?: string) => role === 'owner' || role === 'writer'

function toEvent(c: { id: string; name: string; color: string }, e: GEvent): CalendarEvent {
  return {
    id: `${c.id}:${e.id}`, calendarId: c.id, calendarName: c.name, color: c.color,
    title: e.summary ?? '(無題)', allDay: !!e.start?.date,
    start: e.start?.dateTime ?? e.start?.date ?? '', end: e.end?.dateTime ?? e.end?.date ?? '',
    location: e.location || undefined, recurring: !!e.recurringEventId || !!e.recurrence?.length
  }
}

/** "calendarId:eventId" -> its two parts (event ids never hold ':') */
function splitId(id: string): [string, string] {
  const i = id.lastIndexOf(':')
  return [id.slice(0, i), id.slice(i + 1)]
}

/** RRULE -> the few repeats the add window offers; anything finer (every 2 weeks, given days, an end) is 'other' */
function repeatOf(rules?: string[]): EventRepeat {
  const r = rules?.find((x) => x.startsWith('RRULE:'))
  if (!r) return 'none'
  if (/INTERVAL=(?!1(;|$))|COUNT=|UNTIL=|BYDAY=[^;]*,/.test(r)) return 'other'
  const f = /FREQ=(\w+)/.exec(r)?.[1]
  return f === 'DAILY' ? 'daily' : f === 'WEEKLY' ? 'weekly' : f === 'MONTHLY' ? 'monthly' : f === 'YEARLY' ? 'yearly' : 'other'
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return dayOf(d)
}

function checkDraft(d: EventDraft): string | null {
  if (!d.title.trim()) return '予定の名前を入れてください'
  if (!/^\d{4}-\d\d-\d\d$/.test(d.startDate) || !/^\d{4}-\d\d-\d\d$/.test(d.endDate)) return '日付を入れてください'
  const s = d.allDay ? d.startDate : `${d.startDate}T${d.startTime}`
  const e = d.allDay ? d.endDate : `${d.endDate}T${d.endTime}`
  if (!d.allDay && (!/^\d\d:\d\d$/.test(d.startTime) || !/^\d\d:\d\d$/.test(d.endTime))) return '時間を入れてください'
  if (d.allDay ? e < s : e <= s) return '終わりが始まりより前になっています'
  return null
}

function bodyOf(d: EventDraft, isNew: boolean): Record<string, unknown> {
  const time = d.allDay
    ? { start: { date: d.startDate }, end: { date: nextDay(d.endDate) } }
    : { start: { dateTime: `${d.startDate}T${d.startTime}:00`, timeZone: ZONE }, end: { dateTime: `${d.endDate}T${d.endTime}:00`, timeZone: ZONE } }
  return {
    summary: d.title.trim(), location: d.location.trim(), description: d.description.trim(), ...time,
    reminders: { useDefault: false, overrides: d.reminder === null ? [] : [{ method: 'popup', minutes: d.reminder }] },
    // a repeat is set when adding; editing one day of a repeating event changes that day only
    ...(isNew && d.repeat !== 'none' ? { recurrence: [`RRULE:FREQ=${d.repeat.toUpperCase()}`] } : {})
  }
}

function writeError(e: unknown): string {
  const msg = String(e)
  if (/insufficient|forbidden|403/i.test(msg)) return '書き込みの許可がありません。カレンダーの右クリックの「Google に再接続」で許可してください'
  if (/invalid_grant|401/.test(msg)) return 'Google への再接続が必要です（カレンダーの右クリックから）'
  return msg.slice(0, 160)
}

// ---- samples for screenshots and checks before Google is connected (YD_DEMO_CALENDAR=1) ----
// kept in memory, so adding, editing and deleting can be tried without Google
let demo: EventDetail[] | null = null
let demoNext = 0

function demoStore(): EventDetail[] {
  if (demo) return demo
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d }
  const at = (n: number, h: number) => { const d = day(n); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const ev = (title: string, start: string, end: string, allDay: boolean, more: Partial<EventDetail> = {}): EventDetail => ({
    id: `demo:d${++demoNext}`, calendarId: 'demo', calendarName: 'マイカレンダー', color: '#d6bee8', title, start, end, allDay,
    reminders: [10], repeat: 'none', writable: true, htmlLink: 'https://calendar.google.com/', ...more
  })
  demo = [
    ev('MV の打ち合わせ', at(1, 14), at(1, 15), false, { location: 'オンライン（Google Meet）', description: '絵コンテ v3 を見せる。\n尺は 3:40 で決めたい', reminders: [30] }),
    ev('配信を見る', at(1, 20), at(1, 21), false),
    ev('撮影合宿', dayOf(day(2)), dayOf(day(5)), true, { location: '山中湖', reminders: [] }),
    ev('美容院', at(-1, 10), at(-1, 11), false),
    ev('キャンペーン', dayOf(day(-9)), dayOf(day(-4)), true, { reminders: [] }),
    ev('定例', at(-14, 11), at(-14, 12), false, { repeat: 'weekly', recurring: true }),
    ev('打ち合わせ', at(-12, 13), at(-12, 14), false), ev('撮影', at(-12, 16), at(-12, 18), false), ev('飲み会', at(-12, 19), at(-12, 21), false),
    ev('スタジオ', at(8, 19), at(8, 21), false)
  ]
  return demo
}

function plain(e: EventDetail): CalendarEvent {
  return { id: e.id, calendarId: e.calendarId, calendarName: e.calendarName, color: e.color, title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, recurring: e.recurring }
}

function demoCalendar(): CalendarData {
  return {
    connected: true, calendars: [{ id: 'demo', name: 'マイカレンダー', color: '#d6bee8', hidden: false, writable: true, primary: true }], updatedAt: Date.now(),
    events: demoStore().map(plain).sort((a, b) => a.start.localeCompare(b.start)), marks: readMarks()
  }
}

function demoSave(d: EventDraft, id?: string): void {
  const store = demoStore()
  const old = id ? store.find((e) => e.id === id) : undefined
  const next: EventDetail = {
    id: old?.id ?? `demo:d${++demoNext}`, calendarId: 'demo', calendarName: 'マイカレンダー', color: '#d6bee8', title: d.title.trim(), allDay: d.allDay,
    start: d.allDay ? d.startDate : new Date(`${d.startDate}T${d.startTime}:00`).toISOString(),
    end: d.allDay ? nextDay(d.endDate) : new Date(`${d.endDate}T${d.endTime}:00`).toISOString(),
    location: d.location.trim() || undefined, description: d.description.trim() || undefined,
    reminders: d.reminder === null ? [] : [d.reminder], repeat: old ? old.repeat : d.repeat, recurring: old ? old.recurring : d.repeat !== 'none',
    writable: true, htmlLink: 'https://calendar.google.com/'
  }
  if (old) store.splice(store.indexOf(old), 1, next)
  else store.push(next)
}

export async function readCalendar(rangeStart: Date, rangeEnd: Date): Promise<CalendarData> {
  if (process.env.YD_DEMO_CALENDAR) return demoCalendar()
  // renewals and money days come from the Vault and show without Google too
  const marks = readMarks()
  const base: CalendarData = { connected: isConnected(), calendars: [], events: [], marks, updatedAt: Date.now() }
  if (!isConnected()) return { ...base, error: hasCredentials() ? '未接続' : 'credentials 未設置' }
  const client = makeClient()
  if (!client) return { ...base, error: 'credentials が読めない' }
  try {
    const hidden = new Set(getConfig().calendar.hiddenIds)
    const list = (await client.request<GCalList>({ url: `${API}/users/me/calendarList` })).data
    const cals = (list.items ?? []).map((c) => ({
      id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor ?? '#7aa2ff', hidden: hidden.has(c.id),
      writable: writable(c.accessRole), primary: !!c.primary
    }))
    const events: CalendarEvent[] = []
    await Promise.all(cals.filter((c) => !c.hidden).map(async (c) => {
      const url = new URL(`${API}/calendars/${enc(c.id)}/events`)
      url.searchParams.set('timeMin', rangeStart.toISOString())
      url.searchParams.set('timeMax', rangeEnd.toISOString())
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '250')
      const r = (await client.request<GEvents>({ url: url.toString() })).data
      for (const e of r.items ?? []) if (e.status !== 'cancelled') events.push(toEvent(c, e))
    }))
    events.sort((a, b) => a.start.localeCompare(b.start))
    return { connected: true, calendars: cals, events, marks, updatedAt: Date.now() }
  } catch (e) {
    const msg = String(e)
    return { ...base, error: /invalid_grant|401/.test(msg) ? '再接続が必要' : msg.slice(0, 200) }
  }
}

/** One event in full, for its card: notes, reminders (the calendar's own when the event uses them) and repeat. */
export async function getEventDetail(id: string): Promise<EventDetail | null> {
  if (process.env.YD_DEMO_CALENDAR) return demoStore().find((e) => e.id === id) ?? null
  const client = isConnected() ? makeClient() : null
  if (!client) return null
  const [calId, evId] = splitId(id)
  try {
    const cal = (await client.request<GCal>({ url: `${API}/users/me/calendarList/${enc(calId)}` })).data
    const e = (await client.request<GEvent>({ url: `${API}/calendars/${enc(calId)}/events/${enc(evId)}` })).data
    // a day of a repeating event carries no rule itself; the series does
    const rules = e.recurringEventId
      ? (await client.request<GEvent>({ url: `${API}/calendars/${enc(calId)}/events/${enc(e.recurringEventId)}` })).data.recurrence
      : e.recurrence
    const c = { id: calId, name: cal.summaryOverride ?? cal.summary ?? calId, color: cal.backgroundColor ?? '#7aa2ff' }
    const r = e.reminders?.useDefault ? cal.defaultReminders : e.reminders?.overrides
    return {
      ...toEvent(c, e), description: e.description || undefined,
      reminders: (r ?? []).filter((x) => x.method === 'popup').map((x) => x.minutes),
      repeat: repeatOf(rules), htmlLink: e.htmlLink, writable: writable(cal.accessRole)
    }
  } catch { return null }
}

/** Adds an event (no id) or changes one. */
export async function saveEvent(d: EventDraft, id?: string): Promise<Result> {
  const bad = checkDraft(d)
  if (bad) return { ok: false, message: bad }
  if (process.env.YD_DEMO_CALENDAR) { demoSave(d, id); return { ok: true, message: id ? '保存した' : '追加した' } }
  if (!isConnected()) return { ok: false, message: 'Google カレンダーにつないでから使えます（カレンダーの右クリックから接続）' }
  const client = makeClient()
  if (!client) return { ok: false, message: 'credentials が読めない' }
  try {
    if (id) {
      const [calId, evId] = splitId(id)
      await client.request({ url: `${API}/calendars/${enc(calId)}/events/${enc(evId)}`, method: 'PATCH', data: bodyOf(d, false) })
    } else {
      await client.request({ url: `${API}/calendars/${enc(d.calendarId || 'primary')}/events`, method: 'POST', data: bodyOf(d, true) })
    }
    return { ok: true, message: id ? '保存した' : '追加した' }
  } catch (e) { return { ok: false, message: writeError(e) } }
}

/** Deletes one event (one day of a repeating event deletes that day only). Google keeps it in its trash for 30 days. */
export async function deleteEvent(id: string): Promise<Result> {
  if (process.env.YD_DEMO_CALENDAR) { demo = demoStore().filter((e) => e.id !== id); return { ok: true, message: '削除した' } }
  const client = isConnected() ? makeClient() : null
  if (!client) return { ok: false, message: 'Google カレンダーにつないでから使えます' }
  const [calId, evId] = splitId(id)
  try {
    await client.request({ url: `${API}/calendars/${enc(calId)}/events/${enc(evId)}`, method: 'DELETE' })
    return { ok: true, message: '削除した' }
  } catch (e) { return { ok: false, message: writeError(e) } }
}
