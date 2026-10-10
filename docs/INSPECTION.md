# Canvas Live — initial inspection

Inspection date: 2026-10-09 (America/Chicago).

## Scope and source coverage

The requested first task is project inspection and a reviewable Milestone 0–1 plan. This change adds documentation only; it does not select an engine permanently, install application dependencies, start servers, configure an AI account, or publish a network endpoint.

Sources read: the complete pasted specification and agent instructions; the local planning canvas's structured text and links; the entire existing repository README; current official engine/MCP/OpenAI documentation; npm package metadata; and the published Excalidraw 0.18.1 archive and selected type declarations. Linked private ChatGPT project conversations were not read. This report does not imply access to them.

- Project brain: `D:\Canvas Live` (empty at initial inspection; specification and this report now saved there).
- Checkout: `D:\Canvas OS\Canvas Live (Project)\Canvas-Live-Whiteboard`.
- Remote: `https://github.com/arbiesantinocastillo90-hub/Canvas-Live-Whiteboard.git`.
- Original planning canvas: `D:\Canvas OS\Canvas Live (Project)\Canvas Live Workspace 1.canvas` (preserved).
- Initial AI client: **ChatGPT**, explicitly selected by the owner.

The older planning canvas proposes an AI panel and multi-user collaboration. The supplied specification puts integrated paid-model chat and collaboration outside the initial MVP. Follow the supplied specification; the old time estimates and feature list are historical planning context, not verified delivery commitments.

## What exists and what is missing

GitHub access initially failed without authentication. A later noninteractive `git ls-remote` and clone succeeded. The repository's `main` branch originally contained only `README.md`, at commit `f04a35ae3edcf51241e06915b2c8e05e4e547ee9` (Initial commit). The fresh checkout was clean before these documentation additions.

Missing: application scaffold, package manifest/lockfile, canvas integration, local persistence, operations layer, MCP service, browser bridge, tests, build scripts, license inventory, and a project license decision. Nothing in the README proves a working application or collaboration service.

The checkout resides on a filesystem where Git reports ownership cannot be recorded. Scoped commands below use `-c safe.directory=...` for this exact checkout. No wildcard trust exception was added.

## Environment verified

| Item | Observed result |
| --- | --- |
| OS | Windows 11 Pro, 64-bit, version 10.0.26200 |
| Git | 2.53.0.windows.3 |
| Node.js | v24.19.0 |
| npm | 11.19.0 via `npm.cmd` |
| Installed memory reported by Windows | Approximately 11.4 GiB; retain the specification's 8 GB target for performance testing |
| GitHub CLI | `gh` not found on current PATH |
| GitHub read access | Noninteractive remote read and clone succeeded |
| Git author | No configured `user.name` or `user.email`; `git var GIT_AUTHOR_IDENT` failed with "Author identity unknown" |

An earlier invocation could not resolve npm; later invocations resolved both npm launchers. Prefer `npm.cmd` in PowerShell to avoid script execution-policy surprises. No Node/npm reinstall is currently indicated. Browser/test-runner availability and resource use remain to be checked with the scaffold.

## Package candidates, not adopted dependencies

Registry metadata was queried; no package manifest or lockfile has been created.

| Package | Observed version | Declared code license | Relevant compatibility |
| --- | --- | --- | --- |
| `@excalidraw/excalidraw` | 0.18.1 | MIT | React 17.0.2, 18.2, or 19 ranges supported |
| `react` | 19.3.0 | MIT | React DOM must be verified and pinned with React |
| `vite` | 8.3.4 | MIT | Node ^20.19.0 or >=22.12.0 |
| `typescript` | 7.0.2 | Apache-2.0 | Build/plugin compatibility still untested |
| `vitest` | 5.0.3 | MIT | Node ^22.12.0, ^24.0.0, or >=26.0.0 |
| `@playwright/test` | 1.64.0 | Apache-2.0 | Node >=20 |
| `@modelcontextprotocol/server` | 2.3.1 | Apache-2.0 | Node >=20 |
| `@modelcontextprotocol/client` | 2.3.1 | Apache-2.0 | Node >=20 |

The observed Node version satisfies these declared engine ranges. That is a metadata check, not proof that this combination builds or runs. Recheck versions at implementation, inspect compatibility and license notices, pin exact versions, and commit the lockfile.

