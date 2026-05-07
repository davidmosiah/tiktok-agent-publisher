# Agent Development Notes

## Scope

This repo is an agent-first TikTok publishing CLI and MCP server with dry-run defaults.

## Commands

- Install: `npm ci`
- Syntax check: `npm run check`
- Test: `npm test`
- Doctor: `npm run doctor`
- Manifest: `npm run manifest`
- Privacy audit: `npm run privacy`

## Rules

- Never commit OAuth credentials, refresh tokens, app secrets, video assets with private rights, upload logs with private account data, or local config.
- Keep dry-run behavior the default for agent workflows.
- Preserve manifest, connection status, privacy audit and metadata checks.
- Keep live publishing behind explicit user intent.
