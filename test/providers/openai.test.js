// OpenAI parser against the committed fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../../scrapers/lib/errors.js";
import { parse, tracked, sources, provider } from "../../scrapers/providers/openai.js";
import { fixture, byId } from "./fixtures.js";

test("declares pricing and deprecations sources, all https", () => {
  assert.equal(provider, "openai");
  assert.deepEqual(sources.map((s) => s.kind).sort(), ["deprecations", "pricing"]);
  for (const s of sources) {
    assert.match(s.url, /^https:\/\/developers\.openai\.com\//);
  }
});

test("pricing reads the Standard and Batch tier panes, short-context columns", () => {
  const models = byId(parse(fixture("openai", "pricing"), "pricing"));
  assert.deepEqual(models.get("gpt-5.6-sol").pricing, {
    currency: "USD",
    input_per_mtok: 4,
    output_per_mtok: 20,
    cached_input_per_mtok: 0.4,
    batch_input_per_mtok: 2,
    batch_output_per_mtok: 10,
  });
  // Long-context rates are double; picking the wrong column group would show up here.
  assert.equal(models.get("gpt-6-astra").pricing.input_per_mtok, 10);
  assert.equal(models.get("gpt-5.6-luna").pricing.output_per_mtok, 1.2);
});

test("deprecations reads shutdown dates and infers state from them", () => {
  const models = byId(parse(fixture("openai", "deprecations"), "deprecations"));
  const gpt5 = models.get("gpt-5-2025-08-07");
  assert.equal(gpt5.status, "deprecated", "shutdown is still in the future");
  assert.equal(gpt5.dates.retired, "2026-12-11");
  // That snapshot is the alias of the id this registry carries.
  assert.ok(tracked.find((t) => t.model_id === "gpt-5").aliases.includes("gpt-5-2025-08-07"));
});

test("product shutdown tables are skipped, model tables are not", () => {
  const models = byId(parse(fixture("openai", "deprecations"), "deprecations"));
  // "Evals platform" and "Agent Builder" live in a table headed "System".
  for (const id of models.keys()) {
    assert.doesNotMatch(id, /^(Evals|Agent|Reusable)/);
  }
  assert.ok(models.size > 10, "model shutdown tables were still read");
});

test("non-breaking hyphens in dates parse", () => {
  const models = byId(parse(fixture("openai", "deprecations"), "deprecations"));
  for (const m of models.values()) {
    if (m.dates?.retired) {
      assert.match(m.dates.retired, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("an unknown source kind throws rather than returning nothing", () => {
  assert.throws(() => parse("<html></html>", "models"), ParseError);
});
