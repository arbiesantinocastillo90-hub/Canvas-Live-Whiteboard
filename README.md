# Canvas-Live-Whiteboard

Version of Canvas OS that multiple users and AI's could interact and collaborate on Canvas space.

## Development status

The workspace includes customizable themes, Options, Projects with recent openings, and Work that returns to the latest project. Each project organizes multiple LCANVAS files. Edit rectangles, ellipses, diamonds, text, containing areas, layers and attached connections with configurable arrowheads. Full screen focuses on the current file while keeping drawing, save and view controls available. Save files individually in browser IndexedDB and export portable LCANVAS v2 backups; existing v1 files remain importable. The optional MCP companion provides 15 bounded tools for the file explicitly shared through Workspace AI, including shared Undo/Redo. Ordinary AI edits tolerate completed camera navigation while preserving content conflict checks. The owner's ChatGPT plugin is installed and has read the shared canvas; confirming live edits remains an acceptance step.

The revised workspace centers file tabs and the canvas between a narrow icon ribbon and a fixed view rail. Left Files/Projects and right Tools/Properties/AI panels auto-close; double-click a panel tab or use its pin button to keep it open. Pinned panels sit beside the editor on wide screens. Controls show names on hover. Panel widths, contrast, interface colors, motion, commands and shortcuts remain customizable. Customize shortcuts in Options; Ctrl+P opens commands, Ctrl+O opens files and Space temporarily pans the canvas. See [Adaptable workspace](docs/ADAPTABLE_WORKSPACE.md) for controls and release activation.

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
- [LCANVAS files and viewer](docs/LCANVAS.md)
- [Canvas editing and controls](docs/EDITOR.md)
- [Editor verification](docs/EDITOR_VERIFICATION.md)
- [Connect ChatGPT through MCP](docs/CHATGPT_MCP.md)
- [MCP verification](docs/MCP_VERIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Dependencies and licenses](docs/LICENSES.md)

Project brain: `D:\Canvas Live`. Initial AI client: ChatGPT. The MVP is local-first and single-user, with external AI editing through MCP. Multi-user collaboration is a later milestone.

## Run on Windows

For the packaged version, open `release/Canvas Live` and double-click **Canvas Live.exe**. It starts the local website and opens your default browser. Keep the complete folder together, including `app/` and the executable configuration file. This package runs without Node.js or a terminal. Right-click its Windows tray icon and choose **Close Canvas Live** when finished.

The package contains the current workspace, themes, LCANVAS file organizer and editor. Undo/redo restore manual and AI edits and view changes. To enable the optional AI companion, open **Start Canvas Live MCP.cmd** beside the executable (requires Node.js 24), then pair and share a file through Workspace AI. ChatGPT web uses a configured Secure MCP Tunnel; a local desktop client can connect directly. See [CHATGPT_MCP.md](docs/CHATGPT_MCP.md). Browser storage belongs to a browser profile and URL origin, including the port; moving the executable does not carry your files. Export .lcanvas copies before changing browsers or ports.

### Development

Install Node.js 24 LTS (24.15 or newer in the 24.x line), then use PowerShell in the repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The development server binds to loopback by default. Run `npm.cmd run mcp` in a second terminal to start the optional authenticated MCP companion at `127.0.0.1:8787`. The app requires no model API or cloud storage; ChatGPT's external connection has its own account/transport requirements.

Run the development checks with `npm.cmd run check`. See [TESTING.md](docs/TESTING.md) for individual commands and current coverage. The project is licensed under [MIT](LICENSE); dependencies retain their own notices.
