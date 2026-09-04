// OpenAI provider.
//
// Sources verified live 2026-09-04: platform.openai.com/docs/* now 301s to
// developers.openai.com/api/docs/*.
//
// Only two pages are scraped. The models index renders its specs client-side and
// ships no data in the HTML, and the per-model pages that do carry token limits
// would need one source (and one fixture) per model, so `context_window` and
// `max_output_tokens` are carried forward from the existing record rather than
// scraped. See AGENTS.md.
//
// The pricing page puts each billing tier in a tab pane of one content switcher.
// Every pane holds a structurally identical table, so the tier is identified by
// the pane's own label rather than by its position.
import * as cheerio from "cheerio";
import { clean, ctx, expect, fail, money, isoDate, rowCells, headers } from "../lib/parse.js";

export const provider = "openai";

export const sources = [
  { url: "https://developers.openai.com/api/docs/pricing", kind: "pricing", catalog: true },
  {
    url: "https://developers.openai.com/api/docs/deprecations",
    kind: "deprecations",
    catalog: false,
  },
];

export const tracked = [
  { model_id: "gpt-6-astra" },
  { model_id: "gpt-5.6-sol" },
  { model_id: "gpt-5.6-terra" },
  { model_id: "gpt-5.6-luna" },
  { model_id: "gpt-5", aliases: ["gpt-5-2025-08-07"] },
];

const TIERS = ["Standard", "Batch", "Flex", "Priority", "Fast mode"];

function tierLabel($, pane, c) {
  const clone = $(pane).clone();
  clone.find("table").remove();
  const text = clean(clone.text());
  const tier = TIERS.find((t) => text.startsWith(t));
  if (!tier) {
    fail(
      c,
      `a pane labelled with one of ${TIERS.join("/")}, got ${JSON.stringify(text.slice(0, 60))}`,
      text.slice(0, 120),
    );
  }
  return tier;
}

/**
 * Column names come from the last header row; the row above it groups them into
 * "Short context" and "Long context" halves. Registry prices are the short
 * context ones, which are the rates that apply to an ordinary request.
 */
function shortContextColumns($, table, c) {
  const groupRow = $(table).find("thead tr").first();
  const groups = rowCells($, groupRow);
  if (!groups.includes("Short context")) {
    fail(c, `a 'Short context' group header, got ${JSON.stringify(groups)}`, groups);
  }
  const nameRow = $(table).find("thead tr").last();
  const names = rowCells($, nameRow);
  if (names[0] !== "Model") {
    fail(c, `the column header row to start with 'Model', got ${JSON.stringify(names)}`, names);
  }
  const perGroup = (names.length - 1) / 2;
  if (!Number.isInteger(perGroup) || perGroup < 2) {
    fail(
      c,
      `an even number of price columns split into two context groups, got ${names.length - 1}`,
      names,
    );
  }
  const index = (label) => {
    const i = names.indexOf(label, 1);
    if (i === -1 || i > perGroup) {
      fail(c, `a short-context '${label}' column, headers are ${JSON.stringify(names)}`, names);
    }
    return i;
  };
  return { names, input: index("Input"), cached: index("Cached input"), output: index("Output") };
}

