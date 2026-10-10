# LCANVAS files and viewing

## Current scope

A project organizes multiple `.lcanvas` files. Work opens the most recently opened project; its file explorer lists that project's files. Open files appear as tabs. Closing a tab or either side panel closes the view, without deleting the saved file. The file explorer can reopen a closed file.

- **New canvas** creates and stores a blank file in the current project.
- **Import** accepts one or more supported `.lcanvas` files and stores new copies in that project.
- **Rename canvas** stores the new name without changing its objects.
- **Save** stores the current viewport in this browser. The file status reports when a view has changed and still needs saving.
- **Export** downloads the current file, including its current viewport, as a portable `.lcanvas` copy.

New/imported files and names are saved automatically; pan/zoom changes use the explicit Save action. On returning to a project, its most recently opened saved file is selected. The set of open tabs and view-navigation history are session state.

The viewer displays the supported LCANVAS elements, supports panning and zooming, and keeps its right-side controls available when the AI panel is closed. Undo and redo restore **view changes** in this release. They do not undo drawing or object edits. Drawing, object selection/editing, and AI operations remain future work.

The right panel identifies the current project and active file. It reports that AI is disconnected and the MCP service is unavailable. No MCP transport, authenticated bridge, ChatGPT session, or model API is introduced by this viewer. The scope shown there is context for a future connection, not a verified live connection.

This is a bounded viewer and file-management step. It does not select or replace the future drawing engine, complete its license review, or satisfy the full manual-whiteboard milestone.

## Local storage and portable backups

Project names and appearance preferences retain their existing versioned browser metadata record. LCANVAS documents use IndexedDB separately, so adding files does not enlarge that metadata record. Local file records belong to one project; a portable file does not grant access to another project.

Browser storage belongs to an origin: protocol, host and port. The development URL, preview URL and a launcher fallback port can have different storage. Moving the executable folder does not move browser documents. Export important `.lcanvas` files and import them at the destination origin to carry them between installations or browsers. Clearing site data removes the browser's local records.

The interface reports failed file writes. An export is the portable backup; a downloaded file and a browser record are separate copies. Import validates the whole supported document before adding it to the current project. Unsupported files are rejected with an error instead of partially loading their contents.

There is no fixed per-project file-count limit in this step. Available browser storage and device memory remain practical limits. Each local record has its own generated file ID, project ID, creation/update/opening timestamps, and validated document. Import creates a new local record in the selected project; the portable document excludes those local identifiers and dates.

## Version 1 format

An `.lcanvas` file is UTF-8 JSON. Its exact root fields are `format`, `version`, `name`, `viewport`, and `elements`. Extra fields are rejected, including external resource URLs, executable markup, and unsupported engine payloads. This is the Canvas Live version 1 viewer format; it is not an Excalidraw file or a renamed arbitrary JSON document.

This complete blank-file example is equivalent to `createCanvasDocument('Roadmap')`:

```json
{
  "format": "LCANVAS",
  "version": 1,
  "name": "Roadmap",
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "elements": []
}
```

The viewport maps a canvas point to screen pixels as `screenX = viewport.x + canvasX * zoom` and the equivalent expression for `y`. A zoom of `1` means 100%. Object positions and sizes use canvas coordinates.

| Element type | Required fields in addition to `id`, `type`, `x`, `y`, `color` |
| ------------ | -------------------------------------------------------------- |
| `rectangle`  | `width`, `height`, `fill`                                      |
| `ellipse`    | `width`, `height`, `fill`                                      |
| `text`       | `width`, `height`, `text`, `fontSize`                          |
| `line`       | `x2`, `y2`                                                     |

For example, this rectangle may be placed in `elements`:

```json
{
  "id": "milestone-1",
  "type": "rectangle",
  "x": 80,
  "y": 60,
  "width": 240,
  "height": 120,
  "color": "#7C5CFC",
  "fill": null
}
```

Colors use `#RRGGBB`. A shape's `fill` is a color or `null` for no fill. Text is rendered as literal text in system fonts, with newlines and tabs allowed, inside its declared width and height. A line joins the two explicit endpoints; version 1 has no arrowhead, group, attachment, image, or connection-reference format.

The parser enforces these bounds before loading:

| Field            | Limit                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Encoded file     | 10 MiB of UTF-8 JSON                                                     |
| Elements         | At most 5,000                                                            |
| Name             | Trimmed, 1–120 characters; no control characters                         |
| Element ID       | Unique within the file, 1–200 characters, trimmed; no control characters |
| Coordinates      | Finite values from −1,000,000 through 1,000,000                          |
| Width and height | Greater than zero, at most 1,000,000                                     |
| Zoom             | 0.1–4, or 10%–400%                                                       |
| Text per element | At most 20,000 UTF-16 code units; plain text                             |
| Font size        | 8–160                                                                    |

Unknown versions, malformed JSON, duplicate element IDs, non-finite/out-of-range values, and unsupported fields/types are rejected. Invalid files do not replace an existing file. Future schema changes require an explicit migration or another supported version; version 1 does not guess how to reinterpret a newer document.

## Viewing controls

Drag the canvas to pan. Scroll over it to zoom. While the canvas has keyboard focus, arrow keys pan, `+`/`−` zoom, and `0` resets the view to fit supported objects within the zoom and coordinate bounds. Very widely spread objects can still extend beyond the visible area at the minimum zoom. The right rail contains Undo view, Reset view, Redo view, Zoom in, Zoom out, and the AI-panel toggle. It stays present independently of the file explorer and AI panel.

`Ctrl`/`Cmd` + `Z` undoes a view change; `Ctrl`/`Cmd` + `Shift` + `Z`, or `Ctrl`/`Cmd` + `Y`, redoes it. A new view change clears redo history. A drag is one history step, and the viewer keeps at most 100 prior steps. The saved viewport belongs to the file. Navigation history is session state and is not part of the portable file.

## Verification boundary

Unit and component checks cover the supported format, file management and view controls. The task's completion report records the checks actually executed. No test in this step proves drawing-engine undo/redo or ChatGPT/MCP connectivity.

See [LCANVAS_VERIFICATION.md](LCANVAS_VERIFICATION.md) for the 129-test result, 24 launcher checks, native IndexedDB reload and browser import/export verification. Switching files starts a fresh viewer navigation history.
