# Portable Windows application

Current package as of October 18, 2026. The tested target is Windows 11 x64 with .NET Framework 4.8. The optional companion includes its own Windows x64 Node runtime. Normal use does not require an administrator installation; computer policies can still block USB programs or network connections. A second physical computer and the school's configuration have not been verified.

## Run the package

Open `release/Canvas Live` and double-click **Canvas Live.exe**. It starts a loopback website and opens the current address in your default browser. The canvas works offline without an account, terminal or global Node installation. External websites and cloud AI connections need their respective network services.

For optional AI editing, open **Canvas Live MCP.exe**. It starts or finds the matching app host and runs the bundled companion. In Workspace AI, choose **Share this canvas**, then connect and approve your MCP-compatible client. A local client uses the current address and separate MCP access token from the companion status window. Cloud clients need their supported tunnel/HTTPS setup; see [Portable MCP](PORTABLE_MCP.md) and [ChatGPT setup](CHATGPT_MCP.md).

Keep the complete folder together:

```text
Canvas Live/
├── Canvas Live.exe
├── Canvas Live.exe.config
├── Canvas Live MCP.exe
├── Canvas Live MCP.exe.config
├── README.txt
├── LICENSE.txt
├── THIRD_PARTY_NOTICES.txt
├── app/                    # Packaged website and notices
├── mcp/server.mjs          # Bundled MCP companion
├── runtime/                # Pinned Node, licenses and provenance
├── plugin/                 # Example local-client configuration
└── data/                   # Created when the native library is used
    ├── library.json
    ├── appearance/
    └── media/
```

The package also includes setup guides, a legacy command launcher and a manually configured tunnel helper. `data/` contains personal work; `.canvas-live/` contains private runtime state and credentials. Neither belongs in a public source checkout or demonstration package. Copying a private portable installation for your own use is different from publishing a clean release.

The preferred address is `http://127.0.0.1:4173/`; a busy port selects another loopback port. Browser profiles using that running native package share its library in `data/`. In contrast, development/browser-only storage belongs to its browser profile and origin. Saving the native library and keeping `data/`, including media and appearance assets, carries saved work with the USB. Physical files saved elsewhere remain at their chosen locations. Unsaved browser drafts, file permissions and external account setup do not automatically travel.

Double-clicking a launcher again reuses its instance. Closing a browser tab does not stop the app. Use **Close Canvas Live** in the app tray menu and **Stop MCP** in the companion tray menu before moving the package or unplugging. The optional USB-root MCP executable resolves the package through a relative path; an ordinary Windows shortcut may still depend on its original drive letter.

## Build and verification commands

From a clean Windows development checkout with the documented Node environment:

```powershell
npm.cmd ci
npm.cmd run package:windows
npm.cmd run test:launcher
npm.cmd run test:library
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-windows-mcp.ps1
```

Packaging builds the production website and companion, compiles both C# GUI launchers with Windows' .NET Framework compiler, and bundles official Node.js 24.15.0 for Windows x64. `package-mcp-runtime.ps1` verifies pinned archive/executable SHA-256 values and the OpenJS signature. It includes the complete Node license, executable checksum and provenance record. Microsoft's .NET runtime is supplied by the operating system and is not redistributed.

The packager stages its output and retains a previous clean generated package. It refuses to replace an existing installation containing `data/` or recognized private configuration/runtime state. Use a new empty destination or a verified data-preserving update process for a populated installation. Generated `release/` output is ignored by Git. Downloading the runtime during the build requires internet access; using the completed local package does not.

## Implementation boundaries

- The website host binds to loopback, serves an exact whitelist of packaged static files and exposes narrowly scoped library, media, appearance and companion-discovery endpoints. These validate exact Host/origin, methods, paths and request bounds.
- Native library writes require record revisions and reject stale saves. Binary media is stored separately with content hashes and validated type/size. These endpoints do not expose arbitrary filesystem access.
- The read-only launcher health endpoint and per-user, per-folder mutex support instance reuse. Local endpoint/error registrations are stored under `%LOCALAPPDATA%/Canvas Live/launchers/<package-key>/`.
- Companion discovery returns the browser pairing credential for the matching package; it never returns the separate MCP access token. Canvas sharing remains explicit.
- The MCP launcher checks its bundled runtime hash, chooses an available loopback port and supervises only its own Node child. Separate copied folders remain independent.
- The tunnel helper is explicitly started and requires the external service's configuration and runtime credential. Starting the portable app does not automatically approve a cloud account or start a public tunnel.

