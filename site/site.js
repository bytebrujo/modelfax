/* modelfax site script: vanilla JS, no dependencies. Renders the models table
   (index.html) and the cost calculator (calculator.html) from data/<provider>.json. */
(function () {
  "use strict";

  const PROVIDERS = ["openai", "anthropic", "google"];

  const PROVIDER_LABEL = { openai: "OpenAI", anthropic: "Anthropic", google: "Google" };

  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const usdTiny = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const int = new Intl.NumberFormat("en-US");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") {
          node.className = attrs[k];
        } else if (k === "text") {
          node.textContent = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (const c of children) {
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function setStatus(msg) {
    const s = document.getElementById("status");
    if (s) {
      s.textContent = msg;
    }
  }

  async function loadAll() {
    const results = await Promise.all(
      PROVIDERS.map(async (p) => {
        const res = await fetch(`data/${p}.json`);
        if (!res.ok) {
          throw new Error(`data/${p}.json: HTTP ${res.status}`);
        }
        const doc = await res.json();
        return doc.models;
      }),
    );
    return results.flat();
  }

  function price(m, key) {
    return m.pricing && typeof m.pricing[key] === "number" ? m.pricing[key] : null;
  }

  function fmtPrice(v) {
    return v === null ? "—" : usd.format(v);
  }

  function fmtDate(v) {
    return v === null || v === undefined ? "—" : v;
  }

  function badge(status) {
    return el("span", { class: `badge ${status}`, text: status });
  }

  /* `sources` is stored sorted, so its first entry is alphabetical rather than
     useful: every Anthropic model linked to the same deprecations page. Score
     each URL and link the one that is actually about this model. */
  function primarySource(m) {
    const sources = m.sources || [];
    if (!sources.length) {
      return null;
    }
    const id = m.model_id.toLowerCase();
    const undated = id.replace(/-\d{8}$/, "");
    const needles = new Set();
    for (const base of [id, undated]) {
      needles.add(base);
      needles.add(base.replace(/\./g, "-"));
      // Provider doc paths usually drop the family prefix: claude-opus-4-5
      // lives at /models/opus-4-5/overview.
      needles.add(base.replace(/^[a-z]+-/, ""));
      needles.add(base.replace(/^[a-z]+-/, "").replace(/\./g, "-"));
    }
    let best = sources[0];
    let bestScore = -1;
    for (const url of sources) {
      const lower = url.toLowerCase();
      let score = lower.split("/").length;
      for (const needle of needles) {
        if (needle.length > 2 && lower.includes(needle)) {
          score += 100;
          break;
        }
      }
      if (score > bestScore) {
        best = url;
        bestScore = score;
      }
    }
    return best;
  }

  function modelCell(m) {
    const src = primarySource(m);
    const name = src
      ? el("a", { href: src, rel: "noopener", text: m.display_name })
      : el("span", { text: m.display_name });
    return el("td", { class: "model" }, [name, el("span", { class: "id", text: m.model_id })]);
  }

  /* ---------------- models table (index.html) ---------------- */

  function sortKey(m, key) {
    switch (key) {
      case "input":
        return price(m, "input_per_mtok");
      case "output":
        return price(m, "output_per_mtok");
      case "cached":
        return price(m, "cached_input_per_mtok");
      case "released":
        return m.dates.released;
      case "deprecated":
        return m.dates.deprecated;
      case "retired":
        return m.dates.retired;
      default:
        return m[key];
    }
  }

  function compare(a, b, key, dir) {
    const va = sortKey(a, key);
    const vb = sortKey(b, key);
    if (va === null || va === undefined) {
      return vb === null || vb === undefined ? 0 : 1;
    }
    if (vb === null || vb === undefined) {
      return -1;
    }
    const r = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? r : -r;
  }

  function initModelsTable(models) {
    const table = document.getElementById("models");
    const tbody = document.getElementById("rows");
    const form = document.getElementById("filters");
    const state = { key: "provider", dir: "asc" };

    function render() {
      const provider = form.provider.value;
      const status = form.status.value;
      const q = form.q.value.trim().toLowerCase();
      const rows = models
        .filter((m) => !provider || m.provider === provider)
        .filter((m) => !status || m.status === status)
        .filter(
          (m) =>
            !q || m.model_id.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q),
        )
        .sort((a, b) => compare(a, b, state.key, state.dir) || a.id.localeCompare(b.id));

      tbody.replaceChildren(
        ...rows.map((m) =>
          el("tr", null, [
            el("td", { text: PROVIDER_LABEL[m.provider] || m.provider }),
            modelCell(m),
            el("td", null, [badge(m.status)]),
            el("td", { class: "num", text: fmtPrice(price(m, "input_per_mtok")) }),
            el("td", { class: "num", text: fmtPrice(price(m, "output_per_mtok")) }),
            el("td", { class: "num", text: fmtPrice(price(m, "cached_input_per_mtok")) }),
            el("td", { class: "num", text: int.format(m.context_window) }),
            el("td", { text: fmtDate(m.dates.released) }),
            el("td", { text: fmtDate(m.dates.deprecated) }),
            el("td", { text: fmtDate(m.dates.retired) }),
            el("td", { text: m.last_verified }),
          ]),
        ),
      );
      setStatus(`${rows.length} of ${models.length} models shown.`);

      for (const th of table.querySelectorAll("thead th")) {
        const btn = th.querySelector("button");
        if (btn && btn.dataset.sort === state.key) {
          th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
        } else {
          th.removeAttribute("aria-sort");
        }
      }
    }

    form.addEventListener("input", render);
    form.addEventListener("submit", (e) => e.preventDefault());
    table.querySelector("thead").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-sort]");
      if (!btn) {
        return;
      }
      const key = btn.dataset.sort;
      if (state.key === key) {
        state.dir = state.dir === "asc" ? "desc" : "asc";
      } else {
        state.key = key;
        state.dir = "asc";
      }
      render();
    });
    render();
  }

  /* ---------------- cost calculator (calculator.html) ---------------- */

  function initCalculator(models) {
    const form = document.getElementById("calc");
    const tbody = document.getElementById("rows");

    function num(input) {
      const v = Number(input.value);
      return Number.isFinite(v) && v >= 0 ? v : 0;
    }

    function render() {
      const inTok = num(form.input);
      const outTok = num(form.output);
      const reqs = Math.max(1, num(form.requests));
      const includeInactive = form.inactive.checked;

      const rows = models
        .filter((m) => m.pricing)
        .filter((m) => includeInactive || m.status === "available" || m.status === "announced")
        .map((m) => {
          const inCost = (inTok / 1e6) * m.pricing.input_per_mtok * reqs;
          const outCost = (outTok / 1e6) * m.pricing.output_per_mtok * reqs;
          const batchIn = m.pricing.batch_input_per_mtok;
          const batchOut = m.pricing.batch_output_per_mtok;
          const batch =
            batchIn !== null && batchOut !== null
              ? ((inTok / 1e6) * batchIn + (outTok / 1e6) * batchOut) * reqs
              : null;
          return { m, inCost, outCost, total: inCost + outCost, batch };
        })
        .sort((a, b) => a.total - b.total || a.m.id.localeCompare(b.m.id));

      tbody.replaceChildren(
        ...rows.map((r, i) =>
          el("tr", null, [
            el("td", { text: String(i + 1) }),
            el("td", { text: PROVIDER_LABEL[r.m.provider] || r.m.provider }),
            modelCell(r.m),
            el("td", null, [badge(r.m.status)]),
            el("td", { class: "num", text: usdTiny.format(r.inCost) }),
            el("td", { class: "num", text: usdTiny.format(r.outCost) }),
            el("td", { class: "num", text: usdTiny.format(r.total) }),
            el("td", { class: "num", text: r.batch === null ? "—" : usdTiny.format(r.batch) }),
          ]),
        ),
      );
      setStatus(
        `${rows.length} models priced for ${int.format(inTok)} input + ${int.format(outTok)} output tokens × ${int.format(reqs)}.`,
      );
    }

    form.addEventListener("input", render);
    form.addEventListener("submit", (e) => e.preventDefault());
    render();
  }

  /* ---------------- boot ---------------- */

  loadAll()
    .then((models) => {
      if (document.getElementById("models")) {
        initModelsTable(models);
      } else if (document.getElementById("costs")) {
        initCalculator(models);
      }
    })
    .catch((err) => {
      setStatus(`Could not load data: ${err.message}`);
      console.error(JSON.stringify({ level: "error", component: "site", msg: err.message }));
    });
})();
