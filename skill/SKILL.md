---
name: tiktok-agent
description: >
  TikTok Agent Publisher. Prefer MCP tools if connected; otherwise the package CLI.
---

# TikTok Agent Publisher — skill or MCP

Same package, two doors.

```bash
npx -y tiktok-agent-publisher call tiktok_connection_status --json '{}'
```

If MCP tools are already connected, use them. Do not invent mutation flags.

