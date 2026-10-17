# Canvas Live files

- **.CLF** is a Canvas Live canvas file: shapes, text, areas, layers, connections, camera, and optional card appearance. Save as and downloaded copies use this extension. Its validated JSON payload remains `LCANVAS`, version 2, so the existing document and MCP operations stay compatible.
- **.CLP** is a portable project container: the chosen project, its descendant projects, their metadata and appearance, and every included canvas document. Export captures the current documents, including available unsaved drafts. It does not include workspace layout, browser permissions, local file handles, or AI connection credentials. The JSON envelope is `CanvasLiveProject`, version 1.
- **.CLW** is a saved UI workspace: appearance, canvas control preferences, panel layout, Home and workspace-library perspectives, project references, and tab/editor context. It keeps the existing `CanvasLiveWorkspace`, version 1, payload. It does not contain canvas documents or background image bytes; use .CLP or .CLF to back up document contents.

The optional `.CLF` document `presentation` object stores a built-in icon name,
accent color, card fill, card outline and plain-text description. Colors are
validated hex values or automatic theme defaults. Existing files without this
field keep their default presentation. Project records in `.CLP` may carry the
same presentation fields and a modification timestamp used for sorting. Changing
these decorations does not change the objects inside a canvas or its project
parent relationships.

Workspace preferences in `.CLW` include the workspace identity, description,
title and icon styles, background color and gradient, and an optional SHA-256
image reference. Panel layout also remembers the Home Projects/Canvas
perspective, card/tree view, ordering and collapsed sections. The corresponding
local image is stored separately: the installed app uses `data/appearance/`,
while a development browser uses its IndexedDB asset store. A transferred `.CLW`
needs its background image selected again on a device without that asset. Copy
the complete application's `data/` folder when backing up its installed library.

New imports keep existing projects and files intact. A .CLP import receives fresh project and file identifiers, remaps the project hierarchy, and leaves canvas object identifiers unchanged. Importing twice creates separate copies. Exporting a subproject detaches the exported copy from its original parent.

Old **.lcanvas** and **.lworkspace** files remain importable. Save continues writing an already bound local file under its existing name; it never silently renames or deletes that file. Save as creates a new .CLF file. These extensions describe JSON files, not executable content.

A .CLP file is limited to 25 MiB of UTF-8 JSON, 100 projects, and 500 canvas files. Each canvas retains its existing validated limits. Invalid references, duplicate identifiers, cycles, unsupported formats, invalid dates, malformed documents, and oversized archives are rejected before import; oversized archives are never truncated. Export smaller subprojects or individual canvases if an archive exceeds the limits.

Downloads are explicit local backup files. Browser file associations and automatic opening by double-click in Windows are not changed by this format update.
