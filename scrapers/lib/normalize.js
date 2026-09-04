// Turn merged partials into complete, schema-shaped records.
// Anything the parsers did not supply is filled from the existing record for the
// same model_id (so lifecycle dates survive a pricing-only page), else defaulted.

const EMPTY_PRICING_KEYS = [
  "cached_input_per_mtok",
  "batch_input_per_mtok",
  "batch_output_per_mtok",
];

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizePricing(pricing) {
  if (pricing === null || pricing === undefined) {
    return null;
  }
  const out = { currency: "USD", ...pricing };
  for (const k of EMPTY_PRICING_KEYS) {
    if (out[k] === undefined) {
      out[k] = null;
    }
  }
  return out;
}

function sortedUnique(arr) {
  return [...new Set(arr)].sort();
}

/**
 * @param {string} provider
 * @param {Map<string, object>} merged  model_id → partial
 * @param {Array<object>} existing      current records from data/<provider>.json
 * @param {{today?: string}} opts
 * @returns {Array<object>} complete records sorted by model_id
 */
export function normalizeRecords(provider, merged, existing, opts = {}) {
  const today = opts.today ?? todayISO();
  const prior = new Map(existing.map((r) => [r.model_id, r]));
  const out = [];

  for (const [modelId, p] of merged) {
    const old = prior.get(modelId) ?? {};
    const dates = { released: null, deprecated: null, retired: null, ...old.dates, ...p.dates };
    const status = p.status ?? old.status ?? "available";
    const record = {
      id: `${provider}:${modelId}`,
      provider,
      model_id: modelId,
      display_name: p.display_name ?? old.display_name ?? modelId,
      family: p.family ?? old.family ?? provider,
      status,
      // Deliberately no default. No provider publishes modalities in a shape
      // worth scraping, so they come from the existing record. A brand-new model
      // therefore has none, and schema validation rejects the file by name
      // rather than quietly asserting it is a text-only model.
      modalities: p.modalities ?? old.modalities,
      context_window: p.context_window ?? old.context_window,
      max_output_tokens: p.max_output_tokens ?? old.max_output_tokens ?? null,
      pricing: normalizePricing(p.pricing !== undefined ? p.pricing : old.pricing),
      dates,
      sources: sortedUnique([...(p.sources ?? []), ...(old.sources ?? [])]),
      last_verified: today,
    };
    const notes = p.notes ?? old.notes;
    if (notes) {
      record.notes = notes;
    }
    out.push(record);
  }

  out.sort((a, b) => (a.model_id < b.model_id ? -1 : a.model_id > b.model_id ? 1 : 0));
  return out;
}
