# Roadmap

The owner authorized initiation of the Milestone 0–1 plan on 2026-10-09. Work stays incremental under PROJECT_SPEC.md.

| Milestone | Scope                                                                 | Status                                                              |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0         | Scaffold, local startup, dependency pinning, checks and documentation | Complete; see MILESTONE_0.md                                        |
| 1         | Excalidraw runtime proof and code/asset license gate                  | Pending font-policy decision and runtime proof                      |
| 2         | Usable manual whiteboard, persistence, import/export                  | Requested core editing implemented; broader MVP remains             |
| 3         | Validated shared operations and stable identifiers                    | Implemented for manual and MCP editing                              |
| 4         | MCP tools and protocol tests                                          | 15 tools implemented; official SDK protocol checks pass             |
| 5         | Browser bridge, synchronization and security                          | Explicit sharing and authenticated bridge/browser tests pass        |
| 6         | Actual ChatGPT editing workflow                                       | Setup prepared; owner sees custom plugin option; live calls pending |
| 7         | MVP hardening and reproducible release                                | Not started                                                         |
| 8         | Multi-user collaboration                                              | Future scope                                                        |

Milestone 1 should verify labelled shapes, arrows, stable-ID edits, round-trip restoration, and mixed manual/programmatic undo/redo. Excalidraw adoption requires a documented result, including bundled-font notices; its MIT code license alone is insufficient for that gate.

The current workspace supports themes and remembered project names/recent openings, with Options, Projects and Work sections. Projects organize multiple LCANVAS documents in IndexedDB, with validated import/export, explicit saving, closable tabs and side panels. The requested editor now supports shapes, labels, text, resize, areas, layers, attached connections and combined edit/view undo. Fullscreen focuses on the current file. Broader manual MVP features such as freehand drawing, images and multi-selection remain outside this task. See [LCANVAS.md](LCANVAS.md) and [EDITOR.md](EDITOR.md).

The owner also requested a Windows executable. The portable launcher opens the current production package from `release/Canvas Live/Canvas Live.exe`; see [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for its verification and limits. It packages the original SVG editor without adopting Excalidraw or adding dependencies.

The requested MCP integration now uses the same validated operations and shared history. The authenticated companion and browser connection support one explicitly shared file with session/revision checks, atomic batches, replay protection and bounded reads/deletion. The Windows package includes the separately started companion. The owner confirmed that ChatGPT's custom MCP server option is visible; the next acceptance step is a real ChatGPT call through the prepared local desktop plugin or Secure MCP Tunnel. Tunnel entitlement, account setup and actual ChatGPT editing remain unverified. See [CHATGPT_MCP.md](CHATGPT_MCP.md) and [MCP_VERIFICATION.md](MCP_VERIFICATION.md).
