# Workspace isolation verification

Verified October 17, 2026 against the combined production sources. This report
supplements the earlier workspace revision report.

## Behavior covered

New workspaces start empty. Projects and canvases created or imported there stay
in that workspace. Existing local workspaces retain their earlier visible
projects through a one-time migration; newly imported legacy `.CLW` settings do
not adopt the entire library. Explicit `.CLW` membership remains supported.

Workspace cards use their own palette and cached background. Selecting one
opens Home. Work chooses the most recently modified owned canvas, including
retained local drafts. Project and canvas card overrides remain independent
even when old workspaces reference the same underlying document. Saving through
an override preserves the canonical drawing presentation and revision guards.

Delayed project imports retain their initiating workspace and merge with the
latest project catalog. Switching workspaces during a canvas appearance read
cannot open a stale customization dialog. Draft recovery records an initialized
workspace/project even when its recovery list is empty, so explicitly cleared
legacy drafts do not return after reopening.

## Automated and native checks

The final application suite passed 898 tests with no failures or skipped tests;
the MCP companion passed 63 tests. Results are retained in
`isolation-final-app.json` and `isolation-final-mcp.json` with the update evidence.

The native local-library suite passed 55 checks. These include exact 20 MiB GIF
storage, rejected oversized or invalid uploads, hash and path validation,
independent asset/document writes, small polling responses, ETags and migration
of previous JSON image records. Original source/configuration hashes and the
previous website host were preserved during that isolated test.

A separate real Chrome IndexedDB run passed 13 recovery checks: upgrading an
existing version-one database preserves drafts, initialized empty lists survive
reopening, migration happens once, and another workspace retains access to its
first legacy migration.

TypeScript, repository lint, formatting, production bundling and license checks
pass. The license inventory covers 232 resolved packages, with no new
dependencies. Vite retains its existing large-bundle and dependency annotation
warnings.

## Browser acceptance

The production website is exercised from a separate native package and
disposable Chrome profiles using synthetic projects, files and images. The
report records the checked index hash and native executable hash. All 23 browser
scenarios passed, with no page errors and 17 screenshots retained. The checked
index SHA-256 is
`0dfec306c70baae5945b6fb6625875ae17bd9b42b77a799b5dce092d7df3fdbc`.

Checks cover workspace membership, empty creation, standalone and project
imports, independent file/project appearance, Home selection, latest-modified
Work navigation, cached GIF cards and fresh-profile background reads. The canvas
continues through panel perimeter gaps at 1003 and 600 pixels in normal and
swapped layouts; focus mode and the raised view rail are checked separately.

Save options exposes destination, Save now and interval selection while the
removed top actions remain absent. Synthetic clipboard events cover Windows
line endings. Ctrl-drag duplicates multiple selected objects with a single Undo.
Notification checks cover repeated-message reuse, row dismissal and all six
reminder intervals. Additional recovery and delayed-import checks exercise the
actual production UI.

Owner browser profiles, the system clipboard, physical file grants and open
drawings are not used by this harness. Browser screenshots and machine-readable
reports are retained with the update evidence.

## Installation and practical limits

The update copies only public application artifacts and guides, keeping a
recoverable copy of the prior executable and entry point. Library data, private
configuration and previous hashed assets are preserved. Protected files are
hashed before and after copying; the installed entry point and assets are
checked over HTTP. Existing browser tabs are not forcibly reloaded.

Notification reminders run within the open app session. Physical save picker
and removed-file branches are tested with controlled handles; this revision
does not request a new grant to an owner's real file. Background exports retain
image references rather than embedding image bytes in `.CLW`; moving to another
installation requires the background file or a full `data/` backup. The test
GIF validates storage, decoding and caching, not a measured frame-rate guarantee
for every 20 MiB animation.

See [Workspace contents](WORKSPACE_ISOLATION.md),
[Save options](SAVE_OPTIONS.md),
[Notifications and copying](NOTIFICATIONS_AND_COPYING.md), and
[Canvas gutters](CANVAS_GUTTERS.md).
