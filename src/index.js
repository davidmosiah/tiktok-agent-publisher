#!/usr/bin/env node
import cors from 'cors';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { TikTokOfficialAdapter } from './adapters/tiktok-official.js';
import { getConfig, persistEnvValues } from './config.js';
import { runCliCommand } from './cli.js';
import { makeError, makeResponse, toMarkdown } from './mcp-utils.js';
import { buildAgentManifest, buildConnectionStatus, buildPrivacyAudit, formatMarkdown } from './services/agent-surfaces.js';
import { SupabaseStorageUploader } from './storage/supabase-storage.js';

const SERVER_NAME = 'tiktok-agent-publisher';
const SERVER_VERSION = '0.1.0';
const ResponseFormatSchema = z.enum(['json', 'markdown']).default('json');

function createAdapter(cfg) {
  const storageUploader = cfg.supabase.url && cfg.supabase.serviceRoleKey
    ? new SupabaseStorageUploader(cfg.supabase)
    : null;
  return new TikTokOfficialAdapter(cfg.tiktok, {
    storageUploader,
    onTokensUpdated: async (tokens) => persistEnvValues(cfg.envPath, {
      TIKTOK_ACCESS_TOKEN: tokens.accessToken,
      TIKTOK_REFRESH_TOKEN: tokens.refreshToken,
      TIKTOK_ACCESS_TOKEN_EXPIRES_IN: tokens.accessTokenExpiresIn
    })
  });
}

function registerTools(server) {
  server.registerTool('tiktok_agent_manifest', {
    title: 'TikTok Agent Manifest',
    description: 'Machine-readable install, client, runtime and safety guidance for agents.',
    inputSchema: {
      client: z.string().default('generic'),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ client, response_format }) => {
    const manifest = buildAgentManifest({ client });
    return makeResponse(manifest, response_format, formatMarkdown('TikTok Agent Manifest', manifest));
  });

  server.registerTool('tiktok_connection_status', {
    title: 'TikTok Connection Status',
    description: 'Check dry-run mode, OAuth readiness and live publish readiness without exposing tokens.',
    inputSchema: { response_format: ResponseFormatSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const status = buildConnectionStatus({ env: process.env });
    return makeResponse(status, response_format, toMarkdown('TikTok Connection Status', status));
  });

  server.registerTool('tiktok_privacy_audit', {
    title: 'TikTok Privacy Audit',
    description: 'Return token, media-hosting, local-file and live-publish safety boundaries.',
    inputSchema: { response_format: ResponseFormatSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const audit = buildPrivacyAudit();
    return makeResponse(audit, response_format, toMarkdown('TikTok Privacy Audit', audit));
  });

  server.registerTool('tiktok_publish_video', {
    title: 'Publish TikTok Video',
    description: 'Create a TikTok video publish job. Dry-run is enabled by default; live mode requires explicit TIKTOK_DRY_RUN=false.',
    inputSchema: {
      video_path: z.string(),
      caption: z.string().default(''),
      target_url: z.string().default(''),
      title: z.string().default(''),
      post_mode: z.enum(['MEDIA_UPLOAD', 'DIRECT_POST']).default('MEDIA_UPLOAD'),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async (params) => {
    try {
      const cfg = getConfig();
      const result = await createAdapter(cfg).publishDraft({
        id: `tiktok_${Date.now()}`,
        platform: 'tiktok',
        status: 'queued',
        createdAt: new Date().toISOString(),
        caption: params.caption,
        targetUrl: params.target_url,
        mediaPaths: [params.video_path],
        metadata: {
          title: params.title,
          post_mode: params.post_mode,
          media_type: 'VIDEO'
        }
      });
      const payload = { ok: true, dry_run: cfg.tiktok.dryRun, result };
      return makeResponse(payload, params.response_format, toMarkdown('TikTok Publish Result', payload));
    } catch (error) {
      return makeError(error);
    }
  });

  server.registerTool('tiktok_publish_status', {
    title: 'TikTok Publish Status',
    description: 'Fetch TikTok Content Posting API publish status by publish id.',
    inputSchema: {
      publish_id: z.string(),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ publish_id, response_format }) => {
    try {
      const status = await createAdapter(getConfig()).fetchPublishStatus(publish_id);
      return makeResponse(status, response_format, toMarkdown('TikTok Publish Status', status));
    } catch (error) {
      return makeError(error);
    }
  });

  server.registerTool('tiktok_list_videos', {
    title: 'List TikTok Videos',
    description: 'List recent TikTok videos visible to the configured OAuth token.',
    inputSchema: {
      max_count: z.number().int().min(1).max(20).default(20),
      cursor: z.union([z.string(), z.number()]).optional(),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ max_count, cursor, response_format }) => {
    try {
      const result = await createAdapter(getConfig()).listVideos({ maxCount: max_count, cursor });
      return makeResponse(result, response_format, toMarkdown('TikTok Videos', result));
    } catch (error) {
      return makeError(error);
    }
  });
}

function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server);
  return server;
}

async function runStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp() {
  const cfg = getConfig();
  const app = express();
  const allowedOrigin = cfg.mcp.allowedOrigin || `http://${cfg.mcp.host}:${cfg.mcp.port}`;
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({ origin: allowedOrigin }));
  app.get('/health', (_req, res) => res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }));
  app.post('/mcp', async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP HTTP request failed:', error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.listen(cfg.mcp.port, cfg.mcp.host, () => {
    console.error(`${SERVER_NAME} HTTP transport listening on http://${cfg.mcp.host}:${cfg.mcp.port}/mcp`);
  });
}

let cliResult;
try {
  cliResult = await runCliCommand(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (cliResult !== undefined) {
  process.exitCode = cliResult;
} else if (process.exitCode === undefined) {
  const args = new Set(process.argv.slice(2));
  const transport = process.env.TIKTOK_MCP_TRANSPORT || (args.has('--http') ? 'http' : 'stdio');
  if (transport === 'http') await runHttp();
  else await runStdio();
}
