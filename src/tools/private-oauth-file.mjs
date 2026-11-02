import fs from 'node:fs';

// New sensitive files are private. Never silently change permissions on an
// existing file: refuse unsafe POSIX modes before truncation or writing.
export function writePrivateOAuthFile(filename, text) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT |
    (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
  const fd = fs.openSync(filename, flags, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('OAuth storage must be a regular file');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('OAuth storage is not private; review existing file permissions before retrying');
    }
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, text, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// Error responses may themselves contain tokens or credential-bearing metadata.
// Do not reflect any server-supplied response body in logs/errors.
export function parseOAuthTokenResponse(text, ok) {
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error('Token response is not valid JSON');
  }
  if (!ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Token exchange failed; provider response omitted');
  }
  if (/[\r\n]/.test(data.access_token) || (data.refresh_token !== undefined &&
      (typeof data.refresh_token !== 'string' || /[\r\n]/.test(data.refresh_token)))) {
    throw new Error('Token exchange returned unsupported token format');
  }
  if (data.expires_in !== undefined && data.expires_in !== null &&
      !/^[0-9]+$/.test(String(data.expires_in))) {
    throw new Error('Token exchange returned unsupported expiry format');
  }
  return data;
}
