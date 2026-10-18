import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  connectElements,
  createElement,
  reverseConnection,
  updateElement,
} from './canvasOperations'
import {
  connectionEndpoints,
  connectionPath,
  createCanvasDocument,
  elementBounds,
  parseLCANVAS,
  serializeLCANVAS,
  SHAPE_TYPES,
  validEmbedSource,
  type CanvasDocument,
  type EmbedElement,
  type ShapeElement,
} from './lcanvas'
import { canvasTextPlacement, layoutCanvasText } from './canvasText'
import { newElementSchema, elementPatchSchema } from '../mcp/canvasCommands'
import { CanvasObjectText, ConnectionDrawing, ShapeOutline } from './RichObject'
import EmbedObject from './EmbedObject'

function twoShapes(): CanvasDocument {
  let board = createCanvasDocument('Rich canvas')
  board = createElement(board, {
    type: 'triangle',
    id: 'a',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    text: 'Hello',
  })
  return createElement(board, {
    type: 'hexagon',
    id: 'b',
    x: 400,
    y: 0,
    width: 200,
    height: 200,
  })
}
const media: EmbedElement = {
  type: 'embed',
  id: 'media',
  kind: 'web',
  src: 'https://example.com/content',
  title: 'Reference',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  color: '#123456',
  layerId: 'layer-main',
  areaId: null,
  paused: false,
  minimized: false,
}

describe('rich canvas documents and rendering', () => {
  it.each(SHAPE_TYPES)(
    'round trips and draws %s while keeping text plain',
    (type) => {
      const board = createElement(createCanvasDocument('Shapes'), {
        type,
        x: 10,
        y: 20,
        width: 200,
        height: 180,
        text: '<script>literal</script>',
        textAlign: 'right',
        verticalAlign: 'bottom',
        fontFamily: 'serif',
        fontWeight: 'bold',
        fontStyle: 'italic',
        textColor: '#ff2200',
      })
      expect(parseLCANVAS(serializeLCANVAS(board))).toEqual(board)
      const element = board.elements[0] as ShapeElement
      const view = render(
        <svg>
          <ShapeOutline element={element} />
          <CanvasObjectText element={element} prefix={type} />
        </svg>,
      )
      expect(view.container.querySelector('script')).toBeNull()
      expect(view.container.querySelector('text')).toHaveAttribute(
        'text-anchor',
        'end',
      )
      expect(view.container.querySelector('text')).toHaveAttribute(
        'fill',
        '#ff2200',
      )
      expect(view.container.querySelector('text')).toHaveAttribute(
        'font-weight',
        'bold',
      )
    },
  )
  it('positions formatted text at the requested box edges', () => {
    const element = {
      ...twoShapes().elements[0],
      textAlign: 'right',
      verticalAlign: 'bottom',
    } as ShapeElement
    const layout = layoutCanvasText(element)
    const placement = canvasTextPlacement(element, layout)
    expect(placement.x).toBe(layout.box.x + layout.box.width)
    expect(placement.y).toBe(
      layout.box.y + Math.max(0, layout.box.height - layout.height),
    )
  })
  it('connects the drawn polygon boundary and retains rich markers when reversed', () => {
    const board = connectElements(twoShapes(), 'a', 'b', {
      id: 'link',
      style: 'curve',
      fromSide: 'right',
      toSide: 'left',
      linePattern: 'dotted',
      endPointer: 'diamond',
    })
    const link = board.elements.at(-1)!
    if (link.type !== 'connection') throw new Error('Missing connection')
    expect(connectionEndpoints(board, link)).toEqual({
      x1: 150,
      y1: 100,
      x2: 400,
      y2: 100,
    })
    expect(connectionPath(board, link)).toContain(' C ')
    const reversed = reverseConnection(board, 'link').elements.at(-1)!
    expect(reversed).toMatchObject({
      fromId: 'b',
      toId: 'a',
      fromSide: 'left',
      toSide: 'right',
      endPointer: 'diamond',
      endArrow: true,
    })
    const view = render(
      <svg>
        <ConnectionDrawing
          document={board}
          element={link}
          prefix="relationship"
        />
      </svg>,
    )
    expect(
      view.container.querySelector('[data-connection-path]'),
    ).toHaveAttribute('stroke-dasharray', '1 5')
    expect(
      view.container.querySelector('[data-connection-path]'),
    ).toHaveAttribute('marker-end', 'url(#relationship-end)')
  })
  it('reverses older v2 connections that omitted side fields', () => {
    const board = connectElements(twoShapes(), 'a', 'b', { id: 'link' })
    const link = board.elements.at(-1)!
    if (link.type !== 'connection') throw new Error('Missing connection')
    delete link.fromSide
    delete link.toSide
    expect(() => reverseConnection(board, 'link')).not.toThrow()
    expect(reverseConnection(board, 'link').elements.at(-1)).toMatchObject({
      fromSide: 'left',
      toSide: 'right',
    })
  })
  it('validates new MCP fields and rejects unrecognized or type-inappropriate patches', () => {
    expect(
      newElementSchema.safeParse({
        type: 'star',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        textAlign: 'left',
        fontFamily: 'mono',
      }).success,
    ).toBe(true)
    expect(
      newElementSchema.safeParse({
        type: 'embed',
        kind: 'web',
        src: 'javascript:alert(1)',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      }).success,
    ).toBe(false)
    expect(
      elementPatchSchema.safeParse({
        style: 'curve',
        endPointer: 'circle',
        linePattern: 'dashed',
      }).success,
    ).toBe(true)
    expect(
      elementPatchSchema.safeParse({ fontFamily: 'external-font-url' }).success,
    ).toBe(false)
    expect(() =>
      updateElement(twoShapes(), 'a', { endPointer: 'circle' }),
    ).toThrow('unsupported object fields')
  })
  it('rejects invalid rich text values and extra embed fields', () => {
    const board = twoShapes()
    expect(() => updateElement(board, 'a', { textColor: 'red' })).toThrow()
    expect(() =>
      createElement(board, {
        ...media,
        src: 'https://user:password@example.com/',
      }),
    ).toThrow()
    expect(() =>
      parseLCANVAS(
        JSON.stringify({
          ...board,
          elements: [{ ...media, executable: true }],
        }),
      ),
    ).toThrow()
    expect(() =>
      createElement(board, {
        ...media,
        kind: 'video',
        src: `media:${'a'.repeat(64)}`,
      }),
    ).not.toThrow()
  })
})

