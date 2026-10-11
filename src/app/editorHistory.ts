import type { CanvasDocument } from './lcanvas'

export const EDITOR_HISTORY_LIMIT = 100
// Large imported boards retain fewer steps to keep local history bounded.
export const EDITOR_HISTORY_BYTES = 32 * 1024 * 1024

export type EditorHistory = {
  past: CanvasDocument[]
  present: CanvasDocument
  future: CanvasDocument[]
}

export function sameDocument(a: CanvasDocument, b: CanvasDocument): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function estimatedBytes(document: CanvasDocument): number {
  return JSON.stringify(document).length * 2
}

function boundedPast(
  documents: CanvasDocument[],
  limit = EDITOR_HISTORY_BYTES,
): CanvasDocument[] {
  const retained: CanvasDocument[] = []
  let bytes = 0
  for (let index = documents.length - 1; index >= 0; index--) {
    const document = documents[index]
    bytes += estimatedBytes(document)
    if (bytes > limit || retained.length >= EDITOR_HISTORY_LIMIT) break
    retained.unshift(document)
  }
  return retained
}

export function createEditorHistory(document: CanvasDocument): EditorHistory {
  return { past: [], present: document, future: [] }
}

export function commitEditorHistory(
  history: EditorHistory,
  document: CanvasDocument,
): EditorHistory {
  if (sameDocument(history.present, document)) return history
  return {
    past: boundedPast([...history.past, history.present]),
    present: document,
    future: [],
  }
}

export function undoEditorHistory(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  const future: CanvasDocument[] = []
  let futureBytes = 0
  for (const document of [history.present, ...history.future]) {
    const bytes = estimatedBytes(document)
    if (
      futureBytes + bytes > EDITOR_HISTORY_BYTES ||
      future.length >= EDITOR_HISTORY_LIMIT
    )
      break
    futureBytes += bytes
    future.push(document)
  }
  return {
    past: boundedPast(
      history.past.slice(0, -1),
      EDITOR_HISTORY_BYTES - futureBytes,
    ),
    present: previous,
    future,
  }
}

export function redoEditorHistory(history: EditorHistory): EditorHistory {
  const next = history.future[0]
  if (!next) return history
  const future = history.future.slice(1)
  const futureBytes = future.reduce(
    (total, document) => total + estimatedBytes(document),
    0,
  )
  return {
    past: boundedPast(
      [...history.past, history.present],
      EDITOR_HISTORY_BYTES - futureBytes,
    ),
    present: next,
    future,
  }
}
