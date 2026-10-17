import type { EditorViewState } from './CanvasEditor'
import { canvasFileStore, type CanvasFileStore } from './canvasFiles'
import type { WorkspaceLayout } from './layout'
import {
  DEFAULT_LINK_OPTIONS,
  LIVE_LINK_MAX_URL_LENGTH,
  LiveViewLinkError,
  normalizeLiveViewState,
  type LinkOptions,
  type LiveViewState,
} from './liveViewLinks'
import { libraryKey, localLibrary, sharedCanvasFileStore } from './localLibrary'
import {
  METADATA_LIBRARY_KEY,
  parseLibrarySessions,
  SESSIONS_LIBRARY_KEY,
} from './librarySync'
import { validCanvasId, type CanvasViewport } from './lcanvas'
import {
  loadWorkspace,
  parseWorkspace,
  STORAGE_KEY,
  STORAGE_BACKUP_KEY,
  type WorkspaceState,
} from './workspace'
import {
  SESSIONS_STORAGE_KEY,
  type WorkspaceSessions,
} from './workspaceSessions'

export const LATEST_WORKSPACE_STORAGE_KEY = 'canvas-live.latest.workspace'
const LATEST_STORAGE_PREFIX = 'canvas-live.latest.'
const RESUME_LIBRARY_KEY = libraryKey('settings', 'resume')

type ResumePointer = { workspaceId: string; updatedAt: number }
export type LiveViewLaunch = {
  workspace: WorkspaceState
  sessions: WorkspaceSessions
  layout: WorkspaceLayout
  view: LiveViewState
  initialCameras: Record<string, CanvasViewport>
  initialView?: EditorViewState
  fileStore: CanvasFileStore
  section: LiveViewState['section']
}

