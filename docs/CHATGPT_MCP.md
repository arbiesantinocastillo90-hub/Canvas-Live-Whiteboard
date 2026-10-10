# Connect Canvas Live to ChatGPT

Canvas Live provides a local MCP companion for the LCANVAS file you explicitly share from the browser. The companion runs at `http://127.0.0.1:8787/mcp`. It exposes validated canvas operations and waits for the browser to acknowledge changes. It does not use a model API or save files automatically.

For ChatGPT on the web, connect through OpenAI Secure MCP Tunnel. This route keeps the companion on loopback and gives ChatGPT an authenticated tunnel to it. A desktop client can instead connect locally. Local protocol tests do not establish that a ChatGPT account has connected successfully; complete the live acceptance steps below.

## Start and share a file

1. Open Canvas Live, choose a project and open an LCANVAS file. In the packaged folder, open **Canvas Live.exe** before starting its companion so the companion can recognize the website's actual address if the preferred port is occupied.
2. Open a terminal in the repository and run `npm run mcp`. In the packaged Windows folder, you can instead open **Start Canvas Live MCP.cmd**. Keep the companion running while using the integration. It requires Node.js 24; the repository command also requires the installed dependencies. **Canvas Live.exe** continues to open the website without Node.js, while MCP is an optional companion.
3. Open the Workspace AI panel. Enter the browser pairing code printed by the companion, then select **Share this canvas**.
4. Check the shared file name before making an AI request. **Stop sharing** revokes the browser connection. Switching files or leaving Work also stops sharing; closing the AI panel keeps that file shared.

The pairing code authorizes a browser tab. The separate `mcpToken` authorizes an MCP client. Neither is an OpenAI API key. The companion stores its current connection details in the ignored `.canvas-live/mcp-session.json` file; this file contains secrets and stays on this computer. Do not paste its contents into a conversation or commit it. Restarting the companion regenerates its credentials, so pair the browser again and update the desktop client's credential or restart the tunnel helper. If restarting the website launcher changes its port, restart the companion after opening the website to recognize that exact address.

The active shared file can include unsaved changes. AI edits join the editor's undo history and remain unsaved until you choose **Save**. The `undo_operation` and `redo_operation` MCP tools use this same history: Undo can reverse the latest manual or AI action. An atomic batch is one undo step. Export creates a portable LCANVAS backup through the browser; MCP does not save or export files. Other projects and files are outside this connection's authority.

Start every workflow with `get_canvas_state`. Use its `sessionId` for subsequent calls and its latest `revision` as `expectedRevision` for writes. Each write also requires a unique `operationId`; reuse that identifier only when retrying the same logical change with the same arguments. A completed retry returns the previous result instead of applying the change twice.

## ChatGPT web: private tunnel

OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) requires a Platform tunnel identifier and a runtime key. Tunnel creation requires **Tunnels Read + Manage**; running the client requires **Tunnels Read + Use**. Associate the tunnel with the ChatGPT workspace that will use it. Account access and any applicable tunnel billing have not been verified for this owner; this integration does not create a subscription or call the model API.

