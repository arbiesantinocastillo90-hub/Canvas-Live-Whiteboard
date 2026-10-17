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
press Escape to close it. Selecting a workspace restores its own preferences,
appearance and saved navigation context. A `.CLW` stores references and UI state;
back up the actual documents separately with `.CLF` or `.CLP`.

## Canvas panels

The editor ribbon has one **Open left panel** control. **Files**, **Projects** and
**Workspaces** are tabs inside that panel rather than three repeated ribbon
buttons. The editor's previous Work ribbon button is removed. The outer page
has a larger, centered **Work** button to resume the current project when one is
available.

Unpinned panels float above the canvas with rounded corners, a border and a gap
around their outside edges. The gaps reveal the canvas behind them. Pinning a
panel reserves space beside the canvas instead of covering its working area.
Use the pin button or double-click a panel tab to change pinning; close the panel
with its X. The right panel keeps Tools, Properties and AI together.

The ribbon's **+** opens a choice of **New project** or **New canvas**. A canvas
needs an active project; create a project first if that choice is unavailable.
Command-palette and file-switcher shortcuts remain available even though the
outer command-palette button has been removed. Hover icon controls for their
labels; the brand's Live text follows the workspace accent.

## Personalization and precise editing

Use Home's **Customize workspace** control or **Options → Workspace appearance**
for the workspace icon, title typography, description, tagline and background.
Local images and animated GIFs can sit beneath a separate gradient overlay.
Each workspace remembers its own choices. Canvas and project cards have
**Customize canvas** and **Customize project** controls for their icon, accent,
fill, outline and description. These item decorations travel in `.CLF` and `.CLP`
exports. See [Workspace and item appearance](WORKSPACE_PERSONALIZATION.md).

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
