import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasAiOptions from './CanvasAiOptions'
import { aiMiniStorageKey } from './useAiMiniSettings'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const props = {
  scopeId: 'research-workspace',
  workspaceName: 'Research',
  reduceMotion: false,
}

function openSettings() {
  const button = screen.getByRole('button', {
    name: 'Customize AI character and indicators',
  })
  button.focus()
  fireEvent.click(button)
  return screen.findByRole('dialog', { name: 'Customize AI mini' })
}

describe('AI presence options', () => {
  it('opens an offline preview without a canvas, floating mini, or connection request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(<CanvasAiOptions {...props} />)
    expect(
      screen.getByRole('region', { name: 'AI presence' }),
    ).toHaveTextContent('Research')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openSettings()
    expect(screen.getByText('Preview only')).toBeInTheDocument()
    expect(document.querySelector('.canvas-ai-mini')).not.toBeInTheDocument()
    expect(screen.queryByText('Stop sharing')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close mini settings' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Customize AI character and indicators',
      }),
    ).toHaveFocus()
  })

  it('persists choices for the current workspace and restores them when reopened', async () => {
    const view = render(<CanvasAiOptions {...props} />)
    await openSettings()
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Evidence buddy' },
    })
    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: 'cat' },
    })
    fireEvent.change(screen.getByLabelText('Read indicator color'), {
      target: { value: '#112233' },
    })
    fireEvent.change(screen.getByLabelText('Requested edit color'), {
      target: { value: '#aabbcc' },
    })
    fireEvent.change(screen.getByLabelText('Completed edit color'), {
      target: { value: '#445566' },
    })
    fireEvent.change(screen.getByLabelText('Indicator animation'), {
      target: { value: 'ripple' },
    })
    fireEvent.change(
      screen.getByRole('slider', { name: 'Indicator duration' }),
      {
        target: { value: '9' },
      },
    )
    fireEvent.click(screen.getByLabelText('Show indicator labels'))
    fireEvent.click(screen.getByLabelText('Show activity on canvas'))
    const saved = JSON.parse(
      localStorage.getItem(aiMiniStorageKey(props.scopeId))!,
    )
    expect(saved).toMatchObject({
      name: 'Evidence buddy',
      preset: 'cat',
      presenceReadColor: '#112233',
      presenceWorkingColor: '#aabbcc',
      presenceCompleteColor: '#445566',
      presenceAnimation: 'ripple',
      presenceDuration: 9,
      presenceLabels: false,
      showCanvasActivity: false,
    })
    view.unmount()
    render(<CanvasAiOptions {...props} />)
    await openSettings()
    expect(screen.getByLabelText('Name')).toHaveValue('Evidence buddy')
    expect(screen.getByLabelText('Character')).toHaveValue('cat')
    expect(screen.getByLabelText('Read indicator color')).toHaveValue('#112233')
    expect(screen.getByLabelText('Indicator animation')).toHaveValue('ripple')
    expect(
      screen.getByRole('slider', { name: 'Indicator duration' }),
    ).toHaveValue('9')
    expect(screen.getByLabelText('Show activity on canvas')).not.toBeChecked()
    expect(screen.getByLabelText('Show indicator labels')).not.toBeChecked()
  })

  it('closes the old preview and keeps settings isolated when the workspace changes', async () => {
    const view = render(<CanvasAiOptions {...props} />)
    await openSettings()
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Research buddy' },
    })
    view.rerender(
      <CanvasAiOptions
        {...props}
        scopeId="school-workspace"
        workspaceName="School"
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'AI presence' }),
    ).toHaveTextContent('School')
    await openSettings()
    expect(screen.getByLabelText('Name')).toHaveValue('Canvas buddy')
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'School buddy' },
    })
    expect(
      JSON.parse(localStorage.getItem(aiMiniStorageKey(props.scopeId))!),
    ).toMatchObject({
      name: 'Research buddy',
    })
    expect(
      JSON.parse(localStorage.getItem(aiMiniStorageKey('school-workspace'))!),
    ).toMatchObject({
      name: 'School buddy',
    })
  })

  it('honors reduced motion and renders the workspace name literally', async () => {
    render(
      <CanvasAiOptions
        {...props}
        reduceMotion={true}
        workspaceName="<script>connectAI()</script>"
      />,
    )
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'AI presence' }),
    ).toHaveTextContent('<script>connectAI()</script>')
    await openSettings()
    expect(
      document.querySelector('.ai-mini-settings-preview .ai-mini-motion'),
    ).toHaveAttribute('data-animation', 'none')
  })
})
