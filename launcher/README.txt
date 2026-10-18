Canvas Live

Double-click "Canvas Live.exe" to open the website in your default browser.
You do not need a terminal, npm, Node.js, or an internet connection to use this package.

Keep this whole folder together, including "app", "data" and the executable configuration file.
You can move or copy the complete folder. Do not move only the executable.
Close Canvas Live before moving the folder or replacing it with a newer build.

Canvas Live stays running in the Windows tray while you use the website.
Right-click its tray icon and select "Close Canvas Live" when finished.
Double-clicking the executable again reopens the same running instance.
Closing the browser tab alone does not stop the launcher.

Requires Windows 11 with its included .NET Framework 4.8 or newer runtime.
The local website normally uses http://127.0.0.1:4173/.
If that port is busy, Canvas Live chooses another local port automatically.

This package includes Home, Projects, Work, Options and customizable themes.
Each project organizes multiple .CLF canvas files. .CLP copies contain projects
and their files; .CLW copies contain workspace layout, preferences and references.
Legacy .lcanvas and .lworkspace files remain importable.

Canvas editing includes shapes, multiline text, resizing, areas, layers and
connections. Text can grow shapes or fit smaller shapes; adjust it in Options.
The view controls include undo/redo, fit, zoom and fullscreen.
Side panels auto-close unless pinned; floating rail buttons remain visible.
The bottom bell holds session notifications and five-second dismissible messages.

The packaged app saves its shared local library in data/library.json beside
this executable, with the previous successful version in data/library.previous.json.
Keep and back up the data folder. Save as can also bind a physical .CLF file;
Export downloads a portable copy. Save document edits before expecting another
view to see them. Overlapping edits are protected and reported, not overwritten.

The link button offers Copy exact view and Copy latest view. Exact links remember
tabs/camera/layout while showing current saved files. Latest links follow the
most recently remembered workspace view. Options > Canvas Live Links customizes
copy modes and automatic startup resume. Links reference data on this device;
they do not upload or publish files. Older frozen snapshot URLs remain compatible.

For optional AI editing, open "Start Canvas Live MCP.cmd" (requires Node.js 24).
Open Workspace AI in the website, paste the companion's browser pairing code,
and choose "Share this canvas". "Stop sharing" disconnects this file.
Connect ChatGPT using the included CHATGPT_MCP.md setup guide.
The companion runs only on this laptop; ChatGPT web requires a configured tunnel.
AI edits use the same Undo/Redo and remain unsaved until you press Save.
Original project code is MIT licensed; keep the included license notices with the folder.
