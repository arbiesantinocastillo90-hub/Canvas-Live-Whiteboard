import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCanvasCommand } from '../mcp/canvasCommands'
import type { BridgeCommand } from '../mcp/bridgeProtocol'
import { createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'
import useMcpBridge from './useMcpBridge'

const token = 'browser-pairing-code-for-tests-only'
const emptyReply = { mcpClient: null, mcpLastSeen: null }
const command = {
  kind: 'create' as const,
  element: {
    type: 'rectangle' as const,
    id: 'ai-box',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
  },
}

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}
function queued(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'operation-1',
    sessionId: 'session-1',
    expectedRevision: 0,
    expiresAt: Date.now() + 8000,
    command,
    ...overrides,
  }
}
function fixture(
  poll: (body: Record<string, unknown>) => Promise<Response> = () =>
    json(emptyReply),
  initialDocument = createCanvasDocument('Shared canvas'),
) {
  let document = initialDocument
  const execute = vi.fn((command: BridgeCommand) => {
    if (command.kind === 'undo' || command.kind === 'redo')
      throw new Error('Not used by this fixture.')
    const result = applyCanvasCommand(document, command)
    document = result.document
    return result
  })
  const controller = { getDocument: () => document, execute }
  const fetchMock = vi.fn((url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)) as Record<string, unknown>
    if (url.endsWith('/bridge/connect'))
      return json({ ...emptyReply, sessionId: 'session-1', revision: 0 })
    if (url.endsWith('/bridge/poll')) return poll(body)
    return json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  const rendered = renderHook(
    ({ fileId, baseUrl }: { fileId: string; baseUrl?: string }) =>
      useMcpBridge({
        projectId: 'project',
        fileId,
        projectName: 'Project',
        baseUrl,
        getController: () => controller,
      }),
    {
      initialProps: {
        fileId: 'file',
        baseUrl: undefined as string | undefined,
      },
    },
  )
  async function share() {
    await act(async () => {
      await rendered.result.current.share(token)
    })
  }
  async function nextPoll() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
  }
  return {
    ...rendered,
    share,
    nextPoll,
    execute,
    fetchMock,
    getDocument: () => document,
    manualChange: () => {
      document = createElement(document, {
        type: 'text',
        id: 'manual',
        x: 0,
        y: 0,
        width: 100,
        height: 40,
      })
    },
    polls: () =>
      fetchMock.mock.calls
        .filter(([url]) => url.endsWith('/bridge/poll'))
        .map(([, options]) => JSON.parse(String(options.body))),
  }
}

