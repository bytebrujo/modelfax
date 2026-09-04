// Cross-file invariants (build spec §4.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listDataFiles, readDataFile } from "../scrapers/lib/schema.js";

// Allowed hostnames for `sources`, per provider. Extend deliberately.
const SOURCE_DOMAINS = {
  openai: ["openai.com", "platform.openai.com", "developers.openai.com"],
  anthropic: [
    "platform.claude.com",
    "docs.anthropic.com",
    "www.anthropic.com",
    "anthropic.com",
    "claude.com",
  ],
  google: ["ai.google.dev", "cloud.google.com", "deepmind.google"],
};

const STALE_DAYS = 45;

const all = listDataFiles().flatMap((f) => readDataFile(f).models);
// UTC "today" plus one day of grace: a contributor east of UTC legitimately
// writes tomorrow's UTC date as last_verified.
const latestAllowed = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

test("no duplicate id across all files", () => {
  const seen = new Map();
  for (const m of all) {
    assert.ok(!seen.has(m.id), `duplicate id ${m.id}`);
    seen.set(m.id, true);
  }
});

test("id equals provider:model_id", () => {
  for (const m of all) {
    assert.equal(m.id, `${m.provider}:${m.model_id}`);
  }
});

test("status vs dates coherence", () => {
  for (const m of all) {
    const { status, dates } = m;
    if (status === "retired") {
      assert.ok(dates.retired, `${m.id} is retired but dates.retired is null`);
    }
    if (status === "deprecated") {
      assert.ok(dates.deprecated, `${m.id} is deprecated but dates.deprecated is null`);
    }
    if (status === "available" || status === "announced") {
      assert.equal(dates.retired, null, `${m.id} is ${status} but dates.retired is set`);
    }
    if (dates.released && dates.deprecated) {
      assert.ok(dates.released <= dates.deprecated, `${m.id} deprecated before released`);
    }
    if (dates.deprecated && dates.retired) {
      assert.ok(dates.deprecated <= dates.retired, `${m.id} retired before deprecated`);
    }
  }
});

test("last_verified is never in the future", () => {
  for (const m of all) {
    assert.ok(
      m.last_verified <= latestAllowed,
      `${m.id} last_verified ${m.last_verified} > ${latestAllowed}`,
    );
  }
});

test(`last_verified older than ${STALE_DAYS} days warns (does not fail)`, (t) => {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const stale = all.filter((m) => m.last_verified < cutoff);
  for (const m of stale) {
    t.diagnostic(
      JSON.stringify({
        level: "warn",
        component: "data.test",
        msg: "stale record",
        id: m.id,
        last_verified: m.last_verified,
        stale_days: STALE_DAYS,
      }),
    );
  }
  assert.ok(true);
});

test("every source is https and on the provider's own domain", () => {
  for (const m of all) {
    const allowed = SOURCE_DOMAINS[m.provider];
    assert.ok(allowed, `no domain allowlist for provider ${m.provider}`);
    for (const s of m.sources) {
      const u = new URL(s);
      assert.equal(u.protocol, "https:", `${m.id} source ${s} is not https`);
      assert.ok(allowed.includes(u.hostname), `${m.id} source host ${u.hostname} not in allowlist`);
    }
  }
});

test("retired models have no pricing, priced models have positive prices", () => {
  for (const m of all) {
    if (m.pricing) {
      assert.ok(m.pricing.input_per_mtok >= 0 && m.pricing.output_per_mtok >= 0, m.id);
    }
  }
});

// Coverage must be a closed loop: a model named in a provider's `tracked` list
// has to exist in data/, because context windows and modalities are not
// scrapeable and normalize() will not invent them. Without this, adding an id
// to `tracked` and forgetting to seed the record turns the next scrape red.
const providersDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scrapers",
  "providers",
);

test("every tracked model has a record, and every record is tracked", async () => {
  for (const file of readdirSync(providersDir).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(join(providersDir, file)).href);
    const recorded = new Set(all.filter((m) => m.provider === mod.provider).map((m) => m.model_id));
    const trackedIds = new Set(mod.tracked.map((t) => t.model_id));

    for (const id of trackedIds) {
      assert.ok(
        recorded.has(id),
        `${mod.provider} tracks ${id} but data/${mod.provider}.json has no record`,
      );
    }
    for (const id of recorded) {
      assert.ok(
        trackedIds.has(id),
        `data/${mod.provider}.json records ${id} but the module does not track it`,
      );
    }
  }
});
