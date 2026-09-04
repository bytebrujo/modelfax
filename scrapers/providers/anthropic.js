// Anthropic provider.
//
// Sources verified live 2026-09-04. docs.anthropic.com now lives at
// platform.claude.com. Three pages, each carrying a different slice of a record:
//   pricing       — prices, keyed by *display name* ("Claude Opus 5")
//   models        — API id, context window, max output; a transposed table whose
//                   columns are models and whose rows are features
//   deprecations  — lifecycle state and dates, keyed by *API model name*
//
// The pricing page never prints an API id, so this module slugifies the display
// name ("Claude Opus 4.5" -> "claude-opus-4-5"). For models whose canonical id
// is a dated snapshot that slug is the documented alias, which is why `tracked`
// below carries an explicit alias list; run.js canonicalizes through it before
// merging so the two pages fold into one record rather than two.
import * as cheerio from "cheerio";
import {
  clean,
  modelLabel,
  ctx,
  expect,
  fail,
  money,
  tokens,
  isoDate,
  rowCells,
  headers,
  findTable,
} from "../lib/parse.js";

export const provider = "anthropic";

export const sources = [
  {
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
    kind: "pricing",
    catalog: true,
  },
  {
    url: "https://platform.claude.com/docs/en/about-claude/models/overview",
    kind: "models",
    catalog: true,
  },
  {
    url: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
    kind: "deprecations",
    catalog: false,
  },
];

// The registry's Anthropic coverage. Upstream lists far more models (retired
// snapshots, image and audio models); anything outside this list is reported by
// run.js as an untracked model rather than silently dropped or half-populated.
export const tracked = [
  { model_id: "claude-fable-5-1" },
  { model_id: "claude-opus-5" },
  { model_id: "claude-sonnet-5" },
  { model_id: "claude-haiku-4-5-20251001", aliases: ["claude-haiku-4-5"] },
];

// "Claude Opus 4.5" -> "claude-opus-4-5". Anthropic's dateless ids follow this
// exactly; dated snapshots resolve through the alias list above.
export function slugify(displayName) {
  return clean(displayName).toLowerCase().replace(/\./g, "-").replace(/\s+/g, "-");
}

const STATUS = {
  active: "available",
  legacy: "available",
  deprecated: "deprecated",
  retired: "retired",
};

function parsePricing(html, sourceKind) {
  const $ = cheerio.load(html);
  const base = ctx(provider, sourceKind, "table:has(th:contains('Base input tokens'))");
  const batchCtx = ctx(provider, sourceKind, "table:has(th:contains('Batch input'))");

  const mainTable = findTable(
    $,
    base,
    (th) => th[0] === "Model" && th.includes("Base input tokens") && th.includes("Output tokens"),
    "th[0] is 'Model' and headers include 'Base input tokens' and 'Output tokens'",
  );
  const mainHead = headers($, mainTable);
  const col = (name) => {
    const i = mainHead.indexOf(name);
    return i === -1
      ? fail(base, `a '${name}' column, headers are ${JSON.stringify(mainHead)}`, mainHead)
      : i;
  };
  const iIn = col("Base input tokens");
  const iCache = col("Cache hits and refreshes");
  const iOut = col("Output tokens");

  const out = [];
  const mainRows = $(mainTable).find("tbody tr").get();
  expect(mainRows.length, base, "at least one pricing row", (n) => n > 0);
  for (const tr of mainRows) {
    const cells = rowCells($, tr);
    if (cells.length !== mainHead.length) {
      fail(base, `${mainHead.length} cells per row, got ${cells.length}`, cells);
    }
    const display = modelLabel(cells[0]);
    out.push({
      model_id: slugify(display),
      display_name: display,
      family: "claude",
      pricing: {
        currency: "USD",
        input_per_mtok: money(cells[iIn], base, `input price for ${display}`),
        output_per_mtok: money(cells[iOut], base, `output price for ${display}`),
        cached_input_per_mtok: money(cells[iCache], base, `cache-read price for ${display}`),
      },
    });
  }

  const batchTable = findTable(
    $,
    batchCtx,
    (th) => th[0] === "Model" && th.includes("Batch input") && th.includes("Batch output"),
    "th[0] is 'Model' and headers include 'Batch input' and 'Batch output'",
  );
  const batchHead = headers($, batchTable);
  const bIn = batchHead.indexOf("Batch input");
  const bOut = batchHead.indexOf("Batch output");
  for (const tr of $(batchTable).find("tbody tr").get()) {
    const cells = rowCells($, tr);
    const display = modelLabel(cells[0]);
    out.push({
      model_id: slugify(display),
      pricing: {
        currency: "USD",
        batch_input_per_mtok: money(cells[bIn], batchCtx, `batch input price for ${display}`),
        batch_output_per_mtok: money(cells[bOut], batchCtx, `batch output price for ${display}`),
      },
    });
  }
  return out;
}

