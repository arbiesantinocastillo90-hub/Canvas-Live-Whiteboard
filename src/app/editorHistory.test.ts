import { describe, expect, it } from 'vitest'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import { createElement, moveElement } from './canvasOperations'
import {
  commitEditorHistory,
  createEditorHistory,
  EDITOR_HISTORY_LIMIT,
  navigateEditorHistory,
  redoEditorContentHistory,
  redoEditorHistory,
  undoEditorHistory,
  undoEditorContentHistory,
} from './editorHistory'

describe('document transaction history', () => {
  it('keeps content undo and redo independent from persisted camera movement', () => {
    const initial = createCanvasDocument('Plan')
    const shape = createElement(initial, {
      type: 'rectangle',
      id: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    })
    let history = commitEditorHistory(createEditorHistory(initial), shape)
    const view = { x: -120, y: 80, zoom: 1.7 }
    history = navigateEditorHistory(history, view)
    expect(history.past).toHaveLength(1)
    history = undoEditorContentHistory(history)
    expect(history.present.elements).toHaveLength(0)
    expect(history.present.viewport).toEqual(view)
    const moved = { x: 300, y: 200, zoom: 0.8 }
    history = navigateEditorHistory(history, moved)
    expect(history.future).toHaveLength(1)
    history = redoEditorContentHistory(history)
    expect(history.present.elements).toHaveLength(1)
    expect(history.present.viewport).toEqual(moved)
  })
  it('restores complete content and view snapshots, then branches after a new edit', () => {
    const initial = createCanvasDocument('Plan')
    const shape = createElement(initial, {
      type: 'rectangle',
      id: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    })
    const moved = moveElement(shape, 'shape', 40, 80)
    const zoomed = { ...moved, viewport: { x: -10, y: -20, zoom: 2 } }
    const history = [shape, moved, zoomed].reduce(
      commitEditorHistory,
      createEditorHistory(initial),
    )
    expect(undoEditorHistory(history).present).toEqual(moved)
    const beforeMove = undoEditorHistory(undoEditorHistory(history))
    expect(beforeMove.present).toEqual(shape)
    expect(redoEditorHistory(beforeMove).present).toEqual(moved)
    const branch = commitEditorHistory(beforeMove, {
      ...shape,
      viewport: { x: 100, y: 0, zoom: 1 },
    })
    expect(branch.future).toEqual([])
    expect(redoEditorHistory(branch)).toBe(branch)
  })

  it('does not create history entries for unchanged documents', () => {
    const history = createEditorHistory(createCanvasDocument('Plan'))
    expect(commitEditorHistory(history, structuredClone(history.present))).toBe(
      history,
    )
    expect(undoEditorHistory(history)).toBe(history)
    expect(redoEditorHistory(history)).toBe(history)
  })

  it('retains at most 100 recent transactions', () => {
    let history = createEditorHistory(createCanvasDocument('Plan'))
    for (let index = 1; index <= 130; index++) {
      history = commitEditorHistory(history, {
        ...history.present,
        viewport: { x: index, y: 0, zoom: 1 },
      })
    }
    expect(history.past).toHaveLength(EDITOR_HISTORY_LIMIT)
    for (let index = 0; index < EDITOR_HISTORY_LIMIT; index++)
      history = undoEditorHistory(history)
    expect(history.present.viewport.x).toBe(30)
    expect(history.past).toEqual([])
    for (let index = 0; index < EDITOR_HISTORY_LIMIT; index++)
      history = redoEditorHistory(history)
    expect(history.present.viewport.x).toBe(130)
  })

  it('bounds memory estimates for large but supported board snapshots', () => {
    const document: CanvasDocument = {
      ...createCanvasDocument('Large'),
      elements: Array.from({ length: 400 }, (_, index) => ({
        id: `text-${index}`,
        type: 'text',
        x: index,
        y: 0,
        width: 100,
        height: 100,
        color: '#000000',
        layerId: 'layer-main',
        areaId: null,
        text: 'x'.repeat(20_000),
        fontSize: 20,
      })),
    }
    let history = createEditorHistory(document)
    for (let index = 1; index <= 5; index++)
      history = commitEditorHistory(history, {
        ...document,
        viewport: { x: index, y: 0, zoom: 1 },
      })
    expect(history.past.length).toBeLessThan(5)
    expect(history.past.length).toBeGreaterThan(0)
    expect(undoEditorHistory(history).present.viewport.x).toBe(4)
  })
})
