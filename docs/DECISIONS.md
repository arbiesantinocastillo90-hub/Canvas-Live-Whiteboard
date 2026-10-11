# Development decisions

## 2026-10-09 — Milestone 0

- The owner authorized initiation of the inspection plan and supplied the Git author name/email. Identity is configured in this checkout only. Work is on `codex/milestone-0`.
- Use MIT for original project code under the specification's permissive-license requirement. Third-party licenses and notices remain separate.
- Use the official `create-vite@9.2.1` React/TypeScript template as the scaffold reference. Preserve the project documentation and replace template demo assets with an honest non-editable workspace preview.
- Pin direct dependencies exactly and retain `package-lock.json`. Use the compatible TypeScript 6.0.3 template line; do not adopt TypeScript 7 merely because it is the newest version.
- Normalize tracked text to LF with `.gitattributes`, so Windows Git line-ending settings do not cause a fresh checkout to fail the formatting check.
- Use maintained Vite 7.3.7 and its compatible React plugin 5.2.0. The first resolved Vite 8.3.4 graph required MPL-2.0 Lightning CSS, which conflicts with the specification. Vite 7 makes that an optional peer; select PostCSS and esbuild for CSS processing and exclude Lightning CSS from the final resolved graph. Vitest 5.0.3 supports Vite 7 and remains pinned.
- Accept MIT-0 after inspecting both CSSTools packages' actual notices: it grants unrestricted use, modification and redistribution without an attribution condition. Keep the metadata gate conservative for other terms.
- Accept the exact `caniuse-lite@1.0.30001815` development data package under attribution-only CC-BY-4.0. Its inspected license allows commercial sharing and adaptation without share-alike terms. This is a scoped data-license review, not blanket acceptance for application code. Preserve attribution and its complete license in `docs/DATA_NOTICES.md`.
- Every production build runs the license gate and includes the original project license plus full runtime dependency notices in `dist/`, so distributing that folder preserves the required MIT texts.
- Use Oxlint, the current template's linter, with built-in React/TypeScript rules. Use Prettier for formatting and Vitest/React Testing Library with jsdom for the initial startup test. Additional interaction and browser test packages arrive when needed.
- Default dev/preview listeners bind to `127.0.0.1`, with strict ports to avoid opening an unintended service. No network bridge, public endpoint, cloud service or model API is introduced.
- Ignore `dist` and all its descendants explicitly in the development watcher. This resolved a verified Windows output-folder lock when building with the preview server active, without enabling higher-cost polling.
- Use system fonts and locally authored CSS decorations. No redistributed font/icon packages are installed. Excalidraw remains outside the scaffold until its font policy and runtime proof are resolved.
- Keep `docs/INSPECTION.md` as the historical initial inspection; these current decisions and roadmap supersede its resolved setup blockers. Copy current milestone findings to `D:\Canvas Live` after verification, without assuming automatic synchronization.

## 2026-10-09 — Requested Windows executable

- The owner requested an executable inside a folder that opens the website directly. Build a portable folder containing a small native launcher and the current production website.
- Use Windows' installed .NET Framework 4.8 runtime/compiler for the launcher. This avoids bundling Node.js or introducing another dependency. Original launcher code remains under the project's MIT license; the Microsoft runtime is not redistributed.
- Serve only packaged static files over loopback and open the URL through Windows' default browser handler. Keep this launcher separate from the future MCP bridge and canvas operations.
- Prefer port 4173 and fall back to an available local port when occupied. This is intentional for the packaged launcher; development and Vite preview retain strict ports. Revisit browser-origin stability when persistence is implemented.
- Retain prior package folders during rebuilds. Use staging, verified in-folder paths, same-directory renames and a final executable check. Explicitly ignore both `release` and `dist` directory roots/descendants in the Vite watcher to prevent the observed Windows packaging lock.
- Record the 24 executed integration checks and distinguish forced-process shutdown from the untested tray Close action. See [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md).

