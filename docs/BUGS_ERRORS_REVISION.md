# Scoped bug and revision work

Source: `D:/Canvas OS/Canvas Live Workspace 1.canvas`, only `Canvas Live Workspace > Factor Identification > Bugs, Errors & Revision`. The target is group `c1bb4608f4710746`. Two requirement notes and their heading are fully inside it; there are no boundary-crossing notes or file attachments. Source extraction and its SHA-256 are retained in `test-results/bug-area-source.json`. Nothing from other areas is used as a task requirement.

Updated 2026-10-15. The prior Home/local-file release was complete before this scope began.

## Scope and implementation

| Source factor               | Treatment                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Projects / File / UI Saving | Existing physical LCANVAS writes and draft recovery are retained. Invalid optional appearance/selection metadata now preserves projects, a last-good metadata backup can recover failed reads, and saved workspace sessions restore open tabs and their UI presentation. |
| Object Properties           | Valid property drafts commit on blur or after a short pause; selecting another object and Save flush them first. Invalid fields preserve the last valid document. Undo, external edits and locks replace stale pending fields.                                           |
| Undo / Redo Button          | Already fixed in the previous release: content history retains the current camera. Existing regression coverage remains.                                                                                                                                                 |
| Object Connection           | New and legacy links have fixed cardinal endpoint sides. Moving one node retains the other endpoint's chosen origin. Explicit Auto remains available.                                                                                                                    |
| Animation inconsistency     | Shared hover/entry motion now covers the tool launcher and AI controls and respects reduced motion.                                                                                                                                                                      |
| Projects                    | Logical nested projects support create, rename and move, with cycle checks. Physical files are never moved by reorganizing projects.                                                                                                                                     |
| Workspace                   | Named UI sessions save project/file references, tabs, theme, dock arrangement and tool/layer selection separately from canvas content. Sessions can be renamed, exported and imported as `.lworkspace`.                                                                  |
| Projects & Files Panel      | Pinned shortcuts appear above collapsible Recent sections. Hover pin/remove controls affect shortcuts; All projects/files remain available.                                                                                                                              |
| Top Active Tabs             | Tabs reorder by drag or Alt+Arrow. Ctrl/Cmd-click selects multiple tabs; the context menu groups, pins/unpins and expands/compacts them. Group headers collapse/expand. Closing tabs retains files and dirty recovery.                                                   |
| Single Tool Button          | The canvas control rail has one panel launcher. Tools, Properties and AI are sections inside that panel. Undo/Redo, zoom, fit and fullscreen remain accessible.                                                                                                          |
| Customizable UI             | Dock headers drag between sides; keyboard movement and Reset layout provide equivalent control. The arrangement is saved in the selected workspace.                                                                                                                      |
| Minimalistic Option         | Auto-hide can be disabled or delayed, each dock can be pinned, and rail button backgrounds can be enabled. Labels remain hover hints.                                                                                                                                    |
| Customizable Animation      | Options includes a speed slider, easing and flow/fade/pop effects alongside reduced motion.                                                                                                                                                                              |
| Object Relationship         | Each connection can choose Auto, Top, Right, Bottom or Left independently at both ends. The validated document model and MCP operations retain these settings.                                                                                                           |

## Use

Use the Workspaces icon beside Files and Projects, or open Workspaces from Home. A new workspace starts with the current UI state and references the same project files. Subsequent UI changes update that selected session. Switching sessions does not restore old versions of canvas content. Export a workspace for a portable UI snapshot; continue saving individual `.lcanvas` files for their content.

Project creation and Rename/Move let you choose a parent. The project hierarchy is an organizer, so changing a parent does not relocate a physical file. Remove shortcut hides an entry from Recent/Pinned; its All entry remains accessible.

Right-click a file tab for actions, or use Shift+F10. Ctrl/Cmd-click several tabs to apply the menu actions together. Compact tabs retain a hover label; pinned tabs stay at the start. Alt+Left/Right reorders tabs with the keyboard.

## Persistence boundary

Project metadata, named sessions and remembered file handles belong to the same browser origin/profile. Use the same Canvas Live address to reopen them. Changing the port, browser/profile or clearing its data can show a different browser library; this does not delete a physical LCANVAS file. Re-import that file when necessary. Workspace exports contain UI references and validated settings, without canvas objects, file handles, pairing credentials or MCP authority. They require referenced projects/files to exist in the current library. Important canvas content still belongs in physical `.lcanvas` files.

## Verification

See [BUGS_ERRORS_REVISION_VERIFICATION.md](BUGS_ERRORS_REVISION_VERIFICATION.md) for final checks and the retained `test-results/bugs-*` evidence. The Windows native chooser and the owner's external ChatGPT account remain separate manual acceptance boundaries. No dependency or paid API is added. The source canvas and unrelated launcher work remain unchanged.
