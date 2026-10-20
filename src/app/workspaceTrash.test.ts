import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addToWorkspaceTrash,
  changeProjectMembership,
  copyCanvasForMove,
  createWorkspaceTrashStore,
  emptyWorkspaceTrash,
  isFileInTrash,
  moveWorkspaceProject,
  parseWorkspaceTrash,
  removeFromWorkspaceTrash,
  requireWorkspaceActionItem,
  workspaceTrashKey,
  type WorkspaceTrashItem,
} from './workspaceTrash'
import { createCanvasFileRecord, type CanvasFileStore } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import {
  createSavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import { DEFAULT_PREFERENCES, type Project } from './workspace'
import { DEFAULT_LAYOUT } from './layout'
import type { LocalLibraryClient } from './localLibrary'

const projects: Project[] = [
  { id: 'root', name: 'Root', createdAt: 1, lastOpenedAt: 1 },
  {
    id: 'child',
    name: 'Child',
    parentId: 'root',
    createdAt: 1,
    lastOpenedAt: 1,
  },
  { id: 'target', name: 'Target', createdAt: 1, lastOpenedAt: 1 },
]
function fixture() {
  const source = {
    ...createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Source',
    ),
    id: 'source',
    projectIds: ['root', 'child'],
  }
  const target = {
    ...createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Destination',
    ),
    id: 'destination',
    projectIds: ['target'],
  }
  const sessions: WorkspaceSessions = {
    version: 1,
    activeId: 'source',
    items: [source, target],
  }
  const record = createCanvasFileRecord(
    'root',
    createCanvasDocument('Drawing'),
    1,
    'drawing',
  )
  const store: CanvasFileStore = {
    get: vi.fn(async () => ({
      value: record,
      persistence: 'browser' as const,
    })),
    list: vi.fn(async () => ({
      value: [record],
      persistence: 'browser' as const,
    })),
    markOpened: vi.fn(async () => ({
      value: record,
      persistence: 'browser' as const,
    })),
    save: vi.fn(async (value) => ({ value, persistence: 'browser' as const })),
  }
  return { sessions, record, store }
}
const file: WorkspaceTrashItem = {
  kind: 'file',
  id: 'drawing',
  projectId: 'root',
  name: 'Drawing',
  removedAt: 1,
}
beforeEach(() => localStorage.clear())

describe('recoverable workspace Trash references', () => {
  it('persists and restores only references without mutating saved document bodies', async () => {
    const store = createWorkspaceTrashStore(null, localStorage)
    const saved = await store.update('source', (value) =>
      addToWorkspaceTrash(value, file),
    )
    expect(isFileInTrash(saved, 'drawing')).toBe(true)
    const reopened = await createWorkspaceTrashStore(null, localStorage).load(
      'source',
    )
    expect(reopened).toEqual(saved)
    expect(localStorage.getItem('canvas-live.trash.v1:source')).not.toContain(
      'document',
    )
    const restored = await store.update('source', (value) =>
      removeFromWorkspaceTrash(value, file),
    )
    expect(restored.items).toEqual([])
    expect(isFileInTrash(emptyWorkspaceTrash('destination'), 'drawing')).toBe(
      false,
    )
  })
  it.each([
    { ...file, document: { name: 'Never put bodies into settings' } },
    { ...file, removedAt: -1 },
    { ...file, kind: 'project', projectIds: [] },
    { ...file, id: '__proto__' },
  ])(
    'rejects malformed or body-bearing references without replacing prior data',
    (entry) => {
      expect(() =>
        parseWorkspaceTrash(
          { version: 1, workspaceId: 'source', items: [entry] },
          'source',
        ),
      ).toThrow()
    },
  )
  it('rejects foreign workspace state and duplicate references', () => {
    expect(() =>
      parseWorkspaceTrash(
        { version: 1, workspaceId: 'other', items: [] },
        'source',
      ),
    ).toThrow()
    expect(() =>
      parseWorkspaceTrash(
        { version: 1, workspaceId: 'source', items: [file, file] },
        'source',
      ),
    ).toThrow('duplicate')
  })
  it('retains its old state when browser persistence fails', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Quota exceeded')
      }),
    }
    const store = createWorkspaceTrashStore(null, storage)
    await expect(
      store.update('source', (value) => addToWorkspaceTrash(value, file)),
    ).rejects.toThrow('Quota')
    expect(store.peek('source').items).toEqual([])
  })
  it('never acknowledges a recoverable removal when no durable storage exists', async () => {
    const store = createWorkspaceTrashStore(null, null)
    await expect(
      store.update('source', (value) => addToWorkspaceTrash(value, file)),
    ).rejects.toThrow('original was retained')
    expect(store.peek('source').items).toEqual([])
  })
  it('rejects stale or foreign source references before changing workspace membership', () => {
    const { sessions } = fixture()
    expect(() =>
      requireWorkspaceActionItem(sessions, projects, 'source', file),
    ).not.toThrow()
    for (const item of [
      { ...file, projectId: 'target' },
      { ...file, id: '__proto__' },
      { ...file, kind: 'project' as const },
    ])
      expect(() =>
        requireWorkspaceActionItem(sessions, projects, 'source', item),
      ).toThrow('source workspace')
    expect(() =>
      requireWorkspaceActionItem(sessions, projects, 'missing', file),
    ).toThrow('no longer exists')
  })
  it('merges native references through transform and never hides a failed write in browser fallback', async () => {
    let remote: unknown = {
      version: 1,
      workspaceId: 'source',
      items: [{ ...file, id: 'remote', name: 'Remote' }],
    }
    const client = {
      available: true,
      read: vi.fn(async () => ({ value: remote, revision: 1 })),
      transform: vi.fn(async (_key, change) => {
        remote = change(remote)
        return { value: remote, revision: 2 }
      }),
    } as unknown as LocalLibraryClient
    const store = createWorkspaceTrashStore(client, localStorage)
    await store.update('source', (value) => addToWorkspaceTrash(value, file))
    expect(store.peek('source').items.map((entry) => entry.id)).toEqual([
      'remote',
      'drawing',
    ])
    expect(client.transform).toHaveBeenCalledWith(
      workspaceTrashKey('source'),
      expect.any(Function),
    )
    vi.mocked(client.transform).mockRejectedValue(new Error('USB disconnected'))
    await expect(
      store.update('source', (value) => removeFromWorkspaceTrash(value, file)),
    ).rejects.toThrow('USB')
    expect(store.peek('source').items).toHaveLength(2)
  })
  it('moves and restores complete visible project trees without changing canonical metadata', () => {
    const { sessions } = fixture()
    const before = structuredClone(projects)
    const moved = moveWorkspaceProject(
      sessions,
      projects,
      'source',
      'destination',
      'root',
    )
    expect(moved.items[0].projectIds).toEqual([])
    expect(moved.items[1].projectIds).toEqual(['target', 'root', 'child'])
    expect(sessions.items[0].projectIds).toEqual(['root', 'child'])
    expect(projects).toEqual(before)
    const restored = changeProjectMembership(
      moved,
      'source',
      ['root', 'child'],
      true,
    )
    expect(restored.items[0].projectIds).toEqual(['root', 'child'])
    expect(restored.items[1].projectIds).toEqual(['target', 'root', 'child'])
    expect(() =>
      moveWorkspaceProject(sessions, projects, 'source', 'source', 'root'),
    ).toThrow('different')
    expect(() =>
      moveWorkspaceProject(
        sessions,
        projects,
        'source',
        'destination',
        'target',
      ),
    ).toThrow('not in')
  })
})

