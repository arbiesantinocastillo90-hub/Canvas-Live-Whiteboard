# Live links, local library and session UI verification

Verified on 2026-10-16 using the physical C: dependency mirror and the D: checkout. SHA-256 comparison matched all **122 source files** between them. No dependency versions were changed.

## Checks

- **777 application tests passed** on the final frozen source, including linked view restoration, automatic resume, per-view recent-file order, camera preservation across project changes, canonical preference protection, native save acknowledgements, conflicting edits, draft exports, multiline text, notifications, formats and existing editor/MCP browser integration.
- **63 MCP companion tests passed.** The existing 15-tool sharing boundary and content revision safeguards remain in place.
- **34 native HTTP/storage/process checks passed** against copied launcher sources. These exercise bounded requests, revision conflicts with real request bodies, missing revisions, origin/host checks, invalid data, namespace/path rejection, atomic previous-copy backups, restart durability and linked-folder rejection. Existing owner files and processes were not changed by the tests. The executable uses its existing .NET Framework runtime and no new Node dependency.
- **18 final Chrome integration checks passed** on an isolated native package. Exact URLs retained file identities, pinned tabs and camera while displaying newer saved contents. Latest URLs and plain startup followed later UI changes without another Copy. Camera-only movement did not write a canvas-content revision. Fresh browser profiles saw the same native records. A real cross-origin localhost parent embedded the 127.0.0.1 app, edited and saved the same file while retaining its camera. Notifications, floating buttons, smart text, Home layout, CLF/CLP/CLW downloads, Home project export and independent CLP imports passed. No browser errors or AI companion requests were recorded.
- **8 real Chrome tab-drag checks passed**, covering left/right insertion, the final slot, drag/release visuals, selected batches, pinned/grouped tabs, edge scrolling and reduced motion.
- TypeScript, lint, formatting, license metadata checks for 232 resolved packages, and the production build passed. The build retains advisory bundle-size and third-party annotation warnings.

The initial broad application run found obsolete synchronous-remount/text assertions after the new resume/notification behavior and two tests loaded while their source was being updated. Those assertions were adapted and the final frozen-source run passed in full. Review also found and fixed stale preference writes, re-applied old link cameras, missing recent-file presentation state, and an inactive-editor flush during Home project export. A physical-save/native-conflict edge now keeps recoverable unsaved edits.

## Installed artifacts

The existing package was updated at:

`D:\Canvas Live Environment\Canvas Live (Project)\Canvas-Live-Whiteboard\release\Canvas Live`

- Website: `http://127.0.0.1:4173/`
- JavaScript: `index-BcWiJ5b9.js`, SHA-256 `959B466FE38E614F76BEC3F977DE6E37A0AF3346F1781102D1E7414A81256671`
- CSS: `index-CYwbbvND.css`, SHA-256 `84D066FCFAB54EED59916010244B5D4EA9E1AF15ED2E29D0FA4CA02DA296F7A3`
- Native executable SHA-256: `739FC3162F90621349872A59FEF791F3E4ADC797CA56E87458B71D804352C304`

The update retained the data folder, private connection configuration, old hashed assets and the owner's existing icon changes. Previous executable/index/companion/readme copies were saved before replacement. The new process served the native storage marker and both current assets successfully. Existing browser pages were not forcibly reloaded. A new browser tab was queued in the Codex right panel at the owner's request.

Reports and synthetic-data screenshots are retained locally under `test-results/live-links-final/`; a copy accompanies the dated update in the project brain. The earlier blank iframe screenshot caught Chrome before its first paint and is excluded from the final evidence set; the saved-iframe screenshot shows the rendered editor.

## Limits

The actual Obsidian desktop application was not exercised; the browser iframe's real edit/save path was. Links remain local references to this device and running executable. Older v1 URLs continue to hold frozen independent document copies. CLW exports contain UI/reference state, so CLF/CLP exports or a backup of the complete data folder are needed for document contents. Overlapping unsaved content edits are protected rather than automatically merged.
