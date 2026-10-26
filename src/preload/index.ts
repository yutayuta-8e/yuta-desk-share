import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BatteryInfo, Bounds, CalendarData, Config, LauncherIcon, TaskList, ThemeInfo, UsageData, WallpaperInfo, WidgetId } from '../shared/types'

type Listener<T> = (payload: T) => void
function on<T>(channel: string, fn: Listener<T>): () => void {
  const h = (_e: unknown, p: T) => fn(p)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const api = {
  widgetId: (new URLSearchParams(location.search).get('widget') ?? 'clock') as WidgetId,
  getConfig: (): Promise<Config> => ipcRenderer.invoke('get-config'),
  getTheme: (): Promise<ThemeInfo> => ipcRenderer.invoke('get-theme'),
  getWallpaper: (): Promise<WallpaperInfo> => ipcRenderer.invoke('get-wallpaper'),
  getBounds: (): Promise<Bounds | null> => ipcRenderer.invoke('get-bounds'),
  getLayer: (): Promise<string> => ipcRenderer.invoke('get-layer'),
  getCursor: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('get-cursor'),
  getBattery: (): Promise<BatteryInfo> => ipcRenderer.invoke('get-battery'),
  getTasks: (): Promise<TaskList> => ipcRenderer.invoke('get-tasks'),
  taskDone: (title: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('task-done', title),
  getUsage: (): Promise<UsageData> => ipcRenderer.invoke('get-usage'),
  getIcon: (path: string, icon?: string): Promise<LauncherIcon> => ipcRenderer.invoke('get-icon', path, icon),
  launch: (path: string, args?: string): Promise<string> => ipcRenderer.invoke('launch', path, args),
  getCalendar: (): Promise<CalendarData> => ipcRenderer.invoke('get-calendar'),
  calendarStatus: (): Promise<{ hasCredentials: boolean; connected: boolean }> => ipcRenderer.invoke('calendar-status'),
  calendarConnect: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('calendar-connect'),
  dragStart: (id: WidgetId) => ipcRenderer.send('drag-start', id),
  dragEnd: () => ipcRenderer.send('drag-end'),
  setEditMode: (on: boolean) => ipcRenderer.send('edit-mode-set', on),
  getEditMode: (): Promise<boolean> => ipcRenderer.invoke('get-edit-mode'),
  onEditMode: (fn: Listener<boolean>) => on('edit-mode', fn),
  contextMenu: (id: WidgetId) => ipcRenderer.send('context-menu', id),
  setWindowSize: (w: number, h: number) => ipcRenderer.send('set-window-size', w, h),
  setScale: (scale: number) => ipcRenderer.send('set-scale', scale),
  catcherEvent: (ev: unknown) => ipcRenderer.send('catcher-event', ev),
  petMove: (x: number, y: number) => ipcRenderer.send('pet-move', x, y),
  petRaise: () => ipcRenderer.send('pet-raise'),
  pathForFile: (f: File): string => { try { return webUtils.getPathForFile(f) } catch { return '' } },
  launcherAdd: (paths: string[], index: number) => ipcRenderer.send('launcher-add', paths, index),
  launcherMove: (from: number, to: number) => ipcRenderer.send('launcher-move', from, to),
  launcherItemMenu: (index: number) => ipcRenderer.send('launcher-item-menu', index),
  catcherDrop: (paths: string[], x: number, y: number) => ipcRenderer.send('catcher-drop', paths, x, y),
  catcherDragOver: (p: { x: number; y: number } | null) => ipcRenderer.send('catcher-dragover', p),
  onLauncherDrop: (fn: Listener<{ paths: string[]; x: number; y: number }>) => on('launcher-drop', fn),
  onLauncherDragOver: (fn: Listener<{ x: number; y: number } | null>) => on('launcher-dragover', fn),
  petPoke: (id: WidgetId) => ipcRenderer.send('pet-poke', id),
  getWidgetRects: (): Promise<(Bounds & { id: WidgetId })[]> => ipcRenderer.invoke('get-widget-rects'),
  onPetEvent: (fn: Listener<{ type: 'task-done' }>) => on('pet-event', fn),
  onPoke: (fn: Listener<{ at: number }>) => on('poke', fn),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onConfig: (fn: Listener<Config>) => on('config', fn),
  onTheme: (fn: Listener<ThemeInfo>) => on('theme', fn),
  onWallpaper: (fn: Listener<WallpaperInfo>) => on('wallpaper', fn),
  onBounds: (fn: Listener<Bounds>) => on('bounds', fn),
  onBattery: (fn: Listener<BatteryInfo>) => on('battery', fn),
  onTasks: (fn: Listener<TaskList>) => on('tasks', fn),
  onUsage: (fn: Listener<UsageData>) => on('usage', fn),
  onCalendar: (fn: Listener<CalendarData>) => on('calendar', fn)
}

export type YdApi = typeof api
contextBridge.exposeInMainWorld('yd', api)
