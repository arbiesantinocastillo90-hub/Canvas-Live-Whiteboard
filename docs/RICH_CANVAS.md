# Shapes, relationships, quick properties and embeds

The Tools panel includes rectangle, ellipse, diamond, triangle, pentagon,
hexagon, star, cylinder, parallelogram and trapezoid shapes, plus text, lines,
areas, relationships and media. Right-click an empty canvas to add at that
position. Right-click an object or selection for a compact property panel.

## Resize and connect

Drag a selected shape's edge or corner to resize it. The resize hit areas are
transparent, leaving the visible side dots for relationships. Drag a side dot
to another object, then release near its chosen side. The resulting source and
target sides remain fixed when objects move. A connection gesture creates one
Undo step; Escape or dropping on empty space cancels it. Keyboard users can
activate a side dot and then choose the target with the connection tool.

Relationships support straight, elbow, curve and step paths, solid/dashed/dotted
lines and separate start/end pointers: none, arrow, open arrow, circle, diamond
or bar. Reverse connection exchanges its source and target while retaining the
chosen pointer styles. The compact panel and right Properties panel share these
controls. Layers control stacking; the former Containing area dropdown is
removed. Existing area relationships remain compatible with earlier drawings.

## Text and quick adjustments

Text inside shapes and standalone text can align left, center or right and top,
middle or bottom. Choose sans serif, serif, monospace or cursive system fonts,
font color, size, bold and italic. Font color is independent of the outline.
The same formatting appears in both Properties and the compact panel. A group
selection applies supported properties to its eligible objects; locked or hidden
objects keep their properties. Group changes and connection reversal retain
normal Undo behavior.

Options > Canvas controls includes **Snap to objects**, independent of grid
snapping. It aligns moved selection edges/centers and resized edges to other
visible, unlocked objects, with guides and a zoom-aware eight-pixel tolerance.
Alt bypasses snapping for that drag. Shift preserves resize proportions and
bypasses object snapping for that resize. The option starts disabled in older
workspaces.

Home's project hierarchy has **Show canvas files**. Enable it to open canvases
directly from their projects; disable it for a projects-only tree. The preference
is saved with that workspace's Home view.

## Live media and documents

Choose **Add media or website**, or use the blank-canvas right-click panel.
Enter an HTTPS URL, or import local raster images, GIFs, MP4/WebM videos,
MP3/WAV/Ogg audio, PDFs or UTF-8 plain-text documents. Local uploads are limited
to 20 MiB and validated by content, size and declared type. HTML, SVG and script
files are not imported as executable documents.

An embed begins paused. Its top-left controls resume/pause and minimize/expand
it. Pausing or minimizing unloads its image, player or iframe, reducing ongoing
resource use. Media playback position is retained during pause/resume in the
current editor session. A minimized embed retains its saved expanded size.
Drag the title bar to move it. Static thumbnails and the decorative canvas
backdrop do not create live players or iframes.

Websites and online documents run inside sandboxed frames. Providers may forbid
framing or require their own share/embed URL and sign-in. Use Open separately
when a provider does not allow embedding. Native Office documents are not
converted into an editable Office application; use a provider's document URL or
import a PDF. External content requires its normal network/account access.

Local media is stored as binary data outside the polled JSON library. `.CLF`
and `.CLP` documents retain `media:<SHA-256>` references rather than embedding
large byte strings. Copy the complete portable app folder, including
`data/media/`, when moving the library to another computer. A document imported
without its referenced media shows an unavailable placeholder; remote HTTPS
sources remain URLs. Development-server media stays in its browser profile's
IndexedDB.

Earlier LCANVAS v1/v2 drawings remain importable. New optional formatting and
relationship fields use the existing validated version-two envelope. Older
versions of the app may reject newly introduced object kinds, so keep a copy
of the updated app with those documents.

See [Portable MCP](PORTABLE_MCP.md) for the USB launcher and AI sharing setup.
