import { canvasFileStore } from './canvasFiles'
import { loadLayout, persistLayout } from './layout'
import {
  initializeLocalLibrary,
  libraryKey,
  localLibrary,
} from './localLibrary'
import { persistLinkOptions } from './liveViewLinks'
import {
  loadWorkspace,
  parseWorkspace,
  persistWorkspace,
  type WorkspaceState,
} from './workspace'
import {
  loadWorkspaceSessions,
  parseSavedWorkspace,
  persistWorkspaceSessions,
  SESSIONS_STORAGE_KEY,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
/** Apply this view's changed fields without discarding independent nested choices. */
function mergeLocalFields<T extends object>(remote: T, before: T, after: T): T {
  const next = { ...remote }
  for (const field of Object.keys(after)) {
    const old = Reflect.get(before, field)
    const value = Reflect.get(after, field)
    const saved = Reflect.get(remote, field)
    if (record(old) && record(value) && record(saved))
      Object.assign(next, { [field]: mergeLocalFields(saved, old, value) })
    else if (JSON.stringify(old) !== JSON.stringify(value))
      Object.assign(next, { [field]: value })
  }
  return next
}
/** Canonical storage must never interpret damaged core data as a new empty library. */
export function parseLibraryWorkspace(value: unknown): WorkspaceState | null {
  try {
    if (
      !record(value) ||
      value.version !== 1 ||
      !Array.isArray(value.projects) ||
      value.projects.length > 100 ||
      !record(value.preferences)
    )
      return null
    const preferences = value.preferences
    if (
      !['system', 'light', 'dark'].includes(preferences.mode as string) ||
      typeof preferences.accent !== 'string' ||
      !/^#[\da-f]{6}$/iu.test(preferences.accent) ||
      !['comfortable', 'compact'].includes(preferences.density as string) ||
      !['dots', 'lines', 'none'].includes(preferences.grid as string) ||
      typeof preferences.reduceMotion !== 'boolean'
    )
      return null
    const parsed = parseWorkspace(JSON.stringify(value))
    if (parsed.projects.length !== value.projects.length) return null
    return parsed
  } catch {
    return null
  }
}
function requireLibraryWorkspace(value: unknown): WorkspaceState {
  const parsed = parseLibraryWorkspace(value)
  if (!parsed)
    throw new Error(
      'The saved local project library is invalid. Existing data was retained; export your open work before repairing the library.',
    )
  return parsed
}
export function parseLibrarySessions(value: unknown): WorkspaceSessions | null {
  try {
    if (
      !record(value) ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length < 1 ||
      value.items.length > 100
    )
      return null
    const state = value as unknown as WorkspaceSessions
    const items = state.items.map((item) => {
      if (
        !record(item) ||
        !record(item.preferences) ||
        !record(item.layout) ||
        !record(item.views) ||
        !parseLibraryWorkspace({
          version: 1,
          projects: [],
          preferences: item.preferences,
          lastProjectId: null,
        })
      )
        throw new Error('Invalid workspace settings.')
      const parsed = parseSavedWorkspace(
        JSON.stringify({
          format: 'CanvasLiveWorkspace',
          version: 1,
          workspace: item,
        }),
        item.id,
      )
      for (const key of Object.keys(
        item.layout,
      ) as (keyof typeof parsed.layout)[])
        if (
          key in parsed.layout &&
          JSON.stringify(item.layout[key]) !==
            JSON.stringify(parsed.layout[key])
        )
          throw new Error('Invalid workspace layout.')
      return parsed
    })
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      !items.some((item) => item.id === state.activeId)
    )
      return null
    return {
      version: 1,
      activeId: items.some((item) => item.id === state.activeId)
        ? state.activeId
        : items[0].id,
      items,
    }
  } catch {
    return null
  }
}
function requireLibrarySessions(value: unknown): WorkspaceSessions {
  const parsed = parseLibrarySessions(value)
  if (!parsed)
    throw new Error(
      'The saved local workspaces are invalid. Existing data was retained; export your open work before repairing the library.',
    )
  return parsed
}
export const METADATA_LIBRARY_KEY = libraryKey('metadata', 'main')
export const SESSIONS_LIBRARY_KEY = libraryKey('sessions', 'main')

