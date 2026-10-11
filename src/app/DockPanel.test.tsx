import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DockPanel from './DockPanel'

function Harness({ initialPinned = false }: { initialPinned?: boolean }) {
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
      >
        <input aria-label="Draft" defaultValue="Draft text" />
      </DockPanel>
    </>
  )
}

describe('transient workspace docks', () => {
  afterEach(() => vi.useRealTimers())

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
})
