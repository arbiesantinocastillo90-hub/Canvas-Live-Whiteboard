# Development decisions

## 2026-10-09 — Milestone 0

- The owner authorized initiation of the inspection plan and supplied the Git author name/email. Identity is configured in this checkout only. Work is on `codex/milestone-0`.
- Use MIT for original project code under the specification's permissive-license requirement. Third-party licenses and notices remain separate.
- Use the official `create-vite@9.2.1` React/TypeScript template as the scaffold reference. Preserve the project documentation and replace template demo assets with an honest non-editable workspace preview.
- Pin direct dependencies exactly and retain `package-lock.json`. Use the compatible TypeScript 6.0.3 template line; do not adopt TypeScript 7 merely because it is the newest version.
- Normalize tracked text to LF with `.gitattributes`, so Windows Git line-ending settings do not cause a fresh checkout to fail the formatting check.
- Use maintained Vite 7.3.7 and its compatible React plugin 5.2.0. The first resolved Vite 8.3.4 graph required MPL-2.0 Lightning CSS, which conflicts with the specification. Vite 7 makes that an optional peer; select PostCSS and esbuild for CSS processing and exclude Lightning CSS from the final resolved graph. Vitest 5.0.3 supports Vite 7 and remains pinned.
- Accept MIT-0 after inspecting both CSSTools packages' actual notices: it grants unrestricted use, modification and redistribution without an attribution condition. Keep the metadata gate conservative for other terms.
- Accept the exact `caniuse-lite@1.0.30001815` development data package under attribution-only CC-BY-4.0. Its inspected license allows commercial sharing and adaptation without share-alike terms. This is a scoped data-license review, not blanket acceptance for application code. Preserve attribution and its complete license in `docs/DATA_NOTICES.md`.
- Every production build runs the license gate and includes the original project license plus full runtime dependency notices in `dist/`, so distributing that folder preserves the required MIT texts.
- Use Oxlint, the current template's linter, with built-in React/TypeScript rules. Use Prettier for formatting and Vitest/React Testing Library with jsdom for the initial startup test. Additional interaction and browser test packages arrive when needed.
- Default dev/preview listeners bind to `127.0.0.1`, with strict ports to avoid opening an unintended service. No network bridge, public endpoint, cloud service or model API is introduced.
- Ignore `dist` and all its descendants explicitly in the development watcher. This resolved a verified Windows output-folder lock when building with the preview server active, without enabling higher-cost polling.
- Use system fonts and locally authored CSS decorations. No redistributed font/icon packages are installed. Excalidraw remains outside the scaffold until its font policy and runtime proof are resolved.
- Keep `docs/INSPECTION.md` as the historical initial inspection; these current decisions and roadmap supersede its resolved setup blockers. Copy current milestone findings to `D:\Canvas Live` after verification, without assuming automatic synchronization.

## 2026-10-09 — Requested Windows executable

- The owner requested an executable inside a folder that opens the website directly. Build a portable folder containing a small native launcher and the current production website.
- Use Windows' installed .NET Framework 4.8 runtime/compiler for the launcher. This avoids bundling Node.js or introducing another dependency. Original launcher code remains under the project's MIT license; the Microsoft runtime is not redistributed.
- Serve only packaged static files over loopback and open the URL through Windows' default browser handler. Keep this launcher separate from the future MCP bridge and canvas operations.
- Prefer port 4173 and fall back to an available local port when occupied. This is intentional for the packaged launcher; development and Vite preview retain strict ports. Revisit browser-origin stability when persistence is implemented.
- Retain prior package folders during rebuilds. Use staging, verified in-folder paths, same-directory renames and a final executable check. Explicitly ignore both `release` and `dist` directory roots/descendants in the Vite watcher to prevent the observed Windows packaging lock.
- Record the 24 executed integration checks and distinguish forced-process shutdown from the untested tray Close action. See [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md).

## Open decisions

- Whether SIL OFL 1.1 is acceptable specifically for engine fonts, or a supported replacement is needed.
- Whether the owner's ChatGPT account can invoke custom write tools, and which secure transport is available with acceptable cost.
- How future agent-callable undo/redo will integrate with the engine's supported public API.
