import { useLayoutEffect, useRef, useState } from 'react'
import { commandSchema } from '../mcp/canvasCommands'
import type { BridgeCommand } from '../mcp/bridgeProtocol'
import type { CanvasEditorController } from './CanvasEditor'
import { validateCanvasDocument, type CanvasDocument } from './lcanvas'

export const DEFAULT_MCP_BRIDGE_URL = 'http://127.0.0.1:8787'
const POLL_INTERVAL = 500
const REQUEST_TIMEOUT = 4000

type Options = {
  projectId: string
  fileId: string | null
  projectName: string
  getController: () => CanvasEditorController | null
  baseUrl?: string
}
type Ack = {
  requestId: string
  ok: boolean
  revision: number
  document?: CanvasDocument
  affectedIds?: string[]
  summary?: string
  error?: string
}
type Session = {
  active: boolean
  scope: string
  baseUrl: string
  token: string
  clientId: string
  sessionId: string | null
  revision: number
  document: CanvasDocument
  serialized: string
  ack: Ack | null
  handled: Map<string, Ack>
  timer: ReturnType<typeof setTimeout> | null
  abort: AbortController | null
}
export type McpBridgeState = {
  status: 'idle' | 'connecting' | 'sharing' | 'error'
  mcpClient: string | null
  mcpLastSeen: number | null
  lastOperation: string | null
  error: string | null
}
const INITIAL_STATE: McpBridgeState = {
  status: 'idle',
  mcpClient: null,
  mcpLastSeen: null,
  lastOperation: null,
  error: null,
}

function scope(options: Options) {
  return JSON.stringify([options.projectId, options.fileId])
}

function failureMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : 'The MCP connection failed.'
}

function loopbackUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Use a local companion address on 127.0.0.1 or localhost.')
  return url.origin
}

function replyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The MCP companion returned an invalid reply.')
  return value as Record<string, unknown>
}

async function request(session: Session, path: string, body: unknown) {
  const abort = new AbortController()
  session.abort = abort
  const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(`${session.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(body),
      signal: abort.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    const reply = replyObject(await response.json())
    if (!response.ok) {
      const error =
        typeof reply.error === 'string'
          ? reply.error
          : reply.error &&
              typeof reply.error === 'object' &&
              'message' in reply.error
            ? String(reply.error.message)
            : `The MCP companion rejected the request (${response.status}).`
      throw new Error(error)
    }
    return reply
  } catch (error) {
    if (abort.signal.aborted)
      throw new Error('The MCP companion did not respond in time.')
    throw error
  } finally {
    clearTimeout(timeout)
    if (session.abort === abort) session.abort = null
  }
}

function notifyDisconnect(session: Session) {
  if (!session.sessionId) return
  void fetch(`${session.baseUrl}/bridge/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      clientId: session.clientId,
      sessionId: session.sessionId,
    }),
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    keepalive: true,
  }).catch(() => undefined)
}

function parseCommand(value: unknown): BridgeCommand {
  const object = replyObject(value)
  if (
    (object.kind === 'undo' || object.kind === 'redo') &&
    Object.keys(object).length === 1
  )
    return { kind: object.kind }
  return commandSchema.parse(value)
}

