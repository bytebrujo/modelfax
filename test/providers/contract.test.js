// Every provider module honours the §5.1 contract. Parser behaviour against
// fixtures is tested per provider in test/providers/<provider>.test.js (Phase 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const providersDir = resolve(here, "..", "..", "scrapers", "providers");
const files = readdirSync(providersDir).filter((f) => f.endsWith(".js"));

test("there are provider modules", () => {
  assert.ok(files.length >= 3);
});

for (const f of files) {
  test(`${f} exports {provider, sources, parse}`, async () => {
    const mod = await import(pathToFileURL(join(providersDir, f)).href);
    assert.equal(typeof mod.provider, "string");
    assert.equal(`${mod.provider}.js`, f, "module filename matches provider");
    assert.ok(Array.isArray(mod.sources) && mod.sources.length >= 1);
    for (const s of mod.sources) {
      assert.match(s.url, /^https:\/\//, `${f} source url must be https`);
      assert.match(s.kind, /^[a-z][a-z0-9-]*$/, `${f} source kind must be a slug`);
    }
    const kinds = mod.sources.map((s) => s.kind);
    assert.equal(new Set(kinds).size, kinds.length, "source kinds unique");
    assert.equal(typeof mod.parse, "function");
    assert.equal(mod.parse.length, 2, "parse(html, sourceKind)");
  });
}