describe('safe canvas transfers', () => {
  function options() {
    const value = fixture()
    return {
      ...value,
      projects,
      sourceWorkspaceId: 'source',
      destinationWorkspaceId: 'destination',
      destinationProjectId: 'target',
      projectId: 'root',
      fileId: 'drawing',
    }
  }
  it('saves a new destination identity before the original can be hidden', async () => {
    const value = options()
    const result = await copyCanvasForMove(value)
    expect(result.existing).toBe(false)
    expect(result.record.id).not.toBe(value.record.id)
    expect(result.record.projectId).toBe('target')
    expect(result.record.document).toEqual(value.record.document)
    expect(value.record.projectId).toBe('root')
    expect(value.sessions.items[0].projectIds).toEqual(['root', 'child'])
    expect(value.store.save).toHaveBeenCalledOnce()
  })
  it('retains the original when destination saving fails', async () => {
    const value = options()
    vi.mocked(value.store.save).mockRejectedValue(new Error('Disk full'))
    await expect(copyCanvasForMove(value)).rejects.toThrow('Disk full')
    expect(value.record.projectId).toBe('root')
    expect(value.record.document.name).toBe('Drawing')
    expect(value.sessions.items[0].projectIds).toContain('root')
  })
  it('does not treat a session-only destination as a durable transfer', async () => {
    const value = options()
    vi.mocked(value.store.save).mockImplementation(async (record) => ({
      value: record,
      persistence: 'session',
    }))
    await expect(copyCanvasForMove(value)).rejects.toThrow(
      'original was retained',
    )
  })
  it('acknowledges the existing canvas when both workspaces share its canonical project', async () => {
    const value = options()
    value.sessions.items[1].projectIds!.push('root')
    const result = await copyCanvasForMove({
      ...value,
      destinationProjectId: 'root',
    })
    expect(result.existing).toBe(true)
    expect(result.record.id).toBe('drawing')
    expect(value.store.save).not.toHaveBeenCalled()
  })
  it('rejects a missing or unowned destination before reading or writing canvases', async () => {
    const value = options()
    await expect(
      copyCanvasForMove({ ...value, destinationProjectId: 'child' }),
    ).rejects.toThrow('belongs')
    expect(value.store.get).not.toHaveBeenCalled()
    expect(value.store.save).not.toHaveBeenCalled()
  })
  it('rejects a mismatched saved identity instead of copying another project’s canvas', async () => {
    const value = options()
    vi.mocked(value.store.get).mockResolvedValue({
      value: { ...value.record, projectId: 'target' },
      persistence: 'browser',
    })
    await expect(copyCanvasForMove(value)).rejects.toThrow(
      'original was retained',
    )
    expect(value.store.save).not.toHaveBeenCalled()
  })
})
