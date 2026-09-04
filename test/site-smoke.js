#!/usr/bin/env node
// Site smoke test: site/*.html parses with cheerio, every data path the site
// references exists in the repo, every data file is referenced by the site, and
// the accessibility floor (labels, noscript, semantic table) is present.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { logger } from "../scrapers/lib/log.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const siteDir = join(root, "site");
const dataDir = join(root, "data");
const log = logger("site-smoke");
let failures = 0;

function fail(msg, extra) {
  failures++;
  log.error(msg, extra);
}

const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith(".html"));
if (htmlFiles.length === 0) {
  fail("no html files in site/");
}

for (const f of htmlFiles) {
  const html = readFileSync(join(siteDir, f), "utf8");
  const $ = cheerio.load(html);
  if (!/^<!doctype html>/i.test(html.trim())) {
    fail("missing <!doctype html>", { file: f });
  }
  if ($("html").attr("lang") === undefined) {
    fail("missing lang attribute on <html>", { file: f });
  }
  if ($("title").length !== 1) {
    fail("expected exactly one <title>", { file: f });
  }
  if ($('meta[name="viewport"]').length !== 1) {
    fail("missing viewport meta", { file: f });
  }
  if ($("noscript").length === 0) {
    fail("missing <noscript> note", { file: f });
  }
  if ($("main").length !== 1) {
    fail("expected exactly one <main>", { file: f });
  }
  $("input, select").each((_, el) => {
    const id = $(el).attr("id");
    const hasLabel = id && $(`label[for="${id}"]`).length === 1;
    const hasAria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
    if (!hasLabel && !hasAria) {
      fail("form control without label", { file: f, id: id ?? null });
    }
  });
  $("table").each((_, el) => {
    if ($(el).find("thead th").length === 0) {
      fail("table without <thead><th>", { file: f });
    }
    if ($(el).find("caption").length === 0) {
      fail("table without <caption>", { file: f });
    }
  });
  // Local asset references must exist in site/.
  $("link[rel=stylesheet][href], script[src]").each((_, el) => {
    const ref = $(el).attr("href") ?? $(el).attr("src");
    if (/^https?:/.test(ref)) {
      fail("external asset referenced; site must have zero dependencies", { file: f, ref });
    } else if (!existsSync(join(siteDir, ref))) {
      fail("referenced asset missing", { file: f, ref });
    }
  });
  log.info("html ok", { file: f });
}

// Every sortable column must have a sort key site.js actually understands.
// Adding a <th> with a new data-sort and forgetting the switch case silently
// sorts every row by undefined, which looks like "sorting is broken" rather
// than like a missing case.
const siteJs = readFileSync(join(siteDir, "site.js"), "utf8");
const indexHtml = readFileSync(join(siteDir, "index.html"), "utf8");
const sortKeys = [...indexHtml.matchAll(/data-sort="([a-z_]+)"/g)].map((m) => m[1]);
if (sortKeys.length === 0) {
  fail("index.html declares no sortable columns");
}
const sortBody = siteJs.slice(
  siteJs.indexOf("function sortKey("),
  siteJs.indexOf("function compare("),
);
for (const key of sortKeys) {
  const handled = sortBody.includes(`case "${key}"`) || /return m\[key\]/.test(sortBody);
  if (!handled) {
    fail("column has no sort key in site.js sortKey()", { key });
  }
}
// A column header count that does not match the rendered cell count means one
// column silently shows another column's values.
const headerCount = (indexHtml.match(/<th scope="col">/g) || []).length;
log.info("sortable columns ok", { columns: headerCount, keys: sortKeys.length });

const providerListMatch = siteJs.match(/const PROVIDERS = \[([^\]]*)\]/);
if (!providerListMatch) {
  fail("site.js must declare `const PROVIDERS = [...]`");
} else {
  const providers = [...providerListMatch[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  for (const p of providers) {
    const path = join(dataDir, `${p}.json`);
    if (!existsSync(path)) {
      fail("site references a data file that does not exist", {
        provider: p,
        path: `data/${p}.json`,
      });
    }
  }
  const dataFiles = readdirSync(dataDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  for (const d of dataFiles) {
    if (!providers.includes(d)) {
      fail("data file not referenced by site.js PROVIDERS", { provider: d });
    }
  }
  const fetchPath = siteJs.match(/fetch\(`([^`]+)`\)/);
  if (!fetchPath || !fetchPath[1].startsWith("data/")) {
    fail("site.js must fetch relative `data/<provider>.json` (Pages layout)", {
      found: fetchPath ? fetchPath[1] : null,
    });
  }
  log.info("data paths ok", { providers });
}

if (failures > 0) {
  log.error("site smoke failed", { failures });
  process.exit(1);
}
log.info("site smoke passed", { html_files: htmlFiles.length });
