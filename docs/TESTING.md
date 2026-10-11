# Setup and testing

## Windows prerequisites

Use Node.js 24 LTS, version 24.15 or newer in the 24.x line, with npm. The verified environment for this implementation reports Node 24.21.0 and npm 11.19.0. `npm.cmd` works in PowerShell without needing a PowerShell script execution-policy change.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Dev startup uses a strict port; if it is occupied, stop the other service or intentionally select another loopback port with `npm.cmd run dev -- --port 5174`. Do not use `--host 0.0.0.0` for routine local development.

## Commands

| Command                                | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `npm.cmd ci`                           | Install the pinned lockfile reproducibly                                  |
| `npm.cmd run typecheck`                | Check application, companion, protocol tests and configuration types      |
| `npm.cmd run lint`                     | Check React/TypeScript/script rules, fail on warnings                     |
| `npm.cmd run format:check`             | Verify formatting                                                         |
| `npm.cmd run format`                   | Apply formatting                                                          |
| `npm.cmd test`                         | Run tests once                                                            |
| `npm.cmd run test:watch`               | Watch tests during development                                            |
| `npm.cmd run licenses`                 | Regenerate the lockfile license inventory; fail on unreviewed metadata    |
| `npm.cmd run build`                    | Check licenses/types, build in `dist/`, and include distribution notices  |
| `npm.cmd run preview`                  | Serve the production bundle on `127.0.0.1:4173`                           |
| `npm.cmd run package:windows`          | Build the website and create the portable Windows executable folder       |
| `npm.cmd run test:launcher`            | Test the packaged launcher and its local HTTP server on Windows           |
| `npm.cmd run test:mcp`                 | Test real SDK protocol round trips, bridge scope and security in Node     |
| `npm.cmd run build:mcp`                | Bundle the optional Node MCP companion in dist-mcp                        |
| `npm.cmd run mcp`                      | Build/start the loopback companion and generate local pairing credentials |
| `npm.cmd run check`                    | Run types, lint, format check, tests, licenses, and production build      |
| `npm.cmd audit --audit-level=moderate` | Check the current registry vulnerability database                         |

## Current coverage

The suite now includes workspace metadata validation/storage tests and UI flows for project creation, naming, reopening, search, theme persistence/reset, live system appearance and unavailable storage. It checks the supplied logo reference and keeps canvas editing/AI states explicit. These tests verify the section/theme behavior, not drawing or AI control. See [UI_WORKSPACE.md](UI_WORKSPACE.md) for actual results and browser checks.

The LCANVAS suite adds strict import/export validation, project-scoped file storage with a transaction fixture, reload and quota/session recovery, atomic opening metadata, pan/zoom bounds, navigation history and component flows for files/tabs/panels/current AI context. A 125-file test verifies that the earlier project-count cap does not become a file-count cap. Native browser IndexedDB receives a separate browser reload smoke check; the transaction fixture is not a substitute for native browser verification. See [LCANVAS.md](LCANVAS.md).

The editor suite adds v1-to-v2 migration, stable-ID shape/text operations, area membership, layer ordering/locking/visibility, attached connection geometry, combined bounded history, pointer movement/resizing/cancellation and Inspector properties. It also verifies explicit content saving, unsaved draft protection across Options navigation, fullscreen fallback/native exit and a pending fullscreen request completing after Escape. jsdom does not verify rendering; isolated automated Chrome checks inspect the actual editor. See [EDITOR_VERIFICATION.md](EDITOR_VERIFICATION.md).

The MCP suite adds strict commands/read pagination, deletion limits, atomic batches and editor/history controllers. Browser hook checks cover explicit pairing, memory-only credentials, stale operations, replay, expiration, file switches and pagehide. `tests/mcp/companion.test.ts` drives the real official SDK against a loopback HTTP server, checking discovery, structured read/write results, acknowledgment gating, manual interleaving, timeouts, retries, single-tab ownership, and authentication/Host/origin/method/body limits. Actual browser scenarios send MCP calls to the bundled companion while inspecting visible SVG changes, Undo/Redo, Save/reload/export and revocation. The tunnel helper has separate local tests with a fake executable; those do not establish external connectivity. See [MCP_VERIFICATION.md](MCP_VERIFICATION.md).

The Windows launcher has a separate integration test. Run `npm.cmd run package:windows`, then `npm.cmd run test:launcher`. It copies the package to a temporary folder with spaces and checks startup from an unrelated working directory, packaged assets/notices, HTTP restrictions, occupied-port fallback, repeated launch, restart recovery and missing-file errors. The executed result was **24 passed checks**. It uses `--no-browser` and force-stops its own processes; it does not exercise the tray's Close action or observe the operating system's default-browser window. See [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for the normal-launch browser check and coverage limits.

## Adaptable workspace verification

The 2026-10-11 update passed **352 application tests**, **63 MCP tests**, TypeScript, lint, formatting and the production build with the unchanged **232-package** license gate. It also passed **12 isolated production Chrome UI scenarios**, **9 production MCP camera scenarios** against the updated UI and **23 updater fixture checks**. Layout changes preserve saved document content; bindings protect typing/dialogs and replace cleared legacy defaults. Browser checks cover actual painted colors and motion, storage reload, keyboard commands and 760/320-pixel panel bounds. See [ADAPTABLE_WORKSPACE.md](ADAPTABLE_WORKSPACE.md) for evidence and limits.

## Troubleshooting

- If npm cannot be resolved, reopen PowerShell after installing Node and use `npm.cmd`.
- Run `npm.cmd ci` after pulling dependency changes; do not change the lockfile just to work around an unknown error.
- An occupied strict port is reported instead of silently switching ports.
- The development watcher explicitly ignores `dist` and `release`, including their directory roots, to avoid Windows output-folder locks. If another application holds output files open and a build reports `EPERM`, close that application and retry. Close a running packaged launcher before replacing its folder.
- This checkout is on a filesystem without recorded ownership. For scoped Git commands, use `git -c safe.directory='D:/Canvas OS/Canvas Live (Project)/Canvas-Live-Whiteboard' ...`; no wildcard exception is needed.

Actual executed results, resolved failures and remaining scope are recorded in [MILESTONE_0.md](MILESTONE_0.md).

The earlier editor milestone passed **203 application tests**, **16 browser scenarios** and **24 launcher checks**; see [EDITOR_VERIFICATION.md](EDITOR_VERIFICATION.md). The MCP implementation and its current results are recorded in [MCP_VERIFICATION.md](MCP_VERIFICATION.md). The historical viewer result remains in [LCANVAS_VERIFICATION.md](LCANVAS_VERIFICATION.md).
