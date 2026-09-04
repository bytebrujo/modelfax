// Google (Gemini API) provider. Sources verified live 2026-09-04.
import { ParseError } from "../lib/errors.js";

export const provider = "google";

export const sources = [
  { url: "https://ai.google.dev/gemini-api/docs/pricing", kind: "pricing" },
  { url: "https://ai.google.dev/gemini-api/docs/models", kind: "models" },
  { url: "https://ai.google.dev/gemini-api/docs/deprecations", kind: "deprecations" },
];

/**
 * Pure: HTML string → array of partial model records. Throws ParseError on any
 * structural surprise; never returns fewer fields than it found.
 * @param {string} _html
 * @param {string} sourceKind
 */
export function parse(_html, sourceKind) {
  throw new ParseError("google parser not implemented (Phase 2)", {
    provider,
    sourceKind,
    selector: null,
    expectation: "parser implemented with fixtures in fixtures/google/",
  });
}
