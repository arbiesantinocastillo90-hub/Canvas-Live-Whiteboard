# Workspace revision verification

Verified on October 17, 2026 using the combined production sources.

## Automated checks

- Application: 837 tests passed, including precision settings, live selection membership, snapping, ruler measurements, Home and workspace perspectives, safe appearance normalization, image storage, legacy file compatibility and dirty drawing preservation.
- MCP companion: 63 tests passed.
- Native local library: 43 checks passed, including image persistence after restart, direct image reads, small polling responses, revision conflicts, independent image and view writes and guarded test cleanup.
- TypeScript, lint, formatting and the production build pass. License metadata covers 232 resolved packages without new dependencies.

Existing navigation tests now explicitly browse a project before creating a canvas, use the combined panel opener and accept automatic latest-view startup.

## Browser acceptance

The production build runs in an isolated native package and disposable Chrome profiles. Checks cover Projects/Canvas perspectives, hierarchy and sorting, real content thumbnails, workspace identity and GIF backgrounds, fresh-profile image loading, workspace switching, the management popover, aligned Options, the centered Work control, the consolidated ribbon and canvas appearance while drawing text is unsaved.

Pinned panels reserve canvas space in normal and swapped positions at 1458, 1059, 700 and 600 pixels wide. Floating panels have rounded borders and visible perimeter gaps. The outer Work control stays centered and clear of navigation at 900, 800, 700 and 600 pixels.

Browser evidence is kept in the ignored test-results folder and copied to the project brain with the completed update. Test packages and profiles contain synthetic data. Owner browser profiles, clipboard and open drawings are not used by the harness. The temporary native package uses a short path to stay within the existing Windows launcher path limits.

## Installation

Only public website files, the native executable, the MCP bundle and public guides are updated. Existing library data, appearance images, private configuration and prior hashed website assets are preserved. Protected file hashes are compared before starting the updated launcher. An existing browser tab is not forcibly reloaded.

## Limits

Rulers use 96 canvas pixels per inch and do not measure physical screen size. Home backgrounds are local raster files up to 2 MB. Workspace exports carry an image identifier rather than embedded image bytes; moving a workspace to another installation requires reselecting its background or copying the complete data folder. Previews simplify up to 1,000 visible objects. Actual Obsidian desktop interaction and a new external ChatGPT account write are outside this revision's acceptance checks.

The recommended next step is to open the updated site and try the controls against the owner's normal projects.
