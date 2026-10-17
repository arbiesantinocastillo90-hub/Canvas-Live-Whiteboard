# Workspace and item appearance

Workspace appearance belongs to the selected workspace. Its identity can have a
local font, independent title fill and outline, size and weight, a built-in vector
icon with fill and outline controls, a tagline, and a multiline description.
Font choices use installed system fonts; Canvas Live does not fetch fonts.

The Home background supports a color, an optional local PNG/JPEG/WebP/GIF up to
2 MB, fit and position controls, image opacity, and an independently adjustable
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
does not fetch remote images. SVG, mismatched MIME types, invalid signatures,
oversize uploads and modified stored assets are rejected. A failed upload leaves
the previous workspace reference unchanged. Once connected, a local-library
write failure is reported instead of being mistaken for a successful browser save.

Keep the complete installed application folder together and back up the entire
`data/` directory, including `data/appearance/` and the library files. Copying
only `library.json` does not include workspace backgrounds. Small document and
view saves do not rewrite image files, and regular library polling does not
download those images again. A background is read separately when needed.

Canvas and project appearance supports a built-in icon, accent, card fill, card
outline and description. These presentation fields are part of `.CLF` and `.CLP`
data, so they travel with the corresponding file or project. Automatic colors
follow the workspace theme. Appearance changes leave canvas objects and project
hierarchies intact. Descriptions are plain text.

The built-in controls use keyboard-operable labels, explicit automatic color
resets and modal focus management. The icon family consists of code-defined SVG
geometry; imported text cannot add executable SVG or CSS.
