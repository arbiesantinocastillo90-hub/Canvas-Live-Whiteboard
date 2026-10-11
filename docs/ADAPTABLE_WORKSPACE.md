# Adaptable workspace

Canvas Live centers the current LCANVAS file in a full-height editor with file tabs. A 44-pixel icon ribbon opens workspace navigation; the fixed right rail keeps Undo, Redo, zoom, fit, fullscreen and panel launchers available. Compact controls show their names on hover and keep accessible labels. File names, values and editable field labels remain visible; decorative headings and repeated instructions have been removed.

## Layout

**Left:** Files organizes the active project's canvases; Projects lists recently opened projects and searches all of them. Select a project to open its files. The folder action inside Projects opens the full project management page. **Right:** Tools contains shape, text, area and connection controls; Properties edits selected objects and layers; AI controls explicit canvas sharing.

Hover the Files/Projects or Tools/Properties symbols to open their panel; click also opens it. AI opens by click. An unpinned panel overlays the canvas and closes after the pointer leaves, or when you click the canvas. Inputs, keyboard focus, resizing and dialogs protect active interaction. Closing or switching panels retains unapplied property and pairing-code text. Selecting a different object resets its property draft normally.

**Double-click a panel tab to pin or unpin it.** The left ribbon Files/Projects icons also support double-click pinning. The pin icon provides the same action with a single click or keyboard. A pinned panel stays open beside the canvas. On narrow screens, pins keep panels open as overlays so the editor remains usable. Close explicitly with the X; Escape closes a focused panel outside text fields.

Drag a panel edge to resize. Focus the edge with Tab and use Left/Right, Shift for larger steps, Home/End for limits, or double-click to reset its width. The left panel ranges from 160–420 pixels and the right from 220–420. Tabs support Left/Right and Home/End; file-tab shortcuts also remain available.

Full screen concentrates on the current file, keeps tabs and save/export available, and restores the ordinary panel choices on exit. Options includes Reset workspace layout. Panel preferences use `canvas-live.layout.v2`; old v1 widths migrate into a clear initial workspace. Panel changes never alter canvas contents, create undo entries or revise the shared MCP document.

Closing AI or choosing Tools/Properties keeps an already shared canvas active. Stop sharing revokes access; changing files or leaving Work also ends sharing. The AI panel's Sharing details disclosure explains access and saving behavior.

## Commands and shortcuts

Open the command palette with **Ctrl+P** and type part of a command. Open the quick file switcher with **Ctrl+O** to search canvases in the current project. Use Up/Down and Enter to choose, or Escape to return to your previous focus.

| Action                                         | Default shortcut                                 |
| ---------------------------------------------- | ------------------------------------------------ |
| Command palette / quick file switcher          | Ctrl+P / Ctrl+O                                  |
| Options                                        | Ctrl+,                                           |
| Work / Projects                                | Ctrl+Alt+W / Ctrl+Alt+P                          |
| Left panel / Files / Workspace AI / Properties | Ctrl+Alt+L / F / A / I                           |
| New canvas / Import LCANVAS                    | Ctrl+Alt+N / Ctrl+Alt+O                          |
| Save / Export                                  | Ctrl+S / Ctrl+Shift+E                            |
| Next / previous canvas tab                     | Ctrl+Alt+Right / Left                            |
| Close current canvas tab                       | Ctrl+Shift+X                                     |
| Select / Pan                                   | V / H                                            |
| Rectangle / Ellipse / Diamond                  | R / E / D                                        |
| Text / Area / Connection                       | T / A / C                                        |
| Undo / Redo                                    | Ctrl+Z / Ctrl+Shift+Z; Ctrl+Y is a default alias |
| Delete / Duplicate selected object             | Delete / Ctrl+D                                  |
| Zoom in / out                                  | Ctrl++ / Ctrl+-                                  |
| Reset view / Fit contents                      | Ctrl+0 / Shift+1                                 |
| Full screen canvas                             | Ctrl+Shift+F                                     |

Hold Space to pan temporarily. Arrow keys nudge a selected editable object, or pan the view when no movable object is selected; Shift increases the step. Reset view and Fit contents both frame visible objects, or restore the default view on an empty canvas. These navigation keys and Escape keep their existing editor behavior.

In **Options → Keyboard shortcuts**, find an action, select its shortcut button and press a new combination. Clear removes it; Restore returns its default. Reset shortcuts restores all defaults. Duplicate assignments and protected browser shortcuts are rejected. Bindings are saved in `canvas-live.shortcuts.v1` and work for the current session if storage is unavailable.

