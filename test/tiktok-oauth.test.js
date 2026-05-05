import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildAuthUrl,
  createPkcePair,
  loadSession,
  persistSession
} from '../src/tools/tiktok-oauth-lib.js';

test('buildAuthUrl includes PKCE parameters', () => {
  const pkce = createPkcePair();
  const url = new URL(buildAuthUrl({
    clientKey: 'client_key',
    redirectUri: 'http://localhost:8787/callback',
    scopes: ['user.info.basic', 'video.publish'],
    state: 'state_123',
    codeChallenge: pkce.challenge
  }));

  assert.equal(url.searchParams.get('client_key'), 'client_key');
  assert.equal(url.searchParams.get('state'), 'state_123');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), pkce.challenge);
  assert.ok(pkce.verifier.length >= 43);
  assert.match(pkce.challenge, /^[a-f0-9]{64}$/);
});

test('persistSession and loadSession preserve code verifier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delx-tiktok-oauth-'));
  const sessionPath = path.join(dir, 'session.json');
  const session = {
    state: 'state_abc',
    redirectUri: 'http://localhost:8787/callback',
    codeVerifier: 'verifier_xyz'
  };

  persistSession(sessionPath, session);
  const loaded = loadSession(sessionPath);

  assert.deepEqual(loaded, session);
});
