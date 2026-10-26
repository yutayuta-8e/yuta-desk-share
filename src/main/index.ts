import './boot'
import { app, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { GLYPHS, GLYPH_NUMBERS } from '../shared/glyphs'

/** Labels of the pet looks (same order as renderer/src/light/petDraw.ts PET_VARIANTS). */
const PET_LOOKS = ['いまの子', 'しずく', 'ねこみみ', 'ひとだま', 'シーツ', 'ちょうちん']
import { loadConfig, getConfig, updateConfig } from './config'
import { registerWallpaperScheme, startWallpaperService, wallpaperEvents, getWallpaperInfo } from './wallpaper'
import { startThemeService, themeEvents } from './theme'
import { applyWidgetEnabled, broadcast, registerWindowIpc, registerContextMenuExtras, getWindow, moveWindow, allWindows, boundsOf } from './windows'
import { raiseOnDesktop } from './desktopLayer'
import { startCatcher, stopCatcher } from './catcher'
import { createTray, refreshTray } from './tray'
import { readBattery } from './services/battery'
import { readTasks, startTaskWatcher, taskEvents, markTaskDone } from './services/tasks'
import { readUsage } from './services/usage'
import { getIcon, launch } from './services/launcher'
import { readCalendar, connectGoogle, hasCredentials, isConnected } from './services/calendar'
import type { WidgetId } from '../shared/types'
import { desktopReady } from './desktopLayer'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

function logLine(msg: string): void {
  try { appendFileSync(join(app.getPath('userData'), 'yuta-desk.log'), `${new Date().toISOString()} ${msg}
`) } catch { /* ignore */ }
}

/** At login the desktop window appears a few seconds after our process starts; wait for it. */
async function waitForDesktop(maxMs = 120_000): Promise<void> {
  const t0 = Date.now()
  while (!desktopReady()) {
    if (Date.now() - t0 > maxMs) { logLine('desktop not found after timeout; continuing'); return }
    await new Promise((r) => setTimeout(r, 1000))
  }
  // give explorer a moment to finish building the desktop
  await new Promise((r) => setTimeout(r, 1500))
}

registerWallpaperScheme()
// Windows on the desktop layer do not receive precision-touchpad (DirectManipulation) scrolls;
// turning the feature off makes touchpads send ordinary wheel messages instead.
app.commandLine.appendSwitch('disable-features', 'PrecisionTouchpad,PrecisionTouchpadScrollPhase')

if (!app.requestSingleInstanceLock()) app.quit()

let batteryTimer: NodeJS.Timeout | null = null
let usageTimer: NodeJS.Timeout | null = null
let calendarTimer: NodeJS.Timeout | null = null

function calendarRange(): [Date, Date] {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 1)
  return [start, end]
}

async function pushBattery(): Promise<void> { broadcast('battery', await readBattery()) }
async function pushUsage(): Promise<void> { broadcast('usage', await readUsage()) }
async function pushCalendar(): Promise<void> { const [s, e] = calendarRange(); broadcast('calendar', await readCalendar(s, e)) }

function startServices(): void {
  startThemeService()
  startTaskWatcher()
  wallpaperEvents.on('changed', (info) => broadcast('wallpaper', info))
  themeEvents.on('changed', (t) => broadcast('theme', t))
  taskEvents.on('changed', (t) => broadcast('tasks', t))
  batteryTimer = setInterval(() => void pushBattery(), getConfig().battery.refreshSeconds * 1000)
  usageTimer = setInterval(() => void pushUsage(), getConfig().usage.refreshMinutes * 60 * 1000)
  calendarTimer = setInterval(() => void pushCalendar(), getConfig().calendar.refreshMinutes * 60 * 1000)
}

