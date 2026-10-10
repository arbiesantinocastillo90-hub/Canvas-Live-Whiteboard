# Windows executable

## Open Canvas Live

Open `release/Canvas Live` and double-click **Canvas Live.exe**. The executable starts the packaged local website and asks Windows to open it in your default browser. It does not show a terminal or require Node.js, npm, an account, or internet access to run the current preview.

Keep the complete folder together:

```text
Canvas Live/
├── Canvas Live.exe
├── Canvas Live.exe.config
├── README.txt
├── LICENSE.txt
├── THIRD_PARTY_NOTICES.txt
└── app/
    ├── index.html
    ├── assets/
    ├── LICENSE.txt
    └── THIRD_PARTY_NOTICES.txt
```

You can move or copy this complete folder. Close the launcher before moving or replacing its folder. Double-clicking the executable again reopens the same running instance. Closing the browser tab leaves the local server running. Right-click the Canvas Live icon in the Windows tray and choose **Close Canvas Live** to stop it. The tray icon may be in the tray's overflow area.

The usual address is `http://127.0.0.1:4173/`. If that port is occupied, the launcher chooses an available local port and opens that address. This is a local website on your laptop. The package includes themes, Options, Projects, Work and the LCANVAS file organizer/viewer; see [LCANVAS.md](LCANVAS.md). Files and preferences belong to the browser origin, including the port. Export LCANVAS backups to transfer them between browsers/ports; moving this folder does not transfer browser data. Drawing and AI editing remain upcoming features.

## Build and test

On the target Windows 11 laptop, from the checkout:

```powershell
npm.cmd run package:windows
npm.cmd run test:launcher
```

Building requires the documented Node.js development environment plus Windows' .NET Framework compiler at `%WINDIR%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`. Using the completed package requires .NET Framework 4.8 or newer, included with Windows 11. The packager compiles a GUI executable and copies the production build, configuration and license notices. It adds no npm dependency and does not distribute Microsoft's runtime. Microsoft documents [the Windows runtime requirements](https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements).

`scripts/package-windows.ps1` builds into a staging folder and verifies that the final executable is in the expected location. If a package already exists, it retains that package in `release/Canvas Live.previous-<timestamp>-<id>`. Close a running packaged launcher before rebuilding. `release/` is generated output and is ignored by Git; source and rebuild instructions are committed.

## Implementation boundaries

- `launcher/CanvasLiveLauncher.cs` hosts only an exact whitelist of regular files in `app/`, binding to `127.0.0.1`.
- It accepts GET/HEAD, validates the Host header and request path, rejects traversal and unsupported methods, and limits concurrent connections, header size and header read time.
- A read-only `/__canvas_live_launcher` endpoint identifies a running instance. Per-user, per-folder mutex/state prevents ordinary duplicate launches from starting duplicate servers.
- Runtime state and errors are recorded under `%LOCALAPPDATA%/Canvas Live/launchers/<package-key>/`. No application content is uploaded.
- The tray provides Open and Close actions. Browser opening uses the documented Windows [default-handler behavior](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.useshellexecute?view=netframework-4.8.1); the tray uses [NotifyIcon](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.notifyicon?view=netframework-4.8.1).
- This static server has no MCP tools or board mutation API. Future authenticated bridge and persistence work remain separate milestones. An alternate port changes the browser origin, which future persistence must handle deliberately.

## Executed verification — 2026-10-09

The executable compiled successfully on Windows 11 Pro x64 with the installed .NET Framework 4.8 runtime. The package contains the current production HTML, JS and CSS, plus the project/runtime license notices.

The final `npm.cmd run check` also passed: TypeScript, lint, formatting, the component smoke test, the 215-package license metadata gate and the production build. No dependency or lockfile change was needed for the launcher.

`npm.cmd run test:launcher` completed with **24 passed checks**. The test copies the complete folder to a temporary path containing spaces and starts it from an unrelated working directory. It verifies HTML/assets/MIME types, included notices, HEAD response length/body, query strings, unknown paths, plain/encoded traversal, encoded Windows separators, unsupported write methods, unexpected Host headers, an absolute slow-header timeout, occupied-port fallback, repeated launch reuse, port release after forced termination, restart after abandoned state, and clear missing-app errors. The generated local report is `test-results/windows-launcher.json`.

A normal launch of the final executable also started the server at port 4173. The home page returned HTTP 200, and the packaged site was opened in the in-app browser with the expected workspace heading and disconnected/non-editable preview states. The launcher called the operating system's default URL handler without reporting an error; the default-browser window itself was not observed through the available browser controls.

The integration tests use `--no-browser` and force-stop only their own launcher processes. They verify listening-port release after termination, but do not exercise the tray menu's graceful Close action. They do not prove drawing, persistence, AI editing or ChatGPT connectivity.

Rebuilding while Vite watched generated release folders initially caused a Windows folder lock, allowing a move operation to nest the staged package in the output folder. This was resolved by excluding the roots and descendants of both `dist` and `release` from the watcher, using same-directory renames for package placement, and checking the final executable before reporting success. Packaging was then verified with the development server running, followed by the successful 24-check run. Existing packages were retained.
