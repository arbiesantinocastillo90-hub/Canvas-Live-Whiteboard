# LCANVAS files

## Projects and saving

A project organizes multiple `.lcanvas` files. Work returns to the latest project and its most recently opened file. Open files appear as tabs. Closing a tab or panel never deletes a file; the file explorer reopens it.

- **New canvas** creates and stores a blank file in the current project.
- **Import** validates supported files and stores new copies in that project.
- **Rename canvas** stores the new name and current contents.
- **Save** stores the entire document: objects, layers, membership, connections and viewport. The indicator reports unsaved changes or failed storage.
- **Export** downloads a portable copy of the current state, including unsaved changes.

Edits and navigation require explicit Save. Unsaved drafts survive section/project navigation in the current tab; the app warns before page unload when drafts remain. They are not a durable backup. Opening a different file starts a fresh undo session. See [EDITOR.md](EDITOR.md) for tools, fullscreen, layers and connections.

Project names and appearance preferences retain their existing browser metadata. Individual files use project-scoped IndexedDB, with validated ownership on every read/write. Failed writes retain a clearly labelled session overlay. There is no arbitrary per-project file-count cap; browser quota and device memory are practical limits.

Browser data belongs to its profile and URL origin, including the port. Moving the executable folder does not carry browser documents. Export important files and import them into another browser or origin. Clearing site data removes local records. A downloaded file and a saved browser record are separate copies. There is no cross-tab conflict resolution yet.

## Version 2 format

LCANVAS is UTF-8 JSON with exact root fields `format`, `version`, `name`, `viewport`, `layers` and `elements`. Extra fields, external resource URLs, executable markup and unsupported payloads are rejected. It is an independent Canvas Live format. A complete blank file is:

```json
{
  "format": "LCANVAS",
  "version": 2,
  "name": "Roadmap",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "layers": [
    { "id": "layer-main", "name": "Main", "visible": true, "locked": false }
  ],
  "elements": []
}
```

The viewport maps canvas coordinates to pixels as `screenX = viewport.x + canvasX * zoom`, likewise for Y. Zoom `1` is 100%. All elements require unique `id`, `type`, `color`, `layerId` and `areaId`. Layer IDs reference a declared layer; `areaId` is either `null` or an existing containing area. Elements use these additional exact fields:

| Type                              | Additional fields                                                    |
| --------------------------------- | -------------------------------------------------------------------- |
| `rectangle`, `ellipse`, `diamond` | `x`, `y`, `width`, `height`, `fill`, `text`, `fontSize`              |
| `text`                            | `x`, `y`, `width`, `height`, `text`, `fontSize`                      |
| `area`                            | `x`, `y`, `width`, `height`, `name`, `fill`; `areaId` must be `null` |
| `line`                            | `x`, `y`, `x2`, `y2`                                                 |
| `connection`                      | `fromId`, `toId`, `style`, `startArrow`, `endArrow`                  |

Colors use `#RRGGBB`; fill may be a color or `null`. Shape text belongs to that object. Text is rendered literally in system fonts and clipped to its bounds. Connections reference distinct existing shapes, text items or areas. Their coordinates are derived from the endpoints, so moving/resizing endpoints preserves attachment. `style` is `straight` or `elbow`; arrow booleans select none, start, end or both ends. Legacy lines retain explicit endpoints.

Every member must fit inside its area. Areas cannot be nested. Connections can belong to an area only when both endpoint objects belong to it. Layer membership and area membership are independent. Layers order back to front in the document; areas render behind the other objects in their layer. Hidden area layers also hide their members; locked area layers prevent member edits. Hiding an endpoint hides its connections.

## Validation and migration

The parser validates the whole document before use. Unknown versions, unsupported fields/types, duplicate IDs, dangling references, malformed colors, unsafe text and invalid geometry are rejected without replacing existing files.

| Field                        | Limit                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Encoded document             | 10 MiB of UTF-8 JSON                                                             |
| Elements                     | 5,000                                                                            |
| Layers                       | 1–100                                                                            |
| Canvas, area and layer names | Trimmed, 1–120 characters; no control characters                                 |
| IDs                          | Unique within their collection, trimmed, 1–200 characters; no control characters |
| Coordinates                  | Finite values from −1,000,000 through 1,000,000                                  |
| Width and height             | Greater than zero, at most 1,000,000                                             |
| Zoom                         | 0.1–4 (10%–400%)                                                                 |
| Text per element             | 20,000 UTF-16 code units; plain text, permitting newlines/tabs                   |
| Font size                    | 8–160                                                                            |

Valid version 1 files are still supported. Their original root fields are `format`, `version`, `name`, `viewport` and `elements`; supported objects are rectangles/ellipses without shape text, standalone text and explicit lines. Validation occurs before migration. The migration preserves IDs, geometry, colors, text and viewport, adds the visible unlocked Main layer, sets `areaId` to `null` and supplies empty shape text with the default font size. It does not guess unsupported data.

Reads return v2 models in memory. Opening an old browser record updates recency while preserving its original stored v1 payload. Save and export write v2. Original disk files are never overwritten by import. Portable documents contain no project IDs, local record IDs or timestamps.

Undo/redo history is session state, excluded from portable files. Content and viewport share at most 100 retained snapshots and an estimated 32 MiB history budget. The optional MCP companion operates on the explicitly shared open document through the editor and does not change the file format or save automatically. See the historical [viewer verification](LCANVAS_VERIFICATION.md), [editor verification](EDITOR_VERIFICATION.md) and subsequent [MCP verification](MCP_VERIFICATION.md).
