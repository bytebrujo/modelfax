// Shared parsing helpers. Every one of these throws ParseError rather than
// returning a fallback: a scraper that cannot read what it expects must say so
// with the selector and the expectation, never degrade to partial data
// (build spec §5.2, AGENTS.md rule 3).
import { ParseError } from "./errors.js";

/**
 * Normalize a cell's text.
 *
 * Docs sites render icons with private-use-area glyphs (Anthropic's model table
 * appends U+E08F to every row label) and pad cells with non-breaking and
 * zero-width characters. None of that is content, and all of it silently breaks
 * an `===` against a header name, so it is stripped before anything else reads
 * the string.
 */
export function clean(text) {
  return (
    String(text ?? "")
      .replace(/[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu, "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      // Hyphen, non-breaking hyphen, figure dash and minus all render like "-" but
      // are not "-"; OpenAI's deprecation dates use U+2011. En and em dashes are
      // left alone because callers treat them as "no value" markers.
      .replace(/[\u2010\u2011\u2012\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A table cell's model label, minus the parenthetical asides provider docs
 * append to it, e.g. "Claude Opus 4.1 (retired, except on Bedrock…)".
 */
export function modelLabel(text) {
  return clean(text)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

/** Context for every throw from this module, so errors name where they came from. */
export function ctx(provider, sourceKind, selector) {
  return { provider, sourceKind, selector };
}

export function fail(context, expectation, found) {
  throw new ParseError(`${context.provider}/${context.sourceKind}: expected ${expectation}`, {
    ...context,
    expectation,
    found,
  });
}

/** Assert and return, so callers read as a single expression. */
export function expect(
  value,
  context,
  expectation,
  predicate = (v) => v !== undefined && v !== null,
) {
  if (!predicate(value)) {
    fail(context, expectation, value);
  }
  return value;
}

/**
 * "$12.50 / MTok" → 12.5 · "$0.25 / MTok1" → 0.25 · "-" or "—" → null.
 * A cell that is neither a price nor an explicit dash is a structural surprise.
 */
export function money(text, context, expectation) {
  const t = clean(text);
  if (t === "" || t === "-" || t === "—" || /^(not available|n\/a|free of charge)$/i.test(t)) {
    return null;
  }
  const m = t.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) {
    fail(context, `${expectation} to be a $ amount or a dash, got ${JSON.stringify(t)}`, t);
  }
  return Number(m[1]);
}

/** "1,048,576" / "1.05M" / "128K tokens" / "200k" → integer. */
export function tokens(text, context, expectation) {
  const t = clean(text);
  const m = t.match(/([0-9][0-9,.]*)\s*([KkMm])?/);
  if (!m) {
    fail(context, `${expectation} to be a token count, got ${JSON.stringify(t)}`, t);
  }
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    fail(context, `${expectation} to be numeric, got ${JSON.stringify(t)}`, t);
  }
  const scale = m[2] ? (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : 1;
  const value = Math.round(n * scale);
  if (value <= 0) {
    fail(context, `${expectation} to be positive, got ${value}`, t);
  }
  return value;
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * "August 5, 2026" · "Aug 5, 2026" · "2026-08-05" → "2026-08-05".
 * Text that carries no date at all (e.g. "No shutdown date announced", "N/A")
 * returns null; text that looks like a date but will not parse throws.
 */
export function isoDate(text, context, expectation) {
  const t = clean(text);
  if (t === "" || /^(n\/a|none|no shutdown date announced|not announced|-|—)$/i.test(t)) {
    return null;
  }
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const named = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    if (!month) {
      fail(context, `${expectation} to name a month, got ${JSON.stringify(t)}`, t);
    }
    return `${named[3]}-${String(month).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`;
  }
  // A month with no day ("August 2026") is a real shape on Google's pages.
  const monthOnly = t.match(/\b([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (monthOnly && MONTHS[monthOnly[1].toLowerCase()]) {
    return `${monthOnly[2]}-${String(MONTHS[monthOnly[1].toLowerCase()]).padStart(2, "0")}-01`;
  }
  if (/\d/.test(t)) {
    fail(context, `${expectation} to be a parseable date, got ${JSON.stringify(t)}`, t);
  }
  return null;
}

/** Row cells of a table as cleaned strings. */
export function rowCells($, tr) {
  return $(tr)
    .find("td,th")
    .map((_, c) => clean($(c).text()))
    .get();
}

/**
 * Header cells of a table as cleaned strings.
 *
 * Not every docs site marks headers with `th`: Google's deprecation tables put
 * plain `td` cells inside `thead`. A table with no `thead` at all falls back to
 * a first row made entirely of `th`, and otherwise reports no headers rather
 * than guessing that its first data row is a header.
 */
export function headers($, table) {
  const th = $(table).find("thead th");
  if (th.length) {
    return th.map((_, c) => clean($(c).text())).get();
  }
  const td = $(table).find("thead td");
  if (td.length) {
    return td.map((_, c) => clean($(c).text())).get();
  }
  const firstRow = $(table).find("tr").first();
  if (firstRow.length && firstRow.children("th").length === firstRow.children().length) {
    return firstRow
      .children("th")
      .map((_, c) => clean($(c).text()))
      .get();
  }
  return [];
}

/**
 * The single table whose header row satisfies `match`. Zero matches or more
 * than one are both structural surprises: silently taking the first would be
 * exactly the "keep things working" degradation rule 3 forbids.
 */
export function findTable($, context, match, expectation) {
  const hits = $("table")
    .filter((_, t) => {
      const th = headers($, t);
      return th.length > 0 && match(th);
    })
    .get();
  if (hits.length !== 1) {
    fail(
      context,
      `exactly one table where ${expectation}, found ${hits.length}`,
      $("table")
        .map((_, t) => headers($, t).join(" | "))
        .get()
        .slice(0, 20),
    );
  }
  return hits[0];
}
