import { randomUUID } from 'node:crypto'
import { z } from 'zod/v4'
import { validateCanvasDocument, type CanvasDocument } from '../src/app/lcanvas'
import { resolveCanvasAiObjectTargets } from '../src/app/canvasAiPresenceState'
import { applyCanvasCommand } from '../src/mcp/canvasCommands'
import { serializedCanvasContent } from '../src/mcp/canvasRevision'
import type {
  BridgeActivity,
  BridgeCommand,
  BridgeRequest,
  BridgeResponse,
} from '../src/mcp/bridgeProtocol'

const id = z.string().min(1).max(200)
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const documentSchema = z.unknown().transform((value, ctx) => {
  try {
    return validateCanvasDocument(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid LCANVAS document.' })
    return z.NEVER
  }
})
const connectSchema = z.strictObject({
  clientId: id,
  projectId: id,
  fileId: id,
  projectName: z.string().min(1).max(120),
  document: documentSchema,
})
const pollSchema = z.strictObject({
  clientId: id,
  sessionId: id,
  revision,
  contentRevision: revision.optional(),
  document: documentSchema,
  ack: z
    .strictObject({
      requestId: id,
      ok: z.boolean(),
      revision,
      document: documentSchema.optional(),
      affectedIds: z.array(id).max(5000).optional(),
      summary: z.string().max(500).optional(),
      error: z.string().max(1000).optional(),
    })
    .optional(),
})
const disconnectSchema = z.strictObject({ clientId: id, sessionId: id })

export class BridgeError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}
export type ToolOutcome =
  | {
      ok: true
      sessionId: string
      revision: number
      affectedIds: string[]
      summary: string
    }
  | { ok: false; error: { code: string; message: string } }
type Owner = {
  clientId: string
  sessionId: string
  projectId: string
  fileId: string
  projectName: string
  document: CanvasDocument
  revision: number
  contentRevision: number
  lastSeen: number
}
type Job = {
  request: BridgeRequest
  fingerprint: string
  done: boolean
  outcome?: ToolOutcome
  resolve: (value: ToolOutcome) => void
  promise: Promise<ToolOutcome>
  timer: ReturnType<typeof setTimeout>
  activityId: string
}

function declaredCreateIds(command: BridgeCommand): string[] {
  if (command.kind === 'create')
    return command.element.id ? [command.element.id] : []
  if (command.kind === 'batch')
    return command.operations.flatMap(declaredCreateIds)
  return []
}

/** One explicitly shared canvas, one pending transaction, no filesystem access. */
class CanvasSessionBridge {
  private owner: Owner | null = null
  private jobs = new Map<string, Job>()
  private pending: Job | null = null
  private mcpLastSeen: number | null = null
  private mcpClient: string | null = null
  private lastOperation: { summary: string; at: number } | null = null
  private activity: BridgeActivity | null = null
  private readonly leaseMs: number
  private readonly operationMs: number
  constructor(leaseMs = 5000, operationMs = 8000) {
    this.leaseMs = leaseMs
    this.operationMs = operationMs
  }

