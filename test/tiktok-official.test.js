import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { TikTokOfficialAdapter } from '../src/adapters/tiktok-official.js';

test('TikTokOfficialAdapter publishes photo posts from uploaded public URLs', async () => {
  const requests = [];
  const storageUploader = {
    async uploadFiles(mediaPaths, prefix) {
      assert.equal(mediaPaths.length, 2);
      assert.equal(prefix, 'tiktok/slot-1/job-1');
      return [
        'https://storage.example/slide1.png',
        'https://storage.example/slide2.png'
      ];
    }
  };

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      data: { publish_id: 'pub_123' },
      error: { code: 'ok', message: '' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      creatorInfo: '/v2/post/publish/creator_info/query/',
      createDraft: '/v2/post/publish/content/init/',
      videoUploadInit: '/v2/post/publish/inbox/video/init/',
      videoDirectInit: '/v2/post/publish/video/init/'
    },
    postMode: 'DIRECT_POST',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/slot-1'
  }, { fetchImpl, storageUploader });

  const result = await adapter.publishDraft({
    id: 'job-1',
    caption: 'Caption body',
    targetUrl: 'https://example.com/post/x/',
    mediaPaths: ['/tmp/slide1.png', '/tmp/slide2.png'],
    metadata: {
      title: 'Hook title',
      slot: 'morning',
      style: 'meme_chaos',
      theme: 'duo_friends',
      visual_mode: 'gameplay_capture'
    }
  });

  assert.equal(result.platformPostId, 'pub_123');
  assert.equal(requests.length, 2);

  const creatorInfoReq = JSON.parse(requests[0].options.body);
  assert.deepEqual(creatorInfoReq, {});

  const initPayload = JSON.parse(requests[1].options.body);
  assert.equal(initPayload.media_type, 'PHOTO');
  assert.equal(initPayload.post_mode, 'DIRECT_POST');
  assert.equal(initPayload.post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
  assert.equal(initPayload.post_info.auto_add_music, true);
  assert.equal(initPayload.source_info.source, 'PULL_FROM_URL');
  assert.deepEqual(initPayload.source_info.photo_images, [
    'https://storage.example/slide1.png',
    'https://storage.example/slide2.png'
  ]);
  assert.equal(initPayload.source_info.photo_cover_index, 1);
});

test('TikTokOfficialAdapter publishes video drafts to inbox via FILE_UPLOAD', async () => {
  const requests = [];
  const tempVideoPath = path.join(os.tmpdir(), `tiktok-official-video-${Date.now()}.mp4`);
  fs.writeFileSync(tempVideoPath, 'video-binary');

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });

    if (url === 'https://upload.tiktok.example/video-upload') {
      const size = Buffer.byteLength('video-binary');
      assert.equal(options.method, 'PUT');
      assert.equal(options.headers['Content-Type'], 'video/mp4');
      assert.equal(options.headers['Content-Length'], String(size));
      assert.equal(options.headers['Content-Range'], `bytes 0-${size - 1}/${size}`);
      assert.equal(options.body.toString(), 'video-binary');
      return new Response('', { status: 201 });
    }

    return new Response(JSON.stringify({
      data: {
        publish_id: 'vid_inbox_123',
        upload_url: 'https://upload.tiktok.example/video-upload'
      },
      error: { code: 'ok', message: '' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      creatorInfo: '/v2/post/publish/creator_info/query/',
      createDraft: '/v2/post/publish/content/init/',
      videoUploadInit: '/v2/post/publish/inbox/video/init/',
      videoDirectInit: '/v2/post/publish/video/init/'
    },
    postMode: 'MEDIA_UPLOAD',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/video-slot'
  }, { fetchImpl, storageUploader: null });

  const result = await adapter.publishDraft({
    id: 'job-video-1',
    caption: 'Funny AI skit',
    mediaPaths: [tempVideoPath],
    metadata: {
      title: 'Funny AI skit',
      media_type: 'VIDEO'
    }
  });

  assert.equal(result.platformPostId, 'vid_inbox_123');
  assert.equal(requests.length, 3);
  assert.equal(requests[1].url, 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');

  const initPayload = JSON.parse(requests[1].options.body);
  const size = Buffer.byteLength('video-binary');
  assert.deepEqual(initPayload, {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: size,
      total_chunk_count: 1
    }
  });

  fs.unlinkSync(tempVideoPath);
});

