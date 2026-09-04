// Fixture loading shared by the per-provider parser tests.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..");

export function fixture(provider, kind) {
  const path = join(REPO_ROOT, "fixtures", provider, `${kind}.html`);
  if (!existsSync(path)) {
    throw new Error(`missing fixture ${path}`);
  }
  return readFileSync(path, "utf8");
}

/** model_id -> record, for asserting on one row without depending on order. */
export function byId(records) {
  const map = new Map();
  for (const r of records) {
    const existing = map.get(r.model_id) ?? {};
    map.set(r.model_id, { ...existing, ...r, pricing: { ...existing.pricing, ...r.pricing } });
  }
  return map;
}