function parseModels(html, sourceKind) {
  const $ = cheerio.load(html);
  const c = ctx(provider, sourceKind, "table:has(th:contains('Feature'))");
  const table = findTable($, c, (th) => th[0] === "Feature", "th[0] is 'Feature'");

  // Columns are models. The header cell wraps the display name in a link
  // alongside a one-line description, so the link text is the name.
  const displayNames = $(table)
    .find("thead th")
    .slice(1)
    .map((_, th) => clean($(th).find("a").first().text()))
    .get();
  expect(displayNames.length, c, "at least one model column", (n) => n > 0);
  displayNames.forEach((n, i) =>
    expect(n, c, `a display name in model column ${i + 1}`, (v) => v.length > 0),
  );

  const rowByLabel = (label) => {
    const rows = $(table)
      .find("tbody tr")
      .filter((_, tr) => clean($(tr).find("td,th").first().text()) === label)
      .get();
    if (rows.length !== 1) {
      fail(
        c,
        `exactly one '${label}' row, found ${rows.length}`,
        $(table)
          .find("tbody tr")
          .map((_, tr) => clean($(tr).find("td,th").first().text()))
          .get(),
      );
    }
    return rowCells($, rows[0]).slice(1);
  };

  const ids = rowByLabel("Claude API ID");
  const contexts = rowByLabel("Context window");
  const maxOut = rowByLabel("Max output");
  for (const [name, arr] of [
    ["Claude API ID", ids],
    ["Context window", contexts],
    ["Max output", maxOut],
  ]) {
    if (arr.length !== displayNames.length) {
      fail(c, `'${name}' row to have ${displayNames.length} values, got ${arr.length}`, arr);
    }
  }

  return displayNames.map((display, i) => ({
    model_id: expect(ids[i], c, `an API id for ${display}`, (v) =>
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v),
    ),
    display_name: display,
    family: "claude",
    context_window: tokens(contexts[i], c, `context window for ${display}`),
    max_output_tokens: tokens(maxOut[i], c, `max output for ${display}`),
  }));
}

function parseDeprecations(html, sourceKind) {
  const $ = cheerio.load(html);
  const c = ctx(provider, sourceKind, "table:has(th:contains('API model name'))");
  const table = findTable(
    $,
    c,
    (th) => th[0] === "API model name" && th.includes("Current state"),
    "th[0] is 'API model name' and headers include 'Current state'",
  );
  const head = headers($, table);
  const iState = head.indexOf("Current state");
  const iDep = head.indexOf("Deprecated");
  expect(iDep, c, `a 'Deprecated' column, headers are ${JSON.stringify(head)}`, (i) => i !== -1);

  const out = [];
  for (const tr of $(table).find("tbody tr").get()) {
    const cells = rowCells($, tr);
    const modelId = clean(cells[0]);
    const stateText = clean(cells[iState]).toLowerCase();
    const status = STATUS[stateText];
    if (!status) {
      fail(
        c,
        `a known lifecycle state for ${modelId}, one of ${Object.keys(STATUS).join("/")}`,
        stateText,
      );
    }
    const deprecated = isoDate(cells[iDep], c, `deprecation date for ${modelId}`);
    // The retirement column is a forward commitment ("Not sooner than …"), not a
    // retirement that happened. Only a model already in the retired state gets a
    // dates.retired, and its date comes from the per-announcement tables below.
    out.push({
      model_id: modelId,
      status,
      dates: { deprecated, retired: null },
    });
  }

  // Per-announcement tables carry the actual retirement dates.
  const retired = new Map();
  $("table").each((_, t) => {
    const th = headers($, t);
    if (th[0] !== "Retirement date" || !th.includes("Deprecated model")) {
      return;
    }
    const iModel = th.indexOf("Deprecated model");
    for (const tr of $(t).find("tbody tr").get()) {
      const cells = rowCells($, tr);
      const date = isoDate(cells[0], c, "a retirement date");
      const id = clean(cells[iModel]);
      if (date && id) {
        retired.set(id, date);
      }
    }
  });
  for (const rec of out) {
    if (rec.status === "retired") {
      const date = retired.get(rec.model_id);
      if (!date) {
        fail(
          c,
          `a retirement date for retired model ${rec.model_id} in a 'Retirement date' table`,
          [...retired.keys()],
        );
      }
      rec.dates.retired = date;
    }
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
    case "models":
      return parseModels(html, sourceKind);
    case "deprecations":
      return parseDeprecations(html, sourceKind);
    default:
      return fail(
        ctx(provider, sourceKind, null),
        "a known source kind (pricing/models/deprecations)",
        sourceKind,
      );
  }
}
