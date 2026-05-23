import test from "node:test";
import assert from "node:assert/strict";

import {
  captionSafetyCheck,
  DEFAULT_BANNED_PATTERNS,
} from "../src/services/caption-safety.js";

test("accepts a simple safe caption", () => {
  const r = captionSafetyCheck("morning routine #fyp #productivity");
  assert.equal(r.ok, true);
  assert.equal(r.hashtag_count, 2);
  assert.deepEqual(r.errors, []);
});

test("rejects null caption", () => {
  const r = captionSafetyCheck(null);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("caption is required")));
});

test("rejects non-string caption", () => {
  const r = captionSafetyCheck(123);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("must be a string")));
});

test("rejects empty caption", () => {
  const r = captionSafetyCheck("");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("empty")));
});

test("rejects caption over 2200 chars", () => {
  const r = captionSafetyCheck("x".repeat(2201));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("exceeds 2200")));
});

test("caption exactly 2200 chars passes length check", () => {
  const r = captionSafetyCheck("x".repeat(2200));
  // No length error; might have other errors (none in this case)
  assert.equal(r.length, 2200);
  assert.ok(!r.errors.some((e) => e.includes("exceeds 2200")));
});

test("rejects more than 30 hashtags", () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  const r = captionSafetyCheck(`my video ${tags}`);
  assert.equal(r.ok, false);
  assert.equal(r.hashtag_count, 31);
  assert.ok(r.errors.some((e) => e.includes("hashtags")));
});

test("accepts exactly 30 hashtags", () => {
  const tags = Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(" ");
  const r = captionSafetyCheck(tags);
  assert.equal(r.ok, true);
  assert.equal(r.hashtag_count, 30);
});

test("flags default banned phrase 'click here'", () => {
  const r = captionSafetyCheck("click here for the link!");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("banned pattern")));
});

test("flags default banned phrase 'buy now'", () => {
  const r = captionSafetyCheck("Limited offer. Buy NOW before it's gone.");
  assert.equal(r.ok, false);
});

test("flags 'free money'", () => {
  const r = captionSafetyCheck("get free money fast");
  assert.equal(r.ok, false);
});

test("custom banned patterns extend defaults", () => {
  const r = captionSafetyCheck("totally safe caption", {
    bannedPatterns: [/totally\s+safe/],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("banned pattern")));
});

test("custom maxHashtags lowers the cap", () => {
  const r = captionSafetyCheck("a #b #c #d", { maxHashtags: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("max 2")));
});

test("DEFAULT_BANNED_PATTERNS is exported and frozen", () => {
  assert.ok(Array.isArray(DEFAULT_BANNED_PATTERNS));
  assert.ok(Object.isFrozen(DEFAULT_BANNED_PATTERNS));
  assert.ok(DEFAULT_BANNED_PATTERNS.length >= 3);
});

test("accumulates multiple errors", () => {
  const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(" ");
  const r = captionSafetyCheck(`buy now ${tags}`);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2);
});