test('TikTokOfficialAdapter honors per-job DIRECT_POST mode for videos and sends caption title', async () => {
  const requests = [];
  const storageUploader = {
    async uploadFiles() {
      return ['https://storage.example/funny-video.mp4'];
    }
  };

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      data: { publish_id: 'vid_direct_123' },
      error: { code: 'ok', message: '' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      creatorInfo: '/v2/post/publish/creator_info/query/',
      createDraft: '/v2/post/publish/content/init/',
      videoUploadInit: '/v2/post/publish/inbox/video/init/',
      videoDirectInit: '/v2/post/publish/video/init/'
    },
    postMode: 'MEDIA_UPLOAD',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/video-slot'
  }, { fetchImpl, storageUploader });

  const result = await adapter.publishDraft({
    id: 'job-video-direct-1',
    caption: 'Meu duo me zoou por isso e 10 minutos depois tava copiando #roblox #gaming',
    targetUrl: 'https://robloxdrop.app/posts/anime-adventures-beginner-guide-2026/',
    mediaPaths: ['/tmp/funny-video.mp4'],
    metadata: {
      title: 'Meu duo me zoou por isso e 10 minutos depois tava copiando',
      media_type: 'VIDEO',
      post_mode: 'DIRECT_POST'
    }
  });

  assert.equal(result.platformPostId, 'vid_direct_123');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://open.tiktokapis.com/v2/post/publish/video/init/');

  const initPayload = JSON.parse(requests[1].options.body);
  assert.equal(initPayload.post_info.title, 'Meu duo me zoou por isso e 10 minutos depois tava copiando #roblox #gaming\n\nhttps://robloxdrop.app/posts/anime-adventures-beginner-guide-2026/');
  assert.equal(initPayload.source_info.source, 'PULL_FROM_URL');
  assert.equal(initPayload.source_info.video_url, 'https://storage.example/funny-video.mp4');
});

