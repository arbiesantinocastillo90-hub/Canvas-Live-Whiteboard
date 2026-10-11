[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$')]
    [string]$TunnelId,

    [Parameter(Mandatory = $true)]
    [string]$TunnelClientPath,

    [string]$CredentialPath = ''
)

$ErrorActionPreference = 'Stop'
$canvasHostRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'mcp/server.mjs') -PathType Leaf) {
    $canvasHostRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
}
if ([string]::IsNullOrWhiteSpace($CredentialPath)) {
    $CredentialPath = Join-Path $canvasHostRoot '.canvas-live/mcp-session.json'
}
if ([string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_API_KEY)) {
    throw 'Set CONTROL_PLANE_API_KEY in this terminal to an OpenAI tunnel runtime key before starting the tunnel.'
}
if (!(Test-Path -LiteralPath $TunnelClientPath -PathType Leaf)) {
    throw 'TunnelClientPath must identify the downloaded full tunnel-client executable.'
}
$canvasTunnelClient = (Resolve-Path -LiteralPath $TunnelClientPath).ProviderPath
if ([System.IO.Path]::GetExtension($canvasTunnelClient) -ine '.exe') {
    throw 'TunnelClientPath must identify a Windows .exe file.'
}
if (!(Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw 'Start Canvas Live MCP first. Its local .canvas-live/mcp-session.json file is required.'
}
$canvasCredentialFile = Get-Item -LiteralPath $CredentialPath
if ($canvasCredentialFile.Length -gt 16384) {
    throw 'The Canvas Live MCP credential file is invalid.'
}
try {
    $canvasSession = Get-Content -LiteralPath $canvasCredentialFile.FullName -Raw | ConvertFrom-Json
} catch {
    throw 'The Canvas Live MCP credential file is not valid JSON. Restart the local companion to regenerate it.'
}
if ($canvasSession.url -isnot [string] -or $canvasSession.url -cnotmatch '^http://127\.0\.0\.1:([0-9]{1,5})/mcp$') {
    throw 'The MCP URL must use http://127.0.0.1:<port>/mcp without credentials, a query or a fragment.'
}
$canvasMcpPort = [int]$Matches[1]
if ($canvasMcpPort -lt 1 -or $canvasMcpPort -gt 65535) {
    throw 'The local MCP URL has an invalid port.'
}
if ($canvasSession.mcpToken -isnot [string] -or $canvasSession.mcpToken -cnotmatch '^[A-Za-z0-9_-]{32,256}$') {
    throw 'The local MCP credential is invalid. Restart the companion to regenerate its credentials.'
}

# The profile is generated only inside Canvas Live's ignored runtime folder.
# Explicit --profile-dir keeps the user's global tunnel-client profiles intact.
$canvasRuntimeRoot = $canvasCredentialFile.DirectoryName
$canvasProfileDirectory = Join-Path $canvasRuntimeRoot 'tunnel-profiles'
foreach ($canvasGeneratedDirectory in @($canvasRuntimeRoot, $canvasProfileDirectory)) {
    if (Test-Path -LiteralPath $canvasGeneratedDirectory) {
        $canvasGeneratedItem = Get-Item -LiteralPath $canvasGeneratedDirectory
        if (!$canvasGeneratedItem.PSIsContainer -or ($canvasGeneratedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'The generated tunnel profile directory must be an ordinary Canvas Live runtime folder.'
        }
    }
}
New-Item -ItemType Directory -Path $canvasProfileDirectory -Force | Out-Null
$canvasProfilePath = Join-Path $canvasProfileDirectory 'canvas-live.yaml'
if ((Test-Path -LiteralPath $canvasProfilePath) -and ((Get-Item -LiteralPath $canvasProfilePath).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'The generated Canvas Live tunnel profile must not be a link.'
}

$canvasPreviousAuthorization = [Environment]::GetEnvironmentVariable('CANVAS_MCP_AUTHORIZATION', 'Process')
try {
    [Environment]::SetEnvironmentVariable('CANVAS_MCP_AUTHORIZATION', 'Bearer ' + $canvasSession.mcpToken, 'Process')
    & $canvasTunnelClient init --sample sample_mcp_remote_no_auth --profile canvas-live --profile-dir $canvasProfileDirectory --force --tunnel-id $TunnelId --mcp-server-url $canvasSession.url
    if ($LASTEXITCODE -ne 0) {
        throw 'The tunnel-client profile setup failed. The tunnel was not started.'
    }
    & $canvasTunnelClient doctor --profile canvas-live --profile-dir $canvasProfileDirectory --explain
    if ($LASTEXITCODE -ne 0) {
        throw 'The tunnel-client configuration check failed. Correct the reported issue before starting it.'
    }
    Write-Output 'Starting the private Canvas Live tunnel. Keep this terminal and the MCP companion running; press Ctrl+C to stop.'
    & $canvasTunnelClient run --profile canvas-live --profile-dir $canvasProfileDirectory --mcp.extra-headers 'Authorization: env:CANVAS_MCP_AUTHORIZATION'
    if ($LASTEXITCODE -ne 0) {
        throw 'The tunnel-client stopped with an error. Check its status before connecting ChatGPT.'
    }
} finally {
    [Environment]::SetEnvironmentVariable('CANVAS_MCP_AUTHORIZATION', $canvasPreviousAuthorization, 'Process')
}
