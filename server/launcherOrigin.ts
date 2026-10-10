import { createHash } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { request } from 'node:http'
import { join, resolve } from 'node:path'

const MAX_ENDPOINT_BYTES = 256
const MAX_HEALTH_BYTES = 128
const HEALTH_TIMEOUT_MS = 750
type LauncherOriginOptions = {
  folder?: string
  localAppData?: string
  timeoutMs?: number
}

async function ordinaryFile(path: string) {
  const info = await lstat(path)
  return info.isFile() && !info.isSymbolicLink()
}

async function registeredEndpoint(path: string) {
  if (!(await ordinaryFile(path))) return false
  const file = await open(path, 'r')
  try {
    if ((await file.stat()).size > MAX_ENDPOINT_BYTES) return false
    const buffer = Buffer.alloc(MAX_ENDPOINT_BYTES + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > MAX_ENDPOINT_BYTES) return false
    const endpoint = buffer.subarray(0, bytesRead).toString('utf8').trim()
    const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/$/u.exec(endpoint)
    if (!match || Number(match[1]) > 65535) return false
    return new URL(endpoint)
  } finally {
    await file.close()
  }
}

function launcherMatches(url: URL, key: string, timeoutMs: number) {
  return new Promise<boolean>((resolveResult) => {
    let settled = false
    const probe = request(
      new URL('/__canvas_live_launcher', url),
      { method: 'GET', agent: false, headers: { Accept: 'text/plain' } },
      (response) => {
        if (
          response.statusCode !== 200 ||
          Number(response.headers['content-length']) > MAX_HEALTH_BYTES
        ) {
          finish(false)
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_HEALTH_BYTES) finish(false)
          else chunks.push(chunk)
        })
        response.on('end', () => {
          finish(Buffer.concat(chunks).toString('utf8') === `CanvasLive:${key}`)
        })
        response.on('error', () => finish(false))
        response.on('aborted', () => finish(false))
      },
    )
    const timeout = setTimeout(() => finish(false), timeoutMs)
    function finish(value: boolean) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      probe.destroy()
      resolveResult(value)
    }
    probe.on('error', () => finish(false))
    probe.end()
  })
}

/** Authorize only a live native launcher belonging to this companion's packaged folder. */
export async function discoverLauncherOrigin(
  options: LauncherOriginOptions = {},
): Promise<string | false> {
  try {
    const localAppData = options.localAppData ?? process.env.LOCALAPPDATA
    if (!localAppData) return false
    const folder = resolve(options.folder ?? process.cwd())
    if (
      !(await ordinaryFile(join(folder, 'Canvas Live.exe'))) ||
      !(await ordinaryFile(join(folder, 'app', 'index.html')))
    )
      return false
    // Match CanvasLiveLauncher.cs: lowercase full folder, without its trailing separator.
    const key = createHash('sha256')
      .update(folder.replace(/\\+$/u, '').toLowerCase(), 'utf8')
      .digest('hex')
      .slice(0, 24)
      .toUpperCase()
    const url = await registeredEndpoint(
      join(localAppData, 'Canvas Live', 'launchers', key, 'endpoint.txt'),
    )
    if (!url) return false
    const timeoutMs = Math.min(
      HEALTH_TIMEOUT_MS,
      Math.max(1, options.timeoutMs ?? HEALTH_TIMEOUT_MS),
    )
    if (!(await launcherMatches(url, key, timeoutMs))) return false
    return url.origin
  } catch {
    // Missing, stale or malformed native registrations never authorize an origin.
    return false
  }
}
