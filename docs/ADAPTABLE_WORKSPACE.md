# Adaptable workspace

Canvas Live uses a compact workspace with collapsible navigation, a project file panel, and a shared right panel for Properties or Workspace AI. The fixed right rail keeps Undo, Redo, view controls, full screen and the AI toggle available. The interaction follows familiar Obsidian conventions: a command palette, quick file switcher, remembered panels and editable shortcuts. It does not implement Obsidian's `.canvas` format.

## Layout

Drag a panel's edge to resize it. Focus the edge with Tab and use Left/Right to adjust it, Shift for larger steps, or Home/End for its limits. Double-click the edge to restore its default width. Panels have bounded widths and adapt to smaller screens; the file panel becomes an overlay when space is limited.

Hide navigation to leave a narrow icon rail. Close Files, Properties or Workspace AI with their controls, shortcuts or commands. Properties and Workspace AI share the right panel and its width. Closing Workspace AI does not stop an already shared canvas; use Stop sharing to revoke access. Changing the active file still ends its sharing authority.

Full screen concentrates on the current file and restores the surrounding layout when you leave. Options includes Reset workspace layout. Layout preferences are stored independently in `canvas-live.layout.v1`; adjusting panels does not change canvas contents, create undo entries or revise the shared MCP document.

## Commands and shortcuts

Open the command palette with **Ctrl+P** and type part of a command. Open the quick file switcher with **Ctrl+O** to search canvases in the current project. Use Up/Down and Enter to choose, or Escape to return to your previous focus.

| Action                                         | Default shortcut                                 |
| ---------------------------------------------- | ------------------------------------------------ |
| Command palette / quick file switcher          | Ctrl+P / Ctrl+O                                  |
| Options                                        | Ctrl+,                                           |
| Work / Projects                                | Ctrl+Alt+W / Ctrl+Alt+P                          |
| Navigation / Files / Workspace AI / Properties | Ctrl+Alt+L / F / A / I                           |
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

## Verification

Verified on 2026-10-11:

- TypeScript, lint and repository formatting passed.
- All **352 application tests** across 22 files passed. The **63 MCP tests** passed.
- The production app and companion build passed the unchanged **232-package** license gate; no dependencies were added.
- All **12 isolated production Chrome UI scenarios** passed with zero runtime errors: actual save/reload/export, fuzzy commands and project file switching, colors/contrast/motion persistence, panel resize/collapse/reset, unsaved draft tabs, custom/cleared/reset shortcuts, typing guards, Space pan/arrow/zoom/fit navigation, and 760/320-pixel layouts.
- All **9 production Chrome/SDK MCP camera scenarios** passed again against the updated UI: camera tolerance, content conflict recovery, acknowledgment ordering, exact Undo/Redo and Save/export/reload.
- All **23 updater fixture checks** passed, including the exact UI-guide allowlist, backups and runtime guard. Runtime credentials and user browser storage were not used by these checks.

Evidence is retained in ignored `test-results/ui-adaptable-*`, `mcp-camera-*`, `final-app-vitest.*`, `final-source-checks.*` and update reports, with copies in the project brain. jsdom's missing fullscreen property was corrected in the test fixture before the final suite. Browser selector/focus expectations were corrected before the final UI run. The owner's actual ChatGPT editing acceptance remains separate; no private tunnel key was used or saved by these tests.

Obsidian references used for the interaction conventions: [workspace](https://obsidian.md/help/workspace), [command palette](https://obsidian.md/help/plugins/command-palette), [quick switcher](https://obsidian.md/help/Plugins/Quick%2Bswitcher), and [hotkeys](https://obsidian.md/help/hotkeys).
