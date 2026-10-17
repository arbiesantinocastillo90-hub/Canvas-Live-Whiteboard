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
}
type NotificationScope = {
  items: readonly SessionNotification[]
  toast: { id: string; expiresAt: number; closing: boolean } | null
}
const EMPTY_SCOPE: NotificationScope = { items: [], toast: null }

/** This store deliberately has no browser, file, or URL persistence. */
export function createSessionNotifications() {
  const scopes = new Map<string, NotificationScope>()
  const listeners = new Set<() => void>()
  const get = (scope: string) => scopes.get(scope) ?? EMPTY_SCOPE
  const publish = (scope: string, value: NotificationScope) => {
    scopes.set(scope, value)
    listeners.forEach((listener) => listener())
  }
  return {
    get,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify(scope: string, message: string, kind: NotificationKind) {
      if (!message.trim()) return null
      const id = crypto.randomUUID()
      const createdAt = Date.now()
      const current = get(scope)
      publish(scope, {
        items: [
          ...current.items,
          { id, message, kind, createdAt, read: false },
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