## 2026-10-09 — Themes and workspace navigation

- The owner requested customizable overall UI themes and Options, Projects/recent projects on the left, and Work reopening the latest project. Implement this bounded UI task ahead of the canvas controls and LCANVAS saving/import step; do not infer that canvas persistence is implemented.
- Use shared CSS variables for light/dark/system appearance, custom accent, spacing, motion and preview backgrounds. Keep original inline SVG controls and system fonts. No dependencies were added.
- Keep project IDs/names/recent-opening timestamps and appearance preferences in one validated, versioned browser metadata record. Write on user changes; failed storage keeps usable state in the current tab with an explicit message. File saving and cross-tab synchronization remain separate work.
- Use the owner's supplied logo PNG unchanged in the sidebar and favicon. Preserve the original bytes and verify their hash. The executable's existing Windows icon is unchanged in this task.
- Use a clean physical C: verification copy with the same lockfile and exact final source after D: test-worker startup timeouts. Record source equality and actual command results; do not present earlier startup failures as executed assertions.

## 2026-10-10 — LCANVAS viewing and project file containers

- The owner requested many LCANVAS files per project and focused this step on viewing. Add a strict independent LCANVAS v1 JSON format and original SVG viewer, keeping the drawing-engine proof pending. No dependencies or paid services were added.
- Store files individually in IndexedDB, indexed and validated by project. Retain the existing v1 project/theme metadata without migration or replacement. Storage failures produce an explicitly labelled session overlay; LCANVAS export is the portable backup.
- Support blank creation, validated multi-file import, naming, tabs, a collapsible file explorer and workspace AI context. Closing a tab or panel never deletes files. The AI panel reports disconnected/unavailable state because there is no MCP service yet.
- Keep Undo view, Reset view, Redo view and zoom controls on the right rail independently of the AI panel. History applies to navigation only; drawing, object mutations and engine/agent undo remain future work. Viewport changes use explicit Save; new/imported files and names save immediately.
- Bound imports to 10 MiB, 5,000 supported objects, finite geometry and plain text; reject unknown fields/types/versions instead of losing unsupported data. No fixed file-count cap is imposed. Browser quota/device memory remain practical limits.
- Preserve browser-origin storage boundaries, including launcher fallback ports. Export/import transfers files between origins; the executable folder does not contain the browser library. Cross-tab conflict resolution and project-folder persistence are not implemented.

## 2026-10-10 — Requested manual editing and fullscreen

- The owner requested fullscreen for the active file, shapes and text, resizing, containing areas, explicit layers and configurable connections before live MCP integration. Extend the existing original SVG renderer and LCANVAS model for this authorized scope; adopt no new engine, fonts, dependencies or paid services.
- Introduce strict LCANVAS v2 with an explicit validated v1 migration. Keep IDs, geometry and viewport stable. Opening old stored files updates recency without rewriting their raw document payload; Save/export writes v2.
- Keep operations pure and transport independent. Validate the whole result and reject invalid geometry, missing references, containment violations or lock violations atomically. Use the same operations from canvas gestures and Properties.
- Record explicit area membership separately from layers. Areas move all members together; member movement outside an area detaches it. Hidden/locked area layers propagate visibility/edit restrictions to members. Connections derive endpoints from stable object IDs.
- Combine manual edits and navigation in one undo history, bounded to 100 retained snapshots and a 32 MiB estimated history budget. Commit completed drags once. History is session state, excluded from portable files.
- Keep explicit Save for content/view changes and export the current state. Retain only dirty drafts across section/project navigation and protect page unload from the app root, including while Options is open. Naming stores the current contents as well as the new name.
- Request native fullscreen when supported while keeping an in-app focus fallback. Hide surrounding navigation/files/tabs, fit the visible objects and preserve editing/Save/Export/exit controls. Guard against a native fullscreen request completing after Escape or unmount.
- Preserve the honest disconnected AI panel. A live authenticated bridge and actual ChatGPT MCP calls remain the next task; shared manual operations are preparation, not proof of connectivity.

