import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DockPanel from './DockPanel'

function Harness({
  initialPinned = false,
  autoHide = true,
  autoHideDelay = 280,
  onMove,
}: {
  initialPinned?: boolean
  autoHide?: boolean
  autoHideDelay?: number
  onMove?: (side: 'left' | 'right') => void
}) {
  const [open, setOpen] = useState(true)
  const [pinned, setPinned] = useState(initialPinned)
  const [width, setWidth] = useState(260)
  return (
    <>
      <button data-dock-trigger="left" onClick={() => setOpen(true)}>
        Files trigger
      </button>
      <button>Canvas</button>
      <DockPanel
        id="files"
        label="Project files"
        side="left"
        open={open}
        pinned={pinned}
        width={width}
        min={160}
        max={420}
        defaultWidth={260}
        tabs={[{ id: 'files', label: 'Files' }]}
        activeTab="files"
        onSelect={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onPin={setPinned}
        onWidthChange={setWidth}
        autoHide={autoHide}
        autoHideDelay={autoHideDelay}
        onMove={onMove}
      >
        <input aria-label="Draft" defaultValue="Draft text" />
      </DockPanel>
    </>
  )
}

function VerticalHarness({
  side = 'left',
  initialPinned = false,
  top = 80,
  bottom = 100,
  onInsetChange = () => {},
}: {
  side?: 'left' | 'right'
  initialPinned?: boolean
  top?: number
  bottom?: number
  onInsetChange?: (edge: 'top' | 'bottom', value: number) => void
}) {
  const [pinned, setPinned] = useState(initialPinned)
  const [topInset, setTopInset] = useState(top)
  const [bottomInset, setBottomInset] = useState(bottom)
  return (
    <div
      className="workspace-deck"
      style={
        {
          '--tab-bar-height': '60px',
          '--status-bar-height': '30px',
        } as React.CSSProperties
      }
    >
      <DockPanel
        id="vertical-panel"
        label="Vertical panel"
        side={side}
        open
        pinned={pinned}
        width={260}
        min={160}
        max={420}
        defaultWidth={260}
        topInset={topInset}
        bottomInset={bottomInset}
        onTopInsetChange={(value) => {
          onInsetChange('top', value)
          setTopInset(value)
        }}
        onBottomInsetChange={(value) => {
          onInsetChange('bottom', value)
          setBottomInset(value)
        }}
        tabs={[{ id: 'files', label: 'Files' }]}
        activeTab="files"
        onSelect={() => {}}
        onClose={() => {}}
        onPin={setPinned}
        onWidthChange={() => {}}
        autoHide={false}
      >
        <input aria-label="Vertical draft" defaultValue="Retained" />
      </DockPanel>
    </div>
  )
}

function measuredDeck(initialHeight: number) {
  let height = initialHeight
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('workspace-deck')
        ? new DOMRect(0, 0, 1000, height)
        : original.call(this)
    },
  )
  return (nextHeight: number) => {
    height = nextHeight
  }
}

