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
