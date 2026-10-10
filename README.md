# Canvas-Live-Whiteboard

Version of Canvas OS that multiple users and AI's could interact and collaborate on Canvas space.

## Development status

The workspace includes customizable themes, Options, Projects with recent openings, and Work that returns to the latest project. Each project organizes multiple LCANVAS files. Create blank files, import/export validated LCANVAS v1 documents, reopen saved files, pan and zoom, and toggle the file and workspace AI panels. Files are saved individually in browser IndexedDB; export LCANVAS copies for portable backups. Drawing and AI editing remain upcoming features.

- [Project specification](PROJECT_SPEC.md)
- [Agent instructions](AGENTS.md)
- [Initial inspection and Milestone 0–1 plan](docs/INSPECTION.md)
- [Roadmap](docs/ROADMAP.md)
- [Setup and testing](docs/TESTING.md)
- [Milestone 0 verification results](docs/MILESTONE_0.md)
- [Windows executable and verification](docs/WINDOWS_LAUNCHER.md)
- [Themes, Projects and Work](docs/UI_WORKSPACE.md)
- [LCANVAS files and viewer](docs/LCANVAS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Dependencies and licenses](docs/LICENSES.md)

Project brain: `D:\Canvas Live`. Initial AI client: ChatGPT. The MVP is local-first and single-user, with external AI editing through MCP. Multi-user collaboration is a later milestone.

## Run on Windows

For the packaged version, open `release/Canvas Live` and double-click **Canvas Live.exe**. It starts the local website and opens your default browser. Keep the complete folder together, including `app/` and the executable configuration file. This package runs without Node.js or a terminal. Right-click its Windows tray icon and choose **Close Canvas Live** when finished.

The package contains the current workspace, themes, LCANVAS file organizer and viewer. Undo/redo currently restore navigation views; drawing history arrives with editing tools. Workspace AI shows the selected project/file and reports that MCP is unavailable. Browser storage belongs to a browser profile and URL origin, including the port; moving the executable does not carry your files. Export .lcanvas copies before changing browsers or ports. See [WINDOWS_LAUNCHER.md](docs/WINDOWS_LAUNCHER.md) for rebuilding and testing, and [LCANVAS.md](docs/LCANVAS.md) for the viewer.

### Development

Install Node.js 24 LTS (24.15 or newer in the 24.x line), then use PowerShell in the repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The development server binds to loopback by default. It has no paid model API, cloud storage, account requirement, external font requests, or MCP connection.

Run the development checks with `npm.cmd run check`. See [TESTING.md](docs/TESTING.md) for individual commands and current coverage. The project is licensed under [MIT](LICENSE); dependencies retain their own notices.
