# Setup and testing

## Windows prerequisites

Use Node.js 24 LTS, version 24.15 or newer in the 24.x line, with npm. The verified environment for this implementation reports Node 24.21.0 and npm 11.19.0. `npm.cmd` works in PowerShell without needing a PowerShell script execution-policy change.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Dev startup uses a strict port; if it is occupied, stop the other service or intentionally select another loopback port with `npm.cmd run dev -- --port 5174`. Do not use `--host 0.0.0.0` for routine local development.

## Commands

| Command                                | Purpose                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `npm.cmd ci`                           | Install the pinned lockfile reproducibly                                 |
| `npm.cmd run typecheck`                | Check application and config types                                       |
| `npm.cmd run lint`                     | Check React/TypeScript/script rules, fail on warnings                    |
| `npm.cmd run format:check`             | Verify formatting                                                        |
| `npm.cmd run format`                   | Apply formatting                                                         |
| `npm.cmd test`                         | Run tests once                                                           |
| `npm.cmd run test:watch`               | Watch tests during development                                           |
| `npm.cmd run licenses`                 | Regenerate the lockfile license inventory; fail on unreviewed metadata   |
| `npm.cmd run build`                    | Check licenses/types, build in `dist/`, and include distribution notices |
| `npm.cmd run preview`                  | Serve the production bundle on `127.0.0.1:4173`                          |
| `npm.cmd run package:windows`          | Build the website and create the portable Windows executable folder      |
| `npm.cmd run test:launcher`            | Test the packaged launcher and its local HTTP server on Windows          |
| `npm.cmd run check`                    | Run types, lint, format check, tests, licenses, and production build     |
| `npm.cmd audit --audit-level=moderate` | Check the current registry vulnerability database                        |

## Current coverage

The initial component smoke test mounts the workspace, checks its main heading and home link, and ensures disconnected AI/non-editable board status are represented honestly. This verifies the React/test pipeline, not drawing or AI control. Startup checks verify that the loopback dev server serves the HTML and transformed app module.

There are no canvas, persistence, MCP, synchronization or real-browser end-to-end tests yet because those features have not been implemented. jsdom does not verify browser rendering or engine history. These require milestone-specific runtime tests when the features are added.

The Windows launcher has a separate integration test. Run `npm.cmd run package:windows`, then `npm.cmd run test:launcher`. It copies the package to a temporary folder with spaces and checks startup from an unrelated working directory, packaged assets/notices, HTTP restrictions, occupied-port fallback, repeated launch, restart recovery and missing-file errors. The executed result was **24 passed checks**. It uses `--no-browser` and force-stops its own processes; it does not exercise the tray's Close action or observe the operating system's default-browser window. See [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for the normal-launch browser check and coverage limits.

## Troubleshooting

- If npm cannot be resolved, reopen PowerShell after installing Node and use `npm.cmd`.
- Run `npm.cmd ci` after pulling dependency changes; do not change the lockfile just to work around an unknown error.
- An occupied strict port is reported instead of silently switching ports.
- The development watcher explicitly ignores `dist` and `release`, including their directory roots, to avoid Windows output-folder locks. If another application holds output files open and a build reports `EPERM`, close that application and retry. Close a running packaged launcher before replacing its folder.
- This checkout is on a filesystem without recorded ownership. For scoped Git commands, use `git -c safe.directory='D:/Canvas OS/Canvas Live (Project)/Canvas-Live-Whiteboard' ...`; no wildcard exception is needed.

Actual executed results, resolved failures and remaining scope are recorded in [MILESTONE_0.md](MILESTONE_0.md).
