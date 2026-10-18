import { orderedTabs, type TabPresentation } from './workspaceSessions'

export type TabDropTarget = { id: string; edge: 'before' | 'after' }

/** Reorder the whole collection, including tabs hidden inside collapsed groups. */
export function reorderDraggedTabs(
  ids: string[],
  tabs: TabPresentation[],
  movingIds: string[],
  target: TabDropTarget,
): string[] {
  const ordered = orderedTabs(ids, tabs)
  const moving = ordered.filter((id) => movingIds.includes(id))
  if (!moving.length || moving.includes(target.id)) return ordered
  const remainder = ordered.filter((id) => !moving.includes(id))
  const targetIndex = remainder.indexOf(target.id)
  if (targetIndex < 0) return ordered
  remainder.splice(targetIndex + Number(target.edge === 'after'), 0, ...moving)
  // Pinned tabs stay in their own leading lane; a mixed selection preserves
  // the relative order of its pinned and unpinned members in their lanes.
  return orderedTabs(remainder, tabs)
}
