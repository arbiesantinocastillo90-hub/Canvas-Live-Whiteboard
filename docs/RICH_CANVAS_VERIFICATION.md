# Rich canvas and portable MCP verification

Verified October 18, 2026 against the combined production build.

## Results

- Application: 982 tests passed, no failures or pending tests.
- MCP protocol: 64 tests passed.
- Native owned media: 53 checks passed.
- Portable MCP launcher: 24 checks passed.
- Production browser: 20 scenarios passed with no page errors; 19 screenshots retained.
- TypeScript, repository lint, formatting, production build and license checks passed. No new npm dependencies; 232 resolved packages reviewed.

The production index SHA-256 is
`cdaa99385b13c258bd4c076a8ae1c4b306e38f5406768740c4087b8541b3a1b2`.
Machine-readable reports and screenshots are retained with the project update.

## Canvas coverage

Tests cover new shapes and text formatting, bounded schema validation, legacy
LCANVAS import, clipboard/selection compatibility, connection paths/pointers,
fixed sides, reversal and Undo. Browser scenarios exercise the source-side
handle with left/right target drops, the transparent bottom resize strip,
quick text formatting at 1003 and 600 pixels, right Properties, multiple-object
painting and Undo, insertion at a clicked world position, relationship
save/export/reload, and object snapping with guides.

Hierarchy checks cover the file-visibility checkbox, correct workspace ownership
and opening a canvas. An older native workspace without the new checkbox field
also loads correctly. Strict parsing still rejects an explicitly malformed
checkbox value.

Owned GIF, WebM, WAV and PDF uploads are tested in disposable Chrome profiles.
Pausing/minimizing removes the player or iframe; media time is retained during
the editor session. A real synthetic WebM recording supplies playback metadata
and seeking coverage. Website frames are sandboxed, and static backdrops do not
load live embeds. Missing media and paused placeholders remain distinct.
Deferred local uploads cannot insert after their panel unmounts.

## Portable companion coverage

The isolated launcher checks run with an unrelated working directory and no
global Node on PATH. They cover a moved portable folder and USB-root entry,
multiple independent folders, dynamically assigned loopback ports, repeated
clicks, ordinary stop and crash cleanup of only the owned Node child.

Native discovery is restricted to the app's origin and dedicated request
header. It returns the browser pairing credential, never the separate MCP bearer
token. The bundled Windows x64 Node 24.15.0 executable is checked against the
official release SHA-256 and its valid OpenJS Authenticode signature; the full
Node license and provenance are included. Existing data or private configuration
blocks a destructive full-package rebuild; the installed update copies public
artifacts in place instead.

MCP tests verify authenticated reads and edits through the shared-canvas bridge,
including client-reported implementation names. The AI panel hides project,
canvas and client context before sharing and provides automatic local discovery
with manual pairing available as a fallback.

## Installation and limits

The public-artifact installer validates the checked build and source hashes,
preserves data/private files/configuration and prior hashed assets, keeps public
rollback artifacts, and verifies the served entry point and asset bytes. Browser
tabs and the system clipboard are not used by QA or forcibly refreshed.

This is a portable Windows x64 app and companion. Running it does not supply an
AI model or automatically connect an external account. ChatGPT and other cloud
clients still need their supported secure tunnel/HTTPS setup and approval. No
owner account write or real external AI collaboration session is claimed by
these isolated tests.

Some websites or document providers prohibit framing or require their own
authentication. Native Office editing is not included. Local media references
travel with the portable `data/media/` directory, not as embedded bytes in
`.CLF`/`.CLP`. Upload validation checks supported format signatures; it does not
guarantee that every possible media encoding can play on every browser.

See [Rich canvas controls](RICH_CANVAS.md) and [Portable MCP](PORTABLE_MCP.md).
