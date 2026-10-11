import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppearanceOptions from './AppearanceOptions'
import { DEFAULT_PREFERENCES } from './workspace'

function Options() {
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES })
  return (
    <AppearanceOptions preferences={preferences} onChange={setPreferences} />
  )
}

describe('appearance controls', () => {
  it('keeps advanced colors collapsed and allows an individual automatic reset', () => {
    render(<Options />)
    const summary = screen.getByText('Fine-tune colors')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(summary)
    const color = screen.getByLabelText('Borders color')
    expect(
      screen.getByRole('button', { name: 'Automatic borders color' }),
    ).toBeDisabled()
    fireEvent.change(color, { target: { value: '#486585' } })
    expect(color).toHaveValue('#486585')
    fireEvent.click(
      screen.getByRole('button', { name: 'Automatic borders color' }),
    )
    expect(color).toHaveValue('#e6e3eb')
  })

  it('adjusts contrast and motion and restores all defaults together', () => {
    render(<Options />)
    fireEvent.change(
      screen.getByRole('slider', { name: 'Interface contrast' }),
      { target: { value: '85' } },
    )
    expect(screen.getByText('85%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Smooth' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Animation speed' }),
      { target: { value: 'slow' } },
    )
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
    expect(
      screen.getByRole('slider', { name: 'Interface contrast' }),
    ).toHaveValue('50')
    expect(screen.getByRole('radio', { name: 'Subtle' })).toBeChecked()
    expect(
      screen.getByRole('combobox', { name: 'Animation speed' }),
    ).toHaveValue('normal')
    expect(screen.getByLabelText('Background color')).toHaveValue('#f6f5f8')
  })

  it('pauses customizable motion while preserving the selected style and speed', () => {
    render(<Options />)
    fireEvent.click(screen.getByRole('radio', { name: 'Smooth' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Animation speed' }),
      { target: { value: 'fast' } },
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Animation speed' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeEnabled()
    expect(
      screen.getByRole('combobox', { name: 'Animation speed' }),
    ).toHaveValue('fast')
  })
})
