# MCP integration verification — 2026-10-10

## Implemented behavior

Canvas Live now includes a separate loopback MCP companion and an explicit Share action in Workspace AI. A compatible client can inspect the currently shared LCANVAS file and use 15 bounded tools to create, update, move, resize, connect and delete objects; manage layers; apply an atomic batch; and use the editor's Undo/Redo. The browser applies validated operations through its existing history and acknowledges the result before a tool reports success. AI changes remain unsaved until Save.

Sharing grants access to one open file, including unsaved content. Stop sharing, changing files, leaving Work and pagehide revoke the session. Closing the AI panel keeps the same file shared. The visible sharing indicator remains in fullscreen. Pairing credentials stay in browser memory; companion credentials are generated under the ignored `.canvas-live/` folder and regenerated at startup. No shell, filesystem, model API, general browser or automatic save tool is exposed.

The companion uses the official TypeScript MCP SDK with Streamable HTTP. Browser pairing and MCP access use separate credentials. Exact Host/origin checks, authenticated requests, body/rate limits, session/revision checks and explicit operation identifiers bound authority. An atomic batch permits at most 25 operations and at most 10 cumulative object deletions. The companion serializes edits, retains retry outcomes for the session and never transfers a queued edit to another file. A session permits 128 logical write operations before re-sharing is required.

## Executed checks

The full `npm.cmd run check` passed types, lint with no warnings, formatting, **273 application tests**, **23 real SDK protocol tests**, the **232-package** permissive license metadata gate, notice generation and both production builds. An initial run with default test concurrency exceeded the five-second timeout in two existing UI cases. Limiting application tests to two workers resolved those failures; all cases passed on the rerun. Tests ran from a physical C: mirror because D: worker startup had previously timed out without executing assertions.

A final memory improvement releases document snapshots from the browser's retry cache once their acknowledgment is confirmed. All **15 focused hook tests** passed, including a new regression verifying that a confirmed replay preserves its outcome and newer manual edits without applying the edit twice. Types, lint, formatting and production builds passed after this change. The current application suite contains 274 tests; 273 ran in the full gate and the affected 15, including the additional case, ran after the final change. `npm.cmd audit --audit-level=moderate` reported **0 vulnerabilities**.

The protocol suite exercises official SDK tool discovery and HTTP round trips, reads, every editing family, atomic batches, shared Undo/Redo, stale revisions, locked layers, retries without duplicate edits, conflicting reuse of an operation identifier, concurrent writes, timeout/late acknowledgment, manual edits between application and acknowledgment, single-tab ownership, revocation and authentication/Host/origin/method/body restrictions.

**15 isolated Chrome scenarios** passed against the development website and bundled companion. They verified visible shapes, text, an area and attached arrow connection; manual Undo and MCP Redo; move/resize/text updates; search; layer visibility/locking; exact retries; stale manual revisions; Save/export/reload; rejection of a second tab; Stop sharing/file-switch revocation; and no automatic sharing after reload. Desktop and 760/320-pixel screenshots were recorded. Browser checks used isolated storage and did not alter the user's projects.

The tunnel helper passed **23 local fixture checks** for repository/package paths, custom local port, header environment references, environment restoration, failure handling and invalid input. The fixture does not establish a network tunnel. Plugin manifests and the repository marketplace were parsed and checked against OpenAI's documented format.

The Windows folder was rebuilt with the final website and optional companion. All **24 launcher checks** passed again. The packaged website and its packaged companion passed **16 isolated Chrome scenarios** at port 4173, adding a fullscreen sharing/session check to the earlier 15. The application reported no browser runtime errors. Desktop, fullscreen and 760/320-pixel screenshots were inspected. Reports are retained under ignored `test-results/`.

The final companion suite passed **48 tests**: 23 SDK/bridge checks plus 25 native-origin discovery cases. Discovery accepts only the live launcher registered for the same packaged folder, with a 256-byte endpoint limit, 128-byte health limit and 750 ms total deadline. Wrong identities, absent package markers, invalid/nonlocal URLs, closed launchers, redirects and oversized responses fail closed. Final companion types and lint passed, and it was rebundled.

A real native fallback check copied the entire release to a temporary folder with spaces, started its native website while port 4173 was occupied, and started the bundled companion from that relocated folder without `node_modules`. The website selected `127.0.0.1:49906`; the companion recognized that exact native origin. All **4 setup checks** and **16 actual Chrome/MCP scenarios** passed again, including reaching the pairing button at 760/320 pixels. Only the fixture's processes were stopped afterward. The native fallback setup and browser reports are retained under `test-results/mcp-native-fallback-*.json`.

The optional full Windows OpenAI tunnel client **v0.0.16** was downloaded into `test-results/tunnel-client/v0.0.16/full-client/`. Published archive/SPDX/license checksums, Sigstore provenance for the official release workflow, the embedded SPDX sidecar and all six extracted payload hashes were verified. Apache 2.0 license and notices were retained. Version and command help checks confirmed the helper's required flags. No key was read and no tunnel was started. Its local `verification-report.json` records provenance and the exact executable path.

## Changed source and artifacts

- `src/mcp/`: validated transport-independent commands, read helpers, atomic batches and bridge protocol types.
- `server/`: authenticated loopback HTTP companion, sharing/revision/retry coordinator and MCP tool registration.
- `src/app/`: editor controller, sharing lifecycle, Workspace AI and visible sharing status, with UI regressions.
- `tests/mcp/`: actual SDK protocol and boundary checks; application command/controller/hook checks live beside their source.
- `scripts/`, `launcher/`, `plugins/` and `.agents/plugins/`: bundled companion build, optional Windows startup, tunnel helper and local plugin package.
- Dependency/configuration files and setup, architecture, licensing, decisions, roadmap and verification documents.

## Remaining acceptance and limits

**An actual ChatGPT account connection has not been verified.** The owner confirmed that ChatGPT's custom MCP form offers both Server URL and Tunnel. ChatGPT web still needs a tunnel associated with the intended workspace and a locally configured runtime key. The optional desktop package also needs installation and credential entry in its target client. Follow [CHATGPT_MCP.md](CHATGPT_MCP.md) and record actual ChatGPT tool calls and observed browser effects before calling that connection complete.

Reads reflect the latest browser-published snapshot and can lag a manual change by the polling interval. Writes are checked again in the browser. Suspended/background tabs can lose their five-second sharing lease; re-share on return. Only one browser tab owns the companion at a time. Undo/Redo can reverse the most recent manual or AI action. Restarting the companion regenerates credentials and requires pairing again.

The companion is an optional Node.js 24 process. The native website executable continues to run independently. No public endpoint, tunnel, ChatGPT account installation or recurring paid service was created by these checks. Default-browser opening and the tray's graceful Close action require separate UI observation; launcher tests use their existing headless mode.
