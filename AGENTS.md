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
