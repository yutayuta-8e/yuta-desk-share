// Experiment: do mouse events reach a transparent window (a) top-level, (b) re-parented to the desktop?
const { app, BrowserWindow } = require('electron')
const { execFile } = require('node:child_process')
const koffi = require('koffi')
const user32 = koffi.load('user32.dll')
koffi.alias('HWND', 'uintptr_t')
const FindWindowW = user32.func('HWND __stdcall FindWindowW(const char16_t* cls, uintptr_t title)')
const SetParent = user32.func('HWND __stdcall SetParent(HWND child, HWND parent)')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(HWND h, HWND after, int x, int y, int cx, int cy, uint32_t flags)')
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND h, int idx)')
const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(HWND h, int idx, intptr_t v)')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (x, y) => new Promise((r) => execFile('powershell', ['-NoProfile', '-Command', `
$c=@'
using System; using System.Runtime.InteropServices;
public class I { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint a,uint b,uint d,UIntPtr e); }
'@
Add-Type -TypeDefinition $c; [I]::SetProcessDPIAware() | Out-Null; [I]::SetCursorPos(${x},${y}) | Out-Null; Start-Sleep -m 150; [I]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -m 60; [I]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -m 200; [I]::SetCursorPos(${x}+40,${y}+20) | Out-Null`], () => r()))

async function run(label, mode) {
  const win = new BrowserWindow({ x: 300, y: 300, width: 200, height: 200, frame: false, transparent: true, skipTaskbar: true, show: true, webPreferences: { backgroundThrottling: false } })
  const got = []
  win.webContents.on('input-event', (_e, i) => got.push(i.type))
  win.loadURL('data:text/html,<body style="margin:0;background:rgba(0,200,255,.6)"></body>')
  await sleep(800)
  const h = Number(win.getNativeWindowHandle().readBigUInt64LE(0))
  const progman = FindWindowW('Progman', 0)
  if (mode === 'parent' || mode === 'parent+tool') {
    if (mode === 'parent+tool') { const ex = Number(GetWindowLongPtrW(h, -20)); SetWindowLongPtrW(h, -20, (ex | 0x80) & ~0x40000) }
    SetParent(h, progman); SetWindowPos(h, 0, 0, 0, 0, 0, 0x1 | 0x2 | 0x10)
  }
  if (mode === 'owner') { SetWindowLongPtrW(h, -8, progman); SetWindowPos(h, 1, 0, 0, 0, 0, 0x1 | 0x2 | 0x10) } // HWND_BOTTOM
  if (mode === 'parent+child') { const st = Number(GetWindowLongPtrW(h, -16)); SetWindowLongPtrW(h, -16, (st | 0x40000000) & ~0x80000000); SetParent(h, progman); SetWindowPos(h, 0, 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x20) }
  await sleep(500)
  await click(500, 500)
  await sleep(400)
  console.log(label.padEnd(14), '|', got.join(',') || '(nothing)')
  win.destroy()
}
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  await run('toplevel', 'none')
  await run('parent', 'parent')
  await run('parent+tool', 'parent+tool')
  await run('parent+child', 'parent+child')
  await run('owner', 'owner')
  app.quit()
})
