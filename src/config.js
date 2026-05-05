import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function loadDotEnv(cwd = process.cwd(), env = process.env) {
  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath)) return env;

  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in env)) env[key] = value;
  }
  return env;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function getConfig({ cwd = process.cwd(), env = process.env } = {}) {
  loadDotEnv(cwd, env);
  return {
    envPath: path.join(cwd, '.env'),
    dataDir: env.TIKTOK_AGENT_DATA_DIR || path.join(cwd, '.agent-data'),
    tiktok: {
      dryRun: bool(env.TIKTOK_DRY_RUN, true),
      clientKey: env.TIKTOK_CLIENT_KEY || '',
      clientSecret: env.TIKTOK_CLIENT_SECRET || '',
      accessToken: env.TIKTOK_ACCESS_TOKEN || '',
      refreshToken: env.TIKTOK_REFRESH_TOKEN || '',
      accessTokenExpiresIn: Number(env.TIKTOK_ACCESS_TOKEN_EXPIRES_IN || 0),
      baseUrl: env.TIKTOK_OPEN_API_BASE || 'https://open.tiktokapis.com',
      postMode: env.TIKTOK_POST_MODE || 'MEDIA_UPLOAD',
      privacyLevel: env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
      autoAddMusic: bool(env.TIKTOK_AUTO_ADD_MUSIC, true),
      storagePrefix: env.TIKTOK_STORAGE_PREFIX || 'tiktok',
      endpoints: {
        oauthToken: env.TIKTOK_ENDPOINT_OAUTH_TOKEN || '/v2/oauth/token/',
        creatorInfo: env.TIKTOK_ENDPOINT_CREATOR_INFO || '/v2/post/publish/creator_info/query/',
        createDraft: env.TIKTOK_ENDPOINT_CREATE_DRAFT || '/v2/post/publish/content/init/',
        videoUploadInit: env.TIKTOK_ENDPOINT_VIDEO_UPLOAD_INIT || '/v2/post/publish/inbox/video/init/',
        videoDirectInit: env.TIKTOK_ENDPOINT_VIDEO_DIRECT_INIT || '/v2/post/publish/video/init/',
        publishStatus: env.TIKTOK_ENDPOINT_PUBLISH_STATUS || '/v2/post/publish/status/fetch/',
        postInsights: env.TIKTOK_ENDPOINT_POST_INSIGHTS || '/v2/research/video/query/',
        videoList: env.TIKTOK_ENDPOINT_VIDEO_LIST || '/v2/video/list/',
        videoQuery: env.TIKTOK_ENDPOINT_VIDEO_QUERY || '/v2/video/query/'
      }
    },
    supabase: {
      url: env.SUPABASE_URL || '',
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
      bucket: env.SUPABASE_BUCKET || 'tiktok-media',
      publicBaseUrl: env.PUBLIC_MEDIA_BASE_URL || ''
    },
    mcp: {
      host: env.TIKTOK_MCP_HOST || '127.0.0.1',
      port: Number(env.TIKTOK_MCP_PORT || 3031),
      allowedOrigin: env.TIKTOK_MCP_ALLOWED_ORIGIN || ''
    }
  };
}

export function persistEnvValues(envPath, values) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const keys = new Set(Object.keys(values));
  const seen = new Set();
  const next = current.map((line) => {
    const idx = line.indexOf('=');
    if (idx < 1) return line;
    const key = line.slice(0, idx);
    if (!keys.has(key)) return line;
    seen.add(key);
    return `${key}=${values[key] ?? ''}`;
  });
  for (const key of keys) {
    if (!seen.has(key)) next.push(`${key}=${values[key] ?? ''}`);
  }
  fs.writeFileSync(envPath, `${next.filter((line) => line !== '').join('\n')}\n`, { mode: 0o600 });
}
