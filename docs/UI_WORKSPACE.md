# Themes and workspace sections

## Implemented — 2026-10-09

The owner requested customizable UI themes plus Options, Projects and Work, before the canvas controls and LCANVAS format. The owner subsequently supplied the Canvas Live logo. This update implements that interface without adding an editor engine, a file format or an AI connection.

- **Options:** system/light/dark appearance, five accent presets and a custom color, comfortable/compact spacing, dots/lines/plain canvas preview backgrounds, reduced motion, and Reset appearance. Changes apply immediately across the interface. Reset affects appearance only.
- **Projects:** create and rename project names, search the project list, open a project, and display the five most recently opened projects in the left sidebar. The main list includes all projects ordered by recent opening. New installations start with an actual empty list, not sample projects.
- **Work:** open the most recently opened project, including after reopening the same browser origin. A project has an explicitly labelled canvas preview. It has no drawing tools or canvas content yet.
- **Branding:** the supplied PNG is used in the sidebar and as the browser favicon. `public/canvas-live-logo.png` is an unchanged copy, verified against the supplied image with SHA-256 `84F028962DE52F50105A073964D5E1F9E694713D451E3DD8FE4DE73F1D4FA401`. It is an owner-provided brand asset; no third-party logo/font/icon library was adopted. The launcher executable's existing Windows icon is unchanged.

## What is remembered

`src/app/workspace.ts` defines a versioned metadata record stored under `canvas-live.workspace.v1` in browser localStorage. It contains appearance preferences, project IDs/names, creation/opening timestamps and the latest project ID. It stores **no canvas elements or LCANVAS document**.

The parser bounds the record size, checks all preferences, limits the list to 100 projects, trims names to 1–80 characters, rejects duplicate IDs/invalid dates, and verifies the latest-project reference. Unknown or corrupt records load a fresh empty state; opening or renaming an unknown ID leaves state unchanged. The app writes only when the user changes a preference or project. Failed writes retain usable state in the current tab and display a clear session-only message.

Metadata belongs to this browser and URL origin. Another browser, private browsing session or port can have a separate list. Copies of the executable folder do not carry browser metadata with them. This is not a backup or document export mechanism. Future LCANVAS import/export and durable canvas saving require their own design and tests. There is no cross-tab synchronization in this task.

## Structure and verification

`App.tsx` controls section navigation and project operations; `AppearanceOptions.tsx` provides controlled preferences; `ProjectDialog.tsx` provides the keyboard-accessible create/rename dialog; `Icon.tsx` contains original inline SVG controls. `styles.css` uses shared light/dark color tokens and density/motion preferences. Primary button text is chosen to contrast with the custom accent; small accent text mixes mostly with the theme's foreground to retain readability for very light or dark custom colors. The system's reduced-motion preference is also respected.

The automated suite includes metadata validation/storage failure tests and UI flows for project creation, reopening, renaming, searching, system appearance, customized preferences, reset, invalid names, Escape/focus recovery and unavailable storage. Run `npm.cmd run check` for the suite and production build. Run `npm.cmd run package:windows`, then `npm.cmd run test:launcher` to refresh and verify the packaged website.

The final `npm.cmd run check` passed in the clean physical C: verification copy: typechecking, lint, formatting, **43 tests in two files**, the 215-package license metadata gate and the production build. SHA-256 comparisons confirmed that all eight application/test files, the HTML, supplied logo, package manifest/lockfile and Vite config exactly match the development checkout. The resulting production build was copied back to the checkout and packaged with the existing Windows build script.

Browser checks at a separate verification origin created two project names, reopened the older project, and confirmed that Work reopened it after reload. Light appearance, Amber accent, compact spacing, lines background and reduced motion persisted and appeared in the rendered UI. The supplied logo loaded successfully. Both the system dark appearance and customized light appearance were visually inspected. Verification projects were kept away from the packaged site's origin. A screenshot is retained locally under `test-results/ui-options.jpg`; generated reports/screenshots are ignored by Git.

The refreshed Windows folder compiled successfully and `npm.cmd run test:launcher` again passed all **24 integration checks**. The packaged logo's hash matches the original. Automatic approval review rejected a subsequent normal executable start with only “blocked by policy” reported. The packaged `app/` folder was therefore shown through the trusted Vite preview server at port 4173; its actual Options page was inspected, with no browser warnings/errors captured. Its genuine project list was empty, and `test-results/packaged-options.jpg` preserves the final view. A normal default-browser launch of this refresh and the tray Close action were not tested; the automated launcher checks use headless mode.

Initial test startup on D: exceeded Vitest's 60-second worker handshake deadline before any assertion ran. A clean C: verification copy used the identical lockfile and source; its clean install reported 147 applicable packages and zero vulnerabilities. A dependency junction initially prevented creation of compiler/Vite cache directories, so verification moved to a fresh physical install. No dependency versions or repository compiler settings were changed to work around the environment. An initial lint finding about synchronous effect updates was resolved by persisting from user actions, and unsupported test-query options were removed after the type check reported them. The final checks above passed after those fixes.

## Next task

Evaluate the canvas engine, then implement the requested controls, tools, navigation and buttons. Define the LCANVAS schema and saving/import behavior alongside real document persistence. Engine/font licensing and ChatGPT transport remain open decisions from the existing roadmap.

## Current compact revision

The 2026-10-11 reference revision supersedes the earlier sidebar arrangement: a narrow icon ribbon, file tabs and full-height canvas replace large headings and repeated descriptions. Files and recent Projects share the left dock; Tools, Properties and AI share the right dock. Hover/click opens panels, mouse-away closes unpinned panels, and double-clicking a tab pins it. Keyboard and editing focus are protected. See [ADAPTABLE_WORKSPACE.md](ADAPTABLE_WORKSPACE.md) for the current layout, activation and verification.
