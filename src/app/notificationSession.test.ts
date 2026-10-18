import { describe, expect, it, vi, afterEach } from 'vitest'
import { createSessionNotifications } from './notificationSession'

afterEach(() => vi.useRealTimers())

describe('notification store identity and reminder lifecycle', () => {
  it('merges by exact message and kind within a scope while preserving other scopes', () => {
    const store = createSessionNotifications()
    const id = store.notify('one', 'Disconnected', 'error')
    expect(store.notify('one', 'Disconnected', 'error')).toBe(id)
    expect(store.notify('one', 'Disconnected', 'info')).not.toBe(id)
    expect(store.notify('two', 'Disconnected', 'error')).not.toBe(id)
    expect(store.get('one').items).toHaveLength(2)
    expect(store.get('two').items).toHaveLength(1)
    store.dismiss('one', id!)
    expect(store.notify('one', 'Disconnected', 'error')).not.toBe(id)
  })

  it('keeps overdue reminders across subscriber changes and emits them once when mounted again', () => {
    vi.useFakeTimers()
    const store = createSessionNotifications()
    const unsubscribe = store.subscribe(vi.fn())
    const id = store.notify('one', 'Reconnect', 'error')!
    store.remindLater('one', id, 5)
    unsubscribe()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(6 * 60_000)
    expect(store.get('one').toast).toBeNull()
    const listener = vi.fn()
    const cleanup = store.subscribe(listener)
    vi.advanceTimersByTime(0)
    expect(store.get('one').toast?.id).toBe(id)
    expect(store.get('one').items).toHaveLength(1)
    expect(store.get('one').items[0].remindAt).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    cleanup()
  })
})
