import { describe, expect, it, vi } from 'vitest'
import { createCanvasFileRecord } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import {
  createCanvasRecoveryStore,
  mergeRecoveredDrafts,
  validateRecoveryDraft,
} from './canvasRecovery'
import type { CanvasDraft } from './canvasDrafts'
function draft(id = 'file', projectId = 'project'): CanvasDraft {
  const original = createCanvasDocument('Original')
  return {
    record: createCanvasFileRecord(
      projectId,
      { ...original, name: 'Working' },
      1,
      id,
    ),
    savedDocument: original,
    dirty: true,
    persistence: 'browser',
  }
}
describe('canvas draft recovery', () => {
  it('retains separate project drafts and clears explicitly saved entries', async () => {
    const store = createCanvasRecoveryStore(null)
    await store.replace('project', [draft()])
    await store.replace('other', [draft('other-file', 'other')])
    expect((await store.list('project'))[0].record.document.name).toBe(
      'Working',
    )
    await store.replace('project', [])
    expect(await store.list('project')).toEqual([])
    expect(await store.list('other')).toHaveLength(1)
  })
  it('serializes writes so a pending older draft cannot replace a completed save', async () => {
    const store = createCanvasRecoveryStore(null)
    await Promise.all([
      store.replace('project', [draft()]),
      store.replace('project', []),
    ])
    expect(await store.list('project')).toEqual([])
  })
  it('rejects cross-project, duplicate, malformed and clean records atomically', async () => {
    const store = createCanvasRecoveryStore(null)
    const valid = draft()
    await store.replace('project', [valid])
    expect(() => validateRecoveryDraft(valid, 'other')).toThrow()
    await expect(store.replace('project', [valid, valid])).rejects.toThrow(
      'duplicated',
    )
    await expect(
      store.replace('project', [{ ...valid, dirty: false }]),
    ).rejects.toThrow()
    await expect(
      store.replace('project', [
        { ...valid, savedDocument: {} } as CanvasDraft,
      ]),
    ).rejects.toThrow()
    expect(await store.list('project')).toEqual([valid])
  })
  it('migrates legacy drafts once, keeps explicit clears empty, and preserves another workspace migration', async () => {
    const legacy = createCanvasRecoveryStore(null)
    await legacy.replace('project', [draft()])
    const readLegacy = vi.spyOn(legacy, 'list')
    const first = createCanvasRecoveryStore(null, 'workspace-a', legacy)
    expect(await first.list('project')).toEqual([draft()])
    await first.replace('project', [])
    expect(await first.list('project')).toEqual([])
    expect(await first.list('project')).toEqual([])
    expect(readLegacy).toHaveBeenCalledTimes(1)

    const second = createCanvasRecoveryStore(null, 'workspace-b', legacy)
    expect(await second.list('project')).toEqual([draft()])
    expect(readLegacy).toHaveBeenCalledTimes(2)
    expect(await legacy.list('project')).toEqual([draft()])
  })
  it('records an empty migration so later legacy drafts do not leak into an initialized workspace', async () => {
    const legacy = createCanvasRecoveryStore(null)
    const readLegacy = vi.spyOn(legacy, 'list')
    const scoped = createCanvasRecoveryStore(null, 'workspace', legacy)
    expect(await scoped.list('project')).toEqual([])
    await legacy.replace('project', [draft()])
    expect(await scoped.list('project')).toEqual([])
    expect(readLegacy).toHaveBeenCalledTimes(1)
  })
  it('lets an explicit replacement initialize recovery without importing legacy content', async () => {
    const legacy = createCanvasRecoveryStore(null)
    await legacy.replace('project', [draft()])
    const readLegacy = vi.spyOn(legacy, 'list')
    const scoped = createCanvasRecoveryStore(null, 'workspace', legacy)
    await scoped.replace('project', [])
    expect(await scoped.list('project')).toEqual([])
    expect(readLegacy).not.toHaveBeenCalled()
  })
  it('serializes a pending migration before an explicit clear and later reads', async () => {
    const legacy = createCanvasRecoveryStore(null)
    let release!: (value: CanvasDraft[]) => void
    let started!: () => void
    const waiting = new Promise<CanvasDraft[]>((resolve) => {
      release = resolve
    })
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const readLegacy = vi.spyOn(legacy, 'list').mockImplementation(async () => {
      started()
      return waiting
    })
    const scoped = createCanvasRecoveryStore(null, 'workspace', legacy)
    const migrated = scoped.list('project')
    await began
    const cleared = scoped.replace('project', [])
    const reread = scoped.list('project')
    release([draft()])
    expect(await migrated).toEqual([draft()])
    await cleared
    expect(await reread).toEqual([])
    expect(await scoped.list('project')).toEqual([])
    expect(readLegacy).toHaveBeenCalledTimes(1)
  })
  it('retries a failed migration without marking it complete or changing the legacy recovery', async () => {
    const legacy = createCanvasRecoveryStore(null)
    await legacy.replace('project', [draft()])
    const readLegacy = vi.spyOn(legacy, 'list')
    readLegacy.mockRejectedValueOnce(
      new Error('Recovery temporarily unavailable'),
    )
    const scoped = createCanvasRecoveryStore(null, 'workspace', legacy)
    await expect(scoped.list('project')).rejects.toThrow(
      'temporarily unavailable',
    )
    expect(await scoped.list('project')).toEqual([draft()])
    expect(await legacy.list('project')).toEqual([draft()])
  })
  it('restores compatible dirty content and orphan imports but preserves a newer save', () => {
    const recoverable = draft()
    const saved: CanvasDraft = {
      ...recoverable,
      record: { ...recoverable.record, document: recoverable.savedDocument },
      dirty: false,
    }
    expect(mergeRecoveredDrafts([saved], [recoverable])[0]).toEqual(recoverable)
    const newer = {
      ...saved,
      savedDocument: createCanvasDocument('New save'),
      record: { ...saved.record, document: createCanvasDocument('New save') },
    }
    expect(mergeRecoveredDrafts([newer], [recoverable])[0]).toEqual(newer)
    expect(mergeRecoveredDrafts([], [recoverable])[0]).toEqual(recoverable)
  })
})
