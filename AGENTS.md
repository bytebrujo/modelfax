# AGENTS.md — read this first, every session

## What this is

A registry of AI model pricing/lifecycle data. The JSON Schema in /schema is the
contract; data/ must always validate. The site is static; the API is the data
files themselves.

## Commands

- make check # full self-verification; must be green before any PR
- make scrape # live scrape (network)
- make serve # preview site locally

## Hard rules

1. Never merge or push with make check failing.
2. Never add a dependency without appending a Learned Rules entry justifying it.
3. Scrapers fail loudly (ParseError with selector + expectation). Never return
   partial records to “keep things working.”
4. Schema changes follow the versioning procedure in the build spec §4.4.
5. All logs are single-line JSON.
6. Upstream drift fix = new fixture + parser change + test change, in one PR.

## Learned rules (append-only, date each entry, newest last)

<!-- The agent appends operational lessons here as it maintains the repo. -->

- 2026-09-04 — Branch protection on this account requires a **public** repo
  (free plan: `POST /repos/.../rulesets` returns 403 "Upgrade to GitHub Pro or
  make this repository public"). GitHub Pages has the same constraint. The repo
  was therefore made public during Phase 1 rather than Phase 4; Phase 4's
  remaining work is announcing it, not flipping visibility. The active ruleset
  on `main` requires a pull request and the `make check` status check, with no
  bypass actors — that includes the repo owner, so _every_ change lands via PR.
- 2026-09-04 — `platform.openai.com/docs/*` now 301s to
  `developers.openai.com/api/docs/*`, and Anthropic's docs moved from
  `docs.anthropic.com` to `platform.claude.com`. Provider `sources` record the
  post-redirect URLs; a scraper that follows a 301 on every run is wasting a
  round trip and hiding drift. Re-verify source URLs before writing a parser
  (build spec §12), never trust a remembered URL.
- 2026-09-04 — Data PRs opened with the default `GITHUB_TOKEN` do **not**
  trigger `pull_request` workflows, so CI would never run and the PR could
  never satisfy the required status check. `scrape.yml` reads a `SCRAPE_PAT`
  secret and falls back to `GITHUB_TOKEN`; until that secret exists, the daily
  scrape can open a PR but it will sit unmergeable. Set the secret before
  relying on the cron.
- 2026-09-04 — CI runs on the Namespace profile `namespace-profile-brujo`, the
  same one the rest of this account uses. Workflows read
  `${{ vars.NAMESPACE_RUNNER || 'namespace-profile-brujo' }}`, so a repository
  Actions variable overrides the runner without editing a workflow file. If
  Namespace is ever unavailable, set `NAMESPACE_RUNNER` to `ubuntu-latest`
  rather than editing the workflows. The job _name_ (`make check`) is what
  branch protection matches on, so it must not change when the runner does.
- 2026-09-04 — Provider pages carry invisible characters that break an exact
  header match: Anthropic's model table appends a private-use icon glyph
  (U+E08F) to every row label, and OpenAI's deprecation dates use non-breaking
  hyphens (U+2011). `clean()` in `scrapers/lib/parse.js` strips private-use and
  zero-width characters and normalizes hyphen-like dashes. Compare header text
  only through `clean()`; never against a raw `.text()`.
- 2026-09-04 — Not every table marks its header cells with `th`. Google's
  deprecation tables use `td` inside `thead`. `headers()` handles that; do not
  reach for `find("thead th")` directly.
- 2026-09-04 — Each provider module exports `tracked`, the model ids this
  registry covers, because upstream pages list far more models than the registry
  carries (Google's pricing page alone lists ~46 others, including image, video
  and embedding models that have no per-token price). A model outside `tracked`
  is reported by run.js as `untracked models on a catalog page`, never
  half-populated. Widening coverage means adding the id to `tracked` **and**
  seeding a record, because context windows and modalities are not scraped.
- 2026-09-04 — Only Anthropic publishes context windows in a scrapeable table.
  OpenAI and Google publish them only on per-model pages, which would mean one
  source and one fixture per model, so `context_window`, `max_output_tokens` and
  `modalities` are carried forward from the existing record. `normalize()`
  deliberately has no default for them: a brand-new model with none fails schema
  validation by name rather than being silently recorded as text-only.
- 2026-09-04 — `make scrape-dry` compares fixture-derived output against
  `data/`, so the two must agree. After changing a fixture or a parser, run
  `node scrapers/run.js --offline` to re-derive `data/` before `make check`.
- 2026-09-04 — `last_verified` is excluded from the diff, so a run that confirms
  nothing changed does not open a PR. To stop records looking stale anyway,
  run.js re-stamps any record older than 30 days even with no field change,
  which stays inside the 45-day staleness warning in `test/data.test.js`.
- 2026-09-04 — Provider docs localize by geo-IP when a request sends no
  `Accept-Language`. The first live scrape from a GitHub Actions runner read
  Google's prices as `۱.۵۰ دلار`: table headers stayed English, so the structure
  matched and only the values were unreadable. `scrapers/lib/fetch.js` now sends
  `accept-language: en-US,en;q=0.9`, and `money()` says so when it sees
  non-ASCII digits. A parser that works locally and fails in CI on _values_
  rather than _structure_ is a fetch problem; check this before touching the
  parser.
- 2026-09-04 — `github.run_started_at` arrives empty inside a workflow step's
  `env:`. It produced branch names like `data/-33837114866` and a commit message
  reading `data:` with no providers. Compute dates in the shell with
  `date -u +%F`.
- 2026-09-04 — Exit 3 must mean the file on disk would differ, not that some
  flag asked for a write. A forced refresh that re-stamped `last_verified` to
  the date already recorded produced byte-identical output, and the workflow
  branched, found nothing to commit, and failed. `run.js` now compares the
  serialized document against the file. Any future "force a write" switch has to
  keep that property.
- 2026-09-04 — Phase 2 status: the scrape workflow has been observed taking the
  parse-failure path (opened issue #3, a real bug) and the no-change path
  (exit 0, nothing opened). The data-PR path has not yet run to completion
  because nothing upstream has changed since the parsers landed; the two bugs
  above were found by executing that step and are fixed. It will fire on the
  next genuine upstream change, or by the 30-day `last_verified` re-stamp at the
  latest.
