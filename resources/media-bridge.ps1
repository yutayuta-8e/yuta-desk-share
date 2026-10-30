# yuta-desk media bridge: reads what Windows says is playing (System Media Transport Controls)
# and prints one JSON line whenever it changes. Commands on stdin, one per line:
#   toggle | play | pause | next | prev | seek <seconds> | volume <0..1> | getvolume
# Volume is the Windows master volume of the default output device, whatever is playing (the owner,
# 2026-10-30; until then it was the playing app's slider in the volume mixer). getvolume answers with
# one line {"volume": 0..1} (0 while muted), or -1 when there is no output device to read.
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

# the master volume (IAudioEndpointVolume of the default output device); compiled on first use
$audioCs = @'
using System;
using System.Runtime.InteropServices;
public static class YdAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object itf);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float db);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float db, ref Guid ctx);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float db);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  // looked up each time, so switching speakers and headphones is followed
  static IAudioEndpointVolume Endpoint() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return null;
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0 || o == null) return null;
    return (IAudioEndpointVolume)o;
  }
  // 0..1 (0 while muted), -1 without an output device
  public static float Get() {
    var v = Endpoint();
    if (v == null) return -1;
    bool mute;
    if (v.GetMute(out mute) == 0 && mute) return 0;
    float f;
    return v.GetMasterVolumeLevelScalar(out f) == 0 ? f : -1;
  }
  // a level above 0 also lifts a mute, as the Windows volume slider does
  public static bool Set(float level) {
    var v = Endpoint();
    if (v == null) return false;
    Guid ctx = Guid.Empty;
    if (v.SetMasterVolumeLevelScalar(level, ref ctx) != 0) return false;
    bool mute;
    if (level > 0 && v.GetMute(out mute) == 0 && mute) v.SetMute(false, ref ctx);
    return true;
  }
}
'@
$script:audioReady = $false
function Audio {
  if (-not $script:audioReady) { Add-Type -TypeDefinition $audioCs -Language CSharp; $script:audioReady = $true }
}
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
  # commands (a drag on the volume line sends many; only the last one is applied)
  $vol = $null
  while ($pending.IsCompleted) {
    $cmd = $pending.Result
    if ($null -eq $cmd) { exit 0 } # stdin closed: the app quit
    $word, $arg = $cmd.Trim() -split '\s+', 2
    if ($word -eq 'volume') { $vol = $arg }
    elseif ($word -eq 'getvolume') {
      $v = -1
      try { Audio; $v = [YdAudio]::Get() } catch {}
      Emit @{ volume = [math]::Round($v, 3) }
    }
    elseif ($s = PickSession) {
      try {
        switch ($word) {
          'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
          'play' { Await ($s.TryPlayAsync()) ([bool]) | Out-Null }
          'pause' { Await ($s.TryPauseAsync()) ([bool]) | Out-Null }
          'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
          'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
          'seek' { Await ($s.TryChangePlaybackPositionAsync([long]([double]$arg * 10000000))) ([bool]) | Out-Null }
        }
      } catch {}
    }
    $pending = $stdin.ReadLineAsync()
  }
  if ($null -ne $vol) {
    # both bounds must be doubles: with an integer 0 or 1, PowerShell picks Math's int overloads and
    # rounds the level to 0 or 1 (half or less went silent, more went to full; 2026-10-30)
    $level = [math]::Max([double]0, [math]::Min([double]1, [double]$vol))
    try { Audio; [YdAudio]::Set([float]$level) | Out-Null } catch {}
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
  # look at the state every 600 ms, but answer commands within 100 ms
  for ($k = 0; $k -lt 6 -and -not $pending.IsCompleted; $k++) { Start-Sleep -Milliseconds 100 }
}
