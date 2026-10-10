# Live Canvas Whiteboard

## Master Project Specification for AI Coding Agents

**Project type:** Interactive, AI-operable whiteboard web application\
**Primary developer environment:** Windows 11 laptop\
**Primary coding agent:** OpenAI Codex\
**Primary integration protocol:** Model Context Protocol (MCP)\
**Initial AI interaction:** External AI client controlling the whiteboard\
**Cost objective:** No separate paid model API required by the application\
**Architecture:** Modular, local-first, provider-independent\
**Licensing policy:** Open-source components with permissive licenses only\
**Development strategy:** Single user + AI first; multi-user collaboration later

---

# 1. Project Mission

Build a modern, interactive, infinite-canvas whiteboard that allows a human user and an external AI assistant to work on the same canvas.

The user should be able to draw, write, organize information, create diagrams, connect ideas, and manipulate visual objects manually. An AI assistant connected through MCP should be able to inspect the board and perform authorized operations on it.

The intended user experience is:

1. The user opens the Live Canvas Whiteboard.

2. The user connects a compatible AI client.

3. The user gives the AI an instruction through that AI client's normal interface.

4. The AI client invokes the application's MCP tools.

5. The application validates and applies the requested operations.

6. The changes appear on the open canvas immediately.

7. The user can continue editing the result manually or request further AI modifications.


Example:

User tells the AI client:

"Create a project roadmap with five milestones, arrange them from left to right, and connect them with arrows."

The AI client should be able to inspect the current board, create the milestone objects, arrange them, draw the connections, and report the result.

The application must not require its own paid model API integration for this workflow. The AI model is supplied by an external compatible client.

Important limitation: MCP does not itself supply a model or guarantee compatibility with ChatGPT Free. The exact client, plan, connection transport, and account capabilities must be verified independently.

# 2. Product Vision

The product should combine the simplicity of a visual whiteboard with the precision of structured, AI-assisted editing.

It should support:

- Freeform drawing and visual thinking.

- Flowcharts and process diagrams.

- Project roadmaps.

- Mind maps and concept maps.

- System architecture diagrams.

- Planning boards.

- Notes and text organization.

- AI-assisted editing and arrangement.

- Persistent documents that survive browser restarts.

- Export and import of supported board formats.

- Future multi-user collaboration.


The application should be useful even when no AI client is connected.

# 3. Product Principles

## 3.1 AI-provider independence

Do not tightly couple the whiteboard to OpenAI, Anthropic, or another model provider.

The application must not require an OpenAI API key for its core functionality or MCP integration.

Do not implement a paid model API adapter unless explicitly authorized by the project owner.

## 3.2 MCP-first AI integration

Expose canvas functionality through a clearly defined, validated operations layer.

MCP tools must call the same application operations used by the UI wherever practical. Do not duplicate canvas business logic inside MCP handlers.

## 3.3 Local-first operation

The application should run locally during development and should not require a cloud database or paid hosting service for its initial functionality.

Persist user documents locally. Clearly communicate any data that leaves the device.

## 3.4 Open-source and permissive licensing

Only select dependencies whose exact licenses are compatible with the project's permissive-license requirement.

Preferred licenses include:

- MIT

- BSD-2-Clause

- BSD-3-Clause

- Apache-2.0

- ISC


Do not assume that a project is permissively licensed merely because its source code is public.

Review the core engine, direct dependencies, transitive dependencies where practical, fonts, icons, and other redistributed assets.

Flag any dependency with an incompatible, unclear, proprietary, or copyleft license for review before adoption.

## 3.5 Direct AI manipulation

The intended interaction mode is direct manipulation: after an authorized AI tool call is validated, the canvas updates without requiring the user to approve every ordinary operation individually.

Safety controls must still apply to destructive or unusually broad operations.

## 3.6 Incremental development

Build and test one milestone at a time. Do not attempt to implement the entire application in one unreviewed code-generation pass.

# 4. Target Users and Operating Environment

Initial target user: one person using a Windows 11 laptop.

Initial constraints:

- 8 GB RAM.

- Integrated graphics.

- No dedicated GPU requirement.

- No assumption of a paid AI API.

- No assumption of a paid database or hosting service.

- GitHub for source control.

- Codex or another coding agent for development.


The initial application should run in a modern desktop browser.

Keep memory usage reasonable. Avoid requiring a locally hosted AI model for the primary architecture.

# 5. Technology and Engine Strategy

## 5.1 Proposed stack

Evaluate and select a stable combination of:

- React

