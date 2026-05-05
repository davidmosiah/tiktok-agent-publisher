import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAgentManifest,
  buildConnectionStatus,
  buildPrivacyAudit
} from '../src/services/agent-surfaces.js';

test('TikTok agent manifest exposes multi-client MCP guidance without secrets', () => {
  const manifest = buildAgentManifest({ client: 'hermes' });

  assert.equal(manifest.project, 'tiktok-agent-publisher');
  assert.equal(manifest.client, 'hermes');
  assert.ok(manifest.supported_clients.includes('codex'));
  assert.ok(manifest.supported_clients.includes('openclaw'));
  assert.ok(manifest.recommended_first_calls.includes('tiktok_connection_status'));
  assert.doesNotMatch(JSON.stringify(manifest), /access_token|refresh_token|client_secret/i);
});

test('TikTok connection status distinguishes dry-run from publish-ready config', () => {
  const status = buildConnectionStatus({
    env: {
      TIKTOK_DRY_RUN: 'true',
      TIKTOK_CLIENT_KEY: 'client_key',
      TIKTOK_CLIENT_SECRET: '',
      TIKTOK_ACCESS_TOKEN: ''
    }
  });

  assert.equal(status.ready_for_live_publish, false);
  assert.equal(status.dry_run, true);
  assert.ok(status.missing.includes('TIKTOK_CLIENT_SECRET'));
  assert.ok(status.next_steps[0].includes('dry-run'));
});

test('TikTok privacy audit makes token and media-hosting boundaries explicit', () => {
  const audit = buildPrivacyAudit();

  assert.equal(audit.secrets_returned_to_agent, false);
  assert.ok(audit.local_files_ignored.includes('.env'));
  assert.ok(audit.external_services.includes('TikTok Content Posting API'));
  assert.ok(audit.safety_rules.some((rule) => /dry-run/i.test(rule)));
});
