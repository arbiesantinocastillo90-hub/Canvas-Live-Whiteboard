import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react'

export type NotificationKind = 'info' | 'success' | 'error'
type SessionNotification = {
  id: string
  message: string
  kind: NotificationKind
  createdAt: number
  read: boolean
  remindAt: number | null
}
type NotificationScope = {
  items: readonly SessionNotification[]
  toast: { id: string; expiresAt: number; closing: boolean } | null
}
const EMPTY_SCOPE: NotificationScope = { items: [], toast: null }

export const NOTIFICATION_REMINDER_MINUTES = [5, 10, 20, 30, 60, 120] as const

/** This store deliberately has no browser, file, or URL persistence. */
export function createSessionNotifications() {
  const scopes = new Map<string, NotificationScope>()
  const listeners = new Set<() => void>()
  let reminderTimer: ReturnType<typeof setTimeout> | null = null
  const get = (scope: string) => scopes.get(scope) ?? EMPTY_SCOPE
  const emit = () => listeners.forEach((listener) => listener())
  const armReminders = () => {
    if (reminderTimer !== null) clearTimeout(reminderTimer)
    reminderTimer = null
    if (!listeners.size) return
    const next = Math.min(
      ...[...scopes.values()].flatMap(({ items }) =>
        items.flatMap((item) =>
          item.remindAt === null ? [] : [item.remindAt],
        ),
      ),
    )
    if (!Number.isFinite(next)) return
    reminderTimer = setTimeout(
      () => {
        reminderTimer = null
        const now = Date.now()
        for (const [scope, current] of scopes) {
          const due = current.items.filter(
            (item) => item.remindAt !== null && item.remindAt <= now,
          )
          if (!due.length) continue
          const dueIds = new Set(due.map((item) => item.id))
          scopes.set(scope, {
            items: [
              ...current.items.filter((item) => !dueIds.has(item.id)),
              ...due.map((item) => ({
                ...item,
                remindAt: null,
                createdAt: now,
                read: false,
              })),
            ],
            toast: {
              id: due.at(-1)!.id,
              expiresAt: now + 5000,
              closing: false,
            },
          })
        }
        emit()
        armReminders()
      },
      Math.max(0, next - Date.now()),
    )
  }
  const publish = (scope: string, value: NotificationScope) => {
    scopes.set(scope, value)
    emit()
    armReminders()
  }
  return {
    get,
    subscribe(listener: () => void) {
      listeners.add(listener)
      armReminders()
      return () => {
        listeners.delete(listener)
        armReminders()
      }
    },
    notify(scope: string, message: string, kind: NotificationKind) {
      if (!message.trim()) return null
      const current = get(scope)
      const existing = current.items.find(
        (item) => item.message === message && item.kind === kind,
      )
      // Recurring status checks must not bypass a requested quiet period.
      if (existing?.remindAt !== null && existing?.remindAt !== undefined)
        return existing.id
      const id = existing?.id ?? crypto.randomUUID()
      const createdAt = Date.now()
      publish(scope, {
        items: [
          ...current.items.filter((item) => item.id !== id),
          { id, message, kind, createdAt, read: false, remindAt: null },
        ],
        toast: { id, expiresAt: createdAt + 5000, closing: false },
      })
      return id
    },
    markRead(scope: string) {
      const current = get(scope)
      if (!current.items.some((item) => !item.read)) return
      publish(scope, {
        ...current,
        items: current.items.map((item) => ({ ...item, read: true })),
      })
    },
    dismiss(scope: string, id: string) {
      const current = get(scope)
      if (!current.items.some((item) => item.id === id)) return
      publish(scope, {
        items: current.items.filter((item) => item.id !== id),
        toast: current.toast?.id === id ? null : current.toast,
      })
    },
    remindLater(scope: string, id: string, minutes: number) {
      if (!NOTIFICATION_REMINDER_MINUTES.some((value) => value === minutes))
        return
      const current = get(scope)
      if (!current.items.some((item) => item.id === id)) return
      publish(scope, {
        items: current.items.map((item) =>
          item.id === id
            ? { ...item, read: true, remindAt: Date.now() + minutes * 60_000 }
            : item,
        ),
        toast: current.toast?.id === id ? null : current.toast,
      })
    },
    closeToast(scope: string, id: string) {
      const current = get(scope)
      if (current.toast?.id !== id || current.toast.closing) return
      publish(scope, { ...current, toast: { ...current.toast, closing: true } })
    },
    removeToast(scope: string, id: string) {
      const current = get(scope)
      if (current.toast?.id === id) publish(scope, { ...current, toast: null })
    },
  }
}

type NotificationStore = ReturnType<typeof createSessionNotifications>
export const NotificationsContext = createContext<NotificationStore | null>(
  null,
)

export function useSessionNotifications(scopeId: string) {
  const provided = useContext(NotificationsContext)
  // Isolated component tests/embeds remain usable without a global singleton.
  const [fallback] = useState(createSessionNotifications)
  const store = provided ?? fallback
  const getSnapshot = useCallback(() => store.get(scopeId), [store, scopeId])
  const snapshot = useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getSnapshot,
  )
  const notify = useCallback(
    (message: string, kind: NotificationKind = 'info') =>
      store.notify(scopeId, message, kind),
    [store, scopeId],
  )
  return { ...snapshot, notify, store }
}
