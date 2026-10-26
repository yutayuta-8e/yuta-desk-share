// Dev tool: shows every pet look in every pose (the same drawing code as the real pet) and saves a PNG.
// Usage (after `npm run build`): npx electron scripts/pet-sheet.js <out.png> [wallpaper image] [seconds to stay open]
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')

const out = process.argv[2] || join(__dirname, '..', 'pet-sheet.png')
const bg = process.argv[3] ? pathToFileURL(process.argv[3]).toString() : ''
const stay = Number(process.argv[4] || 0)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: 0, y: 0, width: 1180, height: 760, frame: false, show: true, alwaysOnTop: true, backgroundColor: '#141019', webPreferences: { backgroundThrottling: false } })
  win.webContents.on('console-message', (_e, level, msg) => { console.log('[page]', level, msg.slice(0, 300)) })
  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'), { search: `widget=petsheet${bg ? '&bg=' + encodeURIComponent(bg) : ''}` })
  await new Promise((r) => setTimeout(r, 2500))
  writeFileSync(out, (await win.webContents.capturePage()).toPNG())
  console.log('saved', out)
  setTimeout(() => app.quit(), stay * 1000)
})
