# Canvas editing

## Working in a file

Open an LCANVAS file in Work. The drawing toolbar adds rectangles, ellipses, diamonds, standalone text and containment areas. New objects appear near the center of the current view on the active layer. Select an object and drag it to move; use eight handles to resize, keeping the opposite edge fixed and Shift to preserve proportions. Shift-click or drag a marquee selects a group; dragging/nudging moves the selection together. Double-click text, a shape or an area to edit its label inline. Enter adds a line, Ctrl/Cmd+Enter applies and Escape cancels. Properties edits exact position/dimensions, colors, layers and containing areas. Text inside a shape belongs to that shape, moves with it and stays inside its bounds.

Properties are drafts until **Apply properties**. Applying several changes together creates one undo step. Invalid dimensions, missing references and unsupported values are rejected with a visible error. Deleting a selected object is bounded; deleting a shape also removes its attached connections. Deleting an area preserves its members and removes their area assignment.

**Full screen canvas** focuses on the current file, hides the project navigation, file explorer, tabs and auxiliary panels, and fits its visible objects into the available view. The canvas tools, save action, undo/redo, zoom and exit control remain available. The browser's native full-screen view is used when supported; the same focused app layout works when it is unavailable. Exit with the control or Escape to restore the surrounding layout.

Choose **Pan** to drag the view. Middle mouse or Alt-drag also pans. Mouse wheel zooms around the pointer; trackpad deltas pan and Ctrl/Cmd-wheel zooms. Pointer/wheel updates are batched to frames. Camera movement does not consume object Undo/Redo history. The right rail keeps Undo, Reset view, Redo, Zoom in and Zoom out available. Reset view fits the visible objects. A complete drag is one history step; interrupted drags can be cancelled without saving partial changes.

While the canvas has keyboard focus, arrow keys move a selected editable object, or pan when no object is selected. Shift uses larger movement steps. Delete/Backspace deletes the selected object. `+`/`−` zoom and `0` fits the view. `Ctrl`/`Cmd` + `Z` undoes; `Ctrl`/`Cmd` + `Shift` + `Z` or `Y` redoes. Typing inside property inputs uses ordinary text-input behavior.

## Areas and layers

An area is a named frame with explicit membership. Choose a containing area in the selected object's properties. The area must fully contain the member. Moving an area moves all its members in the same transaction, including attached connections. An area cannot contain another area. Resize cannot exclude existing members; moving a member outside an area detaches it. Connections can belong to an area when both of their endpoints belong to it.

Layers organize every object, including text, areas and connections. Properties lists layers from front to back and shows each object's layer. Add and name a layer, select it for new objects, rename it, change its order, hide it or lock it. Hidden layers are omitted from the canvas, while their objects remain accessible in the object list. Hidden and locked layers cannot be edited. Hiding an area's layer hides its members; locking it prevents member editing even when members belong to another layer.

Area membership and layer membership are independent. They are explicit LCANVAS fields, preserved by saving, export and import. The object list lets the user select an object by its name and layer.

## Connections

Choose **Connect objects**, then select a source and target shape, text item or area. Choose a straight or elbow path and no arrows, an end arrow, a start arrow or arrows at both ends. The connection tracks both objects as they move or resize. Selected connections expose the same path and arrow choices in Properties. Connection endpoints are stable object identifiers, not screen coordinates.

## Saving and format compatibility

Save chooses/reuses a physical LCANVAS file in supported browsers; Save as chooses another destination. Bound files can autosave committed changes with already granted permission. Browser copies and persistent recovery are separate from physical save status. See [HOME_AND_LOCAL_FILES.md](HOME_AND_LOCAL_FILES.md). Export includes the current state, including unsaved edits. The save indicator reports whether changes remain to be saved and whether browser storage failed. Unsaved content survives section/project navigation in the current tab. Home and Options retain current history; switching files/projects starts fresh history; history is not included in portable files.

The editor exports LCANVAS version 2, adding layers, diamond shapes, shape text, areas and reference-based connections. Existing version 1 files and browser records are validated and migrated to version 2 in memory: objects enter the visible, unlocked Main layer; shapes acquire empty text and the default font size; previous positions, colors, dimensions and view are preserved. Saving or exporting writes version 2. Unsupported versions or fields are rejected rather than guessed.

Each document remains limited to 10 MiB and 5,000 objects, with at most 100 layers. IDs, references, coordinates, dimensions, text and colors are validated. The original browser storage and project ownership boundaries still apply. See [LCANVAS.md](LCANVAS.md) for local storage and portable backup behavior.

## Implementation boundary

`CanvasEditor.tsx` renders and handles pointer/keyboard interactions. `CanvasInspector.tsx` implements controlled properties and layer management. Both use the validated pure functions in `canvasOperations.ts`; transport code does not own canvas business logic. `editorHistory.ts` records document and view transactions with at most 100 prior snapshots and an estimated 32 MiB retained-history budget. Large documents can retain fewer steps.

The manual editor milestone uses the application's original SVG renderer, system fonts and existing React dependencies. It adds no drawing-engine, font, icon or model package. Group selection, clipboard copy/cut/paste and duplication are supported. Freehand drawing, rich text, images, nested areas, layer deletion and collaboration remain outside this step. The subsequent optional MCP companion uses the same validated operations and history. Workspace AI reports explicit sharing and MCP client access; actual ChatGPT account pairing is a separate acceptance step. See [CHATGPT_MCP.md](CHATGPT_MCP.md).

The manual editor completion report records its own automated and browser checks. [MCP_VERIFICATION.md](MCP_VERIFICATION.md) records the later local SDK and browser integration checks and distinguishes them from a live ChatGPT account connection.
