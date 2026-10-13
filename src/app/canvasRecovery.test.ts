import { describe, expect, it } from 'vitest'
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
