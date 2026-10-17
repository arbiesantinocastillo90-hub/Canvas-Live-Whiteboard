# Canvas precision controls

The active workspace's **Options → Canvas controls** settings control selection,
snapping, rulers and the zoom label. They are workspace preferences, separate from
the geometry and colors stored in each `.CLF` document.

## Selection

Dragging on empty canvas displays a translucent marquee. Every selected object
also receives an individual outline, so the objects inside a group remain easy
to identify during the drag and after release. The marquee fill uses an explicit
opacity instead of an opaque theme panel color. A fill opacity of zero keeps the
marquee fully transparent.

Choose fill color, opacity, outline color, width and dashed or solid lines. Theme
colors follow the active theme. Choose either objects **fully inside** the box or
objects **touching** the box. Shift adds to the existing selection; Escape cancels
an active marquee and restores the previous selection. Selection decoration does
not modify an object's actual fill, outline or text color.

## Grid snapping

Snapping is off by default. When enabled, creation, pasting, duplication, dragging
and resizing align to the configured grid in canvas coordinates. A multi-object
move or paste snaps one shared anchor and preserves the exact spacing between
its members. Resizing snaps the dragged edges while the opposite edges remain
anchored. Shift's existing proportional resize behavior takes precedence on the
secondary axis, so a proportional resize need not put both edges on the grid.

Hold **Alt while dragging an object or resize handle** to bypass snapping. Alt on
empty canvas retains the existing pan gesture. Arrow keys move the selection by
one grid interval, or ten with Shift; Alt plus an arrow moves one canvas pixel.
Without snapping, existing one-pixel and Shift ten-pixel nudges remain unchanged.
Pan and zoom never snap. Existing drawings are not automatically rearranged when
the option changes. AI operations and numeric property editing retain their
explicit coordinates rather than silently rounding them.

The visual grid uses the same spacing as snapping. At low zoom it displays every
fifth grid line or dot to keep the canvas legible; snapping still uses the full
configured interval.

## Rulers and zoom

Optional top and left rulers follow the camera and show pixels, millimeters,
centimeters or inches. These are **document units at 96 canvas pixels per inch**,
matching CSS conventions, not a claim about the physical size of a screen.
Adaptive tick spacing keeps the labels readable across zoom levels and negative
canvas coordinates. Rulers do not move objects or reduce the canvas coordinate
system.

Zoom labels can show percent (`125%`), multiplier (`1.25×`) or ratio (`1.25:1`).
Only the display changes; zoom shortcuts, camera state, saved views and document
geometry keep the same numeric scale.

## Validation

The focused precision tests cover live marquee visibility, containment modes,
selection cancellation, group movement, resize anchoring, Alt bypass, creation,
structured paste, keyboard nudges, ruler alignment and bounded numeric settings.
Existing editor tests continue to verify the default interaction behavior.
