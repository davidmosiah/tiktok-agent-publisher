# Changelog

## 0.1.5 - 2026-05-29
- Docs: add a "First Post (Dry-Run) Walkthrough" to the README — a five-step, credential-free sequence (`doctor` → `privacy-audit` → `publish-video` → `publish-status` → `list-videos`) with real, captured CLI output, plus a "going live" note. No code changes.

## 0.1.4 - 2026-05-22
- Add `captionSafetyCheck(caption, options?)` returning `{ok, errors, hashtag_count, length}`. Defaults enforce TikTok's documented caption cap (2200), a 30-hashtag ceiling, and a small defensible banned-phrase blocklist (`click here`, `free money`, `buy now`). Brand-specific patterns are pluggable via `options.bannedPatterns`.
- 15 new tests covering length boundaries, hashtag counting (Unicode-aware), banned phrase detection, custom patterns and multi-error accumulation.

## 0.1.3
- Previous release.
