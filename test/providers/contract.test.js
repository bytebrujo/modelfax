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

    assert.ok(Array.isArray(mod.tracked) && mod.tracked.length >= 1, `${f} exports a tracked list`);
    const ids = new Set();
    for (const entry of mod.tracked) {
      assert.match(entry.model_id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `${f} tracked id`);
      assert.ok(!ids.has(entry.model_id), `${f} tracks ${entry.model_id} once`);
      ids.add(entry.model_id);
      if (entry.aliases !== undefined) {
        assert.ok(Array.isArray(entry.aliases) && entry.aliases.length > 0);
        for (const alias of entry.aliases) {
          assert.notEqual(alias, entry.model_id, `${f} alias must differ from the canonical id`);
        }
      }
    }
    // Every source kind must be one the parser actually handles.
    for (const s of mod.sources) {
      assert.doesNotThrow(() => {
        try {
          mod.parse("<html><body></body></html>", s.kind);
        } catch (err) {
          // An empty document legitimately fails; an *unknown kind* is what
          // must not happen, and that error names the kind.
          if (/known source kind/.test(err.message)) {
            throw err;
          }
        }
      }, `${f} declares source kind "${s.kind}" that parse() does not handle`);
    }
  });
}
