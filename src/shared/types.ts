export type WidgetId = 'clock' | 'calendar' | 'tasks' | 'battery' | 'usage' | 'launcher' | 'pet'

export const WIDGET_IDS: WidgetId[] = ['clock', 'calendar', 'tasks', 'battery', 'usage', 'launcher', 'pet']

export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: '時計',
  calendar: 'カレンダー',
  tasks: '今日のタスク',
  battery: 'バッテリー',
  usage: 'AI usage',
  launcher: 'ランチャー',
  pet: 'ペット'
}

export type WidgetConfig = {
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
  /** 0..1 — white tint strength of the glass */
  opacity: number
  /** px — blur radius applied to the wallpaper backdrop */
  blur: number
  /** 1 = default size */
  scale: number
  /** false = no glass card, content floats directly on the wallpaper */
  card: boolean
}

export type LauncherItem = { name: string; path: string; args?: string; icon?: string; glyph?: string }

export type ThemeMode = 'auto' | 'light' | 'dark'

export type Config = {
  version: 1
  theme: ThemeMode
  autoLaunch: boolean
  widgets: Record<WidgetId, WidgetConfig>
  launcher: { rows: number; cols: number; iconStyle: 'clear' | 'color'; items: LauncherItem[]; openFoldersWith?: 'files' | 'explorer' }
  calendar: { hiddenIds: string[]; refreshMinutes: number }
  tasks: { vaultTaskFile: string; daysAhead: number; style?: number }
  battery: { refreshSeconds: number }
  usage: { refreshMinutes: number; hidden?: string[] }
  pet: { phrases: string[]; wakePhrase: string; variant?: number }
}

export type ThemeInfo = { dark: boolean; light: boolean; accent: string }

export type WallpaperInfo = { url: string; width: number; height: number; screenW: number; screenH: number; workW: number; workH: number; accent: string; luma: number }

export type Bounds = { x: number; y: number; width: number; height: number }

export type BatteryInfo = {
  pc: { percent: number; charging: boolean } | null
  devices: { name: string; percent: number }[]
  updatedAt: number
}

export type TaskItem = {
  id: string
  due: string | null // YYYY-MM-DD
  title: string
  note: string
  waiting: boolean
  overdueDays: number | null // null when no due
}

export type TaskList = { items: TaskItem[]; updatedAt: number; error?: string }

export type CalendarEvent = {
  id: string
  calendarId: string
  calendarName: string
  color: string
  title: string
  start: string // ISO or YYYY-MM-DD
  end: string
  allDay: boolean
}

export type CalendarData = {
  connected: boolean
  calendars: { id: string; name: string; color: string; hidden: boolean }[]
  events: CalendarEvent[]
  updatedAt: number
  error?: string
}

export type UsageWindow = { percent: number; resetsAt: string | null; label: string }
export type UsageService = {
  name: string
  status: 'ok' | 'unsupported' | 'error' | 'unauth'
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  message?: string
}
export type UsageData = { services: UsageService[]; updatedAt: number }

export type LauncherIcon = { path: string; dataUrl: string | null }

export type PetState = 'idle' | 'walk' | 'sleep' | 'jump' | 'look' | 'stretch' | 'yawn' | 'fly' | 'hover' | 'perch' | 'tease'