test('TikTokOfficialAdapter falls back to MEDIA_UPLOAD when direct post is blocked for unaudited clients', async () => {
  const requests = [];
  const tempVideoPath = path.join(os.tmpdir(), `tiktok-official-direct-fallback-${Date.now()}.mp4`);
  fs.writeFileSync(tempVideoPath, 'video-binary');

  const storageUploader = {
    async uploadFiles() {
      return ['https://storage.example/funny-video.mp4'];
    }
  };

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });

    if (url === 'https://upload.tiktok.example/video-upload') {
      return new Response('', { status: 201 });
    }

    if (url.endsWith('/v2/post/publish/video/init/')) {
      return new Response(JSON.stringify({
        error: {
          code: 'unaudited_client_can_only_post_to_private_accounts',
          message: 'Please review our integration guidelines.'
        }
      }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/v2/post/publish/inbox/video/init/')) {
      return new Response(JSON.stringify({
        data: {
          publish_id: 'vid_inbox_fallback_123',
          upload_url: 'https://upload.tiktok.example/video-upload'
        },
        error: { code: 'ok', message: '' }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] },
      error: { code: 'ok', message: '' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      creatorInfo: '/v2/post/publish/creator_info/query/',
      createDraft: '/v2/post/publish/content/init/',
      videoUploadInit: '/v2/post/publish/inbox/video/init/',
      videoDirectInit: '/v2/post/publish/video/init/'
    },
    postMode: 'DIRECT_POST',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/video-slot'
  }, { fetchImpl, storageUploader });

  const result = await adapter.publishDraft({
    id: 'job-video-direct-fallback',
    caption: 'caption',
    targetUrl: 'https://robloxdrop.app/posts/test/',
    mediaPaths: [tempVideoPath],
    metadata: {
      title: 'title',
      media_type: 'VIDEO',
      post_mode: 'DIRECT_POST'
    }
  });

  assert.equal(result.platformPostId, 'vid_inbox_fallback_123');
  assert.equal(result.effectivePostMode, 'MEDIA_UPLOAD');
  assert.equal(requests[1].url, 'https://open.tiktokapis.com/v2/post/publish/video/init/');
  assert.equal(requests[2].url, 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
  assert.equal(requests[3].url, 'https://upload.tiktok.example/video-upload');

  fs.unlinkSync(tempVideoPath);
});


test('TikTokOfficialAdapter does not duplicate target URL when caption already includes it', async () => {
  const requests = [];
  const storageUploader = {
    async uploadFiles() {
      return ['https://storage.example/slide1.jpg'];
    }
  };

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/creator-info')) {
      return new Response(JSON.stringify({ data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: { publish_id: 'pub_1' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      creatorInfo: '/creator-info',
      createDraft: '/create-draft',
      videoUploadInit: '/video-upload',
      videoDirectInit: '/video-direct'
    },
    postMode: 'DIRECT_POST',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/slot-1'
  }, { fetchImpl, storageUploader });

  const url = 'https://robloxdrop.app/posts/test-article/';
  await adapter.publishDraft({
    id: 'job-dup-url',
    caption: `Texto da legenda com URL já presente\n\n${url}\n\n#roblox`,
    targetUrl: url,
    mediaPaths: ['/tmp/slide1.jpg'],
    metadata: { title: 'Hook title' }
  });

  const initPayload = JSON.parse(requests[1].options.body);
  assert.equal((initPayload.post_info.description.match(/https:\/\/robloxdrop\.app\/posts\/test-article\//g) || []).length, 1);
});

test('TikTokOfficialAdapter clamps video list max_count to TikTok API limits', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ data: { videos: [], cursor: 0, has_more: false } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const adapter = new TikTokOfficialAdapter({
    accessToken: 'act_123',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      videoList: '/v2/video/list/'
    }
  }, { fetchImpl, storageUploader: null });

  await adapter.listVideos({ maxCount: 50 });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.max_count, 20);
});

test('TikTokOfficialAdapter refreshes access token on access_token_invalid and retries once', async () => {
  const requests = [];
  const refreshed = [];
  const storageUploader = {
    async uploadFiles() {
      return ['https://storage.example/slide1.jpg'];
    }
  };

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });

    if (url.endsWith('/v2/post/publish/creator_info/query/') && options.headers.Authorization === 'Bearer act_old') {
      return new Response(JSON.stringify({
        data: {},
        error: { code: 'access_token_invalid', message: 'expired' }
      }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/v2/oauth/token/')) {
      return new Response(JSON.stringify({
        access_token: 'act_new',
        refresh_token: 'rft_new',
        expires_in: 86400
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/v2/post/publish/creator_info/query/') && options.headers.Authorization === 'Bearer act_new') {
      return new Response(JSON.stringify({
        data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] },
        error: { code: 'ok', message: '' }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/v2/post/publish/content/init/') && options.headers.Authorization === 'Bearer act_new') {
      return new Response(JSON.stringify({
        data: { publish_id: 'pub_after_refresh' },
        error: { code: 'ok', message: '' }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    throw new Error(`Unexpected request: ${url} auth=${options.headers?.Authorization || ''}`);
  };

  const adapter = new TikTokOfficialAdapter({
    clientKey: 'client_key',
    clientSecret: 'client_secret',
    accessToken: 'act_old',
    refreshToken: 'rft_old',
    dryRun: false,
    baseUrl: 'https://open.tiktokapis.com',
    endpoints: {
      oauthToken: '/v2/oauth/token/',
      creatorInfo: '/v2/post/publish/creator_info/query/',
      createDraft: '/v2/post/publish/content/init/',
      videoUploadInit: '/v2/post/publish/inbox/video/init/',
      videoDirectInit: '/v2/post/publish/video/init/'
    },
    postMode: 'MEDIA_UPLOAD',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    autoAddMusic: true,
    storagePrefix: 'tiktok/slot-1'
  }, {
    fetchImpl,
    storageUploader,
    onTokensUpdated: async (tokens) => {
      refreshed.push(tokens);
    }
  });

  const result = await adapter.publishDraft({
    id: 'job-refresh',
    caption: 'Caption body',
    targetUrl: 'https://example.com/post/x/',
    mediaPaths: ['/tmp/slide1.jpg'],
    metadata: { title: 'Hook title' }
  });

  assert.equal(result.platformPostId, 'pub_after_refresh');
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].accessToken, 'act_new');
  assert.equal(refreshed[0].refreshToken, 'rft_new');
  assert.equal(adapter.cfg.accessToken, 'act_new');
  assert.equal(adapter.cfg.refreshToken, 'rft_new');

  const refreshReq = requests.find((req) => req.url.endsWith('/v2/oauth/token/'));
  assert.ok(refreshReq);
  assert.equal(refreshReq.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const refreshBody = String(refreshReq.options.body);
  assert.match(refreshBody, /grant_type=refresh_token/);
  assert.match(refreshBody, /refresh_token=rft_old/);
  assert.match(refreshBody, /client_key=client_key/);
  assert.match(refreshBody, /client_secret=client_secret/);
});
