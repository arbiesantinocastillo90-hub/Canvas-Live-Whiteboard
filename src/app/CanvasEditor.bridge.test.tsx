/// <reference types="node" />

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasBridge } from '../../server/bridge'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { createElement } from './canvasOperations'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import useMcpBridge from './useMcpBridge'

const token = 'browser-pairing-code-for-tests-only'
type BrowserBridge = ReturnType<typeof useMcpBridge>
type Publication = {
  revision: number
  document: CanvasDocument
  ack?: { ok: boolean; revision: number; error?: string }
}

function fixture(contentRevisionOverride?: { value: unknown }) {
  const companion = new CanvasBridge()
  const initial = createElement(createCanvasDocument('Shared editor'), {
    id: 'manual-box',
    type: 'rectangle',
    x: 207.29,
    y: 524.59,
    width: 551.25,
    height: 487.29,
  })
  let currentBridge: BrowserBridge | null = null
  let currentController: CanvasEditorController | null = null
  let renderCount = 0
  let holdPoll = false
  let heldReply: (() => void) | null = null
  const publications: Publication[] = []
  const fetchMock = vi.fn((url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body))
    const reply = url.endsWith('/bridge/connect')
      ? companion.connect(body)
      : url.endsWith('/bridge/disconnect')
        ? companion.disconnect(body)
        : companion.poll(body)
    const wireReply = JSON.parse(JSON.stringify(reply))
    if (wireReply.command && contentRevisionOverride) {
      if (contentRevisionOverride.value === undefined)
        delete wireReply.command.expectedContentRevision
      else
        wireReply.command.expectedContentRevision =
          contentRevisionOverride.value
    }
    const response = new Response(JSON.stringify(wireReply), {
      headers: { 'Content-Type': 'application/json' },
    })
    if (url.endsWith('/bridge/poll')) {
      publications.push(body)
      if (holdPoll) {
        holdPoll = false
        return new Promise<Response>((resolve) => {
          heldReply = () => resolve(response)
        })
      }
    }
    return Promise.resolve(response)
  })
  vi.stubGlobal('fetch', fetchMock)

  function Host({ pulse }: { pulse: number }) {
    const [document, setDocument] = useState(initial)
    const controller = useRef<CanvasEditorController | null>(null)
    const getController = useCallback(() => controller.current, [])
    const registerController = useCallback(
      (ready: CanvasEditorController | null) => {
        controller.current = ready
        currentController = ready
      },
      [],
    )
    const bridge = useMcpBridge({
      projectId: 'project',
      fileId: 'file',
      projectName: 'Project',
      getController,
    })
    useLayoutEffect(() => {
      currentBridge = bridge
      renderCount++
    })
    return (
      <>
        <output aria-label="Parent render pulse">{pulse}</output>
        <output aria-label="Sharing status">{bridge.status}</output>
        <CanvasEditor
          document={document}
          grid="dots"
          aiOpen={false}
          onToggleAI={() => undefined}
          onDocumentChange={setDocument}
          onControllerReady={registerController}
        />
      </>
    )
  }

  const rendered = render(<Host pulse={0} />)
  function readyBridge() {
    if (!currentBridge) throw new Error('Bridge is unavailable.')
    return currentBridge
  }
  function readyController() {
    if (!currentController) throw new Error('Editor is unavailable.')
    return currentController
  }
  async function nextPoll() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
  }
  return {
    ...rendered,
    companion,
    publications,
    controller: readyController,
    bridge: readyBridge,
    renders: () => renderCount,
    nextPoll,
    async share() {
      await act(async () => {
        await readyBridge().share(token)
      })
    },
    holdNextPoll() {
      holdPoll = true
    },
    async releasePoll() {
      if (!heldReply) throw new Error('There is no held bridge response.')
      const release = heldReply
      heldReply = null
      await act(async () => release())
    },
    rerenderParent(pulse: number) {
      rendered.rerender(<Host pulse={pulse} />)
    },
    close() {
      rendered.unmount()
      companion.close()
    },
  }
}

const createCommand = {
  kind: 'create' as const,
  element: {
    type: 'rectangle' as const,
    id: 'ai-box',
    x: 850,
    y: 525,
    width: 250,
    height: 180,
  },
}

function stage() {
  return screen.getByRole('region', { name: 'Shared editor canvas view' })
}

