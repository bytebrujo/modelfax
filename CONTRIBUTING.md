# Contributing

Corrections are the most useful thing you can send. Prices and retirement dates
change without warning, and a registry that is wrong is worse than no registry.

## Reporting wrong data

Open an issue with the provider's own URL showing the correct value. That URL is
the whole argument; everything here is transcribed from provider documentation
and every record carries the `sources` it was read from.

## Fixing data yourself

Edit `data/<provider>.json` and open a pull request. Two rules:

- Cite the provider page in `sources`. It must be https and on the provider's
  own domain, which a test enforces.
- Run `make check` first. It validates every record against
  `schema/model.schema.json` and checks cross-file invariants.

Note that the scrapers own the fields they can read. If you correct a price by
hand and the provider's page still says something else, the next scrape will
change it back, which is the intended behaviour. Fix the parser instead.

## Adding a model

The registry covers a curated set rather than everything a provider lists,
because context windows and modalities are not published in a scrapeable table
by most providers. Adding a model is two steps in one pull request:

1. Add its id to `tracked` in `scrapers/providers/<provider>.js`.
2. Add a complete record to `data/<provider>.json`.

A test enforces that those two stay in sync, so you cannot do one without the
other.

## Fixing a broken scraper

When a provider restructures a page, the scraper fails loudly with a
`ParseError` naming the CSS selector and the expectation that broke. The fix is
one pull request containing all three of:

1. A refreshed fixture in `fixtures/<provider>/<kind>.html`.
2. The parser change.
3. The updated test expectations.

Then run `node scrapers/run.js --offline` to re-derive `data/` from the new
fixture, because `make check` asserts the two agree.

## Before you open a pull request

```sh
npm ci
make check
```

CI runs exactly that and is a required check. `AGENTS.md` has the operational
rules, including the ones learned the hard way.
