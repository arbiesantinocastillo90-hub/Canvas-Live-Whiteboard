import { describe, expect, it } from 'vitest'
import { reorderDraggedTabs } from './canvasTabDrag'
import type { TabPresentation } from './workspaceSessions'

const ids = ['a', 'b', 'c', 'd', 'e']
describe('tab drop placement', () => {
  it('moves across both halves in both directions and reaches the last slot', () => {
    expect(
      reorderDraggedTabs(ids, [], ['b'], { id: 'e', edge: 'after' }),
    ).toEqual(['a', 'c', 'd', 'e', 'b'])
    expect(
      reorderDraggedTabs(ids, [], ['d'], { id: 'b', edge: 'before' }),
    ).toEqual(['a', 'd', 'b', 'c', 'e'])
    expect(
      reorderDraggedTabs(ids, [], ['a'], { id: 'c', edge: 'before' }),
    ).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(
      reorderDraggedTabs(ids, [], ['e'], { id: 'a', edge: 'after' }),
    ).toEqual(['a', 'e', 'b', 'c', 'd'])
  })

  it('keeps a batch in its displayed order, retains hidden group members and ignores self drops', () => {
    expect(
      reorderDraggedTabs(ids, [], ['e', 'b'], { id: 'c', edge: 'after' }),
    ).toEqual(['a', 'c', 'b', 'e', 'd'])
    expect(
      reorderDraggedTabs(ids, [], ['b', 'd'], { id: 'd', edge: 'after' }),
    ).toEqual(ids)
    expect(
      reorderDraggedTabs(ids, [], ['missing'], { id: 'c', edge: 'before' }),
    ).toEqual(ids)
    expect(
      reorderDraggedTabs(ids, [], ['a'], { id: 'missing', edge: 'after' }),
    ).toEqual(ids)
  })

  it('keeps pinned tabs in front without mutating their presentation or losing a mixed selection', () => {
    const tabs: TabPresentation[] = [
      { id: 'a', pinned: true, compact: true, groupId: 'planning' },
      { id: 'b', pinned: true, compact: false, groupId: null },
      { id: 'd', pinned: false, compact: false, groupId: 'planning' },
    ]
    expect(
      reorderDraggedTabs(ids, tabs, ['e'], { id: 'a', edge: 'before' }),
    ).toEqual(['a', 'b', 'e', 'c', 'd'])
    expect(
      reorderDraggedTabs(ids, tabs, ['a'], { id: 'e', edge: 'after' }),
    ).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(
      reorderDraggedTabs(ids, tabs, ['a', 'd'], { id: 'e', edge: 'after' }),
    ).toEqual(['b', 'a', 'c', 'e', 'd'])
    expect(tabs[0]).toEqual({
      id: 'a',
      pinned: true,
      compact: true,
      groupId: 'planning',
    })
  })
})
