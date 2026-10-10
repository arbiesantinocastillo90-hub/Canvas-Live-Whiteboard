$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskReleaseRoot = Join-Path $taskRoot 'release'
$taskOutput = Join-Path $taskReleaseRoot 'Canvas Live'
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $taskCompiler)) { throw 'The Windows .NET Framework compiler is required to build the launcher.' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) { throw 'Build the website before packaging the launcher.' }
New-Item -ItemType Directory -Path $taskReleaseRoot -Force | Out-Null
$taskStage = Join-Path $taskReleaseRoot ('.stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist') -Destination (Join-Path $taskStage 'app') -Recurse
Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination (Join-Path $taskStage 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/THIRD_PARTY_NOTICES.md') -Destination (Join-Path $taskStage 'THIRD_PARTY_NOTICES.txt')
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/README.txt') -Destination (Join-Path $taskStage 'README.txt')
& $taskCompiler '/nologo' '/target:winexe' '/platform:anycpu' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' ('/out:' + (Join-Path $taskStage 'Canvas Live.exe')) (Join-Path $taskRoot 'launcher/CanvasLiveLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed. The staged files have been retained for inspection.' }
Copy-Item -LiteralPath (Join-Path $taskRoot 'launcher/Canvas Live.exe.config') -Destination $taskStage
foreach ($taskMovePath in @($taskOutput, $taskStage)) {
    $taskResolved = [System.IO.Path]::GetFullPath($taskMovePath)
    if (!$taskResolved.StartsWith($taskReleaseRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Packaging target escaped the release folder.' }
}
if (Test-Path -LiteralPath $taskOutput) {
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
