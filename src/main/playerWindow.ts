// The full-screen "now playing" view, opened from the media widget. An ordinary top-level window, not
// on the desktop layer: it covers the taskbar and gets the keyboard (Esc closes it). Its background is
// the wallpaper itself, drawn by the renderer, so it looks like the desktop with the widgets put away.
//
// Windows keeps the taskbar under a full-screen window only while that window is the active one. After
// a lock and unlock the player was no longer active and the taskbar sat over its bottom row (owner's
// screenshot, 2026-10-28 00:01; the log has the lock at 00:00:08 and the unlock at 00:00:26). So the
// player stays above the taskbar ('screen-saver'; Electron puts the lower levels behind it) until
// another app is chosen, and comes back to the front after an unlock or a wake.
import { BrowserWindow, powerMonitor, screen } from 'electron'
import { join } from 'node:path'
import { addBroadcastTarget } from './windows'

let win: BrowserWindow | null = null
let hooked = false

export function getPlayerWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

/** In front of everything, the taskbar included, and active if Windows allows it. */
function raise(w: BrowserWindow): void {
  if (w.isDestroyed()) return
  w.setAlwaysOnTop(true, 'screen-saver')
  w.show()
  w.focus()
  w.moveTop()
}

function hookPower(): void {
  if (hooked) return
  hooked = true
  // the desktop is still settling right after an unlock: raise once soon and once more a little later
  const back = () => {
    for (const ms of [800, 2500]) setTimeout(() => { const w = getPlayerWindow(); if (w) raise(w) }, ms)
  }
  powerMonitor.on('unlock-screen', back)
  powerMonitor.on('resume', back)
}

export function openPlayer(): void {
  hookPower()
  const open = getPlayerWindow()
  if (open) { raise(open); return }
  const d = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    ...d.bounds, fullscreen: true, frame: false, show: false, skipTaskbar: true, backgroundColor: '#000000',
    title: 'yuta-desk 再生中',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  addBroadcastTarget(win)
  const q = '?widget=player'
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL + q)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { search: q })
  const me = win
  me.once('ready-to-show', () => raise(me))
  // another app was chosen (Alt+Tab, a click elsewhere): step back so it can be seen; using the player
  // again puts it back on top
  me.on('blur', () => { if (!me.isDestroyed()) me.setAlwaysOnTop(false) })
  me.on('focus', () => { if (!me.isDestroyed()) me.setAlwaysOnTop(true, 'screen-saver') })
  // an older window closing late must not forget the new one
  me.on('closed', () => { if (win === me) win = null })
}

export function closePlayer(): void {
  getPlayerWindow()?.close()
}
