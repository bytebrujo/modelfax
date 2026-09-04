// The kill test (build spec §10, Phase 2).
//
// Corrupt the thing each parser anchors on and prove it fails the way AGENTS.md
// rule 3 demands: a ParseError naming the selector and the expectation, never a
// record with fewer fields and never an empty result that reads like "no models
// changed today". Every assertion here is about the *shape of the failure*,
// because that error text is the entire interface an agent has when a provider
// silently restructures a page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../../scrapers/lib/errors.js";
import * as anthropic from "../../scrapers/providers/anthropic.js";
import * as openai from "../../scrapers/providers/openai.js";
import * as google from "../../scrapers/providers/google.js";
import { fixture } from "./fixtures.js";

// Each case renames the one string the parser keys off, the way a docs redesign
// would, and leaves the rest of the page intact.
const CASES = [
  {
    name: "anthropic pricing: the price table header is renamed",
    mod: anthropic,
    kind: "pricing",
    corrupt: (html) => html.replaceAll("Base input tokens", "Base input"),
    mentions: /Base input tokens/,
  },
  {
    name: "anthropic models: the API id row disappears",
    mod: anthropic,
    kind: "models",
    corrupt: (html) => html.replaceAll("Claude API ID", "Model string"),
    mentions: /Claude API ID/,
  },
  {
    name: "anthropic deprecations: an unknown lifecycle state appears",
    mod: anthropic,
    kind: "deprecations",
    corrupt: (html) => html.replaceAll(">Active<", ">Provisional<"),
    mentions: /lifecycle state/,
  },
  {
    name: "openai pricing: the context column grouping is dropped",
    mod: openai,
    kind: "pricing",
    corrupt: (html) => html.replaceAll("Short context", "Context"),
    mentions: /Short context/,
  },
  {
    name: "openai deprecations: the shutdown column is renamed",
    mod: openai,
    kind: "deprecations",
    corrupt: (html) => html.replaceAll("Shutdown date", "Sunset date"),
    mentions: /Shutdown date/,
  },
  {
    name: "google pricing: a model section loses a tier heading",
    mod: google,
    kind: "pricing",
    corrupt: (html) => html.replace(/<h3 id="standard"[\s\S]*?<\/h3>/, ""),
    mentions: /tier heading|pricing table/,
  },
  {
    name: "google models: the endpoint column is renamed",
    mod: google,
    kind: "models",
    corrupt: (html) => html.replaceAll(">Endpoint<", ">API name<"),
    mentions: /Endpoint/,
  },
];

for (const testCase of CASES) {
  test(`kill test — ${testCase.name}`, () => {
    const good = fixture(testCase.mod.provider, testCase.kind);
    const broken = testCase.corrupt(good);
    assert.notEqual(broken, good, "the corruption actually changed the fixture");

    // The intact fixture parses, so any failure below is the corruption talking.
    assert.ok(testCase.mod.parse(good, testCase.kind).length > 0);

    let thrown = null;
    try {
      testCase.mod.parse(broken, testCase.kind);
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown, "a corrupted page must throw, not return partial data");
    assert.ok(thrown instanceof ParseError, `threw ${thrown?.name}, expected ParseError`);
    assert.equal(thrown.provider, testCase.mod.provider);
    assert.equal(thrown.sourceKind, testCase.kind);

    // The two fields that make the error actionable without opening the page.
    assert.equal(typeof thrown.expectation, "string");
    assert.ok(thrown.expectation.length > 10, "expectation must describe what was wanted");
    assert.ok(
      typeof thrown.selector === "string" && thrown.selector.length > 0,
      "selector must name where the parser was looking",
    );

    // And it must survive JSON serialization, because that is how it reaches the
    // logs and the maintenance issue the scrape workflow opens.
    const serialized = JSON.parse(JSON.stringify(thrown));
    assert.equal(serialized.name, "ParseError");
    assert.equal(serialized.selector, thrown.selector);
    assert.equal(serialized.expectation, thrown.expectation);
    assert.match(
      `${serialized.message} ${serialized.expectation} ${JSON.stringify(serialized.found)}`,
      testCase.mentions,
      "the error should name the thing that broke",
    );
  });
}

test("a parser never returns an empty array for an intact page", () => {
  for (const mod of [anthropic, openai, google]) {
    for (const source of mod.sources) {
      const records = mod.parse(fixture(mod.provider, source.kind), source.kind);
      assert.ok(
        Array.isArray(records) && records.length > 0,
        `${mod.provider}/${source.kind} returned nothing`,
      );
    }
  }
});
