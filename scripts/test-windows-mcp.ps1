[CmdletBinding()]
param([string]$RuntimePath = '')
$ErrorActionPreference = 'Stop'
$canvasRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$canvasTestRoot = Join-Path ([IO.Path]::GetTempPath()) ('clmcp-' + [Guid]::NewGuid().ToString('N').Substring(0, 10))
$canvasChecks = New-Object 'System.Collections.Generic.List[string]'
$canvasProcesses = New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
$canvasPackages = New-Object 'System.Collections.Generic.List[string]'
$canvasBlocker = $null
function Assert-Mcp($condition, [string]$label) { if (!$condition) { throw ('Portable MCP check failed: ' + $label) }; $canvasChecks.Add($label) }
function Write-McpRegistration([string]$path, [string]$text) {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try { [IO.File]::WriteAllText($path, $text); return } catch [IO.IOException] { if ($attempt -eq 39) { throw }; Start-Sleep -Milliseconds 25 }
    }
}
function State-Mcp([string]$folder) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($folder.ToLowerInvariant()))).Replace('-', '').Substring(0, 24) } finally { $hash.Dispose() }
    return @{ key = $key; endpoint = (Join-Path $env:LOCALAPPDATA ('Canvas Live/launchers/' + $key + '/endpoint.txt')) }
}
function Request-Mcp([Uri]$url, [string]$target, [hashtable]$headers = @{}, [string]$method = 'GET') {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $client.ReceiveTimeout = 5000; $client.Connect($url.Host, $url.Port); $stream = $client.GetStream()
        $header = $method + ' ' + $target + " HTTP/1.1`r`nHost: " + $url.Authority + "`r`nConnection: close`r`n"
        foreach ($name in $headers.Keys) { $header += $name + ': ' + $headers[$name] + "`r`n" }
        $bytes = [Text.Encoding]::ASCII.GetBytes($header + "`r`n"); $stream.Write($bytes, 0, $bytes.Length)
        $reader = New-Object IO.StreamReader($stream); $response = $reader.ReadToEnd(); $parts = $response.Split([string[]]@("`r`n`r`n"), 2, [StringSplitOptions]::None)
        if ($parts[0] -notmatch '^HTTP/1.1 (\d+) ') { throw 'Invalid native response.' }
        return @{ status = [int]$Matches[1]; header = $parts[0]; body = $parts[1] }
    } finally { $client.Close() }
}
function Start-Mcp([string]$folder, [string]$entryPath = '') {
    $canvasPackages.Add($folder)
    $oldPath = $env:PATH
    try { $env:PATH = $env:WINDIR; $process = Start-Process -FilePath $(if ($entryPath -eq '') { Join-Path $folder 'Canvas Live MCP.exe' } else { $entryPath }) -ArgumentList '--no-ui' -WorkingDirectory $env:WINDIR -WindowStyle Hidden -PassThru } finally { $env:PATH = $oldPath }
    if ($entryPath -ne '') {
        $canvasProcesses.Add($process)
        if (!$process.WaitForExit(5000) -or $process.ExitCode -ne 0) { throw 'USB root entry did not forward successfully.' }
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            $child = Get-Process -Name 'Canvas Live MCP' -ErrorAction SilentlyContinue | Where-Object Path -eq (Join-Path $folder 'Canvas Live MCP.exe') | Select-Object -First 1
            if ($null -ne $child) { $process = $child; break }
            Start-Sleep -Milliseconds 100
        }
        if ($null -eq $child) { throw 'USB root entry did not start its own packaged launcher.' }
    }
    $canvasProcesses.Add($process)
    $state = State-Mcp $folder
    for ($attempt = 0; $attempt -lt 160; $attempt++) {
        if ($process.HasExited) { throw ('Portable MCP exited: ' + (Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA ('Canvas Live/mcp/' + $state.key + '/last-error.txt')) -Raw)) }
        if ((Test-Path -LiteralPath $state.endpoint) -and (Test-Path -LiteralPath (Join-Path $folder '.canvas-live/mcp-session.json'))) {
            $url = [Uri](Get-Content -LiteralPath $state.endpoint -Raw)
            $discovery = Request-Mcp $url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1' }
            if ($discovery.status -eq 200) { return @{ process = $process; url = $url; discovery = $discovery } }
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'Portable MCP did not become ready.'
}
try {
    New-Item -ItemType Directory -Path $canvasTestRoot | Out-Null
    $package = Join-Path $canvasTestRoot 'USB Folder With Spaces'
    New-Item -ItemType Directory -Path (Join-Path $package 'app'), (Join-Path $package 'mcp') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $package 'app/index.html') -Value '<html><head><title>Canvas Live</title></head><body>Portable test</body></html>' -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $canvasRoot 'launcher/canvas-live.ico') -Destination (Join-Path $package 'app/canvas-live.ico')
    Copy-Item -LiteralPath (Join-Path $canvasRoot 'dist-mcp/server.mjs') -Destination (Join-Path $package 'mcp/server.mjs')
    Copy-Item -LiteralPath (Join-Path $canvasRoot 'launcher/Canvas Live.exe.config') -Destination $package
    Copy-Item -LiteralPath (Join-Path $canvasRoot 'launcher/Canvas Live.exe.config') -Destination (Join-Path $package 'Canvas Live MCP.exe.config')
    if ($RuntimePath -eq '') { & (Join-Path $PSScriptRoot 'package-mcp-runtime.ps1') -Destination (Join-Path $package 'runtime') } else { Copy-Item -LiteralPath $RuntimePath -Destination (Join-Path $package 'runtime') -Recurse }
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/out:' + (Join-Path $package 'Canvas Live.exe')) (Join-Path $canvasRoot 'launcher/CanvasLiveLauncher.cs') (Join-Path $canvasRoot 'launcher/LocalLibrary.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Native app compilation failed.' }
    & $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/out:' + (Join-Path $package 'Canvas Live MCP.exe')) (Join-Path $canvasRoot 'launcher/CanvasLiveMcpLauncher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Native MCP compilation failed.' }
    try { $canvasBlocker = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 4173); $canvasBlocker.Start() } catch [Net.Sockets.SocketException] { $canvasBlocker = $null }
    $first = Start-Mcp $package
    Assert-Mcp ($first.url.Port -ne 4173) 'App uses an available loopback port without replacing the occupied owner site'
    Assert-Mcp (!$first.process.HasExited) 'Bundled runtime starts from an unrelated directory with no global Node on PATH'
    $session = Get-Content -LiteralPath (Join-Path $package '.canvas-live/mcp-session.json') -Raw | ConvertFrom-Json
    $discovered = $first.discovery.body | ConvertFrom-Json
    Assert-Mcp ($discovered.url -eq ([Uri]$session.url).GetLeftPart([UriPartial]::Authority)) 'Discovery returns the dynamically assigned loopback companion origin'
    Assert-Mcp ($discovered.browserPairingCode -ceq $session.browserPairingCode) 'Discovery returns only its own browser pairing credential'
    Assert-Mcp (!$first.discovery.body.Contains($session.mcpToken) -and $discovered.PSObject.Properties.Count -le 2) 'MCP bearer token is never exposed through browser discovery'
    Assert-Mcp ($first.discovery.header.Contains('Cache-Control: no-store')) 'Discovery credentials cannot be stored in an HTTP cache'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion').status -eq 403) 'Discovery rejects requests without its dedicated header'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1'; Origin = 'https://evil.example' }).status -eq 403) 'Discovery rejects a foreign Origin'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1'; 'Sec-Fetch-Site' = 'cross-site' }).status -eq 403) 'Discovery rejects cross-site fetch metadata'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion?query=1' @{ 'X-Canvas-Live-Companion' = '1' }).status -eq 404) 'Discovery rejects query-bearing endpoint variants'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1' } 'POST').status -eq 404) 'Discovery cannot start or stop processes through HTTP'
    Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1'; Origin = $first.url.GetLeftPart([UriPartial]::Authority); 'Sec-Fetch-Site' = 'same-origin' }).status -eq 200) 'Native same-origin discovery succeeds'
    $sessionPath = Join-Path $package '.canvas-live/mcp-session.json'; $original = [IO.File]::ReadAllText($sessionPath)
    try {
        Write-McpRegistration $sessionPath ('x' * 16385)
        Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1' }).status -eq 503) 'Oversized runtime registrations are rejected'
        Write-McpRegistration $sessionPath '{invalid'
        Assert-Mcp ((Request-Mcp $first.url '/__canvas_live_companion' @{ 'X-Canvas-Live-Companion' = '1' }).status -eq 503) 'Malformed runtime registrations are rejected'
    } finally { Write-McpRegistration $sessionPath $original }
    $again = Start-Process -FilePath (Join-Path $package 'Canvas Live MCP.exe') -ArgumentList '--no-ui' -WindowStyle Hidden -PassThru
    $canvasProcesses.Add($again)
    Assert-Mcp ($again.WaitForExit(5000) -and $again.ExitCode -eq 0 -and !$first.process.HasExited) 'Repeated clicks reuse the same folder companion'
    $entry = Join-Path $canvasTestRoot 'Canvas Live MCP.exe'
    & (Join-Path $PSScriptRoot 'build-portable-mcp-entry.ps1') -RelativePackagePath 'USB Folder With Spaces' -OutputPath $entry
    $movedRoot = Join-Path $canvasTestRoot 'Moved USB'
    New-Item -ItemType Directory -Path $movedRoot | Out-Null
    $relocated = Join-Path $movedRoot 'USB Folder With Spaces'
    New-Item -ItemType Directory -Path $relocated | Out-Null
    foreach ($name in @('app', 'mcp', 'runtime', 'Canvas Live.exe', 'Canvas Live MCP.exe', 'Canvas Live.exe.config', 'Canvas Live MCP.exe.config')) { Copy-Item -LiteralPath (Join-Path $package $name) -Destination $relocated -Recurse }
    $movedEntry = Join-Path $movedRoot 'Canvas Live MCP.exe'
    Copy-Item -LiteralPath $entry -Destination $movedEntry
    $second = Start-Mcp $relocated $movedEntry
    $secondSession = Get-Content -LiteralPath (Join-Path $relocated '.canvas-live/mcp-session.json') -Raw | ConvertFrom-Json
    Assert-Mcp ($second.url -ne $first.url -and $secondSession.url -ne $session.url -and $secondSession.browserPairingCode -cne $session.browserPairingCode) 'Relocated folder has independent app, companion, and credentials'
    Assert-Mcp ($second.process.Path -eq (Join-Path $relocated 'Canvas Live MCP.exe')) 'USB root icon still finds its own package after moving the whole USB folder'
    $stopper = Start-Process -FilePath (Join-Path $package 'Canvas Live MCP.exe') -ArgumentList '--stop' -WindowStyle Hidden -PassThru
    $canvasProcesses.Add($stopper); $null = $stopper.WaitForExit(5000)
    Assert-Mcp ($first.process.WaitForExit(5000)) 'Stopping MCP shuts down its own companion launcher'
    Assert-Mcp (!(Test-Path -LiteralPath $sessionPath)) 'Stopping MCP removes its temporary credential registration'
    Assert-Mcp ((Request-Mcp $first.url '/').status -eq 200) 'Stopping MCP leaves the canvas app available'
    Assert-Mcp (!$second.process.HasExited) 'Stopping one folder leaves another folder companion running'
    $secondPort = ([Uri]$secondSession.url).Port
    Stop-Process -Id $second.process.Id; $second.process.WaitForExit()
    Start-Sleep -Milliseconds 500
    $crashedChild = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $relocated 'runtime/node.exe') }
    Assert-Mcp ($null -eq $crashedChild) 'Windows job ownership stops the companion if its launcher crashes'
    $guardRoot = Join-Path $canvasTestRoot 'Repackage Guard'
    New-Item -ItemType Directory -Path (Join-Path $guardRoot 'scripts'), (Join-Path $guardRoot 'release/Canvas Live/data') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $canvasRoot 'scripts/package-windows.ps1') -Destination (Join-Path $guardRoot 'scripts/package-windows.ps1')
    $guardFile = Join-Path $guardRoot 'release/Canvas Live/data/retained.txt'
    Set-Content -LiteralPath $guardFile -Value 'retained private library' -Encoding UTF8
    $guarded = $false
    try { & (Join-Path $guardRoot 'scripts/package-windows.ps1') } catch { $guarded = $_.Exception.Message.Contains('existing release contains library data or private connection settings') }
    Assert-Mcp $guarded 'Regular packaging refuses to replace a release containing user library or private settings'
    Assert-Mcp ((Get-Content -LiteralPath $guardFile -Raw).Trim() -eq 'retained private library') 'Packaging guard leaves existing private library files untouched'
    $report = @{ passed = $true; checkCount = $canvasChecks.Count; checks = @($canvasChecks.ToArray()); runtime = (Get-Content -LiteralPath (Join-Path $package 'runtime/node-provenance.json') -Raw | ConvertFrom-Json); sourceHashes = @{ launcher = (Get-FileHash -LiteralPath (Join-Path $canvasRoot 'launcher/CanvasLiveLauncher.cs')).Hash; mcpLauncher = (Get-FileHash -LiteralPath (Join-Path $canvasRoot 'launcher/CanvasLiveMcpLauncher.cs')).Hash; companion = (Get-FileHash -LiteralPath (Join-Path $canvasRoot 'dist-mcp/server.mjs')).Hash } }
    New-Item -ItemType Directory -Path (Join-Path $canvasRoot 'test-results') -Force | Out-Null
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $canvasRoot 'test-results/portable-mcp-native.json') -Encoding UTF8
    Write-Output ('Portable MCP checks passed: ' + $canvasChecks.Count)
} finally {
    foreach ($folder in $canvasPackages) {
        try { $stopper = Start-Process -FilePath (Join-Path $folder 'Canvas Live MCP.exe') -ArgumentList '--stop' -WindowStyle Hidden -PassThru; $null = $stopper.WaitForExit(3000) } catch { }
    }
    foreach ($process in $canvasProcesses) { try { if (!$process.HasExited -and !$process.WaitForExit(5000)) { Stop-Process -Id $process.Id; $process.WaitForExit() } } catch { } }
    # Only terminate native apps whose executable is inside this exact owned test folder.
    Get-Process -Name 'Canvas Live' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($canvasTestRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.Id }
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($canvasTestRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.Id; $_.WaitForExit(3000) | Out-Null }
    if ($null -ne $canvasBlocker) { $canvasBlocker.Stop() }
    $resolved = [IO.Path]::GetFullPath($canvasTestRoot)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'clmcp-*') { throw 'Refusing to clean an unexpected test directory.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
