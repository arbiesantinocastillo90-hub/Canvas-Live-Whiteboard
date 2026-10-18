import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, {
  type CanvasEditorController,
  type CanvasEditorProps,
} from './CanvasEditor'
import CanvasThumbnail from './CanvasThumbnail'
import {
  addLayer,
  assignElementArea,
  createElement,
  orderedVisibleElements,
  reorderLayer,
} from './canvasOperations'
import { DEFAULT_CANVAS_CONTROLS } from './canvasControls'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'

function fixture() {
  // Deliberately create the area last, as a user would around existing objects.
  let document = createElement(createCanvasDocument('Areas'), {
    id: 'inside',
    type: 'rectangle',
    x: 140,
    y: 130,
    width: 60,
    height: 50,
    text: 'Inside',
  })
  document = createElement(document, {
    id: 'area',
    type: 'area',
    x: 100,
    y: 80,
    width: 300,
    height: 220,
    fill: '#445566',
    name: 'Planning area',
  })
  return document
}

function mount(document = fixture(), props: Partial<CanvasEditorProps> = {}) {
  let controller: CanvasEditorController | null = null
  const changed = vi.fn()
  const view = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={vi.fn()}
      onDocumentChange={changed}
      onControllerReady={(value) => {
        controller = value
      }}
      {...props}
    />,
  )
  const stage = screen.getByRole('region', { name: 'Areas canvas view' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 610,
    bottom: 420,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  })
  const object = (id: string) =>
    view.container.querySelector(`[data-element-id="${id}"]`)!
  const point = (x: number, y: number) => ({
    clientX: 10 + document.viewport.x + x * document.viewport.zoom,
    clientY: 20 + document.viewport.y + y * document.viewport.zoom,
  })
  const drag = (
    target: Element,
    from: [number, number],
    to: [number, number],
  ) => {
    fireEvent.pointerDown(target, { button: 0, ...point(...from) })
    fireEvent.pointerMove(stage, point(...to))
    fireEvent.pointerUp(stage, point(...to))
  }
  return {
    ...view,
    stage,
    object,
    point,
    drag,
    changed,
    current: () => controller!.getDocument(),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('PointerEvent', MouseEvent)
})

