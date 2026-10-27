#!/usr/bin/env node
// Claude Code status line for yuta-desk.
// Claude Code runs this on every status-line refresh and passes a JSON object on stdin. When it
// includes `rate_limits` (the official 5-hour / 7-day usage), we save it to
// %APPDATA%\yuta-desk\claude-rate-limits.json so the usage widget can show it without asking the
// network (no rate limits to hit). Prints a short line for Claude Code's own status line.
// Set up in ~/.claude/settings.json:  "statusLine": { "type": "command", "command": "node \"<this file>\"" }
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let data = {}
  try { data = JSON.parse(raw || '{}') } catch { /* not JSON: print nothing useful */ }
  const rl = data && data.rate_limits
  const parts = []
  if (rl && (rl.five_hour || rl.seven_day)) {
    try {
      const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'yuta-desk')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'claude-rate-limits.json')
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify({ captured_at: Date.now(), five_hour: rl.five_hour || null, seven_day: rl.seven_day || null }))
      fs.renameSync(tmp, file)
    } catch { /* the status line must never fail */ }
    if (rl.five_hour) parts.push(`5時間 ${Math.round(Number(rl.five_hour.used_percentage) || 0)}%`)
    if (rl.seven_day) parts.push(`1週間 ${Math.round(Number(rl.seven_day.used_percentage) || 0)}%`)
  }
  const model = data && data.model && data.model.display_name
  if (model) parts.unshift(model)
  process.stdout.write(parts.join('  '))
})
