# Canvas editing

Current controls as of October 19, 2026. Canvas Live uses its own SVG editor. It works without an AI connection; optional MCP edits use the same validated operations and content history.

## Create, select and edit

Open a `.CLF` canvas in Work. Creating a canvas requires choosing its destination project inside the active workspace. This organizes the canvas; physical Save locations are a separate choice.

Tools include rectangles, ellipses, diamonds, triangles, pentagons, hexagons, stars, cylinders, parallelograms, trapezoids, text, areas, connections and media embeds. New toolbar objects appear near the current view center on the active layer. Right-click empty canvas space for a compact add panel positioned at the clicked canvas location.

Select an object and drag to move it. Shift-click or drag a marquee to select multiple objects. Move, nudge, duplicate or apply supported properties to the selection together. Ctrl/Cmd-drag copies an object or selection in one Undo step. Copy/cut/paste supports bounded canvas data and plain text; see [Copying](NOTIFICATIONS_AND_COPYING.md).

Drag an object's edges to resize. Corner handles resize; side handles start relationships. Hold Shift while resizing to preserve proportions. Optional object snapping aligns nearby geometry and shows guides; its Options setting is independent of grid snapping. Alt temporarily bypasses snapping.

Double-click text or a shape to edit its label inline. Enter inserts a line, Ctrl/Cmd+Enter applies, and Escape cancels. Text stays with its shape. Properties and the right-click quick panel provide supported font family, size, color, weight, italic, horizontal alignment and vertical placement controls. These apply to whole object labels; character-by-character rich-text formatting is not implemented.

Valid Properties drafts commit after a short pause or when leaving a field. Selection changes and Save flush valid pending fields first. Invalid dimensions, references or values retain the valid document and show an error. Locks and external edits replace stale drafts. Multi-selection edits apply supported fields to eligible objects in one history transaction; unsupported fields remain unavailable.

## Areas and layers

Select an area by clicking its border. Its interior lets clicks reach objects inside it. A marquee catches an area only when it intersects one of the area's borders; a marquee entirely inside the area does not select the area. This also applies when the ordinary marquee mode requires contained objects.

Properties combines layers and their contained objects. Expand a layer to browse or select its objects. Drag layer handles to reorder the stack, or focus a handle and use Alt+Up/Down. Drag an editable object into another editable layer to change its layer. Hidden or locked objects and unavailable target layers cannot be moved. Layer movement respects reduced-motion preferences.

Each object belongs to a layer. Layers control stacking, visibility and locking. Areas render below other objects within the same layer; an area in a higher layer can still appear above objects in a lower layer. Layers can be added and renamed. Layer deletion and nested areas are not implemented.

The former **Containing area** property selector has been removed. Existing supported files can still carry explicit area membership: moving such an area moves its members, deleting it preserves its members, and moving a member outside detaches it. Legacy membership remains separate from layer membership, including its existing visibility and lock rules. New layer organization does not create membership merely because an object visually overlaps an area.

## Connections

Drag a side connection handle onto the intended side of another object, or use **Connect objects** and select its source and target. Connections reference stable object IDs, so moving nodes updates their endpoints. Properties can set each endpoint to Top, Right, Bottom, Left or Auto. Fixed sides remain attached to their selected side; Auto follows geometry.

To change an existing relationship, select it to reveal a circular handle at each end. Drag either handle toward another editable shape, text item or embed. The preview highlights the nearest Top, Right, Bottom or Left attachment; release to move that end there. You can also move an end to another side of its current object. For an area, target its border rather than its interior.

A successful drop changes only that end and its side, preserving the other attachment and the relationship's appearance. One Undo restores the previous attachment. Releasing over empty space, a hidden or locked target, or the opposite endpoint's object keeps the previous attachment. Escape, interrupted pointer capture or leaving Work cancels the preview. Clicking a handle without dragging creates no edit, including for an Auto attachment. The floating preview is temporary; it does not create a free endpoint in the saved file.

Right-click a relationship for quick properties and reversal. Paths include straight, elbow, curve and step. Line styles include solid, dashed and dotted. Start and end pointers can independently use none, filled arrow, open arrow, circle, diamond or bar. Reverse swaps endpoints and their attached sides while retaining configured pointer styles. Deleting a node also removes its attached connections.

## Media and embedded content

Insert supported images, GIFs, video, audio, websites and documents from the add tools. Local uploads are validated and bounded to 20 MiB. The top-left controls pause or minimize an embed, unloading its player/frame to reduce background work. Media playback position is retained during the current editor session. External pages may prohibit framing or require their own sign-in. Native Office document editing is not included.

Owned media is stored separately and referenced by content hash. Keep `data/media/` with the portable native library when transferring the USB. Exporting a `.CLF` reference alone does not copy its local media bytes. See [Rich canvas controls](RICH_CANVAS.md).

## Navigation and keyboard

Choose Pan, use middle mouse, hold Space temporarily, or Alt-drag to move the view. Mouse wheel zooms around the pointer; trackpad deltas pan and Ctrl/Cmd-wheel zooms. Camera updates are batched to frames. Camera changes preserve the current content Undo/Redo history.

With canvas keyboard focus, arrow keys move an editable selection or pan when nothing is selected. Shift uses larger steps. Delete/Backspace deletes a selection. `+`/`−` zoom, `0` fits the view, Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z or Y redoes. Text inputs retain ordinary typing behavior. Shortcuts can be customized in Options.

Full screen focuses on the current file, hides surrounding panels and fits visible objects. It requests native browser fullscreen when supported and retains an app fallback. Escape or the exit control restores the workspace. A compact keyboard focus marker replaces the former full-canvas outline.

## Saving and compatibility

Save options show the destination, Save now, Choose location and autosave timing. Native-library saves retain content in the package's `data/` folder. Supported browsers can also write a chosen physical `.CLF`; bound autosaving uses already granted permission. Browser recovery and current-tab drafts remain separate from a completed save. Export includes current unsaved document content. See [Save options](SAVE_OPTIONS.md) and [File formats](FILE_FORMATS.md).

Home and Options retain the mounted editor and history while disabling commands and AI sharing. Switching files or projects begins fresh history. A completed drag or batch is one Undo step. History retains at most 100 prior snapshots within an estimated 32 MiB budget and is excluded from exported files.

LCANVAS v2 is the current document payload. Supported v1 files migrate in memory, preserving geometry and camera; Save/export writes v2. Unknown versions or unsupported fields are rejected. Each document is bounded to 10 MiB, 5,000 objects and 100 layers. The native library rejects stale record revisions; it does not automatically merge concurrent canvas edits or provide real-time multiplayer.

For verification tied to a dated build, see [Relationship endpoint verification](RELATIONSHIP_ENDPOINTS_VERIFICATION.md), [Rich canvas verification](RICH_CANVAS_VERIFICATION.md) and [Workspace interaction verification](WORKSPACE_INTERACTIONS_VERIFICATION.md). The earlier [editor verification](EDITOR_VERIFICATION.md) describes the October 10 milestone and its narrower feature set. External ChatGPT account connectivity remains a separate acceptance step; see [ChatGPT setup](CHATGPT_MCP.md).