function parsePricing(html, sourceKind) {
  const $ = cheerio.load(html);
  const c = ctx(
    provider,
    sourceKind,
    ".content-switcher-panes table thead:has(th:contains('Short context'))",
  );

  const switchers = $(".content-switcher-panes")
    .filter((_, sw) =>
      $(sw)
        .find("table")
        .toArray()
        .some((t) => headers($, t).includes("Short context")),
    )
    .get();
  if (switchers.length !== 1) {
    fail(
      c,
      `exactly one content switcher whose tables have a 'Short context' header, found ${switchers.length}`,
      switchers.length,
    );
  }

  const panes = $(switchers[0]).children().get();
  expect(panes.length, c, "at least two tier panes (Standard and Batch)", (n) => n >= 2);

  const byTier = new Map();
  for (const pane of panes) {
    const tier = tierLabel($, pane, c);
    const table = $(pane).find("table").first();
    if (!table.length) {
      fail(c, `a table inside the ${tier} pane`, tier);
    }
    byTier.set(tier, table);
  }
  for (const required of ["Standard", "Batch"]) {
    if (!byTier.has(required)) {
      fail(c, `a '${required}' tier pane, found ${[...byTier.keys()].join("/")}`, [
        ...byTier.keys(),
      ]);
    }
  }

  const readTier = (tier) => {
    const table = byTier.get(tier);
    const cols = shortContextColumns($, table, c);
    const rows = new Map();
    for (const tr of $(table).find("tbody tr").get()) {
      const cells = rowCells($, tr);
      if (cells.length !== cols.names.length) {
        fail(c, `${cols.names.length} cells in every ${tier} row, got ${cells.length}`, cells);
      }
      rows.set(clean(cells[0]), cells);
    }
    expect(rows.size, c, `at least one ${tier} pricing row`, (n) => n > 0);
    return { cols, rows };
  };

  const std = readTier("Standard");
  const batch = readTier("Batch");

  const out = [];
  for (const [modelId, cells] of std.rows) {
    const pricing = {
      currency: "USD",
      input_per_mtok: money(cells[std.cols.input], c, `input price for ${modelId}`),
      output_per_mtok: money(cells[std.cols.output], c, `output price for ${modelId}`),
      cached_input_per_mtok: money(cells[std.cols.cached], c, `cached input price for ${modelId}`),
    };
    const b = batch.rows.get(modelId);
    if (b) {
      pricing.batch_input_per_mtok = money(
        b[batch.cols.input],
        c,
        `batch input price for ${modelId}`,
      );
      pricing.batch_output_per_mtok = money(
        b[batch.cols.output],
        c,
        `batch output price for ${modelId}`,
      );
    }
    if (pricing.input_per_mtok === null || pricing.output_per_mtok === null) {
      continue;
    }
    out.push({ model_id: modelId, family: "gpt", pricing });
  }
  return out;
}

function parseDeprecations(html, sourceKind) {
  const c = ctx(provider, sourceKind, "table:has(th:contains('Shutdown date'))");
  const $ = cheerio.load(html);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  let found = 0;

  $("table").each((_, t) => {
    const head = headers($, t);
    if (head[0] !== "Shutdown date") {
      return;
    }
    // The model column is variously "Model / system", "Model family / snapshot"
    // and "Deprecated model"; the columns that also say "model" are the
    // replacement and its price, which must not be mistaken for the subject.
    const iModel = head.findIndex((h) => /model/i.test(h) && !/replacement|price/i.test(h));
    // Some shutdown tables are about products rather than models ("System":
    // the Evals platform, Agent Builder, reusable prompts). Those are skipped,
    // not an error. If *every* table gets skipped the check after this loop
    // still fails loudly, so a renamed model column cannot pass unnoticed.
    if (iModel === -1) {
      return;
    }
    found++;
    for (const tr of $(t).find("tbody tr").get()) {
      const cells = rowCells($, tr);
      if (cells.length !== head.length) {
        continue;
      }
      const shutdown = isoDate(cells[0], c, "a shutdown date");
      // A cell can list several snapshots of one family, comma separated.
      const ids = clean(cells[iModel])
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && /[.-]/.test(s));
      for (const modelId of ids) {
        if (!shutdown) {
          continue;
        }
        out.push({
          model_id: modelId,
          status: shutdown <= today ? "retired" : "deprecated",
          dates: { retired: shutdown },
        });
      }
    }
  });

  if (found === 0) {
    fail(
      c,
      "at least one table whose first header is 'Shutdown date'",
      $("table")
        .map((_, t) => headers($, t).join(" | "))
        .get()
        .slice(0, 15),
    );
  }
  return out;
}

/**
 * Pure: HTML string -> array of partial model records. Throws ParseError naming
 * the selector and the expectation on any structural surprise.
 * @param {string} html
 * @param {string} sourceKind
 */
export function parse(html, sourceKind) {
  switch (sourceKind) {
    case "pricing":
      return parsePricing(html, sourceKind);
    case "deprecations":
      return parseDeprecations(html, sourceKind);
    default:
      return fail(
        ctx(provider, sourceKind, null),
        "a known source kind (pricing/deprecations)",
        sourceKind,
      );
  }
}
