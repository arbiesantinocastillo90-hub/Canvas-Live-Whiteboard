import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CanvasThumbnail from './CanvasThumbnail'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'

describe('canvas content thumbnails', () => {
  it('shows shapes, areas, connections and plain text while omitting hidden layers and camera movement', () => {
    const document: CanvasDocument = {
      ...createCanvasDocument('Preview'),
      viewport: { x: -9000, y: 50000, zoom: 4 },
      layers: [
        { id: 'main', name: 'Main', visible: true, locked: false },
        { id: 'hidden', name: 'Hidden', visible: false, locked: false },
      ],
      elements: [
        {
          id: 'a',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          color: '#00AABB',
          fill: '#121212',
          text: '<script>unsafe()</script>',
          fontSize: 20,
          layerId: 'main',
          areaId: null,
        },
        {
          id: 'b',
          type: 'diamond',
          x: 300,
          y: 200,
          width: 80,
          height: 120,
          color: '#AABBCC',
          fill: null,
          text: 'Decision',
          fontSize: 20,
          layerId: 'main',
          areaId: null,
        },
        {
          id: 'c',
          type: 'connection',
          fromId: 'a',
          toId: 'b',
          color: '#FFFFFF',
          startArrow: false,
          endArrow: true,
          style: 'elbow',
          layerId: 'main',
          areaId: null,
        },
        {
          id: 'hidden',
          type: 'ellipse',
          x: 500000,
          y: 500000,
          width: 1,
          height: 1,
          color: '#FF0000',
          fill: null,
          text: 'Hidden text',
          fontSize: 12,
          layerId: 'hidden',
          areaId: null,
        },
      ],
    }
    const view = render(<CanvasThumbnail document={document} />)
    expect(
      view.container.querySelector('[data-thumbnail-object="rectangle"]'),
    ).not.toBeNull()
    expect(
      view.container.querySelector('[data-thumbnail-object="diamond"]'),
    ).not.toBeNull()
    // Thumbnail relationships share the live outline attachment, rather than
    // starting in a shape's center and covering its label.
    expect(
      view.container.querySelector('[data-connection-path]')?.getAttribute('d'),
    ).toMatch(/^M 157\.14285714285714 100 L /u)
    expect(view.container.textContent).toContain('<script>unsafe()</script>')
    expect(view.container.textContent).not.toContain('Hidden text')
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '-30.400000000000002 -30.400000000000002 440.8 380.8',
    )
  })
  it('uses an empty-canvas icon when no visible objects exist', () => {
    const view = render(
      <CanvasThumbnail document={createCanvasDocument('Empty')} />,
    )
    expect(view.container.querySelector('svg.icon')).not.toBeNull()
    expect(view.container.querySelector('.canvas-thumbnail')).toBeNull()
  })
})
