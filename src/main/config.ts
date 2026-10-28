import { app, screen } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Config, WidgetConfig, WidgetId } from '../shared/types'
import { PET_PHRASES } from '../shared/petPhrases'

const DEFAULT_VAULT_TASK = join(homedir(), 'library', '資料', 'ai-context', 'admin', 'タスク.md')

const CALENDAR_H = 490

function w(x: number, y: number, wd: number, h: number, extra: Partial<WidgetConfig> = {}): WidgetConfig {
  return { enabled: true, x, y, w: wd, h, opacity: 0.14, blur: 28, scale: 1, card: true, ...extra }
}

export function defaultConfig(): Config {
  return {
    version: 1,
    theme: 'auto',
    autoLaunch: false,
    widgets: {
      clock: w(418, 30, 700, 300, { card: false }),
      battery: w(40, 40, 320, 150, { card: false }),
      usage: w(40, 190, 340, 320, { card: false }),
      tasks: w(40, 520, 420, 300, { card: false }),
      launcher: w(1196, 40, 300, 380, { card: false }),
      // six weeks always and four rows below them (design 2, 2026-10-28)
      calendar: w(1156, 422, 340, CALENDAR_H, { card: false }),
      pet: w(600, 700, 300, 210, { opacity: 0, blur: 0 }),
      // bottom centre, just above the taskbar (owner, 2026-10-27)
      media: w(538, 812, 460, 96, { card: false })
    },
    launcher: { rows: 3, cols: 3, iconStyle: 'clear', items: [] },
    calendar: { hiddenIds: [], refreshMinutes: 10 },
    tasks: { vaultTaskFile: DEFAULT_VAULT_TASK, daysAhead: 3 },
    battery: { refreshSeconds: 60 },
    usage: { refreshMinutes: 5 },
    pet: { phrases: [...PET_PHRASES], wakePhrase: '…はっ！', face: 5 },
    media: {}
  }
}

export function configDir(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

export function configPath(): string {
  return join(configDir(), 'config.json')
}

let current: Config | null = null

export function loadConfig(): Config {
  const def = defaultConfig()
  try {
    if (existsSync(configPath())) {
      const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<Config>
      const merged: Config = {
        ...def,
        ...raw,
        widgets: { ...def.widgets },
        launcher: { ...def.launcher, ...(raw.launcher ?? {}) },
        calendar: { ...def.calendar, ...(raw.calendar ?? {}) },
        tasks: { ...def.tasks, ...(raw.tasks ?? {}) },
        battery: { ...def.battery, ...(raw.battery ?? {}) },
        usage: { ...def.usage, ...(raw.usage ?? {}) },
        pet: { ...def.pet, ...(raw.pet ?? {}) }
      }
      for (const id of Object.keys(def.widgets) as WidgetId[]) {
        merged.widgets[id] = { ...def.widgets[id], ...((raw.widgets ?? {})[id] ?? {}) }
      }
      // the calendar grew (six weeks always): it grows downward, and moves up only as far as it must
      // to stay above the taskbar (upward it would run under the launcher)
      const cal = merged.widgets.calendar
      if (cal.h < CALENDAR_H) {
        const area = screen.getPrimaryDisplay().workArea
        cal.h = CALENDAR_H
        cal.y = Math.max(area.y, Math.min(cal.y, area.y + area.height - CALENDAR_H))
      }
      current = merged
    } else {
      current = def
      saveConfig(current)
    }
  } catch (e) {
    console.error('[config] failed to load, using defaults', e)
    current = def
  }
  return current
}

export function getConfig(): Config {
  return current ?? loadConfig()
}

let saveTimer: NodeJS.Timeout | null = null
export function saveConfig(cfg: Config = getConfig()): void {
  current = cfg
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
    } catch (e) {
      console.error('[config] save failed', e)
    }
  }, 300)
}

export function updateConfig(mut: (c: Config) => void): Config {
  const c = getConfig()
  mut(c)
  saveConfig(c)
  return c
}
