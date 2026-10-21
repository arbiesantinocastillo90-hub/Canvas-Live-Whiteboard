import { orderedVisibleElements } from './canvasOperations'
import type { BridgeCommand } from '../mcp/bridgeProtocol'
import {
  elementBounds,
  type CanvasDocument,
  type ElementBounds,
} from './lcanvas'

export const CANVAS_AI_PRESENCE_DURATION = 5000
export const CANVAS_AI_PRESENCE_MAX_TARGETS = 32

/** Convert operation results to object IDs without conflating the layer namespace. */
export function resolveCanvasAiObjectTargets(
  before: CanvasDocument,
  after: CanvasDocument,
  affectedIds: readonly string[],
  command?: BridgeCommand,
): string[] {
  const affected = new Set(affectedIds)
  const operations =
    command?.kind === 'batch' ? command.operations : command ? [command] : []
  const layerOperations = operations.filter((operation) =>
    ['add_layer', 'update_layer', 'reorder_layer'].includes(operation.kind),
  )
  const layers = new Set<string>()
  if (
    layerOperations.length ||
    command?.kind === 'undo' ||
    command?.kind === 'redo'
  ) {
    const previous = new Map(
      before.layers.map((layer, index) => [layer.id, { layer, index }]),
    )
    const current = new Map(
      after.layers.map((layer, index) => [layer.id, { layer, index }]),
    )
    for (const id of affected) {
      if (!previous.has(id) && !current.has(id)) continue
      if (JSON.stringify(previous.get(id)) !== JSON.stringify(current.get(id)))
        layers.add(id)
    }
    for (const operation of layerOperations)
      if ('id' in operation && operation.id && affected.has(operation.id))
        layers.add(operation.id)
  }
  const previousObjects = new Map(
    before.elements.map((element) => [element.id, element]),
  )
  const currentObjects = new Map(
    after.elements.map((element) => [element.id, element]),
  )
  const objectChanged = (id: string) => {
    const previous = previousObjects.get(id)
    const current = currentObjects.get(id)
    return (
      JSON.stringify(previous) !== JSON.stringify(current) ||
      Boolean(
        previous &&
        current &&
        previous.type === 'connection' &&
        current.type === 'connection' &&
        JSON.stringify(elementBounds(before, previous)) !==
          JSON.stringify(elementBounds(after, current)),
      )
    )
  }
  const targets = new Set<string>()
  for (const document of [after, before])
    for (const element of document.elements)
      if (
        (affected.has(element.id) &&
          (!layers.has(element.id) || objectChanged(element.id))) ||
        layers.has(element.layerId)
      ) {
        targets.add(element.id)
        if (targets.size === 100) return [...targets]
      }
  return [...targets]
}

export type CanvasAiPresenceEvent = {
  id: string
  kind: 'read' | 'edit'
  phase: 'working' | 'complete'
  at: number
  scope: string
  targets: {
    id: string
    bounds: ElementBounds
    previousBounds?: ElementBounds
    removed?: boolean
  }[]
}

function bounds(document: CanvasDocument, id: string) {
  const element = document.elements.find((item) => item.id === id)
  if (!element) return null
  const value = elementBounds(document, element)
  return Object.values(value).every(Number.isFinite) &&
    value.width >= 0 &&
    value.height >= 0
    ? { ...value }
    : null
}

/** Capture only geometry that the shared canvas actually exposes. Never retain content. */
export function createCanvasAiPresence({
  id,
  kind,
  phase,
  at,
  scope,
  before,
  after = before,
  targetIds,
}: {
  id: string
  kind: CanvasAiPresenceEvent['kind']
  phase: CanvasAiPresenceEvent['phase']
  at: number
  scope: string
  before: CanvasDocument
  after?: CanvasDocument
  targetIds: string[]
}): CanvasAiPresenceEvent {
  const previousVisible = orderedVisibleElements(before)
  const currentVisible = orderedVisibleElements(after)
  const previousIds = new Set(previousVisible.map((item) => item.id))
  const currentIds = new Set(currentVisible.map((item) => item.id))
  const afterIds = new Set(after.elements.map((item) => item.id))
  const targets: CanvasAiPresenceEvent['targets'] = []
  const seen = new Set<string>()
  const capture = (targetId: string) => {
    if (seen.has(targetId) || targets.length >= CANVAS_AI_PRESENCE_MAX_TARGETS)
      return
    seen.add(targetId)
    if (currentIds.has(targetId)) {
      const current = bounds(after, targetId)
      const previous = previousIds.has(targetId)
        ? bounds(before, targetId)
        : null
      if (current)
        targets.push({
          id: targetId,
          bounds: current,
          ...(previous &&
          Object.keys(current).some(
            (key) =>
              current[key as keyof ElementBounds] !==
              previous[key as keyof ElementBounds],
          )
            ? { previousBounds: previous }
            : {}),
        })
    } else if (
      kind === 'edit' &&
      phase === 'complete' &&
      !afterIds.has(targetId) &&
      previousIds.has(targetId)
    ) {
      const previous = bounds(before, targetId)
      if (previous)
        targets.push({ id: targetId, bounds: previous, removed: true })
    }
  }
  for (const targetId of targetIds) {
    if (targets.length >= CANVAS_AI_PRESENCE_MAX_TARGETS) break
    capture(targetId)
  }
  return { id, kind, phase, at, scope, targets }
}

/** Recheck visibility so later manual changes cannot leave a stale ghost behind. */
export function visibleCanvasAiTargets(
  event: CanvasAiPresenceEvent,
  document: CanvasDocument,
) {
  const visible = new Set(
    orderedVisibleElements(document).map((item) => item.id),
  )
  const existing = new Set(document.elements.map((item) => item.id))
  return event.targets
    .slice(0, CANVAS_AI_PRESENCE_MAX_TARGETS)
    .flatMap((target) => {
      if (visible.has(target.id)) {
        const current = bounds(document, target.id)
        return current ? [{ ...target, bounds: current, removed: false }] : []
      }
      return target.removed && !existing.has(target.id) ? [target] : []
    })
}
