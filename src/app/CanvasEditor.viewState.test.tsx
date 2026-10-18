import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasEditor from './CanvasEditor'
import { createCanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'

describe('editor view state reporting', () => {
  it('reports initial state and different same-kind selections without changing document content', () => {
    let document = createCanvasDocument('View state')
    for (const id of ['a', 'b'])
      document = createElement(document, {
        type: 'rectangle',
        id,
        x: id === 'a' ? 20 : 220,
        y: 30,
        width: 180,
        height: 100,
      })
    const changed = vi.fn()
    const reported = vi.fn()
    const { container } = render(
      <CanvasEditor
        document={document}
        grid="dots"
        aiOpen={false}
        onToggleAI={() => {}}
        onDocumentChange={changed}
        onViewStateChange={reported}
      />,
    )
    expect(reported.mock.lastCall?.[0]).toMatchObject({
      viewport: document.viewport,
      selectedIds: [],
      tool: 'select',
      activeLayerId: 'layer-main',
    })
    const stage = screen.getByRole('region', { name: 'View state canvas view' })
    for (const id of ['a', 'b']) {
      fireEvent.pointerDown(
        container.querySelector(`[data-element-id="${id}"]`)!,
        { button: 0, clientX: 0, clientY: 0 },
      )
      fireEvent.pointerUp(stage, { clientX: 0, clientY: 0 })
      expect(reported.mock.lastCall?.[0].selectedIds).toEqual([id])
    }
    expect(changed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pan canvas' }))
    expect(reported.mock.lastCall?.[0].tool).toBe('pan')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(reported.mock.lastCall?.[0].viewport.zoom).toBeGreaterThan(1)
  })

  it('reports connection controls even when no document change occurs', () => {
    const reported = vi.fn()
    const changed = vi.fn()
    render(
      <CanvasEditor
        document={createCanvasDocument('Connections')}
        grid="none"
        aiOpen={false}
        onToggleAI={() => {}}
        onDocumentChange={changed}
        onViewStateChange={reported}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Connect objects' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'New connection arrows' }),
      { target: { value: 'both' } },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'New connection path' }),
      { target: { value: 'elbow' } },
    )
    expect(reported.mock.lastCall?.[0]).toMatchObject({
      tool: 'connect',
      connection: { arrowStyle: 'both', style: 'elbow' },
    })
    expect(changed).not.toHaveBeenCalled()
  })
})
