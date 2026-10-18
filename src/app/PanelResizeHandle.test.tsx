import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PanelResizeHandle from './PanelResizeHandle'

function Handle({
  edge = 'right',
}: {
  edge?: 'left' | 'right' | 'top' | 'bottom'
}) {
  const [width, setWidth] = useState(250)
  return (
    <PanelResizeHandle
      label="Resize panel"
      value={width}
      min={180}
      max={360}
      defaultValue={250}
      edge={edge}
      onChange={setWidth}
    />
  )
}

describe('accessible panel resizing', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('supports keyboard resize limits and a default-width reset', () => {
    render(<Handle />)
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '260')
    fireEvent.keyDown(handle, { key: 'End' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '360')
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle).toHaveAttribute('aria-valuenow', '180')
    fireEvent.doubleClick(handle)
    expect(handle).toHaveAttribute('aria-valuenow', '250')
  })
  it('uses the opposite arrow direction for a right-hand panel', () => {
    render(<Handle edge="left" />)
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true })
    expect(handle).toHaveAttribute('aria-valuenow', '280')
  })
  it('clamps pointer resizing and cancels an interrupted drag', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    render(<Handle />)
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 })
    expect(handle).toHaveAttribute('data-resizing', 'true')
    fireEvent.pointerMove(handle, { clientX: 1000 })
    expect(handle).toHaveAttribute('aria-valuenow', '360')
    fireEvent.pointerCancel(handle)
    expect(handle).toHaveAttribute('data-resizing', 'false')
    fireEvent.pointerMove(handle, { clientX: 0 })
    expect(handle).toHaveAttribute('aria-valuenow', '360')
    vi.unstubAllGlobals()
  })

  it.each([
    ['top', 'ArrowDown', 'ArrowUp'],
    ['bottom', 'ArrowUp', 'ArrowDown'],
  ] as const)(
    'uses physical %s-edge keyboard directions and resets within bounds',
    (edge, increase, decrease) => {
      render(<Handle edge={edge} />)
      const handle = screen.getByRole('separator', { name: 'Resize panel' })
      expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
      fireEvent.keyDown(handle, { key: increase })
      expect(handle).toHaveAttribute('aria-valuenow', '260')
      fireEvent.keyDown(handle, { key: decrease, shiftKey: true })
      expect(handle).toHaveAttribute('aria-valuenow', '230')
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
      fireEvent.keyDown(handle, { key: 'ArrowRight' })
      expect(handle).toHaveAttribute('aria-valuenow', '230')
      fireEvent.keyDown(handle, { key: 'Home' })
      fireEvent.keyDown(handle, { key: decrease })
      expect(handle).toHaveAttribute('aria-valuenow', '180')
      fireEvent.keyDown(handle, { key: 'End' })
      fireEvent.keyDown(handle, { key: increase })
      expect(handle).toHaveAttribute('aria-valuenow', '360')
      fireEvent.doubleClick(handle)
      expect(handle).toHaveAttribute('aria-valuenow', '250')
    },
  )

  it.each([
    ['top', 140, 290],
    ['bottom', 140, 210],
  ] as const)(
    'tracks vertical %s pointer movement while ignoring horizontal displacement and other pointers',
    (edge, endY, expected) => {
      class Pointer extends MouseEvent {
        pointerId: number
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init)
          this.pointerId = init.pointerId ?? 1
        }
      }
      vi.stubGlobal('PointerEvent', Pointer)
      render(<Handle edge={edge} />)
      const handle = screen.getByRole('separator', { name: 'Resize panel' })
      fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientY: 100 })
      expect(handle).toHaveAttribute('data-resizing', 'false')
      fireEvent.pointerDown(handle, {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 100,
      })
      fireEvent.pointerMove(handle, {
        pointerId: 2,
        clientX: 999,
        clientY: 900,
      })
      expect(handle).toHaveAttribute('aria-valuenow', '250')
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientX: 999,
        clientY: endY,
      })
      expect(handle).toHaveAttribute('aria-valuenow', String(expected))
      fireEvent.pointerUp(handle, { pointerId: 2 })
      expect(handle).toHaveAttribute('data-resizing', 'true')
      fireEvent.pointerUp(handle, { pointerId: 1 })
      expect(handle).toHaveAttribute('data-resizing', 'false')
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 0 })
      expect(handle).toHaveAttribute('aria-valuenow', String(expected))
    },
  )

  it('clamps a vertical drag to new viewport bounds and stops after pointer capture is lost', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    const onChange = vi.fn()
    const props = {
      label: 'Resize top',
      value: 80,
      min: 0,
      max: 240,
      defaultValue: 8,
      edge: 'top' as const,
      onChange,
    }
    const view = render(<PanelResizeHandle {...props} />)
    const handle = screen.getByRole('separator', { name: 'Resize top' })
    fireEvent.pointerDown(handle, { button: 0, clientY: 100 })
    view.rerender(<PanelResizeHandle {...props} max={30} value={30} />)
    fireEvent.pointerMove(handle, { clientY: 500 })
    expect(onChange).toHaveBeenLastCalledWith(30)
    fireEvent.lostPointerCapture(handle)
    expect(handle).toHaveAttribute('data-resizing', 'false')
    onChange.mockClear()
    fireEvent.pointerMove(handle, { clientY: -100 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
