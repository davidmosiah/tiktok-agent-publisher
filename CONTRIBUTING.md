# Contributing

Contributions are welcome around publishing plans, OAuth readiness, dry-run safety, TikTok API ergonomics, MCP tools, tests and docs.

## Local development

```bash
npm ci
npm run check
npm test
npm run doctor
npm run manifest
npm run privacy
```

## Design rules

- Keep dry-run behavior the default for agent workflows.
- Never commit OAuth credentials, refresh tokens, app secrets, private video assets, upload logs with account data or local config.
- Keep live publishing behind explicit user intent.
- Preserve manifest, connection status, privacy audit and metadata checks.

## Pull request checklist

- `npm run check` passes.
- `npm test` passes.
- README, `llms.txt` and examples are updated when commands or tools change.
