export const SUPPORTED_CLIENTS = ['generic', 'claude', 'codex', 'cursor', 'windsurf', 'hermes', 'openclaw'];

function safeClient(client = 'generic') {
  return SUPPORTED_CLIENTS.includes(client) ? client : 'generic';
}

function present(env, key) {
  return Boolean(String(env?.[key] || '').trim());
}

function enabled(env, key, fallback = false) {
  const value = env?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function buildAgentManifest({ client = 'generic' } = {}) {
  return {
    project: 'tiktok-agent-publisher',
    mcp_name: 'io.github.davidmosiah/tiktok-agent-publisher',
    client: safeClient(client),
    package: {
      name: 'tiktok-agent-publisher',
      install_command: 'npx -y tiktok-agent-publisher',
      binary: 'tiktok-agent-publisher'
    },
    supported_clients: SUPPORTED_CLIENTS,
    standard_tools: [
      'tiktok_agent_manifest',
      'tiktok_connection_status',
      'tiktok_privacy_audit',
      'tiktok_oauth_authorize_url',
      'tiktok_publish_video',
      'tiktok_publish_status',
      'tiktok_list_videos'
    ],
    recommended_first_calls: ['tiktok_connection_status', 'tiktok_privacy_audit'],
    hermes: {
      config_path: '~/.hermes/config.yaml',
      tool_name_prefix: 'mcp_tiktok_',
      reload_after_config_change: '/reload-mcp or hermes mcp test tiktok',
      recommended_config: 'mcp_servers:\n  tiktok:\n    command: npx\n    args: ["-y", "tiktok-agent-publisher"]\n    sampling:\n      enabled: false'
    },
    agent_rules: [
      'Call tiktok_connection_status before any publish attempt.',
      'Default to dry-run until the user explicitly confirms live posting.',
      'Never ask the model to paste or reveal TikTok access tokens, refresh tokens or client secrets.',
      'Use MEDIA_UPLOAD inbox mode when the app is unaudited or when human final review is desired.',
      'Only publish media the user owns or has rights to post.'
    ]
  };
}

export function buildConnectionStatus({ env = process.env } = {}) {
  const configured = {
    client_key: present(env, 'TIKTOK_CLIENT_KEY'),
    client_secret: present(env, 'TIKTOK_CLIENT_SECRET'),
    access_token: present(env, 'TIKTOK_ACCESS_TOKEN'),
    refresh_token: present(env, 'TIKTOK_REFRESH_TOKEN'),
    public_media_base_url: present(env, 'PUBLIC_MEDIA_BASE_URL'),
    supabase_storage: present(env, 'SUPABASE_URL') && present(env, 'SUPABASE_SERVICE_ROLE_KEY')
  };
  const dryRun = enabled(env, 'TIKTOK_DRY_RUN', true);
  const missing = [];
  if (!configured.client_key) missing.push('TIKTOK_CLIENT_KEY');
  if (!configured.client_secret) missing.push('TIKTOK_CLIENT_SECRET');
  if (!configured.access_token) missing.push('TIKTOK_ACCESS_TOKEN');
  if (!configured.refresh_token) missing.push('TIKTOK_REFRESH_TOKEN');

  return {
    ok: dryRun || missing.length === 0,
    dry_run: dryRun,
    configured,
    missing,
    ready_for_live_publish: !dryRun && missing.length === 0,
    ready_for_direct_video_upload: !dryRun && configured.access_token,
    next_steps: dryRun
      ? ['Current mode is dry-run. Use dry-run to validate agent workflow before live posting.']
      : missing.length
        ? [`Configure missing values: ${missing.join(', ')}`, 'Run tiktok-agent-publisher auth-url or your OAuth flow, then rerun doctor.']
        : ['Ready for live TikTok API calls. Keep MEDIA_UPLOAD when human review is required.']
  };
}

export function buildPrivacyAudit() {
  return {
    project: 'tiktok-agent-publisher',
    secrets_returned_to_agent: false,
    local_files_ignored: ['.env', '.agent-data/', '.tiktok-oauth-session.json', 'node_modules/', 'coverage/'],
    external_services: ['TikTok Content Posting API', 'TikTok OAuth', 'optional Supabase Storage or user-provided public media host'],
    token_storage: 'Environment variables or local .env with user-only file permissions; tokens are never returned by tools.',
    media_policy: 'The agent sends local files only when the user provides paths and confirms live publishing. Public URL publishing requires a user-controlled verified media host.',
    safety_rules: [
      'Dry-run is the default.',
      'Never commit tokens, OAuth sessions, upload URLs, analytics dumps or generated runtime data.',
      'Only post content the user owns or has permission to publish.',
      'Use explicit confirmation before live direct posting.',
      'Respect TikTok app review, scopes and Content Posting API terms.'
    ]
  };
}

export function formatMarkdown(title, data) {
  return [`# ${title}`, '', '```json', JSON.stringify(data, null, 2), '```'].join('\n');
}
