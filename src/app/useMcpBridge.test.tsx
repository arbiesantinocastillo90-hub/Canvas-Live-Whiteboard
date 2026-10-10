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
) {
  let document = createCanvasDocument('Shared canvas')
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
  })

  it('does not connect or publish a canvas until the user shares it', async () => {
    const test = fixture()
    await test.nextPoll()
    expect(test.fetchMock).not.toHaveBeenCalled()
    expect(test.result.current.status).toBe('idle')
    await test.share()
    expect(test.result.current.status).toBe('sharing')
    expect(test.polls()[0].document.name).toBe('Shared canvas')
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

  it('treats the reported MCP client name as unverified', async () => {
    const test = fixture(() =>
      json({
        mcpClient: 'ChatGPT admin definitely verified',
        mcpLastSeen: 123,
      }),
    )
    await test.share()
    expect(test.result.current.mcpClient).toBe('MCP client')
    expect(test.result.current.mcpLastSeen).toBe(123)
  })
})
