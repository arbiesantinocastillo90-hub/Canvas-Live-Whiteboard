# Milestone 0 execution record

Date: 2026-10-09 (America/Chicago). Checkout: `D:\Canvas OS\Canvas Live (Project)\Canvas-Live-Whiteboard`. Branch: `codex/milestone-0`.

## Changes

Git identity is configured locally as Arbie Santino D. Castillo, `arbiesantinocastillo90@gmail.com`. The specification, agent instructions and initial inspection are committed in `a3effa0`. Original project code uses MIT.

The React/TypeScript/Vite foundation contains a responsive workspace preview, disconnected AI status and an explicit statement that board editing is not available. It uses system fonts and locally authored CSS. It has no canvas engine, document storage, MCP transport or model API.

Created application files under `src/`, test setup under `tests/`, exact dependency manifest and lockfile, TypeScript/Vite/Oxlint/Prettier configuration, license checks and distribution-notice scripts under `scripts/`, project LICENSE, and roadmap/architecture/setup/decision/license documentation under `docs/`. Updated README with startup instructions. Existing specification, agent instructions, historical inspection and the parent planning canvas were preserved.

## Environment and verification

Windows 11 Pro x64, Node 24.21.0, npm 11.19.0 and Git 2.53.0.windows.3. No global Git identity or wildcard safe-directory exception was configured.

| Check                                                                                              | Result                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fresh final-lock `npm.cmd ci --offline --no-audit --no-fund` in a separate empty Windows directory | Passed; 147 packages installed, including applicable platform packages                                      |
| Final-lock install in the development checkout                                                     | Passed; 147 packages installed in 5 minutes, lockfile unchanged                                             |
| `npm.cmd run check`                                                                                | Passed with the final lock and watcher configuration                                                        |
| Initial workspace test                                                                             | 1 test in 1 file passed                                                                                     |
| TypeScript, Oxlint, formatting                                                                     | Passed                                                                                                      |
| Production build                                                                                   | Passed with Vite 7.3.7, including while the development server was running                                  |
| `npm.cmd audit --audit-level=moderate`                                                             | 0 vulnerabilities reported by the registry at execution time                                                |
| Final lock structure                                                                               | 215 dependency entries; all have registry download URLs and integrity checksums; no Lightning CSS entries   |
| Distribution license files                                                                         | Project license and full React/ReactDOM/Scheduler notices copied into `dist/`; source/output hashes matched |
| Loopback startup and browser review                                                                | HTML/module HTTP 200; listener 127.0.0.1:5173; visible preview and no captured browser warnings/errors      |

The final lockfile SHA-256 is `629F204C7A31BB75EB2F4CE74720F6CDE632D3C4B33A4B6EFA0EE33DDCC39A50`. Optional package entries cover other platforms, so the lock entry count exceeds the installed package count on Windows.

## Findings resolved during verification

- The first dependency install stalled on uncached jsdom. Its local archive was checked against the registry checksum, added to npm's cache, and installation recovered without temporary-file dependency URLs.
- The initial recovered lock omitted URLs/checksums for 95 entries. Its offline reinstall failed with `ENOTCACHED` while looking up xmlchars metadata. A fresh lock was generated from the final manifest in an empty directory, reviewed, and successfully installed there. All final entries have download URLs and checksums.
- Vite 8.3.4 required MPL-2.0 Lightning CSS. It was replaced with maintained Vite 7.3.7 and React plugin 5.2.0. CSS explicitly uses PostCSS and esbuild.
- Actual MIT-0 notices for the two CSSTools packages were reviewed. The exact caniuse-lite development data package received a scoped CC-BY-4.0 review, with attribution and full license text retained. These decisions are recorded in LICENSES.md and DECISIONS.md.
- Test matcher types initially used the Jest declaration instead of the Vitest declaration. The application type configuration now includes the Vitest augmentation and test setup.
- Review found that a dist-only handoff would omit MIT notices. Builds now regenerate notices, run the license gate and include both license files in the distributable folder.
- A build while the development server was running hit Windows `EPERM` on the watched output directory. Stopping that server allowed the build. Explicitly excluding both `dist` and its descendants from the file watcher resolved the conflict; a new build passed with the server still running.

npm 11 reported esbuild's unapproved postinstall script and skipped it. The applicable native binary package is present; the production build succeeded without enabling that script. No broad install-script approval was added.

## Limits and next task

Milestone 0 is a startup foundation, not the completed whiteboard MVP. The initial test checks mounting and truthful feature status; jsdom does not prove visual browser behavior, canvas editing, storage, undo/redo or ChatGPT integration.

Next: Milestone 1's bounded engine proof. Excalidraw's separately licensed OFL fonts still require a policy decision or supported replacement. Stable-ID operations, serialization, arrow binding and mixed manual/programmatic history need actual runtime verification. ChatGPT account eligibility, secure transport and real write-tool behavior remain unverified.

Current results and decision documents are copied to `D:\Canvas Live`. That external brain does not synchronize automatically with this checkout. Milestone 0 exit criteria are met; no remaining setup test/build failures are known.
