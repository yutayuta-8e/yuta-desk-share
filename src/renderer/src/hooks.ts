import { useEffect, useState } from 'react'
import { yd } from './api'
import type { Bounds, Config, ThemeInfo, WallpaperInfo } from '@shared/types'

export function useConfig(): Config | null {
  const [cfg, set] = useState<Config | null>(null)
  useEffect(() => {
    void yd.getConfig().then(set)
    return yd.onConfig(set)
  }, [])
  return cfg
}

export function useTheme(): ThemeInfo {
  const [t, set] = useState<ThemeInfo>({ dark: false, light: false, accent: '#7aa2ff' })
  useEffect(() => {
    void yd.getTheme().then(set)
    return yd.onTheme(set)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = t.dark ? 'dark' : t.light ? 'light' : 'frost'
  }, [t])
  return t
}

export function useWallpaper(): WallpaperInfo | null {
  const [w, set] = useState<WallpaperInfo | null>(null)
  useEffect(() => {
    void yd.getWallpaper().then(set)
    return yd.onWallpaper(set)
  }, [])
  return w
}

export function useBounds(): Bounds | null {
  const [b, set] = useState<Bounds | null>(null)
  useEffect(() => {
    void yd.getBounds().then((x) => { if (x) set(x) })
    return yd.onBounds(set)
  }, [])
  return b
}

export function useNow(intervalMs = 1000): Date {
  const [now, set] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => set(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Subscribes to a push channel and fetches the initial value. */
export function useFeed<T>(get: () => Promise<T>, on: (fn: (v: T) => void) => () => void): T | null {
  const [v, set] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    void get().then((x) => { if (alive) set(x) })
    const off = on((x) => set(x))
    return () => { alive = false; off() }
  }, [get, on])
  return v
}