describe('explicit single-canvas MCP browser sharing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.querySelector('meta[name="canvas-live-storage"]')?.remove()
  })

  it('does not connect or publish a canvas until the user shares it', async () => {
    const test = fixture()
    await test.nextPoll()
    expect(test.fetchMock).not.toHaveBeenCalled()
    expect(test.result.current.status).toBe('idle')
    await test.share()
    expect(test.result.current.status).toBe('sharing')
    expect(test.polls()[0].document.name).toBe('Shared canvas')
    // Legacy companions reject unknown poll fields; only send an advertised stamp.
    expect(test.polls()[0]).not.toHaveProperty('contentRevision')
    expect(test.fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    })
    expect(localStorage.getItem('mcp-token')).toBeNull()
  })

  it('rejects non-loopback addresses before sending pairing credentials', async () => {
    const test = fixture()
    test.rerender({ fileId: 'file', baseUrl: 'https://example.com' })
    await test.share()
    expect(test.fetchMock).not.toHaveBeenCalled()
    expect(test.result.current.error).toMatch(/local companion address/)
  })

  it('applies an acknowledged operation once even when the companion repeats it', async () => {
    let count = 0
    const test = fixture(() =>
      json({
        ...emptyReply,
        command: count++ < 2 ? queued() : undefined,
        ackId: count >= 3 ? 'operation-1' : undefined,
      }),
    )
    await test.share()
    expect(test.execute).toHaveBeenCalledTimes(1)
    expect(test.getDocument().elements[0].id).toBe('ai-box')
    await test.nextPoll()
    expect(test.execute).toHaveBeenCalledTimes(1)
    expect(test.polls()[1].ack).toMatchObject({
      requestId: 'operation-1',
      ok: true,
      revision: 1,
      affectedIds: ['ai-box'],
    })
    await test.nextPoll()
    await test.nextPoll()
    expect(test.polls()[3].ack).toBeUndefined()
  })

  it('increments the published revision for a committed manual edit', async () => {
    const test = fixture()
    await test.share()
    test.manualChange()
    await test.nextPoll()
    expect(test.polls()[1]).toMatchObject({ revision: 1 })
    expect(test.polls()[1].document.elements[0].id).toBe('manual')
    await test.nextPoll()
    expect(test.polls()[2].revision).toBe(1)
  })

  it('releases confirmed acknowledgment snapshots while preserving replay and newer manual edits', async () => {
    let count = 0
    const test = fixture(() => {
      const request = count++
      return json({
        ...emptyReply,
        ...(request === 0 || request === 2
          ? { command: queued() }
          : { ackId: 'operation-1' }),
      })
    })
    await test.share()
    await test.nextPoll()
    const initialAck = test.polls()[1].ack
    expect(initialAck.document.elements).toHaveLength(1)
    test.manualChange()
    await test.nextPoll()
    expect(test.polls()[2].ack).toBeUndefined()
    await test.nextPoll()
    const replayPublication = test.polls()[3]
    expect(replayPublication.ack).toEqual({
      requestId: initialAck.requestId,
      ok: initialAck.ok,
      revision: initialAck.revision,
      affectedIds: initialAck.affectedIds,
      summary: initialAck.summary,
    })
    expect(replayPublication.ack).not.toHaveProperty('document')
    expect(replayPublication.revision).toBe(2)
    expect(replayPublication.document.elements).toHaveLength(2)
    expect(test.execute).toHaveBeenCalledTimes(1)
    expect(test.result.current.status).toBe('sharing')
  })

  it('publishes a newer manual change alongside the prior AI acknowledgment', async () => {
    let count = 0
    const test = fixture(() =>
      json({
        ...emptyReply,
        ...(count++ === 0 ? { command: queued() } : { ackId: 'operation-1' }),
      }),
    )
    await test.share()
    test.manualChange()
    await test.nextPoll()
    const publication = test.polls()[1]
    expect(publication).toMatchObject({
      revision: 2,
      ack: { ok: true, revision: 1 },
    })
    expect(publication.document.elements).toHaveLength(2)
    expect(publication.ack.document.elements).toHaveLength(1)
    expect(test.result.current.status).toBe('sharing')
    expect(test.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects a queued edit when a manual edit occurred during the request', async () => {
    let complete: (reply: Response) => void = () => undefined
    let count = 0
    const test = fixture(() =>
      count++ === 0
        ? new Promise((resolve) => {
            complete = resolve
          })
        : json(emptyReply),
    )
    await test.share()
    test.manualChange()
    await act(async () => {
      complete(await json({ ...emptyReply, command: queued() }))
    })
    expect(test.execute).not.toHaveBeenCalled()
    await test.nextPoll()
    expect(test.polls()[1].ack).toMatchObject({ ok: false, revision: 1 })
    expect(test.result.current.error).toMatch(/canvas changed/)
  })

  it.each([
    { sessionId: 'another-session' },
    { expiresAt: Date.now() - 1 },
    { command: { kind: 'undo', unexpected: 'value' } },
  ])(
    'rejects an out-of-scope, expired or malformed operation: %j',
    async (overrides) => {
      const test = fixture(() =>
        json({ ...emptyReply, command: queued(overrides) }),
      )
      await test.share()
      expect(test.execute).not.toHaveBeenCalled()
      await test.nextPoll()
      expect(test.polls()[1].ack.ok).toBe(false)
      expect(test.getDocument().elements).toHaveLength(0)
    },
  )

  it('disconnects on a file switch and never applies a late reply to the next file', async () => {
    let complete: (reply: Response) => void = () => undefined
    const test = fixture(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await test.share()
    test.rerender({ fileId: 'second-file', baseUrl: undefined })
    await act(async () => {
      complete(await json({ ...emptyReply, command: queued() }))
    })
    expect(test.execute).not.toHaveBeenCalled()
    expect(test.result.current.status).toBe('idle')
    expect(
      test.fetchMock.mock.calls.filter(([url]) =>
        url.endsWith('/bridge/connect'),
      ),
    ).toHaveLength(1)
    expect(
      test.fetchMock.mock.calls.find(([url]) =>
        url.endsWith('/bridge/disconnect'),
      )?.[1].keepalive,
    ).toBe(true)
  })

  it('disconnects before unmounting without storing the pairing code', async () => {
    const test = fixture()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    await test.share()
    test.unmount()
    expect(test.fetchMock.mock.calls.at(-1)?.[0]).toMatch(/bridge\/disconnect$/)
    expect(storage.mock.calls.some(([, value]) => value.includes(token))).toBe(
      false,
    )
  })

  it('stops sharing when the browser leaves the page', async () => {
    const test = fixture()
    await test.share()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(test.result.current.status).toBe('idle')
    expect(test.fetchMock.mock.calls.at(-1)?.[0]).toMatch(/bridge\/disconnect$/)
    await test.nextPoll()
    expect(test.polls()).toHaveLength(1)
  })

  it('reports an unavailable companion and does not keep retrying or claim a client', async () => {
    const test = fixture(() => json({ error: 'This session expired.' }, 410))
    await test.share()
    expect(test.result.current.status).toBe('error')
    expect(test.result.current.error).toBe('This session expired.')
    expect(test.result.current.mcpClient).toBeNull()
    await test.nextPoll()
    expect(test.polls()).toHaveLength(1)
  })

  it('shows the bounded client-reported name without claiming to detect a model', async () => {
    const test = fixture(() =>
      json({
        mcpClient: 'ChatGPT admin definitely verified',
        mcpLastSeen: 123,
      }),
    )
    await test.share()
    expect(test.result.current.mcpClient).toBe(
      'ChatGPT admin definitely verified',
    )
    expect(test.result.current.mcpLastSeen).toBe(123)
  })

  it('captures read locations from visible local geometry and does not replay duplicate activity', async () => {
    let document = createElement(
      createCanvasDocument('Shared canvas'),
      command.element,
    )
    document.layers.push({
      id: 'hidden',
      name: 'Hidden',
      visible: true,
      locked: false,
    })
    document = createElement(document, {
      ...command.element,
      id: 'secret',
      layerId: 'hidden',
    })
    document.layers.find((layer) => layer.id === 'hidden')!.visible = false
    const activity = {
      id: 'read-one',
      kind: 'read',
      phase: 'complete',
      at: Date.now(),
      targetIds: ['ai-box', 'secret'],
    }
    const test = fixture(() => json({ ...emptyReply, activity }), document)
    await test.share()
    const presence = test.result.current.presence
    expect(presence).toMatchObject({
      id: 'read-one',
      kind: 'read',
      phase: 'complete',
      scope: JSON.stringify(['project', 'file']),
      targets: [
        { id: 'ai-box', bounds: { x: 10, y: 20, width: 100, height: 80 } },
      ],
    })
    await test.nextPoll()
    expect(test.result.current.presence).toBe(presence)
    expect(test.result.current.activities).toHaveLength(1)
    expect(test.execute).not.toHaveBeenCalled()
  })

  it('keeps one actual move result with its previous geometry across completion and delayed pending metadata', async () => {
    const document = createElement(
      createCanvasDocument('Shared canvas'),
      command.element,
    )
    const activity = {
      id: 'edit:session-1:operation-1',
      kind: 'edit',
      phase: 'working',
      at: Date.now(),
      targetIds: ['ai-box'],
    }
    let polls = 0
    const test = fixture(() => {
      const index = polls++
      return json({
        ...emptyReply,
        activity:
          index === 2
            ? { ...activity, phase: 'complete', at: Date.now() }
            : activity,
        ...(index === 1 || index === 3
          ? {
              command: queued({
                command: { kind: 'move', id: 'ai-box', x: 150, y: 200 },
              }),
            }
          : {}),
        ...(index === 2 ? { ackId: 'operation-1' } : {}),
      })
    }, document)
    await test.share()
    expect(test.result.current.presence?.phase).toBe('working')
    expect(test.execute).not.toHaveBeenCalled()
    await test.nextPoll()
    const completed = test.result.current.presence
    expect(completed).toMatchObject({
      phase: 'complete',
      targets: [
        {
          id: 'ai-box',
          bounds: { x: 150, y: 200 },
          previousBounds: { x: 10, y: 20 },
        },
      ],
    })
    const history = test.result.current.activities
    expect(history).toHaveLength(1)
    expect(history?.[0]).toMatchObject({
      phase: 'complete',
      summary: test.result.current.lastOperation,
    })
    await test.nextPoll()
    await test.nextPoll()
    expect(test.execute).toHaveBeenCalledTimes(1)
    expect(test.result.current.presence).toBe(completed)
    expect(test.result.current.activities).toBe(history)
    expect(test.result.current.activity?.phase).toBe('complete')
  })

  it('retains the real deleted location when the companion confirms it after the shape has gone', async () => {
    const document = createElement(
      createCanvasDocument('Shared canvas'),
      command.element,
    )
    let polls = 0
    const test = fixture(
      () =>
        json({
          ...emptyReply,
          ...(polls++ === 0
            ? { command: queued({ command: { kind: 'delete', id: 'ai-box' } }) }
            : {
                ackId: 'operation-1',
                activity: {
                  id: 'edit:session-1:operation-1',
                  kind: 'edit',
                  phase: 'complete',
                  at: Date.now(),
                  targetIds: ['ai-box'],
                },
              }),
        }),
      document,
    )
    await test.share()
    const completed = test.result.current.presence
    expect(completed).toMatchObject({
      phase: 'complete',
      targets: [
        {
          id: 'ai-box',
          removed: true,
          bounds: { x: 10, y: 20, width: 100, height: 80 },
        },
      ],
    })
    expect(test.getDocument().elements).toHaveLength(0)
    await test.nextPoll()
    expect(test.result.current.presence).toBe(completed)
    expect(test.result.current.activities).toHaveLength(1)
  })

  it('keeps a rejected operation failed when a delayed pending snapshot is repeated', async () => {
    const document = createElement(
      createCanvasDocument('Shared canvas'),
      command.element,
    )
    let polls = 0
    const test = fixture(
      () =>
        json({
          ...emptyReply,
          activity: {
            id: 'edit:session-1:operation-1',
            kind: 'edit',
            phase: polls++ < 2 ? 'working' : 'complete',
            at: Date.now(),
            targetIds: ['ai-box'],
          },
          command: queued({ sessionId: 'wrong-session' }),
        }),
      document,
    )
    await test.share()
    expect(test.result.current.activities?.[0]).toMatchObject({
      kind: 'error',
      phase: 'failed',
      summary: expect.stringContaining('Edit not applied:'),
    })
    await test.nextPoll()
    expect(test.result.current.presence).toBeNull()
    expect(test.result.current.activity).toBeNull()
    expect(test.result.current.activities).toHaveLength(1)
    expect(test.result.current.activities?.[0].phase).toBe('failed')
    expect(test.execute).not.toHaveBeenCalled()
    await test.nextPoll()
    expect(test.result.current.presence).toBeNull()
    expect(test.result.current.activity).toBeNull()
    expect(test.result.current.activities?.[0].phase).toBe('failed')
  })

  it('treats an object ID that collides with a layer ID as that object when recording an ordinary edit', async () => {
    let document = createCanvasDocument('Shared canvas')
    document.layers.push({
      id: 'target',
      name: 'Other layer',
      visible: true,
      locked: false,
    })
    document = createElement(document, { ...command.element, id: 'target' })
    document = createElement(document, {
      ...command.element,
      id: 'other',
      layerId: 'target',
    })
    const test = fixture(
      () =>
        json({
          ...emptyReply,
          command: queued({
            command: { kind: 'move', id: 'target', x: 90, y: 100 },
          }),
        }),
      document,
    )
    await test.share()
    expect(
      test.result.current.presence?.targets.map((target) => target.id),
    ).toEqual(['target'])
    expect(test.result.current.activity?.targetIds).toEqual(['target'])
    expect(
      test.getDocument().elements.find((element) => element.id === 'other'),
    ).toMatchObject({ x: 10, y: 20 })
  })

  it('resolves layer change result IDs to the actual member objects before displaying activity', async () => {
    const document = createElement(
      createCanvasDocument('Shared canvas'),
      command.element,
    )
    const layerId = document.layers[0].id
    const test = fixture(
      () =>
        json({
          ...emptyReply,
          command: queued({
            command: {
              kind: 'update_layer',
              id: layerId,
              patch: { name: 'Renamed' },
            },
          }),
        }),
      document,
    )
    await test.share()
    expect(
      test.result.current.presence?.targets.map((target) => target.id),
    ).toEqual(['ai-box'])
    expect(test.result.current.activity?.targetIds).toEqual(['ai-box'])
    expect(test.execute).toHaveBeenCalledTimes(1)
  })

  it('marks a disappeared request unconfirmed without claiming it was applied or permanently busy', async () => {
    let polls = 0
    const activity = {
      id: 'edit:session-1:operation-1',
      kind: 'edit',
      phase: 'working',
      at: Date.now(),
      targetIds: [],
    }
    const test = fixture(() =>
      json({ ...emptyReply, activity: polls++ === 1 ? null : activity }),
    )
    await test.share()
    expect(test.result.current.activities?.[0].phase).toBe('working')
    await test.nextPoll()
    expect(test.result.current.activities?.[0]).toMatchObject({
      phase: 'unconfirmed',
      summary: expect.stringContaining('confirm its outcome'),
    })
    expect(test.result.current.lastOperation).toBeNull()
    expect(test.result.current.error).toBeNull()
    await test.nextPoll()
    expect(test.result.current.activity).toBeNull()
    expect(test.result.current.activities?.[0].phase).toBe('unconfirmed')
    expect(test.execute).not.toHaveBeenCalled()
  })

  it('clears work markers and labels pending history unconfirmed if the connection fails', async () => {
    let polls = 0
    const test = fixture(() =>
      polls++ === 0
        ? json({
            ...emptyReply,
            activity: {
              id: 'pending',
              kind: 'edit',
              phase: 'working',
              at: Date.now(),
              targetIds: [],
            },
          })
        : json({ error: 'Companion disconnected.' }, 410),
    )
    await test.share()
    await test.nextPoll()
    expect(test.result.current.status).toBe('error')
    expect(test.result.current.presence).toBeNull()
    expect(test.result.current.activity).toBeNull()
    expect(test.result.current.activities?.[0]).toMatchObject({
      phase: 'unconfirmed',
      summary: expect.stringContaining('Connection lost'),
    })
    expect(test.result.current.lastOperation).toBeNull()
  })

  it('quarantines invalid activity metadata while retaining a valid operation', async () => {
    const test = fixture(() =>
      json({
        ...emptyReply,
        activity: { kind: ['edit'], at: Date.now(), targetIds: ['secret'] },
        command: queued(),
      }),
    )
    await test.share()
    expect(test.execute).toHaveBeenCalledTimes(1)
    expect(test.result.current.activities).toHaveLength(1)
    expect(test.result.current.activities?.[0]).toMatchObject({
      phase: 'complete',
      kind: 'edit',
    })
    expect(
      test.result.current.presence?.targets.map((target) => target.id),
    ).toEqual(['ai-box'])
  })

  it('clears activity locations and history when sharing stops or changes to another file', async () => {
    const test = fixture(() =>
      json({
        ...emptyReply,
        activity: { id: 'read', kind: 'read', at: Date.now() },
      }),
    )
    await test.share()
    expect(test.result.current.activities).toHaveLength(1)
    act(() => test.result.current.disconnect())
    expect(test.result.current.activities).toEqual([])
    expect(test.result.current.presence).toBeNull()
    await test.share()
    test.rerender({ fileId: 'other-file', baseUrl: undefined })
    expect(test.result.current.activities).toEqual([])
    expect(test.result.current.presence).toBeNull()
    expect(test.result.current.status).toBe('idle')
  })

  it('discovers its packaged companion only after an explicit Share action', async () => {
    const test = fixture()
    const previous = test.fetchMock.getMockImplementation()!
    test.fetchMock.mockImplementation((url, options) => {
      if (url === '/__canvas_live_companion')
        return json({
          url: 'http://127.0.0.1:49321',
          browserPairingCode: token,
        })
      return previous(url, options)
    })
    expect(test.fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      await test.result.current.share()
    })
    expect(test.result.current.status).toBe('sharing')
    expect(test.fetchMock.mock.calls[0]).toMatchObject([
      '/__canvas_live_companion',
      {
        headers: { 'X-Canvas-Live-Companion': '1' },
        credentials: 'same-origin',
        redirect: 'error',
      },
    ])
    expect(test.fetchMock.mock.calls[1][0]).toBe(
      'http://127.0.0.1:49321/bridge/connect',
    )
    expect(test.fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    })
  })

  function portablePage() {
    const meta = document.createElement('meta')
    meta.name = 'canvas-live-storage'
    meta.content = 'local-v1'
    document.head.append(meta)
  }

  it('uses the discovered dynamic port for a manually pasted browser code in the portable app', async () => {
    portablePage()
    const test = fixture()
    const previous = test.fetchMock.getMockImplementation()!
    test.fetchMock.mockImplementation((url, options) =>
      url === '/__canvas_live_companion'
        ? json({ url: 'http://127.0.0.1:59755', browserPairingCode: token })
        : previous(url, options),
    )
    await test.share()
    expect(test.result.current.status).toBe('sharing')
    expect(test.fetchMock.mock.calls[1][0]).toBe(
      'http://127.0.0.1:59755/bridge/connect',
    )
    expect(
      test.fetchMock.mock.calls.some(([url]) => url.includes(':8787/')),
    ).toBe(false)
  })

  it('explains a stale code or AI-client token without posting it to a companion', async () => {
    portablePage()
    const test = fixture()
    test.fetchMock.mockImplementation(() =>
      json({
        url: 'http://127.0.0.1:59755',
        browserPairingCode: 'new-browser-code-only-for-tests',
      }),
    )
    await test.share()
    expect(test.result.current.status).toBe('error')
    expect(test.result.current.error).toContain(
      'MCP access token belongs in your AI client',
    )
    expect(test.result.current.error).not.toContain(token)
    expect(test.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to the development port when the packaged companion is stopped', async () => {
    portablePage()
    const test = fixture()
    test.fetchMock.mockImplementation(() => json({ error: 'not running' }, 503))
    await test.share()
    expect(test.result.current.status).toBe('error')
    expect(test.result.current.error).toContain('Start Canvas Live MCP')
    expect(test.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives a service-start instruction when discovery fails at the network layer', async () => {
    const test = fixture()
    test.fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await act(async () => {
      await test.result.current.share()
    })
    expect(test.result.current.error).toContain('Open Canvas Live MCP.exe')
    expect(test.result.current.error).not.toContain('Failed to fetch')
  })

  it('does not send a pairing credential to an unsafe discovered address', async () => {
    const test = fixture()
    test.fetchMock.mockImplementation(() =>
      json({ url: 'https://example.com', browserPairingCode: token }),
    )
    await act(async () => {
      await test.result.current.share()
    })
    expect(test.result.current.status).toBe('error')
    expect(test.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not share after navigating away while companion discovery is pending', async () => {
    const test = fixture()
    let resolveDiscovery!: (value: Response) => void
    test.fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDiscovery = resolve
        }),
    )
    let sharing!: Promise<void>
    act(() => {
      sharing = test.result.current.share()
    })
    test.rerender({ fileId: 'another-file', baseUrl: undefined })
    await act(async () => {
      resolveDiscovery(
        await json({
          url: 'http://127.0.0.1:49321',
          browserPairingCode: token,
        }),
      )
      await sharing
    })
    expect(test.fetchMock).toHaveBeenCalledTimes(1)
    expect(test.result.current.status).toBe('idle')
  })
})
