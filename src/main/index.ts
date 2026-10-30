import { bootLog } from './boot'
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, screen, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { GLYPHS, GLYPH_NUMBERS } from '../shared/glyphs'

/** Labels of the pet looks (same order as renderer/src/light/petDraw.ts PET_VARIANTS). */
const PET_LOOKS = ['いまの子', 'しずく', 'ねこみみ', 'ひとだま', 'シーツ', 'ちょうちん']
/** Same order as PET_FACES in renderer/src/light/petDraw.ts. */
const PET_FACE_LABELS = ['いまの顔（たて線の目）', 'まんまる目＋ちいさな口', 'にこにこ目＋あいた口', 'てん目＋ω口', 'きらきら目＋おちょぼ口', 'たれ目＋にょろ口']
/** The sheet's blush (petDraw.ts cheeks). */
const PET_CHEEKS = [['lines', '3本線'], ['round', 'まる']] as const
import { loadConfig, getConfig, updateConfig } from './config'
import { registerWallpaperScheme, startWallpaperService, wallpaperEvents, getWallpaperInfo } from './wallpaper'
import { startThemeService, themeEvents } from './theme'
import { applyWidgetEnabled, broadcast, registerWindowIpc, registerContextMenuExtras, getWindow, moveWindow, allWindows, boundsOf } from './windows'
import { raiseOnDesktop } from './desktopLayer'
import { startCatcher, stopCatcher } from './catcher'
import { createTray, refreshTray } from './tray'
import { readBattery } from './services/battery'
import { readTasks, startTaskWatcher, taskEvents, markTaskDone, addTask, editTask, deleteTask, listTrash, restoreTask, type TaskDraft } from './services/tasks'
import { openTaskForm, closeTaskForm } from './taskForm'
import { startMediaService, stopMediaService, mediaEvents, getMediaState, mediaCommand, playSoundCloud, mediaSeek, getMediaVolume, setMediaVolume } from './services/media'
import { openPlayer, closePlayer, getPlayerWindow } from './playerWindow'
import { readUsage } from './services/usage'
import { getIcon, launch, readLogos } from './services/launcher'
import { readCalendar, connectGoogle, hasCredentials, isConnected, getEventDetail, saveEvent, deleteEvent } from './services/calendar'
import { startMarksWatcher, marksEvents, saveSub, deleteSub } from './services/calendarMarks'
import { openCalCard, closeCalCard, placeCalCard } from './calCard'
import { readMoney, startMoneyWatcher, moneyEvents, addMoney, fixMoney, removeMoney } from './services/money'
import { openMoneyCard, closeMoneyCard, placeMoneyCard, toggleMoneyCard } from './moneyCard'
import type { WidgetId, CalCardRequest, CalCardView, EventDraft, SubDraft, MoneyDraft, MoneyRef } from '../shared/types'
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
function pushMoney(m: ReturnType<typeof readMoney>): void {
  broadcast('money', m)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.title === 'yuta-desk 家計簿') w.webContents.send('money', m)
}
async function pushCalendar(): Promise<void> { const [s, e] = calendarRange(); broadcast('calendar', await readCalendar(s, e)) }

function startServices(): void {
  startThemeService()
  startTaskWatcher()
  startMarksWatcher()
  marksEvents.on('changed', () => void pushCalendar())
  wallpaperEvents.on('changed', (info) => broadcast('wallpaper', info))
  themeEvents.on('changed', (t) => broadcast('theme', t))
  taskEvents.on('changed', (t) => broadcast('tasks', t))
  startMoneyWatcher()
  // the widget and the card both follow the month files (the card is not a widget window, so it is told apart)
  moneyEvents.on('changed', (m) => pushMoney(m))
  // the eyes of the household accounts turn to the pointer: looked at 4 times a second, told only when it moved
  let lastPointer = { x: -1, y: -1 }
  setInterval(() => {
    const w = getWindow('money')
    if (!w || w.isDestroyed()) return
    const p = screen.getCursorScreenPoint()
    if (Math.abs(p.x - lastPointer.x) + Math.abs(p.y - lastPointer.y) < 4) return
    lastPointer = p
    w.webContents.send('cursor', p)
  }, 250)
  startMediaService()
  mediaEvents.on('changed', (m) => {
    getWindow('media')?.webContents.send('media', m)
    getPlayerWindow()?.webContents.send('media', m)
  })
  batteryTimer = setInterval(() => void pushBattery(), getConfig().battery.refreshSeconds * 1000)
  usageTimer = setInterval(() => void pushUsage(), getConfig().usage.refreshMinutes * 60 * 1000)
  // usage is not asked while the owner is away; ask as soon as they are back. Logged so the log
  // shows whether a refresh came from coming back or from the timer.
  const onBack = (why: string) => {
    bootLog(`usage back (${why}) idle=${powerMonitor.getSystemIdleTime()}s state=${powerMonitor.getSystemIdleState(10 * 60)}`)
    void pushUsage()
  }
  powerMonitor.on('lock-screen', () => bootLog('screen locked'))
  powerMonitor.on('unlock-screen', () => onBack('unlock'))
  powerMonitor.on('resume', () => onBack('resume'))
  calendarTimer = setInterval(() => void pushCalendar(), getConfig().calendar.refreshMinutes * 60 * 1000)
}

