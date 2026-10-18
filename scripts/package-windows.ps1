$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskReleaseRoot = Join-Path $taskRoot 'release'
$taskOutput = Join-Path $taskReleaseRoot 'Canvas Live'
function Assert-NoPrivatePackageState {
    foreach ($taskPrivatePath in @('data', '.canvas-live', 'root.config.json', 'root.config', 'Connect ChatGPT.ps1')) {
        if (Test-Path -LiteralPath (Join-Path $taskOutput $taskPrivatePath)) {
            throw 'The existing release contains library data or private connection settings. Use the data-preserving update workflow, or choose a new empty release folder; packaging will not replace this installation.'
        }
    }
}
Assert-NoPrivatePackageState
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $taskCompiler)) { throw 'The Windows .NET Framework compiler is required to build the launcher.' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) { throw 'Build the website before packaging the launcher.' }
New-Item -ItemType Directory -Path $taskReleaseRoot -Force | Out-Null
$taskStage = Join-Path $taskReleaseRoot ('.stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist') -Destination (Join-Path $taskStage 'app') -Recurse
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/canvas-live.ico') -Destination (Join-Path $taskStage 'app/canvas-live.ico')
Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination (Join-Path $taskStage 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/THIRD_PARTY_NOTICES.md') -Destination (Join-Path $taskStage 'THIRD_PARTY_NOTICES.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/README.txt') -Destination (Join-Path $taskStage 'README.txt')
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'dist-mcp/server.mjs'))) { throw 'Build the MCP companion before packaging the launcher.' }
New-Item -ItemType Directory -Path (Join-Path $taskStage 'mcp') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist-mcp/server.mjs') -Destination (Join-Path $taskStage 'mcp/server.mjs')
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/Start Canvas Live MCP.cmd') -Destination $taskStage
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/CHATGPT_MCP.md') -Destination (Join-Path $taskStage 'CHATGPT_MCP.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/PORTABLE_MCP.md') -Destination (Join-Path $taskStage 'PORTABLE_MCP.md')
& (Join-Path $PSScriptRoot 'package-mcp-runtime.ps1') -Destination (Join-Path $taskStage 'runtime')
Copy-Item -LiteralPath (Join-Path $taskRoot 'scripts/start-chatgpt-tunnel.ps1') -Destination $taskStage
Copy-Item -LiteralPath (Join-Path $taskRoot 'plugins/canvas-live') -Destination (Join-Path $taskStage 'plugin') -Recurse
& $taskCompiler '/nologo' '/target:winexe' '/platform:anycpu' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.Web.Extensions.dll' ('/win32icon:' + (Join-Path $taskRoot 'launcher/canvas-live.ico')) ('/out:' + (Join-Path $taskStage 'Canvas Live.exe')) (Join-Path $taskRoot 'launcher/CanvasLiveLauncher.cs') (Join-Path $taskRoot 'launcher/LocalLibrary.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed. The staged files have been retained for inspection.' }
& $taskCompiler '/nologo' '/target:winexe' '/platform:anycpu' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.Web.Extensions.dll' ('/win32icon:' + (Join-Path $taskRoot 'launcher/canvas-live.ico')) ('/out:' + (Join-Path $taskStage 'Canvas Live MCP.exe')) (Join-Path $taskRoot 'launcher/CanvasLiveMcpLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Portable MCP launcher compilation failed. The staged files have been retained for inspection.' }
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/Canvas Live.exe.config') -Destination $taskStage
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/Canvas Live.exe.config') -Destination (Join-Path $taskStage 'Canvas Live MCP.exe.config')
foreach ($taskMovePath in @($taskOutput, $taskStage)) {
    $taskResolved = [System.IO.Path]::GetFullPath($taskMovePath)
    if (!$taskResolved.StartsWith($taskReleaseRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Packaging target escaped the release folder.' }
}
if (Test-Path -LiteralPath $taskOutput) {
    Assert-NoPrivatePackageState
    $taskPrevious = Join-Path $taskReleaseRoot ('Canvas Live.previous-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
    foreach ($taskMovePath in @($taskOutput, $taskPrevious, $taskStage)) {
        $taskResolved = [System.IO.Path]::GetFullPath($taskMovePath)
        if (!$taskResolved.StartsWith($taskReleaseRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Packaging target escaped the release folder.' }
    }
    Rename-Item -LiteralPath $taskOutput -NewName ([System.IO.Path]::GetFileName($taskPrevious))
}
Rename-Item -LiteralPath $taskStage -NewName ([System.IO.Path]::GetFileName($taskOutput))
if (!(Test-Path -LiteralPath (Join-Path $taskOutput 'Canvas Live.exe') -PathType Leaf)) { throw 'Packaged executable is not in the expected folder. Close applications watching release output and retry.' }
Write-Output ('Launcher ready: ' + (Join-Path $taskOutput 'Canvas Live.exe'))
