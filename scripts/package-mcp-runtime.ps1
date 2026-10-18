[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Destination)

$ErrorActionPreference = 'Stop'
# Pin the official Windows x64 build; its SHA256 is published by nodejs.org.
$canvasNodeVersion = '24.15.0'
$canvasNodeZipHash = 'cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62'
$canvasNodeExeHash = '3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5'
$canvasRuntimeCache = Join-Path ([System.IO.Path]::GetTempPath()) ('canvas-live-node-' + $canvasNodeVersion)
$canvasZip = Join-Path $canvasRuntimeCache ('node-v' + $canvasNodeVersion + '-win-x64.zip')
$canvasExtract = Join-Path $canvasRuntimeCache ('node-v' + $canvasNodeVersion + '-win-x64')
New-Item -ItemType Directory -Path $canvasRuntimeCache -Force | Out-Null
if (!(Test-Path -LiteralPath $canvasZip) -or (Get-FileHash -LiteralPath $canvasZip -Algorithm SHA256).Hash -ine $canvasNodeZipHash) {
    Invoke-WebRequest -Uri ('https://nodejs.org/dist/v' + $canvasNodeVersion + '/node-v' + $canvasNodeVersion + '-win-x64.zip') -OutFile $canvasZip
}
if ((Get-FileHash -LiteralPath $canvasZip -Algorithm SHA256).Hash -ine $canvasNodeZipHash) { throw 'The official Node archive failed SHA256 verification.' }
Expand-Archive -LiteralPath $canvasZip -DestinationPath $canvasRuntimeCache -Force
$canvasNodeExe = Join-Path $canvasExtract 'node.exe'
if ((Get-FileHash -LiteralPath $canvasNodeExe -Algorithm SHA256).Hash -ine $canvasNodeExeHash) { throw 'The official Node executable failed SHA256 verification.' }
$canvasSignature = Get-AuthenticodeSignature -LiteralPath $canvasNodeExe
if ($canvasSignature.Status -ne 'Valid' -or $canvasSignature.SignerCertificate.Subject -notmatch 'OpenJS Foundation|Node.js Foundation') { throw 'The official Node executable does not have a valid OpenJS signature.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Copy-Item -LiteralPath $canvasNodeExe -Destination (Join-Path $Destination 'node.exe')
Copy-Item -LiteralPath (Join-Path $canvasExtract 'LICENSE') -Destination (Join-Path $Destination 'NODE_LICENSE.txt')
Set-Content -LiteralPath (Join-Path $Destination 'node.sha256') -Value $canvasNodeExeHash -Encoding ASCII
@{ version = $canvasNodeVersion; platform = 'win-x64'; source = ('https://nodejs.org/dist/v' + $canvasNodeVersion + '/'); archiveSha256 = $canvasNodeZipHash; executableSha256 = $canvasNodeExeHash; signature = [string]$canvasSignature.Status; signer = $canvasSignature.SignerCertificate.Subject } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'node-provenance.json') -Encoding UTF8
Write-Output ('Bundled verified Node.js ' + $canvasNodeVersion + ' (Windows x64), including its complete license notices.')
