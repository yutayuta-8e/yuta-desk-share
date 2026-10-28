// The card beside the calendar (design 2, 2026-10-28): one event's details, opened from the list under
// the month, or the window for adding / editing an event; and the subscriptions, opened from the star
// at the top right of the calendar. Like the task window it is an ordinary top-level window, because
// widgets on the desktop may not get the keyboard. It is see-through.
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getWindow, boundsOf } from './windows'
import { SUBS_CARD_STATE, type Bounds, type CalCardRequest, type CalCardView } from '../shared/types'

type View = CalCardView
const GAP = 14 // between the card and the calendar; the detail card's line to its row crosses it
const WIDTH: Record<View, number> = { detail: 350, form: 400, subs: 372, subform: 400 }
// the lists go away when the owner looks elsewhere; the windows for typing stay until closed
const closesOnBlur = (v: View) => v === 'detail' || v === 'subs'

let card: BrowserWindow | null = null
let anchor = 0 // screen y of the middle of the row the detail card belongs to
let view: View = 'detail'
let shown = false

function calendarBounds(): Bounds {
  const c = getWindow('calendar')
  if (c && !c.isDestroyed()) return boundsOf(c)
  const a = screen.getPrimaryDisplay().workArea
  return { x: a.x + a.width - 360, y: a.y + a.height - 500, width: 340, height: 490 }
}

/** The calendar draws its half of the line to the card on the row whose event is open. */
function tellCalendar(eventId: string | null): void {
  const c = getWindow('calendar')
  if (c && !c.isDestroyed()) c.webContents.send('cal-card-state', eventId)
}

export function openCalCard(r: CalCardRequest): void {
  closeCalCard()
  view = r.mode === 'detail' ? 'detail' : r.mode === 'subs' ? 'subs' : 'form'
  shown = false
  if (r.mode === 'detail') anchor = calendarBounds().y + r.anchorY
  card = new BrowserWindow({
    width: WIDTH[view] + GAP, height: 200, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, title: 'yuta-desk 予定',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  const q = new URLSearchParams({ widget: 'calcard', mode: r.mode })
  if (r.mode === 'detail') q.set('id', r.eventId)
  else if (r.mode === 'add') q.set('date', r.date)
  if (process.env.ELECTRON_RENDERER_URL) void card.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${q}`)
  else void card.loadFile(join(__dirname, '../renderer/index.html'), { search: q.toString() })
  const me = card
  me.on('blur', () => { if (card === me && closesOnBlur(view)) closeCalCard() })
  me.on('closed', () => { if (card === me) { card = null; tellCalendar(null) } })
  tellCalendar(r.mode === 'detail' ? r.eventId : r.mode === 'subs' ? SUBS_CARD_STATE : null)
}

/**
 * The card's height is known only once it has drawn, so the renderer reports it (again whenever it
 * changes, and when the detail card turns into the edit window). Details sit level with their row;
 * the add / edit window stands on the calendar's bottom edge; the subscriptions hang from its top
 * edge, beside the star they open from. All go left of the calendar.
 */
export function placeCalCard(height: number, v: View): void {
  if (!card || card.isDestroyed()) return
  if (v !== view) { view = v; if (v === 'form') tellCalendar(null) }
  const area = screen.getPrimaryDisplay().workArea
  const cal = calendarBounds()
  const h = Math.min(Math.ceil(height), area.height)
  const w = WIDTH[view] + GAP
  let x = cal.x - w
  let y: number
  let tether: number | null = null
  if (view === 'detail') {
    y = Math.min(Math.max(area.y, Math.round(anchor - 46)), area.y + area.height - h)
    tether = anchor - y
  } else if (view === 'subs' || view === 'subform') {
    y = Math.max(area.y, Math.min(cal.y, area.y + area.height - h))
  } else {
    y = Math.max(area.y, Math.min(cal.y + cal.height, area.y + area.height) - h)
  }
  if (x < area.x) { x = cal.x + cal.width; tether = null } // no room on the left: the right side, without the line
  card.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h })
  card.webContents.send('cal-card-tether', tether)
  if (!shown) { shown = true; card.show(); card.focus() }
}

export function closeCalCard(): void {
  if (card && !card.isDestroyed()) card.close()
  card = null
}
