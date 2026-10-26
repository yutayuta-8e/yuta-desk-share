import { execFile } from 'node:child_process'
import type { BatteryInfo } from '../../shared/types'

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$pc = Get-CimInstance Win32_Battery | Select-Object -First 1
$pcObj = $null
if ($pc) { $pcObj = @{ percent = [int]$pc.EstimatedChargeRemaining; charging = ($pc.BatteryStatus -eq 2 -or $pc.BatteryStatus -eq 6 -or $pc.BatteryStatus -eq 7 -or $pc.BatteryStatus -eq 8 -or $pc.BatteryStatus -eq 9) } }
$devs = @()
$bt = Get-PnpDevice -Class Bluetooth -Status OK | Where-Object { $_.InstanceId -like 'BTHENUM\*' -or $_.InstanceId -like 'BTHLE\*' -or $_.InstanceId -like 'BTHLEDEVICE\*' }
$names = @{}
foreach ($d in $bt) { $names[$d.InstanceId] = $d.FriendlyName }
$bt | Get-PnpDeviceProperty -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' | ForEach-Object {
  if ($_.Data -ne $null) { $devs += @{ name = $names[$_.InstanceId]; percent = [int]$_.Data } }
}
@{ pc = $pcObj; devices = $devs } | ConvertTo-Json -Compress -Depth 3
`

export function readBattery(): Promise<BatteryInfo> {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true, timeout: 60000 }, (err, out) => {
      if (err) return resolve({ pc: null, devices: [], updatedAt: Date.now() })
      try {
        const j = JSON.parse(out.trim())
        const devices = Array.isArray(j.devices) ? j.devices : j.devices ? [j.devices] : []
        resolve({ pc: j.pc ?? null, devices, updatedAt: Date.now() })
      } catch {
        resolve({ pc: null, devices: [], updatedAt: Date.now() })
      }
    })
  })
}
