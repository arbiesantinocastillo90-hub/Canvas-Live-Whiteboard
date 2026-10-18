# Portable Canvas Live MCP

Keep the complete **Canvas Live** folder on your USB. Open **Canvas Live.exe** for the canvas and **Canvas Live MCP.exe** for its AI companion. The MCP launcher also starts the canvas server when needed. Its status window shows the local connection address; closing that window leaves MCP in the Windows tray. Choose **Stop MCP** to end it. Canvas Live remains independently usable.

The package contains its own verified Node.js 24.15.0 Windows x64 runtime and complete Node license notices. No Node installation, npm command, API key, or administrator installation is required for the local companion. It supports Windows x64 computers with the existing .NET Framework launcher requirements. This is a Windows package, not a macOS or Linux executable.

The launchers find their files relative to their executable. You can move the whole folder or change its drive letter. Keep `app/`, `mcp/`, `runtime/`, the executables, configuration files, and notices together. Keep your portable `data/` folder to retain your workspaces and saved canvases. Browser-specific permissions and unsaved browser state do not automatically transfer to a different computer. Safely close the app and companion before unplugging the drive.

The optional **Canvas Live MCP.exe** icon at the USB root is a small forwarder with a relative package path. Moving the complete USB tree or changing its drive letter preserves that link. If you rename the package's parent folders, rebuild the forwarder with `scripts/build-portable-mcp-entry.ps1 -RelativePackagePath '<relative package folder>' -OutputPath '<root icon path>'`.

## Share a canvas

1. Open a canvas, then open **Workspace AI**.
2. Choose **Share this canvas**. The packaged app finds the companion belonging to its own folder; no pairing-code copy is normally needed.
3. Add the companion to your chosen MCP-compatible AI client and approve that client's connection. Local clients use the address in the MCP status window and the bearer token available through **Copy MCP access token**.

The canvas panel shows project, canvas, and connected-client information only while sharing. The client name comes from the authenticated MCP client's initialization message. It may identify Claude, ChatGPT, Codex, or another client; it is client-reported information and does not prove which model is running. A model name is not guessed. Stop sharing, change files, or leave Work to revoke the canvas session. Ordinary AI edits appear live and participate in Undo. Saving retains the edits.

Sharing includes unsaved canvas content. A cloud AI client may send that content to its provider. The companion exposes validated canvas operations only. It does not provide arbitrary file, shell, browser, or computer access.

## Cloud clients and setup

A local companion is reachable only from your computer. A cloud client needs its supported secure tunnel or a reachable HTTPS MCP endpoint. Plugging in the USB and starting MCP does not bypass that client's account requirements or connection approval.

For ChatGPT, follow the [official ChatGPT MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) and the included [ChatGPT setup guide](CHATGPT_MCP.md). Existing `start-chatgpt-tunnel.ps1` remains available for an explicitly configured Secure MCP Tunnel. The MCP launcher does not start a public tunnel or alter an AI account automatically. Keep tunnel credentials private and enter them only through your trusted setup process. No paid model API is required by Canvas Live itself.

Each computer or AI application may need an initial connection setup. Changing the companion port or restarting it rotates its local credentials. The status window always shows the current local address. Refresh your local client's address/token or reconnect your configured tunnel after a restart. The browser Share button discovers the current local companion automatically.

## Build and verification

`npm run package:windows` builds the website and companion, compiles both Windows launchers, and packages the official pinned Node runtime. `scripts/package-mcp-runtime.ps1` verifies the published archive and executable SHA256 values and a valid OpenJS Authenticode signature before copying the runtime. Provenance and complete Node dependency licenses accompany the runtime. The companion executable checks the runtime SHA256 before starting it.

Discovery is a narrowly scoped GET endpoint on the native canvas server. It requires the exact native Host, a dedicated request header, and same-origin/absent Origin with no cross-site fetch metadata. Its bounded response contains only the loopback companion address and browser pairing credential. The separate MCP bearer token is never returned to the browser. Runtime credentials live in the package's ignored `.canvas-live/` directory and must not be committed or shared. Stopping the MCP launcher removes its session registration.

The portable launcher uses a per-user, per-folder mutex. Repeated clicks reuse the same companion; separate copied folders remain independent. The MCP server binds to loopback and chooses an available port. Stopping the launcher stops only the child process that it started. No process-control HTTP endpoint is exposed.

Automated verification covers browser sharing and navigation cancellation, authenticated client identity, discovery access checks and bounded replies, startup without global Node, copied-folder isolation, a relocated USB root forwarder, normal stop and launcher-crash cleanup. It does not establish that a particular ChatGPT or Claude account has approved a live cloud connection.

## Recovering a failed connection

Open both Canvas Live.exe and Canvas Live MCP.exe. In Workspace AI, choose **Share this canvas**; the portable app discovers its own companion and current port. Pasted browser pairing codes now use that same discovered port. The browser pairing field rejects stale codes or the separate MCP access token with instructions. Paste the MCP access token only into the AI client's connection settings, using the current address in the MCP status window. The bundled repository plugin example uses development port 8787; update that URL when the portable status window shows another port. A stopped service or computer restart requires opening the portable launcher again. Restarting the companion also requires updating the AI client's credential.
