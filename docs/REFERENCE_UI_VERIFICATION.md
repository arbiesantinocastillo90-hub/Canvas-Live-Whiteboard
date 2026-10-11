# Compact reference UI verification

Verified 2026-10-11. This implements the owner's Obsidian screenshot orientation and subsequent request for icons with hover names.

## Result

A 44-pixel workspace ribbon opens left Files/Projects. Central file tabs sit above the full-height canvas; the right view rail opens Tools, Properties and AI. Unpinned panels overlay and auto-close. Double-click tabs or use a pin button to reserve space on wide screens. Narrow screens use overlays. Text inputs, keyboard focus, resize gestures and dialogs protect interaction. Hidden panels retain property and pairing drafts, while the bridge retains explicit sharing authority.

Decorative descriptions and repeated instructions are removed. Icon actions retain accessible names and hover titles. File names, editable labels, errors, status and sharing details remain available. Existing saving, history, shortcuts and validated AI operations continue through their existing handlers.

## Files

- New: `src/app/DockPanel.tsx`, its interaction tests, and `src/app/workspace-reference.css`.
- Revised shell/files/editor: `App.tsx`, `FileWorkspace.tsx`, `CanvasEditor.tsx` and their tests.
- Revised compact controls: `CanvasInspector.tsx`, its tests, `WorkspaceAI.tsx`, `AppearanceOptions.tsx` and `shortcuts.ts`.
- Revised independent layout migration: `layout.ts` and tests; the final stylesheet is imported in `src/main.tsx`.
- Updated README, workspace guide, UI history, architecture, decisions, roadmap and testing documentation.

## Checks

| Check                                                  | Result                               |
| ------------------------------------------------------ | ------------------------------------ |
| Application Vitest suite, threads pool, four workers   | 370 passed across 23 files           |
| MCP Vitest suite with official SDK                     | 63 passed                            |
| Final DockPanel focused rerun after modifier-key guard | 7 passed                             |
| TypeScript application and companion checks            | Passed                               |
| Oxlint and full Prettier check                         | Passed                               |
| Production app, companion and distribution notices     | Passed                               |
| Pinned dependency license gate                         | 232 packages, no unreviewed licenses |
| Actual Chrome reference UI scenarios                   | 12 passed, zero runtime errors       |
| Actual Chrome/SDK camera concurrency scenarios         | 9 passed, zero runtime errors        |
| Update safety/backup fixture checks                    | 23 passed                            |

Executed commands: `vitest run --pool=threads --maxWorkers=4`, the MCP configuration run, focused dock/editor/inspector/file tests, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run build`, and the retained isolated browser and updater scripts. Build artifacts: `index-ClMu-Zni.js` / `index-CvjbhEmp.css`.

The first D-drive fork test startup stalled before execution; the fast verification mirror and threads pool completed the tests. Browser fixtures were adapted for changed project/appearance labels and an allowed loopback origin. The visual check caught a real float-clearing dependency on removed descriptions; the corrected settings controls pass bounds checks in the final build.

All browser checks use an isolated profile and companion. They verify real rendered geometry, acknowledged AI edits while the AI panel is hidden, shared revision stability for panel changes, file-switch revocation, saving and exports. They do not establish a live write through the owner's ChatGPT account. No dependencies or paid APIs were introduced.

Release activation and supported controls are in [ADAPTABLE_WORKSPACE.md](ADAPTABLE_WORKSPACE.md). The staged installer validates the exact package/executable, current runtime state and hashes; it preserves previous files before installation and retains the previous update stage. Launch the package through Canvas Live.exe; save an older dirty page before refreshing it.

## Installed release

The verified 10-file update was installed in `release/Canvas Live` after the ordinary runtime guard passed. Installed hashes match the stage. The executable remains `2A289C822050CF0CB14C220EA1DD5953CA68A16F1A5265B35ECFACFB682E5BD9`; the previous replaced files are retained in `.canvas-live-update-backups/20261011-165835-ccdbef1f`. The previous update stage was also retained. Source/build copies and the project-brain verification reports were refreshed. No services or user browser pages were started, stopped or reloaded during release activation.
