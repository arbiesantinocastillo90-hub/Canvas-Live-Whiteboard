param([string]$TestRoot = '')
$ErrorActionPreference = 'Stop'
$taskSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if (!$TestRoot) { $TestRoot = Join-Path $taskTemp ('canvas-live-library-test-' + [Guid]::NewGuid().ToString('N')) }
$taskRun = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
if (!$taskRun.StartsWith($taskTemp + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'The isolated test folder must be under the current user temporary folder.' }
if (Test-Path -LiteralPath $taskRun) { throw 'Choose a new empty test path; existing artifacts are retained.' }
$taskPackage = Join-Path $taskRun 'native-library-package'
$taskExecutable = Join-Path $taskPackage 'Canvas Live.exe'
$taskChecks = New-Object 'System.Collections.Generic.List[string]'
$taskProcess = $null
$taskBlocker = $null
$taskOwnPortBlocker = $false
$taskFailure = $null
$taskReport = @{ version = 1; passed = $false; source = $taskSource; package = $taskPackage; checks = @(); processesStopped = @(); originalFilesModified = $false }

function Assert-Library($condition, [string]$description) {
    if (!$condition) { throw ('Local library check failed: ' + $description) }
    $taskChecks.Add($description)
}
function Assert-OwnPath([string]$path) {
    $full = [IO.Path]::GetFullPath($path)
    if (!$full.StartsWith($taskRun + '\', [StringComparison]::OrdinalIgnoreCase)) { throw ('Test path escaped its isolated folder: ' + $full) }
    return $full
}
function Invoke-LibraryRequest([Uri]$url, [string]$target = '/__canvas_live_library', [string]$method = 'GET', [string[]]$headers = @(), [string]$body = '', [string]$hostValue = '') {
    if (!$hostValue) { $hostValue = $url.Authority }
    $connection = New-Object Net.Sockets.TcpClient
    try {
        $connection.ReceiveTimeout = 5000
        $connection.SendTimeout = 5000
        $connection.Connect($url.Host, $url.Port)
        $stream = $connection.GetStream()
        $head = $method + ' ' + $target + " HTTP/1.1`r`nHost: " + $hostValue + "`r`nConnection: close`r`n" + (($headers | ForEach-Object { $_ + "`r`n" }) -join '') + "`r`n"
        $raw = [Text.Encoding]::UTF8.GetBytes($head + $body)
        $stream.Write($raw, 0, $raw.Length)
        $memory = New-Object IO.MemoryStream
        try {
            $buffer = New-Object byte[] 8192
            while ($true) {
                $count = $stream.Read($buffer, 0, $buffer.Length)
                if ($count -eq 0) { break }
                $memory.Write($buffer, 0, $count)
                if ($memory.Length -gt 5 * 1024 * 1024) { throw 'The test HTTP response exceeded its fixture limit.' }
                $current = [Text.Encoding]::ASCII.GetString($memory.ToArray())
                $boundary = $current.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
                if ($boundary -ge 0 -and $current.Substring(0, $boundary) -match '(?im)^Content-Length: (\d+)\r?$') {
                    if ($memory.Length -ge $boundary + 4 + [long]$Matches[1]) { break }
                }
            }
            $text = [Text.Encoding]::UTF8.GetString($memory.ToArray())
        }
        finally { $memory.Dispose() }
        $parts = $text.Split([string[]]@("`r`n`r`n"), 2, [StringSplitOptions]::None)
        if ($parts[0] -notmatch '^HTTP/1.1 (\d+) ') { throw 'The test launcher did not return HTTP.' }
        $status = [int]$Matches[1]
        $parsed = $null
        try { $parsed = ConvertFrom-Json -InputObject $parts[1] } catch { }
        return @{ Status = $status; Body = $parts[1]; Header = $parts[0]; Json = $parsed }
    }
    finally { $connection.Close() }
}
function Invoke-LibraryPut([Uri]$url, [string]$key, $value, [long]$revision) {
    $body = ConvertTo-Json -InputObject $value -Depth 32 -Compress
    return Invoke-LibraryRequest $url ('/__canvas_live_library/' + [Uri]::EscapeDataString($key)) 'PUT' @('Content-Type: application/json', ('If-Match: ' + $revision), ('Content-Length: ' + [Text.Encoding]::UTF8.GetByteCount($body)), ('Origin: ' + $url.GetLeftPart([UriPartial]::Authority))) $body
}
function Start-OwnedLauncher {
    $process = Start-Process -FilePath $taskExecutable -ArgumentList '--no-browser' -WorkingDirectory $taskPackage -WindowStyle Hidden -PassThru
    $script:taskProcess = $process
    for ($attempt = 0; $attempt -lt 150; $attempt++) {
        if ($process.HasExited) { throw 'The isolated test launcher exited before startup.' }
        try {
            $endpoint = [Uri](Get-Content -LiteralPath $taskEndpointFile -Raw)
            $health = Invoke-LibraryRequest $endpoint '/__canvas_live_launcher'
            if ($health.Body -eq ('CanvasLive:' + $taskKey)) { return $endpoint }
        }
        catch { }
        Start-Sleep -Milliseconds 100
    }
    throw 'The isolated launcher did not publish its own healthy endpoint.'
}
function Stop-OwnedLauncher {
    if (!$taskProcess) { return }
    $taskProcess.Refresh()
    if (!$taskProcess.HasExited) {
        $live = Get-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue
        if ($live -and [IO.Path]::GetFullPath($live.Path) -eq $taskExecutable) {
            Stop-Process -InputObject $live -Force
            $taskProcess.WaitForExit(5000) | Out-Null
            $taskReport.processesStopped += $taskProcess.Id
        }
        elseif ($live) { throw 'The captured process path changed; no process was stopped.' }
    }
    $script:taskProcess = $null
}

New-Item -ItemType Directory -Path (Join-Path $taskPackage 'app') -Force | Out-Null
try {
    $before = @{}
    foreach ($name in @('launcher/CanvasLiveLauncher.cs', 'launcher/LocalLibrary.cs', 'launcher/Canvas Live.exe.config')) {
        $before[$name] = (Get-FileHash -LiteralPath (Join-Path $taskSource $name) -Algorithm SHA256).Hash
        Copy-Item -LiteralPath (Join-Path $taskSource $name) -Destination (Join-Path $taskPackage ([IO.Path]::GetFileName($name)))
    }
    $taskReport.sourceHashesBefore = $before
    [IO.File]::WriteAllText((Join-Path $taskPackage 'app/index.html'), '<!doctype html><html><head><title>Isolated library test</title></head><body>Native library test</body></html>', (New-Object Text.UTF8Encoding($false)))
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler '/nologo' '/target:winexe' '/platform:anycpu' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.Web.Extensions.dll' ('/out:' + $taskExecutable) (Join-Path $taskPackage 'CanvasLiveLauncher.cs') (Join-Path $taskPackage 'LocalLibrary.cs')
    if ($LASTEXITCODE -ne 0) { throw 'The copied native sources did not compile.' }
    $taskReport.executableSha256 = (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash
    Assert-Library (Test-Path -LiteralPath $taskExecutable) 'Compiled copied native sources without modifying the installed executable'
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $taskKey = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskPackage.ToLowerInvariant()))).Replace('-', '').Substring(0, 24) }
    finally { $hasher.Dispose() }
    $taskState = Join-Path $env:LOCALAPPDATA ('Canvas Live/launchers/' + $taskKey)
    $taskEndpointFile = Join-Path $taskState 'endpoint.txt'
    $taskOwnerBefore = $null
    try { $taskOwnerBefore = Invoke-LibraryRequest ([Uri]'http://127.0.0.1:4173/') '/__canvas_live_launcher' } catch { }
    $taskBlocker = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 4173)
    try { $taskBlocker.Start(); $taskOwnPortBlocker = $true } catch [Net.Sockets.SocketException] { }
    $url = Start-OwnedLauncher
    $taskReport.testUrl = $url.AbsoluteUri
    Assert-Library ($url.Port -ne 4173) 'Selected an isolated port while the original website or a test blocker retains 4173'
    $index = Invoke-LibraryRequest $url '/'
    Assert-Library ($index.Status -eq 200 -and $index.Body.Contains('<meta name="canvas-live-storage" content="local-v1">')) 'Native HTML advertises local library storage'
    $empty = Invoke-LibraryRequest $url
    Assert-Library ($empty.Status -eq 200 -and $empty.Json.version -eq 1 -and @($empty.Json.entries.PSObject.Properties).Count -eq 0) 'Fresh native library is empty and versioned'
    $fileKey = 'file:dGVzdC1maWxl'
    $metaKey = 'metadata:bWFpbg'
    $target = '/__canvas_live_library/' + [Uri]::EscapeDataString($fileKey)
    $missing = Invoke-LibraryRequest $url $target
    Assert-Library ($missing.Status -eq 200 -and $missing.Json.revision -eq 0 -and $null -eq $missing.Json.value) 'Missing items return revision zero without creating files'
    $canvas = @{ id = 'test-file'; projectId = 'project'; createdAt = 1; updatedAt = 1; lastOpenedAt = 1; document = @{ format = 'LCANVAS'; version = 2; name = 'Original'; viewport = @{ x = 0; y = 0; zoom = 1 }; layers = @(@{ id = 'layer-main'; name = 'Main'; visible = $true; locked = $false }); elements = @() } }
    $written = Invoke-LibraryPut $url $fileKey $canvas 0
    Assert-Library ($written.Status -eq 200 -and $written.Json.revision -eq 1 -and $written.Json.value.document.name -eq 'Original') 'Compare-and-swap creates a validated client canvas payload'
    $metadata = Invoke-LibraryPut $url $metaKey @{ version = 1; projects = @(@{ id = 'project'; name = 'Test project' }) } 0
    Assert-Library ($metadata.Status -eq 200 -and $metadata.Json.revision -eq 1) 'Independent canonical metadata is durably stored'
    $crossClient = Invoke-LibraryRequest $url $target
    Assert-Library ($crossClient.Status -eq 200 -and $crossClient.Json.value.id -eq 'test-file') 'A separate HTTP connection reads the identical saved file'
    $libraryPath = Join-Path $taskPackage 'data/library.json'
    $beforeConflict = (Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash
    $canvas.document.name = 'Rejected stale edit'
    $stale = Invoke-LibraryPut $url $fileKey $canvas 0
    Assert-Library ($stale.Status -eq 409 -and (Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash -eq $beforeConflict) 'Stale revision receives 409 and leaves the persisted library unchanged'
    $badRequests = @(
        @{ Name = 'Missing revision requires an explicit precondition'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'Content-Length: 2'); Body = '{}'; Status = 428 },
        @{ Name = 'Foreign Origin cannot read the library'; Method = 'GET'; Target = $target; Headers = @('Origin: https://foreign.example'); Status = 403 },
        @{ Name = 'Cross-site fetch cannot read the library'; Method = 'GET'; Target = $target; Headers = @('Sec-Fetch-Site: cross-site'); Status = 403 },
        @{ Name = 'Foreign Host cannot access the library'; Method = 'GET'; Target = $target; Headers = @(); Host = 'foreign.example'; Status = 403 },
        @{ Name = 'Malformed JSON is rejected'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 1', 'Content-Length: 10'); Body = '{bad json}'; Status = 400 },
        @{ Name = 'Primitive JSON is rejected'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 1', 'Content-Length: 2'); Body = '[]'; Status = 400 },
        @{ Name = 'Wrong content type is rejected'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: text/plain', 'If-Match: 1', 'Content-Length: 2'); Body = '{}'; Status = 415 },
        @{ Name = 'Oversized declared body is rejected before reading payload'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 1', 'Content-Length: 16777217'); Body = ''; Status = 413 },
        @{ Name = 'Unsupported methods are rejected'; Method = 'DELETE'; Target = $target; Headers = @(); Status = 405 },
        @{ Name = 'Traversal keys cannot name filesystem paths'; Method = 'GET'; Target = '/__canvas_live_library/file%3A..%2F..%2Fprivate'; Headers = @(); Status = 400 },
        @{ Name = 'Unapproved namespaces are rejected'; Method = 'GET'; Target = '/__canvas_live_library/shell%3Arun'; Headers = @(); Status = 400 },
        @{ Name = 'Absolute paths cannot be library identifiers'; Method = 'GET'; Target = '/__canvas_live_library/C%3A%5CWindows%5Cwin.ini'; Headers = @(); Status = 400 },
        @{ Name = 'Duplicate precondition headers are rejected before reading an ambiguous body'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 1', 'if-match: 1', 'Content-Length: 2'); Body = ''; Status = 400 },
        @{ Name = 'Prototype fields cannot be stored'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 1', 'Content-Length: 16'); Body = '{"__proto__":{}}'; Status = 400 }
    )
    foreach ($request in $badRequests) {
        $result = Invoke-LibraryRequest $url $request.Target $request.Method $request.Headers $request.Body $request.Host
        Assert-Library ($result.Status -eq $request.Status) ($request.Name + ' (HTTP ' + $result.Status + ')')
    }
    Assert-Library ((Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash -eq $beforeConflict) 'Rejected operations never replace persisted content'
    $canvas.document.name = 'Durable later edit'
    $canvas.updatedAt = 2
    $updated = Invoke-LibraryPut $url $fileKey $canvas 1
    Assert-Library ($updated.Status -eq 200 -and $updated.Json.revision -eq 2) 'Current revision commits the next canvas edit'
    $backupPath = Join-Path $taskPackage 'data/library.previous.json'
    $backup = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $backupPath -Raw)
    Assert-Library ($backup.entries.PSObject.Properties[$fileKey].Value.value.document.name -eq 'Original') 'Atomic replacement retains the previous valid library as a backup'
    Assert-Library (@(Get-ChildItem -LiteralPath (Join-Path $taskPackage 'data') -Filter 'library-*.tmp').Count -eq 0) 'Completed writes leave no partial transaction files'
    Stop-OwnedLauncher
    $url = Start-OwnedLauncher
    $reopened = Invoke-LibraryRequest $url $target
    Assert-Library ($reopened.Status -eq 200 -and $reopened.Json.revision -eq 2 -and $reopened.Json.value.document.name -eq 'Durable later edit') 'Stopping and restarting only the isolated process preserves the exact saved revision'
    $all = Invoke-LibraryRequest $url
    Assert-Library (@($all.Json.entries.PSObject.Properties).Count -eq 2) 'Restart preserves both the file and canonical metadata'
    Stop-OwnedLauncher
    $dataPath = Assert-OwnPath (Join-Path $taskPackage 'data')
    $retainedData = Assert-OwnPath (Join-Path $taskPackage 'data-retained')
    $decoy = Assert-OwnPath (Join-Path $taskRun 'decoy-data')
    Move-Item -LiteralPath $dataPath -Destination $retainedData
    New-Item -ItemType Directory -Path $decoy | Out-Null
    [IO.File]::WriteAllText((Join-Path $decoy 'library.json'), '{"version":1,"entries":{}}')
    $sentinelHash = (Get-FileHash -LiteralPath (Join-Path $decoy 'library.json') -Algorithm SHA256).Hash
    New-Item -ItemType Junction -Path $dataPath -Target $decoy | Out-Null
    try {
        $url = Start-OwnedLauncher
        $linked = Invoke-LibraryRequest $url
        Assert-Library ($linked.Status -eq 503) 'Reparse-point library folder is refused before reading its target'
        Assert-Library ((Get-FileHash -LiteralPath (Join-Path $decoy 'library.json') -Algorithm SHA256).Hash -eq $sentinelHash) 'Reparse-point target remains unchanged'
    }
    finally {
        Stop-OwnedLauncher
        if ((Get-Item -LiteralPath $dataPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($dataPath) }
        Move-Item -LiteralPath $retainedData -Destination $dataPath
    }
    $after = @{}
    foreach ($name in $before.Keys) { $after[$name] = (Get-FileHash -LiteralPath (Join-Path $taskSource $name) -Algorithm SHA256).Hash; Assert-Library ($after[$name] -eq $before[$name]) ('Original source/config unchanged: ' + $name) }
    $taskReport.sourceHashesAfter = $after
    if ($taskOwnerBefore) {
        $ownerAfter = Invoke-LibraryRequest ([Uri]'http://127.0.0.1:4173/') '/__canvas_live_launcher'
        Assert-Library ($ownerAfter.Status -eq $taskOwnerBefore.Status -and $ownerAfter.Body -eq $taskOwnerBefore.Body) 'Original website host on 4173 remains unchanged and responsive'
    }
    $taskReport.passed = $true
}
catch { $taskFailure = $_; $taskReport.error = $_.Exception.Message }
finally {
    try { Stop-OwnedLauncher } catch { $taskReport.cleanupError = $_.Exception.Message }
    if ($taskOwnPortBlocker) { $taskBlocker.Stop() }
    $taskReport.checks = @($taskChecks.ToArray())
    $taskReport.checkCount = $taskChecks.Count
    $taskReport.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $taskReportPath = Join-Path $taskRun 'native-library-report.json'
    $taskReport | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $taskReportPath -Encoding UTF8
    Write-Output ('Native library report: ' + $taskReportPath)
    Write-Output ('Checks passed: ' + $taskChecks.Count)
}
if ($taskFailure) { throw $taskFailure }
