# Architecture

## Implemented foundation

`src/main.tsx` mounts a React app under StrictMode. `src/app/App.tsx` renders the workspace preview. The preview is stateless and clearly states that board editing and saving are not available. CSS uses system fonts and local shapes.

Vite serves the app on loopback. Vitest uses the same React plugin with a jsdom test environment. TypeScript checks application and configuration code; Oxlint and Prettier provide code/format checks. `scripts/check-licenses.mjs` generates an inventory from the resolved dependency lockfile and flags unknown/unaccepted license metadata.

There is no canvas-engine integration, document storage, MCP service or communication bridge yet.

## Later architecture under evaluation

The browser will own the active document and editor history. Shared validated operations will serve manual controls and AI requests. A local companion will provide a narrow authenticated bridge to the active board; MCP handlers will forward bounded requests and wait for acknowledged results. Stale document/session revisions and ambiguous active tabs must be rejected.

ChatGPT requires a reachable MCP transport and verified account eligibility. The local development server is not that endpoint. No application component should require paid model inference or a cloud database.

The later architecture remains a proposal until the relevant milestones implement and test it. See PROJECT_SPEC.md and the initial inspection for its security and consistency requirements.
