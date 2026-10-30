// Finds the current wallpaper file so the renderer can draw a pixel-aligned, blurred copy
// behind each widget (OS acrylic does not work on the desktop layer).
import { app, net, protocol, screen } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, statSync, watchFile, unwatchFile, copyFileSync, mkdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WallpaperInfo } from '../shared/types'
import { EventEmitter } from 'node:events'

export const wallpaperEvents = new EventEmitter()

const TRANSCODED = join(app.getPath('appData'), 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper')
let currentPath = ''
let currentMtime = 0
let dims: { width: number; height: number } = { width: 0, height: 0 }
let snapshotPath = ''
let accent = '#9fb4ff'
let luma = 40

export function registerWallpaperScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'yd', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
  ])
}

function queryRegistryWallpaper(): Promise<string> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'Wallpaper'], { windowsHide: true }, (err, out) => {
      if (err) return resolve('')
      const m = /Wallpaper\s+REG_SZ\s+(.+)\s*$/m.exec(out)
      resolve(m ? m[1].trim() : '')
    })
  })
}

async function resolveWallpaperPath(): Promise<string> {
  const reg = await queryRegistryWallpaper()
  if (reg && existsSync(reg)) return reg
  if (existsSync(TRANSCODED)) return TRANSCODED
  return ''
}

async function readDims(file: string): Promise<{ width: number; height: number }> {
  // Use Electron's image decoder; works for png/jpg/bmp.
  const { nativeImage } = await import('electron')
  const img = nativeImage.createFromPath(file)
  const s = img.getSize()
  accent = pickAccent(img)
  return { width: s.width, height: s.height }
}

/** A vivid, light-enough colour taken from the wallpaper (average of its most saturated pixels). */
function pickAccent(img: Electron.NativeImage): string {
  try {
    const small = img.resize({ width: 48, height: 27 })
    const buf = small.toBitmap() // BGRA
    const px: { r: number; g: number; b: number; s: number }[] = []
    let lsum = 0, lcount = 0
    for (let i = 0; i < buf.length; i += 4) {
      const b = buf[i], g = buf[i + 1], r = buf[i + 2]
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const s = max === 0 ? 0 : (max - min) / max
      lsum += 0.299 * r + 0.587 * g + 0.114 * b; lcount++
      if (max > 40) px.push({ r, g, b, s })
    }
    luma = lcount ? lsum / lcount : 40
    if (!px.length) return '#9fb4ff'
    px.sort((a, b) => b.s - a.s)
    const top = px.slice(0, Math.max(8, Math.floor(px.length * 0.08)))
    let r = 0, g = 0, b = 0
    for (const p of top) { r += p.r; g += p.g; b += p.b }
    r /= top.length; g /= top.length; b /= top.length
    // lift lightness so it reads on dark photos; keep hue and some saturation
    const [h, s, l] = rgbToHsl(r, g, b)
    const [r2, g2, b2] = hslToRgb(h, Math.min(0.85, Math.max(0.45, s)), Math.min(0.78, Math.max(0.62, l)))
    return '#' + [r2, g2, b2].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  } catch { return '#9fb4ff' }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

async function refresh(force = false): Promise<void> {
  const p = await resolveWallpaperPath()
  if (!p) return
  const mtime = statSync(p).mtimeMs
  if (!force && p === currentPath && mtime === currentMtime) return
  currentPath = p
  currentMtime = mtime
  // Copy to a stable snapshot so the renderer never reads a half-written slideshow file.
  const dir = join(app.getPath('userData'), 'wallpaper')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  snapshotPath = join(dir, `current-${Math.floor(mtime)}.img`)
  try {
    copyFileSync(p, snapshotPath)
  } catch {
    snapshotPath = p
  }
  dims = await readDims(snapshotPath)
  wallpaperEvents.emit('changed', getWallpaperInfo())
}

export function getWallpaperInfo(): WallpaperInfo {
  const d = screen.getPrimaryDisplay()
  return {
    url: `yd://wallpaper/current?v=${Math.floor(currentMtime)}`,
    width: dims.width,
    height: dims.height,
    screenW: d.bounds.width,
    screenH: d.bounds.height,
    workW: d.workArea.width,
    workH: d.workArea.height,
    accent,
    luma
  }
}

export async function startWallpaperService(): Promise<void> {
  protocol.handle('yd', async (req) => {
    const u = new URL(req.url)
    if (u.host === 'mock') {
      const f = join(app.getAppPath(), 'docs', 'mockups', decodeURIComponent(u.pathname.slice(1)))
      return net.fetch(pathToFileURL(f).toString(), { headers: { 'cache-control': 'no-store' } })
    }
    // test harness: YD_BG may name any image file; only that exact file is served
    const testBg = process.env.YD_BG
    if (u.host === 'testbg' && testBg && isAbsolute(testBg) && existsSync(testBg)) {
      return net.fetch(pathToFileURL(testBg).toString(), { headers: { 'cache-control': 'no-store' } })
    }
    if (u.host === 'wallpaper' && snapshotPath) {
      // readable by the pages: the cards' glass bends its pixels (light/Refraction.tsx)
      const r = await net.fetch(pathToFileURL(snapshotPath).toString(), { headers: { 'cache-control': 'no-store' } })
      const headers = new Headers(r.headers)
      headers.set('access-control-allow-origin', '*')
      return new Response(r.body, { status: r.status, headers })
    }
    return new Response('not found', { status: 404 })
  })
  await refresh(true)
  // Slideshow or manual change: TranscodedWallpaper is rewritten; the registry value may also change.
  const watchTarget = existsSync(TRANSCODED) ? TRANSCODED : currentPath
  if (watchTarget) watchFile(watchTarget, { interval: 5000 }, () => void refresh())
  setInterval(() => void refresh(), 30_000)
  screen.on('display-metrics-changed', () => wallpaperEvents.emit('changed', getWallpaperInfo()))
  app.on('before-quit', () => { if (watchTarget) unwatchFile(watchTarget) })
}
