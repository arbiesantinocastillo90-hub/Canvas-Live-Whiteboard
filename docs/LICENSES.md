# Licenses and dependency review

Original project code is MIT, copyright 2026 Arbie Santino D. Castillo. Dependencies retain their own terms and notices.

The direct scaffold packages use MIT, except TypeScript (Apache-2.0). Exact versions are pinned in `package.json` and `package-lock.json`. Published direct archives and Vite/Vitest bundled license declarations were reviewed before use. Vite 7.3.7 also declares BSD-2-Clause, CC0-1.0 and ISC bundled material; Vitest declares BSD-3-Clause and ISC alongside MIT. The two CSSTools MIT-0 notices were reviewed and accepted as permissive.

The initial Vite 8.3.4 graph failed this project's license gate because Lightning CSS uses MPL-2.0. The scaffold instead uses maintained Vite 7.3.7 with the compatible React plugin 5.2.0. PostCSS and esbuild process CSS; Lightning CSS must be absent from the final resolved graph.

`caniuse-lite@1.0.30001815` is development browser support data under CC-BY-4.0. The installed full license and [Creative Commons terms](https://creativecommons.org/licenses/by/4.0/) were reviewed: commercial sharing and adaptation are allowed, subject to attribution and retaining the license; there is no share-alike requirement. It is accepted as permissive data at this exact version, with attribution and the full text in `DATA_NOTICES.md`. It is not included in the application bundle. The gate does not generally allow CC licenses for code.

`npm.cmd run licenses` inspects resolved package-lock metadata, including optional platform packages, and writes `license-inventory.json`. It accepts recognized permissive licenses/public-domain dedications and conservatively rejects missing or other SPDX terms. It also rejects dependency entries without download URLs or integrity checksums. This is a metadata gate, not a legal interpretation of arbitrary expressions or proof about unlisted assets. Production dependency notice text is included in `THIRD_PARTY_NOTICES.md`. Every production build runs the gate, regenerates those notices and copies them plus the project license to `dist/THIRD_PARTY_NOTICES.txt` and `dist/LICENSE.txt`. Keep these files with the distributed app.

The scaffold has no redistributed fonts or icon assets. System fonts are requested by CSS and are not bundled. All decorative shapes are authored locally in CSS. No Excalidraw or MCP SDK package is installed in this milestone.

Excalidraw 0.18.1 remains a candidate: MIT code, separately licensed OFL font assets, remaining transitive/font audit, and unexecuted engine proof. Its font-policy decision is still open. See the historical inspection for exact sources and limitations.

Sources: [npm registry](https://registry.npmjs.org/), [Vite](https://github.com/vitejs/vite), [Vitest](https://github.com/vitest-dev/vitest), [React](https://github.com/facebook/react), [TypeScript](https://github.com/microsoft/TypeScript).
