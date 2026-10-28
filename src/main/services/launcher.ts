import { app, shell } from 'electron'
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getConfig } from '../config'
import { bootLog } from '../boot'
import { execFile } from 'node:child_process'
import type { LauncherIcon } from '../../shared/types'

const cache = new Map<string, string | null>()

/**
 * The apps' own logos drawn as lines of light (2026-10-28): path data in the launcher's 48x48 box, by id.
 * They are other companies' marks, so they live only on this PC, beside the config, and are never part of
 * the repository; with the file missing every app simply shows its icon.
 */
export function readLogos(): Record<string, string> {
  const f = join(app.getPath('userData'), 'launcher-logos.json')
  try { return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>) : {} } catch { return {} }
}

/** Windows' own associated-icon extraction; more reliable than Electron's for some installers. */
function extractAssociatedIcon(path: string): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Icon]::ExtractAssociatedIcon('${path.replace(/'/g, "''")}')
if ($i) { $b = $i.ToBitmap(); $ms = New-Object IO.MemoryStream; $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray()) }`
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, (err, out) => {
      const b64 = out.trim()
      if (err || !b64) return resolve(null)
      resolve(`data:image/png;base64,${b64}`)
    })
  })
}

/** A shortcut's real icon: its own icon location if it has one, else its target's. */
function resolveShortcut(lnk: string): Promise<string> {
  const script = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); $i=($s.IconLocation -split ',')[0]; if ($i -and (Test-Path $i)) { $i } else { $s.TargetPath }`
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, (err, out) => {
      const p = out.trim()
      resolve(!err && p && existsSync(p) ? p : lnk)
    })
  })
}

export async function getIcon(path: string, iconOverride?: string): Promise<LauncherIcon> {
  const key = iconOverride ?? path
  if (cache.has(key)) return { path, dataUrl: cache.get(key) ?? null }
  let dataUrl: string | null = null
  try {
    let src = iconOverride && existsSync(iconOverride) ? iconOverride : path
    // a shortcut whose icon location is empty would otherwise come back as a blank document icon
    if (/\.lnk$/i.test(src)) src = await resolveShortcut(src)
    if (existsSync(src)) {
      if (/\.(exe|lnk|ico)$/i.test(src)) dataUrl = await extractAssociatedIcon(src)
      if (!dataUrl) {
        const img = await app.getFileIcon(src, { size: 'large' })
        dataUrl = img.isEmpty() ? null : img.toDataURL()
      }
    }
  } catch { dataUrl = null }
  cache.set(key, dataUrl)
  return { path, dataUrl }
}

/** The Files app (files-community), when installed: its app execution alias. */
function filesApp(): string | null {
  const alias = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'files-stable.exe')
  // an app execution alias is a reparse point: existsSync() says false, lstat sees it
  try { lstatSync(alias); return alias } catch { return null }
}

export async function launch(path: string, args?: string): Promise<string> {
  bootLog(`launch ${path}`)
  if (!existsSync(path)) return `見つからない: ${path}`
  // folders open in Files (owner's choice, 2026-10-26); Explorer if Files is missing or turned off
  const files = getConfig().launcher.openFoldersWith !== 'explorer' ? filesApp() : null
  if (files && statSync(path).isDirectory()) {
    const { spawn } = await import('node:child_process')
    try {
      // Files reads its argument only when it is quoted and uses backslashes
      const winPath = path.replace(/\//g, '\\').replace(/\\+$/, '')
      const child = spawn(files, [`"${winPath}"`], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true })
      child.on('error', (e) => bootLog(`launch files error ${e.message}`))
      child.unref()
      bootLog(`launch files ${winPath}`)
      return ''
    } catch { /* fall back to Explorer below */ }
  }
  if (args) {
    const { spawn } = await import('node:child_process')
    try {
      spawn(path, args.split(' ').filter(Boolean), { detached: true, stdio: 'ignore', windowsHide: false }).unref()
      return ''
    } catch (e) { return String(e) }
  }
  return shell.openPath(path)
}
