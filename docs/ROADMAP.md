# Roadmap

The owner authorized initiation of the Milestone 0–1 plan on 2026-10-09. Work stays incremental under PROJECT_SPEC.md.

| Milestone | Scope                                                                 | Status                                                      |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| 0         | Scaffold, local startup, dependency pinning, checks and documentation | Complete; see MILESTONE_0.md                                |
| 1         | Excalidraw runtime proof and code/asset license gate                  | Pending font-policy decision and runtime proof              |
| 2         | Usable manual whiteboard, persistence, import/export                  | Requested core editing implemented; broader MVP remains     |
| 3         | Validated shared operations and stable identifiers                    | Manual shared operations implemented; MCP execution pending |
| 4         | MCP tools and protocol tests                                          | Not started                                                 |
| 5         | Browser bridge, synchronization and security                          | Not started                                                 |
| 6         | Actual ChatGPT editing workflow                                       | Account access/transport remain unverified                  |
| 7         | MVP hardening and reproducible release                                | Not started                                                 |
| 8         | Multi-user collaboration                                              | Future scope                                                |

Milestone 1 should verify labelled shapes, arrows, stable-ID edits, round-trip restoration, and mixed manual/programmatic undo/redo. Excalidraw adoption requires a documented result, including bundled-font notices; its MIT code license alone is insufficient for that gate.

The current workspace supports themes and remembered project names/recent openings, with Options, Projects and Work sections. Projects organize multiple LCANVAS documents in IndexedDB, with validated import/export, explicit saving, closable tabs and side panels. The requested editor now supports shapes, labels, text, resize, areas, layers, attached connections and combined edit/view undo. Fullscreen focuses on the current file. Broader manual MVP features such as freehand drawing, images and multi-selection remain outside this task. See [LCANVAS.md](LCANVAS.md) and [EDITOR.md](EDITOR.md).

The owner also requested a Windows executable. The portable launcher opens the current production package from `release/Canvas Live/Canvas Live.exe`; see [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for its verification and limits. It packages the original SVG editor without adopting Excalidraw or adding dependencies.

The owner's requested manual editing step is implemented ahead of live MCP integration. Stable-ID operations are pure, bounded and shared by the editor/Inspector. The persistent right rail controls edit/view history and the collapsible AI panel shows current project/file context with AI disconnected. The next requested step is an authenticated live MCP connection; account eligibility, transport and actual ChatGPT write calls must be verified. No MCP milestone is complete.
