# fixtures/

Saved copies of upstream provider pages, one directory per provider:
`fixtures/<provider>/<kind>.html` where `<kind>` matches an entry in that
provider module's `sources`. `make scrape-dry` parses these instead of the
network. When upstream drifts: save the new page here, fix the parser, update
the test — one PR (AGENTS.md rule 6).

Fixture directories are created in Phase 2 alongside each parser.
