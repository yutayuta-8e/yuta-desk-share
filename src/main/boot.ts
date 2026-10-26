// First import of the main process: records that the process reached JavaScript at all, before
// any native module (koffi) or Electron API is touched, so a crash during startup leaves a trace.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.env.APPDATA ?? '.', 'yuta-desk')
try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
const file = join(dir, 'yuta-desk.log')
export function bootLog(msg: string): void {
  try { appendFileSync(file, `${new Date().toISOString()} ${msg}\n`) } catch { /* ignore */ }
}
bootLog(`boot pid=${process.pid} argv=${process.argv.slice(1).join(' ')} cwd=${process.cwd()}`)
process.on('uncaughtException', (e) => bootLog(`uncaught ${e?.stack ?? e}`))
process.on('unhandledRejection', (e) => bootLog(`unhandled ${String(e)}`))
process.on('exit', (code) => bootLog(`exit code=${code}`))
