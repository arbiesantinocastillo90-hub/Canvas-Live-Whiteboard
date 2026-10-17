import { createRef, type ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasSavePanel from './CanvasSavePanel'

function props(
  patch: Partial<ComponentProps<typeof CanvasSavePanel>> = {},
): ComponentProps<typeof CanvasSavePanel> {
  return {
    anchor: createRef<HTMLButtonElement>(),
    settings: { autoSave: true, intervalMs: 900 },
    destination: 'Plan.CLF',
    hasCanvas: true,
    saving: false,
    canChooseLocation: true,
    needsLocation: false,
    needsPermission: false,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onChooseLocation: vi.fn(),
    onDownload: vi.fn(),
    onClose: vi.fn(),
    ...patch,
  }
}
describe('compact Save options', () => {
  it('keeps interval, autosave and destination actions separate', () => {
    const initial = props()
    render(<CanvasSavePanel {...initial} />)
    expect(
      screen.getByRole('dialog', { name: 'Save options' }),
    ).toHaveTextContent('Plan.CLF')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Autosave' }))
    expect(initial.onChange).toHaveBeenLastCalledWith({
      autoSave: false,
      intervalMs: 900,
    })
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Autosave interval in seconds' }),
      { target: { value: '5' } },
    )
    expect(initial.onChange).toHaveBeenLastCalledWith({
      autoSave: true,
      intervalMs: 5000,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose location' }))
    expect(initial.onSave).toHaveBeenCalledOnce()
    expect(initial.onChooseLocation).toHaveBeenCalledOnce()
  })
  it('rejects invalid intervals without replacing the last valid setting', () => {
    const initial = props()
    render(<CanvasSavePanel {...initial} />)
    const field = screen.getByRole('spinbutton', {
      name: 'Autosave interval in seconds',
    })
    fireEvent.change(field, { target: { value: '0' } })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('0.5 to 3600')
    expect(initial.onChange).not.toHaveBeenCalled()
    fireEvent.blur(field)
    expect(field).toHaveValue(0.9)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('offers a download fallback without pretending an unavailable chooser works', () => {
    const initial = props({
      canChooseLocation: false,
      destination: 'No local file selected',
    })
    render(<CanvasSavePanel {...initial} />)
    expect(
      screen.getByRole('button', { name: 'Choose location' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Download copy' }))
    expect(initial.onDownload).toHaveBeenCalledOnce()
    expect(initial.onChooseLocation).not.toHaveBeenCalled()
  })
  it('reports missing destinations while preserving the controls to choose a replacement', () => {
    render(<CanvasSavePanel {...props({ needsLocation: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent('moved or deleted')
    expect(
      screen.getByRole('button', { name: 'Choose location' }),
    ).toBeEnabled()
  })
  it('supports close, Escape and outside clicks without clearing settings', () => {
    const initial = props()
    render(<CanvasSavePanel {...initial} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.pointerDown(document.body)
    fireEvent.click(screen.getByRole('button', { name: 'Close Save options' }))
    expect(initial.onClose).toHaveBeenCalledTimes(3)
    expect(initial.onChange).not.toHaveBeenCalled()
  })
})
