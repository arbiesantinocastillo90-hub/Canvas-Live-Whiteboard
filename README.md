# Canvas-Live-Whiteboard

A local-first Canvas OS workspace for organizing canvases and collaborating with external AI.

## Development status

The current revision adds separate Home **Projects** and **Canvas** perspectives, project cards and an expandable hierarchy, content thumbnails, workspace browsing and ordering, and per-workspace identity/background customization. A single left-panel opener contains Files, Projects and Workspaces; floating panels have rounded borders and gaps, and pinned panels reserve canvas space. Selection styling, grid snapping, ruler units and zoom notation are configurable. See [Workspace navigation and appearance](docs/WORKSPACE_REVISION.md).

Live exact/latest workspace links, the native shared local library, session notifications, tab dragging, smart multiline shape text, and `.CLF` / `.CLP` / `.CLW` files remain available. See [Canvas Live Links and local files](docs/LIVE_LINKS_AND_LIBRARY.md).

The scoped Bugs, Errors & Revision update adds automatic valid property commits, fixed connection sides, nested project organizers, named UI workspaces, tab grouping/pinning/compaction and configurable dock motion/auto-hide. See [Scoped revisions and controls](docs/BUGS_ERRORS_REVISION.md).

Canvas Live starts on a separate Home page for projects and `.CLF` files. Selecting a file opens the compact editor. It supports shapes, direct text editing, areas, layers, attached connections, group selection, eight resize handles, copy/cut/paste and duplication. Camera updates are batched to frames; Undo/Redo preserve the current view. Home and Options retain current tabs and history while pausing canvas commands and sharing. Save and Save as write physical local `.CLF` files in supported browsers; browser copies and draft recovery provide additional protection. Export makes a portable `.CLF` backup with the LCANVAS v2 payload; v1 files remain importable. See [Home, interaction and local file guide](docs/HOME_AND_LOCAL_FILES.md).

The optional MCP companion provides 15 bounded tools for the file explicitly shared through Workspace AI, including shared Undo/Redo. Ordinary AI edits tolerate completed camera navigation while preserving content conflict checks. The owner's ChatGPT plugin is installed and has read the shared canvas; confirming a live write through that account remains an acceptance step.

The revised workspace centers file tabs and the canvas between an icon ribbon and view controls. Separate rail buttons and the logo remain visible over the canvas while their long background strips disappear. Left Files/Projects/Workspaces and right Tools/Properties/AI panels auto-close; double-click a panel tab or use its pin button to keep it open. Options includes independent tab/status auto-hide settings and panel, rail and bar dimensions. One bottom bar shows save status, object and selection details, zoom, and control help. Panel widths, contrast, interface colors, motion, commands and shortcuts remain customizable. Customize shortcuts in Options; Ctrl+P opens commands, Ctrl+O opens files and Space temporarily pans the canvas. See [Adaptable workspace](docs/ADAPTABLE_WORKSPACE.md) for controls and release activation.

Use **Copy view link** to choose an **exact view** or **latest view** link for an Obsidian Canvas URL card. Exact links retain the copied tabs, camera and UI while referencing current saved file contents. Latest links follow the workspace's automatically remembered view. Configure both modes and automatic resume in Options > Canvas Live Links. Earlier frozen snapshot links remain compatible. See [Links and the local library](docs/LIVE_LINKS_AND_LIBRARY.md).

- [Workspace navigation, panels and Home perspectives](docs/WORKSPACE_REVISION.md)
- [Workspace identity, backgrounds and item customization](docs/WORKSPACE_PERSONALIZATION.md)
- [Selection, grid snapping, rulers and zoom display](docs/CANVAS_PRECISION.md)
- [Live exact/latest links and the native local library](docs/LIVE_LINKS_AND_LIBRARY.md)
- [CLF, CLP and CLW formats](docs/FILE_FORMATS.md)
- [Smart canvas text](docs/SMART_TEXT.md)
- [Project specification](PROJECT_SPEC.md)
- [Agent instructions](AGENTS.md)
- [Initial inspection and Milestone 0–1 plan](docs/INSPECTION.md)
- [Roadmap](docs/ROADMAP.md)
- [Setup and testing](docs/TESTING.md)
- [Milestone 0 verification results](docs/MILESTONE_0.md)
- [Windows executable and verification](docs/WINDOWS_LAUNCHER.md)
- [Themes, Projects and Work](docs/UI_WORKSPACE.md)
- [Adaptable layout, appearance, motion and keyboard shortcuts](docs/ADAPTABLE_WORKSPACE.md)
- [Compact reference UI verification](docs/REFERENCE_UI_VERIFICATION.md)
- [Home, canvas interactions and physical local files](docs/HOME_AND_LOCAL_FILES.md)
- [Current home and interaction verification](docs/HOME_AND_INTERACTIONS_VERIFICATION.md)
- [Bugs, Errors & Revision scope and controls](docs/BUGS_ERRORS_REVISION.md)
- [Scoped bug and visual verification](docs/BUGS_ERRORS_REVISION_VERIFICATION.md)
- [Portable snapshot links and interface settings](VIEW_LINKS.md)
- [Snapshot links and interface verification](docs/VIEW_CHROME_VERIFICATION.md)
- [LCANVAS files and viewer](docs/LCANVAS.md)
- [Canvas editing and controls](docs/EDITOR.md)
- [Editor verification](docs/EDITOR_VERIFICATION.md)
- [Connect ChatGPT through MCP](docs/CHATGPT_MCP.md)
- [MCP verification](docs/MCP_VERIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Dependencies and licenses](docs/LICENSES.md)

Project brain: `D:\Canvas Live`. Initial AI client: ChatGPT. The MVP is local-first and single-user, with external AI editing through MCP. Multi-user collaboration is a later milestone.

## Run on Windows

For the packaged version, open `release/Canvas Live` and double-click **Canvas Live.exe**. It starts the local website and opens your default browser. Keep the complete folder together, including `app/`, `data/` and the executable configuration file. This package runs without Node.js or a terminal. Right-click its Windows tray icon and choose **Close Canvas Live** when finished.

The package contains the current workspace, themes, canvas file organizer and editor. Undo/redo restore manual and AI content edits while preserving the current camera. To enable the optional AI companion, open **Start Canvas Live MCP.cmd** beside the executable (requires Node.js 24), then pair and share a file through Workspace AI. ChatGPT web uses a configured Secure MCP Tunnel; a local desktop client can connect directly. See [CHATGPT_MCP.md](docs/CHATGPT_MCP.md). The packaged library lives in `data/library.json` beside the executable and is shared by browser profiles using that running app. Background images live separately in `data/appearance/`; back up the complete `data/` folder as well as `.CLF` / `.CLP` copies. A `.CLW` or view link carries the image reference, not the image bytes. Development-server browser storage remains specific to its browser profile and origin.

### Development

Install Node.js 24 LTS (24.15 or newer in the 24.x line), then use PowerShell in the repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The development server binds to loopback by default. Run `npm.cmd run mcp` in a second terminal to start the optional authenticated MCP companion at `127.0.0.1:8787`. The app requires no model API or cloud storage; ChatGPT's external connection has its own account/transport requirements.

Run the development checks with `npm.cmd run check`. See [TESTING.md](docs/TESTING.md) for individual commands and current coverage. The project is licensed under [MIT](LICENSE); dependencies retain their own notices.
