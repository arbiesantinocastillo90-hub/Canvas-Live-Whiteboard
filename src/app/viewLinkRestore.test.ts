import { beforeEach, describe, expect, it } from 'vitest'
import { createCanvasDocument } from './lcanvas'
import { createCanvasFileRecord, createCanvasFileStore } from './canvasFiles'
import {
  createProject,
  EMPTY_STATE,
  persistWorkspace,
  loadWorkspace,
} from './workspace'
import { DEFAULT_LAYOUT } from './layout'
import {
  createSavedWorkspace,
  normalizeProjectView,
  loadWorkspaceSessions,
} from './workspaceSessions'
import { restoreViewLink } from './viewLinkRestore'
import type { ViewLinkSnapshot } from './viewLinks'

function snapshot(): ViewLinkSnapshot {
  const workspace = createProject(
    EMPTY_STATE,
    'Original project',
    100,
    'original-project',
  )
  const project = workspace.projects[0]
  const first = createCanvasFileRecord(
    project.id,
    {
      ...createCanvasDocument('First'),
      viewport: { x: 12, y: -42, zoom: 1.3 },
    },
    100,
    'first',
  )
  const second = createCanvasFileRecord(
    project.id,
    createCanvasDocument('Second'),
    100,
    'second',
  )
  const saved = createSavedWorkspace(
    workspace.preferences,
    { ...DEFAULT_LAYOUT, autoHideTabs: true, rightPanel: 'properties' },
    project.id,
    'Captured workspace',
  )
  saved.views[project.id] = normalizeProjectView({
    openIds: ['second', 'first'],
    activeId: 'first',
    tabs: [{ id: 'first', pinned: true, compact: true, groupId: 'g' }],
    groups: [{ id: 'g', name: 'Design', collapsed: false }],
    shortcuts: [{ id: 'first', pinned: true, hidden: false }],
    editorSession: { tool: 'pan', activeLayerId: 'layer-main' },
  })
  return {
    format: 'CanvasLiveView',
    version: 1,
    id: 'snapshot-id',
    createdAt: 200,
    workspace: saved,
    project,
    files: [first, second],
    activeView: {
      viewport: { x: 100, y: -70, zoom: 1.7 },
      selectedIds: [],
      tool: 'pan',
      activeLayerId: 'layer-main',
      focusMode: false,
    },
  }
}

describe('opening portable snapshot copies', () => {
  beforeEach(() => localStorage.clear())
  it('restores camera, workspace and ordered tabs using fresh identities while preserving originals', async () => {
    const copied = snapshot()
    const original = createProject(
      EMPTY_STATE,
      'Original project',
      100,
      'original-project',
    )
    persistWorkspace(original)
    const store = createCanvasFileStore({ indexedDB: null })
    const newer = {
      ...copied.files[0],
      document: { ...copied.files[0].document, name: 'Later edits' },
    }
    await store.save(newer)
    const restored = await restoreViewLink(copied)
    const { project, workspace, files } = restored.snapshot
    expect(project.name).toBe('Original project')
    expect(project.id).not.toBe('original-project')
    expect((await store.get('original-project', 'first')).value).toEqual(newer)
    const view = workspace.views[project.id]
    expect(view.openIds).toEqual([files[1].id, files[0].id])
    expect(view.activeId).toBe(files[0].id)
    expect(view.tabs[0]).toMatchObject({
      id: files[0].id,
      pinned: true,
      compact: true,
      groupId: 'g',
    })
    expect(files[0].document.viewport).toEqual(copied.activeView.viewport)
    expect(workspace.layout.autoHideTabs).toBe(true)
    expect(workspace.name).toBe('Captured workspace')
    expect(loadWorkspace()).toEqual(original)
    expect(
      (await restored.store.get(project.id, files[0].id)).value?.document
        .viewport,
    ).toEqual(copied.activeView.viewport)
    expect(
      loadWorkspaceSessions(original.preferences, DEFAULT_LAYOUT, null)
        .activeId,
    ).not.toBe(workspace.id)
  })

  it('opening the same link again creates the captured condition without discarding edits from its previous copy', async () => {
    const copied = snapshot()
    const first = await restoreViewLink(copied)
    const changed = {
      ...first.snapshot.files[0],
      document: {
        ...first.snapshot.files[0].document,
        name: 'Edited embedded copy',
      },
    }
    await first.store.save(changed)
    const next = await restoreViewLink(copied)
    expect(next.snapshot.files[0].document.name).toBe('First')
    expect(next.snapshot.project.id).not.toBe(first.snapshot.project.id)
    expect(
      (await first.store.get(first.snapshot.project.id, changed.id)).value
        ?.document.name,
    ).toBe('Edited embedded copy')
    expect(copied.files[0].document.viewport).toEqual({
      x: 12,
      y: -42,
      zoom: 1.3,
    })
  })
  it('isolates simultaneous iframe sessions and leaves original settings and libraries untouched', async () => {
    const original = createProject(
      EMPTY_STATE,
      'Unrelated library',
      100,
      'library',
    )
    persistWorkspace(original)
    const before = Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    )
    const [first, second] = await Promise.all([
      restoreViewLink(snapshot()),
      restoreViewLink(snapshot()),
    ])
    expect(first.store).not.toBe(second.store)
    expect(
      (await first.store.list(first.snapshot.project.id)).value,
    ).toHaveLength(2)
    expect(
      (await first.store.list(second.snapshot.project.id)).value,
    ).toHaveLength(0)
    expect(
      (await second.store.list(second.snapshot.project.id)).value,
    ).toHaveLength(2)
    expect(
      Object.fromEntries(
        Object.keys(localStorage).map((key) => [
          key,
          localStorage.getItem(key),
        ]),
      ),
    ).toEqual(before)
    expect(loadWorkspace()).toEqual(original)
  })
})
