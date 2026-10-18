# Canvas Live: project case study

## Problem and intended user

Visual planning often spreads across diagrams, notes, files and AI conversations. Canvas Live explores whether a local workspace can let a student organize ideas manually and allow an external AI client to make constrained edits to the same board.

The initial target is one person on a Windows laptop with local storage and a portable USB workflow. A required hosted model API or cloud database would complicate that use case, so the editor works independently and the model comes from a compatible external client.

## What was built

The implementation uses React and TypeScript for the workspace, an original SVG renderer, validated JSON documents, and a shared operations/history layer. The workspace adds project organization, physical file saving and recovery, layers, relationships, text controls and media embeds.

A separate Node MCP companion provides 15 tools for the canvas explicitly shared by its browser user. C# launchers serve the packaged website and manage the companion with bundled Node. The native package retains saved library data and binary assets beside the executable.

The [timeline](TIMELINE.md) connects increments to Git commits. The [roadmap](ROADMAP.md) records remaining acceptance criteria.

## Decisions worth examining

### One operations layer for manual and AI edits

Pointer interactions and MCP commands reach the same validation and transformation rules. This reduces the chance that an AI edit bypasses layer locks, document validation or history. Stable IDs let relationships follow objects rather than depend on screen coordinates alone.

The cost is implementing the custom editor's own gestures, geometry, text layout and accessibility. An earlier drawing-engine evaluation remains historical context rather than a dependency blocking the current SVG implementation.

### Separate content conflicts from camera movement

Pan and zoom change the viewport, but ordinary AI content edits should not fail merely because the person navigated. The revision model separates content changes from camera changes while preserving checks for actual conflicting edits. Undo/Redo retain stricter history expectations.

This is a limited conflict model for one shared canvas. It does not implement real-time multiplayer or automatically merge simultaneous document edits.

### An edit needs a browser acknowledgment

The companion waits for the browser to apply and acknowledge an operation. Operation IDs and replay handling protect retries, and related operations can be atomic. Tests cover stale revisions, interruptions, repeated requests and manual interleaving.

These controls make a local round trip testable. An external ChatGPT account and its transport still need separate acceptance.

### Keep persistence and authority separate

Logical workspaces, canvas content, physical file handles, media blobs and credentials have different lifetimes. They are not embedded in one export. Native writes use optimistic record revisions; draft recovery protects unsaved work; media is stored separately from library JSON.

Sharing grants access to one canvas. Switching files or stopping sharing revokes the session. MCP does not expose arbitrary filesystem, shell or browser access, and does not save edits automatically.

## Verification and its limits

Verification combines operation/schema tests, UI component tests, real SDK protocol tests, native Windows checks and isolated Chrome scenarios. Browser checks inspect rendered output and gestures; component tests alone do not establish visual correctness.

The October 18 interaction record reports 1,041 application tests, 64 MCP tests and 13 browser scenarios. These are dated executions, not a coverage percentage or a production-readiness claim. Additional native runs overlap with earlier app suites and are listed separately in [testing](TESTING.md).

The current owner's ChatGPT workflow awaits tunnel runtime-key setup and a successful call through that account. Another physical PC, school restrictions, large-board performance and broader assistive-technology behavior remain open.

## Development process and AI assistance

This project was vibe coded with OpenAI Codex. The student owner supplies the idea, requirements, interaction annotations, priorities and acceptance feedback. Codex assists with implementation, debugging, tests and documentation. This project makes that assistance explicit.

Iterations followed concrete interactions: a failed save, awkward selection, camera conflict, confusing connection or unclear destination became a bounded change and verification target. Git preserves actual delivery dates; the timeline does not convert a request date into an implementation date.

The engineering lesson is to separate a proposal, implemented code, a passing local check and a verified user workflow. They offer different evidence. Advertising tools locally does not establish that a remote account can call them.

## Next evaluation

The next acceptance target is a real ChatGPT read/edit/Undo workflow with the private tunnel healthy. Then test the saved USB package on a second permitted Windows computer and record startup, save/reopen, credential renewal and device-policy results. Those outcomes determine the next hardening work rather than an invented release date.
