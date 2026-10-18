import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCompanion, defaultOrigins } from './http'
import { discoverLauncherOrigin } from './launcherOrigin'

const port = Number(process.env.CANVAS_MCP_PORT ?? '8787')
if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535)
  throw new Error('Choose an MCP port between 1024 and 65535.')
const browserToken = randomBytes(32).toString('base64url')
const mcpToken = randomBytes(32).toString('base64url')
const configDirectory = resolve('.canvas-live')
const configPath = resolve(configDirectory, 'mcp-session.json')
const launcherOrigin = await discoverLauncherOrigin()
const companion = createCompanion({
  browserToken,
  mcpToken,
  origins: launcherOrigin
    ? [...defaultOrigins, launcherOrigin]
    : defaultOrigins,
})
await new Promise<void>((ready, reject) => {
  companion.server.once('error', reject)
  companion.server.listen(port, '127.0.0.1', ready)
})
const assignedPort = (companion.server.address() as { port: number }).port
await mkdir(configDirectory, { recursive: true })
await writeFile(
  configPath,
  JSON.stringify(
    {
      url: `http://127.0.0.1:${assignedPort}/mcp`,
      browserPairingCode: browserToken,
      mcpToken,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
)
// Deliberate credential handoff to the local user; never print the MCP token or canvas contents.
console.log(
  `Canvas Live MCP is running at http://127.0.0.1:${assignedPort}/mcp`,
)
if (process.env.CANVAS_MCP_QUIET !== '1')
  console.log(`Browser pairing code: ${browserToken}`)
console.log(`Local connection credentials: ${configPath}`)
console.log(
  'Open a canvas, open Workspace AI, and choose Share this canvas. Stop with Ctrl+C.',
)
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await companion.close()
  await unlink(configPath).catch(() => {})
}
process.on('SIGINT', () => {
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
