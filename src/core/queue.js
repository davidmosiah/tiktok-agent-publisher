import crypto from 'node:crypto';

export function createJob({ platform, caption, articleUrl, targetUrl, mediaPaths = [], metadata = {} }) {
  if (!platform) throw new Error('platform is required');
  if (!caption) throw new Error('caption is required');
  if (!Array.isArray(mediaPaths) || mediaPaths.length === 0) throw new Error('at least one media path is required');

  const resolvedTargetUrl = targetUrl || articleUrl || '';

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'queued',
    attempts: 0,
    platform,
    caption,
    articleUrl: resolvedTargetUrl,
    targetUrl: resolvedTargetUrl,
    mediaPaths,
    metadata
  };
}

export function nextQueued(jobs, { jobId } = {}) {
  if (jobId) {
    return jobs.find((j) => j.id === jobId && j.status === 'queued') || null;
  }
  return jobs.find((j) => j.status === 'queued') || null;
}
