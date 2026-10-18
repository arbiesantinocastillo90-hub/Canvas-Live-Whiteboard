import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergeWorkspaceChanges,
  METADATA_LIBRARY_KEY,
  parseLibrarySessions,
  parseLibraryWorkspace,
  SESSIONS_LIBRARY_KEY,
  syncSessionChanges,
  syncWorkspaceChanges,
} from './librarySync'
import {
  localLibrary,
  type LibraryEntry,
  type LocalLibraryClient,
} from './localLibrary'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES, type WorkspaceState } from './workspace'
import {
  createSavedWorkspace,
  normalizeProjectView,
  type WorkspaceSessions,
} from './workspaceSessions'

function metadata(): WorkspaceState {
  return {
    version: 1,
    preferences: { ...DEFAULT_PREFERENCES },
    projects: [
      { id: 'parent', name: 'Parent', createdAt: 10, lastOpenedAt: 10 },
      {
        id: 'project',
        name: 'Project',
        createdAt: 20,
        lastOpenedAt: 20,
        parentId: null,
        pinned: false,
      },
    ],
    lastProjectId: 'project',
  }
}
function sessions(): WorkspaceSessions {
  return {
    version: 1,
    activeId: 'workspace',
    items: [
      createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        'project',
        'Workspace',
        'workspace',
      ),
    ],
  }
}
function nativeStore(values: Record<string, unknown>) {
  const entries = new Map<string, LibraryEntry>(
    Object.entries(values).map(([key, value]) => [
      key,
      { revision: 1, value: structuredClone(value) },
    ]),
  )
  const transform: LocalLibraryClient['transform'] = async <T>(
    key: string,
    update: (value: T | null) => T,
  ) => {
    const previous = entries.get(key) ?? { revision: 0, value: null }
    const next = {
      revision: previous.revision + 1,
      value: update(structuredClone(previous.value) as T | null),
    }
    entries.set(key, structuredClone(next))
    return next
  }
  vi.spyOn(localLibrary, 'available', 'get').mockReturnValue(true)
  const writes = vi
    .spyOn(localLibrary, 'transform')
    .mockImplementation(transform)
  return { entries, writes }
}
beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('merging changes into the shared local library', () => {
  it('accepts older hierarchy settings without the new optional file toggle', () => {
    const saved = JSON.parse(JSON.stringify(sessions()))
    delete saved.items[0].layout.homeView.hierarchyShowCanvases
    const home = saved.items[0].layout.homeView
    saved.items[0].layout.homeView = Object.fromEntries(
      Object.entries(home).reverse(),
    )
    expect(
      parseLibrarySessions(saved)?.items[0].layout.homeView
        .hierarchyShowCanvases,
    ).toBe(false)
    saved.items[0].layout.homeView.hierarchyShowCanvases = true
    expect(
      parseLibrarySessions(saved)?.items[0].layout.homeView
        .hierarchyShowCanvases,
    ).toBe(true)
    saved.items[0].layout.homeView.hierarchyShowCanvases = 'yes'
    expect(parseLibrarySessions(saved)).toBeNull()
  })
  it('changes a project name while retaining another view’s parent, new projects, and unrelated preferences', () => {
    const before = metadata()
    const remote = structuredClone(before)
    remote.projects[1] = {
      ...remote.projects[1],
      parentId: 'parent',
      pinned: true,
      lastOpenedAt: 900,
    }
    remote.projects.push({
      id: 'remote',
      name: 'Created elsewhere',
      createdAt: 30,
      lastOpenedAt: 30,
    })
    remote.preferences.contrast = 85
    const after = structuredClone(before)
    after.projects[1].name = 'Renamed here'
    after.preferences.grid = 'lines'
    const result = mergeWorkspaceChanges(remote, before, after)
    expect(result.projects[1]).toMatchObject({
      name: 'Renamed here',
      parentId: 'parent',
      pinned: true,
      lastOpenedAt: 900,
    })
    expect(result.projects.map((project) => project.id)).toEqual([
      'parent',
      'project',
      'remote',
    ])
    expect(result.preferences).toMatchObject({ grid: 'lines', contrast: 85 })
    expect(remote.projects[1].name).toBe('Project')
  })

  it('preserves independent nested workspace appearance and precision choices', () => {
    const before = metadata()
    const remote = structuredClone(before)
    remote.preferences.homeAppearance.tagline = 'Remote tagline'
    remote.preferences.canvasControls.rulerUnit = 'cm'
    const after = structuredClone(before)
    after.preferences.homeAppearance.titleSize = 42
    after.preferences.canvasControls.snapToGrid = true
    const saved = mergeWorkspaceChanges(remote, before, after)
    expect(saved.preferences.homeAppearance).toMatchObject({
      tagline: 'Remote tagline',
      titleSize: 42,
    })
    expect(saved.preferences.canvasControls).toMatchObject({
      rulerUnit: 'cm',
      snapToGrid: true,
    })
  })

  it('merges nested Home views and appearance fields across native profiles', async () => {
    const before = sessions()
    const remote = structuredClone(before)
    remote.items[0].layout.homeView.sort = 'modified'
    remote.items[0].preferences.homeAppearance.tagline = 'Shared tagline'
    const { entries } = nativeStore({ [SESSIONS_LIBRARY_KEY]: remote })
    const after = structuredClone(before)
    after.items[0].layout.homeView.display = 'hierarchy'
    after.items[0].preferences.homeAppearance.titleSize = 48
    await syncSessionChanges(before, after)
    const saved = entries.get(SESSIONS_LIBRARY_KEY)?.value as WorkspaceSessions
    expect(saved.items[0].layout.homeView).toMatchObject({
      sort: 'modified',
      display: 'hierarchy',
    })
    expect(saved.items[0].preferences.homeAppearance).toMatchObject({
      tagline: 'Shared tagline',
      titleSize: 48,
    })
  })

  it('changes a parent independently of a remotely renamed project', () => {
    const before = metadata()
    const remote = structuredClone(before)
    remote.projects[1].name = 'Remote name'
    const after = structuredClone(before)
    after.projects[1].parentId = 'parent'
    expect(
      mergeWorkspaceChanges(remote, before, after).projects[1],
    ).toMatchObject({ name: 'Remote name', parentId: 'parent' })
  })

  it('keeps project pins, recent ordering, and active-project navigation out of canonical writes', async () => {
    const before = metadata()
    const { entries, writes } = nativeStore({ [METADATA_LIBRARY_KEY]: before })
    const after = structuredClone(before)
    after.projects[1] = {
      ...after.projects[1],
      pinned: true,
      recentHidden: true,
      lastOpenedAt: 999,
    }
    after.lastProjectId = 'parent'
    after.projectRecentsCollapsed = true
    await syncWorkspaceChanges(before, after)
    expect(writes).not.toHaveBeenCalled()
    expect(entries.get(METADATA_LIBRARY_KEY)?.value).toEqual(before)
  })

  it('preserves remote project presentation while committing an actual rename', async () => {
    const before = metadata()
    const remote = structuredClone(before)
    remote.projects[1] = {
      ...remote.projects[1],
      pinned: true,
      recentHidden: false,
      lastOpenedAt: 800,
    }
    const { entries } = nativeStore({ [METADATA_LIBRARY_KEY]: remote })
    const after = structuredClone(before)
    after.projects[1] = {
      ...after.projects[1],
      name: 'Local rename',
      pinned: false,
      recentHidden: true,
      lastOpenedAt: 900,
    }
    await syncWorkspaceChanges(before, after)
    const saved = entries.get(METADATA_LIBRARY_KEY)?.value as WorkspaceState
    expect(saved.projects[1]).toMatchObject({
      name: 'Local rename',
      pinned: true,
      recentHidden: false,
      lastOpenedAt: 800,
    })
  })

  it('merges individual workspace appearance and panel fields without resetting remote choices', async () => {
    const before = sessions()
    const remote = structuredClone(before)
    remote.items[0].name = 'Renamed in another view'
    remote.items[0].preferences.contrast = 90
    remote.items[0].layout.rightWidth = 390
    remote.items[0].layout.rightPanel = 'ai'
    remote.items[0].views.project = normalizeProjectView({
      openIds: ['remote-file'],
      activeId: 'remote-file',
    })
    const extra = createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Other workspace',
      'other-workspace',
    )
    remote.items.push(extra)
    remote.activeId = extra.id
    const { entries } = nativeStore({ [SESSIONS_LIBRARY_KEY]: remote })
    const after = structuredClone(before)
    after.items[0].preferences.grid = 'lines'
    after.items[0].layout.filesWidth = 350
    after.items[0].views.project = normalizeProjectView({
      openIds: ['local-file'],
      activeId: 'local-file',
    })
    await syncSessionChanges(before, after)
    const saved = entries.get(SESSIONS_LIBRARY_KEY)?.value as WorkspaceSessions
    expect(saved.items[0]).toMatchObject({
      name: 'Renamed in another view',
      preferences: { grid: 'lines', contrast: 90 },
      layout: { filesWidth: 350, rightWidth: 390, rightPanel: 'ai' },
    })
    expect(saved.items[0].views.project.openIds).toEqual(['remote-file'])
    expect(saved.activeId).toBe(extra.id)
    expect(saved.items[1]).toEqual(extra)
  })

  it('does not write canonical sessions when only tabs, pins, recents, project or active workspace change', async () => {
    const before = sessions()
    before.items.push(
      createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        null,
        'Other',
        'other',
      ),
    )
    const { entries, writes } = nativeStore({ [SESSIONS_LIBRARY_KEY]: before })
    const after = structuredClone(before)
    after.activeId = 'other'
    after.items[0].projectId = 'parent'
    after.items[0].views.project = normalizeProjectView({
      openIds: ['file-a', 'file-b'],
      activeId: 'file-b',
      tabs: [{ id: 'file-a', pinned: true }],
      recentsCollapsed: true,
    })
    await syncSessionChanges(before, after)
    expect(writes).not.toHaveBeenCalled()
    expect(entries.get(SESSIONS_LIBRARY_KEY)?.value).toEqual(before)
  })

  it('rejects damaged saved metadata before writing and retains the original entry', async () => {
    const before = metadata()
    const damaged = { ...before, projects: [{ id: 'broken' }] }
    const { entries } = nativeStore({ [METADATA_LIBRARY_KEY]: damaged })
    const after = structuredClone(before)
    after.preferences.contrast = 80
    await expect(syncWorkspaceChanges(before, after)).rejects.toThrow(
      'saved local project library is invalid',
    )
    expect(entries.get(METADATA_LIBRARY_KEY)).toEqual({
      revision: 1,
      value: damaged,
    })
    expect(parseLibraryWorkspace(damaged)).toBeNull()
  })

  it('rejects damaged saved sessions instead of replacing them with defaults', async () => {
    const before = sessions()
    const damaged = {
      ...before,
      items: [{ ...before.items[0], preferences: null, layout: null }],
    }
    const { entries } = nativeStore({ [SESSIONS_LIBRARY_KEY]: damaged })
    const after = structuredClone(before)
    after.items[0].name = 'New name'
    await expect(syncSessionChanges(before, after)).rejects.toThrow(
      'saved local workspaces are invalid',
    )
    expect(entries.get(SESSIONS_LIBRARY_KEY)).toEqual({
      revision: 1,
      value: damaged,
    })
    expect(parseLibrarySessions(damaged)).toBeNull()
  })

  it('rejects duplicate workspace identities and invalid metadata preference cores', () => {
    const valid = sessions()
    expect(
      parseLibrarySessions({
        ...valid,
        items: [valid.items[0], valid.items[0]],
      }),
    ).toBeNull()
    expect(
      parseLibraryWorkspace({
        ...metadata(),
        preferences: { ...DEFAULT_PREFERENCES, mode: 'unknown' },
      }),
    ).toBeNull()
  })

  it('rejects damaged canonical active pointers and panel dimensions', () => {
    const valid = sessions()
    expect(
      parseLibrarySessions({ ...valid, activeId: 'missing-workspace' }),
    ).toBeNull()
    const invalidLayout = structuredClone(valid)
    invalidLayout.items[0].layout.rightWidth = 9000
    expect(parseLibrarySessions(invalidLayout)).toBeNull()
    const invalidPreferences = structuredClone(valid)
    invalidPreferences.items[0].preferences.mode =
      'unknown' as typeof DEFAULT_PREFERENCES.mode
    expect(parseLibrarySessions(invalidPreferences)).toBeNull()
  })

  it('stays browser-only when the native library is unavailable', async () => {
    vi.spyOn(localLibrary, 'available', 'get').mockReturnValue(false)
    const writes = vi.spyOn(localLibrary, 'transform')
    const before = metadata()
    const after = structuredClone(before)
    after.projects[1].name = 'Edited offline'
    await syncWorkspaceChanges(before, after)
    await syncSessionChanges(sessions(), sessions())
    expect(writes).not.toHaveBeenCalled()
  })
})
