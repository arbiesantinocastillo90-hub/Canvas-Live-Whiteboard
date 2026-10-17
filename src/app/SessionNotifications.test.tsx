import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell, NotificationsProvider } from './SessionNotifications'
import { useSessionNotifications } from './notificationSession'

function Sender({ scopeId }: { scopeId: string }) {
  const { notify } = useSessionNotifications(scopeId)
  return (
    <>
      <button onClick={() => notify('Copy downloaded', 'success')}>
        Send success
      </button>
      <button onClick={() => notify('Could not save this file', 'error')}>
        Send error
      </button>
    </>
  )
}
function Session({ scopeId = 'workspace-one' }: { scopeId?: string }) {
  return (
    <NotificationsProvider>
      <div
        className="app-shell"
        style={{ '--motion-duration': '180ms' } as React.CSSProperties}
      >
        <Sender scopeId={scopeId} />
        <NotificationBell scopeId={scopeId} />
      </div>
    </NotificationsProvider>
  )
}
afterEach(() => vi.useRealTimers())

describe('session notification history and transient messages', () => {
  it('uses a supplied standalone channel without requiring a global provider', () => {
    function Standalone() {
      const channel = useSessionNotifications('standalone')
      return (
        <>
          <button onClick={() => channel.notify('Standalone file saved')}>
            Save standalone
          </button>
          <NotificationBell scopeId="standalone" channel={channel} />
        </>
      )
    }
    render(<Standalone />)
    fireEvent.click(screen.getByRole('button', { name: 'Save standalone' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Standalone file saved',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Standalone file saved',
    )
  })

  it('keeps notifications visible inside native fullscreen and returns their portal on exit', () => {
    const fullscreen = document.createElement('section')
    document.body.append(fullscreen)
    render(<Session />)
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreen,
    })
    fireEvent(document, new Event('fullscreenchange'))
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    expect(fullscreen.contains(screen.getByRole('status'))).toBe(true)
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    })
    fireEvent(document, new Event('fullscreenchange'))
    expect(fullscreen.contains(screen.getByRole('status'))).toBe(false)
    fullscreen.remove()
  })
  it('shows a toast for five seconds, animates its exit, and keeps the message in history', () => {
    vi.useFakeTimers()
    render(<Session />)
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    expect(screen.getByRole('status')).toHaveTextContent('Copy downloaded')
    expect(screen.getByLabelText('1 unread notifications')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByRole('status')).toHaveAttribute('data-closing', 'false')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveAttribute('data-closing', 'true')
    act(() => vi.advanceTimersByTime(180))
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(
      screen.getByRole('dialog', { name: 'Session notifications' }),
    ).toHaveTextContent('Copy downloaded')
    expect(screen.queryByLabelText('1 unread notifications')).toBeNull()
  })

  it('dismisses manually without dropping history and lists new notifications first', () => {
    vi.useFakeTimers()
    render(<Session />)
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    )
    expect(screen.getByRole('status')).toHaveAttribute('data-closing', 'true')
    act(() => vi.advanceTimersByTime(180))
    fireEvent.click(screen.getByRole('button', { name: 'Send error' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save this file',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    const history = screen.getByRole('dialog', {
      name: 'Session notifications',
    })
    expect(
      within(history)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent),
    ).toEqual(['Could not save this file', 'Copy downloaded'])
    expect(
      screen.getByRole('button', { name: 'Close notifications' }),
    ).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus()
  })

  it('keeps workspace and URL scopes separate and clears history on a fresh provider mount', () => {
    function Scoped({ scopeId }: { scopeId: string }) {
      return (
        <div>
          <Sender scopeId={scopeId} />
          <NotificationBell scopeId={scopeId} />
        </div>
      )
    }
    const view = render(
      <NotificationsProvider>
        <Scoped scopeId="workspace-one#snapshot-a" />
      </NotificationsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    view.rerender(
      <NotificationsProvider>
        <Scoped scopeId="workspace-two#snapshot-b" />
      </NotificationsProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'No notifications this session.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }))
    view.rerender(
      <NotificationsProvider>
        <Scoped scopeId="workspace-one#snapshot-a" />
      </NotificationsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Copy downloaded')
    view.unmount()
    render(<Session scopeId="workspace-one#snapshot-a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'No notifications this session.',
    )
  })

  it('closes on outside pointer presses, keeps file focus untouched, and preserves repeated events', () => {
    render(<Session />)
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(
      within(screen.getByRole('dialog')).getAllByRole('listitem'),
    ).toHaveLength(2)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('lets the latest notification replace the toast while retaining older history', () => {
    vi.useFakeTimers()
    render(<Session />)
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }))
    act(() => vi.advanceTimersByTime(4000))
    fireEvent.click(screen.getByRole('button', { name: 'Send error' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('alert')).toHaveAttribute('data-closing', 'false')
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByRole('alert')).toHaveAttribute('data-closing', 'true')
  })
})
