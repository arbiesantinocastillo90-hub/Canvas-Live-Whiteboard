# Workspace and item appearance

Workspace appearance belongs to the selected workspace. Its identity can have a
local font, independent title fill and outline, size and weight, a built-in vector
icon with fill and outline controls, a tagline, and a multiline description.
Font choices use installed system fonts; Canvas Live does not fetch fonts.

The Home background supports a color, an optional local PNG/JPEG/WebP/GIF up to
20 MiB, fit and position controls, image opacity, and an independently adjustable
gradient overlay. GIF bytes remain unchanged so browser animation is preserved.
Use Remove image to detach the image from this workspace, or Reset workspace
appearance to reset its presentation without changing any document contents.

Images are content-addressed by SHA-256. The installed Windows app keeps the
image in its local `data/appearance/` folder, separate from the frequently updated
`data/library.json`; a regular development browser uses its separate
`canvas-live.appearance` IndexedDB asset store. Preferences, workspace archives
and view links carry only the hash reference, never an image data URL. Consequently
a `.CLW` transferred to another device needs that device's image selected again.
An unavailable image falls back to the configured color and gradient. Canvas Live
does not fetch remote images. Uploads validate MIME types, signatures, size and
content hashes; SVG and oversized files are rejected. A failed upload leaves
the previous workspace reference unchanged. Once connected, a local-library
write failure is reported instead of being mistaken for a successful browser save.

Keep the complete installed application folder together and back up the entire
`data/` directory, including `data/appearance/` and the library files. Copying
only `library.json` does not include workspace backgrounds. Small document and
view saves do not rewrite image files, and regular library polling does not
download those images again. Native backgrounds use a fixed, content-addressed binary URL with immutable
browser caching, shared by Home, workspace cards and the options preview. Binary
uploads and reads use a separate asset lock, so large images do not block document
library polling. Native reads check the bounded file size and image header;
they reuse the cached image without hashing the full file on every request.
Earlier JSON assets are hash-checked and migrate on first use without changing
the workspace reference. Browser-only storage keeps Blob records and verifies
their hash when loaded; concurrent reads reuse the same object URL, with a bounded
cache that releases unused URLs.
Workspace cards show their own theme colors and background, and load offscreen
images only as their cards approach the viewport.

Canvas and project appearance supports a built-in icon, accent, card fill, card
outline and description. Each workspace stores its own overrides, so another
workspace can show the same document differently. These overrides leave the
underlying imported presentation unchanged. Exporting `.CLF` or `.CLP` includes
the active workspace's appearance, which can become an imported default elsewhere.
Automatic colors follow the workspace theme. Appearance changes leave canvas
objects and project hierarchies intact. Descriptions are plain text. See
[Workspace contents](WORKSPACE_ISOLATION.md).

The built-in controls use keyboard-operable labels, explicit automatic color
resets and modal focus management. The icon family consists of code-defined SVG
geometry; imported text cannot add executable SVG or CSS.
