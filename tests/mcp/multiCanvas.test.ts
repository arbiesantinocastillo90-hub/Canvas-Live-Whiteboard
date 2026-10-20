import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasBridge } from '../../server/bridge'
import { createCanvasDocument } from '../../src/app/lcanvas'
import { applyCanvasCommand } from '../../src/mcp/canvasCommands'

const bridges: CanvasBridge[] = []
function fixture(lease = 5000) {
  const bridge = new CanvasBridge(lease)
  bridges.push(bridge)
  const share = (fileId: string, clientId = 'owner-' + fileId) => {
    const document = createCanvasDocument(fileId)
    const reply = bridge.connect({
      clientId,
      projectId: 'project',
      fileId,
      projectName: 'Project',
      document,
    })
    return { clientId, sessionId: reply.sessionId!, revision: 0, document }
  }
  return { bridge, share }
}
afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.close()
  vi.useRealTimers()
})

describe('independently shared canvases', () => {
  it('lists only explicitly granted canvases and requires a target when several are shared', () => {
    const { bridge, share } = fixture()
    expect(bridge.list()).toEqual([])
    expect(() => bridge.read()).toThrow('Share this canvas')
    const first = share('first')
    expect(bridge.read().sessionId).toBe(first.sessionId)
    const second = share('second')
    expect(bridge.list()).toEqual([
      expect.objectContaining({ sessionId: first.sessionId, name: 'first' }),
      expect.objectContaining({ sessionId: second.sessionId, name: 'second' }),
    ])
    expect(() => bridge.read()).toThrow('list_shared_canvases')
    expect(bridge.read(first.sessionId).document.name).toBe('first')
    expect(bridge.read(second.sessionId).document.name).toBe('second')
  })

  it('does not allow another browser to take over the same canvas', () => {
    const { bridge, share } = fixture()
    const first = share('first')
    expect(() => share('first', 'intruder')).toThrow('Another tab')
    expect(share('first').sessionId).toBe(first.sessionId)
    expect(bridge.list()).toHaveLength(1)
  })

  it('acknowledges concurrent operations and identical operation IDs independently', async () => {
    const { bridge, share } = fixture()
    const first = share('first')
    const second = share('second')
    const command = {
      kind: 'create' as const,
      element: {
        id: 'box',
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 80,
        height: 60,
      },
    }
    const pendingFirst = bridge.mutate(
      first.sessionId,
      0,
      'same-operation',
      command,
    )
    const pendingSecond = bridge.mutate(
      second.sessionId,
      0,
      'same-operation',
      command,
    )
    expect(bridge.poll(first).command?.sessionId).toBe(first.sessionId)
    expect(bridge.poll(second).command?.sessionId).toBe(second.sessionId)
    const updated = applyCanvasCommand(first.document, command).document
    bridge.poll({
      ...first,
      revision: 1,
      contentRevision: 1,
      document: updated,
      ack: {
        requestId: 'same-operation',
        ok: true,
        revision: 1,
        document: updated,
      },
    })
    expect(await pendingFirst).toMatchObject({
      ok: true,
      sessionId: first.sessionId,
    })
    expect(bridge.read(second.sessionId).document.elements).toEqual([])
    bridge.disconnect({
      clientId: second.clientId,
      sessionId: second.sessionId,
    })
    expect(await pendingSecond).toMatchObject({
      ok: false,
      error: { code: 'DISCONNECTED' },
    })
    expect(bridge.read().sessionId).toBe(first.sessionId)
  })

  it('rejects cross-session polling, fabricated acknowledgments and disconnects', () => {
    const { bridge, share } = fixture()
    const first = share('first')
    const second = share('second')
    expect(() => bridge.poll({ ...second, clientId: first.clientId })).toThrow(
      'sharing session has ended',
    )
    expect(() =>
      bridge.poll({
        ...second,
        ack: { requestId: 'foreign-operation', ok: true, revision: 0 },
      }),
    ).toThrow('no longer part')
    bridge.disconnect({ sessionId: second.sessionId, clientId: first.clientId })
    expect(bridge.list()).toHaveLength(2)
    expect(() => bridge.read('invented-session')).toThrow(
      'sharing session has ended',
    )
  })

  it('expires only the unresponsive grant and retains a separately polled grant', () => {
    vi.useFakeTimers()
    const { bridge, share } = fixture(10)
    const first = share('first')
    const second = share('second')
    vi.advanceTimersByTime(6)
    bridge.poll(second)
    vi.advanceTimersByTime(5)
    expect(bridge.list()).toEqual([
      expect.objectContaining({ sessionId: second.sessionId }),
    ])
    expect(() => bridge.read(first.sessionId)).toThrow(
      'sharing session has ended',
    )
  })

  it('bounds the number of grants and frees slots when the owner stops sharing', () => {
    const { bridge, share } = fixture()
    const owners = Array.from({ length: 16 }, (_, i) => share('canvas-' + i))
    expect(() => share('seventeenth')).toThrow('Up to 16 canvases')
    bridge.disconnect({
      clientId: owners[0].clientId,
      sessionId: owners[0].sessionId,
    })
    expect(share('replacement').sessionId).toBeTruthy()
    expect(bridge.list()).toHaveLength(16)
  })
})
