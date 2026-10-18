import {
  createCanvasFileStore,
  type CanvasFileStore,
  type CanvasFileResult,
} from './canvasFiles'
import type { WorkspaceState } from './workspace'
import {
  normalizeProjectView,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import { normalizeViewLinkSnapshot, type ViewLinkSnapshot } from './viewLinks'

export type RestoredViewLink = {
  snapshot: ViewLinkSnapshot
  workspace: WorkspaceState
  sessions: WorkspaceSessions
  store: CanvasFileStore
  storageError: boolean
}

/** Every opening is a new editable copy. Neither originals nor previous link edits are replaced. */
export async function restoreViewLink(
  input: ViewLinkSnapshot,
): Promise<RestoredViewLink> {
  const snapshot = normalizeViewLinkSnapshot(input)
  // Snapshot sessions deliberately have no connection to the browser's library,
  // recovery or native file bindings. An iframe reload starts from its URL.
  const memory = createCanvasFileStore({ indexedDB: null })
  async function session<T>(
    operation: Promise<CanvasFileResult<T>>,
  ): Promise<CanvasFileResult<T>> {
    const { value } = await operation
    return { value, persistence: 'session' }
  }
  const store: CanvasFileStore = {
    list: (id) => session(memory.list(id)),
    get: (projectId, id) => session(memory.get(projectId, id)),
    save: (file) => session(memory.save(file)),
    markOpened: (projectId, id, now) =>
      session(memory.markOpened(projectId, id, now)),
  }
  const namespace = crypto.randomUUID()
  const projectId = `view-project-${namespace}`
  const fileIds = new Map(
    snapshot.files.map((file, index) => [
      file.id,
      `view-file-${namespace}-${index}`,
    ]),
  )
  const originalView = snapshot.workspace.views[snapshot.project.id]
  const view = normalizeProjectView({
    ...originalView,
    openIds: originalView.openIds.map((id) => fileIds.get(id)),
    activeId: fileIds.get(originalView.activeId!),
    tabs: originalView.tabs.map((tab) => ({ ...tab, id: fileIds.get(tab.id) })),
    shortcuts: originalView.shortcuts.map((item) => ({
      ...item,
      id: fileIds.get(item.id),
    })),
  })
  const project = { ...snapshot.project, id: projectId, parentId: null }
  const saved: SavedWorkspace = {
    ...snapshot.workspace,
    id: `view-workspace-${namespace}`,
    projectId,
    views: { [projectId]: view },
  }
  const files = []
  for (const file of snapshot.files) {
    const record = {
      ...file,
      id: fileIds.get(file.id)!,
      projectId,
      document:
        file.id === originalView.activeId
          ? { ...file.document, viewport: snapshot.activeView.viewport }
          : file.document,
    }
    await store.save(record)
    files.push(record)
  }
  const workspace: WorkspaceState = {
    version: 1,
    preferences: saved.preferences,
    projects: [project],
    lastProjectId: projectId,
  }
  return {
    snapshot: { ...snapshot, workspace: saved, project, files },
    workspace,
    sessions: { version: 1, activeId: saved.id, items: [saved] },
    store,
    storageError: false,
  }
}
