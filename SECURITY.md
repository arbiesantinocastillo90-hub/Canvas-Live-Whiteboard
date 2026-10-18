# Security boundaries and reporting

Canvas Live is a student prototype with scoped security controls. It has not received a production security audit.

## Intended boundary

- Native website and companion bind to loopback.
- MCP accesses one explicitly shared canvas. Stopping sharing, switching files or leaving Work revokes the session.
- Browser pairing and MCP client credentials are separate. Credentials stay in ignored runtime storage rather than committed examples.
- Validated MCP tools provide bounded operations, without unrestricted filesystem, shell, browser or automatic-save access.
- Cloud clients need a separate supported transport and account approval. Shared content may be sent to the selected AI provider.

## Report a sensitive issue

Do not post credentials, private boards or exploit details in a public issue. Use GitHub's **Security → Report a vulnerability** if available for this repository. If unavailable, open a minimal issue asking for a private reporting channel without sensitive details. No response-time guarantee is advertised.

Stop the companion and revoke exposed external credentials if a secret is disclosed. The [MCP guide](docs/CHATGPT_MCP.md) explains credentials and restart behavior.
