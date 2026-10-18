# Bugs, Errors & Revision verification

Verified 2026-10-15. Only the requested group in `D:/Canvas OS/Canvas Live Workspace 1.canvas` supplies task requirements. It contains a heading and two notes; the scoped notes were re-read and remain unchanged. Their extracted copies and source hashes are retained in `test-results/bug-area-source.json` and `bug-area-source-current.json`. No other canvas area was used as a task requirement.

## Result

The scoped work preserves the previous camera-independent Undo/Redo fix and adds automatic valid property commits, stable/customizable connection sides, nested project organizers, named UI sessions, remembered tab presentation and shortcut lists, draggable docks and configurable motion/auto-hide. [BUGS_ERRORS_REVISION.md](BUGS_ERRORS_REVISION.md) maps every source factor to its implementation and describes the persistence boundaries.

Changes reside in the app, shared LCANVAS/operation validation and MCP command schemas, their tests and the updated guides. The owner's logo, physical files, private connection settings and unrelated launcher work are preserved. No dependency or paid API was introduced.

## Checks

| Check                                | Result                                          |
| ------------------------------------ | ----------------------------------------------- |
| Full app Vitest suite                | 552 passed                                      |
| Official-SDK MCP suite               | 63 passed                                       |
| Focused final tab / dock checks      | 7 / 11 passed                                   |
| TypeScript application and companion | Passed                                          |
| Oxlint and Prettier                  | Passed                                          |
| Production app and companion build   | Passed                                          |
| Pinned license gate                  | 232 packages; no new dependencies               |
| Actual isolated Chrome               | 22 passed, zero runtime/console errors          |
| Responsive review                    | 44 screenshots at 1440, 760, 390 and 320 pixels |

Executed the full app suite with `vitest run --pool=threads --maxWorkers=2 --testTimeout=15000`, the MCP configuration, focused regressions, lint, format checking, license checks, TypeScript, Vite and companion packaging. Production assets are **`index-DWkHUhQ0.js`** and **`index-_8aZhEHl.css`**. Final visual-only CSS refinements retain the tested interaction logic; all 22 final browser checks use these exact assets.

Browser checks use an isolated origin/profile, controlled choosers and real Chrome OPFS file streams. They cover immediate property dismissal and Save, invalid drafts, old/new connection sides, camera history, nested organizers, non-destructive shortcut removal, multi-tab actions, dock movement/hover, motion, separate workspace settings, export/import, reload and a full Chrome process restart. They do not inspect the owner's browser data or private connection files. The native Windows chooser and the owner's live ChatGPT write acceptance remain manual boundaries.

Visual review uses four contact sheets covering all 44 responsive screenshots, with enlarged representative screenshots for text, inputs, spacing and menu/header controls. Native pointer hit checks, visible tab icons, workspace row-height limits, viewport overflow and context-menu bounds supplement the images.

## Resolved findings and limits

- Optional appearance/selection corruption previously reset valid project metadata. Individual defaults and last-good recovery preserve that metadata.
- Older links without endpoint sides now acquire fixed sides from initial geometry without rewriting their source file on open. Explicit Auto remains dynamic.
- The dock's three text tabs covered Close at default width. Icon tabs, explicit accessible labels and fixed chrome sizing restore normal pointer interaction.
- A stale mobile rule hid those icons. Removing it keeps all section controls visible on narrow screens.
- Stretched workspace grid rows caused large vertical gaps. Intrinsic row alignment, themed inputs and an active-workspace highlight fix the panel. The tab group input uses the same theme/focus treatment.
- Initial full-suite execution passed 550 tests and timed out on two busy UI scenarios at five seconds. Fewer workers and a 15-second budget pass all 552 with unchanged assertions; failed-attempt reports are retained.
- Browser fixtures were corrected for genuine hover-only actions, SVG hit paths, slider keyboard input and intentional project-opening recency updates. Earlier attempts remain in `test-results`.
- The build succeeds with upstream Zod annotation comments removed by Rollup and an informational chunk-size warning at approximately 516 kB minified / 155 kB gzip. No warning was hidden or dependency changed.

## Evidence and activation

`test-results/bugs-*` retains final suites, build/check logs, browser reports, screenshots, exports, source hashes, stage/apply logs and the release report. Guides and selected public evidence are copied to `D:/Canvas Live`. Package activation and source checkpoint status are recorded in `bugs-release-report.json`; the ordinary runtime guard, manifest hashes and unchanged executable identity are required before installation. Previous replaced files and staged payloads remain recoverable.

Next owner acceptance: save/open a chosen physical LCANVAS file, then perform a live edit through the ChatGPT plugin using the same browser address/profile. Workspace exports reference the current library; they contain no canvas objects, file handles or credentials.
