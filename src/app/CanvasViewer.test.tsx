import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasViewer from './CanvasViewer'
import { createElement, updateLayer } from './canvasOperations'
import {
  createCanvasDocument,
  DEFAULT_LAYER_ID,
  type CanvasDocument,
} from './lcanvas'

const bounds = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 600,
  bottom: 400,
  width: 600,
  height: 400,
  toJSON: () => ({}),
}

function mount(document = createCanvasDocument('Roadmap')) {
  const onViewportChange = vi.fn()
  const onToggleAI = vi.fn()
  const rendered = render(
    <CanvasViewer
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={onToggleAI}
      onViewportChange={onViewportChange}
    />,
  )
  const stage = screen.getByRole('region', { name: 'Roadmap canvas view' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(bounds)
  return { ...rendered, stage, onViewportChange, onToggleAI }
}

describe('LCANVAS viewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom has MouseEvent geometry but no PointerEvent constructor.
    vi.stubGlobal('PointerEvent', MouseEvent)
  })

  it('honors layer visibility when rendering and fitting version 2 documents', () => {
    const document = createElement(createCanvasDocument('Roadmap'), {
      type: 'diamond',
      id: 'hidden-diamond',
      x: 5000,
      y: 5000,
      width: 100,
      height: 100,
    })
    const hidden = updateLayer(document, DEFAULT_LAYER_ID, { visible: false })
    const { container, onViewportChange } = mount(hidden)
    expect(
      screen.getByRole('img', { name: 'Roadmap: 0 objects' }),
    ).toBeInTheDocument()
    expect(container.querySelector('polygon')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it('keeps view controls present while the AI panel is closed', () => {
    const { onToggleAI, rerender } = mount()
    const open = screen.getByRole('button', { name: 'Open AI workspace panel' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    for (const name of [
      'Undo view',
      'Reset view',
      'Redo view',
      'Zoom in',
      'Zoom out',
    ])
      expect(screen.getByRole('button', { name })).toBeVisible()
    fireEvent.click(open)
    expect(onToggleAI).toHaveBeenCalledOnce()
    rerender(
      <CanvasViewer
        document={createCanvasDocument('Roadmap')}
        grid="none"
        aiOpen
        onToggleAI={onToggleAI}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Close AI workspace panel' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible()
  })

  it('zooms, undoes, redoes, resets and supports keyboard navigation', () => {
    const { stage, onViewportChange } = mount()
    expect(screen.getByRole('button', { name: 'Undo view' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('120%')
    fireEvent.click(screen.getByRole('button', { name: 'Undo view' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Redo view' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('120%')
    fireEvent.keyDown(stage, { key: '0' })
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('100%')
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: -60, y: 0, zoom: 1 })
    fireEvent.keyDown(stage, { key: 'z', ctrlKey: true })
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 })
    fireEvent.keyDown(stage, { key: 'y', ctrlKey: true })
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: -60, y: 0, zoom: 1 })
  })

  it('records a completed drag as one undo step and cancels unfinished drags', () => {
    const { stage, onViewportChange } = mount()
    fireEvent.pointerDown(stage, { button: 0, clientX: 50, clientY: 70 })
    fireEvent.pointerMove(stage, { clientX: 60, clientY: 80 })
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 100 })
    expect(onViewportChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(stage, { clientX: 90, clientY: 100 })
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 40, y: 30, zoom: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo view' }))
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 })
    expect(screen.getByRole('button', { name: 'Undo view' })).toBeDisabled()
    fireEvent.pointerDown(stage, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100 })
    fireEvent.pointerCancel(stage)
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 })
    expect(screen.getByRole('button', { name: 'Undo view' })).toBeDisabled()
  })

  it('anchors wheel zoom under the pointer and prevents page scroll', () => {
    const { stage, onViewportChange } = mount()
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 100,
      deltaY: -100,
    })
    fireEvent(stage, event)
    expect(event.defaultPrevented).toBe(true)
    const viewport = onViewportChange.mock.lastCall?.[0]
    expect(viewport.zoom).toBeGreaterThan(1)
    expect((200 - viewport.x) / viewport.zoom).toBeCloseTo(200)
    expect((100 - viewport.y) / viewport.zoom).toBeCloseTo(100)
  })

  it('does not mark an unchanged or cancelled view as changed', () => {
    const { stage, onViewportChange } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    fireEvent.keyDown(stage, { key: 'z', ctrlKey: true })
    expect(onViewportChange).not.toHaveBeenCalled()
    fireEvent.pointerDown(stage, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100 })
    fireEvent.pointerCancel(stage)
    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it('renders only SVG geometry and literal text, using safe generated clip IDs', () => {
    const document: CanvasDocument = {
      ...createCanvasDocument('Roadmap'),
      elements: [
        {
          id: 'box',
          type: 'rectangle',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          text: '',
          fontSize: 18,
          x: 10,
          y: 10,
          width: 80,
          height: 50,
          color: '#334455',
          fill: '#FFFFFF',
        },
        {
          id: 'ellipse',
          type: 'ellipse',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          text: '',
          fontSize: 18,
          x: 100,
          y: 10,
          width: 60,
          height: 50,
          color: '#334455',
          fill: null,
        },
        {
          id: 'line',
          type: 'line',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          x: 50,
          y: 50,
          x2: 120,
          y2: 40,
          color: '#334455',
        },
        {
          id: 'punctuation ) "',
          type: 'text',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          x: 0,
          y: 90,
          width: 200,
          height: 100,
          text: '<script>alert(1)</script>\nhttps://example.com',
          color: '#334455',
          fontSize: 18,
        },
      ],
    }
    const { container } = mount(document)
    const literalText = Array.from(container.querySelectorAll('text')).find(
      (text) => text.getAttribute('aria-label')?.startsWith('<script>'),
    )
    expect(literalText?.getAttribute('aria-label')).toBe(
      '<script>alert(1)</script>\nhttps://example.com',
    )
    expect(literalText?.textContent).toBe(
      '<script>alert(1)</script>https://example.com',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('foreignObject')).toBeNull()
    expect(container.querySelector('clipPath')?.id).toMatch(/^[\w-]+$/)
    expect(container.querySelector('text')).toHaveAttribute(
      'clip-path',
      `url(#${container.querySelector('clipPath')?.id})`,
    )
    expect(
      screen.getByRole('img', { name: 'Roadmap: 4 objects' }),
    ).toBeInTheDocument()
  })

  it('fits imported contents and honors the 10–400% bounds', () => {
    const document: CanvasDocument = {
      ...createCanvasDocument('Roadmap'),
      viewport: { x: 0, y: 0, zoom: 4 },
      elements: [
        {
          id: 'box',
          type: 'rectangle',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          text: '',
          fontSize: 18,
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          color: '#000000',
          fill: null,
        },
      ],
    }
    const { stage, onViewportChange } = mount(document)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(onViewportChange.mock.lastCall?.[0].zoom).toBeCloseTo(1.52)
    for (let i = 0; i < 35; i++) fireEvent.keyDown(stage, { key: '-' })
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('10%')
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  })

  it('fits objects in the visible stage area when the AI panel covers the right side', () => {
    const document: CanvasDocument = {
      ...createCanvasDocument('Roadmap'),
      elements: [
        {
          id: 'box',
          type: 'rectangle',
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          text: '',
          fontSize: 18,
          x: 100,
          y: -50,
          width: 300,
          height: 200,
          color: '#000000',
          fill: null,
        },
      ],
    }
    const onViewportChange = vi.fn()
    const { container } = render(
      <CanvasViewer
        document={document}
        grid="dots"
        aiOpen
        rightInset={260}
        onToggleAI={vi.fn()}
        onViewportChange={onViewportChange}
      />,
    )
    const stage = screen.getByRole('region', { name: 'Roadmap canvas view' })
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(bounds)
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    const viewport = onViewportChange.mock.lastCall?.[0]
    const visibleWidth = bounds.width - 260
    expect(100 * viewport.zoom + viewport.x).toBeCloseTo(48)
    expect(400 * viewport.zoom + viewport.x).toBeCloseTo(visibleWidth - 48)
    expect(-50 * viewport.zoom + viewport.y).toBeGreaterThanOrEqual(48)
    expect(150 * viewport.zoom + viewport.y).toBeLessThanOrEqual(
      bounds.height - 48,
    )
    expect(container.querySelector('.lcanvas-drawing > g')).toHaveAttribute(
      'transform',
      `translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`,
    )
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible()
  })
})
