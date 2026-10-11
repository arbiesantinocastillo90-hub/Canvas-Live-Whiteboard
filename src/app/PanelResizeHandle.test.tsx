import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import PanelResizeHandle from './PanelResizeHandle'

function Handle({ edge = 'right' }: { edge?: 'left' | 'right' }) {
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
})
