# Roadmap

The owner authorized initiation of the Milestone 0–1 plan on 2026-10-09. Work stays incremental under PROJECT_SPEC.md.

| Milestone | Scope                                                                 | Status                                         |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 0         | Scaffold, local startup, dependency pinning, checks and documentation | Complete; see MILESTONE_0.md                   |
| 1         | Excalidraw runtime proof and code/asset license gate                  | Pending font-policy decision and runtime proof |
| 2         | Usable manual whiteboard, persistence, import/export                  | Partial: LCANVAS viewer/files; editing pending |
| 3         | Validated shared operations and stable identifiers                    | Not started                                    |
| 4         | MCP tools and protocol tests                                          | Not started                                    |
| 5         | Browser bridge, synchronization and security                          | Not started                                    |
| 6         | Actual ChatGPT editing workflow                                       | Account access/transport remain unverified     |
| 7         | MVP hardening and reproducible release                                | Not started                                    |
| 8         | Multi-user collaboration                                              | Future scope                                   |

Milestone 1 should verify labelled shapes, arrows, stable-ID edits, round-trip restoration, and mixed manual/programmatic undo/redo. Excalidraw adoption requires a documented result, including bundled-font notices; its MIT code license alone is insufficient for that gate.

The current workspace supports themes and remembered project names/recent openings, with Options, Projects and Work sections. Projects organize multiple LCANVAS documents in IndexedDB, with validated import/export, explicit view saving, closable tabs and side panels, and pan/zoom navigation history. Object drawing/editing remains pending, so Milestone 2 is incomplete. See [LCANVAS.md](LCANVAS.md).

The owner also requested a Windows executable. The completed portable launcher opens the current preview from `release/Canvas Live/Canvas Live.exe`; see [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for its 24-check verification and limits. Milestone 1 remains the next engine task.

The owner's requested LCANVAS viewing step is implemented with a bounded independent document model and original SVG renderer. The persistent right rail controls view history and the collapsible panel shows current project/file context with AI disconnected. Engine-dependent drawing/tools and editing undo remain pending the engine proof. No MCP milestone is complete.