function fail(message: string): never {
  throw new LiveViewLinkError(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function identifier(value: unknown): value is string {
  return (
    validCanvasId(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  )
}
function requireIdentifier(value: unknown): asserts value is string {
  if (!identifier(value)) fail('The saved workspace identifier is invalid.')
}
export function latestViewStorageKey(workspaceId: string): string {
  requireIdentifier(workspaceId)
  let encoded: string
  try {
    encoded = encodeURIComponent(workspaceId)
  } catch {
    return fail('The saved workspace identifier contains invalid text.')
  }
  // The logical ID "workspace" must not overwrite the global pointer. Encode
  // percent signs too, so a literal "%77orkspace" cannot alias this exception.
  if (encoded === 'workspace') encoded = '%77orkspace'
  return `${LATEST_STORAGE_PREFIX}${encoded}`
}
function timestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}
function resumePointer(value: unknown): ResumePointer | null {
  if (value === null) return null
  if (
    !record(value) ||
    !identifier(value.workspaceId) ||
    !timestamp(value.updatedAt)
  )
    return fail(
      'The latest-workspace record is damaged. Open a workspace directly to continue.',
    )
  return { workspaceId: value.workspaceId, updatedAt: value.updatedAt }
}
function latestView(value: unknown, workspaceId: string): LiveViewState {
  let normalized: LiveViewState
  try {
    normalized = normalizeLiveViewState(value)
  } catch {
    return fail(
      'The saved latest view is damaged or unsupported. Open the workspace directly to continue.',
    )
  }
  if (normalized.workspaceId !== workspaceId)
    return fail('The saved latest view belongs to another workspace.')
  return normalized
}
function readBrowserView(workspaceId: string): LiveViewState | null {
  const raw = localStorage.getItem(latestViewStorageKey(workspaceId))
  if (raw === null) return null
  if (raw.length > LIVE_LINK_MAX_URL_LENGTH)
    return fail('The saved latest view exceeds its size limit.')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail(
      'The saved latest view contains damaged JSON. Open the workspace directly to continue.',
    )
  }
  return latestView(parsed, workspaceId)
}
function readBrowserPointer(): ResumePointer | null {
  const workspaceId = localStorage.getItem(LATEST_WORKSPACE_STORAGE_KEY)
  if (workspaceId === null) return null
  requireIdentifier(workspaceId)
  const view = readBrowserView(workspaceId)
  if (!view)
    return fail(
      'The latest workspace has no saved view. Open the workspace directly to continue.',
    )
  return { workspaceId, updatedAt: view.updatedAt }
}
function freshest(
  browser: LiveViewState | null,
  native: LiveViewState | null,
): LiveViewState | null {
  // The shared native copy wins ties, so different browser profiles agree.
  if (!browser) return native
  if (!native) return browser
  return native.updatedAt >= browser.updatedAt ? native : browser
}

/** Browser storage is updated before the first await, including on pagehide. */
export async function saveLatestLiveView(input: LiveViewState): Promise<void> {
  const view = normalizeLiveViewState(input)
  let browserFailure: unknown
  try {
    const previous = readBrowserView(view.workspaceId)
    const pointer = readBrowserPointer()
    if (!previous || previous.updatedAt <= view.updatedAt)
      localStorage.setItem(
        latestViewStorageKey(view.workspaceId),
        JSON.stringify(view),
      )
    if (!pointer || pointer.updatedAt <= view.updatedAt)
      localStorage.setItem(LATEST_WORKSPACE_STORAGE_KEY, view.workspaceId)
  } catch (failure) {
    browserFailure = failure
  }
  if (!localLibrary.available) {
    if (browserFailure) throw browserFailure
    return
  }
  const saved = await localLibrary.transform<LiveViewState>(
    libraryKey('latest', view.workspaceId),
    (value) => {
      const current =
        value === null ? null : latestView(value, view.workspaceId)
      return current && current.updatedAt > view.updatedAt ? current : view
    },
  )
  const latest = latestView(saved.value, view.workspaceId)
  await localLibrary.transform<ResumePointer>(RESUME_LIBRARY_KEY, (value) => {
    const current = resumePointer(value)
    return current && current.updatedAt > latest.updatedAt
      ? current
      : { workspaceId: latest.workspaceId, updatedAt: latest.updatedAt }
  })
}

/** Missing records return null; damaged records never turn into a new workspace. */
export async function readLatestLiveView(
  workspaceId?: string,
): Promise<LiveViewState | null> {
  if (workspaceId !== undefined) requireIdentifier(workspaceId)
  let browserPointer: ResumePointer | null = null
  let browser: LiveViewState | null = null
  try {
    if (workspaceId === undefined) browserPointer = readBrowserPointer()
    if (workspaceId !== undefined) browser = readBrowserView(workspaceId)
  } catch (failure) {
    if (failure instanceof LiveViewLinkError || !localLibrary.available)
      throw failure
  }
  let selectedId = workspaceId ?? browserPointer?.workspaceId
  if (!localLibrary.available)
    return selectedId ? (browser ?? readBrowserView(selectedId)) : null

  if (workspaceId === undefined) {
    const savedPointer = await localLibrary.read(RESUME_LIBRARY_KEY, true)
    const nativePointer = resumePointer(savedPointer.value)
    if (
      nativePointer &&
      (!browserPointer || nativePointer.updatedAt >= browserPointer.updatedAt)
    )
      selectedId = nativePointer.workspaceId
  }
  if (!selectedId) return null
  try {
    browser = readBrowserView(selectedId)
  } catch (failure) {
    if (failure instanceof LiveViewLinkError) throw failure
    browser = null
  }
  const saved = await localLibrary.read(libraryKey('latest', selectedId), true)
  const native =
    saved.value === null ? null : latestView(saved.value, selectedId)
  const result = freshest(browser, native)
  if (!result && workspaceId === undefined)
    return fail(
      'The latest workspace has no saved view. Open the workspace directly to continue.',
    )
  return result
}

function canonicalWorkspace(value: unknown): WorkspaceState {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.preferences) ||
    !Array.isArray(value.projects)
  )
    return fail(
      'The local workspace metadata is damaged. Existing files were retained.',
    )
  const workspace = parseWorkspace(JSON.stringify(value))
  if (
    workspace.projects.length !== value.projects.length ||
    (['mode', 'accent', 'density', 'grid', 'reduceMotion'] as const).some(
      (field) =>
        workspace.preferences[field] !==
        (value.preferences as Record<string, unknown>)[field],
    )
  )
    return fail(
      'The local workspace metadata is damaged. Existing files were retained.',
    )
  return workspace
}

