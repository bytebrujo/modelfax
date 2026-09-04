// Unit tests for scrapers/lib helpers used by run.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePartials, MergeConflict } from "../scrapers/lib/merge.js";
import { normalizeRecords } from "../scrapers/lib/normalize.js";
import { diffRecords, hasChanges } from "../scrapers/lib/diff.js";
import { fetchText } from "../scrapers/lib/fetch.js";
import { ParseError, FetchError, EXIT } from "../scrapers/lib/errors.js";
import { compileValidator, validateDocument, schemaVersion } from "../scrapers/lib/schema.js";
import { aliasIndex, applyTracking } from "../scrapers/lib/tracked.js";
import { money } from "../scrapers/lib/parse.js";

test("mergePartials merges fields from several sources by model_id", () => {
  const merged = mergePartials([
    { model_id: "x", pricing: { input_per_mtok: 1, output_per_mtok: 2 } },
    { model_id: "x", context_window: 1000, dates: { deprecated: "2026-01-01" } },
    { model_id: "y", display_name: "Y" },
  ]);
  assert.equal(merged.size, 2);
  assert.deepEqual(merged.get("x").pricing, { input_per_mtok: 1, output_per_mtok: 2 });
  assert.equal(merged.get("x").context_window, 1000);
  assert.equal(merged.get("x").dates.deprecated, "2026-01-01");
});

test("mergePartials throws MergeConflict on disagreeing scalars", () => {
  assert.throws(
    () =>
      mergePartials([
        { model_id: "x", context_window: 1 },
        { model_id: "x", context_window: 2 },
      ]),
    (e) => e instanceof MergeConflict && e.field === "context_window",
  );
});

test("mergePartials rejects partials without model_id", () => {
  assert.throws(() => mergePartials([{ display_name: "nope" }]), TypeError);
});

test("normalizeRecords produces schema-valid records and keeps prior fields", () => {
  const validate = compileValidator();
  const existing = [
    {
      id: "openai:x",
      provider: "openai",
      model_id: "x",
      display_name: "X",
      family: "gpt",
      status: "available",
      modalities: { input: ["text"], output: ["text"] },
      context_window: 10,
      max_output_tokens: 5,
      pricing: {
        currency: "USD",
        input_per_mtok: 1,
        output_per_mtok: 2,
        cached_input_per_mtok: null,
        batch_input_per_mtok: null,
        batch_output_per_mtok: null,
      },
      dates: { released: "2025-01-01", deprecated: null, retired: null },
      sources: ["https://developers.openai.com/api/docs/models"],
      last_verified: "2026-01-01",
    },
  ];
  const merged = mergePartials([
    {
      model_id: "x",
      pricing: { input_per_mtok: 3, output_per_mtok: 4 },
      sources: ["https://developers.openai.com/api/docs/pricing"],
    },
  ]);
  const out = normalizeRecords("openai", merged, existing, { today: "2026-09-04" });
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r.pricing.input_per_mtok, 3);
  assert.equal(r.pricing.cached_input_per_mtok, null);
  assert.equal(r.dates.released, "2025-01-01");
  assert.equal(r.last_verified, "2026-09-04");
  assert.equal(r.sources.length, 2);
  const { ok, errors } = validateDocument(validate, {
    schema_version: schemaVersion(),
    models: out,
  });
  assert.ok(ok, JSON.stringify(errors));
});

test("diffRecords ignores last_verified and reports field-level changes", () => {
  const before = [{ model_id: "x", pricing: { input_per_mtok: 1 }, last_verified: "2026-01-01" }];
  const same = [{ model_id: "x", pricing: { input_per_mtok: 1 }, last_verified: "2026-09-04" }];
  const changed = [{ model_id: "x", pricing: { input_per_mtok: 2 }, last_verified: "2026-09-04" }];
  assert.equal(hasChanges(diffRecords(before, same)), false);
  const d = diffRecords(before, changed);
  assert.deepEqual(d.changed, [{ model_id: "x", field: "pricing.input_per_mtok", from: 1, to: 2 }]);
  const d2 = diffRecords(before, [...changed, { model_id: "y" }]);
  assert.deepEqual(d2.added, ["y"]);
});

