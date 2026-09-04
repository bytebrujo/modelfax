// OpenAI provider. Sources verified live 2026-09-04 (platform.openai.com/docs/*
// now 301s to developers.openai.com/api/docs/*).
import { ParseError } from "../lib/errors.js";

export const provider = "openai";

export const sources = [
  { url: "https://developers.openai.com/api/docs/pricing", kind: "pricing" },
  { url: "https://developers.openai.com/api/docs/models", kind: "models" },
  { url: "https://developers.openai.com/api/docs/deprecations", kind: "deprecations" },
];

/**
 * Pure: HTML string → array of partial model records. Throws ParseError on any
 * structural surprise; never returns fewer fields than it found.
 * @param {string} _html
 * @param {string} sourceKind
 */
export function parse(_html, sourceKind) {
  throw new ParseError("openai parser not implemented (Phase 2)", {
    provider,
    sourceKind,
    selector: null,
    expectation: "parser implemented with fixtures in fixtures/openai/",
  });
}
