import fs from 'node:fs';
import path from 'node:path';

import { nextQueued } from './queue.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const WORKER_LOCK_FILE = '.publisher-worker.lock';
const STALE_LOCK_MS = 15 * 60 * 1000;
const LOCK_HEARTBEAT_MS = 60 * 1000;

export class PublisherCore {
  constructor({ store, adapters, lockOptions = {} }) {
    this.store = store;
    this.adapters = adapters;
    this.lockPath = path.join(this.store.baseDir, WORKER_LOCK_FILE);
    this.staleLockMs = Number(lockOptions.staleLockMs || STALE_LOCK_MS);
    this.heartbeatMs = Number(lockOptions.heartbeatMs || LOCK_HEARTBEAT_MS);
  }

  enqueue(job) {
    this.store.append('jobs.jsonl', job);
    return job;
  }

  listJobs() {
    return this.store.readAll('jobs.jsonl');
  }

  async runOnce({ jobId } = {}) {
    const lock = this.#acquireLock();
    if (!lock.acquired) {
      return { ok: true, message: 'worker already running' };
    }

    const heartbeat = this.#startLockHeartbeat(lock.fd);

    try {
      const jobs = this.listJobs();
      const job = nextQueued(jobs, { jobId });
      if (!job) return { ok: true, message: 'no queued jobs' };

      const adapter = this.adapters[job.platform];
      if (!adapter) throw new Error(`No adapter for platform: ${job.platform}`);

      const startedAt = new Date().toISOString();

      try {
        const result = await adapter.publishDraft(job);
        this.store.append('publish-results.jsonl', {
          jobId: job.id,
          createdAt: startedAt,
          finishedAt: new Date().toISOString(),
          status: 'published',
          platform: job.platform,
          platformPostId: result.platformPostId,
          result
        });
        this.#updateJobStatus(job.id, 'published');
        return {
          ok: true,
          jobId: job.id,
          platformPostId: result.platformPostId,
          publishResult: result
        };
      } catch (error) {
        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = Number(job.metadata?.maxAttempts || DEFAULT_MAX_ATTEMPTS);
        const finalStatus = attempts >= maxAttempts ? 'failed' : 'retrying';
        this.store.append('publish-results.jsonl', {
          jobId: job.id,
          createdAt: startedAt,
          finishedAt: new Date().toISOString(),
          status: finalStatus,
          platform: job.platform,
          error: String(error)
        });
        this.#updateJobStatus(job.id, attempts >= maxAttempts ? 'failed' : 'queued', String(error));
        return { ok: false, jobId: job.id, error: String(error) };
      }
    } finally {
      this.#stopLockHeartbeat(heartbeat);
      this.#releaseLock(lock.fd);
    }
  }

  #updateJobStatus(jobId, status, error = '') {
    const jobs = this.listJobs();
    const next = jobs.map((j) => {
      if (j.id !== jobId) return j;
      return {
        ...j,
        status,
        attempts: (j.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error || ''
      };
    });

    this.store.writeAll('jobs.jsonl', next);
  }

  #acquireLock() {
    try {
      const fd = fs.openSync(this.lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      return { acquired: true, fd };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      if (this.#clearStaleLock()) {
        return this.#acquireLock();
      }

      return { acquired: false, fd: null };
    }
  }

  #clearStaleLock() {
    try {
      const stat = fs.statSync(this.lockPath);
      if ((Date.now() - stat.mtimeMs) < this.staleLockMs) {
        return false;
      }
      fs.unlinkSync(this.lockPath);
      return true;
    } catch {
      return false;
    }
  }

  #releaseLock(fd) {
    if (fd === null || fd === undefined) return;
    try {
      fs.closeSync(fd);
    } catch {}
    try {
      fs.unlinkSync(this.lockPath);
    } catch {}
  }

  #startLockHeartbeat(fd) {
    if (!this.heartbeatMs || this.heartbeatMs <= 0) return null;

    const tick = () => {
      const now = new Date();
      try {
        fs.futimesSync(fd, now, now);
        return;
      } catch {}

      try {
        fs.utimesSync(this.lockPath, now, now);
      } catch {}
    };

    const timer = setInterval(tick, this.heartbeatMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  #stopLockHeartbeat(timer) {
    if (!timer) return;
    clearInterval(timer);
  }
}
