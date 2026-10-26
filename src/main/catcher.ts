// Input catcher: precision-touchpad gestures (and some other input) never reach windows that
// live inside the desktop. So while the cursor is over a widget we park an invisible, ordinary
// always-on-top window exactly over it; everything it receives is replayed into the widget.
import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'node:path'
import koffi from 'koffi'
import { windowAt, boundsOf } from './windows'
import type { Bounds } from '../shared/types'

const user32 = koffi.load('user32.dll')
koffi.alias('HWND2', 'uintptr_t')
const POINT2 = koffi.struct('POINT2', { x: 'int', y: 'int' })
const WindowFromPoint = user32.func('HWND2 __stdcall WindowFromPoint(POINT2 p)')
const GetAncestor = user32.func('HWND2 __stdcall GetAncestor(HWND2 h, uint32_t flags)')
const GetParent = user32.func('HWND2 __stdcall GetParent(HWND2 h)')
const GA_ROOT = 2
const dwm = koffi.load('dwmapi.dll')
const DwmSetWindowAttribute = dwm.func('int __stdcall DwmSetWindowAttribute(uintptr_t h, uint32_t attr, const void* v, uint32_t size)')
const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const DWMWA_BORDER_COLOR = 34
const DWMWCP_DONOTROUND = 1
const DWMWA_COLOR_NONE = 0xfffffffe

type CatcherEvent =
  | { type: 'mouseMove' | 'mouseDown' | 'mouseUp'; x: number; y: number; button: 'left' | 'right' | 'middle'; clickCount: number; modifiers: string[] }
  | { type: 'mouseWheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: string[] }

let catcher: BrowserWindow | null = null
let target: BrowserWindow | null = null
let shownBounds: Bounds | null = null
let timer: NodeJS.Timeout | null = null
let hwndOf = (w: BrowserWindow) => Number(w.getNativeWindowHandle().readBigUInt64LE(0))

function leaveTarget(): void {
  if (target && !target.isDestroyed()) target.webContents.sendInputEvent({ type: 'mouseLeave', x: -1, y: -1 })
  target = null
}

function park(): void {
  if (!catcher || catcher.isDestroyed()) return
  if (shownBounds) { catcher.setBounds({ x: -200, y: -200, width: 1, height: 1 }); shownBounds = null }
  leaveTarget()
}

function sameBounds(a: Bounds | null, b: Bounds): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** True when the OS hit-test at the cursor lands on one of our windows (widget or catcher). */
function osHitIsOurs(ptPhys: { x: number; y: number }, candidates: number[]): boolean {
  let h = Number(WindowFromPoint(ptPhys))
  for (let i = 0; i < 6 && h; i++) {
    if (candidates.includes(h)) return true
    h = Number(GetParent(h))
  }
  return false
}

function tick(): void {
  if (!catcher || catcher.isDestroyed()) return
  const cur = screen.getCursorScreenPoint()
  const hit = windowAt(cur.x, cur.y)
  if (!hit) return park()
  const scale = screen.getPrimaryDisplay().scaleFactor || 1
  const phys = { x: Math.round(cur.x * scale), y: Math.round(cur.y * scale) }
  if (!osHitIsOurs(phys, [hwndOf(hit.win), hwndOf(catcher)])) return park() // another app covers this spot
  if (target && target !== hit.win) leaveTarget()
  target = hit.win
  const b = { x: Math.round(hit.bounds.x), y: Math.round(hit.bounds.y), width: Math.round(hit.bounds.width), height: Math.round(hit.bounds.height) }
  if (!sameBounds(shownBounds, b)) { catcher.setBounds(b); shownBounds = b }
}

export function startCatcher(): void {
  catcher = new BrowserWindow({
    x: -200, y: -200, width: 1, height: 1,
    frame: false, transparent: true, show: false, skipTaskbar: true, resizable: false, movable: false,
    focusable: false, alwaysOnTop: true, hasShadow: false, minimizable: false, maximizable: false,
    title: 'yuta-desk catcher',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  catcher.setAlwaysOnTop(true, 'screen-saver')
  // Windows 11 draws a 1px border and rounded corners on frameless windows; turn both off.
  try {
    const h = hwndOf(catcher)
    const corner = Buffer.alloc(4); corner.writeUInt32LE(DWMWCP_DONOTROUND, 0)
    DwmSetWindowAttribute(h, DWMWA_WINDOW_CORNER_PREFERENCE, corner, 4)
    const color = Buffer.alloc(4); color.writeUInt32LE(DWMWA_COLOR_NONE, 0)
    DwmSetWindowAttribute(h, DWMWA_BORDER_COLOR, color, 4)
  } catch (e) { console.error('[catcher] dwm', e) }
  catcher.setIgnoreMouseEvents(false)
  const query = '?widget=catcher'
  if (process.env.ELECTRON_RENDERER_URL) void catcher.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  else void catcher.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  catcher.once('ready-to-show', () => catcher?.showInactive())
  catcher.on('closed', () => { catcher = null })
  if (process.env.YD_INPUT_LOG) {
    const { appendFileSync } = require('node:fs')
    catcher.webContents.on('input-event', (_e, input) => appendFileSync(process.env.YD_INPUT_LOG!, `${Date.now()} catcher ${input.type}${input.type === 'mouseWheel' ? ' dy=' + String((input as { deltaY?: number }).deltaY) : ''}
`))
  }

  ipcMain.on('catcher-event', (_e, ev: CatcherEvent) => {
    if (!target || target.isDestroyed()) return
    const wc = target.webContents
    if (ev.type === 'mouseWheel') {
      wc.sendInputEvent({ type: 'mouseWheel', x: ev.x, y: ev.y, deltaX: ev.deltaX, deltaY: ev.deltaY, canScroll: true, modifiers: ev.modifiers as never })
    } else {
      wc.sendInputEvent({ type: ev.type, x: ev.x, y: ev.y, button: ev.button, clickCount: ev.clickCount, modifiers: ev.modifiers as never })
    }
  })
  // Files dragged from Explorer land on the catcher (it sits over the widget); hand them to the launcher.
  const toLauncher = () => (target && !target.isDestroyed() && target.title === 'yuta-desk launcher' ? target : null)
  ipcMain.on('catcher-dragover', (_e, p: { x: number; y: number } | null) => {
    toLauncher()?.webContents.send('launcher-dragover', p)
  })
  ipcMain.on('catcher-drop', (_e, paths: string[], x: number, y: number) => {
    toLauncher()?.webContents.send('launcher-drop', { paths, x, y })
  })
  timer = setInterval(tick, 33)
}

export function stopCatcher(): void {
  if (timer) clearInterval(timer)
  if (catcher && !catcher.isDestroyed()) catcher.destroy()
}

export function catcherBounds(): Bounds | null {
  return catcher && !catcher.isDestroyed() ? boundsOf(catcher) : null
}

export { GA_ROOT, GetAncestor }