The official MCP SDK now identifies the split v2 server/client packages as the stable line; `@modelcontextprotocol/sdk` 1.32.1 is the maintained legacy v1 line. Use version-matched documentation and types; do not mix v1 import examples with v2 packages. [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Excalidraw evaluation: conditional candidate

The tagged 0.18.1 code license is MIT. This clears the engine's code license only. [Tagged license](https://github.com/excalidraw/excalidraw/blob/v0.18.1/LICENSE)

Programmatic integration is documented and supported by the published types:

- Embed the React component and obtain its imperative API.
- Create supported elements with `convertToExcalidrawElements`; conversion defaults to regenerating identifiers. Preserve supplied stable identifiers deliberately with `regenerateIds: false`. The conversion API is marked beta. [Element conversion](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)
- Use `updateScene` for visible mutations and inspect scene elements through the API. `captureUpdate: IMMEDIATELY` captures observed changes for history; `EVENTUALLY` defers capture, and `NEVER` excludes capture. Unobserved app state is excluded regardless. [Imperative API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)
- Public imperative `history` exposes `clear()` only; published types do not expose direct `undo()`/`redo()` methods. Test native editor undo and redo separately from future MCP-callable history tools.
- Restoration and serialization are exported. The 0.18.1 published serializer signature uses `serializeAsJSON(elements, appState, files, "local" | "database")`; do not copy abbreviated current documentation signatures into version-pinned code without checking types. [Restore utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/restore), [Tagged serialization implementation](https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/data/json.ts)

### Asset/license gate

The archive bundles Assistant, Cascadia, ComicShanns, Excalifont, Liberation, Lilita, Nunito, Virgil, and Xiaolai fonts. Excalifont's exact tagged source includes SIL Open Font License 1.1 terms. Virgil and Cascadia upstream notices also use OFL. MIT package metadata does not cover these separate font licenses. [Tagged Excalifont source](https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/fonts/Excalifont/index.ts), [Virgil license](https://github.com/excalidraw/virgil/blob/main/LICENSE.md), [Cascadia license](https://github.com/microsoft/cascadia-code/blob/main/LICENSE)

OFL permits redistribution subject to font-specific conditions, including notices and retaining the font license. It needs explicit policy review under this specification's strict permissive-only rule. Options: accept OFL specifically for fonts while preserving its conditions, or investigate a supported compatible font replacement. Replacing the engine is not yet justified by this finding.

No standalone archive filenames matching LICENSE/OFL/NOTICE were found. This does not establish that font binaries lack embedded notices. Other font families, icons, embedded libraries and transitive dependencies remain unaudited. Build a complete notice inventory from the resolved lockfile and shipped assets before distribution.

**Engine proof of concept has not run.** Creation, text/arrow binding, movement, serialization round-trip, identifier preservation and mixed manual/programmatic undo remain runtime acceptance tests. Engine adoption is pending that proof and the license gate.

## Proposed MCP/browser architecture

Keep the browser as the active document and history authority. Both UI commands and validated MCP requests should use the same operations layer. A local Node companion hosts a narrow authenticated HTTP/WebSocket bridge; MCP handlers forward bounded requests to the connected browser and respond only after the browser acknowledges the applied result.

For ChatGPT, provide Streamable HTTP `/mcp` on loopback for local testing and a separately configured reachable transport when account eligibility is verified. Stdio remains a possible transport for local compatible clients and protocol tests. The browser bridge is separate from MCP transport.

Each request should carry a document/session identifier, request identifier and expected revision. Allow one explicitly active board initially; reject ambiguous tabs and stale revisions, deduplicate retries, apply bounded timeouts, and return `BOARD_NOT_CONNECTED` instead of mutating an invisible fallback board. Reconnection should re-establish authority and revision before processing writes.

Security checks planned: loopback binding, Host and Origin validation, scoped session authentication, active-document authorization, message-size/operation limits, rate limiting, timeouts, and secret-free logs. Do not use the development server as a public endpoint. This is a proposal, not an implemented security control.

## ChatGPT: documented support versus verified access

Official developer documentation describes adding a custom MCP server through ChatGPT Plugins, with HTTPS or Secure MCP Tunnel connection options, then testing advertised schemas, authentication, tool calls and results. Account/workspace policies apply. [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)

ChatGPT cannot directly reach this laptop's loopback service. Secure MCP Tunnel offers an outbound bridge for a private stdio or HTTP MCP server. It requires a `tunnel_id`, runtime API key, tunnel permissions, and association with the intended ChatGPT workspace. Tunnel access and ChatGPT custom MCP access are separate permissions. A tunnel credential does not itself require implementing paid model inference inside this app; tunnel cost/availability is not established by this inspection. [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

A current Help Center page describes plan-specific developer-mode and read/write restrictions, while newer developer pages describe plugins without a complete plan matrix. Treat those as eligibility checks to resolve against the actual account, not evidence that ChatGPT Free or any other particular plan supports this workflow. [Developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)

Verified here: documentation and local development prerequisites. Not verified: the owner's ChatGPT plan, workspace permissions, write-tool eligibility, tunnel access/cost, actual client connectivity, or AI edits appearing on a live board. No tunnel, public endpoint, AI-client connection, or API key was configured. Client-side approval requirements may also prevent an approval-free write workflow; application-side authorization cannot override client policy.

A direct SDK test client/MCP Inspector can verify protocol behavior without a model API. Local Codex supports stdio and Streamable HTTP as a future diagnostic client, but the selected product target remains ChatGPT. [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)

## Reviewable Milestone 0–1 plan

1. **Milestone 0:** confirm Git author/project license; create a minimal React/TypeScript/Vite scaffold, lint/format scripts and Vitest smoke test; verify installation, loopback startup, tests and production build. Resolve actual dependency compatibility and generate the pinned lockfile/license inventory. Add `docs/ROADMAP.md`, `docs/DECISIONS.md`, and `docs/TESTING.md` when implementation begins.
2. **Milestone 1:** after resolving the font policy, embed Excalidraw in a small engine adapter proof of concept. Create two labelled shapes and a bound arrow; move/resize/edit them by stable ID; serialize and restore with files; verify IDs, labels, arrow endpoints and native undo/redo after mixed manual/AI-style edits. Use browser tests for these observable outcomes. Record engine findings in `docs/ENGINE_EVALUATION.md` and `docs/LICENSES.md`.
3. Do not add persistence, the full tool catalog, collaboration or paid model adapters to this proof. Freeze the engine choice only after the proof passes. Implement the operations layer and bridge in their later milestones.

Milestone 0 exits only when installation, startup, initial tests and production build actually succeed. Milestone 1 exits only when the engine/license gate and documented runtime proof succeed. Neither milestone is complete today.

## Exact commands and next files

Already executed: Git/Node/npm version checks; noninteractive remote read and clone; Git status/remote/log inspection; Windows environment queries; npm metadata queries for the candidates above; `npm.cmd pack @excalidraw/excalidraw@0.18.1` into a temporary inspection folder; archive/type/license inspection. No dependency installation, runtime application test or production build has run, because the repository has no application.

To review this local change in PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Canvas OS\Canvas Live (Project)\Canvas-Live-Whiteboard'
git -c safe.directory='D:/Canvas OS/Canvas Live (Project)/Canvas-Live-Whiteboard' status --short --branch
git -c safe.directory='D:/Canvas OS/Canvas Live (Project)/Canvas-Live-Whiteboard' diff -- README.md
Get-Content -LiteralPath '.\docs\INSPECTION.md'
```

First implementation command after plan review (verify this scaffolder's version/license before running):

```powershell
npm.cmd view create-vite version license engines --json
```

Generate the scaffold in a temporary directory and copy only reviewed missing files into this checkout, preserving the specification, instructions and README. Verify/pin dependencies in `package.json` before installing. Once scripts exist, the intended validation commands are:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1
```

These commands are not runnable acceptance checks today: their manifest, lockfile and scripts are still to be created. Initial lockfile generation will use `npm.cmd install`, then `npm.cmd ci` checks reproducibility.

## Decisions and remaining blockers

- Review the Milestone 0–1 proposal before substantial architectural implementation, as requested in PROJECT_SPEC section 20.
- The supplied specification states: "Wait for review before making large architectural changes." This documentation is the result to review; application implementation has not begun.
- Resolve whether SIL OFL 1.1 is accepted specifically for bundled fonts or whether a supported replacement is needed. This is a concrete license gate, not a general warning about open-source software.
- Choose the project's own permissive license and configure a Git author before committing. No identity or license was invented.
- Verify the owner's ChatGPT account can add and invoke write-enabled custom MCP tools. Choose a secure reachable transport only once its access and costs are known.
- Resolve public API limits for agent-callable undo/redo in the runtime proof; do not promise undocumented methods.

Recommended next task: implement Milestone 0, then the bounded Milestone 1 engine proof after the font-policy decision. ChatGPT eligibility can be checked independently; do not represent successful MCP protocol tests as successful ChatGPT integration.
