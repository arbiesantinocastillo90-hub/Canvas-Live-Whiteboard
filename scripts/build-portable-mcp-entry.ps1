[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RelativePackagePath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$canvasRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([IO.Path]::IsPathRooted($RelativePackagePath) -or $RelativePackagePath.Split([char[]]@('/', '\')) -contains '..' -or $RelativePackagePath.Contains('"') -or $RelativePackagePath.Contains("`r") -or $RelativePackagePath.Contains("`n")) { throw 'Choose a normal package folder relative to the USB root.' }
$canvasEntryRoot = Join-Path ([IO.Path]::GetTempPath()) ('clentry-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $canvasEntryRoot | Out-Null
try {
    $canvasTarget = [IO.Path]::Combine($RelativePackagePath, 'Canvas Live MCP.exe').Replace('\', '\\')
    $canvasSource = 'internal static class PortableTarget { internal const string RelativePath = "' + $canvasTarget + '"; }'
    $canvasSourcePath = Join-Path $canvasEntryRoot 'PortableTarget.cs'
    Set-Content -LiteralPath $canvasSourcePath -Value $canvasSource -Encoding UTF8
    $canvasCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $canvasCompiler /nologo /target:winexe /reference:System.Windows.Forms.dll ('/win32icon:' + (Join-Path $canvasRoot 'launcher/canvas-live.ico')) ('/out:' + [IO.Path]::GetFullPath($OutputPath)) (Join-Path $canvasRoot 'launcher/CanvasLivePortableEntry.cs') $canvasSourcePath
    if ($LASTEXITCODE -ne 0) { throw 'Portable USB entry compilation failed.' }
    Write-Output ('Portable MCP entry built: ' + [IO.Path]::GetFullPath($OutputPath))
} finally {
    $canvasResolved = [IO.Path]::GetFullPath($canvasEntryRoot)
    if (!$canvasResolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($canvasResolved) -notlike 'clentry-*') { throw 'Refusing to clean an unexpected entry build folder.' }
    Remove-Item -LiteralPath $canvasResolved -Recurse -Force
}
