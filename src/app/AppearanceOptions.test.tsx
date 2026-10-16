import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppearanceOptions from './AppearanceOptions'
import { DEFAULT_PREFERENCES } from './workspace'
import { DEFAULT_LAYOUT } from './layout'

function Options() {
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES })
  const [layout, setLayout] = useState({ ...DEFAULT_LAYOUT })
  return (
    <AppearanceOptions
      preferences={preferences}
      onChange={setPreferences}
      layout={layout}
      onLayoutChange={setLayout}
    />
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Speed preset' }), {
      target: { value: 'slow' },
    })
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
    expect(
      screen.getByRole('slider', { name: 'Interface contrast' }),
    ).toHaveValue('50')
    expect(screen.getByRole('radio', { name: 'Subtle' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Speed preset' })).toHaveValue(
      'normal',
    )
    expect(screen.getByLabelText('Background color')).toHaveValue('#f6f5f8')
  })

  it('pauses customizable motion while preserving the selected style and speed', () => {
    render(<Options />)
    fireEvent.click(screen.getByRole('radio', { name: 'Smooth' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Speed preset' }), {
      target: { value: 'fast' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Speed preset' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(screen.getByRole('radio', { name: 'Smooth' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Speed preset' })).toHaveValue(
      'fast',
    )
  })

  it('customizes speed, effect, easing and button separation without discarding them while motion is reduced', () => {
    render(<Options />)
    const speed = screen.getByRole('slider', { name: 'Animation speed' })
    const effect = screen.getByRole('combobox', { name: 'Animation type' })
    const easing = screen.getByRole('combobox', { name: 'Animation easing' })
    fireEvent.change(speed, { target: { value: '150' } })
    fireEvent.change(effect, { target: { value: 'pop' } })
    fireEvent.change(easing, { target: { value: 'linear' } })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Separate rail buttons' }),
    )
    expect(screen.getByText('150%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(speed).toBeDisabled()
    expect(effect).toBeDisabled()
    expect(easing).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(speed).toHaveValue('150')
    expect(effect).toHaveValue('pop')
    expect(easing).toHaveValue('linear')
    expect(
      screen.getByRole('checkbox', { name: 'Separate rail buttons' }),
    ).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
    expect(speed).toHaveValue('100')
    expect(effect).toHaveValue('flow')
    expect(easing).toHaveValue('standard')
    expect(
      screen.getByRole('checkbox', { name: 'Separate rail buttons' }),
    ).toBeChecked()
  })

  it('customizes auto-hide independently of animation speed and preserves the configured delay while off', () => {
    render(<Options />)
    const delay = screen.getByRole('slider', { name: 'Panel hide delay' })
    fireEvent.change(delay, { target: { value: '640' } })
    expect(screen.getByText('640 ms')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-hide panels' }))
    expect(delay).toBeDisabled()
    expect(
      screen.getByRole('slider', { name: 'Animation speed' }),
    ).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-hide panels' }))
    expect(delay).toHaveValue('640')
    const swap = screen.getByRole('button', { name: 'Swap panel sides' })
    fireEvent.click(swap)
    expect(swap).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
    expect(swap).toHaveAttribute('aria-pressed', 'true')
    expect(delay).toHaveValue('640')
  })
})
