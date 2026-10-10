import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { ZodError } from 'zod/v4'
import { CanvasBridge, BridgeError } from './bridge'
import { createCanvasMcpServer } from './tools'

const MAX_BRIDGE_BYTES = 22 * 1024 * 1024
const MAX_MCP_BYTES = 1024 * 1024
export type CompanionOptions = {
  browserToken: string
  mcpToken: string
  origins?: string[]
  bridge?: CanvasBridge
}
export const defaultOrigins = [
  4173,
  5173,
  5181,
  ...Array.from({ length: 20 }, (_, i) => 4174 + i),
].flatMap((port) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`])

function authorize(actual: string | undefined, token: string) {
  const expected = Buffer.from(`Bearer ${token}`)
  const received = Buffer.from(actual ?? '')
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}
async function body(req: IncomingMessage, limit: number) {
  if (
    !req.headers['content-type']?.toLowerCase().startsWith('application/json')
  )
    throw new BridgeError('CONTENT_TYPE', 'Use application/json.', 415)
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > limit)
      throw new BridgeError('BODY_LIMIT', 'The request is too large.', 413)
    chunks.push(bytes)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new BridgeError('INVALID_JSON', 'The request is not valid JSON.', 400)
  }
}

export function createCompanion(options: CompanionOptions) {
  if (
    options.browserToken.length < 32 ||
    options.mcpToken.length < 32 ||
    options.browserToken === options.mcpToken
  )
    throw new Error('Use distinct, strong browser and MCP credentials.')
  const bridge = options.bridge ?? new CanvasBridge()
  const origins = new Set(options.origins ?? defaultOrigins)
  const mcp = createMcpHandler(() => createCanvasMcpServer(bridge), {
    responseMode: 'json',
    maxRequestBodySize: MAX_MCP_BYTES,
  })
  const handleMcp = toNodeHandler(mcp, { maxRequestBodySize: MAX_MCP_BYTES })
  let windowStarted = Date.now()
  let bridgeRequests = 0
  let mcpRequests = 0
  const server = createServer(async (req, res) => {
    try {
      const port = (server.address() as { port: number } | null)?.port
      if (
        !port ||
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(
          req.headers.host ?? '',
        )
      )
        return json(res, 403, { error: 'Invalid host.' })
      const path = req.url ?? ''
      if (
        ![
          '/mcp',
          '/bridge/connect',
          '/bridge/poll',
          '/bridge/disconnect',
        ].includes(path)
      )
        return json(res, 404, { error: 'Unknown endpoint.' })
      const origin = req.headers.origin
      const isBridge = path.startsWith('/bridge/')
      if ((isBridge && !origin) || (origin && !origins.has(origin)))
        return json(res, 403, { error: 'Invalid origin.' })
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
      }
      if (req.method === 'OPTIONS') {
        if (!origin || req.headers['access-control-request-method'] !== 'POST')
          return json(res, 405, { error: 'Unsupported preflight.' })
        const headers = (req.headers['access-control-request-headers'] ?? '')
          .toLowerCase()
          .split(',')
          .map((header) => header.trim())
        if (
          headers.some(
            (header) => !['authorization', 'content-type'].includes(header),
          )
        )
          return json(res, 403, { error: 'Unsupported headers.' })
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '300',
        })
        res.end()
        return
      }
      if (isBridge && req.method !== 'POST')
        return json(res, 405, { error: 'Use POST.' })
      if (!isBridge && !['POST', 'GET', 'DELETE'].includes(req.method ?? ''))
        return json(res, 405, { error: 'Unsupported MCP method.' })
      if (
        !authorize(
          req.headers.authorization,
          isBridge ? options.browserToken : options.mcpToken,
        )
      )
        return json(res, 401, {
          error: 'Pairing credential is invalid or this service restarted.',
        })
      if (Date.now() - windowStarted >= 60_000) {
        windowStarted = Date.now()
        bridgeRequests = 0
        mcpRequests = 0
      }
      if (isBridge ? ++bridgeRequests > 360 : ++mcpRequests > 120)
        return json(res, 429, {
          error: 'Request limit reached. Try again in a minute.',
        })
      const contentLength = Number(req.headers['content-length'])
      if (
        Number.isFinite(contentLength) &&
        contentLength > (isBridge ? MAX_BRIDGE_BYTES : MAX_MCP_BYTES)
      )
        return json(res, 413, { error: 'The request is too large.' })
      if (isBridge) {
        const input = await body(req, MAX_BRIDGE_BYTES)
        const value =
          path === '/bridge/connect'
            ? bridge.connect(input)
            : path === '/bridge/poll'
              ? bridge.poll(input)
              : bridge.disconnect(input)
        return json(res, 200, value)
      }
      await handleMcp(req, res)
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      json(
        res,
        error instanceof BridgeError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500,
        {
          error:
            error instanceof ZodError
              ? 'Invalid bridge request.'
              : error instanceof BridgeError
                ? error.message
                : 'The local connection failed.',
          code: error instanceof BridgeError ? error.code : undefined,
        },
      )
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5000
  return {
    server,
    bridge,
    async close() {
      bridge.close()
      await mcp.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}
