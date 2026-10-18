# Roadmap

The 2026-10-12 task adds a separate Home library, group/clipboard/direct editing, improved resize/camera interactions, content Undo preserving the camera, physical LCANVAS Save/Save as, and independent dirty recovery. See [HOME_AND_LOCAL_FILES.md](HOME_AND_LOCAL_FILES.md) and [current verification](HOME_AND_INTERACTIONS_VERIFICATION.md).

The owner authorized initiation of the Milestone 0–1 plan on 2026-10-09. Work stays incremental under PROJECT_SPEC.md.

| Milestone | Scope                                                                 | Status                                                             |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0         | Scaffold, local startup, dependency pinning, checks and documentation | Complete; see MILESTONE_0.md                                       |
| 1         | Excalidraw runtime proof and code/asset license gate                  | Pending font-policy decision and runtime proof                     |
| 2         | Usable manual whiteboard, persistence, import/export                  | Requested core editing implemented; broader MVP remains            |
| 3         | Validated shared operations and stable identifiers                    | Implemented for manual and MCP editing                             |
| 4         | MCP tools and protocol tests                                          | 15 tools implemented; official SDK protocol checks pass            |
| 5         | Browser bridge, synchronization and security                          | Explicit sharing and authenticated bridge/browser tests pass       |
| 6         | Actual ChatGPT editing workflow                                       | Reads confirmed; conflict fix locally verified; live edits pending |
| 7         | MVP hardening and reproducible release                                | Not started                                                        |
| 8         | Multi-user collaboration                                              | Future scope                                                       |

Milestone 1 should verify labelled shapes, arrows, stable-ID edits, round-trip restoration, and mixed manual/programmatic undo/redo. Excalidraw adoption requires a documented result, including bundled-font notices; its MIT code license alone is insufficient for that gate.

The requested adaptable UI milestone adds remembered resizable/collapsible panels, expanded contrast and color preferences, motion controls, a command palette, quick file switcher, customizable shortcuts and temporary Space pan. It builds on the existing editor and preserves document/MCP scope. See [ADAPTABLE_WORKSPACE.md](ADAPTABLE_WORKSPACE.md) for the supported controls and verified results. Future work remains MVP hardening, broader drawing features and multiplayer; it is not included in this UI update.

The current workspace supports themes and remembered project names/recent openings, with Options, Projects and Work sections. Projects organize multiple LCANVAS documents in IndexedDB, with validated import/export, explicit saving, closable tabs and side panels. The requested editor now supports shapes, labels, text, resize, areas, layers, attached connections and combined edit/view undo. Fullscreen focuses on the current file. Group selection, validated clipboard operations and inline text editing are now implemented. Freehand drawing and images remain outside this task. See [LCANVAS.md](LCANVAS.md) and [EDITOR.md](EDITOR.md).

The owner also requested a Windows executable. The portable launcher opens the current production package from `release/Canvas Live/Canvas Live.exe`; see [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for its verification and limits. It packages the original SVG editor without adopting Excalidraw or adding dependencies.

The requested MCP integration now uses the same validated operations and shared history. The authenticated companion and browser connection support one explicitly shared file with session/revision checks, atomic batches, replay protection and bounded reads/deletion. The Windows package includes the separately started companion. The owner's ChatGPT plugin is installed and has read the shared canvas. Ordinary camera navigation conflicts are fixed and locally verified while content conflict checks remain in place. The next acceptance step is a successful edit through the updated plugin, followed by MVP hardening. See [CHATGPT_MCP.md](CHATGPT_MCP.md) and [MCP_VERIFICATION.md](MCP_VERIFICATION.md).

The 2026-10-11 reference UI revision adds a full-height file editor, icon ribbon, transient left Files/Projects and right Tools/Properties/AI docks, remembered pins, mouse auto-close with editing/keyboard protection, stable hidden property/pairing drafts and accessible tab navigation. No document format, MCP authority or dependency changes are introduced.

The 2026-10-14 scoped Bugs, Errors & Revision work adds nested logical projects, named UI snapshots, remembered tab presentation and shortcut lists, automatic valid property commits, fixed/selected connection sides and configurable draggable docks/motion. The existing camera/history fix is retained. See [BUGS_ERRORS_REVISION.md](BUGS_ERRORS_REVISION.md) for the source boundary and persistence limits.
