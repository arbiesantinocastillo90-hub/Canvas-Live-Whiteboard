# Canvas Live files

- **.CLF** is a Canvas Live canvas file: shapes, text, areas, layers, connections, and camera. Save as and downloaded copies use this extension. Its validated JSON payload remains `LCANVAS`, version 2, so the existing document and MCP operations stay compatible.
- **.CLP** is a portable project container: the chosen project, its descendant projects, and every included canvas document. Export captures the current documents, including available unsaved drafts. It does not include workspace layout, browser permissions, local file handles, or AI connection credentials. The JSON envelope is `CanvasLiveProject`, version 1.
- **.CLW** is a saved UI workspace: appearance, panel layout, project references, and tab/editor context. It keeps the existing `CanvasLiveWorkspace`, version 1, payload. It does not contain canvas documents; use .CLP or .CLF to back up the contents.

New imports keep existing projects and files intact. A .CLP import receives fresh project and file identifiers, remaps the project hierarchy, and leaves canvas object identifiers unchanged. Importing twice creates separate copies. Exporting a subproject detaches the exported copy from its original parent.

Old **.lcanvas** and **.lworkspace** files remain importable. Save continues writing an already bound local file under its existing name; it never silently renames or deletes that file. Save as creates a new .CLF file. These extensions describe JSON files, not executable content.

A .CLP file is limited to 25 MiB of UTF-8 JSON, 100 projects, and 500 canvas files. Each canvas retains its existing validated limits. Invalid references, duplicate identifiers, cycles, unsupported formats, invalid dates, malformed documents, and oversized archives are rejected before import; oversized archives are never truncated. Export smaller subprojects or individual canvases if an archive exceeds the limits.

Downloads are explicit local backup files. Browser file associations and automatic opening by double-click in Windows are not changed by this format update.
