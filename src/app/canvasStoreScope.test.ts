import { describe, expect, it, vi } from 'vitest'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import { normalizeItemPresentation } from './itemPresentation'
import {
  baseCanvasStore,
  canvasStoreWorkspace,
  createWorkspaceCanvasStore,
} from './canvasStoreScope'
import { projectDrafts } from './canvasDrafts'

function fixture(presented = true) {
  const presentation = normalizeItemPresentation({ color: '#112233' })
  const original = createCanvasFileRecord(
    'project',
    {
      ...createCanvasDocument('Shared drawing'),
      ...(presented ? { presentation } : {}),
    },
    100,
    'file',
  )
  const revision = Symbol('native-CAS-revision')
  Object.defineProperty(original, revision, { value: 4, enumerable: true })
  let stored = original
  const base: CanvasFileStore = {
    list: vi.fn(async () => ({
      value: [stored],
      persistence: 'browser' as const,
    })),
    get: vi.fn(async () => ({
      value: stored,
      persistence: 'browser' as const,
    })),
    markOpened: vi.fn(async (_project, _file, now) => ({
      value: { ...stored, lastOpenedAt: now ?? 200 },
      persistence: 'browser' as const,
    })),
    save: vi.fn(async (record: CanvasFileRecord) => {
      stored = record
      return { value: record, persistence: 'browser' as const }
    }),
  }
  return { base, original, revision, presentation, stored: () => stored }
}

describe('workspace canvas store isolation', () => {
  it('decorates reads independently for two workspaces without mutating canonical records', async () => {
    const { base, original, presentation, revision } = fixture()
    const red = normalizeItemPresentation({
      color: '#FF0000',
      description: 'Workspace A',
    })
    const green = normalizeItemPresentation({
      color: '#00FF00',
      description: 'Workspace B',
    })
    const a = createWorkspaceCanvasStore(
      base,
      'workspace-a',
      (id) => id === 'project',
      () => red,
    )
    const b = createWorkspaceCanvasStore(
      base,
      'workspace-b',
      (id) => id === 'project',
      () => green,
    )
    expect(baseCanvasStore(a)).toBe(base)
    expect(canvasStoreWorkspace(a)).toBe('workspace-a')
    expect(canvasStoreWorkspace(base)).toBeNull()
    const listA = await a.list('project'),
      getB = await b.get('project', 'file'),
      openedA = await a.markOpened('project', 'file', 350)
    expect(listA.value[0].document.presentation).toEqual(red)
    expect(getB.value?.document.presentation).toEqual(green)
    expect(openedA.value?.document.presentation).toEqual(red)
    expect(openedA.value?.lastOpenedAt).toBe(350)
    expect(Reflect.get(listA.value[0], revision)).toBe(4)
    expect(original.document.presentation).toEqual(presentation)
    expect(projectDrafts(a)).not.toBe(projectDrafts(b))
  })
  it.each([true, false])(
    'saves edited geometry while stripping only the workspace decoration; canonical decorated=%s',
    async (presented) => {
      const { base, original, revision, stored } = fixture(presented)
      const overlay = normalizeItemPresentation({
        icon: 'star',
        color: '#FF0000',
      })
      const scoped = createWorkspaceCanvasStore(
        base,
        'workspace-a',
        () => true,
        () => overlay,
      )
      const record = (await scoped.get('project', 'file')).value!
      const edited = {
        ...record,
        updatedAt: 400,
        document: {
          ...record.document,
          name: 'Edited drawing',
          viewport: { x: 2, y: 4, zoom: 1.5 },
        },
      }
      const saved = await scoped.save(edited)
      expect(base.save).toHaveBeenCalledOnce()
      expect(stored().document.name).toBe('Edited drawing')
      expect(stored().document.viewport).toEqual({ x: 2, y: 4, zoom: 1.5 })
      expect(stored().document.presentation).toEqual(
        original.document.presentation,
      )
      expect(Reflect.get(stored(), revision)).toBe(4)
      expect(saved.value.document.presentation).toEqual(overlay)
      expect(Reflect.get(saved.value, revision)).toBe(4)
    },
  )
  it.each([false, true])(
    'saves a decorated record through actual strict document validation; existing=%s',
    async (existing) => {
      const base = createCanvasFileStore({ indexedDB: null })
      const original = createCanvasFileRecord(
        'project',
        createCanvasDocument('Original'),
        100,
        'file',
      )
      if (existing) await base.save(original)
      const overlay = normalizeItemPresentation({ color: '#FF0000' })
      const scoped = createWorkspaceCanvasStore(
        base,
        'workspace-a',
        () => true,
        () => overlay,
      )
      const edited = {
        ...original,
        updatedAt: 200,
        document: {
          ...original.document,
          name: 'Edited',
          presentation: overlay,
        },
      }
      const result = await scoped.save(edited)
      expect(result.value.document.name).toBe('Edited')
      expect(result.value.document.presentation).toEqual(overlay)
      const canonical = (await base.get('project', 'file')).value!
      expect(canonical.document.name).toBe('Edited')
      expect(canonical.document.presentation).toBeUndefined()
      expect(Object.hasOwn(canonical.document, 'presentation')).toBe(false)
    },
  )
  it('rejects every cross-workspace operation before accessing the shared store', async () => {
    const { base, original } = fixture()
    const scoped = createWorkspaceCanvasStore(
      base,
      'empty-workspace',
      () => false,
      () => undefined,
    )
    for (const operation of [
      () => scoped.list('project'),
      () => scoped.get('project', 'file'),
      () => scoped.markOpened('project', 'file'),
      () => scoped.save(original),
    ])
      await expect(operation()).rejects.toThrow(
        'not part of the current workspace',
      )
    for (const method of [base.list, base.get, base.markOpened, base.save])
      expect(method).not.toHaveBeenCalled()
  })
  it('propagates a failed canonical save without replacing saved geometry or borrowing a later revision', async () => {
    const { base, original, revision, stored } = fixture()
    const overlay = normalizeItemPresentation({ color: '#AA0000' })
    const scoped = createWorkspaceCanvasStore(
      base,
      'workspace-a',
      () => true,
      () => overlay,
    )
    const loaded = (await scoped.get('project', 'file')).value!
    vi.mocked(base.get).mockResolvedValue({
      value: { ...original, [revision]: 9 } as CanvasFileRecord,
      persistence: 'browser',
    })
    vi.mocked(base.save).mockImplementation(async (record) => {
      expect(Reflect.get(record, revision)).toBe(4)
      throw new Error('Stale native revision')
    })
    await expect(
      scoped.save({
        ...loaded,
        document: { ...loaded.document, name: 'Rejected edit' },
      }),
    ).rejects.toThrow('Stale native revision')
    expect(stored()).toBe(original)
  })
})
