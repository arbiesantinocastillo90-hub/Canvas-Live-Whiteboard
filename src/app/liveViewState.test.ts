import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canvasFileStore, createCanvasFileRecord } from './canvasFiles'
import { DEFAULT_LAYOUT } from './layout'
import {
  DEFAULT_LINK_OPTIONS,
  parseLiveLink,
  type LiveViewState,
} from './liveViewLinks'
import {
  libraryKey,
  localLibrary,
  sharedCanvasFileStore,
  type LibraryEntry,
  type LocalLibraryClient,
} from './localLibrary'
import { METADATA_LIBRARY_KEY, SESSIONS_LIBRARY_KEY } from './librarySync'
import { createCanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'
import {
  DEFAULT_PREFERENCES,
  EMPTY_STATE,
  persistWorkspace,
  STORAGE_KEY,
  STORAGE_BACKUP_KEY,
  type WorkspaceState,
} from './workspace'
import {
  createSavedWorkspace,
  normalizeProjectView,
  persistWorkspaceSessions,
  SESSIONS_STORAGE_KEY,
  type WorkspaceSessions,
} from './workspaceSessions'
import {
  LATEST_WORKSPACE_STORAGE_KEY,
  latestViewStorageKey,
  readLatestLiveView,
  resolveLiveView,
  saveLatestLiveView,
} from './liveViewState'

function fixture() {
  const metadata: WorkspaceState = {
    ...EMPTY_STATE,
    preferences: { ...DEFAULT_PREFERENCES },
    projects: [
      {
        id: 'project',
        name: 'Current project name',
        createdAt: 10,
        lastOpenedAt: 1000,
        pinned: false,
        recentHidden: false,
      },
      {
        id: 'other',
        name: 'Other current project',
        createdAt: 20,
        lastOpenedAt: 1000,
        pinned: true,
      },
    ],
    lastProjectId: 'other',
  }
  const canonical = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    { ...DEFAULT_LAYOUT, rightPanel: 'ai', rightPinned: false },
    'project',
    'Current workspace name',
    'workspace',
  )
  canonical.views.project = normalizeProjectView({
    openIds: ['file-b'],
    activeId: 'file-b',
  })
  const other = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    'other',
    'Other workspace',
    'other-workspace',
  )
  const sessions: WorkspaceSessions = {
    version: 1,
    activeId: other.id,
    items: [canonical, other],
  }
  const workspace = structuredClone(canonical)
  workspace.name = 'Old copied workspace name'
  workspace.preferences = { ...DEFAULT_PREFERENCES, mode: 'dark', contrast: 80 }
  workspace.layout = {
    ...DEFAULT_LAYOUT,
    filesOpen: true,
    leftPinned: true,
    rightPanel: 'tools',
    rightPinned: true,
  }
  workspace.views.project = normalizeProjectView({
    openIds: ['file-a', 'file-b'],
    activeId: 'file-a',
    tabs: [{ id: 'file-a', pinned: true, compact: true, groupId: 'ideas' }],
    groups: [{ id: 'ideas', name: 'Captured tabs', collapsed: false }],
    shortcuts: [{ id: 'file-b', pinned: true, hidden: false }],
    editorSession: { tool: 'connect', activeLayerId: 'layer-main' },
  })
  const view: LiveViewState = {
    format: 'CanvasLiveLink',
    version: 2,
    workspaceId: 'workspace',
    workspace,
    projectId: 'project',
    projectPresentation: {
      project: { pinned: true, recentHidden: true, lastOpenedAt: 100 },
    },
    cameras: {
      'file-a': { x: 123.5, y: -41, zoom: 1.8 },
      'file-b': { x: 1, y: 2, zoom: 0.5 },
    },
    activeView: {
      viewport: { x: 123.5, y: -41, zoom: 1.8 },
      selectedIds: ['shape'],
      tool: 'connect',
      activeLayerId: 'layer-main',
      connection: {
        arrowStyle: 'both',
        style: 'elbow',
        sourceSide: 'left',
        targetSide: 'right',
      },
    },
    section: 'work',
    updatedAt: 200,
  }
  return { metadata, sessions, view }
}
function browserData(source = fixture()) {
  expect(persistWorkspace(source.metadata)).toBe(true)
  expect(persistWorkspaceSessions(source.sessions)).toBe(true)
  return source
}
function nativeData(source = fixture()) {
  const values = new Map<string, LibraryEntry>([
    [
      METADATA_LIBRARY_KEY,
      { revision: 1, value: structuredClone(source.metadata) },
    ],
    [
      SESSIONS_LIBRARY_KEY,
      { revision: 1, value: structuredClone(source.sessions) },
    ],
  ])
  vi.spyOn(localLibrary, 'available', 'get').mockReturnValue(true)
  const read: LocalLibraryClient['read'] = async <T>(key: string) =>
    structuredClone(
      values.get(key) ?? { revision: 0, value: null },
    ) as LibraryEntry<T>
  const transform: LocalLibraryClient['transform'] = async <T>(
    key: string,
    update: (value: T | null) => T,
  ) => {
    const before = values.get(key) ?? { revision: 0, value: null }
    const next = {
      revision: before.revision + 1,
      value: update(structuredClone(before.value) as T | null),
    }
    values.set(key, structuredClone(next))
    return next
  }
  const reads = vi.spyOn(localLibrary, 'read').mockImplementation(read)
  const transforms = vi
    .spyOn(localLibrary, 'transform')
    .mockImplementation(transform)
  return { ...source, values, reads, transforms }
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(localLibrary, 'available', 'get').mockReturnValue(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('latest live view persistence', () => {
  it('keeps all workspace record keys distinct from the global pointer', () => {
    const keys = [
      'workspace',
      '%77orkspace',
      'workspace-世界',
      'plain-uuid',
    ].map(latestViewStorageKey)
    expect(new Set(keys).size).toBe(4)
    expect(keys).not.toContain(LATEST_WORKSPACE_STORAGE_KEY)
    expect(latestViewStorageKey('plain-uuid')).toBe(
      'canvas-live.latest.plain-uuid',
    )
  })

  it('updates browser state synchronously before awaiting any native work', async () => {
    const { view } = fixture()
    const saved = saveLatestLiveView(view)
    expect(
      JSON.parse(localStorage.getItem(latestViewStorageKey(view.workspaceId))!),
    ).toEqual(view)
    expect(localStorage.getItem(LATEST_WORKSPACE_STORAGE_KEY)).toBe(
      view.workspaceId,
    )
    await saved
    expect(await readLatestLiveView()).toEqual(view)
  })

  it('keeps newer states and moves the latest-workspace pointer only forward', async () => {
    const { view } = fixture()
    await saveLatestLiveView(view)
    const older = { ...view, updatedAt: 100, cameras: {} }
    await saveLatestLiveView(older)
    expect(await readLatestLiveView(view.workspaceId)).toEqual(view)
    const other = structuredClone(view)
    other.workspaceId = other.workspace.id = 'other-workspace'
    other.updatedAt = 150
    await saveLatestLiveView(other)
    expect(localStorage.getItem(LATEST_WORKSPACE_STORAGE_KEY)).toBe('workspace')
    other.updatedAt = 300
    await saveLatestLiveView(other)
    expect((await readLatestLiveView())?.workspaceId).toBe('other-workspace')
  })

  it('publishes independent native view records and a monotonic shared resume pointer', async () => {
    const native = nativeData()
    await saveLatestLiveView(native.view)
    expect(native.values.get(libraryKey('latest', 'workspace'))?.value).toEqual(
      native.view,
    )
    expect(native.values.get(libraryKey('settings', 'resume'))?.value).toEqual({
      workspaceId: 'workspace',
      updatedAt: 200,
    })
    const older = { ...native.view, updatedAt: 10, cameras: {} }
    await saveLatestLiveView(older)
    expect(native.values.get(libraryKey('latest', 'workspace'))?.value).toEqual(
      native.view,
    )
    expect(native.values.get(libraryKey('settings', 'resume'))?.value).toEqual({
      workspaceId: 'workspace',
      updatedAt: 200,
    })
    expect(
      native.transforms.mock.calls.every(
        ([key]) => key.startsWith('latest:') || key.startsWith('settings:'),
      ),
    ).toBe(true)
  })

  it('moves the saved latest view after a later tab, camera and panel interaction', async () => {
    const native = nativeData()
    await saveLatestLiveView(native.view)
    const next = structuredClone(native.view)
    next.updatedAt = 300
    next.workspace.views.project.activeId = 'file-b'
    next.workspace.layout.rightPanel = 'properties'
    next.cameras['file-b'] = { x: -200, y: 90, zoom: 0.75 }
    next.activeView = {
      viewport: next.cameras['file-b'],
      selectedIds: [],
      tool: 'pan',
      activeLayerId: 'layer-main',
    }
    await saveLatestLiveView(next)
    expect(await readLatestLiveView()).toEqual(next)
    expect(native.values.get(libraryKey('settings', 'resume'))?.value).toEqual({
      workspaceId: 'workspace',
      updatedAt: 300,
    })
    expect(native.values.get(METADATA_LIBRARY_KEY)?.value).toEqual(
      native.metadata,
    )
    expect(native.values.get(SESSIONS_LIBRARY_KEY)?.value).toEqual(
      native.sessions,
    )
  })

  it('chooses fresh native or browser records by timestamp, keeping native tie results', async () => {
    const native = nativeData()
    await saveLatestLiveView(native.view)
    const remote = structuredClone(native.view)
    remote.updatedAt = 500
    remote.cameras['file-a'].x = 555
    native.values.set(libraryKey('latest', 'workspace'), {
      revision: 4,
      value: remote,
    })
    expect(await readLatestLiveView('workspace')).toEqual(remote)
    const browser = structuredClone(remote)
    browser.updatedAt = 600
    browser.cameras['file-a'].x = 777
    localStorage.setItem(
      latestViewStorageKey('workspace'),
      JSON.stringify(browser),
    )
    expect(await readLatestLiveView('workspace')).toEqual(browser)
    remote.updatedAt = 600
    native.values.set(libraryKey('latest', 'workspace'), {
      revision: 5,
      value: remote,
    })
    expect(await readLatestLiveView('workspace')).toEqual(remote)
    expect(
      native.reads.mock.calls.every(([, refresh]) => refresh === true),
    ).toBe(true)
  })

  it('restores the shared latest workspace in another browser profile without cloning files', async () => {
    const native = nativeData()
    await saveLatestLiveView(native.view)
    localStorage.clear()
    expect(await readLatestLiveView()).toEqual(native.view)
    expect(localStorage.getItem(SESSIONS_STORAGE_KEY)).toBeNull()
    expect(native.values.size).toBe(4)
  })

  it('returns null for absent views and rejects damaged JSON, wrong identities, or incomplete pointers', async () => {
    expect(await readLatestLiveView()).toBeNull()
    expect(await readLatestLiveView('unknown')).toBeNull()
    localStorage.setItem(latestViewStorageKey('workspace'), '{broken')
    await expect(readLatestLiveView('workspace')).rejects.toThrow(
      /damaged JSON/u,
    )
    localStorage.setItem(
      latestViewStorageKey('workspace'),
      JSON.stringify(fixture().view),
    )
    localStorage.setItem(LATEST_WORKSPACE_STORAGE_KEY, 'unknown')
    await expect(readLatestLiveView()).rejects.toThrow(/no saved view/u)
    const native = nativeData()
    native.values.set(libraryKey('latest', 'unknown'), {
      revision: 1,
      value: native.view,
    })
    await expect(readLatestLiveView('unknown')).rejects.toThrow(
      /another workspace/u,
    )
  })

  it('validates camera limits and identities before changing saved latest records', async () => {
    const { view } = fixture()
    await saveLatestLiveView(view)
    const broken = structuredClone(view)
    broken.cameras['file-a'].zoom = 9
    await expect(saveLatestLiveView(broken)).rejects.toThrow(/camera/u)
    expect(await readLatestLiveView('workspace')).toEqual(view)
    await expect(readLatestLiveView('__proto__')).rejects.toThrow(/identifier/u)
  })
})

describe('live reference resolution', () => {
  it('preserves canonical names and IDs while restoring captured UI and local project presentation', async () => {
    const source = browserData()
    const before = new Map(Object.entries(localStorage))
    const launch = await resolveLiveView(source.view)
    expect(launch.workspace.projects.map((project) => project.id)).toEqual([
      'project',
      'other',
    ])
    expect(launch.workspace.projects[0]).toMatchObject({
      id: 'project',
      name: 'Current project name',
      pinned: true,
      recentHidden: true,
      lastOpenedAt: 100,
    })
    expect(launch.workspace.projects[1]).toEqual(source.metadata.projects[1])
    expect(launch.workspace.preferences).toEqual(
      source.view.workspace.preferences,
    )
    expect(launch.sessions.activeId).toBe('workspace')
    expect(launch.sessions.items.map((item) => item.id)).toEqual([
      'workspace',
      'other-workspace',
    ])
    expect(launch.sessions.items[0]).toMatchObject({
      id: 'workspace',
      name: 'Current workspace name',
      views: source.view.workspace.views,
      layout: source.view.workspace.layout,
    })
    expect(launch.sessions.items[1]).toEqual(source.sessions.items[1])
    expect(launch.initialCameras).toEqual(source.view.cameras)
    expect(launch.initialView).toEqual(source.view.activeView)
    expect(launch.fileStore).toBe(canvasFileStore)
    expect(new Map(Object.entries(localStorage))).toEqual(before)
  })

  it('reads current native file contents and names without copying or overwriting old content', async () => {
    const native = nativeData()
    const document = createElement(createCanvasDocument('Latest file name'), {
      type: 'rectangle',
      id: 'shape',
      x: 40,
      y: 50,
      width: 100,
      height: 80,
      text: 'Current content changed after copying',
    })
    const file = createCanvasFileRecord('project', document, 100, 'file-a')
    native.values.set(libraryKey('file', 'file-a'), {
      revision: 8,
      value: file,
    })
    const launch = await resolveLiveView(native.view)
    expect(launch.fileStore).toBe(sharedCanvasFileStore)
    expect(launch.sessions.items[0].name).toBe('Current workspace name')
    expect(launch.workspace.projects[0].name).toBe('Current project name')
    const current = await launch.fileStore.get('project', 'file-a')
    expect(current.value?.document).toEqual(document)
    expect(current.value?.id).toBe('file-a')
    expect(native.transforms).not.toHaveBeenCalled()
    expect(native.values.get(libraryKey('file', 'file-a'))?.revision).toBe(8)
    expect(native.reads).toHaveBeenCalledWith(METADATA_LIBRARY_KEY, true)
    expect(native.reads).toHaveBeenCalledWith(SESSIONS_LIBRARY_KEY, true)
  })

  it('honors independent camera and panel preferences without changing the captured view', async () => {
    const source = browserData()
    const launch = await resolveLiveView(source.view, {
      ...DEFAULT_LINK_OPTIONS,
      rememberCamera: false,
      rememberPanels: false,
    })
    expect(launch.initialCameras).toEqual({})
    expect(launch.initialView).toBeUndefined()
    expect(launch.layout).toEqual(source.sessions.items[0].layout)
    expect(launch.view.cameras).toEqual(source.view.cameras)
    expect(source.view.workspace.layout.rightPanel).toBe('tools')
  })

  it('falls back to Home for a deleted project without recreating it or its files', async () => {
    const source = fixture()
    source.metadata.projects = source.metadata.projects.filter(
      (project) => project.id !== 'project',
    )
    source.metadata.lastProjectId = 'other'
    browserData(source)
    const launch = await resolveLiveView(source.view)
    expect(launch.section).toBe('home')
    expect(launch.view.projectId).toBeNull()
    expect(launch.view.activeView).toBeNull()
    expect(launch.workspace.projects.map((project) => project.id)).toEqual([
      'other',
    ])
    expect(launch.sessions.items[0].projectId).toBeNull()
    expect(launch.sessions.items[0].views).not.toHaveProperty('project')
  })

  it('never clones a missing workspace or accepts damaged canonical records', async () => {
    const source = browserData()
    const missing = structuredClone(source.view)
    missing.workspace.id = missing.workspaceId = 'missing'
    await expect(resolveLiveView(missing)).rejects.toThrow(/not available/u)
    expect(
      JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY)!).items,
    ).toHaveLength(2)
    localStorage.setItem(STORAGE_KEY, '{damaged')
    localStorage.setItem(STORAGE_BACKUP_KEY, '{damaged')
    await expect(resolveLiveView(source.view)).rejects.toThrow(
      /metadata is damaged/u,
    )
    const native = nativeData(source)
    native.values.set(SESSIONS_LIBRARY_KEY, {
      revision: 2,
      value: { version: 1, items: [] },
    })
    await expect(resolveLiveView(source.view)).rejects.toThrow(
      /list is damaged/u,
    )
  })

  it('recovers independently valid metadata and session backups without persisting anything', async () => {
    const source = browserData()
    localStorage.setItem(
      `${SESSIONS_STORAGE_KEY}.backup`,
      localStorage.getItem(SESSIONS_STORAGE_KEY)!,
    )
    localStorage.setItem(STORAGE_KEY, '{damaged')
    localStorage.setItem(SESSIONS_STORAGE_KEY, '{damaged')
    expect(
      (await resolveLiveView(source.view)).workspace.projects[0].name,
    ).toBe('Current project name')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{damaged')
    expect(localStorage.getItem(SESSIONS_STORAGE_KEY)).toBe('{damaged')
  })

  it('retains legacy snapshot routing and refuses to reinterpret a v1 payload', async () => {
    const source = browserData()
    localStorage.setItem('legacy-snapshot-marker', 'preserved')
    expect(parseLiveLink('#view=1g.legacy')).toBeNull()
    await expect(
      resolveLiveView({
        ...source.view,
        version: 1,
      } as unknown as LiveViewState),
    ).rejects.toThrow(/invalid/u)
    expect(localStorage.getItem('legacy-snapshot-marker')).toBe('preserved')
  })
})
