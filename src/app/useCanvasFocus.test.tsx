import { useRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useCanvasFocus from './useCanvasFocus'

function Harness({
  onChange,
  onFit,
}: {
  onChange: (focused: boolean) => void
  onFit: () => void
}) {
  const root = useRef<HTMLElement>(null)
  const { focused, toggle } = useCanvasFocus(root, onChange)
  return (
    <section ref={root} aria-label="Focus test" data-focus={focused}>
      <button onClick={toggle}>{focused ? 'Exit' : 'Enter'}</button>
      <button aria-label="Reset view" onClick={onFit}>
        Fit
      </button>
    </section>
  )
}

const originalFullscreen = Object.getOwnPropertyDescriptor(
  document,
  'fullscreenElement',
)
const originalExit = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
afterEach(() => {
  if (originalFullscreen)
    Object.defineProperty(document, 'fullscreenElement', originalFullscreen)
  else Reflect.deleteProperty(document, 'fullscreenElement')
  if (originalExit)
    Object.defineProperty(document, 'exitFullscreen', originalExit)
  else Reflect.deleteProperty(document, 'exitFullscreen')
  vi.restoreAllMocks()
})

function mount() {
  const onChange = vi.fn()
  const onFit = vi.fn()
  const view = render(<Harness onChange={onChange} onFit={onFit} />)
  return {
    ...view,
    root: screen.getByRole('region', { name: 'Focus test' }),
    onChange,
    onFit,
  }
}

describe('current-file fullscreen and focus layout', () => {
  it('works without native fullscreen, fits the canvas, and restores focus on Escape', async () => {
    const { root, onChange, onFit } = mount()
    const enter = screen.getByRole('button', { name: 'Enter' })
    enter.focus()
    fireEvent.click(enter)
    expect(root).toHaveAttribute('data-focus', 'true')
    await waitFor(() => expect(onFit).toHaveBeenCalledOnce())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(root).toHaveAttribute('data-focus', 'false')
    expect(enter).toHaveFocus()
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('keeps focus layout available when the embedded browser refuses native fullscreen', async () => {
    const { root, onFit } = mount()
    Object.defineProperty(root, 'requestFullscreen', {
      value: vi.fn(async () => {
        throw new Error('Not supported')
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    await waitFor(() => expect(onFit).toHaveBeenCalledOnce())
    expect(root).toHaveAttribute('data-focus', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(root).toHaveAttribute('data-focus', 'false')
  })

  it('restores the layout when the browser exits native fullscreen', async () => {
    const { root, onChange } = mount()
    let native: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => native,
    })
    Object.defineProperty(root, 'requestFullscreen', {
      value: vi.fn(async () => {
        native = root
        document.dispatchEvent(new Event('fullscreenchange'))
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    await waitFor(() => expect(native).toBe(root))
    act(() => {
      native = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(root).toHaveAttribute('data-focus', 'false')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('exits a native request that completes after the user already pressed Escape', async () => {
    const { root, onFit } = mount()
    let resolve: () => void = () => undefined
    let native: Element | null = null
    const request = new Promise<void>((complete) => {
      resolve = complete
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => native,
    })
    const exit = vi.fn(async () => {
      native = null
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exit,
    })
    Object.defineProperty(root, 'requestFullscreen', {
      value: vi.fn(() => request),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => {
      native = root
      resolve()
      await request
    })
    expect(exit).toHaveBeenCalledOnce()
    expect(root).toHaveAttribute('data-focus', 'false')
    expect(native).toBeNull()
    expect(onFit).not.toHaveBeenCalled()
  })

  it('clears the parent focus state if the focused editor unmounts', () => {
    const { unmount, onChange } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    unmount()
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})