- TypeScript

- Vite

- Excalidraw as the initial canvas-engine candidate

- Node.js

- Official TypeScript MCP SDK

- IndexedDB for local document persistence, where appropriate

- Vitest for unit tests

- React Testing Library for component tests

- Playwright for browser-level end-to-end tests


Use current stable, mutually compatible releases when implementation begins. Pin dependencies and commit the package lockfile.

Do not upgrade major dependencies without checking compatibility.

## 5.2 Canvas engine evaluation

Excalidraw is the preferred initial candidate, not an unconditional requirement.

Before committing to it, investigate:

1. Exact license of the intended version.

2. Licensing of dependencies and redistributed assets.

3. Embedding and customization capabilities.

4. Programmatic creation and modification of elements.

5. Stable element identifiers.

6. Support for arrows, text, shapes, and grouping.

7. Undo/redo integration.

8. Serialization and document restoration.

9. Ability to synchronize external operations with the visible canvas.

10. Maintenance status and compatibility with the proposed stack.


Create a small technical proof of concept before building the entire application around the engine.

If the engine cannot support reliable programmatic manipulation, document the limitation and compare permissively licensed alternatives before replacing it.

Do not fork the engine unless necessary and approved.

# 6. High-Level Architecture

Separate the application into the following logical components.

## 6.1 Canvas UI

Responsible for:

- Displaying the canvas.

- Rendering and selecting objects.

- Zooming and panning.

- Manual drawing and editing.

- Toolbars and contextual controls.

- Displaying operation results and errors.

- Showing AI connection status.

- Undo and redo.

- Saving and restoring documents.


## 6.2 Document and Canvas Operations Layer

This is the central application interface for modifying board state.

Implement validated operations such as:

- `get_canvas_state`

- `get_shape`

- `search_canvas`

- `create_shape`

- `update_shape`

- `move_shape`

- `resize_shape`

- `connect_shapes`

- `delete_shape`

- `arrange_canvas`

- `undo_operation`

- `redo_operation`

- `export_canvas`


The precise operation names may change after engine evaluation, but each operation must have a documented contract.

Operations must validate input, enforce permissions, return structured results, and preserve document consistency.

## 6.3 MCP Server

Responsible for:

- Advertising supported MCP tools.

- Validating tool arguments.

- Calling the shared Canvas Operations Layer.

- Returning structured success or error responses.

- Enforcing operation limits.

- Applying access-control policies.

- Logging relevant actions without recording unnecessary sensitive content.


The MCP server must not expose arbitrary shell execution, general filesystem access, or unrestricted browser control.

## 6.4 Communication Bridge

An MCP server process and a browser application do not automatically share memory.

Design an explicit bridge between the server and the active whiteboard.

Investigate the following options:

- An MCP server that hosts a local HTTP/WebSocket bridge.

- A local companion process with a narrowly scoped browser connection.

- Another transport supported by the selected MCP client and application architecture.


For a local client, stdio may be suitable for MCP communication. The browser may require a separate local bridge.

For a remote-hosted MCP client, a locally running server may not be directly reachable. A suitable network-accessible transport or explicitly configured secure tunnel may be required.

Do not expose the development server or local bridge to the public internet by default.

## 6.5 Persistence Layer

Responsible for:

- Saving the current document.

- Loading existing documents.

- Maintaining document metadata.

- Tracking document versions where practical.

- Recovering from failed writes.

- Importing and exporting supported formats.


Use browser-local persistence for the initial version.

Keep the persistence interface independent of the canvas engine where feasible.

# 7. MCP Tool Specifications

Implement a small initial tool set before expanding the interface.

## 7.1 Read tools

### `get_canvas_state`

Returns a bounded, structured representation of the active document.

Include relevant object identifiers, object types, positions, dimensions, text, styles, and relationships.

Avoid returning unnecessary internal engine data.

For large documents, support filtering, pagination, or scoped reads.

### `get_shape`

Returns the current supported properties of one object identified by its stable identifier.

### `search_canvas`

Searches text and other explicitly supported object metadata.

The tool must operate only on the active document or an explicitly authorized document.

## 7.2 Write tools

### `create_shape`

Creates a supported object, such as a rectangle, ellipse, diamond, text item, or other engine-supported element.

Validate:

- Object type.

- Text length.

- Position and dimensions.

- Style properties.

- Document limits.

- Identifier generation.


### `update_shape`

Changes approved properties of an existing object.

Reject unsupported properties rather than passing arbitrary data into the canvas engine.

### `move_shape`

