/**
 * Pure-function TikTok caption safety check.
 *
 * Run before submitting a caption to the TikTok Content Posting API so
 * a draft does not get rejected on the upload endpoint. Validates:
 *   - length <= 2200 characters (TikTok's documented hard cap)
 *   - hashtag count <= 30
 *   - no banned phrase patterns (small defensible default list; expand
 *     via the `bannedPatterns` option for brand-specific blocklists)
 *
 * Returns `{ ok, errors }` where `errors` is an array of human-readable
 * strings. Empty errors === ok=true.
 *
 * @typedef {{ ok: boolean, errors: string[], hashtag_count: number, length: number }} CaptionSafetyResult
 *
 * @param {string} caption
 * @param {{
 *   maxLength?: number,
 *   maxHashtags?: number,
 *   bannedPatterns?: Array<string|RegExp>,
 * }} [options]
 * @returns {CaptionSafetyResult}
 */
export function captionSafetyCheck(caption, options = {}) {
  const errors = [];

  if (caption == null) {
    return {
      ok: false,
      errors: ["caption is required"],
      hashtag_count: 0,
      length: 0,
    };
  }
  if (typeof caption !== "string") {
    return {
      ok: false,
      errors: ["caption must be a string"],
      hashtag_count: 0,
      length: 0,
    };
  }

  const maxLength = numberOr(options.maxLength, 2200);
  const maxHashtags = numberOr(options.maxHashtags, 30);

  const length = caption.length;
  if (length === 0) {
    errors.push("caption is empty");
  }
  if (length > maxLength) {
    errors.push(`caption exceeds ${maxLength} characters (got ${length})`);
  }

  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const hashtag_count = hashtags.length;
  if (hashtag_count > maxHashtags) {
    errors.push(`caption uses ${hashtag_count} hashtags (max ${maxHashtags})`);
  }

  const defaults = DEFAULT_BANNED_PATTERNS;
  const extras = Array.isArray(options.bannedPatterns)
    ? options.bannedPatterns
    : [];
  const patterns = [...defaults, ...extras].map(toRegex);

  const lower = caption.toLowerCase();
  for (const pattern of patterns) {
    if (pattern.test(lower)) {
      errors.push(`caption contains banned pattern: ${pattern.source}`);
    }
  }

  return { ok: errors.length === 0, errors, hashtag_count, length };
}

/**
 * Tiny, defensible default blocklist. Intentionally small — these are
 * phrases that almost universally get scam/spam flags. Brand-specific
 * blocklists should be supplied via `options.bannedPatterns`.
 */
export const DEFAULT_BANNED_PATTERNS = Object.freeze([
  /\bclick\s+here\b/,
  /\bfree\s+money\b/,
  /\bbuy\s+now\b/,
]);

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toRegex(p) {
  if (p instanceof RegExp) return p;
  return new RegExp(String(p).toLowerCase(), "i");
}
