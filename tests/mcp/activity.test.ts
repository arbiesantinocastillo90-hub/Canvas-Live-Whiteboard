import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasBridge } from '../../server/bridge'
import {
  createCanvasDocument,
  type CanvasDocument,
} from '../../src/app/lcanvas'
import { applyCanvasCommand } from '../../src/mcp/canvasCommands'
import type { BridgeCommand } from '../../src/mcp/bridgeProtocol'

const bridges: CanvasBridge[] = []
const rectangle = (id: string) => ({
  id,
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 100,
  height: 80,
})
function drawing() {
  return applyCanvasCommand(createCanvasDocument('Drawing'), {
    kind: 'batch',
    operations: [
      { kind: 'create', element: rectangle('one') },
      { kind: 'create', element: rectangle('two') },
      {
        kind: 'connect',
        fromId: 'one',
        toId: 'two',
        options: { id: 'edge' },
      },
    ],
  }).document
}
function fixture(document = drawing(), operationMs = 8000) {
  const bridge = new CanvasBridge(5000, operationMs)
  bridges.push(bridge)
  const share = (fileId: string, sharedDocument: CanvasDocument = document) => {
    const clientId = 'owner-' + fileId
    const connected = bridge.connect({
      clientId,
      projectId: 'project',
      fileId,
      projectName: 'Project',
      document: sharedDocument,
    })
    return {
      clientId,
      sessionId: connected.sessionId!,
      revision: 0,
      document: sharedDocument,
    }
  }
  const owner = share('first')
  const poll = () => bridge.poll(owner)
  return { bridge, owner, share, poll }
}
afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.close()
  vi.useRealTimers()
})