1. Open [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels). Create or choose a tunnel and retain its complete `tunnel_id`.
2. Create a runtime key in [Platform API keys](https://platform.openai.com/settings/organization/api-keys) with the required tunnel permissions. Use a runtime key, not an admin key.
3. Use the supported Windows `tunnel-client` from the Platform page or the [official latest release](https://github.com/openai/tunnel-client/releases/latest). Use the full client, which includes `doctor` and profile commands. Review the release verification instructions and keep its accompanying license files. It is a separate optional component, not bundled into Canvas Live. On this laptop, a verified full client was prepared under the repository's ignored `test-results/tunnel-client/v0.0.16/full-client/` folder; its adjacent `verification-report.json` records the checks. Use that executable's complete path for `-TunnelClientPath`, or obtain a newer verified release when appropriate.
4. In a second PowerShell terminal, enter the runtime key locally without printing it:

```powershell
$canvasTunnelKey = Read-Host 'OpenAI tunnel runtime key' -AsSecureString
$env:CONTROL_PLANE_API_KEY = [System.Net.NetworkCredential]::new('', $canvasTunnelKey).Password
```

5. Run the supplied helper from the repository, replacing the example tunnel identifier and client path:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-chatgpt-tunnel.ps1 -TunnelId 'tunnel_your_complete_identifier' -TunnelClientPath 'C:\Tools\tunnel-client\tunnel-client.exe'
```

The helper reads the local MCP credential from `.canvas-live/mcp-session.json`, supplies it only to the local companion, checks the tunnel configuration and runs the tunnel in the foreground. Its dedicated `canvas-live` profile is regenerated under that credential folder's `tunnel-profiles`; global tunnel profiles are untouched. The MCP bearer environment variable is restored when the helper exits. Keep both the companion and tunnel terminals running. Stop the tunnel with Ctrl+C when finished, then close its terminal to discard the key's process environment. The helper beside the packaged executable automatically reads that folder's credentials. You can also supply `-CredentialPath` with the absolute path to another companion's `.canvas-live/mcp-session.json`.

From the packaged folder, the helper command is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-chatgpt-tunnel.ps1 -TunnelId 'tunnel_your_complete_identifier' -TunnelClientPath 'C:\Tools\tunnel-client\tunnel-client.exe'
```

This configuration uses ChatGPT's **No authentication** choice for the private tunnel's MCP connection. Access to the tunnel is controlled by OpenAI's tunnel permissions; the client adds Canvas Live's separate bearer token to the local HTTP request. The companion continues to require authentication. This is not an unauthenticated public endpoint.

### Manual tunnel command equivalent

If you need to inspect the helper's configuration, the full client supports these commands. Run them after setting `CONTROL_PLANE_API_KEY` and starting the companion:

```powershell
$canvasMcpSession = Get-Content -LiteralPath '.canvas-live/mcp-session.json' -Raw | ConvertFrom-Json
$env:CANVAS_MCP_AUTHORIZATION = 'Bearer ' + $canvasMcpSession.mcpToken
$canvasTunnelProfiles = Join-Path (Get-Location).Path '.canvas-live/tunnel-profiles'
& 'C:\Tools\tunnel-client\tunnel-client.exe' init --sample sample_mcp_remote_no_auth --profile canvas-live --profile-dir $canvasTunnelProfiles --force --tunnel-id 'tunnel_your_complete_identifier' --mcp-server-url $canvasMcpSession.url
& 'C:\Tools\tunnel-client\tunnel-client.exe' doctor --profile canvas-live --profile-dir $canvasTunnelProfiles --explain
& 'C:\Tools\tunnel-client\tunnel-client.exe' run --profile canvas-live --profile-dir $canvasTunnelProfiles --mcp.extra-headers 'Authorization: env:CANVAS_MCP_AUTHORIZATION'
```

The [client configuration reference](https://github.com/openai/tunnel-client/blob/master/docs/configuration.md) documents environment references for static MCP headers. The header is sent to the configured MCP origin. Connector-supplied headers take precedence, so do not configure an additional OAuth credential for this private, locally authenticated setup. The supplied helper checks each command's exit status and restores the bearer variable; when inspecting commands manually, continue only after each succeeds and close the terminal afterward.

### Add the plugin

1. In ChatGPT on the web, open [Plugins](https://chatgpt.com/plugins), select the plus button, then **Add custom MCP server**.
2. Name it **Canvas Live**. Under **Connection**, choose **Tunnel** and select the tunnel, or enter its complete identifier.
3. Select **No authentication**, review the displayed access warning and choose **Create as a plugin**.
4. Install the resulting plugin. Start a new conversation, type `@` and select **Canvas Live**.
5. Inspect its discovered tools and run the acceptance prompts below.

These steps and supported Streaming HTTP/SSE transports come from OpenAI's [custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server). The server URL `127.0.0.1` is local to this computer; entering it as a direct server URL in a hosted web client does not connect the laptop.

## Optional local desktop connection

The repository includes a local plugin package in `plugins/canvas-live/` and a repository marketplace at `.agents/plugins/marketplace.json`. The Windows package includes the same plugin files under `plugin/`. In a desktop client that loads repository marketplaces, open this trusted project and restart the app, find **Canvas Live** in its local marketplace, then install it. Its `mcp.json` declares Streamable HTTP and API-key authentication with the bearer scheme. Enter the local `mcpToken` when the client requests its credential. No credential is included in the plugin package. This local package's installation and credential prompt must still be verified in the target desktop app. OpenAI documents this package format in [Package your plugin](https://developers.openai.com/plugins/build/plugins).

The [MCP configuration guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) supports local Streamable HTTP servers and bearer tokens in the ChatGPT desktop app. In **Settings → MCP servers → Add server**, choose Streamable HTTP and use `http://127.0.0.1:8787/mcp`. Supply the current local `mcpToken` through the client's credential configuration. Save and restart the connection. This route does not require a Platform tunnel or tunnel runtime key.

For a client using the shared local configuration, this example keeps the credential in an environment variable:

```toml
[mcp_servers.canvas_live]
url = "http://127.0.0.1:8787/mcp"
bearer_token_env_var = "CANVAS_LIVE_MCP_TOKEN"
```

Set that variable in the local client's environment to the `mcpToken` from the session file before starting the client. The local package points to port 8787; for a custom companion port, update the client connection URL to match. A hosted ChatGPT web conversation does not read local Codex configuration. Desktop support and credential entry must be checked in the installed client; configuration examples are not proof of a completed account connection.

## Live acceptance

Use a blank test file first. Invoke `@Canvas Live` and ask:

> Get the currently shared canvas. Tell me its file name, session identifier and revision. Create two labelled rectangles called Start and Finish, then connect Start to Finish with an arrow. Use the current session identifier, latest revision and a unique operation identifier for every edit.

Check that the objects appear in that same file. Ask ChatGPT to call `undo_operation` and verify that the last AI edit disappears; call `redo_operation` and verify that it returns. Also use the canvas's **Undo** button to confirm that manual controls share the same history. Move an object manually, then ask ChatGPT to read the canvas again before editing. The model must refresh state after a revision conflict instead of replaying an outdated edit.

Select **Stop sharing** and ask ChatGPT to read or edit again. It must receive a disconnected/no shared canvas error. Re-share a different file and confirm that an old session identifier cannot affect it. Save, reload and export the test file to verify persistence separately from the MCP connection.

Record the tool name, target file, arguments, result and observed browser change for each prompt. Report **ChatGPT connected** only after an actual ChatGPT call succeeds and its intended browser effect is observed. A companion connection or successful local test client establishes only that component.

## Troubleshooting

| Symptom                          | Check                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The browser cannot pair          | Companion is running; pairing code is current; the correct local URL is used.                           |
| ChatGPT cannot find the tunnel   | Target ChatGPT workspace association and Tunnels Read + Use access.                                     |
| Tunnel is not ready              | Run `tunnel-client doctor`; inspect its local health UI and the local companion.                        |
| MCP request is unauthorized      | Local bearer token matches the current session file; browser pairing code is not used as the MCP token. |
| No shared canvas                 | Open a file and select Share this canvas; keep that browser tab running.                                |
| Revision/session conflict        | Call `get_canvas_state` again and use the newly returned identifiers/revision.                          |
| A tool is absent after an update | Restart the companion, refresh the connection's tools in ChatGPT and start a new conversation.          |
| Changes disappear after reload   | Choose Save before reloading; MCP edits are not automatic file saves.                                   |

## Verification boundary

The tunnel helper passed 23 local checks using a fixture executable: repository/package paths, custom local port, secret header reference, environment restoration, startup error handling and invalid-input rejection. These checks did not contact OpenAI or start a network tunnel. The plugin manifests and marketplace were parsed and checked against the documented format; installation and account credentials were not changed.

Changing the authenticated transport or publishing this integration requires a separate deployment decision. This setup keeps the development website and browser bridge private.
