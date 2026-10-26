import { app, Menu, Tray, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { configPath, getConfig, updateConfig } from './config'
import { applyWidgetEnabled, reloadAll, themeMenuItems, widgetToggleItems, setEditMode, isEditMode } from './windows'

let tray: Tray | null = null

// Auto-launch via a shortcut in the user's Startup folder. The Run registry key that Electron's
// setLoginItemSettings writes was not executed at logon on this machine (2026-10-25), while a
// Startup-folder shortcut is run by Explorer itself and also sets the working directory.
import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'

function startupLink(): string {
  return join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'yuta-desk.lnk')
}

export function isAutoLaunchEnabled(): boolean {
  return existsSync(startupLink())
}

export function setAutoLaunch(on: boolean): void {
  // remove the legacy Run-key entry either way
  try { app.setLoginItemSettings({ openAtLogin: false }) } catch { /* ignore */ }
  const lnk = startupLink()
  if (!on) {
    try { if (existsSync(lnk)) unlinkSync(lnk) } catch { /* ignore */ }
  } else {
    // dev checkout: go through scripts/launch.vbs (hidden, logged, retries); packaged: the exe itself
    const vbs = join(app.getAppPath(), 'scripts', 'launch.vbs')
    const target = app.isPackaged ? process.execPath : join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'wscript.exe')
    const args = app.isPackaged ? '' : `"${vbs}"`
    const cwd = app.isPackaged ? join(process.execPath, '..') : app.getAppPath()
    const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); $s.TargetPath = '${target.replace(/'/g, "''")}'; $s.Arguments = '${args.replace(/'/g, "''")}'; $s.WorkingDirectory = '${cwd.replace(/'/g, "''")}'; $s.Description = 'yuta-desk'; $s.Save()`
    try { execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }) } catch (e) { console.error('[autolaunch]', e) }
  }
  updateConfig((c) => { c.autoLaunch = on })
}

export function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'yuta-desk', enabled: false },
    { type: 'separator' },
    { label: 'ウィジェット', submenu: widgetToggleItems() },
    { label: 'テーマ', submenu: themeMenuItems() },
    isEditMode()
      ? { label: '配置の編集を終わる', click: () => { setEditMode(false); refreshTray() } }
      : { label: '配置を編集する', click: () => { setEditMode(true); refreshTray() } },
    { label: 'すべて表示', click: () => { updateConfig((c) => { for (const k of Object.keys(c.widgets) as (keyof typeof c.widgets)[]) c.widgets[k].enabled = true }); applyWidgetEnabled() } },
    { type: 'separator' },
    { label: 'Windows 起動時に自動起動', type: 'checkbox', checked: isAutoLaunchEnabled(), click: (item) => { setAutoLaunch(item.checked); refreshTray() } },
    { label: '設定ファイルを開く', click: () => void shell.openPath(configPath()) },
    { label: '設定フォルダを開く', click: () => void shell.openPath(app.getPath('userData')) },
    { label: '再読み込み', click: reloadAll },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ])
}

export function refreshTray(): void {
  if (tray) tray.setContextMenu(buildTrayMenu())
}

export function createTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'resources', 'tray.png')
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(img)
  tray.setToolTip('yuta-desk')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => tray?.popUpContextMenu())
  // config.json is the source of truth; push it to Windows' login items.
  if (getConfig().autoLaunch !== isAutoLaunchEnabled()) setAutoLaunch(getConfig().autoLaunch)
}
