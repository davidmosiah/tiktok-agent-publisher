import fs from 'node:fs';
import path from 'node:path';

function encodeObjectPath(objectPath) {
  return objectPath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

export class SupabaseStorageUploader {
  constructor(cfg, { fetchImpl = fetch } = {}) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  async uploadFiles(filePaths, prefix = '') {
    this.#assertConfig();
    await this.ensureBucket();

    const urls = [];
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const objectPath = [prefix, fileName].filter(Boolean).join('/');
      await this.uploadFile(filePath, objectPath);
      urls.push(this.publicUrl(objectPath));
    }
    return urls;
  }

  async ensureBucket() {
    const url = `${this.cfg.url}/storage/v1/bucket`;
    const body = {
      id: this.cfg.bucket,
      name: this.cfg.bucket,
      public: true
    };

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.#headers('application/json'),
      body: JSON.stringify(body)
    });

    if (res.ok) return true;

    const text = await res.text();
    if ([400, 409].includes(res.status) && /exists|duplicate|already/i.test(text)) {
      return true;
    }

    throw new Error(`Supabase bucket ensure failed (${res.status}): ${text.slice(0, 300)}`);
  }

  async uploadFile(filePath, objectPath) {
    const encodedPath = encodeObjectPath(objectPath);
    const url = `${this.cfg.url}/storage/v1/object/${this.cfg.bucket}/${encodedPath}`;
    const body = fs.readFileSync(filePath);

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        ...this.#headers(contentTypeFor(filePath)),
        'x-upsert': 'true'
      },
      body
    });

    if (res.ok) return true;

    const text = await res.text();
    throw new Error(`Supabase upload failed (${res.status}): ${text.slice(0, 300)}`);
  }

  publicUrl(objectPath) {
    const encodedPath = encodeObjectPath(objectPath);
    const customBase = (this.cfg.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (customBase) {
      return `${customBase}/${encodedPath}`;
    }
    return `${this.cfg.url}/storage/v1/object/public/${this.cfg.bucket}/${encodedPath}`;
  }

  #headers(contentType) {
    return {
      Authorization: `Bearer ${this.cfg.serviceRoleKey}`,
      apikey: this.cfg.serviceRoleKey,
      'Content-Type': contentType
    };
  }

  #assertConfig() {
    if (!this.cfg?.url) throw new Error('Missing ROBLOXDROP_SUPABASE_URL');
    if (!this.cfg?.serviceRoleKey) throw new Error('Missing ROBLOXDROP_SUPABASE_SERVICE_ROLE_KEY');
    if (!this.cfg?.bucket) throw new Error('Missing ROBLOXDROP_SUPABASE_BUCKET');
  }
}
