// Google (Gemini API) parser against the committed fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../../scrapers/lib/errors.js";
import { parse, sources, provider } from "../../scrapers/providers/google.js";
import { fixture, byId } from "./fixtures.js";

test("declares one source per kind, all https", () => {
  assert.equal(provider, "google");
  assert.deepEqual(sources.map((s) => s.kind).sort(), ["deprecations", "models", "pricing"]);
  for (const s of sources) {
    assert.match(s.url, /^https:\/\/ai\.google\.dev\//);
  }
});

test("pricing attributes each tier table to the model heading above it", () => {
  const models = byId(parse(fixture("google", "pricing"), "pricing"));
  assert.deepEqual(models.get("gemini-3.8-flash").pricing, {
    currency: "USD",
    input_per_mtok: 0.75,
    output_per_mtok: 3.75,
    cached_input_per_mtok: 0.075,
    batch_input_per_mtok: 0.375,
    batch_output_per_mtok: 1.875,
  });
  // Tier headings repeat down the page as standard_1, batch_1, ...; a model far
  // from the top proves the suffix is stripped and attribution did not slip.
  assert.equal(models.get("gemini-2.5-pro").pricing.input_per_mtok, 1.25);
  assert.equal(models.get("gemini-2.5-pro").pricing.output_per_mtok, 10);
});

test("models priced per image or per second are left out, not half-read", () => {
  const models = byId(parse(fixture("google", "pricing"), "pricing"));
  for (const [id, m] of models) {
    assert.ok(typeof m.pricing.input_per_mtok === "number", `${id} has an input price`);
    assert.ok(typeof m.pricing.output_per_mtok === "number", `${id} has an output price`);
  }
  assert.ok(!models.has("gemini-embedding-2"), "embedding models price input only");
});

test("models maps display name to API endpoint id", () => {
  const models = byId(parse(fixture("google", "models"), "models"));
  assert.equal(models.get("gemini-3.8-flash").display_name, "Gemini 3.8 Flash");
  // A status annotation on the name belongs in `status`, not the display name.
  assert.equal(models.get("gemini-2.0-flash").display_name, "Gemini 2.0 Flash");
});

test("deprecations reads release and shutdown dates from td-headed tables", () => {
  const models = byId(parse(fixture("google", "deprecations"), "deprecations"));
  const gone = models.get("gemini-2.0-flash");
  assert.equal(gone.status, "retired", "shutdown date is in the past");
  assert.deepEqual(gone.dates, { released: "2025-02-05", deprecated: null, retired: "2026-06-01" });

  const live = models.get("gemini-3.8-flash");
  assert.equal(live.dates.released, "2026-09-02");
  assert.equal(live.dates.retired, null, '"No shutdown date announced" is not a date');
});

test("an unknown source kind throws rather than returning nothing", () => {
  assert.throws(() => parse("<html></html>", "changelog"), ParseError);
});
