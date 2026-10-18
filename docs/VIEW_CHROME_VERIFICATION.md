# Snapshot links and interface chrome verification

Verified on October 15, 2026. Scope: the five browser UI comments, customizable interface dimensions, and copy-time snapshot links for interactive iframe use.

## Delivered behavior

- Separate rail buttons removes continuous left and canvas-control strips, reclaims their space, retains the logo, and reveals individual buttons on hover or keyboard focus.
- One bottom bar contains save state, visible objects, selected object/layer, zoom and control help. The former inner status strip is removed.
- Tab and status bars have independent auto-hide settings. Hover or keyboard focus reveals them without moving the canvas; touch devices retain visible controls. Tab context menus remain correctly positioned and usable while the bar is open.
- Options exposes Files/projects and Tools/AI widths, workspace and canvas-control widths, tab-bar height and status-bar height. Named workspaces and copied links restore dimensions; reset dimensions preserves the other layout choices.
- Copy view link captures all open canvases in the active project, tab order/pins/groups, active file, workspace/project names, document cameras, appearance/layout, selected objects, tool/layer, connection defaults and focus layout. Valid pending edits and camera navigation flush before capture. Invalid drafts stop copying with an error.
- Opening a link creates a separate editable session from its captured documents. It does not write to the main browser library, original files, remembered native handles, project/workspace lists or recovery. Reopening restores the copied condition without accumulating library entries. Save/Export or a newly copied link keeps subsequent edits.
- The copied camera is applied once; returning to a tab retains later navigation. Focus restoration uses the in-app layout and does not request native fullscreen or fit away the copied camera.

## Verification

- Full app suite: **599 passed**, zero failures. Final focused tests after the last integration fixes: **31 passed**, zero failures.
- MCP suite: **63 passed**, zero failures. Existing MCP transport consumes only document/command methods, independently of UI snapshot methods.
- Application and companion TypeScript, lint, formatting, production build and license review passed. License metadata covered 232 resolved packages. The build retains informational upstream Zod annotation and bundle-size warnings.
- Actual Chrome: **15 scenarios passed**, zero page errors or implicit MCP bridge requests. **30 screenshots** include light/dark, 390/984/1440 widths, fixed/floating rails, and shown/hidden bars. Representative iframe, narrow floating, hidden-bar and touch screenshots were visually reviewed; the responsive matrix also checks viewport bounds.
- Verified a genuinely cross-origin iframe served over real loopback: copied content/camera/UI restored, an object was added, and an actual edited LCANVAS download was inspected. Fresh browser contexts verify independence from the source profile. Separate checks cover unchanged original library/settings/recovery, clipboard-denial fallback, malformed URLs, touch access and copied focus layout.
- Installed native website on port 4173 was separately exercised in a fresh Chrome context through another real loopback origin. Snapshot rendering, editing and an actual three-object LCANVAS export passed without page errors or MCP requests.

Production assets: `index-Bkm6oT4M.js` and `index-uWXGKkZt.css`. All 92 source files in the build mirror matched the repository by SHA-256. The installed Windows executable remained unchanged. The update retained prior app files and hashed assets, did not alter private connection settings, and did not refresh the owner's browser tab.

## Practical limits and remaining acceptance

The URL contains the open documents. It uses bounded versioned UTF-8/base64url with native gzip when available: at most 100 open files, 1 MiB decoded JSON and a 128 KiB URL. Oversize or damaged snapshots fail explicitly. Only the active project's open tabs are included. File handles, local paths and MCP credentials are excluded, and opening the AI panel does not start sharing.

Canvas Live must be running at the URL's host and port. Edits in an opened snapshot session need Save/Export or a new snapshot link before closing/reloading. Actual Obsidian application behavior and native Windows file-picker permission in its webview remain manual acceptance; iframe behavior and download/export were verified in Chrome. This work does not change the separate owner-account ChatGPT write acceptance boundary.

Detailed usage: [Portable view links](../VIEW_LINKS.md). Ignored local evidence is under `test-results/viewlink-*`, including the full app/MCP results, focused results, browser/native reports, source hashes, update stage/apply log and release verification report. The project brain at `D:\Canvas Live` receives the public guides and verification evidence.
