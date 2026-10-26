import { BrowserWindow, Menu, screen, shell, ipcMain, app, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { attachToDesktop, raiseOnDesktop, getRectDip, setRectDip, movePhysical, type LayerMode } from './desktopLayer'
import { getConfig, updateConfig, configPath } from './config'
import { getThemeInfo, notifyThemeChanged } from './theme'
import { WIDGET_IDS, WIDGET_LABELS, type WidgetId, type Bounds } from '../shared/types'

const windows = new Map<WidgetId, BrowserWindow>()
export let layerMode: LayerMode = 'none'

export function getWindow(id: WidgetId): BrowserWindow | undefined {
  return windows.get(id)
}

export function allWindows(): BrowserWindow[] {
  return [...windows.values()]
}

/** Topmost widget window under a DIP point, with its bounds. */
export function windowAt(x: number, y: number): { win: BrowserWindow; bounds: Bounds } | null {
  const list = [...windows.values()].filter((w) => !w.isDestroyed()).reverse()
  for (const win of list) {
    const b = boundsOf(win)
    if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return { win, bounds: b }
  }
  return null
}

export function broadcast(channel: string, payload: unknown): void {
  for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

function clampToScreen(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const b = screen.getPrimaryDisplay().bounds
  return {
    x: Math.min(Math.max(b.x, x), b.x + b.width - Math.min(w, b.width)),
    y: Math.min(Math.max(b.y, y), b.y + b.height - Math.min(h, b.height))
  }
}

export function createWidgetWindow(id: WidgetId): BrowserWindow {
  const existing = windows.get(id)
  if (existing && !existing.isDestroyed()) return existing
  const cfg = getConfig().widgets[id]
  const w = Math.round(cfg.w * cfg.scale)
  const h = Math.round(cfg.h * cfg.scale)
  const pos = clampToScreen(cfg.x, cfg.y, w, h)
  const win = new BrowserWindow({
    x: pos.x, y: pos.y, width: w, height: h,
    frame: false, transparent: true, show: false, skipTaskbar: true, resizable: true, thickFrame: false,
    hasShadow: false, minimizable: false, maximizable: false, fullscreenable: false,
    title: `yuta-desk ${id}`,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  windows.set(id, win)
  win.once('ready-to-show', () => {
    win.showInactive()
    layerMode = attachToDesktop(win.getNativeWindowHandle())
    setWindowRect(win, pos.x, pos.y, w, h)
    win.webContents.send('bounds', boundsOf(win))
  })
  win.on('closed', () => windows.delete(id))
  if (process.env.YD_INPUT_LOG) {
    const { appendFileSync } = require('node:fs')
    win.webContents.on('input-event', (_e, input) => appendFileSync(process.env.YD_INPUT_LOG!, `${Date.now()} ${id} ${input.type}${input.type === 'mouseWheel' ? ' dy=' + String((input as { deltaY?: number }).deltaY) : ''}
`))
    win.webContents.on('console-message', (_e, _l, msg) => appendFileSync(process.env.YD_INPUT_LOG!, `${Date.now()} ${id} console: ${msg}
`))
  }
  const query = `?widget=${id}${process.env.YD_DIGITS ? '&digits=1' : ''}${process.env.YD_NOBLOOM ? '&nobloom=1' : ''}${process.env.YD_BG ? '&bg=' + encodeURIComponent(process.env.YD_BG) : ''}${process.env.YD_DEBUG3D ? '&debug=1' : ''}${process.env.YD_TIME ? '&time=' + encodeURIComponent(process.env.YD_TIME) : ''}${process.env.YD_NOKERN ? '&nokern=1' : ''}${process.env.YD_KERN ? '&kern=' + encodeURIComponent(process.env.YD_KERN) : ''}${process.env.YD_HOUR ? '&hour=' + encodeURIComponent(process.env.YD_HOUR) : ''}${process.env.YD_PETDEMO ? '&petdemo=1' : ''}${process.env.YD_TASKSTYLE ? '&taskstyle=' + encodeURIComponent(process.env.YD_TASKSTYLE) : ''}${process.env.YD_PETVARIANT ? '&petvariant=' + encodeURIComponent(process.env.YD_PETVARIANT) : ''}`
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  return win
}

function scale(): number { return screen.getPrimaryDisplay().scaleFactor || 1 }

export function boundsOf(win: BrowserWindow): Bounds {
  if (win.isDestroyed()) return { x: 0, y: 0, width: 0, height: 0 }
  return getRectDip(win.getNativeWindowHandle(), scale())
}

export function moveWindow(win: BrowserWindow, x: number, y: number): void {
  if (win.isDestroyed()) return
  movePhysical(win.getNativeWindowHandle(), scale(), x, y)
}

export function setWindowRect(win: BrowserWindow, x: number, y: number, w: number, h: number): void {
  if (win.isDestroyed()) return
  setRectDip(win.getNativeWindowHandle(), scale(), { x, y, width: w, height: h })
}

function idOf(win: BrowserWindow): WidgetId { return win.title.replace('yuta-desk ', '') as WidgetId }

export function destroyWidgetWindow(id: WidgetId): void {
  const w = windows.get(id)
  if (w && !w.isDestroyed()) w.destroy()
  windows.delete(id)
}

export function applyWidgetEnabled(): void {
  const cfg = getConfig()
  for (const id of WIDGET_IDS) {
    if (cfg.widgets[id].enabled) createWidgetWindow(id)
    else destroyWidgetWindow(id)
  }
}

export function resizeWidget(id: WidgetId, scale: number): void {
  updateConfig((c) => { c.widgets[id].scale = scale })
  const w = windows.get(id)
  const cfg = getConfig().widgets[id]
  if (w && !w.isDestroyed()) {
    setWindowRect(w, cfg.x, cfg.y, Math.round(cfg.w * scale), Math.round(cfg.h * scale))
    w.webContents.send('bounds', boundsOf(w))
    w.webContents.send('config', getConfig())
  }
}

export function setWidgetSize(id: WidgetId, w: number, h: number): void {
  updateConfig((c) => { c.widgets[id].w = w; c.widgets[id].h = h })
  const win = windows.get(id)
  const cfg = getConfig().widgets[id]
  if (win && !win.isDestroyed()) {
    setWindowRect(win, cfg.x, cfg.y, Math.round(w * cfg.scale), Math.round(h * cfg.scale))
    win.webContents.send('bounds', boundsOf(win))
  }
}

export function reloadAll(): void {
  for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.reloadIgnoringCache()
}

// ---- manual drag (child-of-desktop windows cannot rely on the OS caption drag) ----
let drag: { id: WidgetId; dx: number; dy: number; timer: NodeJS.Timeout; x0: number; y0: number } | null = null

// ---- edit mode (2026-10-26, owner: "iPhone のウィジェットみたいに長押しで編集モード") ----
// Widgets only move while edit mode is on. A long press on any widget (or the menus) turns it on
// for every widget; a plain click, or 15 s without moving anything, turns it off.
let editMode = false
let editTimer: NodeJS.Timeout | null = null
const EDIT_IDLE_MS = 15000
function armEditTimer(): void {
  if (editTimer) clearTimeout(editTimer)
  editTimer = editMode ? setTimeout(() => setEditMode(false), EDIT_IDLE_MS) : null
}
export function setEditMode(on: boolean): void {
  if (!on) stopDrag()
  editMode = on
  armEditTimer()
  broadcast('edit-mode', on)
}
export function isEditMode(): boolean { return editMode }

function startDrag(id: WidgetId): void {
  const win = windows.get(id)
  if (!win || win.isDestroyed() || !editMode) return
  stopDrag()
  if (editTimer) clearTimeout(editTimer)
  const cur = screen.getCursorScreenPoint()
  const { x: wx, y: wy } = boundsOf(win)
  const timer = setInterval(() => {
    if (win.isDestroyed()) return stopDrag()
    const p = screen.getCursorScreenPoint()
    moveWindow(win, p.x - drag!.dx, p.y - drag!.dy)
    win.webContents.send('bounds', boundsOf(win))
  }, 16)
  drag = { id, dx: cur.x - wx, dy: cur.y - wy, timer, x0: wx, y0: wy }
  raiseOnDesktop(win.getNativeWindowHandle())
}

function stopDrag(): void {
  if (!drag) return
  clearInterval(drag.timer)
  const win = windows.get(drag.id)
  drag = null
  if (win && !win.isDestroyed()) {
    const { x, y } = boundsOf(win)
    const id = idOf(win)
    updateConfig((c) => { c.widgets[id].x = Math.round(x); c.widgets[id].y = Math.round(y) })
    win.webContents.send('bounds', boundsOf(win))
  }
  armEditTimer()
}

// ---- context menu ----
function scaleItems(id: WidgetId): MenuItemConstructorOptions[] {
  const cur = getConfig().widgets[id].scale
  return [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((s) => ({
    label: `${Math.round(s * 100)}%`, type: 'radio', checked: Math.abs(cur - s) < 0.01, click: () => resizeWidget(id, s)
  }))
}

function sliderItems(id: WidgetId, key: 'opacity' | 'blur', values: number[], fmt: (v: number) => string): MenuItemConstructorOptions[] {
  const cur = getConfig().widgets[id][key]
  return values.map((v) => ({
    label: fmt(v), type: 'radio', checked: Math.abs(cur - v) < 0.001,
    click: () => { updateConfig((c) => { c.widgets[id][key] = v }); broadcast('config', getConfig()) }
  }))
}

export function themeMenuItems(): MenuItemConstructorOptions[] {
  const cur = getConfig().theme
  const set = (t: 'auto' | 'light' | 'dark') => () => { updateConfig((c) => { c.theme = t }); notifyThemeChanged() }
  return [
    { label: '霜ガラス（標準）', type: 'radio', checked: cur === 'auto', click: set('auto') },
    { label: '霜ガラス・黒文字（明るい壁紙用）', type: 'radio', checked: cur === 'light', click: set('light') },
    { label: 'スモーク（暗いガラス）', type: 'radio', checked: cur === 'dark', click: set('dark') }
  ]
}

export function widgetToggleItems(): MenuItemConstructorOptions[] {
  const cfg = getConfig()
  return WIDGET_IDS.map((id) => ({
    label: WIDGET_LABELS[id], type: 'checkbox', checked: cfg.widgets[id].enabled,
    click: () => { updateConfig((c) => { c.widgets[id].enabled = !c.widgets[id].enabled }); applyWidgetEnabled() }
  }))
}

function showContextMenu(id: WidgetId, extra: MenuItemConstructorOptions[] = []): void {
  const win = windows.get(id)
  if (!win || win.isDestroyed()) return
  const template: MenuItemConstructorOptions[] = [
    { label: WIDGET_LABELS[id], enabled: false },
    { type: 'separator' },
    editMode
      ? { label: '配置の編集を終わる', click: () => setEditMode(false) }
      : { label: '配置を編集する（長押しでも）', click: () => setEditMode(true) },
    { type: 'separator' },
    ...extra,
    { label: 'カードを表示', type: 'checkbox', checked: getConfig().widgets[id].card, click: () => { updateConfig((c) => { c.widgets[id].card = !c.widgets[id].card }); broadcast('config', getConfig()) } },
    { label: 'サイズ（Ctrl+ホイールでも変更可）', submenu: scaleItems(id) },
    { label: 'ガラスの濃さ', submenu: sliderItems(id, 'opacity', [0, 0.08, 0.14, 0.22, 0.30, 0.40], (v) => `${Math.round(v * 100)}%`) },
    { label: 'ぼかし', submenu: sliderItems(id, 'blur', [0, 16, 28, 44, 60], (v) => `${v}px`) },
    { label: 'テーマ', submenu: themeMenuItems() },
    { type: 'separator' },
    { label: 'ウィジェット', submenu: widgetToggleItems() },
    { label: 'このウィジェットを隠す', click: () => { updateConfig((c) => { c.widgets[id].enabled = false }); applyWidgetEnabled() } },
    { type: 'separator' },
    { label: '設定ファイルを開く', click: () => void shell.openPath(configPath()) },
    { label: '再読み込み', click: reloadAll },
    { label: '終了', click: () => app.quit() }
  ]
  Menu.buildFromTemplate(template).popup({ window: win })
}

const extraMenuProviders = new Map<WidgetId, () => MenuItemConstructorOptions[]>()
export function registerContextMenuExtras(id: WidgetId, provider: () => MenuItemConstructorOptions[]): void {
  extraMenuProviders.set(id, provider)
}

export function registerWindowIpc(): void {
  ipcMain.on('drag-start', (_e, id: WidgetId) => startDrag(id))
  ipcMain.on('drag-end', () => {
    // in edit mode, a press that did not move the widget is a click: it ends edit mode
    const d = drag
    const win = d ? windows.get(d.id) : undefined
    const b = win && !win.isDestroyed() ? boundsOf(win) : null
    stopDrag()
    if (editMode && d && b && Math.hypot(b.x - d.x0, b.y - d.y0) < 3) setEditMode(false)
  })
  ipcMain.on('edit-mode-set', (_e, on: boolean) => setEditMode(!!on))
  ipcMain.handle('get-edit-mode', () => editMode)
  ipcMain.on('context-menu', (_e, id: WidgetId) => showContextMenu(id, extraMenuProviders.get(id)?.() ?? []))
  ipcMain.handle('get-bounds', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win ? boundsOf(win) : null
  })
  ipcMain.handle('get-theme', () => getThemeInfo())
  ipcMain.handle('get-config', () => getConfig())
  ipcMain.handle('get-layer', () => layerMode)
  ipcMain.handle('get-cursor', () => screen.getCursorScreenPoint())
  ipcMain.on('set-scale', (e, scale: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) resizeWidget(idOf(win), Math.min(4, Math.max(0.4, Math.round(scale * 20) / 20)))
  })
  ipcMain.on('set-window-size', (e, w: number, h: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    setWidgetSize(idOf(win), w, h)
  })
  ipcMain.on('move-window', (e, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) moveWindow(win, x, y)
  })
  ipcMain.on('open-external', (_e, url: string) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url) })
}
