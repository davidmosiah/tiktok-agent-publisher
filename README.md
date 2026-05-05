# TikTok Agent Publisher

Local-first TikTok Content Posting API tooling for AI agents. It gives Codex, Claude, Cursor, Hermes, OpenClaw and other MCP clients a safe way to check readiness, build OAuth URLs, dry-run publish flows and upload TikTok videos only when live mode is explicitly enabled.

## Why It Exists

Most social publishing scripts are built for humans at a terminal. Agents need a different contract:

- a manifest that explains install/runtime rules
- a connection status tool before write operations
- privacy boundaries that never return token values
- dry-run by default
- structured JSON outputs for planning, retries and audit trails

This repo packages that contract around TikTok's official Content Posting API.

## Install

```bash
npm install -g tiktok-agent-publisher
```

Or run without installing:

```bash
npx -y tiktok-agent-publisher doctor
```

## CLI

```bash
tiktok-agent-publisher manifest --client codex
tiktok-agent-publisher doctor
tiktok-agent-publisher privacy-audit
tiktok-agent-publisher auth-url --redirect-uri http://localhost:8787/callback
tiktok-agent-publisher publish-video --video ./short.mp4 --caption "Launch copy"
tiktok-agent-publisher publish-status --publish-id <publish_id>
tiktok-agent-publisher list-videos --max-count 10
```

Dry-run is enabled by default. Set `TIKTOK_DRY_RUN=false` only after `doctor` is clean and you are ready for live API calls.

## MCP

Stdio:

```bash
tiktok-agent-mcp
```

HTTP:

```bash
TIKTOK_MCP_TRANSPORT=http tiktok-agent-mcp
```

Hermes-style config:

```yaml
mcp_servers:
  tiktok:
    command: npx
    args: ["-y", "tiktok-agent-publisher"]
    sampling:
      enabled: false
```

Recommended first calls:

1. `tiktok_connection_status`
2. `tiktok_privacy_audit`
3. `tiktok_publish_video`

## Configuration

Copy `.env.example` to `.env` and fill only the values you need. Do not commit `.env`, token files or `.agent-data/`.

For video inbox uploads, a local file can be uploaded directly through TikTok's upload URL. Photo and pull-from-url workflows can use Supabase Storage or another public media host.

## Safety Model

- Tokens are read from environment or local `.env`; tool responses never include token values.
- Live publishing is disabled unless `TIKTOK_DRY_RUN=false`.
- OAuth PKCE verifier is persisted locally in `.agent-data/` and not returned in MCP output.
- The package uses TikTok's official API surfaces; it does not automate a browser session.

## Development

```bash
npm install
npm test
npm run check
```