describe('area border interactions', () => {
  it.each([0.25, 1, 4])(
    'uses an unfilled 8 screen pixel border hit target at %sx zoom and makes its visual fill and title inert',
    (zoom) => {
      const document = { ...fixture(), viewport: { x: 30, y: -20, zoom } }
      const test = mount(document)
      const area = test.object('area')
      const border = area.querySelector('[data-area-border-hit]')!
      expect(border).toHaveAttribute('fill', 'none')
      expect(border).toHaveAttribute('stroke', 'transparent')
      expect(border).toHaveAttribute('stroke-width', '8')
      expect(border).toHaveAttribute('vector-effect', 'non-scaling-stroke')
      expect(border).toHaveAttribute('pointer-events', 'stroke')
      expect(area.querySelector('g')).toHaveAttribute('pointer-events', 'none')
      expect(area.querySelector('text')).toHaveAttribute(
        'pointer-events',
        'none',
      )
      expect(
        test.object('inside').querySelector('.canvas-object-hit'),
      ).toHaveAttribute('fill', 'transparent')
    },
  )

  it('selects and moves an area from its border with legacy members once, and Undo restores the whole move', () => {
    const original = assignElementArea(fixture(), 'inside', 'area')
    const test = mount(original)
    test.drag(
      test.object('area').querySelector('[data-area-border-hit]')!,
      [100, 200],
      [130, 220],
    )
    expect(test.object('area')).toHaveAttribute('aria-pressed', 'true')
    expect(
      test.current().elements.find((element) => element.id === 'area'),
    ).toMatchObject({
      x: 130,
      y: 100,
    })
    expect(
      test.current().elements.find((element) => element.id === 'inside'),
    ).toMatchObject({
      x: 170,
      y: 150,
      areaId: 'area',
    })
    expect(test.changed).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current()).toEqual(original)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('keeps shape selection and blank-canvas actions available inside an area', () => {
    const test = mount()
    test.drag(test.object('inside'), [160, 150], [160, 150])
    expect(test.object('inside')).toHaveAttribute('aria-pressed', 'true')
    expect(test.object('area')).toHaveAttribute('aria-pressed', 'false')
    test.drag(test.stage, [300, 200], [300, 200])
    expect(test.stage).toHaveAttribute('data-selection-count', '0')
    fireEvent.contextMenu(test.stage, test.point(300, 200))
    expect(screen.getByRole('dialog', { name: 'Add to canvas' })).toBeVisible()
    expect(test.changed).not.toHaveBeenCalled()
  })

  it('opens area quick properties from the border while its resize and connection controls remain available', () => {
    const test = mount()
    const border = test.object('area').querySelector('[data-area-border-hit]')!
    test.drag(border, [100, 200], [100, 200])
    expect(
      screen.getByRole('button', { name: 'Resize selected object right' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Connect from bottom' }),
    ).toBeInTheDocument()
    fireEvent.contextMenu(border, test.point(100, 200))
    expect(
      within(
        screen.getByRole('dialog', { name: 'Quick object properties' }),
      ).getByText('Area', { exact: true }),
    ).toBeVisible()
  })

  const borders = [
    ['left', [80, 130], [110, 160]],
    ['right', [390, 130], [420, 160]],
    ['top', [220, 60], [250, 100]],
    ['bottom', [220, 280], [250, 320]],
    ['all', [80, 60], [420, 320]],
  ] as const
  for (const selectionBehavior of ['contain', 'intersect'] as const) {
    it.each(borders)(
      `selects an area when the %s border crosses the marquee in ${selectionBehavior} mode`,
      (_side, from, to) => {
        const test = mount(fixture(), {
          controlOptions: { ...DEFAULT_CANVAS_CONTROLS, selectionBehavior },
        })
        test.drag(test.stage, [...from], [...to])
        expect(test.object('area')).toHaveAttribute('aria-pressed', 'true')
        expect(test.changed).not.toHaveBeenCalled()
      },
    )
    it(`excludes an area from a marquee entirely inside it in ${selectionBehavior} mode`, () => {
      const test = mount(fixture(), {
        controlOptions: { ...DEFAULT_CANVAS_CONTROLS, selectionBehavior },
      })
      test.drag(test.stage, [130, 110], [240, 230])
      expect(test.object('area')).toHaveAttribute('aria-pressed', 'false')
      expect(test.object('inside')).toHaveAttribute('aria-pressed', 'true')
      expect(test.changed).not.toHaveBeenCalled()
    })
  }
})

describe('areas stay behind objects within their own layer', () => {
  function layered() {
    let document = addLayer(fixture(), 'Front', 'front')
    document = createElement(document, {
      id: 'front-object',
      type: 'diamond',
      x: 200,
      y: 150,
      width: 80,
      height: 80,
      text: 'Front object',
      layerId: 'front',
    })
    return createElement(document, {
      id: 'front-area',
      type: 'area',
      x: 120,
      y: 100,
      width: 300,
      height: 220,
      name: 'Front area',
      layerId: 'front',
    })
  }
  it('orders late-created areas behind their layer siblings and keeps the layer stack authoritative', () => {
    const document = layered()
    const ids = (board: CanvasDocument) =>
      orderedVisibleElements(board).map((element) => element.id)
    expect(ids(document)).toEqual([
      'area',
      'inside',
      'front-area',
      'front-object',
    ])
    expect(ids(reorderLayer(document, 'front', 0))).toEqual([
      'front-area',
      'front-object',
      'area',
      'inside',
    ])
  })
  it('uses the same order in the interactive drawing and home thumbnail', () => {
    const document = layered()
    const test = mount(document)
    expect(
      [...test.container.querySelectorAll('[data-element-id]')].map((element) =>
        element.getAttribute('data-element-id'),
      ),
    ).toEqual(['area', 'inside', 'front-area', 'front-object'])
    const thumbnail = render(<CanvasThumbnail document={document} />)
    expect(
      [...thumbnail.container.querySelectorAll('[data-thumbnail-object]')].map(
        (element) => element.getAttribute('data-thumbnail-object'),
      ),
    ).toEqual(['area', 'rectangle', 'area', 'diamond'])
  })
})
