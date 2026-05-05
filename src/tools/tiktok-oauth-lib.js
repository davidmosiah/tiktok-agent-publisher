import crypto from 'node:crypto';
import fs from 'node:fs';

export function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  // TikTok desktop Login Kit expects SHA256 in hex encoding.
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return { verifier, challenge, method: 'S256' };
}

export function buildAuthUrl({ clientKey, redirectUri, scopes, state, codeChallenge }) {
  const q = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`;
}

export function persistSession(sessionPath, session) {
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2) + '\n', 'utf8');
}

export function loadSession(sessionPath) {
  if (!fs.existsSync(sessionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  } catch {
    return null;
  }
}
