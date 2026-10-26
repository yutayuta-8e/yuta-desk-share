import { nativeTheme, systemPreferences } from 'electron'
// 'auto' and 'dark' both use white text; 'light' switches to dark text for bright wallpapers.
import { EventEmitter } from 'node:events'
import { getConfig } from './config'
import type { ThemeInfo } from '../shared/types'

export const themeEvents = new EventEmitter()

export function getThemeInfo(): ThemeInfo {
  const mode = getConfig().theme
  const dark = mode === 'dark'
  let accent = '#7aa2ff'
  try {
    const a = systemPreferences.getAccentColor() // RRGGBBAA
    if (a && a.length >= 6) accent = '#' + a.slice(0, 6)
  } catch { /* ignore */ }
  return { dark, light: mode === 'light', accent }
}

export function startThemeService(): void {
  nativeTheme.on('updated', () => themeEvents.emit('changed', getThemeInfo()))
  try {
    systemPreferences.on('accent-color-changed', () => themeEvents.emit('changed', getThemeInfo()))
  } catch { /* not on all platforms */ }
}

export function notifyThemeChanged(): void {
  themeEvents.emit('changed', getThemeInfo())
}
