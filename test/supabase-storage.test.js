import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SupabaseStorageUploader } from '../src/storage/supabase-storage.js';

test('SupabaseStorageUploader uploads files and returns public URLs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delx-supabase-'));
  const file = path.join(dir, 'slide1.png');
  fs.writeFileSync(file, Buffer.from('png-data'));

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith('/storage/v1/bucket')) {
      return new Response(JSON.stringify({ id: 'tiktok-slides' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url).includes('/storage/v1/object/tiktok-slides/')) {
      return new Response(JSON.stringify({ Key: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const uploader = new SupabaseStorageUploader({
    url: 'https://msrcnvvoifnuemqosvsx.supabase.co',
    serviceRoleKey: 'srv_role',
    bucket: 'tiktok-slides'
  }, { fetchImpl });

  const urls = await uploader.uploadFiles([file], 'tiktok/2026-03-11/run-123');

  assert.equal(urls.length, 1);
  assert.equal(
    urls[0],
    'https://msrcnvvoifnuemqosvsx.supabase.co/storage/v1/object/public/tiktok-slides/tiktok/2026-03-11/run-123/slide1.png'
  );
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].url), /\/storage\/v1\/object\/tiktok-slides\/tiktok\/2026-03-11\/run-123\/slide1\.png$/);
  assert.equal(calls[1].options.headers['x-upsert'], 'true');
});

test('SupabaseStorageUploader can expose files through a custom public base URL', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delx-supabase-public-'));
  const file = path.join(dir, 'slide2.png');
  fs.writeFileSync(file, Buffer.from('png-data'));

  const fetchImpl = async (url) => {
    if (String(url).endsWith('/storage/v1/bucket')) {
      return new Response(JSON.stringify({ id: 'tiktok-slides' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ Key: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const uploader = new SupabaseStorageUploader({
    url: 'https://msrcnvvoifnuemqosvsx.supabase.co',
    serviceRoleKey: 'srv_role',
    bucket: 'tiktok-slides',
    publicBaseUrl: 'https://robloxdrop.app/tiktok-media'
  }, { fetchImpl });

  const urls = await uploader.uploadFiles([file], 'tiktok/2026-03-11/run-999');

  assert.deepEqual(urls, [
    'https://robloxdrop.app/tiktok-media/tiktok/2026-03-11/run-999/slide2.png'
  ]);
});
