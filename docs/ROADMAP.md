# Roadmap

The owner authorized initiation of the Milestone 0–1 plan on 2026-10-09. Work stays incremental under PROJECT_SPEC.md.

| Milestone | Scope                                                                 | Status                                         |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 0         | Scaffold, local startup, dependency pinning, checks and documentation | Complete; see MILESTONE_0.md                   |
| 1         | Excalidraw runtime proof and code/asset license gate                  | Pending font-policy decision and runtime proof |
| 2         | Usable manual whiteboard, persistence, import/export                  | Not started                                    |
| 3         | Validated shared operations and stable identifiers                    | Not started                                    |
| 4         | MCP tools and protocol tests                                          | Not started                                    |
| 5         | Browser bridge, synchronization and security                          | Not started                                    |
| 6         | Actual ChatGPT editing workflow                                       | Account access/transport remain unverified     |
| 7         | MVP hardening and reproducible release                                | Not started                                    |
| 8         | Multi-user collaboration                                              | Future scope                                   |

Milestone 1 should verify labelled shapes, arrows, stable-ID edits, round-trip restoration, and mixed manual/programmatic undo/redo. Excalidraw adoption requires a documented result, including bundled-font notices; its MIT code license alone is insufficient for that gate.

The current workspace supports themes and remembered project names/recent openings, with Options, Projects and Work sections. It is not an editable or persistent canvas document. No future milestone is implied complete by metadata persistence. See [UI_WORKSPACE.md](UI_WORKSPACE.md).

The owner also requested a Windows executable. The completed portable launcher opens the current preview from `release/Canvas Live/Canvas Live.exe`; see [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for its 24-check verification and limits. Milestone 1 remains the next engine task.

The owner's requested sequence continues with canvas controls, tools, navigation and buttons, followed by the LCANVAS saving/import format. Those features must build on the engine proof and a real document model. The themes/section update is a bounded UI task and does not mark Milestone 2 complete.
