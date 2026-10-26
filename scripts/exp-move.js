// Experiment: which window setups grow when moved via SetWindowPos after re-parenting to the desktop.
const { app, BrowserWindow, screen } = require('electron')
const koffi = require('koffi')
const user32 = koffi.load('user32.dll')
koffi.alias('HWND', 'uintptr_t')
const FindWindowW = user32.func('HWND __stdcall FindWindowW(const char16_t* cls, uintptr_t title)')
const SetParent = user32.func('HWND __stdcall SetParent(HWND child, HWND parent)')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(HWND h, HWND after, int x, int y, int cx, int cy, uint32_t flags)')
const RECT = koffi.struct('RECT', { left: 'int', top: 'int', right: 'int', bottom: 'int' })
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND h, int idx)')
const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(HWND h, int idx, intptr_t v)')
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(HWND h, _Out_ RECT* r)')
const rect = (h) => { const r = { left: 0, top: 0, right: 0, bottom: 0 }; GetWindowRect(h, r); return `${r.left},${r.top} ${r.right - r.left}x${r.bottom - r.top}` }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(label, opts, reparent, mover, tool = false, n = 5, gap = 120) {
  const win = new BrowserWindow({ x: 100, y: 100, width: 160, height: 160, frame: false, transparent: true, skipTaskbar: true, show: true, ...opts })
  win.loadURL(opts.anim ? 'data:text/html,<canvas id=c width=160 height=160></canvas><script>const x=c.getContext("2d");let t=0;(function f(){t++;x.clearRect(0,0,160,160);x.fillStyle="rgba(0,200,255,.8)";x.beginPath();x.arc(80,80+Math.sin(t/10)*20,40,0,7);x.fill();requestAnimationFrame(f)})()</script>' : 'data:text/html,<body style="background:rgba(0,255,0,.5)"></body>')
  await sleep(800)
  const h = Number(win.getNativeWindowHandle().readBigUInt64LE(0))
  if (tool) { const ex = Number(GetWindowLongPtrW(h, -20)); SetWindowLongPtrW(h, -20, (ex | 0x80) & ~0x40000) }
  if (reparent) SetParent(h, FindWindowW('Progman', 0))
  if (reparent) SetWindowPos(h, 0, 0, 0, 0, 0, 0x1 | 0x2 | 0x10)
  await sleep(300)
  console.log('  start', label); const out = [rect(h)]
  for (let i = 0; i < n; i++) { mover(win, h, 100 + i * 2); await sleep(gap); if (i % Math.ceil(n / 5) === 0) out.push(rect(h)) }
  out.push(rect(h))
  console.log(label, '|', out.join(' -> '))
  win.destroy()
}

app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  console.log('scale', screen.getPrimaryDisplay().scaleFactor)
  const native = (_w, h, x) => SetWindowPos(h, 0, Math.round(x * 1.25), 125, 0, 0, 0x1 | 0x4 | 0x10)
  const electronPos = (w, _h, x) => w.setPosition(x, 100)
  const nativeSize = (_w, h, x) => SetWindowPos(h, 0, Math.round(x * 1.25), 125, 200, 200, 0x4 | 0x10)
  const appOpts = { hasShadow: false, minimizable: false, maximizable: false, fullscreenable: false, resizable: true, thickFrame: false, title: 'yuta-desk exp', webPreferences: { backgroundThrottling: false, sandbox: false } }
  const bottom = (_w, h, x) => SetWindowPos(h, 0, Math.round((1200 + x) * 1.25), Math.round(764 * 1.25), 0, 0, 0x1 | 0x4 | 0x10)
  const frac = (_w, h, x) => SetWindowPos(h, 0, Math.round((1200 + x * 0.3) * 1.25), Math.round(764 * 1.25), 0, 0, 0x1 | 0x4 | 0x10)
  const anim = { ...appOpts, anim: true }
  await run('anim native       ', anim, true, native, true, 60, 16)
  await run('anim nativeSz     ', anim, true, nativeSize, true, 60, 16)
  await run('anim electronPos  ', anim, true, electronPos, true, 60, 16)
  await run('anim electronBnds ', anim, true, (w, _h, x) => w.setBounds({ x, y: 100, width: 160, height: 160 }), true, 60, 16)
  await run('anim opaque       ', { ...anim, transparent: false }, true, native, true, 60, 16)
  await run('anim toplevel     ', anim, false, native, true, 60, 16)
  return app.quit()
  await run('toplevel native   ', {}, false, native)
  await run('reparent native   ', {}, true, native)
  await run('reparent electron ', {}, true, electronPos)
  await run('reparent nativeSz ', {}, true, nativeSize)
  await run('reparent noResize ', { resizable: false }, true, native)
  await run('reparent opaque   ', { transparent: false }, true, native)
  app.quit()
})
