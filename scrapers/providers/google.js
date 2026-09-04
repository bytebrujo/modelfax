// Google (Gemini API) provider.
//
// Sources verified live 2026-09-04. The pricing page is a devsite article whose
// body is a flat list of children: a `div.models-section` holding `h2[id]`
// starts a model, and the divs after it hold that model's tier tables
// (`h3#standard`, `h3#batch`, ... each paired with a `table.pricing-table`).
// The h2's id is the API model id.
//
// Google publishes token limits only on per-model pages, not on any of the three
// pages below, so `context_window` and `max_output_tokens` are carried forward
// from the existing record rather than scraped. See AGENTS.md.
import * as cheerio from "cheerio";
import {
  clean,
  modelLabel,
  ctx,
  expect,
  fail,
  money,
  isoDate,
  rowCells,
  headers,
} from "../lib/parse.js";

export const provider = "google";

export const sources = [
  { url: "https://ai.google.dev/gemini-api/docs/pricing", kind: "pricing", catalog: true },
  { url: "https://ai.google.dev/gemini-api/docs/models", kind: "models", catalog: true },
  {
    url: "https://ai.google.dev/gemini-api/docs/deprecations",
    kind: "deprecations",
    catalog: false,
  },
];

export const tracked = [
  { model_id: "gemini-3.8-flash" },
  { model_id: "gemini-2.5-pro" },
  { model_id: "gemini-2.0-flash" },
];

// h3 ids repeat down the page, so the second model's Standard tab is `standard_1`.
function tierOf(id) {
  return clean(id).replace(/_\d+$/, "");
}

function paidColumn($, table, c) {
  const head = headers($, table);
  const i = head.findIndex((h) => /^paid tier/i.test(h));
  if (i === -1) {
    fail(c, `a 'Paid Tier' column, headers are ${JSON.stringify(head)}`, head);
  }
  return i;
}

/** Value of the row whose label matches, or null when the row is absent. */
function rowValue($, table, colIndex, matcher) {
  for (const tr of $(table).find("tr").get()) {
    const cells = rowCells($, tr);
    if (cells.length > colIndex && matcher(cells[0])) {
      return cells[colIndex];
    }
  }
  return null;
}

function parsePricing(html, sourceKind) {
  const $ = cheerio.load(html);
  const c = ctx(provider, sourceKind, "div.devsite-article-body > div.models-section h2[id]");
  const body = $(".devsite-article-body").first();
  expect(body.length, c, "a .devsite-article-body element", (n) => n === 1);

  // Walk the body in document order, attributing each tier table to the model
  // heading that most recently opened.
  const byModel = new Map();
  let current = null;
  body.children().each((_, child) => {
    const heading = $(child).find("h2[id]").first();
    if ($(child).hasClass("models-section") && heading.length) {
      current = clean(heading.attr("id"));
      if (current && !byModel.has(current)) {
        byModel.set(current, { display_name: clean(heading.text()), tiers: new Map() });
      }
      return;
    }
    const tables = $(child).find("table.pricing-table").get();
    if (!tables.length || !current) {
      return;
    }
    const h3s = $(child).find("h3[id]").get();
    if (h3s.length !== tables.length) {
      fail(
        c,
        `${current} to have one h3 tier heading per pricing table, got ${h3s.length} headings and ${tables.length} tables`,
        { model: current, headings: h3s.map((h) => $(h).attr("id")) },
      );
    }
    h3s.forEach((h3, i) => byModel.get(current).tiers.set(tierOf($(h3).attr("id")), tables[i]));
  });

  expect(byModel.size, c, "at least one model section on the pricing page", (n) => n > 0);

  const out = [];
  for (const [modelId, { display_name, tiers }] of byModel) {
    const standard = tiers.get("standard");
    if (!standard) {
      // Sections such as "Free tier" carry no Standard table; they are not models.
      continue;
    }
    const paid = paidColumn($, standard, c);
    const input = rowValue($, standard, paid, (l) => /^input price/i.test(l));
    const output = rowValue($, standard, paid, (l) => /^output price/i.test(l));
    // A generative token model always prices output. Embedding models price only
    // input, and image and video models price per image or per second; none of
    // them belong in a per-token registry, so a missing output price means "not
    // this kind of model" rather than "broken page". An output price with no
    // input price *is* a surprise and fails loudly.
    if (output === null) {
      continue;
    }
    if (input === null) {
      fail(c, `${modelId} Standard table to have an 'Input price' row beside its output price`, {
        model: modelId,
        labels: $(standard)
          .find("tr")
          .map((_, tr) => rowCells($, tr)[0])
          .get(),
      });
    }
    const cached = rowValue($, standard, paid, (l) => /^context caching/i.test(l));

    const pricing = {
      currency: "USD",
      input_per_mtok: money(input, c, `input price for ${modelId}`),
      output_per_mtok: money(output, c, `output price for ${modelId}`),
      cached_input_per_mtok:
        cached === null ? null : money(cached, c, `cache price for ${modelId}`),
    };

    const batch = tiers.get("batch");
    if (batch) {
      const bPaid = paidColumn($, batch, c);
      const bIn = rowValue($, batch, bPaid, (l) => /^input price/i.test(l));
      const bOut = rowValue($, batch, bPaid, (l) => /^output price/i.test(l));
      pricing.batch_input_per_mtok =
        bIn === null ? null : money(bIn, c, `batch input for ${modelId}`);
      pricing.batch_output_per_mtok =
        bOut === null ? null : money(bOut, c, `batch output for ${modelId}`);
    }

    // Models priced per image or per second have no token price and are out of
    // scope for a token registry; a null input price is how they present.
    if (pricing.input_per_mtok === null || pricing.output_per_mtok === null) {
      continue;
    }
    out.push({ model_id: modelId, display_name, family: "gemini", pricing });
  }
  return out;
}

