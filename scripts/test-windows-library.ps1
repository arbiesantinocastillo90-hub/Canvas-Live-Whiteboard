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
    $taskProjectHash = (Image-Hash ([Text.Encoding]::UTF8.GetBytes('project'))).Substring(0, 32)
    $taskFileHash = (Image-Hash ([Text.Encoding]::UTF8.GetBytes($fileKey))).Substring(0, 32)
    $libraryPath = Join-Path $taskPackage ('data/library-v2/projects/' + $taskProjectHash + '/canvases/' + $taskFileHash + '.json')
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
    $backupPath = $libraryPath.Replace('.json', '.previous.json')
    $backup = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $backupPath -Raw)
    Assert-Library ($backup.key -eq $fileKey -and $backup.value.document.name -eq 'Original') 'Atomic replacement retains the previous valid canvas record as a backup'
    Assert-Library (@(Get-ChildItem -LiteralPath (Join-Path $taskPackage 'data') -Filter 'write-*.tmp' -Recurse).Count -eq 0) 'Completed writes leave no partial record transaction files'
    Stop-OwnedLauncher
    $url = Start-OwnedLauncher
    $reopened = Invoke-LibraryRequest $url $target
    Assert-Library ($reopened.Status -eq 200 -and $reopened.Json.revision -eq 2 -and $reopened.Json.value.document.name -eq 'Durable later edit') 'Stopping and restarting only the isolated process preserves the exact saved revision'
    $all = Invoke-LibraryRequest $url
    Assert-Library (@($all.Json.entries.PSObject.Properties).Count -eq 2) 'Restart preserves both the file and canonical metadata'
    $assetName = 'asset-' + ('a' * 64)
    $assetEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($assetName)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $assetKey = 'settings:' + $assetEncoded
    $assetTarget = '/__canvas_live_library/' + [Uri]::EscapeDataString($assetKey)
    $asset = @{ mime = 'image/gif'; dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
    $beforeAssetLibraryHash = (Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash
    $assetWritten = Invoke-LibraryPut $url $assetKey $asset 0
    Assert-Library ($assetWritten.Status -eq 200 -and $assetWritten.Json.revision -eq 1) 'Local background asset is saved through its content-addressed settings key'
    $assetHasher = [Security.Cryptography.SHA256]::Create()
    try { $assetFileName = [BitConverter]::ToString($assetHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($assetKey))).Replace('-', '').ToLowerInvariant() + '.json' }
    finally { $assetHasher.Dispose() }
    $assetPath = Join-Path $taskPackage ('data/appearance/' + $assetFileName)
    Assert-Library ((Test-Path -LiteralPath $assetPath) -and (Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash -eq $beforeAssetLibraryHash) 'Saving an image writes its isolated asset file without rewriting the active document library'
    $beforeSettingsAssetHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash
    $settingsKey = 'settings:bGlua3M'
    $settingsWritten = Invoke-LibraryPut $url $settingsKey @{ exactEnabled = $true; latestEnabled = $true } 0
    Assert-Library ($settingsWritten.Status -eq 200) 'Regular settings remain independent of bulky background assets'
    Assert-Library ((Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash -eq $beforeSettingsAssetHash) 'Updating small workspace settings does not rewrite background image bytes'
    $withoutAssets = Invoke-LibraryRequest $url
    Assert-Library ($withoutAssets.Status -eq 200 -and $null -eq $withoutAssets.Json.entries.PSObject.Properties[$assetKey] -and !$withoutAssets.Body.Contains($asset.dataURL)) 'Polling the library index omits background image entries and their bytes'
    Assert-Library (@($withoutAssets.Json.entries.PSObject.Properties).Count -eq 3 -and $withoutAssets.Json.entries.PSObject.Properties[$fileKey] -and $withoutAssets.Json.entries.PSObject.Properties[$metaKey] -and $withoutAssets.Json.entries.PSObject.Properties[$settingsKey]) 'Filtering background assets preserves canvas, metadata and ordinary settings entries'
    $assetRead = Invoke-LibraryRequest $url $assetTarget
    Assert-Library ($assetRead.Status -eq 200 -and $assetRead.Json.revision -eq 1 -and $assetRead.Json.value.mime -eq $asset.mime -and $assetRead.Json.value.dataURL -eq $asset.dataURL) 'A direct background asset read returns its complete unchanged image payload'
    $staleAsset = Invoke-LibraryPut $url $assetKey @{ mime = 'image/gif'; dataURL = 'Rejected stale fixture' } 0
    Assert-Library ($staleAsset.Status -eq 409 -and (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash -eq $beforeSettingsAssetHash) 'Stale image writes cannot replace durable asset bytes'
    $gifBytes = [Convert]::FromBase64String($asset.dataURL.Substring($asset.dataURL.IndexOf(',') + 1))
    $legacyId = Image-Hash $gifBytes
    $legacyKey = 'settings:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('asset-' + $legacyId)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $legacyWritten = Invoke-LibraryPut $url $legacyKey $asset 0
    $legacyBinary = Invoke-BinaryAsset $url $legacyId
    Assert-Library ($legacyWritten.Status -eq 200 -and $legacyBinary.Status -eq 200 -and (Image-Hash $legacyBinary.Bytes) -eq $legacyId) 'An existing JSON background migrates to identical binary image bytes on first use'
    Assert-Library ($legacyBinary.Type -eq 'image/gif' -and $legacyBinary.Cache.Contains('immutable') -and $legacyBinary.ETag -eq ('"' + $legacyId + '"')) 'Native images have exact raster MIME and immutable content-addressed cache headers'
    $unchangedImage = Invoke-BinaryAsset $url $legacyId 'GET' $null 'image/gif' $legacyBinary.ETag
    Assert-Library ($unchangedImage.Status -eq 304 -and $unchangedImage.Bytes.Length -eq 0) 'An image cache revalidation returns 304 with no image transfer'
    $largeImage = New-Object byte[] (20 * 1024 * 1024)
    [Array]::Copy($gifBytes, 0, $largeImage, 0, $gifBytes.Length - 1)
    $cursor = $gifBytes.Length - 1
    while ($largeImage.Length - $cursor -gt 4) {
        $remaining = $largeImage.Length - $cursor - 1
        $count = [Math]::Min(255, $remaining - 4)
        if ($count -lt 1) { break }
        $largeImage[$cursor++] = 33; $largeImage[$cursor++] = 254; $largeImage[$cursor++] = $count
        $cursor += $count; $largeImage[$cursor++] = 0
    }
    $largeImage[$cursor] = 59
    $largeId = Image-Hash $largeImage
    $beforeBinaryLibraryHash = (Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash
    $largeWritten = Invoke-BinaryAsset $url $largeId 'PUT' $largeImage
    Assert-Library ($largeWritten.Status -eq 200) 'A full 20 MiB GIF payload saves through the bounded binary endpoint'
    $largeRead = Invoke-BinaryAsset $url $largeId
    Assert-Library ($largeRead.Status -eq 200 -and $largeRead.Bytes.Length -eq $largeImage.Length -and (Image-Hash $largeRead.Bytes) -eq $largeId) 'The full 20 MiB image reads back with exactly matching byte count and hash'
    Assert-Library ((Get-FileHash -LiteralPath $libraryPath -Algorithm SHA256).Hash -eq $beforeBinaryLibraryHash) 'A large image upload never rewrites canonical document metadata'
    $badId = Invoke-BinaryAsset $url ('f' * 64) 'PUT' $gifBytes
    $badMime = Invoke-BinaryAsset $url $legacyId 'PUT' $gifBytes 'image/png'
    Assert-Library ($badId.Status -eq 400 -and $badMime.Status -eq 400) 'Binary uploads reject identifier mismatches and MIME mismatches'
    $binaryOversized = Invoke-LibraryRequest $url ('/__canvas_live_library/assets/' + $largeId) 'PUT' @('Content-Type: image/gif', 'Content-Length: 20971521') ''
    Assert-Library ($binaryOversized.Status -eq 413) 'Binary uploads above 20 MiB are rejected before reading a body'
    $binaryTraversal = Invoke-LibraryRequest $url '/__canvas_live_library/assets/..%2F..%2Fsecret'
    $binaryForeign = Invoke-LibraryRequest $url ('/__canvas_live_library/assets/' + $legacyId) 'GET' @('Origin: https://foreign.example')
    Assert-Library ($binaryTraversal.Status -eq 400 -and $binaryForeign.Status -eq 403) 'Binary assets refuse traversal identifiers and foreign origins'
    $binaryPath = Join-Path $taskPackage ('data/appearance/' + $largeId + '.image')
    $beforeCoreImageHash = (Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash
    $nextSettings = Invoke-LibraryPut $url $settingsKey @{ exactEnabled = $false; latestEnabled = $true } 1
    $indexAfterBinary = Invoke-LibraryRequest $url
    Assert-Library ($nextSettings.Status -eq 200 -and $indexAfterBinary.Body.Length -lt 5000 -and (Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash -eq $beforeCoreImageHash) 'Frequent metadata updates and polling retain a small index and leave large image bytes untouched'
    Stop-OwnedLauncher
    $url = Start-OwnedLauncher
    $assetReopened = Invoke-LibraryRequest $url $assetTarget
    $reopenedWithoutAssets = Invoke-LibraryRequest $url
    $binaryReopened = Invoke-BinaryAsset $url $largeId
    Assert-Library ($binaryReopened.Status -eq 200 -and $binaryReopened.Bytes.Length -eq 20 * 1024 * 1024 -and (Image-Hash $binaryReopened.Bytes) -eq $largeId) 'Restart durably preserves full 20 MiB binary backgrounds independently of the library index'

    $durableAsset = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $assetPath -Raw)
    Assert-Library ($assetReopened.Status -eq 200 -and $assetReopened.Json.revision -eq 1 -and $assetReopened.Json.value.dataURL -eq $asset.dataURL -and $durableAsset.value.dataURL -eq $asset.dataURL -and $null -eq $reopenedWithoutAssets.Json.entries.PSObject.Properties[$assetKey]) 'Restart retains the full asset on disk and by direct key while the polling index stays small'
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
