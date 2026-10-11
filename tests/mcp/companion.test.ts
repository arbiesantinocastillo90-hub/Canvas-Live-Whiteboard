import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCompanion } from '../../server/http'
import { CanvasBridge } from '../../server/bridge'
import { applyCanvasCommand } from '../../src/mcp/canvasCommands'
import type {
  BridgeCommand,
  BridgeRequest,
  BridgeResponse,
} from '../../src/mcp/bridgeProtocol'
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistory,
} from '../../src/app/editorHistory'
import {
  createCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
} from '../../src/app/lcanvas'

const browserToken = 'browser-pairing-token-'.padEnd(48, 'B')
const mcpToken = 'mcp-protocol-token-'.padEnd(48, 'M')
const origin = 'http://127.0.0.1:4173'
type ToolValue = {
  ok: boolean
  sessionId?: string
  revision?: number
  elements?: CanvasElement[]
  element?: CanvasElement
  affectedIds?: string[]
  error?: { code: string; message: string }
  total?: number
}
function value(result: CallToolResult): ToolValue {
  expect(result.structuredContent).toBeDefined()
  return result.structuredContent as ToolValue
}
const rectangle = {
  type: 'rectangle' as const,
  id: 'one',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  text: 'First',
}

async function fixture(bridge = new CanvasBridge()) {
  const companion = createCompanion({
    browserToken,
    mcpToken,
    origins: [origin],
    bridge,
  })
  await new Promise<void>((resolve, reject) => {
    companion.server.once('error', reject)
    companion.server.listen(0, '127.0.0.1', resolve)
  })
  const address = companion.server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address.')
  const url = `http://127.0.0.1:${address.port}`
  const client = new Client({ name: 'canvas-protocol-test', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
    }),
  )
  let history: EditorHistory = createEditorHistory(
    createCanvasDocument('Protocol canvas'),
  )
  let revision = 0
  let sessionId = ''
  const clientId = 'browser-one'
  async function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${browserToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  }
  async function share(document = history.present) {
    history = createEditorHistory(document)
    revision = 0
    const response = await post('/bridge/connect', {
      clientId,
      projectId: 'project-one',
      fileId: 'file-one',
      projectName: 'Protocol project',
      document,
    })
    expect(response.status).toBe(200)
    const connected = (await response.json()) as BridgeResponse
    expect(connected.sessionId).toBeTruthy()
    sessionId = connected.sessionId!
    return connected
  }
  async function poll(extra: Record<string, unknown> = {}) {
    return post('/bridge/poll', {
      clientId,
      sessionId,
      revision,
      document: history.present,
      ...extra,
    })
  }
  async function receiveCommand() {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await poll()
      expect(response.status).toBe(200)
      const data = (await response.json()) as BridgeResponse
      if (data.command) return data.command
      await delay(5)
    }
    throw new Error('The browser never received a queued command.')
  }
  function apply(command: BridgeCommand) {
    const previous = history.present
    const result =
      command.kind === 'undo' || command.kind === 'redo'
        ? null
        : applyCanvasCommand(previous, command)
    history =
      command.kind === 'undo'
        ? undoEditorHistory(history)
        : command.kind === 'redo'
          ? redoEditorHistory(history)
          : commitEditorHistory(history, result!.document)
    if (JSON.stringify(history.present) !== JSON.stringify(previous)) revision++
    return {
      affectedIds: result?.affectedIds ?? [],
      summary: result?.summary ?? `Canvas ${command.kind} applied.`,
    }
  }
  async function acknowledge(
    request: BridgeRequest,
    fields = apply(request.command),
  ) {
    const response = await poll({
      ack: {
        requestId: request.requestId,
        ok: true,
        revision,
        document: history.present,
        ...fields,
      },
    })
    expect(response.status).toBe(200)
    return (await response.json()) as BridgeResponse
  }
  function tool(name: string, args: Record<string, unknown> = {}) {
    return client.callTool({ name, arguments: args })
  }
  function target(operationId: string) {
    return { sessionId, expectedRevision: revision, operationId }
  }
  async function execute(
    name: string,
    args: Record<string, unknown>,
    operationId: string,
  ) {
    const promise = tool(name, { ...target(operationId), ...args })
    const request = await receiveCommand()
    expect(request.requestId).toBe(operationId)
    await acknowledge(request)
    const result = await promise
    expect(result.isError).not.toBe(true)
    expect(value(result).ok).toBe(true)
    return result
  }
  async function manual(
    document: CanvasDocument,
    extra: Record<string, unknown> = {},
  ) {
    history = commitEditorHistory(history, document)
    revision++
    const response = await poll(extra)
    expect(response.status).toBe(200)
    return (await response.json()) as BridgeResponse
  }
  async function close() {
    await client.close()
    await companion.close()
  }
  return {
    companion,
    client,
    url,
    post,
    share,
    poll,
    receiveCommand,
    acknowledge,
    execute,
    tool,
    target,
    apply,
    manual,
    close,
    get document() {
      return history.present
    },
    get revision() {
      return revision
    },
    get sessionId() {
      return sessionId
    },
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
let active: Fixture
beforeEach(async () => {
  active = await fixture()
})
afterEach(async () => {
  await active.close()
})

describe('official MCP client against the local companion', () => {
  it('initializes, advertises a narrow tool set and exposes no file, shell or save tools', async () => {
    expect(active.client.getServerVersion()).toMatchObject({
      name: 'canvas-live',
      version: '0.2.0',
    })
    const listed = await active.client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'apply_canvas_operations',
        'connect_shapes',
        'create_layer',
        'create_shape',
        'delete_shape',
        'get_canvas_state',
        'get_shape',
        'move_shape',
        'redo_operation',
        'reorder_layer',
        'resize_shape',
        'search_canvas',
        'undo_operation',
        'update_layer',
        'update_shape',
      ].sort(),
    )
    expect(
      listed.tools.every(
        (tool) =>
          tool.inputSchema.type === 'object' &&
          tool.outputSchema?.type === 'object',
      ),
    ).toBe(true)
    expect(
      listed.tools.find((tool) => tool.name === 'get_canvas_state')?.annotations
        ?.readOnlyHint,
    ).toBe(true)
    expect(
      listed.tools.find((tool) => tool.name === 'delete_shape')?.annotations
        ?.destructiveHint,
    ).toBe(true)
  })

  it('returns an honest unshared error without exposing documents', async () => {
    const result = await active.tool('get_canvas_state')
    expect(result.isError).toBe(true)
    expect(value(result)).toMatchObject({
      ok: false,
      error: { code: 'NOT_SHARED' },
    })
    expect(value(result).elements).toBeUndefined()
    const shared = await active.share()
    expect(shared.mcpClient).toBeNull()
    const state = value(await active.tool('get_canvas_state'))
    expect(state).toMatchObject({
      ok: true,
      sessionId: active.sessionId,
      revision: 0,
      total: 0,
      elements: [],
    })
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).mcpClient,
    ).toBe('MCP client')
  })

  it('reports success only after the browser applies and acknowledges the exact operation', async () => {
    await active.share()
    let settled = false
    const promise = active
      .tool('create_shape', {
        ...active.target('create-one'),
        element: rectangle,
      })
      .then((result) => {
        settled = true
        return result
      })
    const request = await active.receiveCommand()
    expect(request).toMatchObject({
      sessionId: active.sessionId,
      expectedRevision: 0,
      command: { kind: 'create', element: rectangle },
    })
    expect(settled).toBe(false)
    expect(value(await active.tool('get_canvas_state')).elements).toEqual([])
    await active.acknowledge(request)
    const result = value(await promise)
    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      affectedIds: ['one'],
    })
    const shapeResult = value(
      await active.tool('get_shape', {
        sessionId: active.sessionId,
        id: 'one',
      }),
    )
    expect(shapeResult.element).toMatchObject({
      id: 'one',
      text: 'First',
      x: 0,
    })
  })

  it('creates, moves, resizes, labels, connects, searches and deletes through the protocol', async () => {
    await active.share()
    await active.execute('create_shape', { element: rectangle }, 'create-one')
    await active.execute(
      'create_shape',
      {
        element: {
          ...rectangle,
          id: 'two',
          type: 'ellipse',
          x: 250,
          text: 'Second',
        },
      },
      'create-two',
    )
    await active.execute('move_shape', { id: 'one', x: 40, y: 30 }, 'move-one')
    await active.execute(
      'resize_shape',
      { id: 'one', width: 180, height: 110 },
      'resize-one',
    )
    await active.execute(
      'update_shape',
      { id: 'one', patch: { text: 'Reviewed [.*]', fill: '#123456' } },
      'label-one',
    )
    await active.execute(
      'connect_shapes',
      {
        fromId: 'one',
        toId: 'two',
        options: {
          id: 'edge',
          style: 'elbow',
          startArrow: true,
          endArrow: false,
        },
      },
      'connect',
    )
    const searched = value(
      await active.tool('search_canvas', {
        sessionId: active.sessionId,
        query: '[.*]',
        limit: 1,
      }),
    )
    expect(searched.elements).toHaveLength(1)
    expect(searched.elements![0]).toMatchObject({
      id: 'one',
      x: 40,
      y: 30,
      width: 180,
      height: 110,
    })
    expect(active.document.elements.at(-1)).toMatchObject({
      id: 'edge',
      style: 'elbow',
      startArrow: true,
      endArrow: false,
    })
    const deleted = value(
      await active.execute('delete_shape', { id: 'one' }, 'delete-one'),
    )
    expect(deleted.affectedIds).toEqual(['one', 'edge'])
    expect(
      value(await active.tool('get_canvas_state')).elements!.map(
        (element) => element.id,
      ),
    ).toEqual(['two'])
  })

  it('keeps AI batches and manual edits in the same reversible history', async () => {
    await active.share()
    await active.execute(
      'apply_canvas_operations',
      {
        operations: [
          { kind: 'create', element: rectangle },
          { kind: 'create', element: { ...rectangle, id: 'two', x: 220 } },
          {
            kind: 'connect',
            fromId: 'one',
            toId: 'two',
            options: { id: 'edge' },
          },
        ],
      },
      'diagram-batch',
    )
    await active.manual(
      applyCanvasCommand(active.document, {
        kind: 'move',
        id: 'one',
        x: 70,
        y: 20,
      }).document,
    )
    await active.execute('undo_operation', {}, 'undo-manual')
    expect(
      value(
        await active.tool('get_shape', {
          sessionId: active.sessionId,
          id: 'one',
        }),
      ).element,
    ).toMatchObject({ x: 0, y: 0 })
    await active.execute('undo_operation', {}, 'undo-batch')
    expect(value(await active.tool('get_canvas_state')).elements).toEqual([])
    await active.execute('redo_operation', {}, 'redo-batch')
    expect(value(await active.tool('get_canvas_state')).elements).toHaveLength(
      3,
    )
  })

  it('supports layer operations and rejects hidden or locked object edits', async () => {
    await active.share()
    await active.execute(
      'create_layer',
      { id: 'notes', name: 'Notes' },
      'notes-layer',
    )
    await active.execute(
      'create_shape',
      { element: { ...rectangle, layerId: 'notes' } },
      'notes-shape',
    )
    await active.execute(
      'reorder_layer',
      { id: 'notes', index: 0 },
      'notes-order',
    )
    await active.execute(
      'update_layer',
      { id: 'notes', patch: { locked: true } },
      'notes-lock',
    )
    const blocked = await active.tool('move_shape', {
      ...active.target('blocked-move'),
      id: 'one',
      x: 300,
      y: 200,
    })
    expect(blocked.isError).toBe(true)
    expect(value(blocked).error?.code).toBe('INVALID_OPERATION')
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
    expect(active.document.elements[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('rejects stale revisions, wrong sessions and unknown objects without queuing work', async () => {
    await active.share()
    await active.execute('create_shape', { element: rectangle }, 'initial')
    const stale = value(
      await active.tool('move_shape', {
        sessionId: active.sessionId,
        expectedRevision: 0,
        operationId: 'stale',
        id: 'one',
        x: 400,
        y: 0,
      }),
    )
    expect(stale.error?.code).toBe('STALE_REVISION')
    const wrong = value(
      await active.tool('get_shape', {
        sessionId: 'different-session',
        id: 'one',
      }),
    )
    expect(wrong.error?.code).toBe('WRONG_SESSION')
    const missing = value(
      await active.tool('move_shape', {
        ...active.target('missing'),
        id: 'unknown',
        x: 400,
        y: 0,
      }),
    )
    expect(missing.error?.code).toBe('INVALID_OPERATION')
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
  })

  it('accepts an ordinary edit after camera changes since its read and preserves the current viewport', async () => {
    await active.share()
    const original = {
      ...active.target('camera-before-write'),
      element: rectangle,
    }
    await active.manual({
      ...active.document,
      viewport: { x: 120, y: -40, zoom: 1 },
    })
    await active.manual({
      ...active.document,
      viewport: { x: 120, y: -40, zoom: 1.5 },
    })
    expect(value(await active.tool('get_canvas_state')).revision).toBe(2)

    const pending = active.tool('create_shape', original)
    const request = await active.receiveCommand()
    expect(request).toMatchObject({
      expectedRevision: 0,
      expectedContentRevision: 0,
    })
    await active.acknowledge(request)

    expect(value(await pending)).toMatchObject({ ok: true, revision: 3 })
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      revision: 3,
      viewport: { x: 120, y: -40, zoom: 1.5 },
      elements: [{ id: 'one' }],
    })
  })

  it('keeps an ordinary edit queued through camera changes and still requires its acknowledgment', async () => {
    await active.share()
    const pending = active.tool('create_shape', {
      ...active.target('camera-while-queued'),
      element: rectangle,
    })
    const request = await active.receiveCommand()
    const publication = await active.manual({
      ...active.document,
      viewport: { x: -90, y: 60, zoom: 0.75 },
    })
    expect(publication.command).toEqual(request)
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      revision: 1,
      elements: [],
    })

    await active.acknowledge(request)
    expect(value(await pending)).toMatchObject({ ok: true, revision: 2 })
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      viewport: { x: -90, y: 60, zoom: 0.75 },
      elements: [{ id: 'one' }],
    })
  })

  it('rejects a read before a content change but accepts that content revision after later camera changes', async () => {
    await active.share()
    const original = active.target('stale-content-before-camera')
    await active.manual(
      applyCanvasCommand(active.document, {
        kind: 'create',
        element: { ...rectangle, id: 'manual' },
      }).document,
    )
    await active.manual({
      ...active.document,
      viewport: { x: 20, y: 30, zoom: 2 },
    })
    const stale = value(
      await active.tool('create_shape', { ...original, element: rectangle }),
    )
    expect(stale.error?.code).toBe('STALE_REVISION')
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()

    const pending = active.tool('create_shape', {
      ...original,
      expectedRevision: 1,
      operationId: 'read-after-content-before-camera',
      element: rectangle,
    })
    const request = await active.receiveCommand()
    expect(request.expectedContentRevision).toBe(1)
    await active.acknowledge(request)
    expect(value(await pending).ok).toBe(true)
    expect(active.document.elements.map((element) => element.id)).toEqual([
      'manual',
      'one',
    ])
  })

  it('rejects an old read even when intervening content changes are undone back to the same content', async () => {
    await active.share()
    const original = active.target('content-changed-and-restored')
    await active.manual(
      applyCanvasCommand(active.document, {
        kind: 'create',
        element: { ...rectangle, id: 'temporary' },
      }).document,
    )
    active.apply({ kind: 'undo' })
    expect((await active.poll()).status).toBe(200)
    await active.manual({
      ...active.document,
      viewport: { x: 50, y: 0, zoom: 1 },
    })
    expect(active.document.elements).toEqual([])
    expect(active.revision).toBe(3)
    const stale = value(
      await active.tool('create_shape', { ...original, element: rectangle }),
    )
    expect(stale.error?.code).toBe('STALE_REVISION')
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
  })

  it.each(['create_shape', 'undo_operation', 'redo_operation'])(
    'rejects a future revision for %s without queuing an operation',
    async (name) => {
      await active.share()
      const rejected = value(
        await active.tool(name, {
          ...active.target('future-revision'),
          expectedRevision: 1,
          ...(name === 'create_shape' ? { element: rectangle } : {}),
        }),
      )
      expect(rejected.error?.code).toBe('STALE_REVISION')
      expect(
        ((await (await active.poll()).json()) as BridgeResponse).command,
      ).toBeUndefined()
      expect(active.document.elements).toEqual([])
    },
  )

  it.each(['undo_operation', 'redo_operation'])(
    'requires the current full revision for %s after a camera change',
    async (name) => {
      await active.share()
      const original = active.target('history-before-camera')
      await active.manual({
        ...active.document,
        viewport: { x: 40, y: 80, zoom: 1 },
      })
      const rejected = value(await active.tool(name, original))
      expect(rejected.error?.code).toBe('STALE_REVISION')
      expect(
        ((await (await active.poll()).json()) as BridgeResponse).command,
      ).toBeUndefined()
      expect(active.document.viewport).toEqual({ x: 40, y: 80, zoom: 1 })
    },
  )

  it.each(['undo_operation', 'redo_operation'])(
    'invalidates queued %s when the camera changes',
    async (name) => {
      await active.share()
      const pending = active.tool(name, active.target('queued-history-camera'))
      const request = await active.receiveCommand()
      expect(request.expectedContentRevision).toBeUndefined()
      const publication = await active.manual({
        ...active.document,
        viewport: { x: 10, y: 20, zoom: 1.25 },
      })
      expect(publication.command).toBeUndefined()
      expect(value(await pending).error?.code).toBe('STALE_REVISION')
      expect(active.document.viewport).toEqual({ x: 10, y: 20, zoom: 1.25 })
    },
  )

  it('rejects malformed tool schemas on the server without canvas changes', async () => {
    await active.share()
    for (const argumentsValue of [
      { ...active.target('invalid-extra'), element: rectangle, shell: 'never' },
      {
        ...active.target('invalid-size'),
        element: { ...rectangle, width: -1 },
      },
      {
        ...active.target('invalid-element'),
        element: { ...rectangle, script: 'never' },
      },
    ]) {
      const response = await active.post(
        '/mcp',
        {
          jsonrpc: '2.0',
          id: 'invalid-tool',
          method: 'tools/call',
          params: { name: 'create_shape', arguments: argumentsValue },
        },
        {
          Authorization: `Bearer ${mcpToken}`,
          Accept: 'application/json, text/event-stream',
        },
      )
      const responseText = await response.text()
      const message = response.headers
        .get('content-type')
        ?.includes('text/event-stream')
        ? responseText
            .split('\n')
            .find((line) => line.startsWith('data: '))
            ?.slice(6)
        : responseText
      expect(message).toBeTruthy()
      const data = JSON.parse(message!) as {
        error?: unknown
        result?: { isError?: boolean }
      }
      expect(Boolean(data.error) || data.result?.isError === true).toBe(true)
    }
    expect(value(await active.tool('get_canvas_state')).elements).toEqual([])
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
  })

  it('caches exact operation retries and rejects changed payloads using the same ID', async () => {
    await active.share()
    const original = { ...active.target('same-operation'), element: rectangle }
    const first = active.tool('create_shape', original)
    const command = await active.receiveCommand()
    const duplicate = active.tool('create_shape', original)
    await active.acknowledge(command)
    expect(value(await duplicate)).toEqual(value(await first))
    expect(value(await active.tool('create_shape', original)).revision).toBe(1)
    const changed = value(
      await active.tool('create_shape', {
        ...original,
        element: { ...rectangle, x: 99 },
      }),
    )
    expect(changed.error?.code).toBe('ID_REUSED')
    expect(value(await active.tool('get_canvas_state')).elements).toHaveLength(
      1,
    )
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
  })

  it('rejects conflicting pending edits and invalidates a queued edit after a manual change', async () => {
    await active.share()
    const first = active.tool('create_shape', {
      ...active.target('pending'),
      element: rectangle,
    })
    const request = await active.receiveCommand()
    const cameraPublication = await active.manual({
      ...active.document,
      viewport: { x: 25, y: 50, zoom: 1 },
    })
    expect(cameraPublication.command).toEqual(request)
    const busy = value(
      await active.tool('create_shape', {
        ...active.target('conflict'),
        element: { ...rectangle, id: 'two' },
      }),
    )
    expect(busy.error?.code).toBe('BUSY')
    await active.manual(
      applyCanvasCommand(active.document, {
        kind: 'create',
        element: { ...rectangle, id: 'manual' },
      }).document,
    )
    expect(value(await first).error?.code).toBe('STALE_REVISION')
    expect(active.document.elements.map((element) => element.id)).toEqual([
      'manual',
    ])
  })

  it('returns a timeout instead of unacknowledged success and accepts an eventual confirmed outcome on an identical retry', async () => {
    await active.close()
    active = await fixture(new CanvasBridge(5000, 150))
    await active.share()
    const original = { ...active.target('slow-ack'), element: rectangle }
    const pending = active.tool('create_shape', original)
    const command = await active.receiveCommand()
    const timeout = await pending
    expect(timeout.isError).toBe(true)
    expect(value(timeout).error?.code).toBe('NO_ACK')
    expect(value(await active.tool('get_canvas_state')).elements).toEqual([])
    await active.acknowledge(command)
    const confirmed = value(await active.tool('create_shape', original))
    expect(confirmed).toMatchObject({
      ok: true,
      revision: 1,
      affectedIds: ['one'],
    })
    expect(value(await active.tool('get_canvas_state')).elements).toHaveLength(
      1,
    )
  })
})

