// The household accounts' card (2026-10-29): opened from the money widget, beside it. Like the calendar's
// card it is an ordinary top-level window, because widgets on the desktop may not get the keyboard, and
// it is see-through. The month view goes away when the owner looks elsewhere; the form stays until closed.
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getWindow, boundsOf } from './windows'
import type { Bounds, MoneyCardView } from '../shared/types'

const GAP = 14 // between the widget and the card
const WIDTH = 410

let card: BrowserWindow | null = null
let view: MoneyCardView = 'month'
let shown = false
let closedAt = 0 // when the card last went away (looking elsewhere closes it a moment before a press arrives)

function widgetBounds(): Bounds {
  const w = getWindow('money')
  if (w && !w.isDestroyed()) return boundsOf(w)
  const a = screen.getPrimaryDisplay().workArea
  return { x: a.x + 40, y: a.y + 22, width: 440, height: 236 }
}

/** The widget shows its lines brighter while its card is open. */
function tellWidget(open: boolean): void {
  const w = getWindow('money')
  if (w && !w.isDestroyed()) w.webContents.send('money-card-state', open)
}

/** month / day: open at that month, the rows scrolled to that day (a day pressed in the widget's sky). */
export function openMoneyCard(month?: string, day?: number): void {
  if (card && !card.isDestroyed()) {
    if (month) card.webContents.send('money-goto', { month, day: day ?? null })
    card.focus()
    return
  }
  view = 'month'
  shown = false
  card = new BrowserWindow({
    width: WIDTH, height: 200, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, title: 'yuta-desk 家計簿',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  const q = new URLSearchParams({ widget: 'moneycard', ...(month ? { month } : {}), ...(day ? { day: String(day) } : {}) })
  if (process.env.ELECTRON_RENDERER_URL) void card.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${q}`)
  else void card.loadFile(join(__dirname, '../renderer/index.html'), { search: q.toString() })
  const me = card
  me.on('blur', () => { if (card === me && view === 'month') closeMoneyCard() })
  me.on('closed', () => { closedAt = Date.now(); if (card === me) { card = null; tellWidget(false) } })
  tellWidget(true)
}

/**
 * The card's height is known only once it has drawn, so the renderer reports it (again whenever it
 * changes). It hangs beside the widget from the widget's top edge, on the right (the widget lives at
 * the screen's left edge), or on the left when there is no room.
 */
export function placeMoneyCard(height: number, v: MoneyCardView): void {
  if (!card || card.isDestroyed()) return
  view = v
  const area = screen.getPrimaryDisplay().workArea
  const wb = widgetBounds()
  const h = Math.min(Math.ceil(height), area.height)
  let x = wb.x + wb.width + GAP
  if (x + WIDTH > area.x + area.width) x = wb.x - GAP - WIDTH
  const y = Math.max(area.y, Math.min(wb.y, area.y + area.height - h))
  card.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: h })
  // the glass draws the wallpaper behind it at this place (light/Refraction.tsx)
  card.webContents.send('bounds', boundsOf(card))
  if (!shown) { shown = true; card.show(); card.focus() }
}

/**
 * A press on the widget, or `--money`, opens the card, or closes it when it is open. Pressing anywhere
 * else closes the card first (it goes away when the owner looks elsewhere), so a press that comes just
 * after it went away is taken as the closing one. `--money` comes through a new process, so it waits longer.
 */
export function toggleMoneyCard(within = 600): void {
  if (card && !card.isDestroyed()) closeMoneyCard()
  else if (Date.now() - closedAt > within) openMoneyCard()
}

export function closeMoneyCard(): void {
  if (card && !card.isDestroyed()) card.close()
  card = null
}