  private fail(code: string, message: string): ToolOutcome {
    return { ok: false, error: { code, message } }
  }
  private finish(job: Job, outcome: ToolOutcome) {
    clearTimeout(job.timer)
    job.done = true
    job.outcome = outcome
    if (this.pending === job) this.pending = null
    if (!outcome.ok && this.activity?.id === job.activityId)
      this.activity = null
    job.resolve(outcome)
  }
  private revoke() {
    for (const job of this.jobs.values())
      if (!job.done)
        this.finish(
          job,
          this.fail(
            'DISCONNECTED',
            'The shared canvas disconnected. Read the current canvas state before continuing.',
          ),
        )
    this.jobs.clear()
    this.pending = null
    this.owner = null
    this.lastOperation = null
    this.activity = null
    this.mcpLastSeen = null
  }
  close() {
    this.revoke()
  }
  /** MCP implementation identity is client-reported, not model detection. */
  identifyClient(name: string | undefined) {
    const clean = name
      ?.split('')
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join('')
      .trim()
      .slice(0, 120)
    this.mcpClient = clean || null
  }
  private live() {
    if (this.owner && Date.now() - this.owner.lastSeen > this.leaseMs)
      this.revoke()
    if (!this.owner)
      throw new BridgeError(
        'NOT_SHARED',
        'Open a canvas and choose Share this canvas in Workspace AI.',
      )
    return this.owner
  }
  current() {
    if (this.owner && Date.now() - this.owner.lastSeen > this.leaseMs)
      this.revoke()
    return this.owner
  }
  private status(): BridgeResponse {
    return {
      mcpClient:
        this.mcpLastSeen === null ? null : (this.mcpClient ?? 'MCP client'),
      mcpLastSeen: this.mcpLastSeen,
      lastOperation: this.lastOperation,
      activity: this.activity,
    }
  }
  connect(input: unknown): BridgeResponse {
    const data = connectSchema.parse(input)
    if (this.owner && Date.now() - this.owner.lastSeen > this.leaseMs)
      this.revoke()
    if (this.owner && this.owner.clientId !== data.clientId)
      throw new BridgeError(
        'ALREADY_SHARED',
        'Another tab is sharing a canvas. Stop sharing there first.',
      )
    if (
      this.owner?.fileId === data.fileId &&
      this.owner.projectId === data.projectId
    ) {
      this.owner.lastSeen = Date.now()
      return {
        ...this.status(),
        sessionId: this.owner.sessionId,
        revision: this.owner.revision,
        contentRevision: this.owner.contentRevision,
      }
    }
    this.revoke()
    this.owner = {
      ...data,
      sessionId: randomUUID(),
      revision: 0,
      contentRevision: 0,
      lastSeen: Date.now(),
    }
    return {
      ...this.status(),
      sessionId: this.owner.sessionId,
      revision: 0,
      contentRevision: 0,
    }
  }
  disconnect(input: unknown) {
    const data = disconnectSchema.parse(input)
    if (
      this.owner?.clientId === data.clientId &&
      this.owner.sessionId === data.sessionId
    )
      this.revoke()
    return { ok: true }
  }
  poll(input: unknown): BridgeResponse {
    const data = pollSchema.parse(input)
    const owner = this.live()
    if (owner.clientId !== data.clientId || owner.sessionId !== data.sessionId)
      throw new BridgeError('WRONG_SESSION', 'This sharing session has ended.')
    if (data.revision < owner.revision)
      throw new BridgeError(
        'STALE_REVISION',
        'The browser revision is out of date.',
      )
    if (
      data.revision === owner.revision &&
      JSON.stringify(data.document) !== JSON.stringify(owner.document)
    )
      throw new BridgeError(
        'REVISION_REQUIRED',
        'Changed canvas content needs a new revision.',
      )
    const contentChanged =
      serializedCanvasContent(data.document) !==
      serializedCanvasContent(owner.document)
    const contentRevision =
      data.contentRevision ??
      (contentChanged ? data.revision : owner.contentRevision)
    if (
      contentRevision > data.revision ||
      contentRevision < owner.contentRevision ||
      (contentRevision !== owner.contentRevision &&
        contentRevision <= owner.revision) ||
      (contentChanged && contentRevision === owner.contentRevision) ||
      (data.revision === owner.revision &&
        contentRevision !== owner.contentRevision)
    )
      throw new BridgeError(
        'INVALID_CONTENT_REVISION',
        'The browser content revision does not match its canvas revision.',
      )
    // Reject malformed revisions and acknowledgments before accepting browser state.
    if (data.ack) {
      const candidate = this.jobs.get(data.ack.requestId)
      if (!candidate || candidate.request.sessionId !== owner.sessionId)
        throw new BridgeError(
          'UNKNOWN_OPERATION',
          'This operation is no longer part of the shared canvas.',
        )
      if (
        data.ack.revision > data.revision ||
        data.ack.revision < candidate.request.expectedRevision ||
        (data.ack.revision === data.revision &&
          data.ack.document &&
          JSON.stringify(data.ack.document) !== JSON.stringify(data.document))
      )
        throw new BridgeError(
          'INVALID_ACK',
          'The browser acknowledgment does not match its canvas revision.',
        )
    }
    const previousDocument = owner.document
    owner.contentRevision = contentRevision
    owner.document = data.document
    owner.revision = data.revision
    owner.lastSeen = Date.now()
    let ackId: string | undefined
    if (data.ack) {
      const ack = data.ack
      const job = this.jobs.get(ack.requestId)!
      if (!job.outcome?.ok) {
        const outcome: ToolOutcome = ack.ok
          ? {
              ok: true,
              sessionId: owner.sessionId,
              revision: owner.revision,
              affectedIds: ack.affectedIds ?? [],
              summary: ack.summary ?? 'Canvas updated.',
            }
          : this.fail(
              'EDITOR_REJECTED',
              ack.error ?? 'The editor rejected this change.',
            )
        this.finish(job, outcome)
        if (ack.ok) {
          this.lastOperation = {
            summary: outcome.ok ? outcome.summary : '',
            at: Date.now(),
          }
          this.activity = {
            kind: 'edit',
            at: Date.now(),
            id: job.activityId,
            targetIds: resolveCanvasAiObjectTargets(
              previousDocument,
              ack.document ?? owner.document,
              ack.affectedIds ?? [],
              job.request.command,
            ),
            phase: 'complete',
          }
        }
      }
      ackId = ack.requestId
    }
    if (
      this.pending &&
      ((this.pending.request.expectedContentRevision === undefined
        ? this.pending.request.expectedRevision !== owner.revision
        : this.pending.request.expectedContentRevision !==
          owner.contentRevision) ||
        this.pending.request.expiresAt <= Date.now())
    ) {
      this.finish(
        this.pending,
        this.fail(
          'STALE_REVISION',
          'The canvas changed before this operation. Read its current state and retry with a new operation ID.',
        ),
      )
    }
    return {
      ...this.status(),
      contentRevision: owner.contentRevision,
      ...(ackId ? { ackId } : {}),
      ...(this.pending ? { command: this.pending.request } : {}),
    }
  }
  read(sessionId?: string, observe = true) {
    const owner = this.live()
    if (sessionId && sessionId !== owner.sessionId)
      throw new BridgeError(
        'WRONG_SESSION',
        'The selected canvas has changed. Read its current state.',
      )
    this.mcpLastSeen = Date.now()
    if (observe)
      this.recordRead(owner.document.elements.map((element) => element.id))
    return { ...owner, document: structuredClone(owner.document) }
  }
  recordRead(targetIds: readonly string[]) {
    const owner = this.live()
    this.mcpLastSeen = Date.now()
    this.activity = {
      kind: 'read',
      at: this.mcpLastSeen,
      id: randomUUID(),
      targetIds: resolveCanvasAiObjectTargets(
        owner.document,
        owner.document,
        targetIds,
      ),
      phase: 'complete',
    }
  }
  mutate(
    sessionId: string,
    expectedRevision: number,
    operationId: string,
    command: BridgeCommand,
  ): Promise<ToolOutcome> {
    const owner = this.live()
    this.mcpLastSeen = Date.now()
    if (sessionId !== owner.sessionId)
      throw new BridgeError(
        'WRONG_SESSION',
        'The selected canvas has changed. Read its current state.',
      )
    const fingerprint = JSON.stringify({ expectedRevision, command })
    const previous = this.jobs.get(operationId)
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new BridgeError(
          'ID_REUSED',
          'Reuse an operation ID only for an identical retry.',
        )
      return previous.outcome
        ? Promise.resolve(previous.outcome)
        : previous.promise
    }
    const historyCommand = command.kind === 'undo' || command.kind === 'redo'
    if (
      expectedRevision > owner.revision ||
      (historyCommand
        ? expectedRevision !== owner.revision
        : expectedRevision < owner.contentRevision)
    )
      throw new BridgeError(
        'STALE_REVISION',
        'The canvas changed. Read its current revision before editing.',
      )
    if (this.pending)
      throw new BridgeError(
        'BUSY',
        'Another canvas operation is waiting for the browser.',
      )
    const preflight = historyCommand
      ? null
      : applyCanvasCommand(owner.document, command)
    if (this.jobs.size >= 128)
      throw new BridgeError(
        'SESSION_LIMIT',
        'This sharing session reached 128 operations. Stop sharing and share again to start a new session.',
      )
    let resolve!: (outcome: ToolOutcome) => void
    const promise = new Promise<ToolOutcome>((done) => {
      resolve = done
    })
    const request = {
      requestId: operationId,
      sessionId,
      expectedRevision,
      ...(!historyCommand
        ? { expectedContentRevision: owner.contentRevision }
        : {}),
      command,
      expiresAt: Date.now() + this.operationMs,
    }
    const job: Job = {
      request,
      fingerprint,
      done: false,
      resolve,
      promise,
      timer: setTimeout(() => {
        this.finish(
          job,
          this.fail(
            'NO_ACK',
            'The browser did not acknowledge this operation. Read the canvas state to check its outcome; retry only with the same operation ID.',
          ),
        )
      }, this.operationMs),
      activityId: `edit:${sessionId}:${operationId}`,
    }
    this.jobs.set(operationId, job)
    this.pending = job
    const stableTargetIds = new Set([
      ...owner.document.elements.map((element) => element.id),
      ...declaredCreateIds(command),
    ])
    this.activity = {
      kind: 'edit',
      at: Date.now(),
      id: job.activityId,
      // Server-generated create IDs are provisional until the browser applies it.
      targetIds: preflight
        ? resolveCanvasAiObjectTargets(
            owner.document,
            preflight.document,
            preflight.affectedIds,
            command,
          ).filter((id) => stableTargetIds.has(id))
        : [],
      phase: 'working',
    }
    return promise
  }
}

