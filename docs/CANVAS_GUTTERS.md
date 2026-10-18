# Canvas gutters and controls

Updated 2026-10-17.

The current board and grid continue across the whole workspace deck, including the visible gaps around rounded panels and the empty parts of the tab and status strips. A decorative SVG uses the same object renderer and camera as the interactive canvas. Its origin is measured from the actual stage, keeping lines, shapes and grid cells continuous as panels are resized, pinned, swapped or hidden.

Pinned panels still reserve central working space. Their bodies and the individual controls stay readable. The full-deck continuation is inert, hidden from assistive technology and ignores pointer events; object selection and drawing remain on the original central stage with its existing coordinates. Decorative clip paths and arrow markers use separate identifiers.

The right canvas control rail sits eight pixels below the deck top, aligned with pinned panel tops. It is mounted directly inside the deck so the tab strip cannot clip its top. It follows the right edge of the central canvas column when either panel is pinned, and remains within the fullscreen workspace. Layout observers track the deck, stage and panel chrome without observing the SVG attributes that change during drawing. Pending measurements and observers are released when the editor is inactive or removed.
