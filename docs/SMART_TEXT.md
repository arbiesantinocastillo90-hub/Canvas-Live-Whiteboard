# Smart canvas text

Canvas text wraps at word boundaries, long unbroken words, explicit newlines and Unicode grapheme boundaries. No six-line or single-line visibility limit is applied. The stored text remains literal plain text. SVG renders the same text color, and inline editing uses a transparent input over the actual shape so its outline, fill and color remain intact.

Options → Canvas text provides independent settings:

- **Grow shapes with text:** text or base-font changes can grow a shape or text object from its current top-left anchor. The edited text and resulting dimensions are one Undo step. Existing files are not rewritten just by opening them. New text and edits requested through MCP use the same policy.
- **Fit text when shapes shrink:** display text can reduce toward the selected minimum, without changing the saved base font size or undoing a deliberate manual resize. Enlarging the shape restores the base text size where it fits.
- **Minimum text size:** 8–32 canvas pixels, before camera zoom. If content cannot fit even at that minimum, its remaining lines stay visible beyond the shape instead of being deleted or clipped. Enlarge the shape, reduce the minimum, or re-enable growth to give that text more room.

Rectangles use an inset text box. Ellipses and diamonds use centered inscribed text boxes so ordinary labels stay inside their curved or sloping edges. Explicit growth keeps existing layer and area validation: an object that grows beyond its containing area leaves that area, just as a manual resize would; affected connections are updated by the existing canvas operation rules. Locked objects are not changed by this policy.

Inline editing previews growth without committing. Escape restores the original text and dimensions. Ctrl/Cmd+Enter, leaving the text input, and Save commit the valid draft. Structured copy/paste and Duplicate retain existing object dimensions and layout; pasting new plain text can grow its new text object. Text measurement uses a local browser canvas, with a deterministic fallback; no service or new dependency is involved. Unchanged text layouts are cached while panning and zooming.
