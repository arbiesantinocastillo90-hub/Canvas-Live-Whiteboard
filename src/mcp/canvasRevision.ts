import type { CanvasDocument } from '../app/lcanvas'

// Camera movement changes the saved view, but not the content an AI edit targets.
export function serializedCanvasContent(document: CanvasDocument) {
  return JSON.stringify({
    format: document.format,
    version: document.version,
    name: document.name,
    layers: document.layers,
    elements: document.elements,
  })
}
