# Contributing

Canvas Live is an evolving student project. Small, reproducible improvements are welcome. Read the [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) and [specification](PROJECT_SPEC.md) before larger changes.

## Report a problem

Include OS/browser, the smallest reproduction, expected behavior and actual result. A sanitized `.CLF` example is useful. Distinguish a source build, portable package and external MCP client.

Do not attach private boards, personal files, `.canvas-live/`, pairing codes, tokens, runtime keys or unredacted logs. See [SECURITY.md](SECURITY.md) for sensitive reports.

## Make a change

1. Create a focused branch and preserve unrelated work.
2. Keep document operations independent of UI and MCP transport.
3. Add meaningful regression coverage for behavior changes.
4. Run `npm run check` and `npm run check:docs`. Run relevant native/browser checks when changing those boundaries.
5. Update affected guides or acceptance criteria. Separate executed checks from assumptions.
6. Describe the concrete before/after behavior, validation and remaining limits in the pull request.

New dependencies require license review, a lockfile update and notices. Do not add a required paid model API, unrestricted MCP filesystem/shell access or credentials to examples.

## AI-assisted contributions

AI assistance is allowed. Explain substantive assistance in the pull request and remain responsible for checking the result. Do not claim generated work was handwritten or report tests that were not run.

Use real commit timestamps. Do not backdate commits or turn request dates into delivery dates. Proposed milestones are not promised deadlines.
