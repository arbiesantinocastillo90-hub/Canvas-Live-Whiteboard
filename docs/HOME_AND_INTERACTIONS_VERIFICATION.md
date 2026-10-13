# Home, interactions and local-file verification

Verified 2026-10-13 for the owner's outer page, practical canvas interaction and physical LCANVAS save/export requests.

## Result

Home lists projects and files before opening a canvas. Explicit selection opens the compact workspace. Home/Options retain current tabs, drafts and content Undo history, disable hidden commands and revoke sharing. Shift/marquee selection, group edits, area/member connections, eight resize handles, inline text and validated clipboard operations use the existing document model. Camera movement is batched to frames and content Undo/Redo preserves the current camera.

Save chooses/reuses a local LCANVAS file; Save as selects another destination. Export flushes the latest committed draft. Bound autosave uses already granted permission and reports success after stream close. Cancellation, failures, outside edits and edits during a write preserve usable content. Independent recovery and file-handle databases protect reopening. The last physical commit wins over an older browser copy after a cache failure.

## Checks

| Check                                  | Result                                 |
| -------------------------------------- | -------------------------------------- |
| Application Vitest suite               | 470 passed, 31 files                   |
| Official-SDK MCP suite                 | 63 passed                              |
| TypeScript app and companion           | Passed                                 |
| Oxlint and Prettier                    | Passed                                 |
| Production website/companion           | Passed                                 |
| Pinned license metadata gate           | 232 packages; no unreviewed licenses   |
| Actual Chrome Home/editor              | 18 passed; zero runtime/console errors |
| Actual Chrome/SDK camera               | 9 passed; zero runtime/console errors  |
| Actual Chrome file streams             | 13 passed; zero runtime/console errors |
| Update integrity/backup/scope fixtures | 23 passed                              |

Executed: `vitest run --pool=threads --maxWorkers=4`, MCP configuration run, focused interaction/saving suites, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run build`, the retained isolated browser scripts, and the updater fixtures with an explicit directory. Verification uses the physical C mirror and hash comparison with the moved D repository.

Final assets: **`index-C-T6gVNe.js` / `index-Dzwy1XSQ.css`**. Final visual-only refinements preserve the tested JavaScript; the production build and all 40 browser scenarios use these exact assets. Desktop/760/320 Home and Options use the full viewport. Narrow library gaps are 24 pixels. Peek/narrow pinned panels begin below file tabs; normal pointer Save remains accessible with Properties open.

File tests use real Chrome OPFS `FileSystemFileHandle` streams returned by a controlled picker. They verify actual close, failure/abort preservation, late edits, permissions, structured-clone handles, external conflicts, quota failure and cache-clear/re-import. The final 13-object LCANVAS v2 download exactly matches the reopened file. The Windows native chooser itself remains a manual acceptance boundary. Tests do not use the owner's files, browser profile, clipboard, tunnel or runtime. The owner's live ChatGPT write acceptance is separate from the local SDK checks.

## Resolved findings

- D-drive tests resolved duplicate matcher modules; physical C verification passed.
- Native pointer capture retargeted double-click to the stage. Delegated hit testing fixes inline editing; the actual Chrome probe and regression test pass.
- A later CSS rule clipped outer pages to 44 pixels. Explicit outer specificity, compact row alignment and width/spacing checks fix the layout.
- Overlay headers covered Save; moving peek/narrow overlays below file tabs fixes hit testing.
- Fixtures now wait for actual wheel coordinates, ready switcher options and the new Save-as close, preserving earlier failed-attempt reports.
- The updater fixture needed an explicit Windows PowerShell directory; its final 23 checks pass.
- Rollup removes upstream Zod pure-annotation comments it cannot interpret; the production build exits successfully. No dependency was added or upgraded.

## Evidence and release

Ignored `test-results` retains `home-final-*` logs, `home-source-hashes.json`, UI/MCP/local-file browser reports, screenshots, exports and failed attempts. Current guides/evidence are copied to `D:/Canvas Live`.

The package is under `D:/Canvas Live Environment/Canvas Live (Project)/Canvas-Live-Whiteboard/release/Canvas Live`. The existing executable SHA-256 remains `2A289C822050CF0CB14C220EA1DD5953CA68A16F1A5265B35ECFACFB682E5BD9`. The relocated stage helper validates that exact path, retains the old stage, backs up the updater before rebasing its path guard, and installs the index last. `home-update-stage-report.json` and `home-release-report.json` record actual activation; installation requires the ordinary runtime guard. Unrelated launcher source/icon work remains preserved.

The update was installed on 2026-10-13 after the ordinary runtime guard passed. All 10 installed file hashes match the staged manifest and the executable hash is unchanged. Previous replaced files and the old stage remain in the package's backup folders. No owner browser page was refreshed or private connection setting changed during installation.

See [HOME_AND_LOCAL_FILES.md](HOME_AND_LOCAL_FILES.md) for controls. Next acceptance: save/open an owner-selected physical LCANVAS file through the native chooser, then perform a live edit through the owner's ChatGPT plugin.
