# Architecture

## Implemented foundation

`src/main.tsx` mounts a React app under StrictMode. `src/app/App.tsx` renders the workspace preview. The preview is stateless and clearly states that board editing and saving are not available. CSS uses system fonts and local shapes.

Vite serves the app on loopback. Vitest uses the same React plugin with a jsdom test environment. TypeScript checks application and configuration code; Oxlint and Prettier provide code/format checks. `scripts/check-licenses.mjs` generates an inventory from the resolved dependency lockfile and flags unknown/unaccepted license metadata.

There is no canvas-engine integration, document storage, MCP service or communication bridge yet.

## Implemented Windows launcher

`launcher/CanvasLiveLauncher.cs` is a small Windows GUI executable built with the laptop's .NET Framework compiler. `scripts/package-windows.ps1` places it beside the production website under `release/Canvas Live/app`. It uses its own executable location, so the complete folder can be moved and launched from another working directory. The runtime is supplied by Windows; no Node.js process or new third-party runtime is packaged.

The launcher hosts an exact whitelist of packaged static files through a loopback-only TCP listener, then asks Windows to open the local URL in the default browser. It supports GET/HEAD, validates Host and paths, bounds headers and simultaneous connections, and provides a read-only instance health endpoint. A per-user, per-folder mutex and health check make repeated launches reopen the existing instance. A Windows tray menu provides Open and Close actions. Its endpoint/error files live under `%LOCALAPPDATA%/Canvas Live/launchers/<package-key>`.

The preferred port is 4173; an occupied port selects an available loopback port. Future browser persistence must account for the different origin when a port changes. The launcher has no board mutation, filesystem browsing, shell execution or MCP endpoint. A later authenticated bridge must be designed and tested separately. Implementation details and executed checks are in [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md).

## Later architecture under evaluation

The browser will own the active document and editor history. Shared validated operations will serve manual controls and AI requests. A local companion will provide a narrow authenticated bridge to the active board; MCP handlers will forward bounded requests and wait for acknowledged results. Stale document/session revisions and ambiguous active tabs must be rejected.

ChatGPT requires a reachable MCP transport and verified account eligibility. The local development server is not that endpoint. No application component should require paid model inference or a cloud database.

The later architecture remains a proposal until the relevant milestones implement and test it. See PROJECT_SPEC.md and the initial inspection for its security and consistency requirements.
