# Licenses and dependency review

Original project code is MIT, copyright 2026 Arbie Santino D. Castillo. Dependencies retain their own terms and notices.

This records the dependency and packaging policy for the October 18, 2026 implementation. It is a project review record; the included license texts remain the authoritative terms. See [Third-party notices](THIRD_PARTY_NOTICES.md) and [data attribution](DATA_NOTICES.md).

## JavaScript dependencies and build gate

Exact versions are pinned in `package.json` and `package-lock.json`. The direct scaffold packages use MIT, except TypeScript (Apache-2.0). Published direct archives and Vite/Vitest bundled license declarations were reviewed before use. Vite 7.3.7 also declares BSD-2-Clause, CC0-1.0 and ISC bundled material; Vitest declares BSD-3-Clause and ISC alongside MIT. The two CSSTools MIT-0 notices were reviewed and accepted as permissive.

The initial Vite 8.3.4 graph failed this project's license gate because Lightning CSS uses MPL-2.0. The implementation instead pins Vite 7.3.7 with the compatible React plugin 5.2.0. PostCSS and esbuild process CSS; Lightning CSS must be absent from the final resolved graph. This documents the original selection, rather than claiming that these versions are always the newest available.

`caniuse-lite@1.0.30001815` is development browser support data under CC-BY-4.0. The installed full license and [Creative Commons terms](https://creativecommons.org/licenses/by/4.0/) were reviewed: commercial sharing and adaptation are allowed, subject to attribution and retaining the license; there is no share-alike requirement. It is accepted as permissive data at this exact version, with attribution and the full text in `DATA_NOTICES.md`. It is not included in the application bundle. The gate does not generally allow CC licenses for code.

`npm.cmd run licenses` inspects resolved package-lock metadata, including optional platform packages, and writes `license-inventory.json`. It accepts recognized permissive licenses/public-domain dedications and conservatively rejects missing or other SPDX terms. It also rejects dependency entries without download URLs or integrity checksums. This is a metadata gate, not a legal interpretation of arbitrary expressions or proof about unlisted assets. Production dependency notice text is included in `THIRD_PARTY_NOTICES.md`. Every production build runs the gate, regenerates those notices and copies them plus the project license to `dist/THIRD_PARTY_NOTICES.txt` and `dist/LICENSE.txt`. Keep these files with the distributed app.

The MCP integration pins official `@modelcontextprotocol/server`/`client` 2.3.1 and `@modelcontextprotocol/node` 2.1.1 (Apache-2.0), Zod 4.6.5 (MIT), and esbuild 0.28.2 as a direct build dependency (MIT). The October 18 verification reviewed 232 resolved packages including optional platform archives. MCP server dependencies are bundled into the optional companion and covered by its accompanying production notices. A passing metadata gate does not replace review of runtime binaries or other assets outside the lockfile.

## Portable runtime and distribution notices

The Windows package now redistributes official Node.js **24.15.0, Windows x64** for the optional MCP companion. It requires no global Node installation. `scripts/package-mcp-runtime.ps1` pins the official archive and executable SHA-256 values, verifies an OpenJS Authenticode signature and copies these runtime artifacts:

- `runtime/node.exe`: the verified executable.
- `runtime/NODE_LICENSE.txt`: the complete upstream license file, including notices for Node's bundled dependencies.
- `runtime/node.sha256`: the pinned executable checksum.
- `runtime/node-provenance.json`: version, platform, upstream source, hashes and signature information.

Keep the complete runtime notices with the distributed package. The npm lockfile inventory does not cover this binary; its verification and notices are a separate packaging step. The pinned upstream source is [Node.js v24.15.0](https://nodejs.org/dist/v24.15.0/).

The C# launchers use the target computer's .NET Framework runtime. Microsoft's runtime is not redistributed. The separate OpenAI tunnel-client is not downloaded or redistributed by the repository's packager; its own upstream terms apply when a user obtains it separately.

## Fonts, branding and historical engine evaluation

The app has no redistributed fonts. CSS requests system fonts. Controls and mascot presets use original SVG, alongside the owner's supplied app logo. Embedded user media is user content, not a bundled dependency.

The AI mini also displays unchanged official OpenAI, Claude and Anthropic marks to identify reported MCP clients. These marks retain their owners' trademark rights and are excluded from the project's MIT grant. Their exact sources and usage context are recorded in [the bundled marks notice](../public/assets/ai-clients/NOTICE.txt) and [the mini guide](AI_MINI.md). The notice ships with the assets and is appended to the production `THIRD_PARTY_NOTICES.txt`. Marks remain static and separate from the customizable mascot; their display does not establish endorsement or verify a model.

Excalidraw is not installed or redistributed. Its October 9 evaluation considered MIT code and separately licensed OFL font assets, with a remaining transitive/font review and runtime proof. The project subsequently implemented its original SVG editor. The engine evaluation is deferred, not a blocking requirement or a license approval for future adoption. Reopen that review if the dependency is actually proposed; see [the historical inspection](INSPECTION.md) and [decisions](DECISIONS.md).

Sources: [npm registry](https://registry.npmjs.org/), [Vite](https://github.com/vitejs/vite), [Vitest](https://github.com/vitest-dev/vitest), [React](https://github.com/facebook/react), [TypeScript](https://github.com/microsoft/TypeScript).
