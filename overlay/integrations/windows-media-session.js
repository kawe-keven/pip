const { spawn } = require('child_process');
const readline = require('readline');

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$script:asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
} | Select-Object -First 1
function Wait-WinRtOperation($operation, [Type]$resultType) {
  $task = $script:asTaskMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$manager = $null
while ($true) {
  try {
    if ($null -eq $manager) {
      $manager = Wait-WinRtOperation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) $managerType
    }
    $session = $manager.GetCurrentSession()
    $payload = $null
    if ($null -ne $session) {
      $properties = Wait-WinRtOperation ($session.TryGetMediaPropertiesAsync()) $propertiesType
      $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
      if ($properties.Title -or $properties.Artist) {
        $payload = [ordered]@{
          title = [string]$properties.Title
          artist = [string]$properties.Artist
          genres = @($properties.Genres | ForEach-Object { [string]$_ })
          playing = ($status -eq 'Playing')
        }
      }
    }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $payload -Compress -Depth 3))
  } catch {
    $manager = $null
    [Console]::Out.WriteLine('null')
  }
  Start-Sleep -Seconds 3
}
`;

function startWindowsMediaSession(onChange) {
  let stopped = false;
  let child;
  let restartTimer;
  let lastValue;

  function start() {
    if (stopped) return;
    child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive',
      '-EncodedCommand', Buffer.from(POWERSHELL_SCRIPT, 'utf16le').toString('base64'),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let media = null;
      try {
        media = JSON.parse(line);
      } catch {
        return;
      }
      if (!media || typeof media !== 'object') media = { title: '', artist: '', playing: false };
      const nextValue = JSON.stringify(media);
      if (nextValue === lastValue) return;
      lastValue = nextValue;
      onChange(media);
    });
    child.on('error', () => {});
    child.on('close', () => {
      lines.close();
      child = undefined;
      if (!stopped) restartTimer = setTimeout(start, 30_000);
    });
  }

  start();
  return () => {
    stopped = true;
    clearTimeout(restartTimer);
    child?.kill();
    child = undefined;
  };
}

module.exports = { startWindowsMediaSession };