describe('observed canvas activity', () => {
  it('reads and updates an object whose ID equals a layer ID without marking its siblings', async () => {
    const base = createCanvasDocument('Colliding namespaces')
    const layerId = base.layers[0].id
    const document = applyCanvasCommand(base, {
      kind: 'batch',
      operations: [
        { kind: 'create', element: rectangle(layerId) },
        { kind: 'create', element: rectangle('sibling') },
      ],
    }).document
    const { bridge, owner, poll } = fixture(document)
    bridge.recordRead(owner.sessionId, [layerId])
    expect(poll().activity?.targetIds).toEqual([layerId])
    const command: BridgeCommand = { kind: 'move', id: layerId, x: 10, y: 20 }
    const pending = bridge.mutate(owner.sessionId, 0, 'move-collision', command)
    expect(poll().activity?.targetIds).toEqual([layerId])
    const changed = applyCanvasCommand(document, command)
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'move-collision',
        ok: true,
        revision: 1,
        affectedIds: changed.affectedIds,
      },
    })
    expect(reply.activity?.targetIds).toEqual([layerId])
    await pending
  })

  it('resolves real layer commands and history without including unchanged objects from a colliding namespace', async () => {
    const base = createCanvasDocument('Layer targets')
    const layerId = base.layers[0].id
    const document = applyCanvasCommand(base, {
      kind: 'batch',
      operations: [
        { kind: 'add_layer', id: 'other', name: 'Other' },
        {
          kind: 'create',
          element: { ...rectangle(layerId), layerId: 'other' },
        },
        { kind: 'create', element: rectangle('member') },
      ],
    }).document
    const { bridge, owner, poll } = fixture(document)
    const command: BridgeCommand = {
      kind: 'batch',
      operations: [
        { kind: 'update_layer', id: layerId, patch: { name: 'Renamed' } },
        { kind: 'update_layer', id: 'other', patch: { locked: true } },
      ],
    }
    const pending = bridge.mutate(owner.sessionId, 0, 'layers', command)
    expect(poll().activity?.targetIds).toEqual([layerId, 'member'])
    const changed = applyCanvasCommand(document, command)
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'layers',
        ok: true,
        revision: 1,
        affectedIds: changed.affectedIds,
      },
    })
    expect(reply.activity?.targetIds).toEqual([layerId, 'member'])
    await pending
    const undo = bridge.mutate(owner.sessionId, 1, 'undo-layers', {
      kind: 'undo',
    })
    expect(
      bridge.poll({ ...owner, revision: 1, document: changed.document })
        .activity?.targetIds,
    ).toEqual([])
    const undone = bridge.poll({
      ...owner,
      revision: 2,
      document,
      ack: {
        requestId: 'undo-layers',
        ok: true,
        revision: 2,
        affectedIds: [layerId, 'other'],
      },
    })
    expect(undone.activity?.targetIds).toEqual([layerId, 'member'])
    await undo

    const onlyMain: BridgeCommand = {
      kind: 'update_layer',
      id: layerId,
      patch: { name: 'Main only' },
    }
    const mainPending = bridge.mutate(owner.sessionId, 2, 'main-only', onlyMain)
    expect(
      bridge.poll({ ...owner, revision: 2, document }).activity?.targetIds,
    ).toEqual(['member'])
    bridge.close()
    await mainPending
  })

  it('lists grants without inventing reads or disturbing selected-canvas activity', () => {
    const { bridge, owner, share, poll } = fixture()
    const second = share('second')
    bridge.list()
    expect(poll()).toMatchObject({ activity: null, mcpLastSeen: null })
    expect(bridge.poll(second)).toMatchObject({
      activity: null,
      mcpLastSeen: null,
    })
    bridge.read(owner.sessionId)
    const observed = poll().activity
    expect(observed).toMatchObject({
      kind: 'read',
      id: expect.any(String),
      phase: 'complete',
      targetIds: ['one', 'two', 'edge'],
    })
    bridge.list()
    expect(poll().activity).toEqual(observed)
    expect(bridge.poll(second).activity).toBeNull()
  })

  it('records a fresh bounded event only for actual selected-session objects', () => {
    const document = applyCanvasCommand(createCanvasDocument('Many'), {
      kind: 'batch',
      operations: Array.from({ length: 25 }, (_, i) => ({
        kind: 'create',
        element: rectangle('shape-' + i),
      })),
    }).document
    for (let i = 25; i < 105; i++)
      document.elements.push({ ...document.elements[0], id: 'shape-' + i })
    const { bridge, owner, poll } = fixture(document)
    bridge.recordRead(owner.sessionId, [
      'invented',
      ...document.elements.map((element) => element.id),
    ])
    const first = poll().activity!
    expect(first.targetIds).toHaveLength(100)
    expect(first.targetIds).not.toContain('invented')
    bridge.recordRead(owner.sessionId, ['shape-104', 'shape-104'])
    expect(poll().activity).toMatchObject({ targetIds: ['shape-104'] })
    expect(poll().activity?.id).not.toBe(first.id)
  })

  it('keeps one event identity through working, success and identical retries', async () => {
    const { bridge, owner, poll } = fixture()
    const command: BridgeCommand = { kind: 'move', id: 'one', x: 25, y: 50 }
    const pending = bridge.mutate(owner.sessionId, 0, 'move', command)
    const working = poll().activity!
    expect(working).toMatchObject({
      kind: 'edit',
      id: `edit:${owner.sessionId}:move`,
      phase: 'working',
      targetIds: ['one', 'edge'],
    })
    const retry = bridge.mutate(owner.sessionId, 0, 'move', command)
    expect(poll().activity).toEqual(working)
    const changed = applyCanvasCommand(owner.document, command)
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'move',
        ok: true,
        revision: 1,
        affectedIds: [...changed.affectedIds, 'invented'],
      },
    })
    expect(reply.activity).toMatchObject({
      id: working.id,
      phase: 'complete',
      targetIds: ['one', 'edge'],
    })
    expect(await retry).toEqual(await pending)
    expect(
      await bridge.mutate(owner.sessionId, 0, 'move', command),
    ).toMatchObject({
      ok: true,
    })
    const repeatedAck = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'move',
        ok: true,
        revision: 1,
        affectedIds: ['two'],
      },
    })
    expect(repeatedAck.activity).toEqual(reply.activity)
  })

  it('does not replace observed work for preflight rejection, conflict or reused IDs', async () => {
    const { bridge, owner, poll } = fixture()
    bridge.read(owner.sessionId)
    const reading = poll().activity
    expect(() =>
      bridge.mutate(owner.sessionId, 0, 'missing', {
        kind: 'move',
        id: 'missing',
        x: 5,
        y: 5,
      }),
    ).toThrow()
    expect(poll().activity).toEqual(reading)
    expect(() =>
      bridge.mutate(owner.sessionId, 1, 'future', {
        kind: 'move',
        id: 'one',
        x: 5,
        y: 5,
      }),
    ).toThrow('current revision')
    expect(poll().activity).toEqual(reading)
    const pending = bridge.mutate(owner.sessionId, 0, 'pending', {
      kind: 'move',
      id: 'one',
      x: 5,
      y: 5,
    })
    const working = poll().activity
    expect(() =>
      bridge.mutate(owner.sessionId, 0, 'busy', {
        kind: 'move',
        id: 'two',
        x: 5,
        y: 5,
      }),
    ).toThrow('waiting for the browser')
    expect(() =>
      bridge.mutate(owner.sessionId, 0, 'pending', {
        kind: 'move',
        id: 'two',
        x: 5,
        y: 5,
      }),
    ).toThrow('identical retry')
    expect(poll().activity).toEqual(working)
    bridge.close()
    expect(await pending).toMatchObject({ ok: false })
  })

  it('clears rejected and manually invalidated working activity without success', async () => {
    const { bridge, owner } = fixture()
    const rejected = bridge.mutate(owner.sessionId, 0, 'reject', {
      kind: 'move',
      id: 'one',
      x: 5,
      y: 5,
    })
    expect(
      bridge.poll({
        ...owner,
        ack: { requestId: 'reject', ok: false, revision: 0, error: 'Busy.' },
      }).activity,
    ).toBeNull()
    expect(await rejected).toMatchObject({
      ok: false,
      error: { code: 'EDITOR_REJECTED' },
    })
    const stale = bridge.mutate(owner.sessionId, 0, 'stale', {
      kind: 'move',
      id: 'one',
      x: 5,
      y: 5,
    })
    const changed = applyCanvasCommand(owner.document, {
      kind: 'move',
      id: 'two',
      x: 9,
      y: 9,
    })
    expect(
      bridge.poll({ ...owner, revision: 1, document: changed.document })
        .activity,
    ).toBeNull()
    expect(await stale).toMatchObject({
      ok: false,
      error: { code: 'STALE_REVISION' },
    })
  })

  it('does not reanimate an expired retry and accepts a genuine late acknowledgment once', async () => {
    vi.useFakeTimers()
    const { bridge, owner, poll } = fixture(drawing(), 10)
    const command: BridgeCommand = { kind: 'move', id: 'one', x: 5, y: 5 }
    const pending = bridge.mutate(owner.sessionId, 0, 'late', command)
    const working = poll().activity!
    await vi.advanceTimersByTimeAsync(11)
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'NO_ACK' },
    })
    expect(poll().activity).toBeNull()
    await bridge.mutate(owner.sessionId, 0, 'late', command)
    expect(poll().activity).toBeNull()
    const changed = applyCanvasCommand(owner.document, command)
    const late = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'late',
        ok: true,
        revision: 1,
        affectedIds: changed.affectedIds,
      },
    })
    expect(late.activity).toMatchObject({ id: working.id, phase: 'complete' })
    expect(
      await bridge.mutate(owner.sessionId, 0, 'late', command),
    ).toMatchObject({ ok: true })
  })

  it('retains confirmed delete targets and resolves layer edits to their objects', async () => {
    const { bridge, owner, poll } = fixture()
    const pending = bridge.mutate(owner.sessionId, 0, 'remove', {
      kind: 'delete',
      id: 'one',
    })
    expect(poll().activity?.targetIds).toEqual(['one', 'edge'])
    const changed = applyCanvasCommand(owner.document, {
      kind: 'delete',
      id: 'one',
    })
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'remove',
        ok: true,
        revision: 1,
        affectedIds: changed.affectedIds,
      },
    })
    expect(reply.activity?.targetIds).toEqual(['one', 'edge'])
    await pending
    const layer = changed.document.layers[0].id
    const pendingLayer = bridge.mutate(owner.sessionId, 1, 'layer', {
      kind: 'update_layer',
      id: layer,
      patch: { name: 'Renamed' },
    })
    expect(
      bridge.poll({ ...owner, revision: 1, document: changed.document })
        .activity?.targetIds,
    ).toEqual(['two'])
    bridge.close()
    await pendingLayer
  })

  it('does not announce provisional generated IDs but announces explicit and confirmed creations', async () => {
    const { bridge, owner, poll } = fixture(createCanvasDocument('Empty'))
    const element = {
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    }
    const command: BridgeCommand = { kind: 'create', element }
    const pending = bridge.mutate(owner.sessionId, 0, 'create', command)
    expect(poll().activity?.targetIds).toEqual([])
    const actual = applyCanvasCommand(owner.document, command)
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: actual.document,
      ack: {
        requestId: 'create',
        ok: true,
        revision: 1,
        affectedIds: actual.affectedIds,
      },
    })
    expect(reply.activity?.targetIds).toEqual(actual.affectedIds)
    await pending
    const explicit = bridge.mutate(owner.sessionId, 1, 'explicit', {
      kind: 'create',
      element: rectangle('explicit'),
    })
    expect(
      bridge.poll({ ...owner, revision: 1, document: actual.document }).activity
        ?.targetIds,
    ).toEqual(['explicit'])
    bridge.close()
    await explicit
  })

  it('does not expose provisional creations through a batched layer edit', async () => {
    const { bridge, owner, poll } = fixture()
    const pending = bridge.mutate(owner.sessionId, 0, 'layer-and-create', {
      kind: 'batch',
      operations: [
        {
          kind: 'update_layer',
          id: owner.document.layers[0].id,
          patch: { name: 'Renamed' },
        },
        {
          kind: 'create',
          element: { type: 'rectangle', x: 200, y: 0, width: 100, height: 80 },
        },
      ],
    })
    expect(poll().activity?.targetIds).toEqual(['one', 'two', 'edge'])
    bridge.close()
    await pending
  })

  it('isolates working events even when independently shared canvases reuse an operation ID', async () => {
    const { bridge, owner, share, poll } = fixture()
    const other = share('other')
    const command: BridgeCommand = { kind: 'move', id: 'one', x: 5, y: 5 }
    const firstPending = bridge.mutate(owner.sessionId, 0, 'same', command)
    expect(bridge.poll(other).activity).toBeNull()
    const otherPending = bridge.mutate(other.sessionId, 0, 'same', command)
    const first = poll().activity!
    const second = bridge.poll(other).activity!
    expect(first.id).toBe(`edit:${owner.sessionId}:same`)
    expect(second.id).toBe(`edit:${other.sessionId}:same`)
    expect(second.id).not.toBe(first.id)
    bridge.poll({
      ...owner,
      ack: { requestId: 'same', ok: false, revision: 0 },
    })
    expect(poll().activity).toBeNull()
    expect(bridge.poll(other).activity).toEqual(second)
    bridge.close()
    await Promise.all([firstPending, otherPending])
  })

  it('does not clear a newer observed read when an older queued edit is rejected', async () => {
    const { bridge, owner, poll } = fixture()
    const pending = bridge.mutate(owner.sessionId, 0, 'old', {
      kind: 'move',
      id: 'one',
      x: 5,
      y: 5,
    })
    bridge.recordRead(owner.sessionId, ['two'])
    const newerRead = poll().activity
    const reply = bridge.poll({
      ...owner,
      ack: { requestId: 'old', ok: false, revision: 0 },
    })
    expect(reply.activity).toEqual(newerRead)
    await pending
  })

  it('keeps Undo targets unknown until the editor confirms the affected objects', async () => {
    const { bridge, owner, poll } = fixture()
    const pending = bridge.mutate(owner.sessionId, 0, 'undo', { kind: 'undo' })
    const working = poll().activity!
    expect(working.targetIds).toEqual([])
    const changed = applyCanvasCommand(owner.document, {
      kind: 'delete',
      id: 'two',
    })
    const reply = bridge.poll({
      ...owner,
      revision: 1,
      document: changed.document,
      ack: {
        requestId: 'undo',
        ok: true,
        revision: 1,
        affectedIds: changed.affectedIds,
      },
    })
    expect(reply.activity).toMatchObject({
      id: working.id,
      phase: 'complete',
      targetIds: ['two', 'edge'],
    })
    await pending
  })
})