/** Independent browser grants; knowing one session never authorizes another. */
export class CanvasBridge {
  private sessions = new Map<string, CanvasSessionBridge>()
  private clientName: string | undefined
  private readonly leaseMs: number
  private readonly operationMs: number
  constructor(leaseMs = 5000, operationMs = 8000) {
    this.leaseMs = leaseMs
    this.operationMs = operationMs
  }

  private liveSessions() {
    for (const [id, bridge] of this.sessions)
      if (!bridge.current()) this.sessions.delete(id)
    return [...this.sessions.values()]
  }
  private selected(sessionId?: string) {
    const sessions = this.liveSessions()
    if (!sessions.length)
      throw new BridgeError(
        'NOT_SHARED',
        'Open a canvas and choose Share this canvas in Workspace AI.',
      )
    if (sessionId) {
      const selected = this.sessions.get(sessionId)
      if (!selected)
        throw new BridgeError(
          'WRONG_SESSION',
          'This sharing session has ended. List the shared canvases and read the intended canvas again.',
        )
      return selected
    }
    if (sessions.length !== 1)
      throw new BridgeError(
        'SELECT_CANVAS',
        'Several canvases are shared. Call list_shared_canvases, then get_canvas_state with the intended sessionId.',
      )
    return sessions[0]
  }
  close() {
    for (const session of this.sessions.values()) session.close()
    this.sessions.clear()
  }
  identifyClient(name: string | undefined) {
    this.clientName = name
    for (const session of this.liveSessions()) session.identifyClient(name)
  }
  connect(input: unknown): BridgeResponse {
    const data = connectSchema.parse(input)
    const sessions = this.liveSessions()
    const existing = sessions.find((bridge) => {
      const owner = bridge.current()
      return owner?.projectId === data.projectId && owner.fileId === data.fileId
    })
    if (existing) return existing.connect(data)
    if (sessions.length >= 16)
      throw new BridgeError(
        'SHARING_LIMIT',
        'Up to 16 canvases can be shared. Stop sharing one before adding another.',
      )
    const bridge = new CanvasSessionBridge(this.leaseMs, this.operationMs)
    bridge.identifyClient(this.clientName)
    const reply = bridge.connect(data)
    this.sessions.set(reply.sessionId!, bridge)
    return reply
  }
  disconnect(input: unknown) {
    const data = disconnectSchema.parse(input)
    const bridge = this.sessions.get(data.sessionId)
    if (bridge?.current()?.clientId === data.clientId) {
      bridge.disconnect(data)
      this.sessions.delete(data.sessionId)
    }
    return { ok: true }
  }
  poll(input: unknown): BridgeResponse {
    const data = pollSchema.parse(input)
    return this.selected(data.sessionId).poll(data)
  }
  read(sessionId?: string, observe = true) {
    return this.selected(sessionId).read(sessionId, observe)
  }
  recordRead(sessionId: string, targetIds: readonly string[]) {
    this.selected(sessionId).recordRead(targetIds)
  }
  list() {
    return this.liveSessions().map((bridge) => {
      const owner = bridge.current()!
      return {
        sessionId: owner.sessionId,
        revision: owner.revision,
        project: { id: owner.projectId, name: owner.projectName },
        fileId: owner.fileId,
        name: owner.document.name,
      }
    })
  }
  mutate(
    sessionId: string,
    expectedRevision: number,
    operationId: string,
    command: BridgeCommand,
  ): Promise<ToolOutcome> {
    return this.selected(sessionId).mutate(
      sessionId,
      expectedRevision,
      operationId,
      command,
    )
  }
}
