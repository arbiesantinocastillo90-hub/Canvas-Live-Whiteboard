# Notifications and copying

Updated 2026-10-17.

Notifications stay in the current app session and workspace/link scope. Identical messages of the same kind refresh the existing notification and toast rather than adding repeated history rows. Opening the bell marks messages read. The toast close button hides the toast; the close button on a history row removes that notification, allowing a later occurrence to add a new row.

Choose **Remind me later** in a toast or history row to silence that message for 5, 10, 20 or 30 minutes, or 1 or 2 hours. The reminder uses the same history row and becomes unread when due. Repeated reports during that interval do not interrupt the quiet period. Removing the history row cancels its reminder. These are in-app, session-only reminders: they do not create external scheduled jobs or survive closing/reloading the app. Pending timers are released when the notification store has no mounted subscribers.

Canvas selections and areas can be copied or cut with Ctrl/Cmd+C or X, and pasted with Ctrl/Cmd+V. Windows CRLF text envelopes, existing LF envelopes and the strict JSON MIME envelope are supported. Legacy LCANVAS v1 document data is validated and migrated by the existing import validator. Unsupported future versions and inconsistent references are rejected before changing the drawing. The 1,000-object and 2 MiB clipboard limits still apply. Ordinary text clipboard content remains text.

Hold Ctrl (or Cmd) when beginning a drag to copy a selected object or selection. An area includes its members and internal connections. The copy is created once after movement begins, with fresh identifiers and remapped relationships. Continue dragging to place it; releasing the modifier does not make extra copies. The originals remain in place. The completed copy and movement form one Undo step. Escape or pointer cancellation removes the preview; a modifier-click without dragging does not create a copy. Grid snapping and its Alt bypass apply to placing the copy.
