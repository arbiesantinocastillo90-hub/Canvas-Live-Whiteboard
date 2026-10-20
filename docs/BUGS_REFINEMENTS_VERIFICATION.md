# Durable library and AI workspace verification

Checked October 19–20, 2026, on Windows with disposable native packages and Chrome contexts. This revision follows the owner-confirmed **Identified Bugs 1** notes and the additional AI mini request. Private canvas contents, credentials and personal library inventories are excluded from this report.

## Changes and acceptance

| Reported problem                                          | Resulting behavior                                                                                                                                                                                                                 | Evidence                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A failed library load obscures otherwise healthy projects | Native storage isolates individual records, recovers valid previous copies, retains damaged bytes and surfaces actionable notices. Optional settings damage does not hide healthy canvases; damaged authority records fail closed. | Native migration/recovery checks and catalog regressions     |
| Every load or save involves the entire library            | Home reads a lightweight catalog; project views load their drawing bodies on demand. A canvas save changes its own atomic record. Automatic project/workspace folders use stable identities.                                       | Native catalog tests and actual browser request counts       |
| An embedded view reports a denied external write          | The owned library can retain a recovery copy while the external `.CLF` remains clearly pending. Automatic external retries pause; Download copy and a direct-browser retry remain available.                                       | Save lifecycle tests and a controlled iframe denial scenario |
| Files and projects cannot be removed                      | Workspace Trash hides references while retaining canonical data. Restore is available; another workspace's references remain intact.                                                                                               | Component and browser Trash/restore checks                   |
| Files and projects cannot move between workspaces         | Choose the destination explicitly. Project moves retain identity; file moves save the destination before hiding the source. Dirty drafts and partial failures remain protected.                                                    | Failure/race tests and browser transfer scenarios            |
| AI access ends on Home or Options                         | Explicit sharing continues through those pages while hidden manual shortcuts remain disabled. Work returns to the view's retained canvas. File/project/workspace switches and Stop sharing still revoke that grant.                | Editor lifecycle tests and a real browser/SDK round trip     |
| The companion exposes only one canvas                     | Up to 16 separately authorized views can share independent canvases. `list_shared_canvases` provides explicit session selection. Cross-session revisions, pending work, retries and expiration remain separate.                    | Real SDK multi-view tests                                    |
| AI presence is hard to see or personalize                 | A draggable, clickable mini exposes observed activity and actions, customizable appearance/motion, custom raster images and reduced-motion behavior. Official client marks remain separate from the mascot.                        | Mini tests, image decoding and rendered browser interactions |

Creation, import and duplication persist the owned record before opening the new canvas. Later edits still follow Save/Autosave preferences. MCP itself has no save, arbitrary file or shell tool. The [storage guide](DURABLE_LIBRARY.md) and [AI mini guide](AI_MINI.md) describe the supported workflow.

## Recorded checks

| Execution                           | Result                                                                   | Boundary                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Application suite                   | 1,205 passed across 91 test files; zero failed or pending                | Includes focused recovery, Trash, mini and view-return regressions                           |
| MCP protocol                        | 71 passed; zero failed or pending                                        | Official local SDK, independent explicit grants and targeted operations                      |
| Native Windows storage              | 67 v2 checks and 55 existing checks passed                               | Same native source; separate disposable packages                                             |
| Production Chrome                   | 22 scenarios passed; zero page errors or foreign image/font/CSS requests | Actual native app and SDK in disposable contexts; owner view untouched                       |
| Types, lint, format, docs and build | Passed                                                                   | 232 resolved license records; existing bundle-size and upstream annotation warnings retained |

Focused runs are subsets of the application/protocol suites and must not be added to their totals.

Production index SHA256: `C74F8B968ABCE69E64A21BB10EE602659BD3A3E0FEB4CC0E33F8FF791D564334`. Native storage source SHA256: `3F764027EDA73E212FA0EC8DEB827B4D3058A46D38B0DD31DFD8EC3E5BE3A47D`. Companion bundle SHA256: `DE0AA191CBC3A69E7881677944AD4ED29E9CD5533B31FB3132A60242E3F88237`.

The browser run verified zero drawing-body requests on Projects Home; scoped project reads; create, import/copy and fresh-context reopen; Trash/restore and transfers; two simultaneous explicit MCP grants; targeted edits and Undo; reported client logos decoded from local assets; mini dragging, actions, native settings, offline preview, custom images and reduced motion; Home/Options/Work continuity; workspace isolation and isolated revocation; two owned-library autosaves after one denied external write; and previous-record recovery after native restart.

The update procedure keeps a full byte-verified package backup, preserves private configuration, runtime, data and earlier hashed browser assets, and copies only reviewed public artifacts. Application startup is a separate manual step. The preview migration was observed in the owner installation, and all seven original legacy/media/appearance files still matched their backup bytes. This is separate from the disposable browser acceptance run.

The native storage revision independently passed **67 v2 checks** and **55 existing library/media checks**. These cover staged migration, retained legacy bytes, valid backup-only recovery, corruption isolation, revision conflicts, protected paths and payload bounds, individual record writes, lightweight catalogs and saves during a stalled reader. These controlled fixtures do not establish a general performance guarantee.

The MCP suite passed **71 tests** through the official local SDK, including independent explicit grants and targeted operations. This establishes the local protocol, not acceptance through the owner's cloud AI account.

To reproduce the source checks:

```sh
npm run typecheck
npm run lint
npm run format:check
npx vitest run --maxWorkers=2 --testTimeout=15000
npm run test:mcp
npm run check:docs
npm run build
```

On Windows, use `npm run test:library` and `npm run test:library:v2` for the native suites. They create disposable packages and preserve their reports. Browser scenarios use separate data and browser profiles; the owner's open view is not a test fixture.

## Limits retained

- Actual Obsidian application acceptance is separate from a controlled iframe permission-denial test.
- The current ChatGPT account/tunnel still needs its private runtime setup and observed read/edit/Undo acceptance. A local SDK test does not resolve a reported cloud timeout.
- A second physical computer, school execution/network policy and broad performance/accessibility coverage remain unverified.
- Trash is recoverable workspace removal; permanent deletion is not included. Concurrent edits are revision checked, not automatically merged.
- Keep the complete `data/` folder. After v2 saves, an older executable reads only its old snapshot; preserve a full backup before downgrading.

See [testing](TESTING.md), [roadmap](ROADMAP.md) and [timeline](TIMELINE.md) for the current commands and remaining acceptance work.