function isExpired(expiresAt: unknown) {
  return (
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
}

export default function useMcpBridge(options: Options) {
  const latest = useRef(options)
  const session = useRef<Session | null>(null)
  const [state, setState] = useState<McpBridgeState>(INITIAL_STATE)
  const [previousScope, setPreviousScope] = useState(scope(options))
  const nextScope = scope(options)
  if (previousScope !== nextScope) {
    setPreviousScope(nextScope)
    setState(INITIAL_STATE)
  }
  useLayoutEffect(() => {
    latest.current = options
  })

  function stop() {
    const previous = session.current
    session.current = null
    if (!previous) return
    previous.active = false
    if (previous.timer) clearTimeout(previous.timer)
    previous.abort?.abort()
    notifyDisconnect(previous)
  }

  function isCurrent(current: Session) {
    return (
      current.active &&
      session.current === current &&
      current.scope === scope(latest.current)
    )
  }

  function currentDocument(current: Session) {
    const controller = latest.current.getController()
    if (!controller || !isCurrent(current))
      throw new Error('This canvas is no longer shared.')
    const document = validateCanvasDocument(controller.getDocument())
    const serialized = JSON.stringify(document)
    if (serialized !== current.serialized) {
      current.revision++
      current.document = document
      current.serialized = serialized
    }
    return { controller, document }
  }

  async function poll(current: Session) {
    if (!isCurrent(current)) return
    try {
      currentDocument(current)
      const reply = await request(current, '/bridge/poll', {
        clientId: current.clientId,
        sessionId: current.sessionId,
        revision: current.revision,
        document: current.document,
        ...(current.ack ? { ack: current.ack } : {}),
      })
      if (!isCurrent(current)) return
      if (current.ack && reply.ackId === current.ack.requestId) {
        // Confirmed retries only need their outcome, not an old canvas snapshot.
        const confirmed = { ...current.ack }
        delete confirmed.document
        current.handled.set(confirmed.requestId, confirmed)
        current.ack = null
      }
      setState((previous) => ({
        ...previous,
        status: 'sharing',
        mcpClient: typeof reply.mcpClient === 'string' ? 'MCP client' : null,
        mcpLastSeen:
          typeof reply.mcpLastSeen === 'number' &&
          Number.isFinite(reply.mcpLastSeen)
            ? reply.mcpLastSeen
            : null,
      }))
      if (reply.command) {
        const queued = replyObject(reply.command)
        if (
          typeof queued.requestId !== 'string' ||
          queued.requestId.length < 1 ||
          queued.requestId.length > 200
        )
          throw new Error(
            'The MCP companion returned an invalid operation identifier.',
          )
        const previousAck = current.handled.get(queued.requestId)
        if (previousAck) current.ack = previousAck
        else {
          let ack: Ack
          try {
            const { controller } = currentDocument(current)
            if (
              queued.sessionId !== current.sessionId ||
              queued.expectedRevision !== current.revision
            )
              throw new Error(
                'The canvas changed while this operation was waiting. Read it again and retry.',
              )
            if (isExpired(queued.expiresAt))
              throw new Error(
                'This operation expired. Read the canvas again and retry.',
              )
            const command = parseCommand(queued.command)
            if (isExpired(queued.expiresAt))
              throw new Error(
                'This operation expired. Read the canvas again and retry.',
              )
            const result = controller.execute(command)
            currentDocument(current)
            ack = {
              requestId: queued.requestId,
              ok: true,
              revision: current.revision,
              document: current.document,
              affectedIds: result.affectedIds,
              summary: result.summary,
            }
            setState((previous) => ({
              ...previous,
              lastOperation: result.summary,
              error: null,
            }))
          } catch (error) {
            ack = {
              requestId: queued.requestId,
              ok: false,
              revision: current.revision,
              error: failureMessage(error),
            }
            setState((previous) => ({ ...previous, error: ack.error ?? null }))
          }
          current.ack = ack
          current.handled.set(ack.requestId, ack)
          if (current.handled.size > 100)
            current.handled.delete(current.handled.keys().next().value!)
        }
      }
      if (isCurrent(current))
        current.timer = setTimeout(() => {
          void poll(current)
        }, POLL_INTERVAL)
    } catch (error) {
      if (!isCurrent(current)) return
      stop()
      setState((previous) => ({
        ...previous,
        status: 'error',
        mcpClient: null,
        mcpLastSeen: null,
        error: failureMessage(error),
      }))
    }
  }

  async function share(token: string) {
    stop()
    setState({ ...INITIAL_STATE, status: 'connecting' })
    let current: Session | null = null
    try {
      const input = latest.current
      const controller = input.getController()
      if (!input.fileId || !controller)
        throw new Error('Open a canvas before sharing it.')
      const trimmedToken = token.trim()
      if (!/^[\w-]{16,256}$/u.test(trimmedToken))
        throw new Error(
          'Paste the browser pairing code shown by the MCP companion.',
        )
      const document = validateCanvasDocument(controller.getDocument())
      current = {
        active: true,
        scope: scope(input),
        baseUrl: loopbackUrl(input.baseUrl ?? DEFAULT_MCP_BRIDGE_URL),
        token: trimmedToken,
        clientId: crypto.randomUUID(),
        sessionId: null,
        revision: 0,
        document,
        serialized: JSON.stringify(document),
        ack: null,
        handled: new Map(),
        timer: null,
        abort: null,
      }
      session.current = current
      const reply = await request(current, '/bridge/connect', {
        clientId: current.clientId,
        projectId: input.projectId,
        fileId: input.fileId,
        projectName: input.projectName,
        document,
      })
      if (
        typeof reply.sessionId !== 'string' ||
        !reply.sessionId ||
        reply.revision !== 0
      )
        throw new Error('The MCP companion returned an invalid canvas session.')
      current.sessionId = reply.sessionId
      if (!isCurrent(current)) {
        notifyDisconnect(current)
        return
      }
      setState({ ...INITIAL_STATE, status: 'sharing' })
      void poll(current)
    } catch (error) {
      if (current && !isCurrent(current)) return
      stop()
      setState({
        ...INITIAL_STATE,
        status: 'error',
        error: failureMessage(error),
      })
    }
  }

  function disconnect() {
    stop()
    setState(INITIAL_STATE)
  }

  useLayoutEffect(() => {
    function leavePage() {
      stop()
      setState(INITIAL_STATE)
    }
    window.addEventListener('pagehide', leavePage)
    // A changed file always needs a new explicit Share action.
    return () => {
      window.removeEventListener('pagehide', leavePage)
      stop()
    }
  }, [options.projectId, options.fileId])

  return { ...state, share, disconnect }
}
