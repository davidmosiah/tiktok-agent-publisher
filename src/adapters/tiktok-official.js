import fs from 'node:fs';

/**
 * TikTok official adapter (API-first).
 */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

export class TikTokOfficialAdapter {
  constructor(cfg, { fetchImpl = fetch, storageUploader = null, onTokensUpdated = null } = {}) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
    this.storageUploader = storageUploader;
    this.onTokensUpdated = onTokensUpdated;
    this.refreshPromise = null;
  }

  async publishDraft(job) {
    if (this.cfg.dryRun) {
      return {
        provider: 'tiktok_official',
        platformPostId: `dryrun_${Date.now()}`,
        raw: { dryRun: true, jobId: job.id }
      };
    }

    this.#assertConfig();

    const creatorInfo = await this.#request('POST', this.cfg.endpoints.creatorInfo, {});
    const privacyLevel = this.#resolvePrivacyLevel(creatorInfo);
    const mediaType = this.#resolveMediaType(job);
    const requestedPostMode = this.#resolvePostMode(job, mediaType);
    let effectivePostMode = requestedPostMode;
    let data;

    try {
      data = await this.#publishWithMode({
        job,
        mediaType,
        postMode: requestedPostMode,
        privacyLevel
      });
    } catch (error) {
      if (this.#shouldFallbackVideoDirectPost(error, mediaType, requestedPostMode)) {
        effectivePostMode = 'MEDIA_UPLOAD';
        data = await this.#publishWithMode({
          job,
          mediaType,
          postMode: effectivePostMode,
          privacyLevel
        });
      } else {
        throw error;
      }
    }

    return {
      provider: 'tiktok_official',
      platformPostId: data?.data?.publish_id || data?.data?.id || null,
      effectivePostMode,
      raw: data
    };
  }

  async #publishWithMode({ job, mediaType, postMode, privacyLevel }) {
    const endpoint = this.#resolvePublishEndpoint(mediaType, postMode);

    if (mediaType === 'VIDEO' && postMode === 'MEDIA_UPLOAD') {
      return this.#publishVideoInboxUpload(job, endpoint);
    }

    if (!this.storageUploader) {
      throw new Error('Missing Supabase storage uploader for TikTok official publishing');
    }

    const publicMediaUrls = await this.storageUploader.uploadFiles(
      job.mediaPaths,
      this.#buildStoragePrefix(job)
    );
    const payload = this.#buildPublishPayload({
      job,
      mediaType,
      postMode,
      publicMediaUrls,
      privacyLevel
    });
    return this.#request('POST', endpoint, payload);
  }

  async fetchPostInsights(platformPostId) {
    if (this.cfg.dryRun) {
      return { dryRun: true, platformPostId, metrics: {} };
    }
    this.#assertConfig();
    if (!platformPostId) return null;

    return this.#request('POST', this.cfg.endpoints.postInsights, {
      query: { publish_id: platformPostId }
    });
  }

  async fetchPublishStatus(publishId) {
    if (this.cfg.dryRun) {
      return { dryRun: true, publishId, status: 'DRY_RUN' };
    }
    this.#assertConfig();
    if (!publishId) return null;

    return this.#request('POST', this.cfg.endpoints.publishStatus, {
      publish_id: publishId
    });
  }

  async listVideos({
    fields = [
      'id',
      'create_time',
      'share_url',
      'video_description',
      'title',
      'like_count',
      'comment_count',
      'share_count',
      'view_count'
    ],
    maxCount = 20,
    cursor
  } = {}) {
    if (this.cfg.dryRun) {
      return { dryRun: true, videos: [], cursor: null, has_more: false };
    }
    this.#assertConfig();

    const safeMaxCount = Math.max(1, Math.min(20, Number(maxCount) || 20));
    const query = new URLSearchParams({
      fields: fields.join(',')
    });
    const body = {
      max_count: safeMaxCount
    };
    if (cursor !== undefined && cursor !== null && cursor !== '') {
      body.cursor = cursor;
    }

    return this.#request('POST', `${this.cfg.endpoints.videoList}?${query.toString()}`, body);
  }

  async queryVideos({
    filters,
    fields = [
      'id',
      'create_time',
      'share_url',
      'video_description',
      'title',
      'like_count',
      'comment_count',
      'share_count',
      'view_count'
    ]
  } = {}) {
    if (this.cfg.dryRun) {
      return { dryRun: true, videos: [] };
    }
    this.#assertConfig();

    const query = new URLSearchParams({
      fields: fields.join(',')
    });

    return this.#request('POST', `${this.cfg.endpoints.videoQuery}?${query.toString()}`, {
      filters: filters || {}
    });
  }

  #assertConfig() {
    if (!this.cfg.accessToken) {
      throw new Error('Missing TIKTOK_ACCESS_TOKEN (set TIKTOK_DRY_RUN=true for local validation)');
    }
  }

  #buildStoragePrefix(job) {
    const base = (job.metadata?.storagePrefix || this.cfg.storagePrefix || 'tiktok').replace(/\/+$/, '');
    return `${base}/${job.id}`;
  }

  #resolvePrivacyLevel(creatorInfo) {
    const desired = this.cfg.privacyLevel || 'PUBLIC_TO_EVERYONE';
    const allowed = creatorInfo?.data?.privacy_level_options;
    if (!Array.isArray(allowed) || allowed.length === 0) {
      return desired;
    }
    if (allowed.includes(desired)) {
      return desired;
    }
    return allowed[0];
  }

  #resolveMediaType(job) {
    const forced = String(job.metadata?.media_type || '').trim().toUpperCase();
    if (forced === 'PHOTO' || forced === 'VIDEO') return forced;
    if (job.mediaPaths.length === 1 && VIDEO_EXTENSIONS.has(this.#ext(job.mediaPaths[0]))) {
      return 'VIDEO';
    }
    return 'PHOTO';
  }

  #resolvePostMode(job, mediaType) {
    const forced = String(job.metadata?.post_mode || '').trim().toUpperCase();
    if (forced === 'MEDIA_UPLOAD' || forced === 'DIRECT_POST') {
      return forced;
    }
    if (mediaType === 'PHOTO') {
      return String(this.cfg.postMode || 'MEDIA_UPLOAD').trim().toUpperCase() || 'MEDIA_UPLOAD';
    }
    return String(this.cfg.postMode || 'DIRECT_POST').trim().toUpperCase() || 'DIRECT_POST';
  }

  #resolvePublishEndpoint(mediaType, postMode) {
    if (mediaType === 'VIDEO') {
      if (postMode === 'MEDIA_UPLOAD') {
        return this.cfg.endpoints.videoUploadInit;
      }
      return this.cfg.endpoints.videoDirectInit;
    }
    return this.cfg.endpoints.createDraft;
  }

  #buildPublishPayload({ job, mediaType, postMode, publicMediaUrls, privacyLevel }) {
    const extra = {
      delx_job_id: job.id,
      delx_slot: job.metadata?.slot || '',
      delx_style: job.metadata?.style || '',
      delx_theme: job.metadata?.theme || '',
      delx_visual_mode: job.metadata?.visual_mode || ''
    };

    if (mediaType === 'VIDEO') {
      const videoUrl = publicMediaUrls[0];
      if (!videoUrl) {
        throw new Error('Video publishing requires one uploaded public video URL');
      }

      if (postMode === 'MEDIA_UPLOAD') {
        return {
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl
          }
        };
      }

      return {
        post_info: {
          title: this.#buildCaption(job),
          privacy_level: privacyLevel,
          disable_duet: Boolean(job.metadata?.disable_duet || false),
          disable_comment: Boolean(job.metadata?.disable_comment || false),
          disable_stitch: Boolean(job.metadata?.disable_stitch || false),
          ...(job.metadata?.video_cover_timestamp_ms
            ? { video_cover_timestamp_ms: Number(job.metadata.video_cover_timestamp_ms) }
            : {})
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl
        },
        extra
      };
    }

    return {
      post_mode: postMode,
      media_type: 'PHOTO',
      post_info: {
        title: job.metadata?.title || job.caption.slice(0, 90),
        description: this.#buildDescription(job),
        privacy_level: privacyLevel,
        auto_add_music: this.cfg.autoAddMusic
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_images: publicMediaUrls,
        photo_cover_index: 1
      },
      extra
    };
  }

  #buildCaption(job) {
    return this.#composeText(job, { maxLength: 2200 });
  }

  #buildDescription(job) {
    return this.#composeText(job);
  }

  #composeText(job, { maxLength = null } = {}) {
    const caption = String(job.caption || '').trim();
    const targetUrl = String(job.targetUrl || job.articleUrl || '').trim();
    const alreadyHasUrl = targetUrl && caption.includes(targetUrl);
    const text = [caption, alreadyHasUrl ? '' : targetUrl]
      .filter(Boolean)
      .join('\n\n');
    return maxLength ? text.slice(0, maxLength) : text;
  }

  #ext(filePath) {
    const idx = String(filePath).lastIndexOf('.');
    return idx > -1 ? String(filePath).slice(idx).toLowerCase() : '';
  }

  async #publishVideoInboxUpload(job, endpoint) {
    const filePath = job.mediaPaths[0];
    if (!filePath) {
      throw new Error('Video inbox upload requires one local video file');
    }

    const stat = fs.statSync(filePath);
    // TikTok's Upload to TikTok video init only accepts source_info for inbox upload.
    // Caption/title are not supported in this flow, so they must be pasted manually
    // by the user in the TikTok Inbox editor after processing completes.
    const payload = {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: stat.size,
        chunk_size: stat.size,
        total_chunk_count: 1
      }
    };
    const data = await this.#request('POST', endpoint, payload);
    const uploadUrl = data?.data?.upload_url || data?.upload_url;
    if (!uploadUrl) {
      throw new Error(`TikTok video inbox init missing upload_url: ${JSON.stringify(data).slice(0, 400)}`);
    }

    await this.#uploadVideoFile({
      uploadUrl,
      filePath,
      size: stat.size,
      contentType: this.#contentTypeForFile(filePath)
    });

    return data;
  }

  #contentTypeForFile(filePath) {
    const ext = this.#ext(filePath);
    if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.webm') return 'video/webm';
    return 'application/octet-stream';
  }

  async #uploadVideoFile({ uploadUrl, filePath, size, contentType }) {
    const buffer = fs.readFileSync(filePath);
    const res = await this.fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Content-Range': `bytes 0-${size - 1}/${size}`
      },
      body: buffer
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TikTok upload failed ${res.status}: ${text.slice(0, 400)}`);
    }
  }

  async #request(method, endpoint, body, { allowRefresh = true } = {}) {
    const url = `${this.cfg.baseUrl}${endpoint}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`TikTok response is not JSON: ${text.slice(0, 240)}`);
    }

    if (!res.ok) {
      if (allowRefresh && this.#isAccessTokenInvalid(res.status, json)) {
        await this.#refreshAccessToken();
        return this.#request(method, endpoint, body, { allowRefresh: false });
      }
      const error = new Error(`TikTok API ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
      error.status = res.status;
      error.code = json?.error?.code || json?.code || '';
      error.payload = json;
      throw error;
    }

    return json;
  }

  #isAccessTokenInvalid(status, json) {
    const code = json?.error?.code || json?.code || '';
    return status === 401 && code === 'access_token_invalid';
  }

  #shouldFallbackVideoDirectPost(error, mediaType, postMode) {
    return mediaType === 'VIDEO'
      && postMode === 'DIRECT_POST'
      && Number(error?.status || 0) === 403
      && String(error?.code || '').trim() === 'unaudited_client_can_only_post_to_private_accounts';
  }

  async #refreshAccessToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.cfg.refreshToken || !this.cfg.clientKey || !this.cfg.clientSecret) {
      throw new Error('Missing TikTok refresh credentials (refresh token, client key, or client secret)');
    }

    this.refreshPromise = (async () => {
      const url = `${this.cfg.baseUrl}${this.cfg.endpoints.oauthToken}`;
      const form = new URLSearchParams({
        client_key: this.cfg.clientKey,
        client_secret: this.cfg.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.cfg.refreshToken
      });

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form.toString()
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`TikTok refresh response is not JSON: ${text.slice(0, 240)}`);
      }

      if (!res.ok) {
        throw new Error(`TikTok refresh failed ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
      }

      const accessToken = json?.access_token || json?.data?.access_token;
      const refreshToken = json?.refresh_token || json?.data?.refresh_token || this.cfg.refreshToken;
      const expiresIn = Number(json?.expires_in || json?.data?.expires_in || 0);

      if (!accessToken) {
        throw new Error(`TikTok refresh missing access_token: ${JSON.stringify(json).slice(0, 400)}`);
      }

      this.cfg.accessToken = accessToken;
      this.cfg.refreshToken = refreshToken;
      this.cfg.accessTokenExpiresIn = expiresIn;

      if (this.onTokensUpdated) {
        await this.onTokensUpdated({
          accessToken,
          refreshToken,
          accessTokenExpiresIn: expiresIn
        });
      }
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
}