function registerDataIpc(): void {
  ipcMain.handle('get-wallpaper', () => getWallpaperInfo())
  ipcMain.handle('get-battery', () => readBattery())
  ipcMain.handle('get-tasks', () => readTasks())
  ipcMain.handle('task-done', async (_e, title: string) => {
    // YD_TASK_DRYRUN=1: check the flow (and the pet's reaction) without touching the Vault
    const r = await markTaskDone(title)
    if (r.ok) getWindow('pet')?.webContents.send('pet-event', { type: 'task-done' })
    return r
  })
  ipcMain.handle('get-usage', () => readUsage())
  ipcMain.handle('get-media', () => getMediaState())
  // task editing from the tasks widget (edit mode) and its small input window
  const refreshTasks = () => broadcast('tasks', readTasks())
  ipcMain.on('task-form-open', (_e, mode: 'add' | 'edit', task?: { title: string; due: string | null }) => openTaskForm(mode, task))
  ipcMain.on('task-form-close', () => closeTaskForm())
  ipcMain.handle('task-add', async (_e, d: TaskDraft) => { const r = await addTask(d); refreshTasks(); return r })
  ipcMain.handle('task-edit', async (_e, title: string, d: TaskDraft) => { const r = await editTask(title, d); refreshTasks(); return r })
  ipcMain.handle('task-delete', async (_e, title: string) => { const r = await deleteTask(title); refreshTasks(); return r })
  ipcMain.handle('task-trash', () => listTrash())
  ipcMain.handle('task-restore', async (_e, content: string) => { const r = await restoreTask(content); refreshTasks(); return r })
  ipcMain.on('media-command', (_e, cmd: string) => { if (['toggle', 'next', 'prev', 'close'].includes(cmd)) mediaCommand(cmd as 'toggle') })
  ipcMain.on('media-soundcloud', () => playSoundCloud())
  // the full-screen player (opened from the media widget)
  ipcMain.on('player-open', () => openPlayer())
  ipcMain.on('player-close', () => closePlayer())
  ipcMain.on('media-seek', (_e, sec: number) => mediaSeek(Number(sec)))
  ipcMain.on('media-volume', (_e, v: number) => setMediaVolume(Number(v)))
  ipcMain.handle('get-media-volume', () => getMediaVolume())
  ipcMain.handle('get-icon', (_e, path: string, icon?: string) => getIcon(path, icon))
  ipcMain.handle('launcher-logos', () => readLogos())
  ipcMain.handle('launch', (_e, path: string, args?: string) => launch(path, args))
  ipcMain.handle('get-calendar', () => { const [s, e] = calendarRange(); return readCalendar(s, e) })
  ipcMain.handle('calendar-status', () => ({ hasCredentials: hasCredentials(), connected: isConnected() }))
  ipcMain.handle('calendar-connect', async () => { const r = await connectGoogle(); if (r.ok) void pushCalendar(); return r })
  // the card beside the calendar: an event's details, or adding / editing one (main/calCard.ts)
  ipcMain.on('cal-card-open', (_e, r: CalCardRequest) => openCalCard(r))
  ipcMain.on('cal-card-close', () => closeCalCard())
  const VIEWS: CalCardView[] = ['detail', 'form', 'subs', 'subform']
  ipcMain.on('cal-card-place', (_e, h: number, view: CalCardView) => placeCalCard(Number(h), VIEWS.includes(view) ? view : 'detail'))
  ipcMain.handle('cal-event-detail', (_e, id: string) => getEventDetail(id))
  ipcMain.handle('cal-event-save', async (_e, d: EventDraft, id?: string) => { const r = await saveEvent(d, id); if (r.ok) void pushCalendar(); return r })
  ipcMain.handle('cal-event-delete', async (_e, id: string) => { const r = await deleteEvent(id); if (r.ok) void pushCalendar(); return r })
  // the subscriptions card writes the Vault list (main/services/calendarMarks.ts); the calendar hears it through the watcher's event
  ipcMain.handle('subs-save', (_e, d: SubDraft, original?: string) => saveSub(d, original))
  ipcMain.handle('subs-delete', (_e, name: string) => deleteSub(String(name)))
  // the household accounts: read here, written through `yuta money` (main/services/money.ts)
  ipcMain.handle('get-money', () => readMoney())
  ipcMain.on('money-card-open', (_e, month?: string, day?: number) => { if (typeof month === 'string') openMoneyCard(month, Number(day) || undefined); else toggleMoneyCard() })
  ipcMain.on('money-card-close', () => closeMoneyCard())
  ipcMain.on('money-card-place', (_e, h: number, view: string) => placeMoneyCard(Number(h), view === 'form' ? 'form' : 'month'))
  ipcMain.handle('money-add', async (_e, d: MoneyDraft) => {
    const r = await addMoney(d)
    // the pet is glad when the owner writes one down
    if (r.ok) getWindow('pet')?.webContents.send('pet-event', { type: 'money' })
    return r
  })
  ipcMain.handle('money-fix', (_e, ref: MoneyRef, d: MoneyDraft) => fixMoney(ref, d))
  ipcMain.handle('money-remove', (_e, ref: MoneyRef) => removeMoney(ref))
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
    const setMask = (g: string) => {
      const c = updateConfig((cfg) => { const t = cfg.launcher.items[index]; if (t) t.mask = g })
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
      // what this app shows while the logos are hidden for screenshots
      { label: '伏せたときのマーク', submenu: GLYPHS.map((g) => ({ label: g.label, type: 'radio' as const, checked: it.mask === g.id, click: () => setMask(g.id) })) },
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
          { label: 'フルカラー', type: 'radio', checked: cfg.iconStyle === 'color', click: () => { updateConfig((x) => { x.launcher.iconStyle = 'color' }); broadcast('config', getConfig()) } },
          { type: 'separator' },
          // the apps' logos as lines (this PC only), or original marks in their place for screenshots to share
          { label: 'ロゴを線で（ふだん）', type: 'radio', checked: cfg.iconSet !== 'mask', click: () => { updateConfig((x) => { x.launcher.iconSet = 'logo' }); broadcast('config', getConfig()) } },
          { label: 'ロゴを伏せる（スクショ用）', type: 'radio', checked: cfg.iconSet === 'mask', click: () => { updateConfig((x) => { x.launcher.iconSet = 'mask' }); broadcast('config', getConfig()) } }
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
    { label: '顔', submenu: PET_FACE_LABELS.map((label, i) => ({
      label, type: 'radio' as const, checked: (getConfig().pet.face ?? 5) === i,
      click: () => { const c = updateConfig((cfg) => { cfg.pet.face = i }); broadcast('config', c) }
    })) },
    { label: 'ほっぺ', submenu: PET_CHEEKS.map(([id, label]) => ({
      label, type: 'radio' as const, checked: (getConfig().pet.cheek ?? 'lines') === id,
      click: () => { const c = updateConfig((cfg) => { cfg.pet.cheek = id }); broadcast('config', c) }
    })) },
    { label: '吹き出しをガラスに', type: 'checkbox', checked: getConfig().pet.bubbleGlass ?? false,
      click: () => { const c = updateConfig((cfg) => { cfg.pet.bubbleGlass = !(cfg.pet.bubbleGlass ?? false) }); broadcast('config', c) } },
    { type: 'separator' }
  ])
  registerContextMenuExtras('battery', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => void pushBattery() }])
  registerContextMenuExtras('usage', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => void pushUsage() }])
  registerContextMenuExtras('tasks', (): MenuItemConstructorOptions[] => [{ label: '今すぐ更新', click: () => broadcast('tasks', readTasks()) }])
  registerContextMenuExtras('money', (): MenuItemConstructorOptions[] => [
    { label: '明細を開く', click: () => openMoneyCard() },
    { label: '今すぐ更新', click: () => pushMoney(readMoney()) }
  ])
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

// starting the app again shows the widgets; with --player it opens the full-screen player, with
// --money the household accounts' card, or closes it when it is open (a shortcut can point at them;
// the checks use them too)
app.on('second-instance', (_e, argv) => {
  applyWidgetEnabled()
  if (argv.includes('--player')) openPlayer()
  if (argv.includes('--money')) toggleMoneyCard(2500)
})
app.on('window-all-closed', () => { /* keep running in the tray */ })
app.on('before-quit', () => {
  stopMediaService()
  stopCatcher()
  if (batteryTimer) clearInterval(batteryTimer)
  if (usageTimer) clearInterval(usageTimer)
  if (calendarTimer) clearInterval(calendarTimer)
})

export type { WidgetId }
