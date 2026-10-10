# Canvas-Live-Whiteboard

Version of Canvas OS that multiple users and AI's could interact and collaborate on Canvas space.

## Development status

Milestone 0 provides a React/TypeScript app shell and development checks. The preview clearly marks that drawing, saving and AI editing are not implemented yet. The canvas-engine proof of concept is next.

- [Project specification](PROJECT_SPEC.md)
- [Agent instructions](AGENTS.md)
- [Initial inspection and Milestone 0–1 plan](docs/INSPECTION.md)
- [Roadmap](docs/ROADMAP.md)
- [Setup and testing](docs/TESTING.md)
- [Milestone 0 verification results](docs/MILESTONE_0.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Dependencies and licenses](docs/LICENSES.md)

Project brain: `D:\Canvas Live`. Initial AI client: ChatGPT. The MVP is local-first and single-user, with external AI editing through MCP. Multi-user collaboration is a later milestone.

## Run on Windows

Install Node.js 24 LTS (24.15 or newer in the 24.x line), then use PowerShell in the repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The development server binds to loopback by default. It has no paid model API, cloud storage, account requirement, external font requests, or MCP connection.

Run the development checks with `npm.cmd run check`. See [TESTING.md](docs/TESTING.md) for individual commands and current coverage. The project is licensed under [MIT](LICENSE); dependencies retain their own notices.