describe('transient workspace docks', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('auto-closes after the pointer leaves, retains its draft, and ignores its trigger', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Files trigger' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Draft'), {
      target: { value: 'Unapplied value' },
    })
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(279))
    expect(screen.getByRole('complementary')).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Files trigger' }))
    expect(screen.getByLabelText('Draft')).toHaveValue('Unapplied value')
  })

  it('keeps a focused form or an open dialog safe from pointer auto-close', () => {
    vi.useFakeTimers()
    render(<Harness />)
    screen.getByLabelText('Draft').focus()
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
    screen.getByRole('button', { name: 'Canvas' }).focus()
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
    dialog.remove()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('pins by double-click or the keyboard-accessible pin control and restores trigger focus on close', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Files' }))
    expect(
      screen.getByRole('button', { name: 'Unpin left panel' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Unpin left panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin left panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close left panel' }))
    expect(screen.getByRole('button', { name: 'Files trigger' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Files trigger' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Files' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('button', { name: 'Files trigger' })).toHaveFocus()
  })

  it('does not auto-close during a panel resize', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const handle = screen.getByRole('separator', { name: 'Resize left panel' })
    handle.dataset.resizing = 'true'
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
    handle.dataset.resizing = 'false'
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('auto-closes mouse-focused buttons while protecting keyboard focus', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const tab = screen.getByRole('tab', { name: 'Files' })
    fireEvent.pointerDown(tab)
    tab.focus()
    fireEvent.click(tab)
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Files trigger' }))
    const reopened = screen.getByRole('tab', { name: 'Files' })
    fireEvent.keyDown(reopened, { key: 'Tab' })
    reopened.focus()
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByRole('complementary')).toBeVisible()
  })
  it('navigates dock tabs with arrows and Home/End using one tab stop', () => {
    const select = vi.fn()
    render(
      <DockPanel
        id="right"
        label="Canvas panels"
        side="right"
        open
        pinned
        width={300}
        min={220}
        max={420}
        defaultWidth={300}
        tabs={[
          { id: 'tools', label: 'Tools' },
          { id: 'ai', label: 'AI' },
        ]}
        activeTab="tools"
        onSelect={select}
        onClose={() => {}}
        onPin={() => {}}
        onWidthChange={() => {}}
      >
        Panel
      </DockPanel>,
    )
    const tools = screen.getByRole('tab', { name: 'Tools' })
    const ai = screen.getByRole('tab', { name: 'AI' })
    expect(tools).toHaveAttribute('tabindex', '0')
    expect(ai).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(tools, { key: 'ArrowRight' })
    expect(select).toHaveBeenLastCalledWith('ai')
    expect(ai).toHaveFocus()
    fireEvent.keyDown(ai, { key: 'Home' })
    expect(select).toHaveBeenLastCalledWith('tools')
    expect(tools).toHaveFocus()
    fireEvent.keyDown(tools, { key: 'End' })
    expect(select).toHaveBeenLastCalledWith('ai')
    select.mockClear()
    fireEvent.keyDown(ai, { key: 'ArrowLeft', ctrlKey: true, altKey: true })
    fireEvent.keyDown(ai, { key: 'Home', metaKey: true })
    fireEvent.keyDown(ai, { key: 'ArrowRight', isComposing: true })
    expect(select).not.toHaveBeenCalled()
  })
  it('remembers pointer modality when unpinning a mouse-focused panel', () => {
    vi.useFakeTimers()
    render(<Harness initialPinned />)
    const unpin = screen.getByRole('button', { name: 'Unpin left panel' })
    fireEvent.pointerDown(unpin)
    unpin.focus()
    fireEvent.click(unpin)
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('uses the configured auto-hide delay and lets users disable automatic closing', () => {
    vi.useFakeTimers()
    const view = render(<Harness autoHideDelay={640} />)
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(639))
    expect(screen.getByRole('complementary')).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Files trigger' }))
    view.rerender(<Harness autoHide={false} />)
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByRole('complementary')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close left panel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('moves a header to the opposite physical side without closing or losing its contents', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    vi.useFakeTimers()
    const move = vi.fn()
    render(<Harness onMove={move} />)
    const grip = screen.getByRole('button', { name: 'Move left panel' })
    const header = grip.closest('.dock-panel-header')!
    fireEvent.change(screen.getByLabelText('Draft'), {
      target: { value: 'Still here' },
    })
    fireEvent.pointerDown(grip, { button: 0, clientX: 100 })
    expect(screen.getByRole('complementary')).toHaveAttribute(
      'data-arranging',
      'true',
    )
    fireEvent.pointerMove(header, { clientX: window.innerWidth - 10 })
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Canvas' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('complementary')).toBeVisible()
    fireEvent.pointerUp(header, { clientX: window.innerWidth - 10 })
    expect(move).toHaveBeenCalledExactlyOnceWith('right')
    expect(screen.getByRole('complementary')).toHaveAttribute(
      'data-arranging',
      'false',
    )
    expect(screen.getByLabelText('Draft')).toHaveValue('Still here')
  })

  it('cancels panel rearrangement with Escape and offers the same placement through keyboard controls', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    const move = vi.fn()
    render(<Harness onMove={move} />)
    const grip = screen.getByRole('button', { name: 'Move left panel' })
    const header = grip.closest('.dock-panel-header')!
    fireEvent.pointerDown(grip, { button: 0, clientX: 100 })
    fireEvent.pointerMove(header, { clientX: window.innerWidth - 10 })
    fireEvent.keyDown(grip, { key: 'Escape' })
    fireEvent.pointerUp(header, { clientX: window.innerWidth - 10 })
    expect(move).not.toHaveBeenCalled()
    expect(screen.getByRole('complementary')).toBeVisible()
    fireEvent.keyDown(grip, { key: 'ArrowRight', altKey: true })
    expect(move).toHaveBeenLastCalledWith('right')
    fireEvent.keyDown(grip, { key: 'ArrowLeft', altKey: true })
    expect(move).toHaveBeenLastCalledWith('left')
    fireEvent.click(grip, { detail: 0 })
    expect(move).toHaveBeenLastCalledWith('right')
  })

  it('retains tab activation and double-click pinning instead of dragging interactive header buttons', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    const move = vi.fn()
    render(<Harness onMove={move} />)
    const files = screen.getByRole('tab', { name: 'Files' })
    const header = files.closest('.dock-panel-header')!
    fireEvent.pointerDown(files, { button: 0, clientX: 100 })
    fireEvent.pointerMove(header, { clientX: window.innerWidth - 10 })
    fireEvent.pointerUp(header, { clientX: window.innerWidth - 10 })
    expect(move).not.toHaveBeenCalled()
    fireEvent.doubleClick(files)
    expect(
      screen.getByRole('button', { name: 'Unpin left panel' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it.each(['left', 'right'] as const)(
    'bounds both vertical edges for a floating %s dock while preserving 160px of usable height',
    (side) => {
      measuredDeck(600)
      const onChange = vi.fn()
      render(<VerticalHarness side={side} onInsetChange={onChange} />)
      const panel = screen.getByRole('complementary', {
        name: 'Vertical panel',
      })
      const top = screen.getByRole('separator', {
        name: `Resize ${side} panel top`,
      })
      const bottom = screen.getByRole('separator', {
        name: `Resize ${side} panel bottom`,
      })
      expect(top).toHaveAttribute('aria-valuemax', '250')
      expect(bottom).toHaveAttribute('aria-valuemax', '270')
      expect(panel.style.top).toBe('calc(var(--tab-bar-height, 40px) + 80px)')
      expect(panel.style.bottom).toBe(
        'calc(var(--status-bar-height, 22px) + 100px)',
      )
      fireEvent.keyDown(top, { key: 'End' })
      expect(top).toHaveAttribute('aria-valuenow', '250')
      expect(bottom).toHaveAttribute('aria-valuemax', '100')
      expect(
        600 -
          60 -
          30 -
          Number(top.getAttribute('aria-valuenow')) -
          Number(bottom.getAttribute('aria-valuenow')),
      ).toBe(160)
      fireEvent.keyDown(top, { key: 'Home' })
      fireEvent.keyDown(bottom, { key: 'End' })
      expect(bottom).toHaveAttribute('aria-valuenow', '350')
      expect(onChange).toHaveBeenLastCalledWith('bottom', 350)
      expect(panel.style.marginTop).toBe('')
      expect(panel.style.maxHeight).toContain('- 350px')
    },
  )

  it('uses margins for pinned docks and remeasures chrome when unpinned without losing contents or preferences', () => {
    measuredDeck(600)
    const onChange = vi.fn()
    render(
      <VerticalHarness
        initialPinned
        top={30}
        bottom={45}
        onInsetChange={onChange}
      />,
    )
    const panel = screen.getByRole('complementary', { name: 'Vertical panel' })
    const top = screen.getByRole('separator', { name: 'Resize left panel top' })
    const bottom = screen.getByRole('separator', {
      name: 'Resize left panel bottom',
    })
    expect(panel.style.marginTop).toBe('30px')
    expect(panel.style.marginBottom).toBe('45px')
    expect(panel.style.top).toBe('')
    expect(top).toHaveAttribute('aria-valuemax', '395')
    expect(bottom).toHaveAttribute('aria-valuemax', '410')
    fireEvent.click(screen.getByRole('button', { name: 'Unpin left panel' }))
    expect(panel.style.marginTop).toBe('')
    expect(panel.style.marginBottom).toBe('')
    expect(top).toHaveAttribute('aria-valuemax', '305')
    expect(bottom).toHaveAttribute('aria-valuemax', '320')
    expect(panel.style.top).toBe('calc(var(--tab-bar-height, 40px) + 30px)')
    expect(screen.getByLabelText('Vertical draft')).toHaveValue('Retained')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps displayed insets on viewport shrink and restores saved preferences when space returns', () => {
    const resize = measuredDeck(800)
    const onChange = vi.fn()
    render(<VerticalHarness top={200} bottom={180} onInsetChange={onChange} />)
    const top = screen.getByRole('separator', { name: 'Resize left panel top' })
    const bottom = screen.getByRole('separator', {
      name: 'Resize left panel bottom',
    })
    resize(400)
    fireEvent(window, new Event('resize'))
    expect(top).toHaveAttribute('aria-valuenow', '0')
    expect(bottom).toHaveAttribute('aria-valuenow', '150')
    expect(
      400 -
        90 -
        Number(top.getAttribute('aria-valuenow')) -
        Number(bottom.getAttribute('aria-valuenow')),
    ).toBe(160)
    resize(800)
    fireEvent(window, new Event('resize'))
    expect(top).toHaveAttribute('aria-valuenow', '200')
    expect(bottom).toHaveAttribute('aria-valuenow', '180')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reacts to deck ResizeObserver measurements and disconnects without rewriting layout preferences', () => {
    const resize = measuredDeck(800)
    let notify: ResizeObserverCallback | undefined
    const observe = vi.fn()
    const disconnect = vi.fn()
    let observer: ResizeObserver
    class Observer {
      constructor(callback: ResizeObserverCallback) {
        notify = callback
        observer = this as unknown as ResizeObserver
      }
      observe = observe
      disconnect = disconnect
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', Observer)
    const onChange = vi.fn()
    const view = render(
      <VerticalHarness
        initialPinned
        top={200}
        bottom={180}
        onInsetChange={onChange}
      />,
    )
    expect(observe).toHaveBeenCalledWith(
      document.querySelector('.workspace-deck'),
    )
    resize(400)
    act(() => notify?.([], observer))
    expect(
      screen.getByRole('separator', { name: 'Resize left panel top' }),
    ).toHaveAttribute('aria-valuenow', '60')
    expect(
      screen.getByRole('separator', { name: 'Resize left panel bottom' }),
    ).toHaveAttribute('aria-valuenow', '180')
    expect(onChange).not.toHaveBeenCalled()
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('retains legacy eight-pixel gutters when vertical controls were not supplied', () => {
    render(<Harness autoHide={false} />)
    const panel = screen.getByRole('complementary', { name: 'Project files' })
    expect(panel.style.top).toBe('calc(var(--tab-bar-height, 40px) + 8px)')
    expect(panel.style.bottom).toBe(
      'calc(var(--status-bar-height, 22px) + 8px)',
    )
    expect(
      screen.queryByRole('separator', { name: 'Resize left panel top' }),
    ).toBeNull()
    expect(
      screen.queryByRole('separator', { name: 'Resize left panel bottom' }),
    ).toBeNull()
  })
})
