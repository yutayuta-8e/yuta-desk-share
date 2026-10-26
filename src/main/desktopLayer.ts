// Places a window on the desktop (inside Progman / WorkerW) so it survives Win+D and never
// floats above apps. Our windows are z-ordered above the icon list (SHELLDLL_DefView) so they
// receive mouse input; the user keeps desktop icons hidden, so nothing is covered.
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')
koffi.alias('HWND', 'uintptr_t')
const FindWindowW = user32.func('HWND __stdcall FindWindowW(const char16_t* cls, uintptr_t title)')
const FindWindowExW = user32.func('HWND __stdcall FindWindowExW(HWND parent, HWND after, const char16_t* cls, uintptr_t title)')
const SendMessageTimeoutW = user32.func('intptr_t __stdcall SendMessageTimeoutW(HWND h, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t* result)')
const SetParent = user32.func('HWND __stdcall SetParent(HWND child, HWND parent)')
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(HWND h, intptr_t lp)')
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc* cb, intptr_t lp)')
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND h, int idx)')
const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(HWND h, int idx, intptr_t v)')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(HWND h, HWND after, int x, int y, int cx, int cy, uint32_t flags)')

const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_CHILD = 0x40000000
const WS_POPUP = 0x80000000
const SWP_FRAMECHANGED = 0x20
const WS_EX_TOOLWINDOW = 0x80
const WS_EX_APPWINDOW = 0x40000
const HWND_TOP = 0
const SWP_NOMOVE = 0x2
const SWP_NOSIZE = 0x1
const SWP_NOACTIVATE = 0x10

export type LayerMode = 'workerw-host' | 'progman' | 'none'

let cachedHost: { hwnd: number; mode: LayerMode } | null = null

function findDesktopHost(): { hwnd: number; mode: LayerMode } {
  const progman = FindWindowW('Progman', 0) as number
  if (!progman) return { hwnd: 0, mode: 'none' }
  // Ask Progman to spawn WorkerW windows (needed on older layouts; harmless on 24H2+).
  const out = [0]
  SendMessageTimeoutW(progman, 0x052c, 0xd, 0, 0, 1000, out)
  SendMessageTimeoutW(progman, 0x052c, 0xd, 1, 0, 1000, out)

  // The window that hosts SHELLDLL_DefView is the desktop surface. Progman on Win11 24H2+,
  // a top-level WorkerW on older builds.
  if (FindWindowExW(progman, 0, 'SHELLDLL_DefView', 0)) return { hwnd: progman, mode: 'progman' }
  let host = 0
  EnumWindows((h: number) => {
    if (FindWindowExW(h, 0, 'SHELLDLL_DefView', 0)) { host = h; return false }
    return true
  }, 0)
  if (host) return { hwnd: host, mode: 'workerw-host' }
  return { hwnd: progman, mode: 'progman' }
}

/** True once the shell's desktop window exists (it appears a few seconds after login). */
export function desktopReady(): boolean {
  return Number(FindWindowW('Progman', 0)) !== 0
}

export function attachToDesktop(handle: Buffer): LayerMode {
  const hwnd = Number(handle.readBigUInt64LE(0))
  if (!cachedHost || !cachedHost.hwnd) cachedHost = findDesktopHost()
  if (!cachedHost.hwnd) return 'none'
  const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW)
  // A real child window (WS_CHILD) is required for mouse input to reach us once we live
  // inside the desktop; a re-parented popup only gets hover events.
  const st = Number(GetWindowLongPtrW(hwnd, GWL_STYLE))
  SetWindowLongPtrW(hwnd, GWL_STYLE, (st | WS_CHILD) & ~WS_POPUP)
  SetParent(hwnd, cachedHost.hwnd)
  SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED)
  return cachedHost.mode
}

export function raiseOnDesktop(handle: Buffer): void {
  const hwnd = Number(handle.readBigUInt64LE(0))
  SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
}

// ---- geometry in physical pixels, bypassing Electron's DIP conversion (it double-scales
// windows that were re-parented onto the desktop) ----
const RECT = koffi.struct('RECT', { left: 'int', top: 'int', right: 'int', bottom: 'int' })
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(HWND h, _Out_ RECT* r)')
const SWP_NOZORDER = 0x4

export type Rect = { x: number; y: number; width: number; height: number }

export function getRectDip(handle: Buffer, scale: number): Rect {
  const hwnd = Number(handle.readBigUInt64LE(0))
  const r = { left: 0, top: 0, right: 0, bottom: 0 }
  GetWindowRect(hwnd, r)
  return { x: r.left / scale, y: r.top / scale, width: (r.right - r.left) / scale, height: (r.bottom - r.top) / scale }
}

export function setRectDip(handle: Buffer, scale: number, r: Rect): void {
  const hwnd = Number(handle.readBigUInt64LE(0))
  SetWindowPos(hwnd, 0, Math.round(r.x * scale), Math.round(r.y * scale), Math.round(r.width * scale), Math.round(r.height * scale), SWP_NOZORDER | SWP_NOACTIVATE)
}

export function movePhysical(handle: Buffer, scale: number, x: number, y: number): void {
  const hwnd = Number(handle.readBigUInt64LE(0))
  SetWindowPos(hwnd, 0, Math.round(x * scale), Math.round(y * scale), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
}
