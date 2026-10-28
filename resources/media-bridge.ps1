# yuta-desk media bridge: reads what Windows says is playing (System Media Transport Controls)
# and prints one JSON line whenever it changes. Commands on stdin, one per line:
#   toggle | play | pause | next | prev | seek <seconds> | volume <0..1> | getvolume
# Volume is that app's own slider in the Windows volume mixer (never the master volume); getvolume
# answers with one line {"volume": 0..1}, or -1 when the app has no audio session to read.
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

# per-app volume (ISimpleAudioVolume of the app's audio sessions); compiled on first use
$audioCs = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
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
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
  }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out IntPtr name);
    [PreserveSig] int SetDisplayName(IntPtr name, IntPtr ctx);
    [PreserveSig] int GetIconPath(out IntPtr path);
    [PreserveSig] int SetIconPath(IntPtr path, IntPtr ctx);
    [PreserveSig] int GetGroupingParam(out Guid group);
    [PreserveSig] int SetGroupingParam(ref Guid group, IntPtr ctx);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int GetSessionIdentifier(out IntPtr id);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
    [PreserveSig] int GetProcessId(out uint pid);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
  }
  // the sessions of processes whose name matches the hint (brave / spotify / msedge ...)
  static List<ISimpleAudioVolume> Find(string hint) {
    var found = new List<ISimpleAudioVolume>();
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return found;
    Guid iid = typeof(IAudioSessionManager2).GUID;
    object o;
    if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0 || o == null) return found;
    IAudioSessionEnumerator list;
    if (((IAudioSessionManager2)o).GetSessionEnumerator(out list) != 0 || list == null) return found;
    int n;
    list.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s;
      if (list.GetSession(i, out s) != 0 || s == null) continue;
      uint pid;
      if (s.GetProcessId(out pid) != 0 || pid == 0) continue;
      string name;
      try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
      if (name == hint || hint.StartsWith(name) || name.StartsWith(hint)) found.Add((ISimpleAudioVolume)s);
    }
    return found;
  }
  public static float Get(string hint) {
    foreach (var v in Find(hint)) { float f; if (v.GetMasterVolume(out f) == 0) return f; }
    return -1;
  }
  public static int Set(string hint, float level) {
    Guid ctx = Guid.Empty; int k = 0;
    foreach (var v in Find(hint)) if (v.SetMasterVolume(level, ref ctx) == 0) k++;
    return k;
  }
}
'@
$script:audioReady = $false
function Audio {
  if (-not $script:audioReady) { Add-Type -TypeDefinition $audioCs -Language CSharp; $script:audioReady = $true }
}
# the process name behind a media session id ("Brave", "Spotify.exe", "SpotifyAB.SpotifyMusic_...!Spotify", Firefox's hash)
function AppHint($aumid) {
  $a = "$aumid".ToLower()
  if ($a -eq '308046b0af4a39cb') { return 'firefox' }
  return (($a -split '[\\/!]')[-1] -replace '\.exe$', '')
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
    $s = PickSession
    $word, $arg = $cmd.Trim() -split '\s+', 2
    if ($word -eq 'volume') { $vol = $arg }
    elseif ($word -eq 'getvolume') {
      $v = -1
      if ($s) { try { Audio; $v = [YdAudio]::Get((AppHint $s.SourceAppUserModelId)) } catch {} }
      Emit @{ volume = [math]::Round($v, 3) }
    }
    elseif ($s) {
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
    $s = PickSession
    if ($s) { try { Audio; [YdAudio]::Set((AppHint $s.SourceAppUserModelId), [float][math]::Max(0, [math]::Min(1, [double]$vol))) | Out-Null } catch {} }
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