Moves an existing object to a validated position.

### `resize_shape`

Resizes an object within supported dimension limits.

### `connect_shapes`

Creates a connection between two existing objects.

Validate both identifiers and prevent invalid references.

### `delete_shape`

Deletes a specified object and handles associated relationships consistently.

### `arrange_canvas`

Applies an approved layout to a bounded selection of objects.

Do not allow unbounded bulk changes.

## 7.3 Tool design requirements

Every tool must have:

- A descriptive name.

- A clear description for AI clients.

- A validated input schema.

- A structured output schema where supported.

- A consistent error format.

- Explicit permission requirements.

- Unit tests.

- Documented side effects.


Write operations should return the affected object identifiers and a concise description of the change.

Prefer stable identifiers over array indices.

# 8. Direct-Control and Undo/Redo Requirements

The normal AI workflow should not require individual approval for every ordinary operation.

After an authorized operation succeeds, the canvas must update immediately.

Implement the following safeguards:

- Reject malformed tool arguments.

- Enforce per-operation and per-request object limits.

- Reject operations against unknown identifiers.

- Prevent operations from accessing unrelated documents.

- Group related AI edits into coherent undoable transactions where the engine supports it.

- Provide a reliable recovery path for failed operations.

- Require explicit confirmation for unusually destructive actions, such as clearing an entire document.

- Make AI changes distinguishable in the operation history where practical.


Undo/redo must remain consistent with manual editing and programmatic editing.

Do not claim that an operation is reversible until the engine's behavior has been verified.

# 9. Security and Privacy

Security is a core requirement, not a later optional feature.

## 9.1 Least privilege

The MCP server may access only the canvas operations explicitly implemented and authorized.

It must not expose the user's general filesystem, terminal, browser history, passwords, or unrelated applications.

## 9.2 Local connection security

For a local bridge:

- Bind to loopback interfaces only by default.

- Authenticate browser-to-server requests using an appropriately scoped session token.

- Validate request origin and connection state.

- Restrict accepted methods and message sizes.

- Apply timeouts and rate limits.

- Reject unexpected network origins.

- Avoid logging secrets or unnecessary document contents.


Do not assume that loopback binding alone provides complete security.

## 9.3 External AI privacy

When a cloud-based AI client receives canvas data, that data may be sent to the AI provider.

The application must not claim that data stays on the device unless that has been verified for the complete integration path.

Send only the information needed for each request.

## 9.4 Destructive operations

Normal create, move, edit, connect, and bounded delete operations may run directly when authorized.

Require confirmation for operations that exceed defined destructive-operation thresholds.

# 10. User Interface Requirements

The initial interface should contain:

1. Main canvas.

2. Drawing and selection toolbar.

3. Document title.

4. Save status.

5. Undo and redo controls.

6. Export and import actions.

7. AI connection indicator.

8. MCP connection and diagnostic information.

9. Clear operation error messages.


Do not require a built-in AI chat panel for the first release. The intended AI interaction occurs in the external client.

The UI must distinguish between:

- AI client not connected.

- MCP server unavailable.

- Connected but unauthorized.

- Connected and ready.

- Operation running.

- Operation completed.

- Operation rejected or failed.


The board must remain fully usable when the AI client is disconnected.

# 11. Document and Data Model

Define a versioned document model that supports:

- Document identifier.

- Document title.

- Schema version.

- Canvas elements.

- Relationships and connections.

- Relevant supported metadata.

- Creation and modification timestamps.

- Optional operation history.


Prefer the canvas engine's supported serialization format where appropriate.

Avoid coupling application logic directly to undocumented engine internals.

Validate imported files before loading them.

Support schema migrations when the document format changes.

# 12. Major Development Areas

## Area A — Repository and Development Environment

Deliverables:

- GitHub repository.

- Project documentation.

- Node.js and package-manager verification.

- React/TypeScript/Vite application scaffold.

- Formatting and linting.

- Test infrastructure.

- Build and development scripts.


## Area B — Canvas Engine Integration

Deliverables:

- Engine evaluation report.

- License review.

- Working embedded canvas.

- Manual drawing and selection.

- Zoom and pan.

- Undo and redo.

- Serialization proof of concept.


## Area C — Document Operations and Persistence

Deliverables:

- Shared Canvas Operations Layer.

- Stable identifiers.

- Validated mutation operations.

- Local document persistence.

- Import and export.

- Operation-level tests.


## Area D — MCP Integration

Deliverables:

- MCP server.

- Initial read tools.

- Initial write tools.

