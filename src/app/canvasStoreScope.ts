import type { CanvasFileRecord, CanvasFileStore } from './canvasFiles'
import type { ItemPresentation } from './itemPresentation'

type Scope = {
  base: CanvasFileStore
  workspaceId: string
  presentation: (id: string) => ItemPresentation | undefined
}
const scopes = new WeakMap<CanvasFileStore, Scope>()
export function baseCanvasStore(store: CanvasFileStore): CanvasFileStore {
  return scopes.get(store)?.base ?? store
}
export function canvasStoreWorkspace(store: CanvasFileStore): string | null {
  return scopes.get(store)?.workspaceId ?? null
}
export function scopedCanvasRecord(
  store: CanvasFileStore,
  record: CanvasFileRecord,
): CanvasFileRecord {
  const presentation = scopes.get(store)?.presentation(record.id)
  return presentation
    ? { ...record, document: { ...record.document, presentation } }
    : record
}
/** Workspace decorations never overwrite the shared drawing's stored decoration. */
export function createWorkspaceCanvasStore(
  base: CanvasFileStore,
  workspaceId: string,
  owns: (id: string) => boolean,
  presentation: (id: string) => ItemPresentation | undefined,
): CanvasFileStore {
  function requireProject(id: string) {
    if (!owns(id))
      throw new Error(
        'This project is not part of the current workspace. Import or create it here first.',
      )
  }
  const store: CanvasFileStore = {
    async list(projectId) {
      requireProject(projectId)
      const result = await base.list(projectId)
      return {
        ...result,
        value: result.value.map((record) => scopedCanvasRecord(store, record)),
      }
    },
    async get(projectId, id) {
      requireProject(projectId)
      const result = await base.get(projectId, id)
      return {
        ...result,
        value: result.value ? scopedCanvasRecord(store, result.value) : null,
      }
    },
    async markOpened(projectId, id, now) {
      requireProject(projectId)
      const result = await base.markOpened(projectId, id, now)
      return {
        ...result,
        value: result.value ? scopedCanvasRecord(store, result.value) : null,
      }
    },
    async save(record) {
      requireProject(record.projectId)
      let input = record
      if (presentation(record.id)) {
        const original = (await base.get(record.projectId, record.id)).value
        const document = { ...record.document }
        if (original?.document.presentation)
          document.presentation = original.document.presentation
        else delete document.presentation
        input = { ...record, document }
      }
      const result = await base.save(input)
      return { ...result, value: scopedCanvasRecord(store, result.value) }
    },
  }
  scopes.set(store, { base, workspaceId, presentation })
  return store
}