describe('interactive media lifecycle', () => {
  it('collapses an embed hit area and attachment boundary while retaining its full saved height for restore', () => {
    let board = createElement(createCanvasDocument('Collapsed embed'), {
      ...media,
      x: 0,
      y: 0,
      width: 200,
      height: 260,
      minimized: true,
    })
    board = createElement(board, {
      id: 'target',
      type: 'rectangle',
      x: 400,
      y: 0,
      width: 200,
      height: 100,
    })
    board = connectElements(board, 'media', 'target', {
      id: 'link',
      fromSide: 'right',
      toSide: 'left',
    })
    const embed = board.elements[0],
      link = board.elements[2]
    if (link.type !== 'connection') throw new Error('Missing link')
    expect(elementBounds(board, embed)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 38,
    })
    expect(connectionEndpoints(board, link)).toEqual({
      x1: 200,
      y1: 19,
      x2: 400,
      y2: 50,
    })
    expect(parseLCANVAS(serializeLCANVAS(board)).elements[0]).toMatchObject({
      height: 260,
      minimized: true,
    })
    const restored = updateElement(board, 'media', { minimized: false })
    expect(elementBounds(restored, restored.elements[0]).height).toBe(260)
    expect(connectionEndpoints(restored, link).y1).toBe(130)
    const view = render(
      <svg>
        <EmbedObject
          element={{ ...media, height: 260, minimized: true }}
          interactive={false}
        />
      </svg>,
    )
    expect(view.container.querySelector('rect')).toHaveAttribute('height', '38')
  })
  it('offers a safe separate viewer while paused and rejects unsafe resolver links', () => {
    const view = render(
      <svg>
        <EmbedObject element={{ ...media, paused: true }} />
      </svg>,
    )
    expect(
      screen.getByRole('link', { name: 'Open Reference separately' }),
    ).toHaveAttribute('href', media.src)
    expect(screen.getByRole('link')).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
    const local = { ...media, src: `media:${'a'.repeat(64)}` }
    view.rerender(
      <svg>
        <EmbedObject
          element={local}
          resolveMedia={() => 'javascript:alert(1)'}
        />
      </svg>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(view.container.querySelector('iframe')).toBeNull()
  })
  it.each([
    'javascript:alert(1)',
    'file:///C:/private.txt',
    'http://example.com/',
    'https://user:password@example.com/',
    'data:text/html,test',
    'media:abc',
  ])('rejects unsafe embed source %s', (src) =>
    expect(validEmbedSource(src)).toBe(false),
  )
  it('unmounts a live iframe on pause and minimize and offers top-left controls', () => {
    const patch = vi.fn()
    const view = render(
      <svg>
        <EmbedObject element={media} onPatch={patch} />
      </svg>,
    )
    expect(view.container.querySelector('iframe')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-popups allow-presentation',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pause Reference' }))
    expect(patch).toHaveBeenLastCalledWith({ paused: true })
    view.rerender(
      <svg>
        <EmbedObject element={{ ...media, paused: true }} onPatch={patch} />
      </svg>,
    )
    expect(view.container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Reference' }))
    expect(patch).toHaveBeenLastCalledWith({ paused: false })
    view.rerender(
      <svg>
        <EmbedObject element={{ ...media, minimized: true }} onPatch={patch} />
      </svg>,
    )
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Expand Reference' }),
    ).toBeVisible()
  })
  it('keeps previews inert and media references within their own library resolver', () => {
    const view = render(
      <svg>
        <EmbedObject element={media} interactive={false} />
      </svg>,
    )
    expect(
      view.container.querySelector('iframe, img, video, audio, foreignObject'),
    ).toBeNull()
    const local = {
      ...media,
      kind: 'image' as const,
      src: `media:${'a'.repeat(64)}`,
    }
    view.rerender(
      <svg>
        <EmbedObject element={local} resolveMedia={() => undefined} />
      </svg>,
    )
    expect(view.container.querySelector('img')).toBeNull()
    view.rerender(
      <svg>
        <EmbedObject
          element={local}
          resolveMedia={() => 'blob:owned-library-image'}
        />
      </svg>,
    )
    expect(view.container.querySelector('img')).toHaveAttribute(
      'src',
      'blob:owned-library-image',
    )
  })
  it('moves only from the title bar while content selection leaves players interactive', () => {
    const move = vi.fn(),
      select = vi.fn()
    const view = render(
      <svg>
        <EmbedObject
          element={media}
          onMove={move}
          onSelect={select}
          onPatch={vi.fn()}
        />
      </svg>,
    )
    fireEvent.pointerDown(
      view.container.querySelector('.canvas-embed-bar span')!,
    )
    expect(move).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(
      view.container.querySelector('.canvas-embed-content')!,
    )
    expect(move).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(2)
  })
})
