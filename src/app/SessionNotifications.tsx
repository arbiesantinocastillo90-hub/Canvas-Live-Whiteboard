import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import {
  createSessionNotifications,
  NotificationsContext,
  NOTIFICATION_REMINDER_MINUTES,
  useSessionNotifications,
} from './notificationSession'
import './notifications.css'

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSessionNotifications)
  return (
    <NotificationsContext.Provider value={store}>
      {children}
    </NotificationsContext.Provider>
  )
}

function BellIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  )
}

function RemindLater({ onSelect }: { onSelect: (minutes: number) => void }) {
  return (
    <select
      className="notification-reminder"
      aria-label="Remind me later"
      value=""
      onChange={(event) => {
        if (event.target.value) onSelect(Number(event.target.value))
      }}
    >
      <option value="">Remind me later</option>
      {NOTIFICATION_REMINDER_MINUTES.map((minutes) => (
        <option key={minutes} value={minutes}>
          {minutes < 60
            ? `${minutes} minutes`
            : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`}
        </option>
      ))}
    </select>
  )
}

export function NotificationBell({
  scopeId,
  channel,
}: {
  scopeId: string
  channel?: ReturnType<typeof useSessionNotifications>
}) {
  const fallback = useSessionNotifications(scopeId)
  const { items, toast, store } = channel ?? fallback
  const [openedScope, setOpenedScope] = useState<string | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const popupClose = useRef<HTMLButtonElement>(null)
  const open = openedScope === scopeId
  const unread = items.filter((item) => !item.read).length
  const currentToast = items.find((item) => item.id === toast?.id)
  const attachButton = useCallback((element: HTMLButtonElement | null) => {
    button.current = element
    if (element)
      setPortalHost(
        document.fullscreenElement instanceof HTMLElement
          ? document.fullscreenElement
          : (element.closest<HTMLElement>('.app-shell') ?? document.body),
      )
  }, [])

  useEffect(() => {
    const updateHost = () => {
      setPortalHost(
        document.fullscreenElement instanceof HTMLElement
          ? document.fullscreenElement
          : (button.current?.closest<HTMLElement>('.app-shell') ??
              document.body),
      )
    }
    document.addEventListener('fullscreenchange', updateHost)
    return () => document.removeEventListener('fullscreenchange', updateHost)
  }, [])

  useEffect(() => {
    if (!toast) return
    const configured =
      portalHost &&
      Number.parseFloat(
        getComputedStyle(portalHost).getPropertyValue('--motion-duration'),
      )
    const reduced =
      !!portalHost?.closest('[data-motion="reduced"]') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    const exitDuration = reduced
      ? 0
      : typeof configured === 'number' && Number.isFinite(configured)
        ? Math.max(0, Math.min(3000, configured))
        : 180
    const timer = setTimeout(
      () => {
        if (toast.closing) store.removeToast(scopeId, toast.id)
        else store.closeToast(scopeId, toast.id)
      },
      toast.closing ? exitDuration : Math.max(0, toast.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [toast, scopeId, store, portalHost])
  useEffect(() => {
    if (!open) return
    store.markRead(scopeId)
    if (toast) store.closeToast(scopeId, toast.id)
  }, [items, open, scopeId, store, toast])
  useEffect(() => {
    if (!open) return
    popupClose.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !popup.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      )
        setOpenedScope(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpenedScope(null)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="session-notifications">
      <button
        ref={attachButton}
        className="notification-bell"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={unread ? `Notifications · ${unread} unread` : 'Notifications'}
        onClick={() => setOpenedScope(open ? null : scopeId)}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="notification-unread"
            aria-label={`${unread} unread notifications`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {portalHost &&
        createPortal(
          <>
            {open && (
              <div
                ref={popup}
                className="notification-history"
                role="dialog"
                aria-label="Session notifications"
              >
                <div className="notification-history-heading">
                  <h2>Notifications</h2>
                  <button
                    ref={popupClose}
                    className="icon-button"
                    aria-label="Close notifications"
                    title="Close notifications"
                    onClick={() => {
                      setOpenedScope(null)
                      button.current?.focus()
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {items.length ? (
                  <ol>
                    {[...items].reverse().map((item) => (
                      <li key={item.id} data-kind={item.kind}>
                        <span
                          className="notification-kind"
                          aria-label={item.kind}
                          aria-hidden={item.kind !== 'error'}
                        >
                          {item.kind === 'error'
                            ? '!'
                            : item.kind === 'success'
                              ? '✓'
                              : '•'}
                        </span>
                        <p>{item.message}</p>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        {item.remindAt !== null && (
                          <span className="notification-reminder-due">
                            Reminder set for{' '}
                            {new Date(item.remindAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        <div className="notification-item-actions">
                          <RemindLater
                            onSelect={(minutes) =>
                              store.remindLater(scopeId, item.id, minutes)
                            }
                          />
                          <button
                            className="icon-button"
                            aria-label={`Remove notification: ${item.message}`}
                            title="Remove notification"
                            onClick={() => store.dismiss(scopeId, item.id)}
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="notification-empty">
                    No notifications this session.
                  </p>
                )}
              </div>
            )}
            {currentToast && toast && (
              <div
                className="notification-toast"
                data-kind={currentToast.kind}
                data-closing={toast.closing}
                role={currentToast.kind === 'error' ? 'alert' : 'status'}
                aria-live={
                  currentToast.kind === 'error' ? 'assertive' : 'polite'
                }
              >
                <div className="notification-toast-content">
                  <span>{currentToast.message}</span>
                  <RemindLater
                    onSelect={(minutes) =>
                      store.remindLater(scopeId, toast.id, minutes)
                    }
                  />
                </div>
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  title="Dismiss notification"
                  onClick={() => store.closeToast(scopeId, toast.id)}
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
          </>,
          portalHost,
        )}
    </div>
  )
}
