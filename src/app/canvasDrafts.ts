import { useEffect } from 'react'
import {
  canvasFileStore,
  type CanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import type { CanvasDocument } from './lcanvas'

export type CanvasDraft = {
  record: CanvasFileRecord
  dirty: boolean
  savedDocument: CanvasDocument
  persistence: 'browser' | 'session'
}

const drafts = new WeakMap<CanvasFileStore, Map<string, CanvasDraft[]>>()

export function projectDrafts(store: CanvasFileStore) {
  let cached = drafts.get(store)
  if (!cached) {
    cached = new Map()
    drafts.set(store, cached)
  }
  return cached
}

export function useCanvasDraftProtection(store = canvasFileStore) {
  useEffect(() => {
    function protectUnsaved(event: BeforeUnloadEvent) {
      const hasDrafts = [...projectDrafts(store).values()].some((files) =>
        files.some((entry) => entry.dirty),
      )
      if (!hasDrafts) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [store])
}
