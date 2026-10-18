# Workspace interaction verification

Checked on October 18, 2026. The application changes were prepared in an isolated staging copy before updating the USB installation. The owner's browser session and clipboard were not used for testing.

## Automated checks

- Application suite: **1,041 / 1,041 tests passed**, 177 suites, no failures or pending tests. This includes the final area, destination, layer, panel, workspace isolation, local file, sharing, and rich-canvas tests.
- MCP protocol suite: **64 / 64 tests passed**.
- Additional focused vertical-panel run: **37 / 37 tests passed**. These cases are also present in the full application suite.
- TypeScript checking, lint with warnings denied, and repository formatting checks passed.
- Production build passed. License review checked 232 resolved packages with no unreviewed licenses. Existing bundle-size and dependency comment warnings remain.

Commands used were `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, the complete application Vitest run with two workers, and the MCP configuration with one worker. Focused test runs covered each implementation before integration.

## Build identity

An isolated native package with disposable Chrome contexts passed **13 / 13 browser scenarios** with no page errors. These exercised area clicks at three zoom levels, both marquee modes, Escape and computed tab borders, real HTML layer/object drags with Undo, multi-object properties, both panel edges on both sides in floating/pinned layouts, viewport shrink and persisted restoration, project context actions, explicit destinations and cancellation.

The additional MCP scenario starts a real isolated companion, rejects an AI-client token in the browser pairing field, pairs using the discovered dynamic port, initializes a protocol client, reads and edits a disposable canvas, verifies browser Undo, verifies Stop sharing, and reconnects automatically. Five installed-service checks also passed without reading or sharing the owner's canvas. A connection to the owner's external AI account has not been verified.

The resulting screenshots were inspected for the layer hierarchy and vertically resized panels.

- JavaScript: `index-DIwZDPE0.js`
- Stylesheet: `index-Bn_899jJ.css`
- Raw production index SHA256: `912A4A7EE3C148FEC1F491E9200344D4C24BAA5BE251327F993275837738CBA5`

The native launcher injects its local-storage metadata into the served index, so the served index has a separate hash. The installation report verifies both the injected index and the referenced asset bytes.

## Scope and compatibility

New destinations are parent projects within the active Canvas Live workspace. They do not change physical canvas save locations. Projects currently do not store linked computer folders, so their **Open file location** menu item is disabled with an explanation.

This followup updates frontend assets and interaction documentation. It preserves the existing native launcher, portable MCP executable/runtime, configuration, library data, media, and older hashed browser assets. The earlier rich-canvas/native verification remains recorded in [Rich canvas verification](RICH_CANVAS_VERIFICATION.md).

The reproducible reports and screenshots are retained with the project update evidence. See [Workspace interactions](WORKSPACE_INTERACTIONS.md) for the user controls.