describe('browser ownership and acknowledgment security', () => {
  it('preserves the browser content stamp when an AI acknowledgment includes a later camera revision', async () => {
    expect(await active.share()).toMatchObject({ contentRevision: 0 })
    const pending = active.tool('create_shape', {
      ...active.target('ai-before-camera'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    const fields = active.apply(command.command)
    const aiDocument = structuredClone(active.document)
    const camera = { x: 120, y: -80, zoom: 1.5 }
    const publication = await active.manual(
      { ...active.document, viewport: camera },
      {
        contentRevision: 1,
        ack: {
          requestId: command.requestId,
          ok: true,
          revision: 1,
          document: aiDocument,
          ...fields,
        },
      },
    )
    expect(publication).toMatchObject({
      ackId: command.requestId,
      contentRevision: 1,
    })
    expect(value(await pending)).toMatchObject({ ok: true, revision: 2 })
    const state = value(await active.tool('get_canvas_state'))
    expect(state).toMatchObject({ revision: 2, viewport: camera })

    const next = active.tool('update_shape', {
      ...active.target('edit-after-mixed-ack'),
      expectedRevision: state.revision,
      id: 'one',
      patch: { text: 'Second confirmed edit' },
    })
    const nextCommand = await active.receiveCommand()
    expect(nextCommand).toMatchObject({
      expectedRevision: 2,
      expectedContentRevision: 1,
    })
    await active.acknowledge(nextCommand)
    expect(value(await next)).toMatchObject({ ok: true, revision: 3 })
    expect(active.document).toMatchObject({
      viewport: camera,
      elements: [{ id: 'one', text: 'Second confirmed edit' }],
    })
  })

  it('rejects invalid content stamps before accepting an otherwise valid acknowledgment', async () => {
    await active.share()
    const pending = active.tool('create_shape', {
      ...active.target('stamp-validation'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    const fields = active.apply(command.command)
    const ack = {
      requestId: command.requestId,
      ok: true,
      revision: 1,
      document: active.document,
      ...fields,
    }
    for (const contentRevision of [0, 2]) {
      const invalid = await active.poll({ contentRevision, ack })
      expect(invalid.status).toBe(409)
      expect(await invalid.json()).toMatchObject({
        code: 'INVALID_CONTENT_REVISION',
      })
      expect(value(await active.tool('get_canvas_state'))).toMatchObject({
        revision: 0,
        elements: [],
      })
    }
    for (const contentRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      expect((await active.poll({ contentRevision, ack })).status).toBe(400)
      expect(value(await active.tool('get_canvas_state'))).toMatchObject({
        revision: 0,
        elements: [],
      })
    }
    const accepted = await active.poll({ contentRevision: 1, ack })
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({
      ackId: command.requestId,
      contentRevision: 1,
    })
    expect(value(await pending)).toMatchObject({ ok: true, revision: 1 })
  })

  it('requires monotonically advancing content stamps while retaining camera-only stamps', async () => {
    await active.share()
    await active.execute(
      'create_shape',
      { element: rectangle },
      'initial-stamp',
    )
    const camera = { x: 50, y: -20, zoom: 0.75 }
    const publication = await active.manual(
      { ...active.document, viewport: camera },
      { contentRevision: 1 },
    )
    expect(publication.contentRevision).toBe(1)
    const changed = applyCanvasCommand(active.document, {
      kind: 'update',
      id: 'one',
      patch: { text: 'Unaccepted change' },
    }).document
    for (const extra of [
      { revision: 2, contentRevision: 2 },
      { revision: 3, contentRevision: 0 },
      { revision: 3, contentRevision: 2 },
      { revision: 3, contentRevision: 4 },
      { revision: 3, contentRevision: 1, document: changed },
    ]) {
      const invalid = await active.poll(extra)
      expect(invalid.status).toBe(409)
      expect(await invalid.json()).toMatchObject({
        code: 'INVALID_CONTENT_REVISION',
      })
      expect(value(await active.tool('get_canvas_state'))).toMatchObject({
        revision: 2,
        viewport: camera,
        elements: [{ text: 'First' }],
      })
    }
    expect(
      (
        (await (
          await active.poll({ contentRevision: 1 })
        ).json()) as BridgeResponse
      ).contentRevision,
    ).toBe(1)
  })

  it('accepts an advanced content stamp when intervening edits restore the same content', async () => {
    await active.share()
    const publication = await active.poll({ revision: 2, contentRevision: 2 })
    expect(publication.status).toBe(200)
    expect(await publication.json()).toMatchObject({ contentRevision: 2 })
    const stale = value(
      await active.tool('create_shape', {
        sessionId: active.sessionId,
        expectedRevision: 0,
        operationId: 'before-restored-content',
        element: rectangle,
      }),
    )
    expect(stale.error?.code).toBe('STALE_REVISION')
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      revision: 2,
      elements: [],
    })
  })

  it('accepts an AI acknowledgment alongside a newer manual revision without losing either change', async () => {
    await active.share()
    const pending = active.tool('create_shape', {
      ...active.target('ai-before-manual'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    const fields = active.apply(command.command)
    const aiDocument = structuredClone(active.document)
    expect(active.revision).toBe(1)
    active.apply({
      kind: 'update',
      id: 'one',
      patch: { x: 140, y: 20, text: 'Manual change after AI' },
    })
    expect(active.revision).toBe(2)
    const publication = await active.poll({
      ack: {
        requestId: command.requestId,
        ok: true,
        revision: 1,
        document: aiDocument,
        ...fields,
      },
    })
    expect(publication.status).toBe(200)
    expect(await publication.json()).toMatchObject({ ackId: command.requestId })
    expect(value(await pending)).toMatchObject({
      ok: true,
      revision: 2,
      affectedIds: ['one'],
    })
    const state = value(await active.tool('get_canvas_state'))
    expect(state.revision).toBe(2)
    expect(state.elements).toHaveLength(1)
    expect(state.elements![0]).toMatchObject({
      id: 'one',
      x: 140,
      y: 20,
      text: 'Manual change after AI',
    })
    expect(aiDocument.elements[0]).toMatchObject({
      id: 'one',
      x: 0,
      y: 0,
      text: 'First',
    })
  })

  it('refuses another tab and revokes in-flight work when sharing stops', async () => {
    await active.share()
    const second = await active.post('/bridge/connect', {
      clientId: 'browser-two',
      projectId: 'other-project',
      fileId: 'other-file',
      projectName: 'Other',
      document: createCanvasDocument('Other'),
    })
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ code: 'ALREADY_SHARED' })
    const pending = active.tool('create_shape', {
      ...active.target('disconnect'),
      element: rectangle,
    })
    await active.receiveCommand()
    const disconnect = await active.post('/bridge/disconnect', {
      clientId: 'browser-one',
      sessionId: active.sessionId,
    })
    expect(disconnect.status).toBe(200)
    expect(value(await pending).error?.code).toBe('DISCONNECTED')
    expect(value(await active.tool('get_canvas_state')).error?.code).toBe(
      'NOT_SHARED',
    )
  })

  it('never transfers a closed sharing session or its queued edit into a newly shared canvas', async () => {
    await active.share()
    const oldSessionId = active.sessionId
    const pending = active.tool('create_shape', {
      ...active.target('old-session-operation'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    await active.post('/bridge/disconnect', {
      clientId: 'browser-one',
      sessionId: oldSessionId,
    })
    expect(value(await pending).error?.code).toBe('DISCONNECTED')
    await active.share(createCanvasDocument('New shared canvas'))
    expect(active.sessionId).not.toBe(oldSessionId)
    const oldDocument = applyCanvasCommand(
      createCanvasDocument('Protocol canvas'),
      command.command as Exclude<BridgeCommand, { kind: 'undo' | 'redo' }>,
    ).document
    const late = await active.poll({
      sessionId: oldSessionId,
      revision: 1,
      document: oldDocument,
      ack: {
        requestId: command.requestId,
        ok: true,
        revision: 1,
        document: oldDocument,
      },
    })
    expect(late.status).toBe(409)
    expect(await late.json()).toMatchObject({ code: 'WRONG_SESSION' })
    const retried = value(
      await active.tool('create_shape', {
        sessionId: oldSessionId,
        expectedRevision: 0,
        operationId: command.requestId,
        element: rectangle,
      }),
    )
    expect(retried.error?.code).toBe('WRONG_SESSION')
    const state = value(await active.tool('get_canvas_state'))
    expect(state).toMatchObject({
      ok: true,
      sessionId: active.sessionId,
      revision: 0,
      elements: [],
    })
    expect(
      ((await (await active.poll()).json()) as BridgeResponse).command,
    ).toBeUndefined()
  })

  it('expires a silent browser lease so a closed tab cannot remain the active document', async () => {
    await active.close()
    active = await fixture(new CanvasBridge(40, 300))
    await active.share()
    await delay(65)
    expect(value(await active.tool('get_canvas_state')).error?.code).toBe(
      'NOT_SHARED',
    )
  })

  it('rejects invalid acknowledgments atomically before updating the shared state', async () => {
    await active.share()
    const pending = active.tool('create_shape', {
      ...active.target('valid-pending'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    const replaced = applyCanvasCommand(active.document, {
      kind: 'create',
      element: { ...rectangle, id: 'unaccepted' },
    }).document
    const unknown = await active.poll({
      revision: 1,
      document: replaced,
      ack: {
        requestId: 'unknown-operation',
        ok: true,
        revision: 1,
        document: replaced,
      },
    })
    expect(unknown.status).toBe(409)
    expect(await unknown.json()).toMatchObject({ code: 'UNKNOWN_OPERATION' })
    const state = value(await active.tool('get_canvas_state'))
    expect(state).toMatchObject({ revision: 0, elements: [] })
    const mismatch = await active.poll({
      revision: 1,
      document: replaced,
      ack: {
        requestId: command.requestId,
        ok: true,
        revision: 2,
        document: replaced,
      },
    })
    expect(mismatch.status).toBe(409)
    expect(await mismatch.json()).toMatchObject({ code: 'INVALID_ACK' })
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      revision: 0,
      elements: [],
    })
    await active.acknowledge(command)
    expect(value(await pending)).toMatchObject({ ok: true, revision: 1 })
  })

  it('does not let wrong sessions or unrevisioned documents overwrite the active canvas', async () => {
    await active.share()
    const changed = applyCanvasCommand(active.document, {
      kind: 'create',
      element: rectangle,
    }).document
    const wrong = await active.poll({
      sessionId: 'wrong',
      revision: 1,
      document: changed,
    })
    expect(wrong.status).toBe(409)
    const noRevision = await active.poll({ document: changed })
    expect(noRevision.status).toBe(409)
    expect(await noRevision.json()).toMatchObject({ code: 'REVISION_REQUIRED' })
    const unrevisionedCamera = await active.poll({
      document: { ...active.document, viewport: { x: 1, y: 0, zoom: 1 } },
    })
    expect(unrevisionedCamera.status).toBe(409)
    expect(await unrevisionedCamera.json()).toMatchObject({
      code: 'REVISION_REQUIRED',
    })
    expect(value(await active.tool('get_canvas_state'))).toMatchObject({
      revision: 0,
      elements: [],
    })
  })

  it('returns editor rejection instead of marking a refused edit successful', async () => {
    await active.share()
    const pending = active.tool('create_shape', {
      ...active.target('rejected'),
      element: rectangle,
    })
    const command = await active.receiveCommand()
    const ack = await active.poll({
      ack: {
        requestId: command.requestId,
        ok: false,
        revision: 0,
        error: 'The editor is busy.',
      },
    })
    expect(ack.status).toBe(200)
    const result = await pending
    expect(result.isError).toBe(true)
    expect(value(result)).toMatchObject({
      ok: false,
      error: { code: 'EDITOR_REJECTED', message: 'The editor is busy.' },
    })
    expect(value(await active.tool('get_canvas_state')).elements).toEqual([])
  })
})

function rawRequest(
  url: string,
  path: string,
  headers: Record<string, string>,
  body = '',
) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = httpRequest(
      new URL(path, url),
      { method: 'POST', headers },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          text += chunk
        })
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, text }),
        )
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('companion HTTP access boundary', () => {
  it('requires separate strong credentials at startup', () => {
    expect(() => createCompanion({ browserToken: 'short', mcpToken })).toThrow(
      'distinct, strong',
    )
    expect(() =>
      createCompanion({ browserToken, mcpToken: browserToken }),
    ).toThrow('distinct, strong')
  })

  it('enforces distinct browser and MCP credentials without returning their contents', async () => {
    for (const [path, token] of [
      ['/bridge/connect', mcpToken],
      ['/mcp', browserToken],
      ['/mcp', 'wrong'],
    ] as const) {
      const response = await active.post(
        path,
        {},
        { Authorization: `Bearer ${token}` },
      )
      expect(response.status).toBe(401)
      const text = await response.text()
      expect(text).not.toContain(browserToken)
      expect(text).not.toContain(mcpToken)
    }
    const noCredential = await fetch(`${active.url}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(noCredential.status).toBe(401)
  })

  it('enforces exact Host and Origin values, requiring an origin for browser requests', async () => {
    const badHost = await rawRequest(
      active.url,
      '/mcp',
      {
        Host: 'evil.example',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
      },
      '{}',
    )
    expect(badHost.status).toBe(403)
    const missingOrigin = await fetch(`${active.url}/bridge/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${browserToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(missingOrigin.status).toBe(403)
    for (const forbidden of [
      'null',
      'https://evil.example',
      `${origin}.evil.example`,
    ]) {
      const response = await active.post(
        '/bridge/connect',
        {},
        { Origin: forbidden },
      )
      expect(response.status).toBe(403)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
    const allowed = await active.post('/bridge/connect', {})
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })

  it('limits endpoints, methods and preflight headers', async () => {
    expect((await active.post('/bridge/unknown', {})).status).toBe(404)
    expect(
      (
        await fetch(`${active.url}/bridge/connect`, {
          headers: { Origin: origin, Authorization: `Bearer ${browserToken}` },
        })
      ).status,
    ).toBe(405)
    expect(
      (
        await fetch(`${active.url}/mcp`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${mcpToken}` },
        })
      ).status,
    ).toBe(405)
    const allowed = await fetch(`${active.url}/bridge/connect`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    const forbidden = await fetch(`${active.url}/bridge/connect`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-unrestricted',
      },
    })
    expect(forbidden.status).toBe(403)
  })

  it('rejects malformed bodies, unsupported fields and oversized declared requests', async () => {
    const nonJson = await fetch(`${active.url}/bridge/connect`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${browserToken}`,
        'Content-Type': 'text/plain',
      },
      body: '{}',
    })
    expect(nonJson.status).toBe(415)
    const invalidJson = await fetch(`${active.url}/bridge/connect`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${browserToken}`,
        'Content-Type': 'application/json',
      },
      body: '{',
    })
    expect(invalidJson.status).toBe(400)
    const unsupported = await active.post('/bridge/connect', {
      clientId: 'browser',
      projectId: 'project',
      fileId: 'file',
      projectName: 'Project',
      document: createCanvasDocument('Canvas'),
      path: 'C:/secret',
    })
    expect(unsupported.status).toBe(400)
    for (const [path, length, token] of [
      ['/mcp', 1024 * 1024 + 1, mcpToken],
      ['/bridge/connect', 22 * 1024 * 1024 + 1, browserToken],
    ] as const) {
      const response = await rawRequest(
        active.url,
        path,
        {
          Authorization: `Bearer ${token}`,
          Origin: origin,
          'Content-Type': 'application/json',
          'Content-Length': String(length),
        },
        'x'.repeat(length),
      )
      expect(response.status).toBe(413)
    }
    expect(value(await active.tool('get_canvas_state')).error?.code).toBe(
      'NOT_SHARED',
    )
  })
})
