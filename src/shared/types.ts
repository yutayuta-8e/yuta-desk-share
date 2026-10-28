export type WidgetId = 'clock' | 'calendar' | 'tasks' | 'battery' | 'usage' | 'launcher' | 'pet' | 'media'

export const WIDGET_IDS: WidgetId[] = ['clock', 'calendar', 'tasks', 'battery', 'usage', 'launcher', 'media', 'pet']

export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: '時計',
  calendar: 'カレンダー',
  tasks: '今日のタスク',
  battery: 'バッテリー',
  usage: 'AI usage',
  launcher: 'ランチャー',
  pet: 'ペット',
  media: '再生中'
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

/**
 * glyph: a mark of light chosen instead of the icon. logo: the id of the app's own logo drawn as lines,
 * kept only on this PC (<userData>/launcher-logos.json, never in the repository). mask: the original
 * mark shown instead when the launcher is set to hide logos for screenshots (2026-10-28).
 */
export type LauncherItem = { name: string; path: string; args?: string; icon?: string; glyph?: string; logo?: string; mask?: string }

export type ThemeMode = 'auto' | 'light' | 'dark'

export type Config = {
  version: 1
  theme: ThemeMode
  autoLaunch: boolean
  widgets: Record<WidgetId, WidgetConfig>
  launcher: { rows: number; cols: number; iconStyle: 'clear' | 'color'; items: LauncherItem[]; openFoldersWith?: 'files' | 'explorer'; iconSet?: 'logo' | 'mask' }
  /** marksFile: the Vault list of subscription renewals and money days (default: life/サブスクとお金の日.md) */
  calendar: { hiddenIds: string[]; refreshMinutes: number; marksFile?: string }
  tasks: { vaultTaskFile: string; daysAhead: number; style?: number }
  battery: { refreshSeconds: number }
  usage: { refreshMinutes: number; hidden?: string[] }
  pet: { phrases: string[]; wakePhrase: string; variant?: number; face?: number }
  /** what the media widget's SoundCloud entrance plays (an embeddable SoundCloud address) */
  media?: { soundcloudUrl?: string }
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
  end: string // all-day: the day after the last (Google's exclusive end)
  allDay: boolean
  location?: string
  recurring?: boolean
}

/**
 * A day that comes back every month (month unset) or every year: a subscription renewal ('sub') or a
 * money day such as a card payment ('money'). Read from the Vault list, not from Google.
 */
export type CalendarMark = { kind: 'sub' | 'money'; name: string; day: number; month?: number; note?: string }

export type CalendarData = {
  connected: boolean
  calendars: { id: string; name: string; color: string; hidden: boolean; writable?: boolean; primary?: boolean }[]
  events: CalendarEvent[]
  marks: CalendarMark[]
  updatedAt: number
  error?: string
}

export type EventRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'other'

/** One event in full, fetched when its card opens. reminders: minutes before (the calendar's own when the event uses them). */
export type EventDetail = CalendarEvent & { description?: string; reminders: number[]; repeat: EventRepeat; htmlLink?: string; writable: boolean }

/** What the add / edit window sends. Dates are YYYY-MM-DD, times HH:MM (ignored when allDay). */
export type EventDraft = {
  calendarId: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  startTime: string
  endTime: string
  location: string
  description: string
  reminder: number | null
  repeat: 'none' | 'weekly' | 'monthly' | 'yearly'
}

/**
 * The card beside the calendar: an event's details (anchorY: the middle of its row, in the calendar
 * window), adding one, or the subscriptions (2026-10-28).
 */
export type CalCardRequest = { mode: 'detail'; eventId: string; anchorY: number } | { mode: 'add'; date: string } | { mode: 'subs' }
/** What the card shows now; main places it by this (and closes the two lists when the owner looks away). */
export type CalCardView = 'detail' | 'form' | 'subs' | 'subform'
/** What main tells the calendar while the subscriptions card is open (an event's card sends its id). */
export const SUBS_CARD_STATE = ':subs'

/** One subscription as the card adds / edits it: a line under 「サブスク」 in the Vault list. month unset = every month. */
export type SubDraft = { name: string; month?: number; day: number; amount: number | null; currency: 'JPY' | 'USD' }

export type UsageWindow = { percent: number; resetsAt: string | null; label: string }
export type UsageService = {
  name: string
  status: 'ok' | 'unsupported' | 'error' | 'unauth'
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  message?: string
  /** when the numbers were taken (ms); older numbers are marked in the widget */
  asOf?: number
}
export type UsageData = { services: UsageService[]; updatedAt: number }

/** What is playing: an app reported by Windows, yuta-desk's own SoundCloud player, or nothing. */
export type MediaState = { kind: 'idle' } | {
  kind: 'app' | 'soundcloud'
  app?: string
  status: 'Playing' | 'Paused'
  title: string
  artist: string
  /** data: URL or https URL, shown as is */
  thumbnail: string | null
  /** seconds, as of updatedAt (ms) */
  position: number
  duration: number
  updatedAt: number
  canNext: boolean
  canPrev: boolean
  /** the playing app's own icon (data: URL), shown on the thumbnail's corner */
  appIcon?: string | null
}

export type LauncherIcon = { path: string; dataUrl: string | null }

export type PetState = 'idle' | 'walk' | 'sleep' | 'jump' | 'look' | 'stretch' | 'yawn' | 'fly' | 'hover' | 'perch' | 'tease'
