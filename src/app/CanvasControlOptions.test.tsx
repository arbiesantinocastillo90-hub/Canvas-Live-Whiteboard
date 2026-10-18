import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasControlOptions from './CanvasControlOptions'
import { DEFAULT_CANVAS_CONTROLS } from './canvasControls'

describe('canvas snapping options', () => {
  it('enables object snapping independently from grid snapping and resets both', () => {
    const onChange = vi.fn()
    const value = { ...DEFAULT_CANVAS_CONTROLS, snapToGrid: true }
    const view = render(
      <CanvasControlOptions value={value} onChange={onChange} />,
    )
    expect(
      screen.getByRole('checkbox', { name: 'Snap to objects' }),
    ).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to objects' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...value, snapToObjects: true })
    view.rerender(
      <CanvasControlOptions
        value={{ ...value, snapToObjects: true }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to grid' }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      snapToGrid: false,
      snapToObjects: true,
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset canvas controls' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_CANVAS_CONTROLS)
  })
})
