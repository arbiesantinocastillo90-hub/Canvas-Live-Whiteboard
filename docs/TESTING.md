# Setup, testing and verification

## Environment

Use Node.js **24.x, at least 24.15**, and npm. Versions are pinned in `package-lock.json`; use `npm ci` after cloning or pulling dependency changes. On Windows PowerShell, `npm.cmd` avoids the script execution-policy wrapper.

```sh
npm ci
npm run dev
```

Vite normally serves `http://127.0.0.1:5173`. If that strict development port is occupied, choose another with `npm run dev -- --port 5174`. The native launcher has its own available-port fallback.

## Commands

| Command                                                                                | Purpose                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`                                                                    | Check application, companion and configuration types           |
| `npm run lint`                                                                         | Run Oxlint with warnings denied                                |
| `npm run format:check`                                                                 | Verify formatting                                              |
| `npm test`                                                                             | Run application and real SDK MCP tests                         |
| `npm run test:watch`                                                                   | Watch application tests                                        |
| `npm run check:docs`                                                                   | Check Markdown links and the sample document                   |
| `npm run licenses`                                                                     | Check resolved license metadata and regenerate the inventory   |
| `npm run build`                                                                        | Check licenses/types, build site/companion and include notices |
| `npm run check`                                                                        | Run types, lint, formatting, tests and production build        |
| `npm run mcp`                                                                          | Start the authenticated development companion on port 8787     |
| `npm run preview`                                                                      | Preview the production site locally                            |
| `npm run package:windows`                                                              | Build the portable Windows package                             |
| `npm run test:launcher`                                                                | Native site/launcher checks on Windows                         |
| `npm run test:library`                                                                 | Native library/media checks on Windows                         |
| `npm run test:mcp`                                                                     | Run MCP protocol tests independently                           |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-windows-mcp.ps1` | Portable companion checks on Windows                           |

Windows checks create disposable packages and manage their own processes. Read their prerequisites first. They require the .NET Framework compiler and Windows APIs; runtime packaging also needs the official Node distribution or its verified cache.

## Latest dated evidence

The October 19 relationship endpoint revision passed 1,096 application tests across 181 suites, 64 MCP tests, types, lint, formatting, the production build and documentation/demo validation. Its 21 isolated production-browser scenarios cover both endpoint handles and all four sides, cancellation, protected targets, camera coordinates, Undo/Redo and saved-file reopening. See [endpoint verification](RELATIONSHIP_ENDPOINTS_VERIFICATION.md) for the actual build identity and installation checks.

The earlier October 18 interaction revision records:

| Execution                        | Result                              | Boundary                                                                               |
| -------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Application suite                | 1,041 tests passed; 177 suites      | Operations, schemas, component flows and recovery; not visual rendering proof          |
| MCP protocol                     | 64 tests passed                     | Real SDK traffic against a local companion                                             |
| Production browser               | 13 scenarios passed; no page errors | Areas, layers, Undo, panel geometry, destinations and a local MCP read/edit round trip |
| Installed service                | 5 checks passed                     | Site/discovery/authentication/tools; the owner's canvas was not shared or read         |
| Focused vertical docks           | 37 tests passed                     | Already included in the app suite                                                      |
| Build/types/lint/format/licenses | Passed                              | 232 resolved license records; existing warnings documented                             |

See [interaction verification](WORKSPACE_INTERACTIONS_VERIFICATION.md) for build identity and limits. Earlier [rich-canvas verification](RICH_CANVAS_VERIFICATION.md) records 53 native media checks, 24 portable launcher checks and 20 browser scenarios for that build. These overlap with earlier app suites and are separate executions.

Historical results remain in the [documentation index](README.md). Dates, environment details and acceptance limits are retained instead of rewritten as current results.

## What the tests establish

- Document validation, stable IDs, bounded operations and v1 migration.
- Manual/AI shared history, atomic batches, replay protection, conflicts and acknowledgment.
- Explicit sharing, revocation, separate credentials and HTTP Host/origin/body restrictions.
- File/save lifecycles, failed-write recovery, workspace scope and native optimistic revisions.
- Actual browser geometry and gestures for the scenarios described in each report.

## What remains unverified

- A current read/edit workflow through the owner's ChatGPT account and private tunnel. A 300-second timeout was reported; local protocol checks passed, while runtime-key setup and remote acceptance remain pending.
- Moving the package to a second physical PC and operating under school device/network policies.
- Broad browser, screen-reader, large-board performance and long-running media coverage beyond recorded scenarios.

## CI and reproduction

[GitHub Actions](../.github/workflows/ci.yml) installs the lockfile with Node 24, runs types/lint/format, application/protocol tests, documentation/demo validation and the build on Linux. It does not exercise Windows tray controls, native dialogs or an external AI account.

To reproduce browser behavior, import [the sanitized demo](../examples/README.md), change a label or layer, Undo, save, reload and export. For MCP, explicitly share that disposable canvas, read it first and use its session/revision for an edit. Stop sharing afterward. See [MCP setup](CHATGPT_MCP.md) for transport and credentials.

## Troubleshooting

- Keep the lockfile intact while diagnosing installation problems.
- Fix a failing build/license/type gate before relying on a later output file.
- Vite ignores generated `dist`/`release` paths to avoid output-folder locks. Choose another port instead of terminating an unrelated process.
- Preserve `data/` and configuration when updating a package. Packaging rejects replacing populated data without a deliberate migration.
- Restarting the companion rotates local credentials; reconnect using its current address. A browser pairing code is not an MCP client token or tunnel runtime key.
