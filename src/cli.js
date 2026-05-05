#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { TikTokOfficialAdapter } from './adapters/tiktok-official.js';
import { getConfig, persistEnvValues } from './config.js';
import { buildAgentManifest, buildConnectionStatus, buildPrivacyAudit, formatMarkdown } from './services/agent-surfaces.js';
import { SupabaseStorageUploader } from './storage/supabase-storage.js';
import { buildAuthUrl, createPkcePair, persistSession } from './tools/tiktok-oauth-lib.js';

const COMMANDS = new Set([
  'manifest',
  'doctor',
  'privacy-audit',
  'auth-url',
  'publish-video',
  'publish-status',
  'list-videos',
  'help'
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    if (args[key] === undefined) {
      args[key] = next;
    } else if (Array.isArray(args[key])) {
      args[key].push(next);
    } else {
      args[key] = [args[key], next];
    }
    i += 1;
  }
  return args;
}

function asArray(value) {
  if (Array.isArray(value)) return value.flatMap(asArray);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function readText(args, key) {
  const file = args[`${key}-file`];
  if (file) return fs.readFileSync(String(file), 'utf8').trim();
  return String(args[key] || '').trim();
}

function readJson(value, fallback = {}) {
  if (!value) return fallback;
  return JSON.parse(String(value));
}

function output(data, args, title = 'Result') {
  if (args.format === 'markdown') {
    console.log(formatMarkdown(title, data));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

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

function buildPublishJob(args) {
  const mediaPaths = asArray(args.media || args.video || args.file);
  if (!mediaPaths.length) throw new Error('Missing --video <FILE> or --media <FILE>');
  const metadata = {
    ...readJson(args.metadata, {}),
    ...(args.title ? { title: String(args.title) } : {}),
    ...(args['post-mode'] ? { post_mode: String(args['post-mode']).toUpperCase() } : {}),
    ...(args['media-type'] ? { media_type: String(args['media-type']).toUpperCase() } : {}),
    ...(args.slot ? { slot: String(args.slot) } : {})
  };
  return {
    id: String(args.id || `tiktok_${Date.now()}`),
    platform: 'tiktok',
    status: 'queued',
    createdAt: new Date().toISOString(),
    caption: readText(args, 'caption'),
    targetUrl: String(args.url || args['target-url'] || '').trim(),
    mediaPaths,
    metadata
  };
}

function help() {
  return {
    name: 'tiktok-agent-publisher',
    usage: [
      'tiktok-agent-publisher doctor',
      'tiktok-agent-publisher manifest --client codex',
      'tiktok-agent-publisher auth-url --redirect-uri http://localhost:8787/callback',
      'tiktok-agent-publisher publish-video --video ./short.mp4 --caption "Launch copy"',
      'tiktok-agent-publisher publish-status --publish-id <id>',
      'tiktok-agent-publisher list-videos --max-count 10'
    ],
    safety: 'Dry-run is enabled by default. Set TIKTOK_DRY_RUN=false only after doctor is clean.'
  };
}

export async function runCliCommand(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  if (!COMMANDS.has(command)) return undefined;

  const args = parseArgs(argv.slice(1));
  const cfg = getConfig();

  if (command === 'help') {
    output(help(), args, 'TikTok Agent Publisher');
    return 0;
  }

  if (command === 'manifest') {
    output(buildAgentManifest({ client: args.client || 'generic' }), args, 'TikTok Agent Manifest');
    return 0;
  }

  if (command === 'doctor') {
    output(buildConnectionStatus({ env: process.env }), args, 'TikTok Connection Status');
    return 0;
  }

  if (command === 'privacy-audit') {
    output(buildPrivacyAudit(), args, 'TikTok Privacy Audit');
    return 0;
  }

  if (command === 'auth-url') {
    const redirectUri = String(args['redirect-uri'] || process.env.TIKTOK_REDIRECT_URI || '').trim();
    if (!cfg.tiktok.clientKey) throw new Error('Missing TIKTOK_CLIENT_KEY');
    if (!redirectUri) throw new Error('Missing --redirect-uri or TIKTOK_REDIRECT_URI');
    const pkce = createPkcePair();
    const state = String(args.state || crypto.randomUUID());
    const scopes = asArray(args.scopes || 'user.info.basic,video.upload,video.publish');
    const sessionPath = path.join(cfg.dataDir, '.tiktok-oauth-session.json');
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    persistSession(sessionPath, {
      provider: 'tiktok',
      state,
      redirectUri,
      codeVerifier: pkce.verifier,
      scopes,
      createdAt: new Date().toISOString()
    });
    output({
      auth_url: buildAuthUrl({
        clientKey: cfg.tiktok.clientKey,
        redirectUri,
        scopes,
        state,
        codeChallenge: pkce.challenge
      }),
      state,
      session_path: sessionPath,
      next_step: 'Open auth_url, complete OAuth, then exchange the callback code with your preferred OAuth handler.'
    }, args, 'TikTok OAuth URL');
    return 0;
  }

  const adapter = createAdapter(cfg);

  if (command === 'publish-video') {
    const job = buildPublishJob(args);
    const result = await adapter.publishDraft(job);
    output({ ok: true, dry_run: cfg.tiktok.dryRun, job, result }, args, 'TikTok Publish Result');
    return 0;
  }

  if (command === 'publish-status') {
    const publishId = String(args['publish-id'] || args.id || '').trim();
    if (!publishId) throw new Error('Missing --publish-id');
    output(await adapter.fetchPublishStatus(publishId), args, 'TikTok Publish Status');
    return 0;
  }

  if (command === 'list-videos') {
    output(await adapter.listVideos({
      maxCount: Number(args['max-count'] || 20),
      cursor: args.cursor
    }), args, 'TikTok Videos');
    return 0;
  }

  return undefined;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const code = await runCliCommand();
    if (code === undefined) {
      output(help(), {}, 'TikTok Agent Publisher');
      process.exitCode = 1;
    } else {
      process.exitCode = code;
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
