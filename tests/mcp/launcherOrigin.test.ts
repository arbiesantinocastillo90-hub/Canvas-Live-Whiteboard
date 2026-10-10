import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server, type RequestListener } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverLauncherOrigin } from '../../server/launcherOrigin'

const roots: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
  for (const root of roots.splice(0)) {
    const target = resolve(root)
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith('canvas-live-launcher-origin-')
    )
      throw new Error(
        'Refusing to remove a directory outside this test fixture.',
      )
    await rm(target, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'canvas-live-launcher-origin-'))
  roots.push(root)
  const folder = join(root, 'Canvas Live')
  const localAppData = join(root, 'LocalAppData')
  const key = createHash('sha256')
    .update(resolve(folder).toLowerCase(), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase()
  const registration = join(localAppData, 'Canvas Live', 'launchers', key)
  await mkdir(join(folder, 'app'), { recursive: true })
  await mkdir(registration, { recursive: true })
  await writeFile(join(folder, 'Canvas Live.exe'), 'fixture only')
  await writeFile(join(folder, 'app', 'index.html'), '<!doctype html>')
  const endpointFile = join(registration, 'endpoint.txt')
  async function endpoint(value: string) {
    await writeFile(endpointFile, value)
  }
  async function serve(listener: RequestListener) {
    const server = createServer(listener)
    servers.push(server)
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    const address = server.address() as { port: number }
    const origin = `http://127.0.0.1:${address.port}`
    await endpoint(`${origin}/`)
    return { server, origin }
  }
  return { root, folder, localAppData, key, endpointFile, endpoint, serve }
}

describe('packaged native launcher origin discovery', () => {
  it('discovers only the exact healthy origin registered for this packaged folder', async () => {
    const current = await fixture()
    let healthPath = ''
    let method = ''
    const native = await current.serve((request, response) => {
      healthPath = request.url ?? ''
      method = request.method ?? ''
      response.end(`CanvasLive:${current.key}`)
    })
    expect(
      await discoverLauncherOrigin({
        folder: current.folder + sep,
        localAppData: current.localAppData,
      }),
    ).toBe(native.origin)
    expect(healthPath).toBe('/__canvas_live_launcher')
    expect(method).toBe('GET')
  })

  it('rejects another launcher identity on the registered port', async () => {
    const current = await fixture()
    await current.serve((_, response) => response.end('CanvasLive:OTHERFOLDER'))
    expect(await discoverLauncherOrigin(current)).toBe(false)
  })

  it.each(['Canvas Live.exe', 'app/index.html'])(
    'does not inspect registration without the packaged %s file',
    async (missing) => {
      const current = await fixture()
      let probes = 0
      await current.serve((_, response) => {
        probes++
        response.end(`CanvasLive:${current.key}`)
      })
      await rm(join(current.folder, missing))
      expect(await discoverLauncherOrigin(current)).toBe(false)
      expect(probes).toBe(0)
    },
  )

  it('does not use a foreign folder registration', async () => {
    const current = await fixture()
    const other = await fixture()
    await other.serve((_, response) => response.end(`CanvasLive:${other.key}`))
    expect(
      await discoverLauncherOrigin({
        folder: current.folder,
        localAppData: other.localAppData,
      }),
    ).toBe(false)
  })

  it('rejects a directory masquerading as the packaged executable', async () => {
    const current = await fixture()
    await rm(join(current.folder, 'Canvas Live.exe'))
    await mkdir(join(current.folder, 'Canvas Live.exe'))
    expect(await discoverLauncherOrigin(current)).toBe(false)
  })

  it.each([
    'https://127.0.0.1:9000/',
    'http://localhost:9000/',
    'http://example.com:9000/',
    'http://127.0.0.2:9000/',
    'http://2130706433:9000/',
    'http://127.0.0.1:0/',
    'http://127.0.0.1:65536/',
    'http://127.0.0.1:9000/mcp',
    'http://127.0.0.1:9000/?x=1',
    'http://127.0.0.1:9000/#canvas',
    'http://token@127.0.0.1:9000/',
  ])('returns false for an invalid endpoint: %s', async (endpoint) => {
    const current = await fixture()
    await current.endpoint(endpoint)
    expect(await discoverLauncherOrigin({ ...current, timeoutMs: 50 })).toBe(
      false,
    )
  })

  it('rejects a registration whose native launcher has stopped', async () => {
    const current = await fixture()
    const native = await current.serve((_, response) =>
      response.end(`CanvasLive:${current.key}`),
    )
    await new Promise<void>((done) => native.server.close(() => done()))
    expect(await discoverLauncherOrigin(current)).toBe(false)
  })

  it('returns false when local registration storage is unavailable', async () => {
    const current = await fixture()
    expect(await discoverLauncherOrigin({ ...current, localAppData: '' })).toBe(
      false,
    )
  })

  it('rejects an oversized registration file without contacting its endpoint', async () => {
    const current = await fixture()
    let probes = 0
    const native = await current.serve((_, response) => {
      probes++
      response.end(`CanvasLive:${current.key}`)
    })
    await current.endpoint(`${native.origin}/${' '.repeat(300)}`)
    expect(await discoverLauncherOrigin(current)).toBe(false)
    expect(probes).toBe(0)
  })

  it('never follows a launcher health redirect', async () => {
    const current = await fixture()
    let redirectedProbes = 0
    const target = await current.serve((_, response) => {
      redirectedProbes++
      response.end(`CanvasLive:${current.key}`)
    })
    await current.serve((_, response) => {
      response.writeHead(302, { Location: `${target.origin}/` })
      response.end()
    })
    expect(await discoverLauncherOrigin(current)).toBe(false)
    expect(redirectedProbes).toBe(0)
  })

  it.each(['declared', 'streamed'])(
    'bounds a %s oversized health response',
    async (style) => {
      const current = await fixture()
      await current.serve((_, response) => {
        if (style === 'declared') {
          response.setHeader('Content-Length', '512')
          response.end('x'.repeat(512))
        } else {
          response.write('x'.repeat(100))
          response.end('x'.repeat(412))
        }
      })
      expect(await discoverLauncherOrigin(current)).toBe(false)
    },
  )

  it('rejects a non-success health response even with the correct identity', async () => {
    const current = await fixture()
    await current.serve((_, response) => {
      response.statusCode = 500
      response.end(`CanvasLive:${current.key}`)
    })
    expect(await discoverLauncherOrigin(current)).toBe(false)
  })

  it('applies a total deadline when the launcher never finishes its response', async () => {
    const current = await fixture()
    await current.serve((_, response) => {
      response.writeHead(200)
      response.write('CanvasLive:')
    })
    const started = Date.now()
    expect(await discoverLauncherOrigin({ ...current, timeoutMs: 40 })).toBe(
      false,
    )
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
