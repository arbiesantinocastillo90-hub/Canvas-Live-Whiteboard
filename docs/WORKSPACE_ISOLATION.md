# Workspace contents and independent appearance

Updated 2026-10-17.

A workspace contains the projects and canvases created or imported while it is
selected. A newly created workspace starts empty. Creating one does not copy the
current workspace's projects, canvases, open tabs or card customizations. Its
initial interface preferences can follow the workspace it was created from.

## Add and open content

Select a workspace card to open that workspace's Home. Cards show their own
colors and local background image or GIF, making workspaces easier to recognize.
Use Home's Projects or Canvas perspective to browse only its contents.

Create a project or import a `.CLP` to add a project and its included canvases to
the selected workspace. A `.CLP` import receives fresh project and file
identifiers, so importing the same archive elsewhere creates a separate copy.
Create a canvas inside a project, or import a `.CLF`. If the selected workspace
has no project, importing a valid standalone canvas creates an **Imported
canvases** container. Cancelling file selection leaves the workspace empty.

The centered **Work** button opens the most recently modified canvas in the
selected workspace, considering available local drafts as well as saved files.
If no canvas exists, it opens an available project or leaves Home visible.
Switching workspaces does not save an unfinished drawing or grant access to a
physical file; retained drafts remain protected separately.

## Keep card styles independent

Workspace identity, title typography, tagline, description, background and
colors belong to the selected workspace. Project and canvas card overrides also
belong to that workspace: icon, accent, fill, outline and description.

If two workspaces reference the same project or canvas, changing its card style
in one leaves the other workspace's style unchanged. The underlying document's
imported presentation stays available as the default wherever there is no local
override. These appearance controls do not duplicate a drawing or change its
objects. Exporting `.CLF` or `.CLP` includes the appearance visible in the active
workspace; a later import can use it as its own starting presentation.

## Existing libraries and backups

Existing workspaces already saved in the local installation receive their
previously visible projects once if they have no explicit membership. This
preserves access to work created before workspace membership was introduced.
New workspaces use an explicit empty membership list, so projects created in one
do not automatically appear in another.

Importing an older `.CLW` without membership starts an empty workspace with its
saved settings; it does not adopt the installation's entire library. A `.CLW`
with explicit membership retains its valid local project references. Referenced
documents must also be present in the local library.

A `.CLW` stores project identifiers and presentation overrides alongside the
workspace's preferences, layout and editor context. It does not embed document
contents, background bytes, credentials or physical file grants. Back up `.CLF`
and `.CLP` files for document contents. For the installed app's complete local
library and backgrounds, back up the whole `data/` directory, including
`data/appearance/`.

See [File formats](FILE_FORMATS.md),
[Workspace and item appearance](WORKSPACE_PERSONALIZATION.md), and
[Workspace navigation](WORKSPACE_REVISION.md).
