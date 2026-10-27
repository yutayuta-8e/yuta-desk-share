# yuta-desk media bridge: reads what Windows says is playing (System Media Transport Controls)
# and prints one JSON line whenever it changes. Commands on stdin, one per line:
#   toggle | play | pause | next | prev
# Sessions whose app id matches -Exclude (yuta-desk's own player) are skipped.
param([string]$Exclude = 'electron|yuta-desk')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(5000) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($mgrType::RequestAsync()) $mgrType

function Emit($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

function PickSession {
  $all = @($mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -notmatch $Exclude })
  if (-not $all.Count) { return $null }
  $playing = @($all | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' })
  if ($playing.Count) { return $playing[0] }
  $cur = $mgr.GetCurrentSession()
  if ($cur -and $cur.SourceAppUserModelId -notmatch $Exclude) { return $cur }
  return $all[0]
}

$script:asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1

function Thumb($props) {
  try {
    if (-not $props.Thumbnail) { return $null }
    $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    # PowerShell cannot call the WinRT stream's own members; reflection hands it to .NET as a Stream
    $net = $script:asStream.Invoke($null, @($stream))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $bytes = $ms.ToArray()
    if ($bytes.Length -eq 0 -or $bytes.Length -gt 4MB) { return $null }
    $type = if ($bytes[0] -eq 0xFF) { 'image/jpeg' } else { 'image/png' }
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

# the console host may already have taken [Console]::In; read the raw standard input stream instead
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$pending = $stdin.ReadLineAsync()
$last = ''
$lastTrack = ''
$thumb = $null
$thumbRev = 0
$trackAt = [DateTime]::MinValue
$thumbAt = [DateTime]::MinValue
while ($true) {
  # commands
  while ($pending.IsCompleted) {
    $cmd = $pending.Result
    if ($null -eq $cmd) { exit 0 } # stdin closed: the app quit
    $s = PickSession
    if ($s) {
      try {
        switch ($cmd.Trim()) {
          'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
          'play' { Await ($s.TryPlayAsync()) ([bool]) | Out-Null }
          'pause' { Await ($s.TryPauseAsync()) ([bool]) | Out-Null }
          'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
          'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
        }
      } catch {}
    }
    $pending = $stdin.ReadLineAsync()
  }
  # state
  try {
    $s = PickSession
    if (-not $s) {
      $state = @{ active = $false }
    } else {
      $info = $s.GetPlaybackInfo()
      $props = Await ($s.TryGetMediaPropertiesAsync()) $propsType
      $tl = $s.GetTimelineProperties()
      $track = "$($s.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
      $now = [DateTime]::UtcNow
      if ($track -ne $lastTrack) {
        $thumb = Thumb $props; $lastTrack = $track; $trackAt = $now; $thumbAt = $now; $thumbRev++
      } else {
        # browsers first hand over their own icon and swap in the artwork once it has loaded, so look
        # again: every 2 s for the first 20 s of a track, then every 15 s
        $gap = if (($now - $trackAt).TotalSeconds -lt 20) { 2 } else { 15 }
        if (($now - $thumbAt).TotalSeconds -ge $gap) {
          $thumbAt = $now
          $t = Thumb $props
          if ($t -and $t -ne $thumb) { $thumb = $t; $thumbRev++ }
        }
      }
      $state = @{
        active = $true
        app = $s.SourceAppUserModelId
        status = "$($info.PlaybackStatus)"
        title = $props.Title
        artist = $props.Artist
        album = $props.AlbumTitle
        position = [math]::Round($tl.Position.TotalSeconds, 1)
        duration = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds, 1)
        updatedAt = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
        canNext = $info.Controls.IsNextEnabled
        canPrev = $info.Controls.IsPreviousEnabled
        thumbKey = $lastTrack
        thumbRev = $thumbRev
      }
    }
    $json = $state | ConvertTo-Json -Compress -Depth 4
    if ($json -ne $last) {
      $last = $json
      $out = $state.Clone()
      if ($state.active) { $out.thumbnail = $thumb }
      Emit $out
    }
  } catch { }
  Start-Sleep -Milliseconds 600
}
