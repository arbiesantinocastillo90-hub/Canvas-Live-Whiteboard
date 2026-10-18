# Canvas Live files

- **.CLF** is a Canvas Live canvas file: shapes, text, areas, layers, connections, camera, and optional card appearance. Save as and downloaded copies use this extension. Its validated JSON payload remains `LCANVAS`, version 2, so the existing document and MCP operations stay compatible.
- **.CLP** is a portable project container: the chosen project, its descendant projects, their metadata and appearance, and every included canvas document. Export captures the current documents, including available unsaved drafts. It does not include workspace layout, browser permissions, local file handles, or AI connection credentials. The JSON envelope is `CanvasLiveProject`, version 1.
- **.CLW** is a saved workspace: explicit project membership, workspace-specific project and canvas presentation overrides, appearance, canvas control preferences, panel layout, Home and workspace-library perspectives, and tab/editor context. It keeps the existing `CanvasLiveWorkspace`, version 1, payload. It does not contain canvas documents or background image bytes; use .CLP or .CLF to back up document contents.

The optional `.CLF` document `presentation` object stores a built-in icon name,
accent color, card fill, card outline and plain-text description. Colors are
validated hex values or automatic theme defaults. Existing files without this
field keep their default presentation. Project records in `.CLP` may carry the
same presentation fields and a modification timestamp used for sorting. Changing
these decorations does not change the objects inside a canvas or its project
parent relationships. Within the app, a workspace can override this imported
appearance without changing the document's canonical presentation or another
workspace's override. Exporting `.CLF` or `.CLP` includes the active workspace's
appearance, so it can serve as an imported default elsewhere.

A `.CLW` may contain `projectIds`, `projectPresentations` and
`filePresentations`. `projectIds` defines the workspace's included projects; the
two presentation maps key validated item styles by project or canvas identifier.
An explicit empty list means an empty workspace. Older workspaces already saved
locally without membership receive the existing visible project identifiers
once, preserving their library. A newly imported legacy `.CLW` without membership
instead starts empty with its saved settings. Explicit imported membership keeps
valid local references. New workspaces always receive an empty list and empty
override maps. Creating or importing a project or canvas adds it only to the selected
workspace. Importing a standalone `.CLF` into an empty workspace creates an
**Imported canvases** container after a valid file has been chosen. Cancelling the
picker creates nothing.

Membership records are references into the local library, not copies of canvas
contents or physical file permissions. Export `.CLP` or `.CLF` separately when
moving document contents to another installation. See
[Workspace contents and independent appearance](WORKSPACE_ISOLATION.md).

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

## Rich objects and media references

Version-two canvas documents also support triangle, pentagon, hexagon, star,
cylinder, parallelogram and trapezoid shapes. Shape/text records may carry
optional bounded font, alignment and font-color fields. Connections retain the
legacy arrow booleans while adding curve/step paths, line patterns and separate
pointer types. Existing documents without these fields retain their earlier
appearance.

An `embed` record stores a media kind, HTTPS URL or `media:<SHA-256>` reference,
title, geometry, layer, paused state and minimized state. It does not store file
paths, HTML source, credentials or large media byte strings. Native binary
media lives in `data/media/` and browser-only media in IndexedDB. Exported `.CLF`
and `.CLP` files preserve references; they do not bundle these binaries. Copy
the complete portable app folder or its full `data/` directory when moving an
installed library with local embeds. See [Rich canvas controls](RICH_CANVAS.md).
