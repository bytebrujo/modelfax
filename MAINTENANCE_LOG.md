# MAINTENANCE_LOG.md

One entry per maintenance run, newest last. Template:

```markdown
## 2026-MM-DD — run N

- prompt: standing (unchanged) | special: <text>
- tasks attempted: [...]
- unattended: [...] # completed with no human edits
- interventions: N — <what and why, one line each>
- human_minutes: N
- tokens/cost if known: …
- drift encountered: <provider/page/selector> | none
- AGENTS.md rules added: N
- CI: green on main at end of run? yes/no
```

## 2026-09-04 — run 0 (build)

- prompt: special: build spec §13 session kickoff, then "proceed" through phases 1-3
- tasks attempted: [Phase 1 skeleton + schema + seed data + CI, Phase 2 scrapers + fixtures + tests + kill test, Phase 2 coverage widening 12 -> 25 models, Phase 3 site verification and fixes]
- unattended: [schema and seed data, all three parsers, fixtures and 69 tests, kill test across 7 corruptions, Namespace runner migration, coverage widening, site link and layout fixes, 8 PRs opened and merged with green CI]
- interventions: 4
  - Billing: the GitHub account was locked, so Actions could not start any job. Only the account owner can fix billing.
  - SCRAPE_PAT: a fine-grained token had to be minted by hand; bot PRs get no CI run without it.
  - Repo visibility: branch protection and Pages both require a public repo on this plan, so the repo went public in Phase 1 rather than Phase 4. Confirmed by the owner after the fact.
  - CI runners: the owner specified the Namespace profile, which was not in the build spec.
- human_minutes: not measured; the four interventions above are the ground truth for run 0. Later runs will record it.
- tokens/cost if known: not measured
- drift encountered: three real upstream changes, all before the first cron fired.
  - platform.openai.com/docs/* now 301s to developers.openai.com/api/docs/*
  - Anthropic docs moved from docs.anthropic.com to platform.claude.com
  - ai.google.dev served the CI runner Persian numerals ("۱.۵۰ دلار") because the request sent no Accept-Language; table headers stayed English so only the values broke
- AGENTS.md rules added: 18
- CI: green on main at end of run? yes

Notes for the next run:

- The scrape workflow has been observed taking the parse-failure path (opened issue #3, a real bug) and the no-change path (exit 0). The data-PR path has not completed, because nothing upstream has changed since the parsers landed. Two bugs in that step were found by executing it and are fixed. It fires on the next genuine change, or by the 30-day last_verified re-stamp.
- Phase 3 is verified by headless Chromium at 500px and 1280px, the narrowest the local binary allows. Verification on a real phone browser is outstanding and needs a person.
- Phase 4 submissions, opened with the owner's go-ahead after checking each list's own rules:
  - public-apis/public-apis PR #7232, Machine Learning section. Their format validator reports the same 568 pre-existing errors before and after the change, and none on the added line.
  - steven2358/awesome-generative-ai PR #1322, into DISCOVERIES.md rather than the main list, because the main list requires 1,000 followers and this project has none. That file exists for exactly this case.
  - Two better-fitting lists were checked and deliberately not submitted to. awesome-ai-tokenomics requires an independent adoption signal, and awesome-llm-cost requires six months of public history; both auto-close mass cross-posts and review the submitting account's recent PR history. A reminder is set for 2027-03-04 to revisit.
  - Two further lists are blocked by a rule this project cannot satisfy today: marcelscruz/public-apis and marcelscruz/dev-resources both reject github.io hosting and need a custom domain.
  - The community post is drafted but not published; posting needs a person with the account.
- Auto-merge for data-only PRs is scheduled for month 2 per the build spec, and graduating to it is itself a log entry.
