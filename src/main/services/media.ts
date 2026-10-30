// Now playing: what Windows reports through its media controls (resources/media-bridge.ps1, any
// app: browsers, Spotify, ...) and yuta-desk's own SoundCloud player (a hidden window that plays the
// owner's likes when nothing else is playing). One merged state goes to the media widget.
import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { bootLog } from '../boot'
import { getConfig } from '../config'
import { getIcon } from './launcher'
import { pageArtFor, startPageArt, stopPageArt } from './pageArt'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import type { MediaState } from '../../shared/types'

export const mediaEvents = new EventEmitter()
// The likes to play are config.media.soundcloudUrl, written only in the owner's own config.json, never
// in this repository. The embedded player plays likes only through the API form of the address
// (https://api.soundcloud.com/users/<number>/favorites); the page address resolves to the profile,
// which has no tracks.

type Smtc = { active: false } | {
  active: true; app: string; status: string; title: string; artist: string; position: number; duration: number
  updatedAt: number; canNext: boolean; canPrev: boolean; thumbnail?: string | null
}
type Sc = { ready: boolean; playing: boolean; title: string; artist: string; artwork: string; position: number; duration: number }

let bridge: ChildProcessWithoutNullStreams | null = null
let smtc: Smtc = { active: false }
let smtcThumb: string | null = null
let player: BrowserWindow | null = null
let sc: (Sc & { at: number }) | null = null
let current: MediaState = { kind: 'idle' }
let restarts = 0
const iconCache = new Map<string, string | null>()
let iconFor = ''

