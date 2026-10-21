import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasAiPresence, {
  type CanvasAiPresenceProps,
} from './CanvasAiPresence'
import { createCanvasAiPresence } from './canvasAiPresenceState'
import { createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_AI_MINI_SETTINGS } from './useAiMiniSettings'

vi.mock('./workspaceBackground', async (original) => ({
  ...(await original<typeof import('./workspaceBackground')>()),
  useWorkspaceBackground: () => 'blob:custom-mini',
}))

function props(
  patch: Partial<CanvasAiPresenceProps> = {},
): CanvasAiPresenceProps {
  const document = createElement(createCanvasDocument('AI location'), {
    id: 'shape',
    type: 'rectangle',
    x: 100,
    y: 80,
    width: 140,
    height: 60,
  })
  return {
    event: createCanvasAiPresence({
      id: 'operation',
      kind: 'edit',
      phase: 'complete',
      at: Date.now(),
      scope: 'canvas',
      before: document,
      targetIds: ['shape'],
    }),
    document,
    viewport: { x: 20, y: -10, zoom: 2 },
    width: 1000,
    height: 700,
    settings: { ...DEFAULT_AI_MINI_SETTINGS },
    client: 'ChatGPT',
    reduceMotion: false,
    onOpenAI: vi.fn(),
    ...patch,
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('on-canvas AI presence', () => {
  it('maps target geometry through the real camera without changing it', () => {
    const input = props()
    const view = render(<CanvasAiPresence {...input} />)
    const rectangle = view.container.querySelector('.canvas-ai-presence-ring')!
    expect(rectangle).toHaveAttribute('x', '215')
    expect(rectangle).toHaveAttribute('y', '145')
    expect(rectangle).toHaveAttribute('width', '290')
    expect(rectangle).toHaveAttribute('height', '130')
    expect(screen.getByRole('status')).toHaveTextContent('Edited here')
    expect(input.viewport).toEqual({ x: 20, y: -10, zoom: 2 })
    view.rerender(
      <CanvasAiPresence {...input} viewport={{ x: 0, y: 0, zoom: 1 }} />,
    )
    expect(rectangle).toHaveAttribute('x', '95')
    expect(rectangle).toHaveAttribute('width', '150')
  })
  it('expires from the original operation timestamp and does not renew on rerender', () => {
    const input = props()
    const view = render(<CanvasAiPresence {...input} />)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    view.rerender(
      <CanvasAiPresence {...input} viewport={{ x: 5, y: 5, zoom: 1 }} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    view.rerender(
      <CanvasAiPresence
        {...input}
        event={{ ...input.event!, id: 'new-operation', at: Date.now() }}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    view.rerender(<CanvasAiPresence {...input} event={null} />)
    expect(view.container).toBeEmptyDOMElement()
  })
  it('uses the configured duration while rejecting expired and future timestamps', () => {
    const input = props()
    input.settings.presenceDuration = 2
    const view = render(<CanvasAiPresence {...input} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(view.container).toBeEmptyDOMElement()
    view.rerender(
      <CanvasAiPresence
        {...input}
        event={{ ...input.event!, id: 'future', at: Date.now() + 1001 }}
      />,
    )
    expect(view.container).toBeEmptyDOMElement()
  })
  it('gives an honest edge cue rather than moving offscreen geometry onto the canvas', () => {
    const input = props({ viewport: { x: -10000, y: 0, zoom: 1 } })
    input.settings.presenceLabels = false
    const view = render(<CanvasAiPresence {...input} />)
    expect(screen.getByRole('status')).toHaveTextContent('Edited offscreen ←')
    expect(screen.getByRole('button')).toHaveAttribute('data-offscreen', 'true')
    expect(
      view.container.querySelector('.canvas-ai-presence-ring'),
    ).toHaveAttribute('x', '-9905')
    expect(screen.getByRole('button').style.left).toBe('8px')
  })
  it.each(['read', 'working', 'complete'] as const)(
    'uses the customizable %s color and animations',
    (phase) => {
      const input = props()
      input.settings.presenceReadColor = '#123456'
      input.settings.presenceWorkingColor = '#234567'
      input.settings.presenceCompleteColor = '#345678'
      input.settings.presenceAnimation = 'ripple'
      input.event = {
        ...input.event!,
        kind: phase === 'read' ? 'read' : 'edit',
        phase: phase === 'working' ? 'working' : 'complete',
      }
      const view = render(<CanvasAiPresence {...input} />)
      const root = view.container.firstElementChild as HTMLElement
      expect(root.style.getPropertyValue('--presence-color')).toBe(
        phase === 'read'
          ? '#123456'
          : phase === 'working'
            ? '#234567'
            : '#345678',
      )
      expect(root).toHaveAttribute('data-animation', 'ripple')
      expect(screen.getByRole('status')).toHaveTextContent(
        phase === 'read'
          ? 'Read here'
          : phase === 'working'
            ? 'Edit queued here'
            : 'Edited here',
      )
    },
  )
  it('honors the activity setting and hides optional labels', () => {
    const input = props()
    input.settings.presenceLabels = false
    const view = render(<CanvasAiPresence {...input} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    view.rerender(
      <CanvasAiPresence
        {...input}
        settings={{ ...input.settings, showCanvasActivity: false }}
      />,
    )
    expect(view.container).toBeEmptyDOMElement()
  })
  it.each(['app', 'system'] as const)(
    'keeps a static location cue and replaces animated custom images for %s reduced motion',
    (source) => {
      if (source === 'system')
        vi.stubGlobal('matchMedia', () => ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      const input = props({ reduceMotion: source === 'app' })
      input.settings.preset = 'custom'
      input.settings.imageAssetId = 'a'.repeat(64)
      const view = render(<CanvasAiPresence {...input} />)
      expect(view.container.firstElementChild).toHaveAttribute(
        'data-reduce-motion',
        'true',
      )
      expect(view.container.firstElementChild).toHaveAttribute(
        'data-animation',
        'none',
      )
      expect(
        view.container.querySelector('.canvas-ai-presence-mascot'),
      ).toHaveAttribute('data-animation', 'none')
      expect(
        view.container.querySelector('.ai-mini-custom-image'),
      ).not.toBeInTheDocument()
      expect(
        view.container.querySelector('.canvas-ai-presence-ring'),
      ).toBeInTheDocument()
    },
  )
  it('opens Workspace AI on double click or keyboard activation without canvas pointer events', () => {
    const input = props()
    const parentPointer = vi.fn()
    const parentDouble = vi.fn()
    render(
      <div onPointerDown={parentPointer} onDoubleClick={parentDouble}>
        <CanvasAiPresence {...input} />
      </div>,
    )
    const button = screen.getByRole('button')
    fireEvent.pointerDown(button)
    fireEvent.click(button, { detail: 1 })
    expect(input.onOpenAI).not.toHaveBeenCalled()
    fireEvent.doubleClick(button)
    expect(input.onOpenAI).toHaveBeenCalledOnce()
    fireEvent.click(button, { detail: 0 })
    expect(input.onOpenAI).toHaveBeenCalledTimes(2)
    expect(parentPointer).not.toHaveBeenCalled()
    expect(parentDouble).not.toHaveBeenCalled()
  })
})
