# Save options

The clock button in a canvas tab strip opens Save options. It remains available before a physical file has been chosen. The strip keeps the document tabs, Save options, view-link and export controls; New canvas, Rename, Save and Save as remain available through commands and shortcuts. New canvas is also available in Files.

Save options contains:

- The current destination: the selected `.CLF` filename, the native local library, or no local file selected.
- An independent Autosave switch and an interval between 0.5 and 3600 seconds. Existing bindings retain their setting and default to the earlier 900 ms interval. Bound-file settings are remembered with the file handle. Settings for an unbound canvas apply to the current session.
- Save now, which flushes valid text/property drafts and uses the current destination.
- Choose location, which asks for a physical `.CLF` destination only after an explicit click. Browsers that cannot show a chooser offer Download copy instead.

Physical autosave uses only existing permission grants. It never opens a chooser or requests permission from a timer. A native-library canvas starts with manual saving; enabling Autosave opts it into the same interval controls and revision-safe writes. Each dirty file has its own timer, so edits in another tab do not reset its interval.

If a selected file is moved or deleted, Canvas Live stops automatic writes, retains the editable draft and recovery protection, and reports the missing destination. Open Save options and choose a replacement, or use Save now after the missing file has been detected. The next picker begins from that explicit gesture. Cancelling the chooser keeps the draft and previous binding. A conflicting external edit is protected separately; it is never treated as permission to recreate or overwrite a file.

Automated checks use controlled file handles and an isolated browser profile. They do not exercise the user's physical files or a real Windows chooser.

The native package now stores independent canvas records in automatic project/workspace folders. Creation and duplication save immediately. A blocked external write can retain an owned-library recovery copy while the linked `.CLF` remains pending. Save options distinguish those outcomes, pause repeated external retries and offer Download copy. See [local folders, Trash and recovery](DURABLE_LIBRARY.md).
