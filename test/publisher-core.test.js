import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JsonlStore } from '../src/storage/jsonl-store.js';
import { PublisherCore } from '../src/core/publisher.js';
import { createJob } from '../src/core/queue.js';

function createStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delx-social-publisher-'));
  return new JsonlStore(dir);
}

test('PublisherCore can publish a specific queued job without consuming older queued jobs', async () => {
  const store = createStore();
  const published = [];
  const core = new PublisherCore({
    store,
    adapters: {
      tiktok: {
        async publishDraft(job) {
          published.push(job.id);
          return { platformPostId: `pub_${job.id}` };
        }
      }
    }
  });

  const oldJob = createJob({
    platform: 'tiktok',
    caption: 'old caption',
    articleUrl: 'https://robloxdrop.app/posts/old/',
    mediaPaths: ['/tmp/old.jpg']
  });
  const newJob = createJob({
    platform: 'tiktok',
    caption: 'new caption',
    articleUrl: 'https://robloxdrop.app/posts/new/',
    mediaPaths: ['/tmp/new.jpg']
  });

  store.append('jobs.jsonl', oldJob);
  store.append('jobs.jsonl', newJob);

  const result = await core.runOnce({ jobId: newJob.id });
  assert.equal(result.ok, true);
  assert.equal(result.jobId, newJob.id);
  assert.deepEqual(published, [newJob.id]);

  const jobs = store.readAll('jobs.jsonl');
  const persistedOld = jobs.find((job) => job.id === oldJob.id);
  const persistedNew = jobs.find((job) => job.id === newJob.id);
  assert.equal(persistedOld.status, 'queued');
  assert.equal(persistedNew.status, 'published');
});

test('PublisherCore can publish a specific queued job without consuming older queued jobs', async () => {
  const store = createStore();
  const published = [];
  const core = new PublisherCore({
    store,
    adapters: {
      tiktok: {
        async publishDraft(job) {
          published.push(job.id);
          return { platformPostId: `pub_${job.id}` };
        }
      }
    }
  });

  const oldJob = createJob({
    platform: 'tiktok',
    caption: 'old caption',
    mediaPaths: ['/tmp/old.jpg']
  });
  const newJob = createJob({
    platform: 'tiktok',
    caption: 'new caption',
    mediaPaths: ['/tmp/new.jpg']
  });

  store.append('jobs.jsonl', oldJob);
  store.append('jobs.jsonl', newJob);

  const result = await core.runOnce({ jobId: newJob.id });
  assert.equal(result.ok, true);
  assert.equal(result.jobId, newJob.id);
  assert.deepEqual(published, [newJob.id]);

  const jobs = store.readAll('jobs.jsonl');
  const persistedOld = jobs.find((job) => job.id === oldJob.id);
  const persistedNew = jobs.find((job) => job.id === newJob.id);
  assert.equal(persistedOld.status, 'queued');
  assert.equal(persistedNew.status, 'published');
});
