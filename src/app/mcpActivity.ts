import type { BridgeActivity } from '../mcp/bridgeProtocol'

export type McpActivityEntry = {
  id: string
  kind: 'read' | 'edit' | 'error'
  phase: 'working' | 'complete' | 'failed' | 'unconfirmed'
  at: number
  summary: string
}

export function parseMcpActivity(value: unknown): BridgeActivity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  if (
    (item.kind !== 'read' && item.kind !== 'edit') ||
    typeof item.at !== 'number' ||
    !Number.isFinite(item.at) ||
    item.at < 0 ||
    item.at > Date.now() + 1000 ||
    (item.id !== undefined &&
      (typeof item.id !== 'string' || !item.id || item.id.length > 200)) ||
    (item.phase !== undefined &&
      item.phase !== 'working' &&
      item.phase !== 'complete') ||
    (item.kind === 'read' && item.phase === 'working') ||
    (item.targetIds !== undefined &&
      (!Array.isArray(item.targetIds) ||
        item.targetIds.length > 100 ||
        [...item.targetIds].some(
          (id: unknown) => typeof id !== 'string' || !id || id.length > 200,
        )))
  )
    return null
  return {
    kind: item.kind as BridgeActivity['kind'],
    at: item.at,
    ...(item.id ? { id: item.id as string } : {}),
    ...(item.phase ? { phase: item.phase as 'working' | 'complete' } : {}),
    ...(item.targetIds
      ? { targetIds: [...new Set(item.targetIds as string[])] }
      : {}),
  }
}

export function appendMcpActivity(
  entries: readonly McpActivityEntry[] | undefined,
  entry: McpActivityEntry,
  fromMetadata = false,
): McpActivityEntry[] {
  const previous = entries ?? []
  const existing = previous.find((item) => item.id === entry.id)
  if (
    existing &&
    ((existing.phase !== 'working' && entry.phase === 'working') ||
      (fromMetadata &&
        (existing.phase === 'complete' || existing.kind === 'error') &&
        entry.kind === 'edit') ||
      (existing.phase === entry.phase && existing.summary === entry.summary))
  )
    return previous as McpActivityEntry[]
  return [
    { ...entry, summary: entry.summary.slice(0, 500) },
    ...previous.filter((item) => item.id !== entry.id),
  ].slice(0, 20)
}

/** A missing request is not evidence that its edit either succeeded or failed. */
export function settleMcpActivities(
  entries: readonly McpActivityEntry[] | undefined,
  pendingId: string | null,
  summary = 'Request is no longer pending. Read the canvas to confirm its outcome.',
): McpActivityEntry[] | undefined {
  if (
    !entries?.some(
      (entry) => entry.phase === 'working' && entry.id !== pendingId,
    )
  )
    return entries as McpActivityEntry[] | undefined
  return entries.map((entry) =>
    entry.phase === 'working' && entry.id !== pendingId
      ? { ...entry, phase: 'unconfirmed', summary }
      : entry,
  )
}

export function observedActivityEntry(
  activity: BridgeActivity,
): McpActivityEntry {
  const count = activity.targetIds?.length ?? 0
  const phase =
    activity.kind === 'read' ? 'complete' : (activity.phase ?? 'working')
  return {
    id: activity.id ?? `${activity.kind}:${activity.at}`,
    kind: activity.kind,
    phase,
    at: activity.at,
    summary:
      activity.kind === 'read'
        ? count
          ? `Read ${count} object${count === 1 ? '' : 's'}.`
          : 'Read the canvas overview.'
        : phase === 'working'
          ? count
            ? `Requested changes to ${count} object${count === 1 ? '' : 's'}.`
            : 'Requested a canvas change.'
          : count
            ? `Changed ${count} object${count === 1 ? '' : 's'}.`
            : 'Completed a canvas change.',
  }
}
