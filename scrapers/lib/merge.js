// Merge partial records (one per source page) into whole records, keyed by model_id.
// A partial is any object with at least `model_id`; other fields are optional.
// Conflicts (two sources give different non-null values for the same scalar) are
// errors — upstream disagreement must be surfaced, not resolved silently.

export class MergeConflict extends Error {
  constructor(modelId, field, a, b) {
    super(`merge conflict for ${modelId}.${field}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    this.name = "MergeConflict";
    this.modelId = modelId;
    this.field = field;
    this.values = [a, b];
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mergeValue(modelId, field, a, b) {
  if (a === undefined || a === null) {
    return b;
  }
  if (b === undefined || b === null) {
    return a;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = mergeValue(modelId, `${field}.${k}`, a[k], b[k]);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...new Set([...a, ...b])];
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new MergeConflict(modelId, field, a, b);
  }
  return a;
}

/**
 * @param {Array<object>} partials
 * @returns {Map<string, object>} model_id → merged partial
 */
export function mergePartials(partials) {
  const byId = new Map();
  for (const p of partials) {
    if (!p || typeof p.model_id !== "string" || p.model_id.length === 0) {
      throw new TypeError(`partial record without model_id: ${JSON.stringify(p)}`);
    }
    const existing = byId.get(p.model_id);
    if (!existing) {
      byId.set(p.model_id, structuredClone(p));
      continue;
    }
    for (const k of Object.keys(p)) {
      existing[k] = mergeValue(p.model_id, k, existing[k], p[k]);
    }
  }
  return byId;
}
