# Workspace navigation and appearance

## Home

Use **Projects** beside the workspace name to browse project cards. Open a card
to see that project's canvases; its name appears as the heading while it is open.
**Back to projects** returns to the workspace library.

Use **Canvas** to browse canvases across the workspace. The sidebar changes to
**Recent canvases** and **All canvases**. In Projects, it shows **Recent projects**,
**All projects**, and a separate collapsible **Project hierarchy** section.
The previous Recent files shortcut is replaced by these perspective controls.

The main **Project hierarchy** button switches project cards to an expandable
tree. Click it again to return to cards. Expanding or collapsing a branch changes
the view, not the saved parent relationships. Search filters the current library;
**Order** offers recently opened, last modified, date created, and name. Project
modification ordering also considers saved canvases in its descendant projects.
Canvas cards show a simplified thumbnail of visible shapes, text and connections
for recognition; opening the file shows its complete contents.

## Workspaces

The labeled **Workspaces** navigation opens the workspace library. Choose
**Recent workspaces** or **All workspaces**; the latter includes an Order control
for recently opened, created, modified, or name.

**Create/Add Workspaces** in the upper-right opens the management panel for
creating, renaming, importing and exporting a `.CLW` workspace. Click outside or
press Escape to close it. Workspace cards show their own colors and local image
or GIF. Selecting a workspace opens its Home with its own contents, preferences
and appearance. Its editor context remains available when entering Work.

A new workspace starts with no projects or canvases. Create or import them while
that workspace is selected to add them there. Existing workspaces retain their
previously visible library during the one-time membership migration. Importing
an older `.CLW` without membership starts empty with its saved settings. A `.CLW`
stores membership references and UI state; back up the actual documents
separately with `.CLF` or `.CLP`. See [Workspace contents](WORKSPACE_ISOLATION.md).

## Canvas panels

The editor ribbon has one **Open left panel** control. **Files**, **Projects** and
**Workspaces** are tabs inside that panel rather than three repeated ribbon
buttons. The editor's previous Work ribbon button is removed. The outer page
has a larger, centered **Work** button that opens the most recently modified
canvas in the selected workspace, including available local drafts. If there is
no canvas yet, it opens an available project or remains on Home.

Unpinned panels float above the canvas with rounded corners, a border and a gap
around their outside edges. The gaps reveal the canvas behind them. Pinning a
panel reserves space beside the canvas instead of covering its working area.
The board and grid continue through the visible gaps around panels and through
empty tab/status-strip areas. This visual continuation follows the same camera;
drawing and selection stay on the central canvas. The right control rail aligns
eight pixels below the workspace-deck top, aligned with pinned panel tops. Use the pin button or double-click a panel tab
to change pinning; close the panel with its X. The right panel keeps Tools,
Properties and AI together. See [Canvas gutters and controls](CANVAS_GUTTERS.md).

The ribbon's **+** opens a choice of **New project** or **New canvas**. A canvas
needs an active project; create a project first if that choice is unavailable.
Command-palette and file-switcher shortcuts remain available even though the
outer command-palette button has been removed. Hover icon controls for their
labels; the brand's Live text follows the workspace accent.

## Saving and notifications

The tab-strip clock opens **Save options** for the current destination,
**Save now**, **Choose location**, and an autosave interval from 0.5 to 3600
seconds. The separate New canvas, Rename canvas, Save and Save as toolbar icons
have been removed; commands and shortcuts remain available. A moved or deleted
physical destination stops automatic writes and keeps the draft until a new
location is explicitly chosen. See [Save options](SAVE_OPTIONS.md).

Repeated notifications update one history row. Remove a row with its X, or use
**Remind me later** for 5, 10, 20 or 30 minutes, or 1 or 2 hours. These reminders
last for the current app session. Ctrl/Cmd-drag duplicates an object or selection;
copy/paste accepts Windows line endings. See
[Notifications and copying](NOTIFICATIONS_AND_COPYING.md).

## Personalization and precise editing

Use Home's **Customize workspace** control or **Options → Workspace appearance**
for the workspace icon, title typography, description, tagline and background.
Local images and animated GIFs up to 20 MiB can sit beneath a separate gradient
overlay. Each workspace remembers its own choices. Canvas and project cards have
**Customize canvas** and **Customize project** controls for their icon, accent,
fill, outline and description. These overrides belong to the selected workspace;
another workspace can present the same document differently. Exports include
the active workspace's appearance in `.CLF` and `.CLP` data. See [Workspace and item appearance](WORKSPACE_PERSONALIZATION.md).

**Options → Canvas controls** contains the marquee's fill opacity and outline,
selection containment rules, snap-to-grid settings, optional rulers and zoom
display. Selected objects keep individual outlines inside the group marquee.
Choose ruler units in pixels, millimeters, centimeters or inches, and show zoom
as a percentage, multiplier or ratio. See [Canvas precision controls](CANVAS_PRECISION.md)
for snapping gestures and the document-unit definition.

Keep the complete installed application folder together. Back up its full
`data/` directory, including `data/appearance/`, as well as portable document and
project exports. A workspace archive or copied view link contains only background
image references; it does not embed the image bytes. See
[File formats](FILE_FORMATS.md) and [Live links and the local library](LIVE_LINKS_AND_LIBRARY.md).
