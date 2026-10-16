import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'
import {
  addSavedWorkspace,
  createSavedWorkspace,
  loadWorkspaceSessions,
  normalizeProjectView,
  orderedTabs,
  parseSavedWorkspace,
  persistWorkspaceSessions,
  serializeSavedWorkspace,
  SESSIONS_STORAGE_KEY,
  updateSavedWorkspace,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'

function snapshot(id = 'default', name = 'Default'): SavedWorkspace {
  return createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    'project',
    name,
    id,
  )
}

function state(item = snapshot()): WorkspaceSessions {
  return { version: 1, activeId: item.id, items: [item] }
}

describe('named UI workspace snapshots', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('exports appearance, layout, tabs and editor context without contents, handles or connection credentials', () => {
    const item = snapshot('layout-a', '  Planning  ')
    item.preferences = { ...item.preferences, accent: '#123456', contrast: 75 }
    item.layout = {
      ...item.layout,
      filesOpen: true,
      leftPanel: 'workspaces',
      panelsSwapped: true,
    }
    item.views = {
      project: normalizeProjectView({
        openIds: ['first', 'second'],
        activeId: 'second',
        tabs: [{ id: 'first', pinned: true, compact: true, groupId: 'group' }],
        groups: [{ id: 'group', name: 'Planning', collapsed: false }],
        shortcuts: [{ id: 'first', pinned: true, hidden: false }],
        recentsCollapsed: true,
        editorSession: { tool: 'pan', activeLayerId: 'layer-1' },
      }),
    }
    const poisoned = JSON.parse(JSON.stringify(item)) as Record<string, unknown>
    Object.assign(poisoned, {
      apiKey: 'private-key',
      browserPairingCode: 'private-pairing',
      documents: [{ text: 'private-content' }],
      handle: { kind: 'file', name: 'private-file' },
    })
    const views = poisoned.views as Record<string, Record<string, unknown>>
    Object.assign(views.project, {
      document: { elements: [{ text: 'private-content' }] },
      token: 'private-token',
      handles: ['private-file'],
    })
    const raw = serializeSavedWorkspace(poisoned as unknown as SavedWorkspace)
    for (const privateValue of [
      'private-key',
      'private-pairing',
      'private-content',
      'private-token',
      'private-file',
    ])
      expect(raw).not.toContain(privateValue)
    const imported = parseSavedWorkspace(raw, 'new-import-id')
    expect(imported).toEqual({ ...item, id: 'new-import-id' })
    expect(imported.views.project.activeId).toBe('second')
    expect(item.id).toBe('layout-a')
  })

  it('keeps independent named layouts and views when one workspace is changed', () => {
    const original = state(snapshot('first', 'First'))
    const second = addSavedWorkspace(original, snapshot('second', 'Second'))
    const view = normalizeProjectView({
      openIds: ['file-b'],
      activeId: 'file-b',
    })
    const updated = updateSavedWorkspace(second, 'second', {
      preferences: { ...DEFAULT_PREFERENCES, contrast: 90 },
      layout: { ...DEFAULT_LAYOUT, rightPanel: 'ai' },
      views: { project: view },
    })
    expect(updated.activeId).toBe('second')
    expect(updated.items[0]).toEqual(original.items[0])
    expect(updated.items[1].preferences.contrast).toBe(90)
    expect(second.items[1].preferences.contrast).toBe(
      DEFAULT_PREFERENCES.contrast,
    )
    expect(second.items[1].views).toEqual({})
    view.openIds.push('caller-mutated')
    expect(updated.items[1].views.project.openIds).toEqual(['file-b'])
    expect(
      updateSavedWorkspace(updated, 'missing', { name: 'No match' }),
    ).toEqual(updated)
  })

  it('filters invalid, duplicate and prototype identifiers without creating inherited view properties', () => {
    const item = snapshot()
    const raw = JSON.stringify({
      format: 'CanvasLiveWorkspace',
      version: 1,
      workspace: {
        ...item,
        views: JSON.parse(
          '{"__proto__":{"openIds":["evil"]},"constructor":{},"prototype":{},"project":{"openIds":["file","file","__proto__","constructor"," spaced ","bad\\u0000id"],"activeId":"missing","tabs":[{"id":"file","pinned":true,"groupId":"missing"},{"id":"file","compact":true},{"id":"missing"}],"groups":[{"id":"group","name":" Good ","collapsed":true},{"id":"group","name":"Duplicate"},{"id":"__proto__","name":"Bad"}],"shortcuts":[{"id":"file","hidden":true},{"id":"file","pinned":true}],"editorSession":{"tool":"executeShell","activeLayerId":"layer"}}}',
        ),
      },
    })
    const imported = parseSavedWorkspace(raw, 'safe-import')
    expect(Object.keys(imported.views)).toEqual(['project'])
    expect(imported.views.project).toMatchObject({
      openIds: ['file'],
      activeId: 'file',
      tabs: [{ id: 'file', pinned: true, compact: false, groupId: null }],
      groups: [{ id: 'group', name: 'Good', collapsed: true }],
      shortcuts: [{ id: 'file', pinned: false, hidden: true }],
      editorSession: null,
    })
    expect(Object.getPrototypeOf(imported.views)).toBe(Object.prototype)
    expect(Object.prototype).not.toHaveProperty('openIds')
  })

  it('bounds imported references and clamps layout values while keeping valid optional fields', () => {
    const item = snapshot()
    const refs = Array.from({ length: 1200 }, (_, index) => `file-${index}`)
    const raw = serializeSavedWorkspace({
      ...item,
      layout: {
        ...item.layout,
        filesWidth: 99999,
        rightWidth: -1,
        autoHideDelay: 99999,
      },
      views: {
        project: normalizeProjectView({
          openIds: refs,
          activeId: 'file-1100',
          tabs: refs.map((id) => ({ id, pinned: true })),
          shortcuts: refs.map((id) => ({ id })),
        }),
      },
    })
    const imported = parseSavedWorkspace(raw, 'bounded')
    expect(imported.layout).toMatchObject({
      filesWidth: 420,
      rightWidth: 220,
      autoHideDelay: 2000,
    })
    expect(imported.views.project.openIds).toHaveLength(1000)
    expect(imported.views.project.tabs).toHaveLength(1000)
    expect(imported.views.project.shortcuts).toHaveLength(1000)
    expect(imported.views.project.activeId).toBe('file-0')
  })

  it.each([
    'not-json',
    '[]',
    '{}',
    '{"format":"CanvasLiveWorkspace","version":2}',
    '{"format":"LCANVAS","version":1}',
    '{"format":"CanvasLiveWorkspace","version":1,"workspace":null}',
  ])('rejects invalid workspace files: %s', (raw) => {
    expect(() => parseSavedWorkspace(raw)).toThrow()
  })

  it('rejects oversized imports, unsafe new IDs and invalid names before adding a workspace', () => {
    expect(() => parseSavedWorkspace(' '.repeat(2 * 1024 * 1024 + 1))).toThrow(
      'size limit',
    )
    expect(() =>
      parseSavedWorkspace(serializeSavedWorkspace(snapshot()), '__proto__'),
    ).toThrow('Invalid workspace')
    expect(() =>
      createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        null,
        ' '.repeat(2),
      ),
    ).toThrow('between 1 and 80')
    expect(() =>
      createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        null,
        'x'.repeat(81),
      ),
    ).toThrow('between 1 and 80')
    expect(() => addSavedWorkspace(state(), snapshot())).toThrow('duplicate')
    const hundred = Array.from({ length: 100 }, (_, index) =>
      snapshot(`layout-${index}`),
    )
    expect(() =>
      addSavedWorkspace(
        { version: 1, activeId: hundred[0].id, items: hundred },
        snapshot('next'),
      ),
    ).toThrow('100')
  })

  it('keeps pinned tabs first while preserving the relative order within both sections', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(
      orderedTabs(ids, [
        { id: 'c', pinned: true, compact: false, groupId: null },
        { id: 'a', pinned: true, compact: false, groupId: null },
      ]),
    ).toEqual(['a', 'c', 'b', 'd'])
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('falls back to the last valid snapshot when primary storage is malformed or unreadable', () => {
    const saved = state(snapshot('recovered', 'Recovered'))
    localStorage.setItem(
      `${SESSIONS_STORAGE_KEY}.backup`,
      JSON.stringify(saved),
    )
    localStorage.setItem(SESSIONS_STORAGE_KEY, '{broken')
    expect(
      loadWorkspaceSessions(DEFAULT_PREFERENCES, DEFAULT_LAYOUT, null),
    ).toEqual(saved)
    const read = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (key === SESSIONS_STORAGE_KEY) throw new Error('Primary inaccessible')
      return read.call(this, key)
    })
    expect(
      loadWorkspaceSessions(DEFAULT_PREFERENCES, DEFAULT_LAYOUT, null),
    ).toEqual(saved)
  })

  it('persists valid primary snapshots even when writing their backup fails', () => {
    const first = state(snapshot('first', 'First'))
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(first))
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === `${SESSIONS_STORAGE_KEY}.backup`)
        throw new Error('Backup full')
      write.call(this, key, value)
    })
    const next = state(snapshot('next', 'Next'))
    expect(persistWorkspaceSessions(next)).toBe(true)
    expect(
      loadWorkspaceSessions(DEFAULT_PREFERENCES, DEFAULT_LAYOUT, null),
    ).toEqual(next)
  })

  it('does not replace valid stored snapshots with rejected writes or duplicate workspace IDs', () => {
    const saved = state()
    expect(persistWorkspaceSessions(saved)).toBe(true)
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    expect(
      persistWorkspaceSessions({
        ...saved,
        version: 2,
      } as unknown as WorkspaceSessions),
    ).toBe(false)
    expect(
      persistWorkspaceSessions({
        ...saved,
        items: [saved.items[0], saved.items[0]],
      }),
    ).toBe(false)
    expect(localStorage.getItem(SESSIONS_STORAGE_KEY)).toBe(raw)
    expect(
      loadWorkspaceSessions(DEFAULT_PREFERENCES, DEFAULT_LAYOUT, null),
    ).toEqual(saved)
  })

  it('returns a usable isolated default and reports failed saves when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Unavailable')
      },
      setItem: () => {
        throw new Error('Unavailable')
      },
    })
    const loaded = loadWorkspaceSessions(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      'selected-project',
    )
    expect(loaded.items).toHaveLength(1)
    expect(loaded.items[0]).toMatchObject({
      name: 'Default',
      projectId: 'selected-project',
      preferences: DEFAULT_PREFERENCES,
      layout: DEFAULT_LAYOUT,
      views: {},
    })
    expect(persistWorkspaceSessions(loaded)).toBe(false)
  })
})