## 2026-10-10 — ChatGPT MCP integration

- The owner requested ChatGPT MCP plugin integration and confirmed that the web custom MCP server option is visible. Implement the required local companion, browser bridge and prepared plugin/tunnel setup without exposing the development website or automatically changing account settings.
- Pin official TypeScript MCP SDK v2 and Zod after reviewing registry/API/license sources. Bundle a separate Node.js 24 companion; preserve the native Node-free website launcher. No model inference API is called, and no tunnel client or Node runtime is redistributed.
- Use distinct random credentials for browser pairing and MCP access. One explicit tab/file owns authority; switching files/leaving Work/Stop sharing ends it. A five-second heartbeat lease handles disconnected browsers. Only exact local Host/origins and bounded authenticated requests are accepted.
- Require current session/revision and an operation ID for all writes. The open editor validates again, commits to shared history and acknowledges; success is never inferred from queueing. Repeated identical operation IDs return their prior result; a timeout requires reading current state or retrying that same ID. Expired commands do not execute.
- Keep bounded reads (100 objects), batches (25 operations), cumulative deletes (10 objects), and 128 logical operations per sharing session. Larger destructive operations are unsupported. AI changes remain unsaved until Save. Undo/Redo affect the latest manual or AI action.
- Recognize a native launcher's fallback port only through the same packaged folder's registration and matching bounded health probe at companion startup. Keep exact origin checks; do not authorize arbitrary local ports. Open the website before its companion and restart the companion when the website address changes.
- Prepare OpenAI Secure MCP Tunnel with private local bearer injection for ChatGPT web, and a local desktop plugin manifest. The helper is manually invoked and keeps a dedicated runtime profile. Account/tunnel permissions, billing and actual ChatGPT calls remain unverified; local SDK/browser tests are not evidence of a connected ChatGPT account.

## 2026-10-11 — Camera navigation during MCP editing

- The owner reported rejected AI writes and later confirmed moving the canvas during the attempt. Idle editor and status rerenders did not change revisions in reproduction. Completed camera changes did invalidate queued writes, so address this specific conflict without removing content safeguards.
- Keep full public revisions and shared history. Track the last full revision at which content excluding the viewport changed on both browser and companion. Ordinary edits tolerate camera-only revisions and preserve the latest view. Undo/Redo require exact full revisions; active pointer gestures still block writes.
- After a content conflict, read again and use the new revision with a new operation identifier. Identical retries continue to return their original outcome. New browsers retain strict checks with older companions that omit the optional content stamp.
- Update the built app and companion together. Stage the local package update while the user's live services run; retain its private tunnel launchers, client and credential folder. Activating the update requires stopping those services and restarting the tunnel through its local hidden key prompt.

## 2026-10-11 — Adaptable workspace and keyboard governance

- Implement the owner's requested minimal, adjustable workspace on the existing React/SVG editor. Use collapsible panels, bounded resizers, a command palette and a current-project file switcher without adding dependencies or adopting another editor.
- Keep layout and shortcut persistence separate from LCANVAS content and MCP revisions. Properties and Workspace AI share one right-panel width; hiding AI does not revoke explicit sharing. Preserve full screen and dirty drafts.
- Register keyboard commands against the same UI handlers. Preserve text editing, dialogs, composition and fixed navigation keys; custom bindings suppress previous local defaults. Reject duplicate and protected browser combinations, and support storage failure within the current session.
- Extend existing preferences with contrast, optional interface colors and motion style/speed. Old metadata receives defaults. Explicit colors affect interface tokens rather than canvas objects. App and operating-system reduced-motion settings override animation.

## Remaining open decisions

- Whether SIL OFL 1.1 is acceptable specifically for engine fonts, or a supported replacement is needed.
- Whether the owner's ChatGPT account can invoke custom write tools, and which secure transport is available with acceptable cost.
- Whether future editor expansion warrants adopting a separate drawing engine.