function changeCamera() {
  fireEvent.pointerDown(stage(), { button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerUp(stage(), { clientX: 0, clientY: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  fireEvent.keyDown(stage(), { key: 'ArrowRight' })
}

describe('real editor and MCP bridge revision agreement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', MouseEvent)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('applies a queued create after manual zoom and idle parent/status rerenders', async () => {
    const test = fixture()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
      fireEvent.wheel(
        screen.getByRole('region', { name: 'Shared editor canvas view' }),
        { deltaY: Math.log(1 / 1.2 ** 2 / 0.67) / 0.002 },
      )
      expect(test.controller().getDocument().viewport.zoom).toBeCloseTo(0.67)
      await test.share()
      const beforeIdle = test.renders()
      await test.nextPoll()
      await test.nextPoll()
      test.rerenderParent(1)
      expect(test.renders()).toBeGreaterThan(beforeIdle)
      expect(test.publications.map((poll) => poll.revision)).toEqual([0, 0, 0])

      const shared = test.companion.read()
      const outcome = test.companion.mutate(
        shared.sessionId,
        shared.revision,
        'create-after-idle',
        createCommand,
      )
      test.holdNextPoll()
      await test.nextPoll()
      test.rerenderParent(2)
      test.rerenderParent(3)
      expect(test.controller().getDocument().elements).toHaveLength(1)
      await test.releasePoll()
      expect(test.controller().getDocument().elements).toHaveLength(2)
      expect(
        test.container.querySelector('[data-element-id="ai-box"] rect'),
      ).toHaveAttribute('x', '850')
      await test.nextPoll()
      expect(await outcome).toMatchObject({
        ok: true,
        revision: 1,
        affectedIds: ['ai-box'],
      })
      expect(test.publications.at(-1)).toMatchObject({
        revision: 1,
        ack: { ok: true, revision: 1 },
      })
      await test.nextPoll()
      expect(test.publications.at(-1)?.revision).toBe(1)
      expect(test.bridge().error).toBeNull()
    } finally {
      test.close()
    }
  })

  for (const command of [
    createCommand,
    {
      kind: 'update' as const,
      id: 'manual-box',
      patch: { text: 'AI edit', color: '#123456' },
    },
  ]) {
    it.each(['before-queue', 'before-poll', 'pending-reply'] as const)(
      `applies ${command.kind} across camera changes %s and preserves the latest viewport`,
      async (phase) => {
        const test = fixture()
        try {
          await test.share()
          const shared = test.companion.read()
          if (phase === 'before-queue') {
            changeCamera()
            await test.nextPoll()
          }
          const outcome = test.companion.mutate(
            shared.sessionId,
            shared.revision,
            `camera-${command.kind}-${phase}`,
            command,
          )
          if (phase === 'before-poll') changeCamera()
          if (phase === 'pending-reply') test.holdNextPoll()
          let viewport = { ...test.controller().getDocument().viewport }
          await test.nextPoll()
          if (phase === 'pending-reply') {
            changeCamera()
            viewport = { ...test.controller().getDocument().viewport }
          }
          if (phase === 'pending-reply') await test.releasePoll()
          const document = test.controller().getDocument()
          const id = command.kind === 'create' ? 'ai-box' : 'manual-box'
          expect(
            document.elements.find((element) => element.id === id),
          ).toMatchObject(
            command.kind === 'create'
              ? { x: 850, y: 525 }
              : { text: 'AI edit', color: '#123456' },
          )
          expect(document.viewport).toEqual(viewport)
          await test.nextPoll()
          expect(await outcome).toMatchObject({
            ok: true,
            revision: 2,
            affectedIds: [id],
          })
          expect(test.companion.read().document.viewport).toEqual(viewport)
          expect(test.publications.at(-1)).toMatchObject({
            revision: 2,
            ack: { ok: true, revision: 2 },
          })
          expect(test.bridge().error).toBeNull()
        } finally {
          test.close()
        }
      },
    )
  }

  it('rejects a genuinely stale queued create when a manual edit commits while its response is pending', async () => {
    const test = fixture()
    try {
      await test.share()
      const shared = test.companion.read()
      const outcome = test.companion.mutate(
        shared.sessionId,
        shared.revision,
        'create-during-manual-edit',
        createCommand,
      )
      test.holdNextPoll()
      await test.nextPoll()
      const box = test.container.querySelector(
        '[data-element-id="manual-box"]',
      )!
      fireEvent.pointerDown(box, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(stage(), { clientX: 40, clientY: 20 })
      fireEvent.pointerUp(stage(), { clientX: 40, clientY: 20 })
      await test.releasePoll()
      await test.nextPoll()
      expect(await outcome).toMatchObject({
        ok: false,
        error: {
          code: 'EDITOR_REJECTED',
          message: expect.stringMatching(/canvas changed/),
        },
      })
      expect(test.controller().getDocument().elements).toHaveLength(1)
      expect(test.controller().getDocument().elements[0]).toMatchObject({
        x: 247.29,
        y: 544.59,
      })
      expect(
        test.container.querySelector('[data-element-id="ai-box"]'),
      ).toBeNull()
      expect(test.publications.at(-1)).toMatchObject({
        revision: 1,
        ack: { ok: false, revision: 1 },
      })

      const fresh = test.companion.read()
      const recovered = test.companion.mutate(
        fresh.sessionId,
        fresh.revision,
        'create-after-fresh-read',
        createCommand,
      )
      await test.nextPoll()
      await test.nextPoll()
      expect(await recovered).toMatchObject({ ok: true, revision: 2 })
      expect(test.controller().getDocument().elements).toHaveLength(2)
      expect(test.bridge().error).toBeNull()
    } finally {
      test.close()
    }
  })

  it('keeps content revisions aligned after an AI edit and a camera change before its acknowledgment publication', async () => {
    const test = fixture()
    try {
      await test.share()
      const shared = test.companion.read()
      const created = test.companion.mutate(
        shared.sessionId,
        shared.revision,
        'create-before-camera-ack',
        createCommand,
      )
      await test.nextPoll()
      expect(test.controller().getDocument().elements).toHaveLength(2)
      changeCamera()
      const viewport = { ...test.controller().getDocument().viewport }
      await test.nextPoll()
      expect(await created).toMatchObject({ ok: true, revision: 2 })
      const fresh = test.companion.read()
      expect(fresh.contentRevision).toBe(1)
      const updated = test.companion.mutate(
        fresh.sessionId,
        fresh.revision,
        'update-after-camera-ack',
        { kind: 'update', id: 'ai-box', patch: { text: 'Second AI edit' } },
      )
      await test.nextPoll()
      await test.nextPoll()
      expect(await updated).toMatchObject({ ok: true, revision: 3 })
      expect(test.controller().getDocument().elements.at(-1)).toMatchObject({
        id: 'ai-box',
        text: 'Second AI edit',
      })
      expect(test.controller().getDocument().viewport).toEqual(viewport)
      expect(test.companion.read().contentRevision).toBe(3)
    } finally {
      test.close()
    }
  })

  it('recovers after a content conflict followed by a camera change before publishing the rejection', async () => {
    const test = fixture()
    try {
      await test.share()
      const shared = test.companion.read()
      const stale = test.companion.mutate(
        shared.sessionId,
        shared.revision,
        'conflict-before-camera-ack',
        createCommand,
      )
      test.holdNextPoll()
      await test.nextPoll()
      const box = test.container.querySelector(
        '[data-element-id="manual-box"]',
      )!
      fireEvent.pointerDown(box, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(stage(), { clientX: 40, clientY: 20 })
      fireEvent.pointerUp(stage(), { clientX: 40, clientY: 20 })
      await test.releasePoll()
      changeCamera()
      const viewport = { ...test.controller().getDocument().viewport }
      await test.nextPoll()
      expect(await stale).toMatchObject({
        ok: false,
        error: { code: 'EDITOR_REJECTED' },
      })
      const fresh = test.companion.read()
      expect(fresh).toMatchObject({ revision: 2, contentRevision: 1 })
      const recovered = test.companion.mutate(
        fresh.sessionId,
        fresh.revision,
        'recover-after-camera-ack',
        createCommand,
      )
      await test.nextPoll()
      await test.nextPoll()
      expect(await recovered).toMatchObject({ ok: true, revision: 3 })
      expect(test.controller().getDocument().elements).toHaveLength(2)
      expect(test.controller().getDocument().elements[0]).toMatchObject({
        x: 247.29,
        y: 544.59,
      })
      expect(test.controller().getDocument().viewport).toEqual(viewport)
    } finally {
      test.close()
    }
  })

  it.each(['undo', 'redo'] as const)(
    'rejects queued %s when a camera change commits during its response',
    async (kind) => {
      const test = fixture()
      try {
        changeCamera()
        if (kind === 'redo')
          fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        await test.share()
        const shared = test.companion.read()
        const outcome = test.companion.mutate(
          shared.sessionId,
          shared.revision,
          `history-${kind}`,
          { kind },
        )
        test.holdNextPoll()
        await test.nextPoll()
        changeCamera()
        const viewport = { ...test.controller().getDocument().viewport }
        await test.releasePoll()
        await test.nextPoll()
        expect(await outcome).toMatchObject({
          ok: false,
          error: {
            code: 'EDITOR_REJECTED',
            message: expect.stringMatching(/canvas changed/),
          },
        })
        expect(test.controller().getDocument().viewport).toEqual(viewport)
        expect(test.controller().getDocument().elements).toHaveLength(1)
      } finally {
        test.close()
      }
    },
  )

  it.each([
    { label: 'missing', value: undefined, camera: true },
    { label: 'non-numeric', value: '0', camera: true },
    { label: 'mismatched', value: 99, camera: false },
  ])(
    'rejects a queued edit with $label content revision metadata',
    async ({ value, camera }) => {
      const test = fixture({ value })
      try {
        await test.share()
        const shared = test.companion.read()
        const outcome = test.companion.mutate(
          shared.sessionId,
          shared.revision,
          'invalid-content-revision',
          createCommand,
        )
        test.holdNextPoll()
        await test.nextPoll()
        if (camera) changeCamera()
        await test.releasePoll()
        await test.nextPoll()
        expect(await outcome).toMatchObject({
          ok: false,
          error: { code: 'EDITOR_REJECTED' },
        })
        expect(test.controller().getDocument().elements).toHaveLength(1)
      } finally {
        test.close()
      }
    },
  )
})
