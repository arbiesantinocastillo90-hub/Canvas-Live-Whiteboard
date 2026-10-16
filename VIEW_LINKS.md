# Portable view links

Copy view link captures the current workspace appearance and layout, active project, every open tab in that project, each open canvas document and camera, and the active selection, tool, layer, connection settings and focus mode. It captures the condition at copy time. It does not silently discard tabs to make a shorter link.

The URL carries the snapshot in its fragment. Opening it creates an isolated editing session with new workspace, project and file identities. Its documents, recovery and layout stay separate from the main app's browser library; loading or reloading embeds does not accumulate projects or replace originals. Changes after the link was copied are independent. Opening the same link again restores the copied condition again. Save or Export the copied canvases as local LCANVAS files to keep later edits before closing or reloading the embed. A fresh Copy view link can also capture the edited condition.

An Obsidian Canvas URL card can use this URL as a live interactive iframe while Canvas Live is running. The embedded editor is interactive, but its starting contents are the saved snapshot, rather than a synchronized connection to the source files. The browser or Obsidian webview may use separate storage and permissions. No file handle, local path, MCP pairing code, connection credential or automatic AI sharing is transferred.

The host and port in the link must remain reachable. A localhost link works on the computer running Canvas Live, and the Canvas Live launcher must be running there. The link alone does not host a website or make the laptop reachable from another computer. Embedding behavior also depends on Obsidian's webview rules.

Treat the copied URL as a document: it includes the open canvases' text and shapes. Anyone with the link can read that snapshot. The fragment is not sent in the HTTP request to Canvas Live, but browser history, clipboard history and the Obsidian canvas can retain it.

The versioned codec uses UTF-8 JSON with browser-native gzip where available, followed by base64url. Browsers without compression can create plain JSON links. Compressed links require a browser with native decompression. There is no new dependency or external storage service.

Validation runs before import: LCANVAS documents, project/file identity and date bounds, tab completeness, selection/layer/tool references and permitted workspace fields are checked. Only the active project's view and open documents are copied. Unknown fields are projected out, duplicate records and reserved object identifiers are rejected, and unsupported versions fail without partially opening files.

Portable links are limited to 100 open files, 1 MiB of decoded snapshot JSON and 128 KiB for the complete URL. Decompression is read incrementally and cancelled at the limit. Oversize snapshots produce a Save/export message; they are never truncated. Large boards should be saved or exported as LCANVAS files instead. Browser and host-specific URL limits can be lower.

## Interface settings

In Options, **Separate rail buttons** removes the left ribbon and canvas-control rail backgrounds and returns their space to the canvas. The logo remains visible. Each button appears on its own hover or keyboard focus; on touch devices buttons stay visible.

**Auto-hide tab bar** and **Auto-hide status bar** work independently. Enabled bars reveal from a small top or bottom edge on hover, and stay open while a control has keyboard focus. They overlay the canvas so it does not jump. Disabled bars stay visible. On touch devices the bars remain visible because hover is unavailable.

**Interface dimensions** adjusts Files/projects width, Tools/AI width, workspace rail width, canvas controls width, tab-bar height and status-bar height. Reset interface dimensions restores sizes while retaining pins, selected panels and auto-hide choices. Named workspaces and copied view links retain these settings. Reduced-motion preferences still apply.

The single bottom status bar includes save state, visible object count, selection and layer, zoom, and a help icon whose tooltip contains the canvas control instructions.
