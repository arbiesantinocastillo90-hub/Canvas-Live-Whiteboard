# Architecture

## Implemented foundation

`src/main.tsx` mounts a React app under StrictMode. `src/app/App.tsx` controls Options, Projects and Work. `AppearanceOptions.tsx` controls the theme preferences, `ProjectDialog.tsx` handles project names, and `workspace.ts` validates and persists bounded project metadata/preferences in browser localStorage. CSS uses shared light/dark tokens, system fonts and original inline SVG controls. The owner-provided logo is a local unchanged PNG.

Vite serves the app on loopback. Vitest uses the same React plugin with a jsdom test environment. TypeScript checks application and configuration code; Oxlint and Prettier provide code/format checks. `scripts/check-licenses.mjs` generates an inventory from the resolved dependency lockfile and flags unknown/unaccepted license metadata.

`FileWorkspace.tsx` organizes project-scoped files, open tabs, name dialogs, import/export, explicit document saving and panel context. `lcanvas.ts` validates LCANVAS v2 and migrates valid v1 files in memory. `canvasFiles.ts` stores each record in IndexedDB with a project index and checks ownership on every read/write. Opening a v1 record updates its recency without rewriting its payload; Save writes v2. Failed storage retains a session overlay and reports the limitation. Existing localStorage v1 project/theme metadata is unchanged. Files have no arbitrary count cap; documents are bounded to 10 MiB, 5,000 elements and 100 layers. There is no cross-tab conflict resolution yet.

`CanvasEditor.tsx` renders original SVG geometry and literal text with pointer and keyboard editing. `CanvasInspector.tsx` applies properties and manages layers. Both use the pure validated `canvasOperations.ts` functions for stable-ID creation, updates, movement, resizing, deletion, containment and connections. Geometry and ordering helpers also serve the retained read-only viewer. `editorHistory.ts` combines content and viewport transactions with at most 100 retained snapshots and a 32 MiB history estimate; large documents retain fewer steps. The operations and history are independent of any MCP transport.

Closing tabs never deletes files. Content and view changes stay in memory until Save; export includes the current state. `canvasDrafts.ts` retains unsaved drafts through section/project navigation and protects page unload while the app remains open. Reopening a file starts new undo history. `useCanvasFocus.ts` hides surrounding layout, requests native fullscreen when available, fits the canvas and restores layout on exit; embedded browsers retain an app focus fallback. See [LCANVAS.md](LCANVAS.md) and [EDITOR.md](EDITOR.md).

No third-party drawing engine, MCP service or communication bridge has been adopted. The collapsible AI panel reports the current project/file and unavailable MCP service; it sends no document data. The requested manual editing step extends the existing renderer without new dependencies. Excalidraw licensing/runtime evaluation remains separate from this implemented editor.

## Implemented Windows launcher

`launcher/CanvasLiveLauncher.cs` is a small Windows GUI executable built with the laptop's .NET Framework compiler. `scripts/package-windows.ps1` places it beside the production website under `release/Canvas Live/app`. It uses its own executable location, so the complete folder can be moved and launched from another working directory. The runtime is supplied by Windows; no Node.js process or new third-party runtime is packaged.

The launcher hosts an exact whitelist of packaged static files through a loopback-only TCP listener, then asks Windows to open the local URL in the default browser. It supports GET/HEAD, validates Host and paths, bounds headers and simultaneous connections, and provides a read-only instance health endpoint. A per-user, per-folder mutex and health check make repeated launches reopen the existing instance. A Windows tray menu provides Open and Close actions. Its endpoint/error files live under `%LOCALAPPDATA%/Canvas Live/launchers/<package-key>`.

The preferred port is 4173; an occupied port selects an available loopback port. Browser metadata and IndexedDB files are scoped to that origin, including the port; a fallback port opens a separate file library. LCANVAS exports are portable backups. The launcher has no board mutation, filesystem browsing, shell execution or MCP endpoint. A later authenticated bridge must be designed and tested separately. Implementation details and executed checks are in [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md).

## Later architecture under evaluation

The browser already owns the active document, history and shared validated operations. A future local companion will provide a narrow authenticated bridge to the active board; MCP handlers will forward bounded requests to those operations and wait for acknowledged results. Stale document/session revisions and ambiguous active tabs must be rejected.

ChatGPT requires a reachable MCP transport and verified account eligibility. The local development server is not that endpoint. No application component should require paid model inference or a cloud database.

The later architecture remains a proposal until the relevant milestones implement and test it. See PROJECT_SPEC.md and the initial inspection for its security and consistency requirements.
