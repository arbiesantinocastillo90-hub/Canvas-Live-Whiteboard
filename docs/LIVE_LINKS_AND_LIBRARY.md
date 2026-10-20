# Canvas Live Links and local files

The link button above an open canvas opens a small menu:

- **Copy exact view** keeps the copied workspace, project, open/pinned/grouped tabs, file shortcuts, project pins/recents, camera, selection, tools and panel layout. It uses the same live file identities. Later **saved** file changes appear when this link is opened again.
- **Copy latest view** opens the most recently remembered view of that workspace. Tabs and layout are remembered as you work, without copying another link. Options > Canvas Live Links can also resume the most recent workspace on a fresh launch.

Both copy actions, automatic resume, camera restoration and panel restoration have independent settings. Disabling a copy action removes it from the menu. A copied URL does not update when you continue working; the Latest URL instead resolves the latest saved view record.

View state and canvas content are saved independently. Moving the camera in the packaged app remembers the view without changing the saved canvas content. Save your document edits to make them available to other views. A clean view refreshes saved content from the local library while retaining its camera. Overlapping unsaved edits are protected and reported rather than overwritten; export a copy or reload the saved file before resolving a conflict. Undo history is local to an editing view and restarts when remote content is accepted.

## Where the files live

The Windows executable stores its shared library in **data/library-v2/** beside the executable, with automatic project/workspace folders, individual atomic record saves and previous copies. Home reads a lightweight catalog instead of downloading every drawing. Existing **data/library.json** and **data/library.previous.json** are retained after the staged upgrade. See [durable folders and recovery](DURABLE_LIBRARY.md) before updating or downgrading a package. Keep the complete data folder with the app and include it in your backups. Browser saves are migrated when their IDs do not already have a saved native copy. Existing drafts and chosen local file bindings remain in their original browser profile.

The same running executable serves all browser profiles and embedded views on its loopback address. The native library is available without the AI companion or a Node installation. It accepts bounded JSON records and revision-checked writes only; it does not expose arbitrary filesystem paths. A conflicting save is rejected. Storage failures retain existing data and appear in session notifications.

Development-server use falls back to browser storage. Browser profiles without the native library do not share their documents. Changing the executable folder, origin or port can require using the current app address again. These links reference local data on this device; they do not upload files or make a public website. In Obsidian, paste the copied URL into a web/iframe node while the executable is running. Obsidian's own `.canvas` format is unchanged.

Older `#view=1j...` / `#view=1g...` snapshot links still open their independent copies. New reference links use `#view=2e...` (exact) and `#view=2l...` (latest). Opening an old frozen snapshot does not replace the main library.

## Portable formats

- **.CLF**: one editable canvas. New Save as and Export names use this extension. Existing `.lcanvas` files remain importable, and a previously chosen legacy filename is preserved when saving it.
- **.CLP**: a project, its nested projects, and their canvas contents. Import creates new project/file IDs to protect existing work. Export includes valid current drafts after flushing the active editor. It excludes browser handles, credentials and AI connection state.
- **.CLW**: workspace preferences, layout and file references. It organizes existing files; it does not bundle their contents. Existing `.lworkspace` files remain importable. Use `.CLP` and `.CLF` for portable document backups.

## Session UI

The bottom-right bell shows notifications from this session and workspace/view. Messages appear for five seconds and can be dismissed with an animated close button. A fresh page session starts a fresh history; notifications are never included in copied links or project exports.

Separate rail buttons leaves the logo and floating controls visible while removing the long rail backgrounds. All projects can collapse independently. Shape text wraps across lines, preserves its colors while editing, and can grow its shape or shrink its displayed font; adjust these behaviors and the minimum text size in Options.