function parseModels(html, sourceKind) {
  const c = ctx(provider, sourceKind, "table:has(th:contains('Endpoint'))");
  const $ = cheerio.load(html);
  const out = [];
  let found = 0;
  $("table").each((_, t) => {
    const head = headers($, t);
    if (head[0] !== "Model" || !head.includes("Endpoint")) {
      return;
    }
    found++;
    const iEnd = head.indexOf("Endpoint");
    for (const tr of $(t).find("tbody tr").get()) {
      const cells = rowCells($, tr);
      if (cells.length !== head.length) {
        continue; // sub-heading rows such as "Preview models" span the table
      }
      const modelId = clean(cells[iEnd]);
      // The models index annotates names in place, e.g. "Gemini 2.0 Flash
      // (Shut down)". The status belongs in `status`, not in the display name.
      const display = modelLabel(cells[0]);
      if (!modelId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(modelId)) {
        continue;
      }
      out.push({ model_id: modelId, display_name: display, family: "gemini" });
    }
  });
  if (found === 0) {
    fail(
      c,
      "at least one table with 'Model' and 'Endpoint' headers",
      $("table")
        .map((_, t) => headers($, t).join(" | "))
        .get()
        .slice(0, 15),
    );
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
    if (head[0] !== "Model" || !head.includes("Shutdown date")) {
      return;
    }
    found++;
    const iRelease = head.indexOf("Release date");
    const iShutdown = head.indexOf("Shutdown date");
    for (const tr of $(t).find("tbody tr").get()) {
      const cells = rowCells($, tr);
      if (cells.length !== head.length) {
        continue; // "Preview models" spacer rows
      }
      const modelId = clean(cells[0]);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(modelId)) {
        continue;
      }
      const released =
        iRelease === -1 ? null : isoDate(cells[iRelease], c, `release date for ${modelId}`);
      const shutdown = isoDate(cells[iShutdown], c, `shutdown date for ${modelId}`);
      const rec = { model_id: modelId, dates: { released, deprecated: null, retired: null } };
      if (shutdown) {
        // Google announces a shutdown date and nothing else; a date already past
        // means the model is gone, a future one means it is on the way out.
        rec.dates.retired = shutdown;
        rec.status = shutdown <= today ? "retired" : "deprecated";
        rec.dates.deprecated = shutdown <= today ? null : shutdown;
      }
      out.push(rec);
    }
  });
  if (found === 0) {
    fail(
      c,
      "at least one table with 'Model' and 'Shutdown date' headers",
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
