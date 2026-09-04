#!/usr/bin/env node
// Orchestrator (build spec §5.1).
//   node scrapers/run.js [--provider X] [--check-only] [--offline]
// For each provider: fetch every source (or read fixtures/<provider>/<kind>.html
// with --offline) → parse → merge partials by model_id → normalize → diff against
// data/<provider>.json → write (unless --check-only).
// Exit: 0 no changes · 3 changes written · 4 parse failure · 5 fetch failure.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "./lib/log.js";
import { ParseError, FetchError, EXIT } from "./lib/errors.js";
import { fetchText } from "./lib/fetch.js";
import { mergePartials, MergeConflict } from "./lib/merge.js";
import { normalizeRecords } from "./lib/normalize.js";
import { diffRecords, hasChanges } from "./lib/diff.js";
import {
  REPO_ROOT,
  DATA_DIR,
  compileValidator,
  validateDocument,
  schemaVersion,
} from "./lib/schema.js";

const PROVIDERS_DIR = join(REPO_ROOT, "scrapers", "providers");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures");
const log = logger("run");

function parseArgs(argv) {
  const args = { provider: null, checkOnly: false, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") {
      args.provider = argv[++i] ?? null;
    } else if (a === "--check-only") {
      args.checkOnly = true;
    } else if (a === "--offline") {
      args.offline = true;
    } else {
      log.error("unknown argument", { arg: a });
      process.exit(2);
    }
  }
  return args;
}

async function loadProviders(only) {
  const files = readdirSync(PROVIDERS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();
  const mods = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(PROVIDERS_DIR, f)).href);
    if (
      typeof mod.provider !== "string" ||
      !Array.isArray(mod.sources) ||
      typeof mod.parse !== "function"
    ) {
      throw new TypeError(`scrapers/providers/${f} does not export {provider, sources, parse}`);
    }
    if (!only || mod.provider === only) {
      mods.push(mod);
    }
  }
  if (only && mods.length === 0) {
    throw new Error(`no provider module named "${only}"`);
  }
  return mods;
}

function readExisting(provider) {
  const path = join(DATA_DIR, `${provider}.json`);
  if (!existsSync(path)) {
    return { path, doc: { schema_version: schemaVersion(), models: [] } };
  }
  return { path, doc: JSON.parse(readFileSync(path, "utf8")) };
}

async function loadSourceHtml(mod, source, offline) {
  if (!offline) {
    return fetchText(source.url, { provider: mod.provider });
  }
  const fixture = join(FIXTURES_DIR, mod.provider, `${source.kind}.html`);
  if (!existsSync(fixture)) {
    throw new FetchError(`fixture missing: ${fixture}`, {
      provider: mod.provider,
      url: source.url,
      attempts: 0,
      cause: `offline mode requires fixtures/${mod.provider}/${source.kind}.html`,
    });
  }
  return readFileSync(fixture, "utf8");
}

async function runProvider(mod, args, validate) {
  const { provider } = mod;
  const providerFixtures = join(FIXTURES_DIR, provider);

  if (args.offline && !existsSync(providerFixtures)) {
    // No fixtures at all means the provider has no parser yet (Phase 1 state).
    // Loud, counted, and never produces data.
    log.warn("no fixtures for provider; skipped in offline mode", { provider });
    return { provider, skipped: true };
  }

  const partials = [];
  for (const source of mod.sources) {
    const html = await loadSourceHtml(mod, source, args.offline);
    const records = mod.parse(html, source.kind);
    if (!Array.isArray(records)) {
      throw new ParseError(`parse() must return an array`, {
        provider,
        sourceKind: source.kind,
        selector: null,
        expectation: "array of partial records",
        found: typeof records,
      });
    }
    for (const r of records) {
      r.sources = [...new Set([...(r.sources ?? []), source.url])];
    }
    log.info("parsed source", { provider, kind: source.kind, records: records.length });
    partials.push(...records);
  }

  const merged = mergePartials(partials);
  const { path, doc } = readExisting(provider);
  const next = normalizeRecords(provider, merged, doc.models);
  const nextDoc = { schema_version: schemaVersion(), models: next };

  const { ok, errors } = validateDocument(validate, nextDoc);
  if (!ok) {
    throw new ParseError(`normalized output for ${provider} violates schema`, {
      provider,
      sourceKind: "*",
      selector: null,
      expectation: "schema-valid records after normalize",
      found: errors,
    });
  }

  const diff = diffRecords(doc.models, next);
  const changed = hasChanges(diff);
  log.info("diff", {
    provider,
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed.length,
    check_only: args.checkOnly,
  });
  for (const c of diff.changed) {
    log.info("field changed", { provider, ...c });
  }

  if (changed && !args.checkOnly) {
    writeFileSync(path, JSON.stringify(nextDoc, null, 2) + "\n");
    log.info("wrote data file", { provider, path: basename(path), models: next.length });
  }
  return { provider, skipped: false, changed, diff };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const validate = compileValidator();
  const mods = await loadProviders(args.provider);
  log.info("start", { providers: mods.map((m) => m.provider), ...args });

  let anyChanges = false;
  let parseFailures = 0;
  let fetchFailures = 0;
  const summary = [];

  for (const mod of mods) {
    try {
      const result = await runProvider(mod, args, validate);
      summary.push(result);
      anyChanges = anyChanges || Boolean(result.changed);
    } catch (err) {
      if (err instanceof ParseError || err instanceof MergeConflict) {
        parseFailures++;
        log.error("parse failure", {
          provider: mod.provider,
          error: err.toJSON ? err.toJSON() : String(err),
        });
      } else if (err instanceof FetchError) {
        fetchFailures++;
        log.error("fetch failure", { provider: mod.provider, error: err.toJSON() });
      } else {
        parseFailures++;
        log.error("unexpected failure", {
          provider: mod.provider,
          error: { name: err.name, message: err.message, stack: err.stack },
        });
      }
    }
  }

  const exit = parseFailures
    ? EXIT.PARSE_FAILURE
    : fetchFailures
      ? EXIT.FETCH_FAILURE
      : anyChanges
        ? EXIT.CHANGES_WRITTEN
        : EXIT.NO_CHANGES;
  log.info("done", {
    exit,
    parse_failures: parseFailures,
    fetch_failures: fetchFailures,
    changes: anyChanges,
    providers: summary.map((s) => ({
      provider: s.provider,
      skipped: s.skipped,
      changed: s.changed ?? false,
    })),
  });
  process.exit(exit);
}

main().catch((err) => {
  log.error("fatal", { error: { name: err.name, message: err.message, stack: err.stack } });
  process.exit(EXIT.PARSE_FAILURE);
});