## Current verification checkpoint — 2026-10-18

The [rich-canvas verification](RICH_CANVAS_VERIFICATION.md) records 53 owned-media native checks and 24 portable companion checks, including startup without global Node, moved folders, the USB-root forwarder, port fallback, independent copies and owned-child cleanup. The [workspace verification](WORKSPACE_INTERACTIONS_VERIFICATION.md) records the later UI and local companion/browser checks. These are dated acceptance results, not assertions that this documentation edit reran those checks.

Local tests establish the local integration. External ChatGPT account editing, another physical computer and school-specific program/network permissions remain unverified.

## Historical verification

The following records describe earlier packages. Their browser-only storage, external Node requirement and narrower feature set were superseded by the current package described above.

## Executed verification — 2026-10-09

The executable compiled successfully on Windows 11 Pro x64 with the installed .NET Framework 4.8 runtime. The package contains the current production HTML, JS and CSS, plus the project/runtime license notices.

The final `npm.cmd run check` also passed: TypeScript, lint, formatting, the component smoke test, the 215-package license metadata gate and the production build. No dependency or lockfile change was needed for the launcher.

`npm.cmd run test:launcher` completed with **24 passed checks**. The test copies the complete folder to a temporary path containing spaces and starts it from an unrelated working directory. It verifies HTML/assets/MIME types, included notices, HEAD response length/body, query strings, unknown paths, plain/encoded traversal, encoded Windows separators, unsupported write methods, unexpected Host headers, an absolute slow-header timeout, occupied-port fallback, repeated launch reuse, port release after forced termination, restart after abandoned state, and clear missing-app errors. The generated local report is `test-results/windows-launcher.json`.

A normal launch of the final executable also started the server at port 4173. The home page returned HTTP 200, and the packaged site was opened in the in-app browser with the expected workspace heading and disconnected/non-editable preview states. The launcher called the operating system's default URL handler without reporting an error; the default-browser window itself was not observed through the available browser controls.

The integration tests use `--no-browser` and force-stop only their own launcher processes. They verify listening-port release after termination, but do not exercise the tray menu's graceful Close action. They do not prove drawing, persistence, AI editing or ChatGPT connectivity.

Rebuilding while Vite watched generated release folders initially caused a Windows folder lock, allowing a move operation to nest the staged package in the output folder. This was resolved by excluding the roots and descendants of both `dist` and `release` from the watcher, using same-directory renames for package placement, and checking the final executable before reporting success. Packaging was then verified with the development server running, followed by the successful 24-check run. Existing packages were retained.

## Editor package verification — 2026-10-10

The executable folder was rebuilt with the verified LCANVAS v2 editor. All **24 launcher integration checks** passed again, and the packaged website passed **16 isolated Chrome scenarios** covering editing, fullscreen, layers, areas, connections, Save/reload and v1 import/v2 export. The application passed **203 tests**, types, lint, formatting, the unchanged dependency-license gate and production build. See [EDITOR_VERIFICATION.md](EDITOR_VERIFICATION.md) for evidence and remaining scope. Default-browser opening and the tray's graceful Close action were not retested in this step.

## MCP package verification — 2026-10-10

The folder now includes the separately started Node.js MCP companion, plugin manifests and ChatGPT setup helper. All **24 launcher checks** passed again. The final packaged website and companion passed **16 browser scenarios**, including sharing, visible AI edits, shared Undo/Redo, fullscreen status, explicit Save/reload/export and revocation. The companion also recognizes the native website's exact fallback origin through its package registration and matching health check. Open **Canvas Live.exe** before **Start Canvas Live MCP.cmd**. See [MCP_VERIFICATION.md](MCP_VERIFICATION.md) for protocol tests, native fallback verification and actual ChatGPT acceptance still required.