- Tool schemas and documentation.

- Error handling.

- MCP protocol tests.

- Verified client connectivity.


## Area E — Live Canvas Synchronization

Deliverables:

- Explicit communication bridge.

- Browser-to-server message handling.

- Immediate canvas updates.

- Connection status.

- Reconnection behavior.

- Concurrency and stale-state protection.


## Area F — AI-Controlled Workflows

Deliverables:

- AI-readable canvas summaries.

- Multi-step diagram creation.

- Object arrangement.

- Relationship creation.

- Error recovery.

- Undoable AI operations.

- Safe bulk operations.


## Area G — Reliability, Security, and Testing

Deliverables:

- Unit tests.

- Integration tests.

- End-to-end tests.

- Bridge security tests.

- Malformed-input tests.

- Persistence recovery tests.

- Large-document performance checks.


## Area H — Release and Future Extensibility

Deliverables:

- Installation and startup documentation.

- License inventory.

- User guide.

- Troubleshooting guide.

- Release checklist.

- Documented extension interfaces.


Multi-user collaboration, cloud synchronization, and an integrated model API are outside the initial MVP unless separately approved.

# 13. Milestone Plan

## Milestone 0 — Project Setup

- Inspect the repository and current environment.

- Verify Git, Node.js, npm, and the selected coding environment.

- Create or inspect the project scaffold.

- Establish documentation and test scripts.

- Record all decisions.


Exit criteria: the project installs, starts, builds, and runs its initial tests.

## Milestone 1 — Engine Evaluation

- Evaluate Excalidraw and its integration requirements.

- Verify licensing.

- Test programmatic object creation and modification.

- Test serialization and restoration.

- Test undo/redo with programmatic changes.


Exit criteria: the chosen engine passes a documented proof of concept.

## Milestone 2 — Usable Whiteboard

- Implement the main canvas UI.

- Add essential drawing and editing.

- Add document persistence.

- Add import and export.


Exit criteria: the user can create, save, reopen, and edit a board without AI.

## Milestone 3 — Operations Layer

- Implement validated canvas operations.

- Add stable object identifiers.

- Test error handling and document consistency.

- Add undoable operation transactions where feasible.


Exit criteria: application operations work reliably without MCP.

## Milestone 4 — MCP Server

- Integrate the official TypeScript MCP SDK.

- Implement initial read and write tools.

- Add schema validation and error responses.

- Test using a compatible MCP test client.


Exit criteria: the test client can read and modify a controlled canvas through MCP.

## Milestone 5 — Live Synchronization

- Implement the browser/server bridge.

- Verify immediate updates.

- Handle stale state, failed operations, and reconnection.

- Apply security restrictions.


Exit criteria: valid MCP operations update the correct active canvas reliably.

## Milestone 6 — AI Workflow Validation

- Select a compatible AI client.

- Verify its current MCP support and plan requirements.

- Test multi-step canvas editing.

- Test failure handling and undo.

- Confirm whether the desired workflow works without a separate paid model API.


Exit criteria: a supported AI client can create and modify a diagram through MCP.

## Milestone 7 — MVP Hardening

- Complete tests.

- Review dependencies and licenses.

- Fix critical defects.

- Improve documentation.

- Verify startup and recovery.


Exit criteria: a reproducible, documented MVP works on the target Windows environment.

## Milestone 8 — Future Collaboration

Only after the MVP is stable, evaluate:

- Multi-user sessions.

- Shared document synchronization.

- Conflict resolution.

- Authentication and access control.

- Real-time collaboration protocols.


Do not implement these features prematurely.

# 14. Testing Requirements

At minimum, test the following.

## Unit tests

- Tool argument validation.

- Shape creation.

- Shape modification.

- Connection creation.

- Deletion and relationship cleanup.

- Object identifier handling.

- Document serialization.

- Import validation.

- Permission enforcement.


## Integration tests

- MCP request to operations layer.

- Operations layer to canvas state.

- Canvas updates reflected in the UI.

- Persistence after reload.

- Undo and redo following AI edits.

- Bridge disconnection and recovery.


## End-to-end tests

1. Launch the app.

2. Create a board manually.

3. Save and reopen it.

4. Connect an MCP test client.

5. Read the board state.

6. Create several objects.

7. Connect the objects.

8. Modify their positions.

9. Verify the visible result.

10. Undo or recover from a supported failed/destructive operation.


Tests must be runnable using documented repository commands.

Do not report tests as passing unless they were actually executed.

# 15. Repository Structure

