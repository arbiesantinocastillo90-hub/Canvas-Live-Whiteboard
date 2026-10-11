# Canvas editor verification — 2026-10-10

## Delivered behavior

The requested editor supports fullscreen for the active file, rectangles/ellipses/diamonds, standalone text and shape labels, pointer movement and corner resizing, named areas with explicit members, per-object layers and attached connections. Connections offer no arrows, start/end arrows or both ends, with straight/elbow routing. Layers can be named, reordered, hidden and locked. Areas move members together and respect member/layer restrictions.

Save stores the whole document; export includes its current state. LCANVAS v2 is validated and valid v1 files/records migrate in memory without losing original IDs/geometry/view. Opening an old stored record preserves its original payload until Save. Unsaved drafts survive section/project navigation and trigger the browser's unload protection; switching files or leaving the editor resets undo history.

See [EDITOR.md](EDITOR.md) for controls and boundaries, and [LCANVAS.md](LCANVAS.md) for the format.

## Automated checks

The final `npm.cmd run check` passed TypeScript, lint with warnings rejected, formatting, **203 tests in 12 files**, the **215-package license metadata gate** and the production build. The same pinned physical dependencies and exact source were checked in the existing C: verification copy after D: test-worker startup timed out. Hash comparison confirmed matching application, tests, scripts, launcher, assets and lockfile before packaging. D: startup failures are not counted as passed assertions.

Coverage includes schema/migration, atomic operations, area and layer restrictions, connection geometry, bounded combined undo/redo, completed/cancelled pointer gestures, Inspector properties and exact labels, project file management, content Save/reopen, draft protection while Options is open, fullscreen fallback/native exit and late native requests completing after Escape. The earlier read-only viewer also honors v2 layer visibility.

The lockfile remained unchanged: SHA-256 `629F204C7A31BB75EB2F4CE74720F6CDE632D3C4B33A4B6EFA0EE33DDCC39A50`. The supplied logo remained unchanged: SHA-256 `84F028962DE52F50105A073964D5E1F9E694713D451E3DD8FE4DE73F1D4FA401`. No dependencies or external services were added.

## Browser checks

Isolated automated Chrome sessions passed the same **16 scenarios** against the development copy at port 5181 and the rebuilt production package at port 4173, with native IndexedDB and actual pointer/browser behavior:

1. Project and file creation through the UI.
2. Shapes, shape labels, dimensions and standalone text.
3. Pointer movement, resizing, undo and redo.
4. Area membership and movement of contained objects.
5. Layer creation, ordering, hiding and locking.
6. Attached connections, arrow choices and elbow routing.
7. Unsaved edits through Options, then Save and reload.
8. Native fullscreen, hidden surrounding layout, essential controls and Escape.
9. Version 1 import and version 2 export.
10. Desktop Properties with area/layer context.
11. The 1312×825 desktop rail.
12. Short 800×400 fullscreen with all seven rail buttons inside the pane and at least 24 pixels high.
13. 760-pixel responsive layout without page overflow.
14. 320-pixel responsive layout without page overflow.
15. Focus fallback when native fullscreen is rejected.
16. No runtime or console errors in the main and fallback contexts.

Screenshots were inspected for the desktop, fullscreen, short fullscreen, 1312×825, both narrow widths and fallback. This caught two issues before release: property labels containing textarea/select contents, and short fullscreen shrinking/clipping rail buttons. Explicit control labels and a compact short-window rail fixed them; the strengthened tests then passed.

The session script and production report are generated local evidence in `test-results/editor-browser-check.mjs` and `test-results/editor-browser-report.json`; `editor-browser-dev-report.json` retains the development result. They use the bundled testing runtime and fresh contexts, separate from the user's browser profile. No sample project was inserted into the user's file library. The screenshots show a test diagram, not the user's current board.

## Windows package

The verified production output was copied to the checkout, then `scripts/package-windows.ps1` rebuilt `release/Canvas Live/Canvas Live.exe` with its app, configuration, readme and license notices. Previous package/build folders were retained. The package HTML matched the build by SHA-256; assets are `index-B_Vtvg4M.js` and `index-dJYyiQE5.css`.

`scripts/test-windows-launcher.ps1` passed **24 integration checks** against the rebuilt folder. These cover relocation, loopback serving, assets/notices, HTTP restrictions, occupied-port fallback, repeated launch, restart and missing files. The test uses `--no-browser` and stops only its own launcher processes. It does not retest the Windows default-browser handler or graceful tray Close action.

## Remaining scope

Live MCP/ChatGPT connectivity is the next requested task and remains unimplemented. The AI panel reports disconnected. Freehand, rich text, images, nested areas, multi-selection, layer deletion, automatic saving, cross-tab conflict resolution and collaboration remain outside this step. Native browser behavior was checked in Chrome; other browsers and OS versions were not tested here.