test("fetchText retries then throws FetchError with attempts + cause", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: false, status: 503, text: async () => "" };
  };
  await assert.rejects(
    fetchText("https://example.com/", { provider: "openai", fetchImpl, retries: 2, backoffMs: 1 }),
    (e) => e instanceof FetchError && e.attempts === 3 && e.status === 503,
  );
  assert.equal(calls, 3);
});

test("fetchText does not retry a 404", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: false, status: 404, text: async () => "" };
  };
  await assert.rejects(
    fetchText("https://example.com/", { provider: "openai", fetchImpl, backoffMs: 1 }),
  );
  assert.equal(calls, 1);
});

test("fetchText sends the identifying User-Agent", async () => {
  let seen;
  const fetchImpl = async (_url, init) => {
    seen = init.headers["user-agent"];
    return { ok: true, status: 200, text: async () => "<html></html>" };
  };
  const body = await fetchText("https://example.com/", { provider: "openai", fetchImpl });
  assert.equal(body, "<html></html>");
  assert.match(seen, /modelfax/);
});

test("ParseError serializes selector + expectation", () => {
  const e = new ParseError("boom", {
    provider: "openai",
    sourceKind: "pricing",
    selector: "table.pricing tr",
    expectation: ">= 1 row",
    found: 0,
  });
  const j = JSON.parse(JSON.stringify(e));
  assert.equal(j.selector, "table.pricing tr");
  assert.equal(j.expectation, ">= 1 row");
  assert.equal(j.found, 0);
});

test("exit codes match the spec", () => {
  assert.deepEqual(EXIT, { NO_CHANGES: 0, CHANGES_WRITTEN: 3, PARSE_FAILURE: 4, FETCH_FAILURE: 5 });
});

test("aliasIndex maps aliases and canonical ids to the canonical id", () => {
  const index = aliasIndex([
    { model_id: "gpt-5", aliases: ["gpt-5-2025-08-07"] },
    { model_id: "gpt-6-astra" },
  ]);
  assert.equal(index.canonical.get("gpt-5-2025-08-07"), "gpt-5");
  assert.equal(index.canonical.get("gpt-5"), "gpt-5");
  assert.equal(index.canonical.get("gpt-6-astra"), "gpt-6-astra");
  assert.deepEqual([...index.ids].sort(), ["gpt-5", "gpt-6-astra"]);
});

test("aliasIndex rejects an alias claimed by two models", () => {
  assert.throws(
    () =>
      aliasIndex([
        { model_id: "a", aliases: ["x"] },
        { model_id: "b", aliases: ["x"] },
      ]),
    /alias "x" maps to both/,
  );
});

test("applyTracking rewrites aliases and reports what it dropped", () => {
  const index = aliasIndex([{ model_id: "gpt-5", aliases: ["gpt-5-2025-08-07"] }]);
  const { kept, untracked } = applyTracking(
    [
      { model_id: "gpt-5-2025-08-07", _kind: "deprecations", status: "deprecated" },
      { model_id: "gpt-5", _kind: "pricing" },
      { model_id: "whisper-1", _kind: "deprecations" },
      { model_id: "gpt-9", _kind: "pricing" },
    ],
    index,
  );
  assert.deepEqual(
    kept.map((k) => k.model_id),
    ["gpt-5", "gpt-5"],
  );
  assert.equal(kept[0].status, "deprecated", "other fields survive the rewrite");
  assert.deepEqual([...untracked.keys()].sort(), ["gpt-9", "whisper-1"]);
  assert.deepEqual([...untracked.get("gpt-9")], ["pricing"]);
});

test("fetchText asks for English, so docs sites do not localize by geo-IP", async () => {
  let seen;
  const fetchImpl = async (_url, init) => {
    seen = init.headers;
    return { ok: true, status: 200, text: async () => "<html></html>" };
  };
  await fetchText("https://example.com/", { provider: "google", fetchImpl });
  assert.match(seen["accept-language"], /\ben\b/);
});

test("money names localization when a price is not ASCII", () => {
  const context = { provider: "google", sourceKind: "pricing", selector: "table" };
  assert.throws(
    () => money("۱.۵۰ دلار", context, "input price for gemini-3.5-flash"),
    (e) => /localized page/.test(e.expectation) && /accept-language/.test(e.expectation),
  );
  // An ordinary structural surprise must not get the localization hint.
  assert.throws(
    () => money("see below", context, "input price"),
    (e) => !/localized/.test(e.expectation),
  );
});
