import {
  createCanvasFileRecord,
  type CanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import { libraryKey, type LocalLibraryClient } from './localLibrary'
import { validCanvasId } from './lcanvas'
import { projectDescendants, type Project } from './workspace'
import {
  updateSavedWorkspace,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'

export type WorkspaceTrashItem = {
  kind: 'project' | 'file'
  id: string
  name: string
  projectId: string
  projectIds?: string[]
  removedAt: number
}
export type WorkspaceTrash = {
  version: 1
  workspaceId: string
  items: WorkspaceTrashItem[]
}
export const workspaceTrashKey = (id: string) =>
  libraryKey('settings', id).replace('settings:', 'settings:trash_')
const browserKey = (id: string) => `canvas-live.trash.v1:${id}`
const validReferenceId = (id: unknown): id is string =>
  validCanvasId(id) && !['__proto__', 'constructor', 'prototype'].includes(id)
export const emptyWorkspaceTrash = (workspaceId: string): WorkspaceTrash => ({
  version: 1,
  workspaceId,
  items: [],
})
export function parseWorkspaceTrash(
  value: unknown,
  workspaceId: string,
): WorkspaceTrash {
  if (!validReferenceId(workspaceId))
    throw new Error('Invalid workspace identifier.')
  if (value === null) return emptyWorkspaceTrash(workspaceId)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(
      'The workspace Trash could not be read. Existing items were retained.',
    )
  const source = value as Record<string, unknown>
  if (
    source.version !== 1 ||
    source.workspaceId !== workspaceId ||
    !Array.isArray(source.items) ||
    source.items.length > 2000
  )
    throw new Error(
      'The workspace Trash is invalid. Existing items were retained.',
    )
  const seen = new Set<string>()
  const items = source.items.map((item: unknown): WorkspaceTrashItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('An item in Trash is invalid.')
    const entry = item as Record<string, unknown>
    if (
      !['project', 'file'].includes(String(entry.kind)) ||
      !validReferenceId(entry.id) ||
      !validReferenceId(entry.projectId) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 200 ||
      !Number.isInteger(entry.removedAt) ||
      Number(entry.removedAt) < 0 ||
      Number(entry.removedAt) > 8_640_000_000_000_000 ||
      Object.keys(entry).some(
        (key) =>
          ![
            'kind',
            'id',
            'name',
            'projectId',
            'projectIds',
            'removedAt',
          ].includes(key),
      ) ||
      (entry.kind === 'project' &&
        (!Array.isArray(entry.projectIds) ||
          entry.projectIds.length > 100 ||
          !entry.projectIds.length ||
          !entry.projectIds.every(validReferenceId) ||
          !entry.projectIds.includes(entry.id))) ||
      (entry.kind === 'file' && entry.projectIds !== undefined)
    )
      throw new Error('An item in Trash is invalid.')
    const key = `${entry.kind}:${entry.id}`
    if (seen.has(key)) throw new Error('Trash contains a duplicate item.')
    seen.add(key)
    return {
      kind: entry.kind as WorkspaceTrashItem['kind'],
      id: entry.id,
      name: entry.name.trim(),
      projectId: entry.projectId,
      ...(entry.kind === 'project'
        ? { projectIds: [...new Set(entry.projectIds as string[])] }
        : {}),
      removedAt: Number(entry.removedAt),
    }
  })
  return { version: 1, workspaceId, items }
}
export function isFileInTrash(trash: WorkspaceTrash, id: string) {
  return trash.items.some((item) => item.kind === 'file' && item.id === id)
}
export function addToWorkspaceTrash(
  trash: WorkspaceTrash,
  item: WorkspaceTrashItem,
) {
  return parseWorkspaceTrash(
    {
      ...trash,
      items: [
        ...trash.items.filter(
          (old) => old.kind !== item.kind || old.id !== item.id,
        ),
        item,
      ],
    },
    trash.workspaceId,
  )
}
export function removeFromWorkspaceTrash(
  trash: WorkspaceTrash,
  item: WorkspaceTrashItem,
) {
  return {
    ...trash,
    items: trash.items.filter(
      (old) => old.kind !== item.kind || old.id !== item.id,
    ),
  }
}
export function createWorkspaceTrashStore(
  client: LocalLibraryClient | null,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
) {
  const cache = new Map<string, WorkspaceTrash>()
  function browser(workspaceId: string) {
    const raw = storage?.getItem(browserKey(workspaceId))
    return parseWorkspaceTrash(raw ? JSON.parse(raw) : null, workspaceId)
  }
  function remember(value: WorkspaceTrash, nativeSaved = false) {
    if (!storage && !nativeSaved)
      throw new Error('Trash could not be saved. The original was retained.')
    try {
      storage?.setItem(browserKey(value.workspaceId), JSON.stringify(value))
    } catch (error) {
      if (!nativeSaved) throw error
    }
    cache.set(value.workspaceId, value)
    return value
  }
  return {
    peek(workspaceId: string) {
      return cache.get(workspaceId) ?? browser(workspaceId)
    },
    async load(workspaceId: string) {
      if (!client?.available)
        return cache.get(workspaceId) ?? browser(workspaceId)
      const result = await client.read(workspaceTrashKey(workspaceId), true)
      return remember(
        result.value === null
          ? browser(workspaceId)
          : parseWorkspaceTrash(result.value, workspaceId),
        true,
      )
    },
    async update(
      workspaceId: string,
      change: (value: WorkspaceTrash) => WorkspaceTrash,
    ) {
      if (client?.available) {
        const result = await client.transform(
          workspaceTrashKey(workspaceId),
          (value) =>
            parseWorkspaceTrash(
              change(
                value === null
                  ? browser(workspaceId)
                  : parseWorkspaceTrash(value, workspaceId),
              ),
              workspaceId,
            ),
        )
        return remember(parseWorkspaceTrash(result.value, workspaceId), true)
      }
      return remember(
        parseWorkspaceTrash(
          change(cache.get(workspaceId) ?? browser(workspaceId)),
          workspaceId,
        ),
      )
    },
  }
}
export function requireActionWorkspace(
  sessions: WorkspaceSessions,
  id: string,
): SavedWorkspace {
  const item = sessions.items.find((item) => item.id === id)
  if (!item)
    throw new Error(
      'This workspace no longer exists. Choose a current destination.',
    )
  return item
}
export function requireWorkspaceActionItem(
  sessions: WorkspaceSessions,
  projects: Project[],
  workspaceId: string,
  item: { kind: 'project' | 'file'; id: string; projectId: string },
) {
  const workspace = requireActionWorkspace(sessions, workspaceId)
  if (
    !validReferenceId(item.id) ||
    !workspace.projectIds?.includes(item.projectId) ||
    !projects.some((project) => project.id === item.projectId) ||
    (item.kind === 'project' && item.id !== item.projectId)
  )
    throw new Error('This item is no longer in the source workspace.')
  return workspace
}
export function changeProjectMembership(
  sessions: WorkspaceSessions,
  workspaceId: string,
  projectIds: string[],
  add: boolean,
) {
  const item = requireActionWorkspace(sessions, workspaceId)
  const ids = new Set(projectIds)
  const owned = item.projectIds ?? []
  const remaining = add
    ? [...new Set([...owned, ...projectIds])]
    : owned.filter((id) => !ids.has(id))
  return updateSavedWorkspace(sessions, workspaceId, {
    projectIds: remaining,
    projectId:
      item.projectId && remaining.includes(item.projectId)
        ? item.projectId
        : null,
    ...(add
      ? {}
      : {
          views: Object.fromEntries(
            Object.entries(item.views).filter(([id]) => !ids.has(id)),
          ),
        }),
  })
}
export function visibleProjectTree(
  sessions: WorkspaceSessions,
  projects: Project[],
  workspaceId: string,
  id: string,
) {
  const item = requireActionWorkspace(sessions, workspaceId)
  if (
    !projects.some((project) => project.id === id) ||
    !item.projectIds?.includes(id)
  )
    throw new Error('This project is not in the source workspace.')
  const tree = projectDescendants(projects, id)
  return (item.projectIds ?? []).filter((id) => tree.has(id))
}
export function moveWorkspaceProject(
  sessions: WorkspaceSessions,
  projects: Project[],
  sourceId: string,
  destinationId: string,
  projectId: string,
) {
  if (sourceId === destinationId)
    throw new Error('Choose a different workspace.')
  requireActionWorkspace(sessions, destinationId)
  const ids = visibleProjectTree(sessions, projects, sourceId, projectId)
  return changeProjectMembership(
    changeProjectMembership(sessions, destinationId, ids, true),
    sourceId,
    ids,
    false,
  )
}
/** Commit the destination before a caller hides the recoverable original. */
export async function copyCanvasForMove(options: {
  store: CanvasFileStore
  sessions: WorkspaceSessions
  projects: Project[]
  sourceWorkspaceId: string
  destinationWorkspaceId: string
  destinationProjectId: string
  projectId: string
  fileId: string
}): Promise<{ record: CanvasFileRecord; existing: boolean }> {
  const source = requireActionWorkspace(
    options.sessions,
    options.sourceWorkspaceId,
  )
  const target = requireActionWorkspace(
    options.sessions,
    options.destinationWorkspaceId,
  )
  if (
    !source.projectIds?.includes(options.projectId) ||
    !options.projects.some((item) => item.id === options.projectId) ||
    !target.projectIds?.includes(options.destinationProjectId) ||
    !options.projects.some((item) => item.id === options.destinationProjectId)
  )
    throw new Error(
      'Choose a project that belongs to the destination workspace.',
    )
  const original = (await options.store.get(options.projectId, options.fileId))
    .value
  if (
    !original ||
    original.id !== options.fileId ||
    original.projectId !== options.projectId
  )
    throw new Error(
      'This canvas could not be loaded. The original was retained.',
    )
  if (options.projectId === options.destinationProjectId) {
    if (options.sourceWorkspaceId === options.destinationWorkspaceId)
      throw new Error('This canvas is already in that project.')
    return { record: original, existing: true }
  }
  const copy = createCanvasFileRecord(
    options.destinationProjectId,
    original.document,
  )
  const saved = await options.store.save(copy)
  if (saved.persistence === 'session')
    throw new Error(
      'The destination could not be saved durably. The original was retained; retry after storage is available.',
    )
  return { record: saved.value, existing: false }
}
