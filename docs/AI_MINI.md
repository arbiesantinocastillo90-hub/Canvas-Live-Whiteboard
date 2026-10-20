# AI mini and shared canvases

Workspace AI can display a small interactive companion while its canvas is connecting or shared. The mini represents that explicit MCP connection. It is an interface overlay, not an object added to the drawing or an AI model running inside Canvas Live.

Click the mini to open its actions and status bubble. Drag it within the canvas pane, or move its focused control with the keyboard. Minimize it to keep a smaller indicator. Use **Customize AI mini** in Workspace AI to open settings, including before sharing.

The settings dialog includes a live appearance preview and an Idle/Working preview selector. It works before connecting, so you can see and customize the mini without an AI runtime key. The preview is labeled separately from actual connection activity; the floating mini appears while connecting or sharing.

Settings include a robot, cat or orb, a name, colors, size, speech bubbles, separate idle and working motions, speed and movement amount. A bounded PNG, GIF or WebP can replace the built-in mascot. Settings and image references belong to the workspace and use native storage when available. Reduced-motion preferences stop movement and avoid playing a custom animation.

The bubble reports observable connection events: waiting, reading or editing, the latest acknowledged operation, and connection errors. An animation is a short indicator of that activity, not a progress estimate or a representation of the model's private reasoning. Labels and operation summaries are displayed as literal text.

Client branding comes from the authenticated MCP client's reported name. It identifies that client, not its underlying model or subscription. Unknown clients retain a neutral badge and their reported name. Provider marks remain separate from the customizable mascot.

The static badges use unaltered official OpenAI artwork for OpenAI, ChatGPT and Codex, plus the corresponding official Claude and Anthropic marks. Other client badges use text until an official asset is bundled. The marks never inherit the mascot's colors or animation. See the bundled [trademark and source notices](../public/assets/ai-clients/NOTICE.txt); these client marks are not covered by the project's MIT license or a claim of provider endorsement.

Custom image uploads are checked against their raster file signatures and limited to 2 MiB. Both the app and operating system reduced-motion options replace custom images with a static robot, preventing animated GIF, WebP and PNG playback. A failed portable settings write retains the current appearance and browser cache and reports an error. Escape, pointer cancellation, lost capture or window focus loss cancels a drag without persisting its preview position. Changes do not enter the canvas Undo history.

![AI mini customization and working-animation preview](assets/ai-mini-preview.png)

This screenshot uses a disposable test canvas and a local SDK client. It demonstrates the interface, not acceptance through a cloud AI account.

## Sharing more than one canvas

Open another Canvas Live view, choose its canvas and explicitly share it there. The companion supports up to 16 independent grants. Each has its own session, document revisions, pending operation, retry history and revocation. Two views cannot take ownership of the same canonical canvas at once.

An MCP client calls `list_shared_canvases`, chooses the intended `sessionId`, then calls `get_canvas_state` with it. With several grants, an untargeted read asks the client to select a canvas rather than guessing. An operation never inherits authorization or a revision from a different canvas.

Sharing continues when a view opens Home or Options. Manual commands stay disabled on that hidden editor; explicitly shared AI commands use its retained document and Undo history. Stop sharing, switching that view's file/project/workspace, closing the view, or an expired heartbeat ends the grant. Closing the AI panel alone does not.

Local MCP and browser tests verify this behavior locally. They do not establish acceptance through a particular cloud account or tunnel. See [MCP setup](CHATGPT_MCP.md).
