// Field-level diff between the current data file and freshly normalized records.
// `last_verified` is ignored: refreshing that field alone is not a "change".

const IGNORED = new Set(["last_verified"]);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * @returns {{added: string[], removed: string[], changed: Array<{model_id: string, field: string, from: unknown, to: unknown}>}}
 */
export function diffRecords(before, after) {
  const beforeById = new Map(before.map((r) => [r.model_id, r]));
  const afterById = new Map(after.map((r) => [r.model_id, r]));
  const added = [...afterById.keys()].filter((id) => !beforeById.has(id)).sort();
  const removed = [...beforeById.keys()].filter((id) => !afterById.has(id)).sort();
  const changed = [];

  for (const [id, a] of afterById) {
    const b = beforeById.get(id);
    if (!b) {
      continue;
    }
    const fb = flatten(b);
    const fa = flatten(a);
    const keys = new Set([...Object.keys(fb), ...Object.keys(fa)]);
    for (const key of [...keys].sort()) {
      if (IGNORED.has(key.split(".")[0])) {
        continue;
      }
      if (JSON.stringify(fb[key]) !== JSON.stringify(fa[key])) {
        changed.push({ model_id: id, field: key, from: fb[key], to: fa[key] });
      }
    }
  }
  return { added, removed, changed };
}

export function hasChanges(diff) {
  return diff.added.length + diff.removed.length + diff.changed.length > 0;
}
