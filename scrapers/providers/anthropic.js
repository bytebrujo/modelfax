// Anthropic provider. Sources verified live 2026-09-04. docs.anthropic.com now
// lives at platform.claude.com; each page also serves a Markdown twin at `.md`.
import { ParseError } from "../lib/errors.js";

export const provider = "anthropic";

export const sources = [
  { url: "https://platform.claude.com/docs/en/about-claude/pricing", kind: "pricing" },
  { url: "https://platform.claude.com/docs/en/about-claude/models/overview", kind: "models" },
  {
    url: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
    kind: "deprecations",
  },
];

/**
 * Pure: HTML string → array of partial model records. Throws ParseError on any
 * structural surprise; never returns fewer fields than it found.
 * @param {string} _html
 * @param {string} sourceKind
 */
export function parse(_html, sourceKind) {
  throw new ParseError("anthropic parser not implemented (Phase 2)", {
    provider,
    sourceKind,
    selector: null,
    expectation: "parser implemented with fixtures in fixtures/anthropic/",
  });
}
