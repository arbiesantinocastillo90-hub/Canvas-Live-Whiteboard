$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPackage = Join-Path $taskRoot 'release/Canvas Live'
$taskTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$taskTestRoot = Join-Path $taskTempBase ('canvas-live-launcher-test-' + [Guid]::NewGuid().ToString('N'))
$taskProcesses = New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
$taskAssertions = New-Object 'System.Collections.Generic.List[string]'
$taskBlocker = $null

function Assert-Launcher($condition, [string]$description) {
    if (!$condition) { throw ('Launcher check failed: ' + $description) }
    $taskAssertions.Add($description)
}

function Get-LauncherState([string]$folder) {
    $taskHasher = [System.Security.Cryptography.SHA256]::Create()
    try { $taskDigest = $taskHasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes([System.IO.Path]::GetFullPath($folder).TrimEnd('\').ToLowerInvariant())) }
    finally { $taskHasher.Dispose() }
    $taskKey = [BitConverter]::ToString($taskDigest).Replace('-', '').Substring(0, 24)
    return @{ Key = $taskKey; Folder = (Join-Path $env:LOCALAPPDATA ('Canvas Live/launchers/' + $taskKey)) }
}

function Invoke-LauncherRequest([Uri]$url, [string]$target = '/', [string]$method = 'GET', [string]$hostValue = '') {
    if ($hostValue -eq '') { $hostValue = $url.Authority }
    $taskClient = New-Object System.Net.Sockets.TcpClient
    try {
        $taskClient.ReceiveTimeout = 5000
        $taskClient.SendTimeout = 5000
        $taskClient.Connect($url.Host, $url.Port)
        $taskStream = $taskClient.GetStream()
        $taskRequest = [System.Text.Encoding]::ASCII.GetBytes($method + ' ' + $target + " HTTP/1.1`r`nHost: " + $hostValue + "`r`nConnection: close`r`n`r`n")
        $taskStream.Write($taskRequest, 0, $taskRequest.Length)
        $taskResponse = New-Object System.IO.MemoryStream
        try {
            $taskStream.CopyTo($taskResponse)
            $taskText = [System.Text.Encoding]::UTF8.GetString($taskResponse.ToArray())
        }
        finally { $taskResponse.Dispose() }
        $taskParts = $taskText.Split([string[]]@("`r`n`r`n"), 2, [StringSplitOptions]::None)
        if ($taskParts[0] -notmatch '^HTTP/1.1 (\d+) ') { throw 'No valid HTTP response from launcher.' }
        return @{ Status = [int]$Matches[1]; Header = $taskParts[0]; Body = $taskParts[1] }
    }
    finally { $taskClient.Close() }
}

function Start-LauncherTest([string]$folder) {
    $taskProcess = Start-Process -FilePath (Join-Path $folder 'Canvas Live.exe') -ArgumentList '--no-browser' -WorkingDirectory $env:WINDIR -WindowStyle Hidden -PassThru
    $taskProcesses.Add($taskProcess)
    $taskState = Get-LauncherState $folder
    for ($taskAttempt = 0; $taskAttempt -lt 100; $taskAttempt++) {
        if ($taskProcess.HasExited) { throw ('Launcher exited before startup: ' + (Get-Content -LiteralPath (Join-Path $taskState.Folder 'last-error.txt') -Raw)) }
        try {
            $taskEndpoint = [Uri](Get-Content -LiteralPath (Join-Path $taskState.Folder 'endpoint.txt') -Raw)
            $taskHealth = Invoke-LauncherRequest $taskEndpoint '/__canvas_live_launcher'
            if ($taskHealth.Body -eq ('CanvasLive:' + $taskState.Key)) { return @{ Process = $taskProcess; Url = $taskEndpoint } }
        }
        catch { }
        Start-Sleep -Milliseconds 100
    }
    throw 'Launcher did not publish a healthy endpoint.'
}

try {
    if (!(Test-Path -LiteralPath (Join-Path $taskPackage 'Canvas Live.exe'))) { throw 'Package the launcher before testing it.' }
    New-Item -ItemType Directory -Path $taskTestRoot | Out-Null
    $taskRelocated = Join-Path $taskTestRoot 'Folder With Spaces'
    Copy-Item -LiteralPath $taskPackage -Destination $taskRelocated -Recurse
    try {
        $taskBlocker = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 4173)
        $taskBlocker.Start()
    }
    catch [System.Net.Sockets.SocketException] { $taskBlocker = $null }
    $taskInstance = Start-LauncherTest $taskRelocated
    Assert-Launcher ($taskInstance.Url.Port -ne 4173) 'Occupied primary port selects another loopback port'
    Assert-Launcher ($taskInstance.Url.Host -eq '127.0.0.1') 'Relocated package starts without Node and binds loopback'
    $taskPage = Invoke-LauncherRequest $taskInstance.Url
    Assert-Launcher ($taskPage.Status -eq 200 -and $taskPage.Body.Contains('<title>Canvas Live</title>')) 'Packaged home page loads from an unrelated working directory'
    Assert-Launcher ($taskPage.Header.Contains('Content-Type: text/html; charset=utf-8')) 'HTML uses the correct content type'
    foreach ($taskExtension in @('js', 'css')) {
        $taskAsset = Get-ChildItem -LiteralPath (Join-Path $taskRelocated 'app/assets') -File | Where-Object Extension -eq ('.' + $taskExtension) | Select-Object -First 1
        $taskResult = Invoke-LauncherRequest $taskInstance.Url ('/assets/' + $taskAsset.Name)
        $taskMime = if ($taskExtension -eq 'js') { 'text/javascript' } else { 'text/css' }
        Assert-Launcher ($taskResult.Status -eq 200 -and $taskResult.Body.Length -gt 0 -and $taskResult.Header.Contains($taskMime)) ($taskExtension.ToUpperInvariant() + ' asset loads with the correct content type')
    }
    foreach ($taskNotice in @('LICENSE.txt', 'THIRD_PARTY_NOTICES.txt')) {
        Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url ('/' + $taskNotice)).Status -eq 200) ($taskNotice + ' is included in the website package')
    }
    $taskHead = Invoke-LauncherRequest $taskInstance.Url '/' 'HEAD'
    Assert-Launcher ($taskHead.Status -eq 200 -and $taskHead.Body.Length -eq 0) 'HEAD returns headers without a response body'
    $taskGetLength = [System.Text.Encoding]::UTF8.GetByteCount($taskPage.Body)
    Assert-Launcher ($taskHead.Header.Contains('Content-Length: ' + $taskGetLength)) 'HEAD content length matches the GET body byte length'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/?preview=1').Status -eq 200) 'Home page query strings are accepted'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/missing.txt').Status -eq 404) 'Unknown files are rejected'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/../README.txt').Status -eq 400) 'Parent path traversal is rejected'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/%2e%2e%2fREADME.txt').Status -eq 400) 'Encoded parent path traversal is rejected'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/%5cREADME.txt').Status -eq 400) 'Encoded Windows separators are rejected'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/' 'POST').Status -eq 405) 'Write methods are rejected'
    Assert-Launcher ((Invoke-LauncherRequest $taskInstance.Url '/' 'GET' 'example.com').Status -eq 403) 'Unrecognized Host headers are rejected'
    $taskSlowClient = New-Object System.Net.Sockets.TcpClient
    try {
        $taskSlowClient.Connect($taskInstance.Url.Host, $taskInstance.Url.Port)
        $taskSlowClient.ReceiveTimeout = 8000
        $taskSlowStream = $taskSlowClient.GetStream()
        $taskPartialHeader = [System.Text.Encoding]::ASCII.GetBytes("GET / HTTP/1.1`r`nHost: " + $taskInstance.Url.Authority + "`r`nX-Test: ")
        $taskSlowStream.Write($taskPartialHeader, 0, $taskPartialHeader.Length)
        for ($taskByte = 0; $taskByte -lt 6; $taskByte++) { Start-Sleep -Milliseconds 900; $taskSlowStream.WriteByte(120) }
        $taskSlowResponse = New-Object System.IO.StreamReader($taskSlowStream)
        Assert-Launcher ($taskSlowResponse.ReadToEnd().StartsWith('HTTP/1.1 408 ')) 'Slow headers cannot extend a connection indefinitely'
    }
    finally { $taskSlowClient.Close() }
    $taskSecond = Start-Process -FilePath (Join-Path $taskRelocated 'Canvas Live.exe') -ArgumentList '--no-browser' -WorkingDirectory $env:WINDIR -WindowStyle Hidden -PassThru
    $taskProcesses.Add($taskSecond)
    Assert-Launcher ($taskSecond.WaitForExit(5000) -and $taskSecond.ExitCode -eq 0) 'Repeated launch reuses the existing instance'
    Assert-Launcher (!$taskInstance.Process.HasExited -and (Invoke-LauncherRequest $taskInstance.Url).Status -eq 200) 'Existing instance remains available after repeated launch'
    Stop-Process -Id $taskInstance.Process.Id
    $taskInstance.Process.WaitForExit()
    $taskRestartPort = $taskInstance.Url.Port
    $taskProbe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $taskRestartPort)
    try { $taskProbe.Start(); Assert-Launcher $true 'Stopping the launcher releases its listening port' }
    finally { $taskProbe.Stop() }
    if ($null -ne $taskBlocker) { $taskBlocker.Stop(); $taskBlocker = $null }
    $taskRestarted = Start-LauncherTest $taskRelocated
    Assert-Launcher ((Invoke-LauncherRequest $taskRestarted.Url).Status -eq 200) 'Restart recovers from an abandoned instance and stale endpoint file'
    $taskMissing = Join-Path $taskTestRoot 'Missing App'
    New-Item -ItemType Directory -Path $taskMissing | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskPackage 'Canvas Live.exe'),(Join-Path $taskPackage 'Canvas Live.exe.config') -Destination $taskMissing
    $taskBroken = Start-Process -FilePath (Join-Path $taskMissing 'Canvas Live.exe') -ArgumentList '--no-browser' -WindowStyle Hidden -PassThru
    $taskProcesses.Add($taskBroken)
    Assert-Launcher ($taskBroken.WaitForExit(5000) -and $taskBroken.ExitCode -eq 1) 'Missing app folder fails clearly instead of opening an unrelated website'
    $taskBrokenState = Get-LauncherState $taskMissing
    Assert-Launcher ((Get-Content -LiteralPath (Join-Path $taskBrokenState.Folder 'last-error.txt') -Raw).Contains('app/index.html')) 'Missing app error identifies the required website file'
    $taskResultsFolder = Join-Path $taskRoot 'test-results'
    New-Item -ItemType Directory -Path $taskResultsFolder -Force | Out-Null
    @{ result = 'passed'; assertions = @($taskAssertions.ToArray()) } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskResultsFolder 'windows-launcher.json') -Encoding UTF8
    Write-Output ('Launcher checks passed: ' + $taskAssertions.Count)
}
finally {
    foreach ($taskProcess in $taskProcesses) { if (!$taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id; $taskProcess.WaitForExit() } }
    if ($null -ne $taskBlocker) { $taskBlocker.Stop() }
    $taskResolvedTestRoot = [System.IO.Path]::GetFullPath($taskTestRoot)
    if (!$taskResolvedTestRoot.StartsWith($taskTempBase, [StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetFileName($taskResolvedTestRoot) -notlike 'canvas-live-launcher-test-*') { throw 'Test cleanup target escaped the owned temporary folder.' }
    if (Test-Path -LiteralPath $taskResolvedTestRoot) { Remove-Item -LiteralPath $taskResolvedTestRoot -Recurse -Force }
}
