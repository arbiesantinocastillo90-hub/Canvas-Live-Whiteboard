# AI presence and activity verification

Review date: **October 21, 2026 (America/Chicago)**. This revision completes the on-canvas presence work first installed as an early USB preview on October 20. It builds on the [durable-library revision](BUGS_REFINEMENTS_VERIFICATION.md); native storage formats and launcher code are unchanged.

## Delivered behavior

- Targeted MCP reads highlight actual returned objects. Validated queued edits and locally acknowledged changes use separate states and configurable colors. Locations follow the canvas camera, with movement trails, former-location deletion cues and an offscreen indicator.
- The shared character appears beside the activity. The floating mini's bubble contains recent activity; double-click opens Workspace AI, where management controls and the longer activity list live.
- Options and Workspace AI share workspace-scoped customization, including offline preview, character uploads, marker colors, duration, labels and animation. Reduced-motion preferences keep cues static.
- Bounded metadata comes from actual MCP operations. Locations are derived from the editor's validated documents; hidden objects are excluded. Duplicate transport messages do not replay completed activity, and stop/file changes clear the grant's state.
- Interrupted requests are recorded as unconfirmed when local completion cannot be established. The UI does not claim ongoing model reasoning, progress percentages or successful edits without acknowledgment.

Implementation entry points: [browser bridge](../src/app/useMcpBridge.ts), [activity state](../src/app/mcpActivity.ts), [location geometry](../src/app/canvasAiPresenceState.ts), [overlay](../src/app/CanvasAiPresence.tsx), [mini](../src/app/CanvasAiMini.tsx), [settings](../src/app/useAiMiniSettings.ts), [companion](../server/bridge.ts) and [tools](../server/tools.ts). The [user guide](AI_MINI.md) describes controls and limits.

## Validation record

The October 20 preview passed its production build, 83 MCP tests, focused component checks and twelve isolated production browser scenarios. Those checks motivated the October 21 review of interrupted activity, settings synchronization and drag/double-click behavior.

The final October 21 checks passed:

| Check                                                   | Result                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Application regression                                  | **1,276/1,276 tests**, 97 test files                            |
| Local MCP protocol                                      | **86/86 tests**                                                 |
| Isolated production browser                             | **13/13 scenarios**, zero page errors or foreign asset requests |
| TypeScript, lint, formatting, docs and production build | Passed                                                          |

Focused tests are included in these totals. The first full application run passed 1,275 tests and failed one appearance test whose mock shared a single listener between color-scheme and reduced-motion queries. The fixture now models separate queries and multiple listeners; its focused rerun and the complete regression pass. No production behavior was changed for that fixture correction.

Generated reports, screenshots and installation manifests remain outside source control; they contain local paths and are not public test fixtures. The sanitized guide screenshot is included separately.

The production build passes application/companion TypeScript checks and the existing inventory of 232 resolved license records. No dependency or paid API was added. The existing large-chunk and upstream Zod comment-annotation warnings remain; they do not prevent the build.

| Production artifact                  | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `dist/index.html`                    | `497B3FA7F4D94013146641AF842AE08DA09F20F4CBA8A5D7DB36DDD8640AEEE7` |
| `dist-mcp/server.mjs`                | `098701B0ACD93A748644B398476C0914B4EFC023B09C3BF9E7CC87BAB4BD5408` |
| Unchanged `launcher/LocalLibrary.cs` | `3F764027EDA73E212FA0EC8DEB827B4D3058A46D38B0DD31DFD8EC3E5BE3A47D` |

Relevant reproducible commands are `npm run lint`, `npm run format:check`, `npm run check:docs`, `npx --no-install vitest run --maxWorkers=2 --testTimeout=15000`, `npx --no-install vitest run --config vitest.mcp.config.ts --maxWorkers=1` and `npm run build`. Native storage suites are historical evidence from the preceding revision, not counted as new runs here; the production browser test compiles and exercises a disposable native host against the unchanged source.

## Browser procedure

The browser run builds a disposable native package and uses Chrome with fresh contexts and an authenticated local SDK client. It never attaches to the owner's browser, clipboard, actual library or installed site's origin. It checks:

1. Two explicit grants and sixteen discovered tools; unshared canvases remain unavailable.
2. Real targeted read geometry, color and matching character, without selection or camera changes.
3. Activity-only mini, panel double-click behavior and genuine queued-request/completion states.
4. Pan/zoom alignment, movement trails, deletion and shared Undo.
5. Hidden-object exclusion, workspace-scoped settings, offline Options preview and native preference persistence.
6. Custom character, reduced motion, marker expiry, independent grants and stop/file-switch cleanup.

To observe the brief queued state deterministically, the harness delivers an authentic server activity event and briefly delays the associated command's delivery before releasing the original command. The edit is applied and acknowledged normally. This controlled transport boundary is not evidence of model thinking time or real network latency.

## Remaining acceptance

These are local editor/protocol checks. External ChatGPT account/tunnel acceptance, a second physical Windows computer, school-device policy compatibility and practical large-board performance remain unverified. No paid model API, new MCP tool, additional filesystem authority or multiplayer capability was introduced. This update is a source revision and USB installation, not a tagged public binary release.
