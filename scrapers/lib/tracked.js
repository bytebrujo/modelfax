// Coverage control for a provider module.
//
// Upstream pages list far more models than this registry carries: retired
// snapshots, image, audio and embedding models, and every model a provider has
// ever shipped. A provider module declares the ids it covers in `tracked`, and
// everything else is reported rather than half-populated — a model row read
// from a pricing page has no context window, and inventing one would be exactly
// the silent degradation AGENTS.md rule 3 forbids.
//
// `tracked` entries may also declare aliases. Provider pages disagree with
// themselves about a model's name: Anthropic's pricing page prints display names
// that slugify to the dateless alias while its deprecation page prints the dated
// snapshot, and OpenAI's deprecation page names snapshots its pricing page does
// not. Canonicalizing before the merge is what folds those into one record.

/** @returns {{canonical: Map<string,string>, ids: Set<string>}} */
export function aliasIndex(tracked) {
  const canonical = new Map();
  const ids = new Set();
  for (const entry of tracked) {
    ids.add(entry.model_id);
    canonical.set(entry.model_id, entry.model_id);
    for (const alias of entry.aliases ?? []) {
      if (canonical.has(alias) && canonical.get(alias) !== entry.model_id) {
        throw new Error(
          `alias "${alias}" maps to both ${canonical.get(alias)} and ${entry.model_id}`,
        );
      }
      canonical.set(alias, entry.model_id);
    }
  }
  return { canonical, ids };
}

/**
 * Rewrite alias ids to their canonical form and split the partials into the ones
 * this registry covers and the ones it does not.
 * @returns {{kept: Array<object>, untracked: Map<string, Set<string>>}}
 */
export function applyTracking(partials, index) {
  const kept = [];
  const untracked = new Map();
  for (const p of partials) {
    const canonical = index.canonical.get(p.model_id);
    if (canonical) {
      kept.push({ ...p, model_id: canonical });
      continue;
    }
    if (!untracked.has(p.model_id)) {
      untracked.set(p.model_id, new Set());
    }
    untracked.get(p.model_id).add(p._kind);
  }
  return { kept, untracked };
}