/** Where the app behind a media session lives, so its own icon can be shown. */
function exeCandidates(aumid: string): string[] {
  const a = aumid.toLowerCase()
  const pf = process.env.ProgramFiles ?? 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? '', roaming = process.env.APPDATA ?? ''
  if (a.includes('brave')) return [join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'), join(local, 'BraveSoftware/Brave-Browser/Application/brave.exe')]
  if (a.includes('chrome')) return [join(pf, 'Google/Chrome/Application/chrome.exe'), join(local, 'Google/Chrome/Application/chrome.exe')]
  if (a.includes('msedge') || a.includes('edge')) return [join(pf86, 'Microsoft/Edge/Application/msedge.exe'), join(pf, 'Microsoft/Edge/Application/msedge.exe')]
  if (a.includes('spotify')) return [join(roaming, 'Spotify/Spotify.exe')]
  if (a.includes('firefox') || a === '308046b0af4a39cb') return [join(pf, 'Mozilla Firefox/firefox.exe')]
  return []
}

/** The running process of that name, as a last resort. */
function exeOfProcess(aumid: string): Promise<string | null> {
  const name = aumid.replace(/\.exe$/i, '').split(/[\\/!]/).pop() ?? ''
  if (!/^[\w .-]+$/.test(name)) return Promise.resolve(null)
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1).Path`],
    { windowsHide: true, timeout: 8000 }, (_e, out) => { const p = String(out ?? '').trim(); resolve(p && existsSync(p) ? p : null) }))
}

async function resolveAppIcon(aumid: string): Promise<void> {
  if (iconCache.has(aumid)) return
  iconCache.set(aumid, null)
  const exe = exeCandidates(aumid).find((p) => existsSync(p)) ?? await exeOfProcess(aumid)
  if (exe) iconCache.set(aumid, (await getIcon(exe)).dataUrl)
  emit()
}

function resource(name: string): string {
  return join(app.getAppPath(), 'resources', name)
}

function emit(): void {
  const next = merge()
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  mediaEvents.emit('changed', current)
}

/** Our SoundCloud player wins while it is playing, or while nothing else is. */
function merge(): MediaState {
  const scActive = !!(player && sc && sc.title)
  const smtcPlaying = smtc.active && smtc.status === 'Playing'
  if (scActive && (sc!.playing || !smtcPlaying)) {
    return {
      kind: 'soundcloud', status: sc!.playing ? 'Playing' : 'Paused', title: sc!.title, artist: sc!.artist,
      thumbnail: sc!.artwork || null, position: sc!.position, duration: sc!.duration, updatedAt: sc!.at, canNext: true, canPrev: true
    }
  }
  if (smtc.active) {
    return {
      kind: 'app', app: smtc.app, status: smtc.status === 'Playing' ? 'Playing' : 'Paused', title: smtc.title, artist: smtc.artist,
      thumbnail: pageArtFor(smtc.title) ?? smtcThumb, position: smtc.position, duration: smtc.duration, updatedAt: smtc.updatedAt || Date.now(),
      canNext: smtc.canNext, canPrev: smtc.canPrev, appIcon: iconCache.get(smtc.app) ?? null
    }
  }
  return { kind: 'idle' }
}

export function startMediaService(): void {
  if (process.env.YD_SC_AUTOSTART && !player) setTimeout(playSoundCloud, 4000) // checks only
  if (bridge) return
  startPageArt(emit)
  bridge = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resource('media-bridge.ps1')], { windowsHide: true })
  let buf = ''
  bridge.stdout.setEncoding('utf8')
  bridge.stdout.on('data', (chunk: string) => {
    buf += chunk
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try {
        const o = JSON.parse(line) as Smtc | { volume: number }
        if ('volume' in o) { volumeWaiters.shift()?.(o.volume >= 0 ? o.volume : null); continue }
        if (process.env.YD_MEDIA_IGNORE_APPS) continue // checks only: behave as if no app were playing
        const s = o
        if (s.active && 'thumbnail' in s) smtcThumb = s.thumbnail ?? null
        smtc = s
        if (s.active && s.app && s.app !== iconFor) { iconFor = s.app; void resolveAppIcon(s.app) }
        emit()
      } catch { /* not a state line */ }
    }
  })
  bridge.stderr.on('data', (d) => bootLog(`media bridge: ${String(d).slice(0, 200)}`))
  bridge.on('exit', (code) => {
    bridge = null
    smtc = { active: false }
    emit()
    // keep it running (a few restarts, then give up until the app restarts)
    if (restarts++ < 5) setTimeout(startMediaService, 3000)
    else bootLog(`media bridge stopped (exit ${code})`)
  })
}

export function stopMediaService(): void {
  restarts = 99
  stopPageArt()
  bridge?.stdin.end()
  bridge?.kill()
  bridge = null
  player?.destroy()
  player = null
}

export function getMediaState(): MediaState { return current }

/** Starts the owner's SoundCloud likes in a hidden player window. */
export function playSoundCloud(): void {
  if (player && !player.isDestroyed()) { void player.webContents.executeJavaScript("window.ydCommand && window.ydCommand('play')"); return }
  const url = getConfig().media?.soundcloudUrl
  if (!url) return
  player = new BrowserWindow({
    show: false, width: 420, height: 200, skipTaskbar: true, title: 'yuta-desk SoundCloud',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  player.webContents.on('console-message', (_e, _level, message) => {
    if (!message.startsWith('YDSC ')) return
    try { sc = { ...(JSON.parse(message.slice(5)) as Sc), at: Date.now() }; emit() } catch { /* ignore */ }
  })
  // links inside the SoundCloud widget must not open windows of their own
  player.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.YD_MEDIA_MUTE) player.webContents.setAudioMuted(true) // checks only: no sound
  player.on('closed', () => { player = null; sc = null; emit() })
  void player.loadFile(resource('soundcloud-player.html'), { search: `url=${encodeURIComponent(url)}` })
  bootLog('media: soundcloud player started')
}

/** Buttons on the widget: toggle / next / prev go to whatever is shown; close stops our player. */
export function mediaCommand(cmd: 'toggle' | 'next' | 'prev' | 'close'): void {
  if (cmd === 'close') { player?.destroy(); player = null; sc = null; emit(); return }
  if (current.kind === 'soundcloud' && player && !player.isDestroyed()) {
    void player.webContents.executeJavaScript(`window.ydCommand && window.ydCommand(${JSON.stringify(cmd)})`)
    return
  }
  if (current.kind === 'app') bridge?.stdin.write(`${cmd}\n`)
}

const ourPlayer = () => (current.kind === 'soundcloud' && player && !player.isDestroyed() ? player : null)

/** Moves whatever is shown to `sec` seconds into the track. */
export function mediaSeek(sec: number): void {
  if (!Number.isFinite(sec) || sec < 0) return
  const p = ourPlayer()
  if (p) { void p.webContents.executeJavaScript(`window.ydCommand && window.ydCommand('seek', ${Math.round(sec * 1000)})`); return }
  if (current.kind === 'app') bridge?.stdin.write(`seek ${sec.toFixed(1)}\n`)
}

// getvolume answers come back on the bridge's stdout as {"volume": x}, in the order they were asked
const volumeWaiters: ((v: number | null) => void)[] = []

/**
 * The Windows master volume, 0..1 (0 while muted), whatever is playing: our SoundCloud player and
 * the apps alike (the owner, 2026-10-30; until then each source's own volume). null when it cannot be
 * read.
 */
export function getMediaVolume(): Promise<number | null> {
  if (!bridge) return Promise.resolve(null)
  return new Promise((resolve) => {
    const done = (v: number | null) => { clearTimeout(t); resolve(v) }
    const t = setTimeout(() => { const i = volumeWaiters.indexOf(done); if (i >= 0) volumeWaiters.splice(i, 1); resolve(null) }, 5000)
    volumeWaiters.push(done)
    bridge!.stdin.write('getvolume\n')
  })
}

/** Sets the master volume; above 0 it also lifts a mute, as the Windows slider does. */
export function setMediaVolume(v: number): void {
  if (!Number.isFinite(v)) return
  const x = Math.max(0, Math.min(1, v))
  bridge?.stdin.write(`volume ${x.toFixed(3)}\n`)
}
