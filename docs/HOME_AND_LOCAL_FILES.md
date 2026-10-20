# Home, canvas interactions and local files

Initially delivered 2026-10-13; current storage and sharing behavior updated 2026-10-19. See [durable folders and recovery](DURABLE_LIBRARY.md) and the [AI mini and shared-canvas guide](AI_MINI.md) for the latest additions.

## Home and workspace

Canvas Live starts on Home unless the owner enables resuming the latest view. Home shows real projects and canvas files, search, creation destinations and Import. Selecting a project browses its files; selecting a file opens the compact editing workspace. Work explicitly resumes a workspace. The logo and Return to Home command leave the editor without discarding open tabs or Undo history. Options and Home disable hidden manual canvas shortcuts while retaining an explicitly shared AI session. Stop sharing or switch that view's file/project/workspace to end the grant.

Project changes keep unsaved documents in the current tab. A separate IndexedDB recovery store retains dirty snapshots. A newer explicit save wins over a recovery snapshot based on different saved content. Recovery failures are reported; they do not erase cached drafts or imply that a physical file was saved.

## Canvas interaction

- Shift-click adds or removes objects from the selection. Drag empty canvas to select a group. Escape clears selection or cancels a gesture.
- Drag selected objects together; arrow keys nudge the selection and Shift uses a larger step. Areas move their contents together, including attached connections. Locked and hidden objects remain protected.
- Drag any of eight resize handles. The opposite edge stays fixed; Shift preserves proportions. Area and connection relationships remain validated.
- Double-click text, a shape or an area to edit its label directly. Enter adds a line, Ctrl/Cmd+Enter applies, Escape cancels, and leaving the field applies. Ordinary clipboard commands work inside the field.
- Ctrl/Cmd+C, X and V copy, cut and paste a selection. Copying an area includes its contents and internal connections. Paste creates new identifiers, remaps relationships and places the result in the current editable layer. Plain text becomes a text object. Ctrl/Cmd+D duplicates the selection. A group edit is one undo step.
- Space-drag, middle-mouse drag or Pan moves the camera. Mouse wheel zooms around the pointer; trackpad deltas can pan and Ctrl/Cmd-wheel zooms. Pointer and wheel updates are batched to animation frames.
- Undo and Redo change objects while retaining the current camera. Camera navigation is saved with the file and does not consume edit-history steps or clear Redo.

Clipboard data is bounded to 1,000 objects and 2 MiB; plain text is bounded to 20,000 characters. It is validated through LCANVAS. Invalid clipboard data leaves the document intact. File changes, hidden workspaces and unmounts cancel pending clipboard actions.

## Physical LCANVAS files

Use Save to choose a local `.lcanvas` file for a new/unbound canvas. Subsequent saves reuse that file. Save as chooses another destination. Import can open an existing local file and retain its handle. Export creates a separate portable copy of the current canvas.

When a file is bound and write permission is already granted, automatic saving can update it after committed edits. Background saving does not ask for permission. If access expires, use Save to grant access again. A successful local save is reported after the writable stream closes. A cancelled picker or failed write leaves the canvas available and does not report success. Edits made while writing remain pending for the next save. Unexpected external file changes are reported rather than silently overwritten.

File handles are remembered separately from LCANVAS. Browser copies and draft recovery assist reopening; the physical `.lcanvas` file remains independently usable if browser data is cleared. Browsers without direct file access clearly identify browser/session copies and offer Export for a downloaded backup. Permission dialogs and destination selection remain under the owner's control.

The implementation follows [Chrome's official local file API guidance](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access): call pickers during a user action, retain handles separately, and acknowledge writes after closing their stream. It introduces no dependency or paid API. MCP receives no file handles or general filesystem access.

## Starting the installed app

Open `release/Canvas Live/Canvas Live.exe` in the repository under `D:/Canvas Live Environment/Canvas Live (Project)`. If an older page is open, save or export its work before refreshing. Choose a physical LCANVAS destination and wait for the file-save status. Keep backups of important files; deletion and device failure remain outside the app's control.

Verification and release activation are recorded in [HOME_AND_INTERACTIONS_VERIFICATION.md](HOME_AND_INTERACTIONS_VERIFICATION.md).