/** Merge only changes made by this view, retaining unrelated changes in others. */
export function mergeWorkspaceChanges(
  remote: WorkspaceState,
  before: WorkspaceState,
  after: WorkspaceState,
): WorkspaceState {
  const projects = [...remote.projects]
  for (const project of after.projects) {
    const old = before.projects.find((item) => item.id === project.id)
    const index = projects.findIndex((item) => item.id === project.id)
    if (index < 0) projects.push(project)
    else if (old) {
      const next = { ...projects[index] }
      for (const field of [
        'name',
        'parentId',
        'presentation',
        'updatedAt',
      ] as const)
        if (JSON.stringify(old[field]) !== JSON.stringify(project[field]))
          Object.assign(next, { [field]: project[field] })
      projects[index] = next
    }
  }
  const preferences = mergeLocalFields(
    remote.preferences,
    before.preferences,
    after.preferences,
  )
  if (projects.length > 100)
    throw new Error('The local library already has 100 projects.')
  return requireLibraryWorkspace({ ...remote, preferences, projects })
}
export function syncWorkspaceChanges(
  before: WorkspaceState,
  after: WorkspaceState,
) {
  if (!localLibrary.available) return Promise.resolve()
  const relevant = (value: WorkspaceState) =>
    JSON.stringify({
      projects: value.projects.map(
        ({ id, name, parentId, presentation, updatedAt }) => ({
          id,
          name,
          parentId,
          presentation,
          updatedAt,
        }),
      ),
      preferences: value.preferences,
    })
  if (relevant(before) === relevant(after)) return Promise.resolve()
  return localLibrary
    .transform<WorkspaceState>(METADATA_LIBRARY_KEY, (value) =>
      mergeWorkspaceChanges(
        value === null ? before : requireLibraryWorkspace(value),
        before,
        after,
      ),
    )
    .then(() => undefined)
}
export function syncSessionChanges(
  before: WorkspaceSessions,
  after: WorkspaceSessions,
) {
  if (!localLibrary.available) return Promise.resolve()
  const relevant = (value: WorkspaceSessions) =>
    JSON.stringify(
      value.items.map(({ id, name, preferences, layout, lastOpenedAt }) => ({
        id,
        name,
        preferences,
        layout,
        lastOpenedAt,
      })),
    )
  if (relevant(before) === relevant(after)) return Promise.resolve()
  return localLibrary
    .transform<WorkspaceSessions>(SESSIONS_LIBRARY_KEY, (value) => {
      const remote = value === null ? before : requireLibrarySessions(value)
      const items = [...remote.items]
      for (const item of after.items) {
        const previous = before.items.find((old) => old.id === item.id)
        const index = items.findIndex((old) => old.id === item.id)
        if (index < 0) items.push(item)
        else if (previous) {
          const patch: Partial<SavedWorkspace> = {}
          if (previous.name !== item.name) patch.name = item.name
          if (previous.lastOpenedAt !== item.lastOpenedAt)
            patch.lastOpenedAt = Math.max(
              items[index].lastOpenedAt ?? 0,
              item.lastOpenedAt ?? 0,
            )
          for (const key of ['preferences', 'layout'] as const) {
            const merged = mergeLocalFields(
              items[index][key],
              previous[key],
              item[key],
            )
            if (JSON.stringify(merged) !== JSON.stringify(items[index][key]))
              Object.assign(patch, { [key]: merged })
          }
          if (Object.keys(patch).some((key) => key !== 'lastOpenedAt'))
            patch.updatedAt = Math.max(
              items[index].updatedAt ?? 0,
              item.updatedAt ?? 0,
            )
          items[index] = { ...items[index], ...patch }
        }
      }
      if (items.length > 100)
        throw new Error('The local library already has 100 workspaces.')
      return requireLibrarySessions({ ...remote, items })
    })
    .then(() => undefined)
}

export async function bootstrapLocalLibrary(): Promise<{
  available: boolean
  error?: string
}> {
  const availability = await initializeLocalLibrary()
  if (!availability.available) return availability
  try {
    const browser = loadWorkspace()
    const browserSessionsPresent =
      localStorage.getItem(SESSIONS_STORAGE_KEY) !== null
    const browserSessions = loadWorkspaceSessions(
      browser.preferences,
      loadLayout(),
      browser.lastProjectId,
    )
    const previousMetadata = localLibrary.cached(METADATA_LIBRARY_KEY)
    const previousSessions = localLibrary.cached(SESSIONS_LIBRARY_KEY)
    if (previousMetadata.revision)
      requireLibraryWorkspace(previousMetadata.value)
    if (previousSessions.revision)
      requireLibrarySessions(previousSessions.value)
    // Existing browser saves migrate only if their identifiers have no native copy.
    for (const project of browser.projects) {
      const files = await canvasFileStore.list(project.id)
      for (const file of files.value) {
        const key = libraryKey('file', file.id)
        if (!localLibrary.cached(key).revision)
          await localLibrary.write(key, file, 0)
      }
    }
    const metadata = await localLibrary.transform<WorkspaceState>(
      METADATA_LIBRARY_KEY,
      (remote) => {
        if (remote === null) return browser
        const current = requireLibraryWorkspace(remote)
        const projects = [
          ...current.projects,
          ...browser.projects.filter(
            (project) =>
              !current.projects.some((item) => item.id === project.id),
          ),
        ]
        if (projects.length > 100)
          throw new Error(
            'The combined library exceeds 100 projects. Export a project before migrating more.',
          )
        return { ...current, projects }
      },
    )
    const workspace = requireLibraryWorkspace(metadata.value)
    const sessions = await localLibrary.transform<WorkspaceSessions>(
      SESSIONS_LIBRARY_KEY,
      (remote) => {
        if (remote === null) return browserSessions
        const existing = requireLibrarySessions(remote)
        const extras = browserSessionsPresent
          ? browserSessions.items.filter(
              (item) => !existing.items.some((old) => old.id === item.id),
            )
          : []
        if (existing.items.length + extras.length > 100)
          throw new Error('The combined library exceeds 100 workspaces.')
        return { ...existing, items: [...existing.items, ...extras] }
      },
    )
    const saved = requireLibrarySessions(sessions.value)
    const active = saved.items.find((item) => item.id === saved.activeId)!
    persistWorkspace(workspace)
    persistWorkspaceSessions(saved)
    persistLayout(active.layout)
    const links = localLibrary.cached(libraryKey('settings', 'links')).value
    if (links && typeof links === 'object') {
      const keys = [
        'exactEnabled',
        'latestEnabled',
        'resumeLatest',
        'rememberCamera',
        'rememberPanels',
      ] as const
      if (
        keys.every(
          (key) => typeof (links as Record<string, unknown>)[key] === 'boolean',
        )
      )
        persistLinkOptions(links as Parameters<typeof persistLinkOptions>[0])
    }
    return availability
  } catch (failure) {
    return {
      available: true,
      error:
        failure instanceof Error
          ? failure.message
          : 'The local library could not be opened. Existing copies were retained.',
    }
  }
}