function registerDataIpc(): void {
  ipcMain.handle('get-wallpaper', () => getWallpaperInfo())
  ipcMain.handle('get-battery', () => readBattery())
  ipcMain.handle('get-tasks', () => readTasks())
  ipcMain.handle('task-done', async (_e, title: string) => {
    // YD_TASK_DRYRUN=1: check the flow (and the pet's reaction) without touching the Vault
    const r = await markTaskDone(title, !!process.env.YD_TASK_DRYRUN)
    if (r.ok) getWindow('pet')?.webContents.send('pet-event', { type: 'task-done' })
    return r
  })
  ipcMain.handle('get-usage', () => readUsage())
  ipcMain.handle('get-icon', (_e, path: string, icon?: string) => getIcon(path, icon))
  ipcMain.handle('launch', (_e, path: string, args?: string) => launch(path, args))
  ipcMain.handle('get-calendar', () => { const [s, e] = calendarRange(); return readCalendar(s, e) })
  ipcMain.handle('calendar-status', () => ({ hasCredentials: hasCredentials(), connected: isConnected() }))
  ipcMain.handle('calendar-connect', async () => { const r = await connectGoogle(); if (r.ok) void pushCalendar(); return r })
  ipcMain.on('pet-move', (_e, x: number, y: number) => {
    const w = getWindow('pet')
    if (w) moveWindow(w, x, y)
  })
  // the pet roams the whole desktop: where the widgets are (to sit on them / tease them)
  ipcMain.handle('get-widget-rects', () => allWindows()
    .filter((w) => !w.isDestroyed() && w.title !== 'yuta-desk pet')
    .map((w) => ({ id: w.title.replace('yuta-desk ', ''), ...boundsOf(w) })))
  // launcher: add dropped files/shortcuts/folders, reorder, remove
  ipcMain.on('launcher-add', (_e, paths: string[], index: number) => {
    const c = updateConfig((cfg) => {
      const items = cfg.launcher.items
      let at = Math.max(0, Math.min(items.length, Math.round(index)))
      for (const p of paths) {
        if (typeof p !== 'string' || !p || !existsSync(p)) continue
        if (items.some((it) => it.path.toLowerCase() === p.toLowerCase())) continue
        items.splice(at++, 0, { name: basename(p).replace(/\.(lnk|exe|url|appref-ms)$/i, ''), path: p })
      }
    })
    broadcast('config', c)
  })
  ipcMain.on('launcher-move', (_e, from: number, to: number) => {
    const c = updateConfig((cfg) => {
      const items = cfg.launcher.items
      if (from < 0 || from >= items.length) return
      const [it] = items.splice(from, 1)
      items.splice(Math.max(0, Math.min(items.length, Math.round(to))), 0, it)
    })
    broadcast('config', c)
  })
  ipcMain.on('launcher-item-menu', (_e, index: number) => {
    const it = getConfig().launcher.items[index]
    const win = getWindow('launcher')
    if (!it || !win) return
    const setGlyph = (g: string | undefined) => {
      const c = updateConfig((cfg) => { const t = cfg.launcher.items[index]; if (t) { if (g) t.glyph = g; else delete t.glyph } })
      broadcast('config', c)
    }
    Menu.buildFromTemplate([
      { label: `「${it.name}」を開く`, click: () => void launch(it.path, it.args) },
      { type: 'separator' },
      { label: 'マークにする', submenu: [
        { label: '数字', submenu: GLYPH_NUMBERS.map((n) => ({ label: n, type: 'radio' as const, checked: it.glyph === `n:${n}`, click: () => setGlyph(`n:${n}`) })) },
        ...GLYPHS.map((g) => ({ label: g.label, type: 'radio' as const, checked: it.glyph === g.id, click: () => setGlyph(g.id) }))
      ] },
      { label: '元のアイコンに戻す', enabled: !!it.glyph, click: () => setGlyph(undefined) },
      { type: 'separator' },
      { label: `「${it.name}」をランチャーから外す`, click: () => {
        const c = updateConfig((cfg) => { cfg.launcher.items.splice(index, 1) })
        broadcast('config', c)
      } }
    ]).popup({ window: win })
  })
  ipcMain.on('pet-raise', () => { const w = getWindow('pet'); if (w && !w.isDestroyed()) raiseOnDesktop(w.getNativeWindowHandle()) })
  ipcMain.on('pet-poke', (_e, id: WidgetId) => getWindow(id)?.webContents.send('poke', { at: Date.now() }))
}

function registerMenus(): void {
  registerContextMenuExtras('launcher', (): MenuItemConstructorOptions[] => {
    const cfg = getConfig().launcher
    const grids: [number, number][] = [[3, 3], [1, 5], [2, 4], [2, 5], [3, 4], [4, 4]]
    return [
      {
        label: `グリッド（${cfg.rows}×${cfg.cols}）`,
        submenu: grids.map(([r, c]) => ({
          label: `${r} × ${c}`, type: 'radio', checked: cfg.rows === r && cfg.cols === c,
          click: () => { updateConfig((x) => { x.launcher.rows = r; x.launcher.cols = c }); broadcast('config', getConfig()) }
        }))
      },
      {
        label: 'アイコン',
        submenu: [
          { label: 'クリア（白抜き）', type: 'radio', checked: cfg.iconStyle === 'clear', click: () => { updateConfig((x) => { x.launcher.iconStyle = 'clear' }); broadcast('config', getConfig()) } },
          { label: 'フルカラー', type: 'radio', checked: cfg.iconStyle === 'color', click: () => { updateConfig((x) => { x.launcher.iconStyle = 'color' }); broadcast('config', getConfig()) } }
        ]
      }
    ]
  })
  registerContextMenuExtras('calendar', (): MenuItemConstructorOptions[] => [
    { label: isConnected() ? 'Google に再接続' : 'Google カレンダーに接続', click: () => void connectGoogle().then(() => pushCalendar()) },
    { label: '今すぐ更新', click: () => void pushCalendar() }
  ])
  registerContextMenuExtras('pet', (): MenuItemConstructorOptions[] => [
    { label: '見た目', submenu: PET_LOOKS.map((label, i) => ({
      label, type: 'radio' as const, checked: (getConfig().pet.variant ?? 0) === i,
      click: () => { const c = updateConfig((cfg) => { cfg.pet.variant = i }); broadcast('config', c) }
    })) },
    { type: 'separator' }
  ])
  registerContextMenuExtras('battery', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => void pushBattery() }])
  registerContextMenuExtras('usage', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => void pushUsage() }])
  registerContextMenuExtras('tasks', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => broadcast('tasks', readTasks()) }])
}

app.whenReady().then(async () => {
  logLine(`start pid=${process.pid} packaged=${app.isPackaged}`)
  await waitForDesktop()
  logLine('desktop ready')
  loadConfig()
  registerWindowIpc()
  registerDataIpc()
  registerMenus()
  await startWallpaperService()
  startServices()
  createTray()
  applyWidgetEnabled()
  refreshTray()
  startCatcher()
  logLine('widgets created')
})

app.on('second-instance', () => applyWidgetEnabled())
app.on('window-all-closed', () => { /* keep running in the tray */ })
app.on('before-quit', () => {
  stopCatcher()
  if (batteryTimer) clearInterval(batteryTimer)
  if (usageTimer) clearInterval(usageTimer)
  if (calendarTimer) clearInterval(calendarTimer)
})

export type { WidgetId }