function browserCanonicalData(): {
  workspace: WorkspaceState
  sessions: WorkspaceSessions
} {
  let workspace: WorkspaceState | undefined
  let metadataFailure: unknown
  for (const key of [STORAGE_KEY, STORAGE_BACKUP_KEY]) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      workspace = canonicalWorkspace(JSON.parse(raw))
      break
    } catch (failure) {
      metadataFailure = failure
    }
  }
  if (!workspace && metadataFailure)
    return fail(
      'The local workspace metadata is damaged. Existing files were retained.',
    )
  workspace ??= loadWorkspace()
  for (const key of [SESSIONS_STORAGE_KEY, `${SESSIONS_STORAGE_KEY}.backup`]) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      const value: unknown = JSON.parse(raw)
      const sessions =
        record(value) && value.version === 1
          ? parseLibrarySessions(value)
          : null
      if (sessions) return { workspace, sessions }
    } catch {
      /* Try the independent last-good UI workspace list. */
    }
  }
  return fail(
    'This workspace is unavailable or its local workspace list is damaged. Open it in Canvas Live first.',
  )
}

/** Resolve references against current local data; never import captured file copies. */
export async function resolveLiveView(
  input: LiveViewState,
  options: LinkOptions = DEFAULT_LINK_OPTIONS,
): Promise<LiveViewLaunch> {
  const captured = normalizeLiveViewState(input)
  let workspace: WorkspaceState
  let sessions: WorkspaceSessions
  if (localLibrary.available) {
    const [metadata, savedSessions] = await Promise.all([
      localLibrary.read(METADATA_LIBRARY_KEY, true),
      localLibrary.read(SESSIONS_LIBRARY_KEY, true),
    ])
    if (metadata.value === null || savedSessions.value === null)
      return fail(
        'This workspace is not available in the local library. Open it in Canvas Live first.',
      )
    workspace = canonicalWorkspace(metadata.value)
    const parsed =
      record(savedSessions.value) && savedSessions.value.version === 1
        ? parseLibrarySessions(savedSessions.value)
        : null
    if (!parsed)
      return fail(
        'The local workspace list is damaged. Existing files were retained.',
      )
    sessions = parsed
  } else {
    ;({ workspace, sessions } = browserCanonicalData())
  }
  const canonical = sessions.items.find(
    (item) => item.id === captured.workspaceId,
  )
  if (!canonical)
    return fail(
      'This workspace is not available on this device. Open it in Canvas Live before using its link.',
    )
  const projects = workspace.projects.map((project) => {
    const presentation = captured.projectPresentation[project.id]
    return presentation
      ? {
          ...project,
          ...presentation,
          lastOpenedAt: Math.max(project.createdAt, presentation.lastOpenedAt),
        }
      : project
  })
  const projectId = projects.some(
    (project) => project.id === captured.projectId,
  )
    ? captured.projectId
    : null
  const projectIds = new Set(projects.map((project) => project.id))
  const layout = options.rememberPanels
    ? captured.workspace.layout
    : canonical.layout
  const active = {
    ...captured.workspace,
    name: canonical.name,
    projectId,
    layout,
    views: Object.fromEntries(
      Object.entries(captured.workspace.views).filter(([id]) =>
        projectIds.has(id),
      ),
    ),
  }
  const section =
    captured.section === 'work' && projectId === null
      ? 'home'
      : captured.section
  const view: LiveViewState = {
    ...captured,
    workspace: active,
    projectId,
    activeView: projectId === null ? null : captured.activeView,
    section,
  }
  return {
    workspace: {
      ...workspace,
      preferences: active.preferences,
      projects,
      lastProjectId: projectId,
    },
    sessions: {
      ...sessions,
      activeId: active.id,
      items: sessions.items.map((item) =>
        item.id === active.id ? active : item,
      ),
    },
    layout,
    view,
    initialCameras: options.rememberCamera
      ? structuredClone(captured.cameras)
      : {},
    ...(options.rememberCamera && view.activeView
      ? { initialView: structuredClone(view.activeView) }
      : {}),
    fileStore: localLibrary.available ? sharedCanvasFileStore : canvasFileStore,
    section,
  }
}