Canvas actions apply while the canvas has keyboard focus; commands also provide explicit access to them. Editing text, naming files, selecting colors and entering a pairing code pause canvas shortcuts. Customized unmodified keys remain normal text in inputs. Keyboard commands do not bypass an active dialog, text composition, canvas locks or operation validation. Palette actions use the same handlers as their buttons.

## Appearance and motion

Options keeps light, dark and system appearance, accent, density and grid choices. Contrast adjusts the automatic text and divider palette. Expand Fine-tune colors to set the workspace background, panel surface, text, borders and canvas grid independently. Each color has an Automatic reset; these interface colors do not recolor canvas objects.

Motion has Subtle and Smooth styles, with Slow, Normal and Fast speeds. The preview responds to the current choices. Reduce motion disables interface transitions and animations, and the operating system's reduced-motion setting also takes precedence. Appearance preferences remain part of the existing workspace metadata, with defaults for older saved preferences.

## Release activation

Open **Canvas Live.exe** in `release/Canvas Live` to use the installed website. Save any dirty canvas in an older open browser page before refreshing it.

For a staged update, save dirty canvases before closing the website from its tray and stopping the companion and tunnel windows. Run **Apply Canvas Live Update.cmd**, then reopen the executable, companion and private tunnel launcher. Pair with the new code and explicitly share the current file. The updater preserves the executable, local credentials and tunnel configuration. It refuses installation while the website, companion or tunnel is running. See [ChatGPT setup](CHATGPT_MCP.md).

## Reference revision verification

Verified on 2026-10-11:

- The full application suite passed **370 tests across 23 files**; all **63 MCP tests** passed. The seven dock tests were retested after protecting modified arrow keys.
- TypeScript, lint and full repository formatting passed. The production website and companion build passed the unchanged **232-package** license gate.
- All **12 isolated production Chrome reference UI scenarios** and **9 MCP camera scenarios** passed against final assets `index-ClMu-Zni.js` and `index-CvjbhEmp.css`, with zero runtime errors.
- Browser checks cover actual LCANVAS save/export/reload; project/file switches; peek and dock geometry; mouse action and unpin auto-close; keyboard/input protection; pin/width persistence; property drafts; hidden-panel AI acknowledgment; content revisions; native fullscreen; shortcut guards; theme and motion; settings control bounds; and 760/320-pixel screens.
- All **23 updater fixture checks** passed. Source copies match the build workspace. Tests used fresh browser data and an isolated companion, without accessing the owner's browser or private tunnel.

The visual check found settings controls that relied on removed descriptions for float clearing; the final CSS corrects that flow and browser bounds checks now cover it. Fixture labels and the isolated allowed-origin port were corrected during verification. There are no remaining test failures. The owner's actual ChatGPT edit acceptance remains a separate check.

Reports and screenshots are retained in ignored `test-results/ui-reference-*`, `mcp-reference-camera-*`, `reference-final-*`, `reference-mcp-*` and update reports, with copies in the project brain.

## Previous milestone verification

The earlier adaptable-workspace build was verified on 2026-10-11:

- TypeScript, lint and repository formatting passed.
- All **352 application tests** across 22 files passed. The **63 MCP tests** passed.
- The production app and companion build passed the unchanged **232-package** license gate; no dependencies were added.
- All **12 isolated production Chrome UI scenarios** passed with zero runtime errors: actual save/reload/export, fuzzy commands and project file switching, colors/contrast/motion persistence, panel resize/collapse/reset, unsaved draft tabs, custom/cleared/reset shortcuts, typing guards, Space pan/arrow/zoom/fit navigation, and 760/320-pixel layouts.
- All **9 production Chrome/SDK MCP camera scenarios** passed again against the updated UI: camera tolerance, content conflict recovery, acknowledgment ordering, exact Undo/Redo and Save/export/reload.
- All **23 updater fixture checks** passed, including the exact UI-guide allowlist, backups and runtime guard. Runtime credentials and user browser storage were not used by these checks.

Evidence is retained in ignored `test-results/ui-adaptable-*`, `mcp-camera-*`, `final-app-vitest.*`, `final-source-checks.*` and update reports, with copies in the project brain. jsdom's missing fullscreen property was corrected in the test fixture before the final suite. Browser selector/focus expectations were corrected before the final UI run. The owner's actual ChatGPT editing acceptance remains separate; no private tunnel key was used or saved by these tests.

Obsidian references used for the interaction conventions: [workspace](https://obsidian.md/help/workspace), [command palette](https://obsidian.md/help/plugins/command-palette), [quick switcher](https://obsidian.md/help/Plugins/Quick%2Bswitcher), and [hotkeys](https://obsidian.md/help/hotkeys).
