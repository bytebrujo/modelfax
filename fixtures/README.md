# fixtures/

Saved copies of upstream provider pages, one directory per provider:
`fixtures/<provider>/<kind>.html`, where `<kind>` matches an entry in that
provider module's `sources`.

They do two jobs:

1. `make scrape-dry` parses them instead of the network, so `make check` runs
   offline and CI never depends on a provider being up.
2. `test/providers/*.test.js` asserts exact values against them, and
   `test/providers/kill.test.js` corrupts them in memory to prove a broken page
   raises a `ParseError` naming the selector and the expectation.

Because `make scrape-dry` compares the parsed result against `data/`, the two
cannot disagree: **whatever the committed fixtures parse to is what `data/` must
contain.** That is what makes upstream drift a self-documenting change.

## Refreshing a fixture when upstream changes

One PR, per AGENTS.md rule 6:

```sh
curl -sSL -A "modelfax-scraper/0.1 (+https://github.com/bytebrujo/modelfax)" \
  "<the source url>" -o fixtures/<provider>/<kind>.html
node scrapers/run.js --offline          # re-derive data/ from the new fixture
make check                              # parser + expectations must agree again
```

Then update the parser and the test expectations in the same commit, so the diff
shows what upstream changed and how the parser answered it.
