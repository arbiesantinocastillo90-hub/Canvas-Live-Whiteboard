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
            $responseLength = -1
            while ($true) {
                $count = $stream.Read($buffer, 0, $buffer.Length)
                if ($count -eq 0) { break }
                $memory.Write($buffer, 0, $count)
                if ($memory.Length -gt 20 * 1024 * 1024) { throw 'The test HTTP response exceeded its fixture limit.' }
                if ($responseLength -lt 0) {
                    $current = [Text.Encoding]::ASCII.GetString($memory.ToArray())
                    $boundary = $current.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
                    if ($boundary -ge 0 -and $current.Substring(0, $boundary) -match '(?im)^Content-Length: (\d+)\r?$') { $responseLength = $boundary + 4 + [long]$Matches[1] }
                }
                if ($responseLength -ge 0 -and $memory.Length -ge $responseLength) { break }
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
function Invoke-BinaryAsset([Uri]$url, [string]$id, [string]$method = 'GET', [byte[]]$bytes = $null, [string]$mime = 'image/gif', [string]$etag = '') {
    $request = [Net.HttpWebRequest]::Create([Uri]::new($url, '/__canvas_live_library/assets/' + $id))
    $request.Method = $method
    $request.Proxy = $null
    $request.KeepAlive = $false
    $request.Timeout = 60000
    $request.ReadWriteTimeout = 60000
    if ($etag) { $request.Headers['If-None-Match'] = $etag }
    if ($method -eq 'PUT') {
        $request.ContentType = $mime
        $request.ContentLength = $bytes.Length
        $write = $request.GetRequestStream()
        try { $write.Write($bytes, 0, $bytes.Length) } finally { $write.Dispose() }
    }
    try { $response = $request.GetResponse() }
    catch [Net.WebException] { if ($_.Exception.Response) { $response = $_.Exception.Response } else { throw } }
    try {
        $memory = New-Object IO.MemoryStream
        $read = $response.GetResponseStream()
        try { $read.CopyTo($memory); $body = $memory.ToArray() } finally { $read.Dispose(); $memory.Dispose() }
        return @{ Status = [int]$response.StatusCode; Bytes = $body; Type = $response.ContentType; Cache = $response.Headers['Cache-Control']; ETag = $response.Headers['ETag'] }
    }
    finally { $response.Dispose() }
}
function Image-Hash([byte[]]$bytes) {
    $imageHasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($imageHasher.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $imageHasher.Dispose() }
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

function Library-Key([string]$kind, [string]$id) {
    return $kind + ':' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($id)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function String-Hash([string]$text) { return Image-Hash ([Text.Encoding]::UTF8.GetBytes($text)) }
function Record-Hash([string]$text) { return (String-Hash $text).Substring(0, 32) }
function File-Record([string]$id, [string]$project = 'project', [string]$name = 'Original') {
    return @{ id = $id; projectId = $project; createdAt = 1; updatedAt = 1; lastOpenedAt = 1; document = @{ format = 'LCANVAS'; version = 2; name = $name; viewport = @{ x = 0; y = 0; zoom = 1 }; layers = @(@{ id = 'layer-main'; name = 'Main'; visible = $true; locked = $false }); elements = @() } }
}
function Json-File([string]$path, $value) {
    $path = Assert-OwnPath $path
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
    [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $value -Depth 64 -Compress), (New-Object Text.UTF8Encoding($false)))
}
function Record-Path([string]$key, [string]$project = 'project') {
    return Join-Path $taskPackage ('data/library-v2/projects/' + (Record-Hash $project) + '/canvases/' + (Record-Hash $key) + '.json')
}
function Reset-OwnedData([string]$retainedName) {
    Stop-OwnedLauncher
    $source = Assert-OwnPath (Join-Path $taskPackage 'data')
    $target = Assert-OwnPath (Join-Path $taskPackage $retainedName)
    if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination $target }
    New-Item -ItemType Directory -Path $source | Out-Null
}

New-Item -ItemType Directory -Path (Join-Path $taskPackage 'app') -Force | Out-Null
try {
    $before = @{}
    foreach ($name in @('launcher/CanvasLiveLauncher.cs', 'launcher/LocalLibrary.cs', 'launcher/Canvas Live.exe.config')) {
        $before[$name] = (Get-FileHash -LiteralPath (Join-Path $taskSource $name) -Algorithm SHA256).Hash
        Copy-Item -LiteralPath (Join-Path $taskSource $name) -Destination (Join-Path $taskPackage ([IO.Path]::GetFileName($name)))
    }
    $taskReport.sourceHashesBefore = $before
    [IO.File]::WriteAllText((Join-Path $taskPackage 'app/index.html'), '<!doctype html><html><head><title>Isolated library v2 test</title></head><body>Native library test</body></html>', (New-Object Text.UTF8Encoding($false)))
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler '/nologo' '/target:winexe' '/platform:anycpu' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.Web.Extensions.dll' ('/out:' + $taskExecutable) (Join-Path $taskPackage 'CanvasLiveLauncher.cs') (Join-Path $taskPackage 'LocalLibrary.cs')
    if ($LASTEXITCODE -ne 0) { throw 'The copied native sources did not compile.' }
    $taskReport.executableSha256 = (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash
    Assert-Library (Test-Path -LiteralPath $taskExecutable) 'Compiled the native source in a separate temporary package'
    $taskKey = (String-Hash $taskPackage.ToLowerInvariant()).Substring(0, 24).ToUpperInvariant()
    $taskState = Join-Path $env:LOCALAPPDATA ('Canvas Live/launchers/' + $taskKey)
    $taskEndpointFile = Join-Path $taskState 'endpoint.txt'
    $taskOwnerBefore = $null
    try { $taskOwnerBefore = Invoke-LibraryRequest ([Uri]'http://127.0.0.1:4173/') '/__canvas_live_launcher' } catch { }
    $taskBlocker = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 4173)
    try { $taskBlocker.Start(); $taskOwnPortBlocker = $true } catch [Net.Sockets.SocketException] { }
    $url = Start-OwnedLauncher
    $taskReport.testUrl = $url.AbsoluteUri
    Assert-Library ($url.Port -ne 4173) 'Tests keep the original website or a test blocker on port 4173'
    $catalog = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library ($catalog.Status -eq 200 -and $catalog.Json.version -eq 2 -and @($catalog.Json.files).Count -eq 0) 'A new library exposes a lightweight empty v2 catalog'
    $empty = Invoke-LibraryRequest $url
    Assert-Library ($empty.Status -eq 200 -and $empty.Json.version -eq 1 -and @($empty.Json.entries.PSObject.Properties).Count -eq 0) 'The previous full-collection GET remains compatible'
    $format = Join-Path $taskPackage 'data/library-v2/format.json'
    Assert-Library ((Test-Path -LiteralPath $format) -and !(Test-Path -LiteralPath (Join-Path $taskPackage 'data/library.json'))) 'New libraries commit a folder-format marker without creating a monolithic save'
    $fileKey = Library-Key 'file' 'test-file'
    $otherKey = Library-Key 'file' 'other-file'
    $metaKey = Library-Key 'metadata' 'main'
    $sessionKey = Library-Key 'sessions' 'main'
    $target = '/__canvas_live_library/' + [Uri]::EscapeDataString($fileKey)
    $missing = Invoke-LibraryRequest $url $target
    Assert-Library ($missing.Status -eq 200 -and $missing.Json.revision -eq 0 -and $null -eq $missing.Json.value) 'A missing file remains revision zero'
    $canvas = File-Record 'test-file'
    $written = Invoke-LibraryPut $url $fileKey $canvas 0
    if ($written.Status -ne 200) { throw ('Creating the fixture failed: HTTP ' + $written.Status + ' ' + $written.Body) }
    Assert-Library ($written.Status -eq 200 -and $written.Json.revision -eq 1) 'Creating a canvas atomically stores its first revision'
    $filePath = Record-Path $fileKey
    $otherPath = Record-Path $otherKey
    $saved = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $filePath -Raw)
    Assert-Library ($saved.version -eq 2 -and $saved.key -eq $fileKey -and $saved.value.id -eq 'test-file') 'The canvas is stored in its project-owned folder with its original identifier'
    $other = File-Record 'other-file' 'project' 'Duplicate'
    $duplicate = Invoke-LibraryPut $url $otherKey $other 0
    Assert-Library ($duplicate.Status -eq 200 -and (Test-Path -LiteralPath $otherPath)) 'A duplicated canvas has its own independent saved record'
    $otherHash = (Get-FileHash -LiteralPath $otherPath -Algorithm SHA256).Hash
    $unindexedKey = Library-Key 'file' 'unindexed-file'
    $unindexedPath = Record-Path $unindexedKey
    Json-File $unindexedPath @{ retained = 'A file appeared after the running process loaded its index.' }
    $unindexedHash = (Get-FileHash -LiteralPath $unindexedPath -Algorithm SHA256).Hash
    Assert-Library ((Invoke-LibraryPut $url $unindexedKey (File-Record 'unindexed-file') 0).Status -eq 503 -and (Get-FileHash -LiteralPath $unindexedPath -Algorithm SHA256).Hash -eq $unindexedHash) 'A new identifier cannot overwrite an unindexed file already present on disk'
    Move-Item -LiteralPath (Assert-OwnPath $unindexedPath) -Destination (Assert-OwnPath ($unindexedPath + '.retained'))
    $metadata = @{ version = 1; projects = @(@{ id = 'project'; name = 'Project / unsafe : name'; createdAt = 1 }) }
    $sessions = @{ version = 1; activeId = 'workspace-a'; items = @(@{ id = 'workspace-a'; name = 'Workspace A'; projectIds = @('project') }, @{ id = 'workspace-b'; name = 'Workspace B'; projectIds = @('project') }) }
    Assert-Library ((Invoke-LibraryPut $url $metaKey $metadata 0).Status -eq 200) 'Creating project metadata saves its canonical record'
    Assert-Library ((Invoke-LibraryPut $url $sessionKey $sessions 0).Status -eq 200) 'Creating workspace metadata saves its canonical record'
    $projectDescriptor = Join-Path $taskPackage ('data/library-v2/projects/' + (Record-Hash 'project') + '/project.json')
    $workspaceDescriptor = Join-Path $taskPackage ('data/library-v2/workspaces/' + (Record-Hash 'workspace-a') + '/workspace.json')
    Assert-Library ((Test-Path -LiteralPath $projectDescriptor) -and (ConvertFrom-Json -InputObject (Get-Content -LiteralPath $projectDescriptor -Raw)).name -eq 'Project / unsafe : name') 'Project folders use stable IDs and retain names safely inside their descriptions'
    Assert-Library ((Test-Path -LiteralPath $workspaceDescriptor) -and (ConvertFrom-Json -InputObject (Get-Content -LiteralPath $workspaceDescriptor -Raw)).projectIds[0] -eq 'project') 'A workspace gets its own folder and references its shared projects'
    Assert-Library (@(Get-ChildItem -LiteralPath (Split-Path -Parent $filePath) -Filter '*.json').Count -eq 2) 'Sharing a project between two workspaces does not duplicate its canonical canvases'
    $canvas.document.name = 'Durable edit'
    $canvas.updatedAt = 2
    $updated = Invoke-LibraryPut $url $fileKey $canvas 1
    Assert-Library ($updated.Status -eq 200 -and $updated.Json.revision -eq 2) 'Saving writes exactly the next revision'
    Assert-Library ((Get-FileHash -LiteralPath $otherPath -Algorithm SHA256).Hash -eq $otherHash) 'Editing one canvas leaves every byte of an unrelated canvas unchanged'
    $previousPath = $filePath.Replace('.json', '.previous.json')
    Assert-Library ((ConvertFrom-Json -InputObject (Get-Content -LiteralPath $previousPath -Raw)).value.document.name -eq 'Original') 'Atomic replacement retains the previous valid revision beside that canvas'
    $currentHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
    Assert-Library ((Invoke-LibraryPut $url $fileKey $canvas 0).Status -eq 409 -and (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -eq $currentHash) 'A stale save is rejected without replacing any saved bytes'
    $catalog = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library (@($catalog.Json.files).Count -eq 2 -and $null -eq $catalog.Json.entries.PSObject.Properties[$fileKey]) 'The catalog separates file summaries from full non-file values'
    $summary = @($catalog.Json.files | Where-Object key -eq $fileKey)[0]
    Assert-Library ($summary.revision -eq 2 -and $summary.id -eq 'test-file' -and $summary.projectId -eq 'project' -and $summary.name -eq 'Durable edit' -and $summary.updatedAt -eq 2 -and $null -eq $summary.document) 'File summaries include exact identity, revision and dates without canvas bodies'
    foreach ($request in @(
        @{ Name = 'Missing write revision'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'Content-Length: 2'); Body = '{}'; Status = 428 },
        @{ Name = 'Foreign origin'; Method = 'GET'; Target = '/__canvas_live_library/catalog'; Headers = @('Origin: https://foreign.example'); Status = 403 },
        @{ Name = 'Cross-site catalog'; Method = 'GET'; Target = '/__canvas_live_library/catalog'; Headers = @('Sec-Fetch-Site: cross-site'); Status = 403 },
        @{ Name = 'Foreign host'; Method = 'GET'; Target = '/__canvas_live_library/catalog'; Headers = @(); Host = 'foreign.example'; Status = 403 },
        @{ Name = 'Traversal identifier'; Method = 'GET'; Target = '/__canvas_live_library/file%3A..%2F..%2Fprivate'; Headers = @(); Status = 400 },
        @{ Name = 'Unknown namespace'; Method = 'GET'; Target = '/__canvas_live_library/shell%3Arun'; Headers = @(); Status = 400 },
        @{ Name = 'Malformed JSON'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 2', 'Content-Length: 10'); Body = '{bad json}'; Status = 400 },
        @{ Name = 'Prototype field'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 2', 'Content-Length: 16'); Body = '{"__proto__":{}}'; Status = 400 },
        @{ Name = 'Unbounded body'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 2', 'Content-Length: 16777217'); Body = ''; Status = 413 },
        @{ Name = 'Duplicate preconditions'; Method = 'PUT'; Target = $target; Headers = @('Content-Type: application/json', 'If-Match: 2', 'if-match: 2', 'Content-Length: 2'); Body = ''; Status = 400 },
        @{ Name = 'Unsupported delete'; Method = 'DELETE'; Target = $target; Headers = @(); Status = 405 }
    )) {
        $response = Invoke-LibraryRequest $url $request.Target $request.Method $request.Headers $request.Body $request.Host
        Assert-Library ($response.Status -eq $request.Status) ($request.Name + ' is refused (HTTP ' + $response.Status + ')')
    }
    $largeKey = Library-Key 'file' 'large-file'
    $large = File-Record 'large-file'
    $large.document.padding = 'DO-NOT-TRANSFER-FULL-CANVAS-' + ('x' * (8 * 1024 * 1024))
    Assert-Library ((Invoke-LibraryPut $url $largeKey $large 0).Status -eq 200) 'A large individual canvas saves within the existing bounded request limit'
    $catalog = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library ($catalog.Status -eq 200 -and $catalog.Body.Length -lt 6000 -and !$catalog.Body.Contains('DO-NOT-TRANSFER-FULL-CANVAS')) 'An 8 MiB canvas does not inflate the Home catalog response'
    $reader = New-Object Net.Sockets.TcpClient
    try {
        $reader.ReceiveBufferSize = 1024; $reader.Connect($url.Host, $url.Port)
        $request = [Text.Encoding]::ASCII.GetBytes("GET /__canvas_live_library HTTP/1.1`r`nHost: " + $url.Authority + "`r`nConnection: close`r`n`r`n")
        $reader.GetStream().Write($request, 0, $request.Length)
        Start-Sleep -Milliseconds 200
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $duringRead = Invoke-LibraryPut $url (Library-Key 'settings' 'links') @{ exactEnabled = $true } 0
        $watch.Stop(); $taskReport.saveWhileReaderStalledMs = $watch.ElapsedMilliseconds
        Assert-Library ($duringRead.Status -eq 200 -and $watch.ElapsedMilliseconds -lt 2500) 'A stalled full-library reader does not hold the save transaction lock'
    }
    finally { $reader.Close() }
    Stop-OwnedLauncher; $url = Start-OwnedLauncher
    $reopened = Invoke-LibraryRequest $url $target
    Assert-Library ($reopened.Status -eq 200 -and $reopened.Json.revision -eq 2 -and $reopened.Json.value.document.name -eq 'Durable edit') 'Restart reopens the exact durable per-canvas revision'
    Stop-OwnedLauncher
    [IO.File]::WriteAllText($filePath, '{ interrupted current record')
    $damagedHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
    $url = Start-OwnedLauncher
    $catalog = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    $restored = Invoke-LibraryRequest $url $target
    Assert-Library ($catalog.Status -eq 200 -and @($catalog.Json.issues | Where-Object { $_.key -eq $fileKey -and $_.recovered }).Count -eq 1) 'A damaged current record reports recovery from its own previous copy'
    Assert-Library ($restored.Status -eq 200 -and $restored.Json.revision -eq 1 -and $restored.Json.value.document.name -eq 'Original') 'Recovery returns the previous valid contents and their matching revision'
    Assert-Library ((Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -eq $damagedHash) 'Reading a recovered item leaves its damaged source untouched'
    $canvas.document.name = 'Saved after recovery'
    $repaired = Invoke-LibraryPut $url $fileKey $canvas 1
    Assert-Library ($repaired.Status -eq 200 -and $repaired.Json.revision -eq 2 -and @(Get-ChildItem -LiteralPath (Join-Path $taskPackage 'data/library-v2/recovery') -Filter ((Record-Hash $fileKey) + '-*.json')).Count -eq 1) 'A subsequent valid save keeps a separate copy of the damaged source'
    Assert-Library ((ConvertFrom-Json -InputObject (Get-Content -LiteralPath $previousPath -Raw)).value.document.name -eq 'Original') 'Saving after recovery retains the valid previous copy'
    Stop-OwnedLauncher
    $removedCurrent = Assert-OwnPath ($filePath + '.retained')
    Move-Item -LiteralPath $filePath -Destination $removedCurrent
    $url = Start-OwnedLauncher
    $restoredMissing = Invoke-LibraryRequest $url $target
    Assert-Library ($restoredMissing.Status -eq 200 -and $restoredMissing.Json.revision -eq 1) 'A missing current file can still be found and recovered through its previous record'
    Stop-OwnedLauncher
    [IO.File]::WriteAllText($otherPath, '{ unrecoverable fixture')
    $unrecoverableHash = (Get-FileHash -LiteralPath $otherPath -Algorithm SHA256).Hash
    $url = Start-OwnedLauncher
    $partial = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library ($partial.Status -eq 200 -and @($partial.Json.files | Where-Object id -eq 'test-file').Count -eq 1 -and @($partial.Json.files | Where-Object id -eq 'other-file').Count -eq 0 -and @($partial.Json.issues | Where-Object { !$_.recovered }).Count -ge 1) 'An unrecoverable canvas is isolated while healthy canvases and projects remain available'
    Assert-Library ((Invoke-LibraryRequest $url ('/__canvas_live_library/' + [Uri]::EscapeDataString($otherKey))).Status -eq 503) 'An unreadable existing canvas never masquerades as an empty new file'
    Assert-Library ((Invoke-LibraryPut $url $otherKey $other 0).Status -eq 503 -and (Get-FileHash -LiteralPath $otherPath -Algorithm SHA256).Hash -eq $unrecoverableHash) 'Even an unknown corrupt key is protected against a create-overwrite attempt'
    $descriptorRetained = Assert-OwnPath ($projectDescriptor + '.retained')
    Move-Item -LiteralPath $projectDescriptor -Destination $descriptorRetained
    New-Item -ItemType Directory -Path $projectDescriptor | Out-Null
    $metadata.projects[0].name = 'Updated project name'
    Assert-Library ((Invoke-LibraryPut $url $metaKey $metadata 1).Status -eq 200) 'A folder-description failure cannot undo or hide a successful canonical metadata save'
    Stop-OwnedLauncher
    [IO.Directory]::Delete((Assert-OwnPath $projectDescriptor)); Move-Item -LiteralPath $descriptorRetained -Destination $projectDescriptor

    Reset-OwnedData 'data-fresh-retained'
    $legacyFile = File-Record 'legacy-file' 'legacy-project' 'Legacy intact'
    $legacyKey = Library-Key 'file' 'legacy-file'
    $fallbackKey = Library-Key 'file' 'legacy-fallback'
    $blockedKey = Library-Key 'file' 'legacy-blocked'
    $previousOnlyKey = Library-Key 'file' 'legacy-previous-only'
    $previousOnlyBadKey = Library-Key 'file' 'legacy-previous-bad'
    $legacyMetadata = @{ version = 1; projects = @(@{ id = 'legacy-project'; name = 'Legacy project'; createdAt = 1 }) }
    $legacySessions = @{ version = 1; activeId = 'legacy-workspace'; items = @(@{ id = 'legacy-workspace'; name = 'Legacy workspace'; projectIds = @('legacy-project') }) }
    $legacyEntries = @{ $legacyKey = @{ revision = 4; value = $legacyFile }; $metaKey = @{ revision = 3; value = $legacyMetadata }; $sessionKey = @{ revision = 2; value = $legacySessions }; $fallbackKey = @{ revision = 'broken'; value = @{} }; $blockedKey = @{ revision = 'broken'; value = @{} } }
    $previousEntries = @{ $fallbackKey = @{ revision = 6; value = (File-Record 'legacy-fallback' 'legacy-project' 'Recovered legacy') }; $previousOnlyKey = @{ revision = 7; value = (File-Record 'legacy-previous-only' 'orphan-project' 'Previous-only saved canvas') }; $previousOnlyBadKey = @{ revision = 'broken'; value = @{} } }
    $legacyPath = Join-Path $taskPackage 'data/library.json'
    $legacyPrevious = Join-Path $taskPackage 'data/library.previous.json'
    Json-File $legacyPath @{ version = 1; entries = $legacyEntries }
    Json-File $legacyPrevious @{ version = 1; entries = $previousEntries }
    $legacyHash = (Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash
    $legacyPreviousHash = (Get-FileHash -LiteralPath $legacyPrevious -Algorithm SHA256).Hash
    $staging = Join-Path $taskPackage 'data/library-v2-staging-incomplete'
    Json-File (Join-Path $staging 'ignored.json') @{ incomplete = $true }
    $url = Start-OwnedLauncher
    $migrated = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library ($migrated.Status -eq 200 -and @($migrated.Json.files).Count -eq 3 -and @($migrated.Json.files | Where-Object { $_.id -eq 'legacy-file' -and $_.revision -eq 4 }).Count -eq 1) 'Legacy migration preserves good records and their exact saved revisions'
    Assert-Library (@($migrated.Json.files | Where-Object { $_.key -eq $previousOnlyKey -and $_.revision -eq 7 -and $_.projectId -eq 'orphan-project' }).Count -eq 1 -and @($migrated.Json.issues | Where-Object { $_.key -eq $previousOnlyKey -and $_.recovered }).Count -eq 1) 'A valid backup-only canvas is salvaged with its exact revision and a recovery notice'
    Assert-Library (@($migrated.Json.entries.PSObject.Properties[$metaKey].Value.value.projects).Count -eq 1 -and $migrated.Json.entries.PSObject.Properties[$metaKey].Value.value.projects[0].id -eq 'legacy-project') 'Recovering an orphan canvas does not restore old project or workspace membership'
    Assert-Library (@($migrated.Json.files | Where-Object key -eq $previousOnlyBadKey).Count -eq 0 -and @($migrated.Json.issues | Where-Object { $_.key -eq $previousOnlyBadKey -and !$_.recovered }).Count -eq 1 -and (Invoke-LibraryPut $url $previousOnlyBadKey (File-Record 'legacy-previous-bad') 0).Status -eq 503) 'A malformed backup-only item is isolated and protected without blocking healthy records'
    Assert-Library (@($migrated.Json.issues | Where-Object { $_.key -eq $fallbackKey -and $_.recovered }).Count -eq 1 -and @($migrated.Json.issues | Where-Object { $_.key -eq $blockedKey -and !$_.recovered }).Count -eq 1) 'Migration separately reports recovered and unrecoverable legacy records'
    Assert-Library ((Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -eq $legacyHash -and (Get-FileHash -LiteralPath $legacyPrevious -Algorithm SHA256).Hash -eq $legacyPreviousHash) 'Upgrading never modifies or removes either original monolithic save'
    Assert-Library ((Test-Path -LiteralPath $format) -and (Test-Path -LiteralPath (Record-Path $legacyKey 'legacy-project')) -and (Test-Path -LiteralPath $staging)) 'Only a completed folder tree is activated; unrelated incomplete staging remains retained'
    Assert-Library ((Invoke-LibraryPut $url $blockedKey (File-Record 'legacy-blocked' 'legacy-project') 0).Status -eq 503) 'Migration prevents a new save from replacing an unrecoverable legacy entry'
    Stop-OwnedLauncher; $url = Start-OwnedLauncher
    Assert-Library ((Invoke-LibraryPut $url $blockedKey (File-Record 'legacy-blocked' 'legacy-project') 0).Status -eq 503) 'Unrecoverable legacy guards remain in force after restarting'
    Assert-Library ((Invoke-LibraryRequest $url ('/__canvas_live_library/' + [Uri]::EscapeDataString($fallbackKey))).Json.revision -eq 6) 'Restart preserves a recovered legacy canvas at its exact previous revision'
    Stop-OwnedLauncher
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library-v2/blocked.json'), '[]')
    $url = Start-OwnedLauncher
    Assert-Library ((Invoke-LibraryRequest $url '/__canvas_live_library/catalog').Status -eq 503) 'A damaged recovery guard cannot silently enable overwriting unrecoverable legacy data'
    Reset-OwnedData 'data-migration-retained'
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library.json'), '{ damaged entire collection')
    Json-File (Join-Path $taskPackage 'data/library.previous.json') @{ version = 1; entries = @{ $legacyKey = @{ revision = 4; value = $legacyFile } } }
    $url = Start-OwnedLauncher
    $whole = Invoke-LibraryRequest $url '/__canvas_live_library/catalog'
    Assert-Library ($whole.Status -eq 200 -and @($whole.Json.files).Count -eq 1 -and @($whole.Json.issues | Where-Object recovered).Count -eq 1) 'A malformed whole legacy collection can recover through its retained previous collection'
    Reset-OwnedData 'data-whole-recovery-retained'
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library.json'), '{ damaged collection')
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library.previous.json'), '{ damaged previous collection')
    $url = Start-OwnedLauncher
    Assert-Library ((Invoke-LibraryRequest $url '/__canvas_live_library/catalog').Status -eq 503 -and !(Test-Path -LiteralPath $format)) 'Two unreadable legacy collections are retained and never replaced by an empty folder library'
    Reset-OwnedData 'data-unrecoverable-retained'
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library.json'), '[]')
    $url = Start-OwnedLauncher
    Assert-Library ((Invoke-LibraryRequest $url '/__canvas_live_library/catalog').Status -eq 503 -and !(Test-Path -LiteralPath $format)) 'A JSON array legacy root is damaged data, never a missing or new library'
    Reset-OwnedData 'data-array-root-retained'
    [IO.File]::WriteAllText((Join-Path $taskPackage 'data/library.json'), 'null')
    $url = Start-OwnedLauncher
    Assert-Library ((Invoke-LibraryRequest $url '/__canvas_live_library/catalog').Status -eq 503 -and !(Test-Path -LiteralPath $format)) 'A JSON null legacy root cannot be migrated as an empty collection'
    Reset-OwnedData 'data-null-root-retained'
    $v2Path = Assert-OwnPath (Join-Path $taskPackage 'data/library-v2')
    $decoy = Assert-OwnPath (Join-Path $taskRun 'decoy-library')
    Json-File (Join-Path $decoy 'format.json') @{ version = 2 }
    $sentinelHash = (Get-FileHash -LiteralPath (Join-Path $decoy 'format.json') -Algorithm SHA256).Hash
    New-Item -ItemType Junction -Path $v2Path -Target $decoy | Out-Null
    try {
        $url = Start-OwnedLauncher
        Assert-Library ((Invoke-LibraryRequest $url '/__canvas_live_library/catalog').Status -eq 503) 'A linked library folder is refused before reading its target'
        Assert-Library ((Get-FileHash -LiteralPath (Join-Path $decoy 'format.json') -Algorithm SHA256).Hash -eq $sentinelHash) 'The linked-folder target remains unchanged'
    }
    finally { Stop-OwnedLauncher; [IO.Directory]::Delete((Assert-OwnPath $v2Path)) }
    foreach ($name in $before.Keys) { Assert-Library ((Get-FileHash -LiteralPath (Join-Path $taskSource $name) -Algorithm SHA256).Hash -eq $before[$name]) ('The source/config was not modified by verification: ' + $name) }
    if ($taskOwnerBefore) {
        $ownerAfter = Invoke-LibraryRequest ([Uri]'http://127.0.0.1:4173/') '/__canvas_live_launcher'
        Assert-Library ($ownerAfter.Status -eq $taskOwnerBefore.Status -and $ownerAfter.Body -eq $taskOwnerBefore.Body) 'The original website host remains unchanged and responsive'
    }
    $taskReport.passed = $true
}
catch { $taskFailure = $_; $taskReport.error = $_.Exception.Message }
finally {
    try { Stop-OwnedLauncher } catch { $taskReport.cleanupError = $_.Exception.Message }
    if ($taskOwnPortBlocker) { $taskBlocker.Stop() }
    $taskReport.checks = @($taskChecks.ToArray()); $taskReport.checkCount = $taskChecks.Count
    $taskReport.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $taskReportPath = Join-Path $taskRun 'native-library-v2-report.json'
    $taskReport | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $taskReportPath -Encoding UTF8
    Write-Output ('Native library v2 report: ' + $taskReportPath)
    Write-Output ('Checks passed: ' + $taskChecks.Count)
}
if ($taskFailure) { throw $taskFailure }
