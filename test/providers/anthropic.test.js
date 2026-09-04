// Anthropic parser against the committed fixtures. When upstream drifts the fix
// is a new fixture plus the expectation changes here, in one PR (AGENTS.md 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../../scrapers/lib/errors.js";
import { parse, slugify, tracked, sources, provider } from "../../scrapers/providers/anthropic.js";
import { fixture, byId } from "./fixtures.js";

test("declares one source per kind, all https", () => {
  assert.equal(provider, "anthropic");
  assert.deepEqual(sources.map((s) => s.kind).sort(), ["deprecations", "models", "pricing"]);
  for (const s of sources) {
    assert.match(s.url, /^https:\/\/platform\.claude\.com\//);
  }
});

test("slugify turns a display name into the dateless API id", () => {
  assert.equal(slugify("Claude Opus 5"), "claude-opus-5");
  assert.equal(slugify("Claude Fable 5.1"), "claude-fable-5-1");
  assert.equal(slugify("Claude Sonnet 4.6"), "claude-sonnet-4-6");
});

test("pricing yields per-MTok prices for every listed model", () => {
  const models = byId(parse(fixture("anthropic", "pricing"), "pricing"));
  const opus = models.get("claude-opus-5");
  assert.equal(opus.display_name, "Claude Opus 5");
  assert.deepEqual(opus.pricing, {
    currency: "USD",
    input_per_mtok: 5,
    output_per_mtok: 25,
    cached_input_per_mtok: 0.5,
    batch_input_per_mtok: 2.5,
    batch_output_per_mtok: 12.5,
  });
  // The batch table is a second pass over the same display names.
  assert.equal(models.get("claude-sonnet-5").pricing.batch_output_per_mtok, 5);
  // A parenthetical status note must not leak into the id.
  assert.ok(models.has("claude-opus-4-1"), "strips '(retired, except on …)'");
});

test("models yields the API id, context window and max output", () => {
  const models = byId(parse(fixture("anthropic", "models"), "models"));
  assert.deepEqual(models.get("claude-opus-5"), {
    model_id: "claude-opus-5",
    display_name: "Claude Opus 5",
    family: "claude",
    context_window: 1_000_000,
    max_output_tokens: 128_000,
    pricing: {},
  });
  // Haiku's canonical id is a dated snapshot; the pricing page only knows the
  // alias, which is why tracked() carries the mapping.
  const haiku = models.get("claude-haiku-4-5-20251001");
  assert.equal(haiku.context_window, 200_000);
  assert.equal(haiku.max_output_tokens, 64_000);
  assert.ok(
    tracked
      .find((t) => t.model_id === "claude-haiku-4-5-20251001")
      .aliases.includes("claude-haiku-4-5"),
  );
});

test("deprecations yields lifecycle state and real retirement dates", () => {
  const models = byId(parse(fixture("anthropic", "deprecations"), "deprecations"));
  assert.equal(models.get("claude-opus-5").status, "available");
  assert.deepEqual(models.get("claude-opus-5").dates, { deprecated: null, retired: null });

  const retired = models.get("claude-opus-4-1-20250805");
  assert.equal(retired.status, "retired");
  assert.deepEqual(retired.dates, { deprecated: "2026-06-05", retired: "2026-08-05" });
});

test('a "Not sooner than" commitment is not treated as a retirement date', () => {
  const models = byId(parse(fixture("anthropic", "deprecations"), "deprecations"));
  // The table's retirement column reads "Not sooner than September 1, 2027".
  assert.equal(models.get("claude-fable-5-1").dates.retired, null);
});

test("an unknown source kind throws rather than returning nothing", () => {
  assert.throws(() => parse("<html></html>", "changelog"), ParseError);
});