Use a simple structure initially. Adapt it only when there is a concrete technical reason.

```
live-canvas-whiteboard/
├── AGENTS.md
├── PROJECT_SPEC.md
├── README.md
├── LICENSE
├── package.json
├── package-lock.json
├── docs/
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── LICENSES.md
│   ├── TESTING.md
│   └── MCP_TOOLS.md
├── src/
│   ├── app/
│   ├── canvas/
│   ├── operations/
│   ├── documents/
│   └── ui/
├── mcp-server/
│   ├── src/
│   └── tests/
└── tests/
    ├── integration/
    └── e2e/
```

Do not create unnecessary modules or packages before they are needed.

If the MCP server needs to run as a separate process, use an appropriate workspace or package structure and document its startup procedure.

# 16. Coding-Agent Operating Rules

The coding agent must follow these rules.

1. Read `PROJECT_SPEC.md` and `AGENTS.md` before making changes.

2. Inspect the existing repository before creating or overwriting files.

3. Never assume the repository is empty.

4. Preserve existing work unless changes are necessary and documented.

5. Implement one milestone or a small, coherent task at a time.

6. Explain the implementation plan before substantial architectural changes.

7. Verify package names, versions, APIs, and licenses before relying on them.

8. Do not invent SDK methods or assume undocumented engine behavior.

9. Run relevant tests after every meaningful change.

10. Run a production build before declaring a milestone complete.

11. Report test failures honestly.

12. Document important decisions and unresolved risks.

13. Keep dependencies minimal.

14. Do not introduce paid API requirements without explicit approval.

15. Do not add cloud services when a local solution satisfies the requirements.

16. Do not implement unrelated features or prematurely add multi-user collaboration.

17. Never store API keys, session tokens, or other secrets in source control.

18. Never claim direct ChatGPT integration works until tested against a supported client and configuration.


# 17. Git and Change Management

Use Git for all meaningful project changes.

Recommended workflow:

- Make a small, focused change.

- Run tests.

- Review the diff.

- Commit a coherent milestone or task.

- Record any architectural decisions.

- Push to GitHub when the user has configured repository access.


Do not automatically push or publish secrets, private data, or unreviewed generated files.

Ask before performing destructive repository operations or replacing substantial existing work.

# 18. MVP Acceptance Criteria

The MVP is complete only when all of the following are true:

- The application runs on Windows 11 using documented steps.

- The user can draw, edit, select, and arrange canvas objects.

- Documents can be saved and restored.

- Import and export work for the supported formats.

- Canvas operations have stable identifiers and validation.

- An MCP server exposes documented read and write tools.

- A compatible MCP client can read the canvas and perform edits.

- Successful AI operations update the open canvas immediately.

- Invalid operations are rejected safely.

- Undo/redo behavior is tested for supported operations.

- The application works without an AI client connected.

- No separate paid model API is required by the app's implementation.

- The actual AI-client integration and its plan requirements are documented.

- License and dependency reviews are recorded.

- Tests and production build have been executed successfully.


# 19. Explicitly Out of Scope for the Initial MVP

Do not implement these without separate approval:

- Built-in GPT or Claude chat powered by a paid API.

- Mandatory cloud storage.

- Mandatory user accounts.

- Multi-user real-time collaboration.

- Public hosting or remote access by default.

- General-purpose filesystem tools for the AI.

- Arbitrary shell execution.

- AI model training.

- Complex plugin marketplace.

- Mobile-specific interface redesign.


# 20. First Task for the Coding Agent

Begin with repository and environment inspection.

Do not immediately generate the entire application.

Perform the following:

1. Inspect the current repository, Git status, and existing documentation.

2. Determine whether Git, Node.js, npm, and the required development tools are available.

3. Identify missing setup steps for Windows 11.

4. Review the proposed architecture and flag assumptions that require verification.

5. Evaluate the current Excalidraw candidate and its licensing.

6. Identify the most practical way to connect an MCP server to the running browser application.

7. Identify which AI clients can connect through that architecture, distinguishing verified support from assumptions.

8. Produce a short implementation plan for Milestone 0 and Milestone 1.

9. List blockers, risks, and decisions requiring user approval.


After the inspection, report:

- What already exists.

- What is missing.

- What was verified.

- What remains uncertain.

- Which files should be created or changed first.

- The exact commands required for the next step.


Wait for review before making large architectural changes.

The objective is to build a reliable, extensible, permissively licensed whiteboard that external AI clients can control through MCP, without making a paid model API a mandatory application dependency.
