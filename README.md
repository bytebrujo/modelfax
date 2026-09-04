# modelfax

A machine-readable registry of AI model **pricing, context windows, and lifecycle
dates** (release / deprecation / retirement) across OpenAI, Anthropic, and Google,
published as a static site with a free JSON API.

Upstream provider pages are re-read daily; every change lands as a reviewed pull
request, so `git log -- data/` is the price history.

- Site: `https://bytebrujo.github.io/modelfax/` (live after Phase 4)
- Cost calculator: `https://bytebrujo.github.io/modelfax/calculator.html`

## JSON API

The API is the data files, served as static files. CORS is open.

| URL                                                             | Contents                                |
| --------------------------------------------------------------- | --------------------------------------- |
| `https://bytebrujo.github.io/modelfax/data/openai.json`         | OpenAI models                           |
| `https://bytebrujo.github.io/modelfax/data/anthropic.json`      | Anthropic models                        |
| `https://bytebrujo.github.io/modelfax/data/google.json`         | Google (Gemini API) models              |
| `https://bytebrujo.github.io/modelfax/schema/model.schema.json` | JSON Schema 2020-12 for every data file |

Each data file is `{"schema_version": "1.0.0", "models": [ … ]}`. One record:

```json
{
  "id": "anthropic:claude-sonnet-5",
  "provider": "anthropic",
  "model_id": "claude-sonnet-5",
  "display_name": "Claude Sonnet 5",
  "family": "claude",
  "status": "available",
  "modalities": { "input": ["text", "image"], "output": ["text"] },
  "context_window": 1000000,
  "max_output_tokens": 128000,
  "pricing": {
    "currency": "USD",
    "input_per_mtok": 2.0,
    "output_per_mtok": 10.0,
    "cached_input_per_mtok": 0.2,
    "batch_input_per_mtok": 1.0,
    "batch_output_per_mtok": 5.0
  },
  "dates": { "released": null, "deprecated": null, "retired": null },
  "sources": ["https://platform.claude.com/docs/en/about-claude/pricing"],
  "last_verified": "2026-09-04",
  "notes": "…"
}
```

Field reference:

| field               | type            | notes                                                           |
| ------------------- | --------------- | --------------------------------------------------------------- |
| `id`                | string          | `<provider>:<model_id>`, globally unique                        |
| `provider`          | enum            | `openai` · `anthropic` · `google`                               |
| `model_id`          | string          | the exact string the provider's API accepts                     |
| `status`            | enum            | `announced` · `available` · `deprecated` · `retired`            |
| `modalities`        | object          | `input`/`output` arrays from `text`, `image`, `audio`, `video`  |
| `context_window`    | integer         | tokens                                                          |
| `max_output_tokens` | integer or null | null when the provider does not publish it                      |
| `pricing`           | object or null  | USD per **million** tokens; null only for `announced`/`retired` |
| `dates`             | object          | `released`, `deprecated`, `retired`: ISO date or null           |
| `sources`           | array           | https URLs on the provider's own domain where the data was read |
| `last_verified`     | date            | when the record was last confirmed against `sources`            |
| `notes`             | string          | free text, ≤500 chars (tiered pricing, aliases, caveats)        |

### Stability promise

- Paths above never change within a schema major version.
- Additive schema changes bump the minor version (`1.1.0`); consumers should
  ignore unknown fields. Breaking changes bump the major, ship a migration
  script, and are announced in `AGENTS.md`.
- `schema_version` in each data file always equals the `const` in the schema.

### Coverage

Each provider module declares the model ids the registry covers. Upstream pages
list many more, including image, video and embedding models that have no
per-token price and do not fit this schema. A model that appears on a provider's
pricing or models page without being covered is reported by the scraper as an
untracked model rather than being recorded with missing fields, and widening
coverage is a deliberate change. Open an issue or a PR if a model you need is
missing.

Context windows, max output tokens and modalities are only published in a
scrapeable table by one of the three providers, so those three fields are
maintained by hand and everything else is scraped.

### Update cadence

A scheduled job scrapes every provider daily at 06:00 UTC. Changes are opened as
a pull request and merged after CI passes. When a provider page changes shape,
the scraper fails loudly and stale-but-valid data stays published until a fix
lands; `last_verified` tells you how old each record is.

## Local development

Requires Node 24 (see `.nvmrc`) and `make`.

```sh
npm ci
make check      # lint · schema · test · scrape-dry (fixtures only) · site-smoke
make scrape     # live scrape; exit 3 = data changed, 4 = parse failure, 5 = fetch failure
make serve      # assemble the Pages layout into _site/ and serve on :8000
```

`make check` needs no network beyond `npm ci`. Read `AGENTS.md` before changing
anything.

## Repository layout

```
schema/model.schema.json   the contract
data/<provider>.json       the API
scrapers/run.js            orchestrator; scrapers/providers/*.js one module per provider
fixtures/<provider>/       saved upstream pages the parser tests run against
test/                      schema, cross-file invariants, parser, and site smoke tests
site/                      hand-written HTML/CSS/JS, no build step
.github/workflows/         ci (PR gate), scrape (daily), pages (deploy)
```

## Contributing

Corrections are welcome as pull requests against `data/` (cite the provider URL
in `sources`) or against a parser (include the new fixture and test in the same
PR). CI must be green.

## Licenses

Code is licensed under the [MIT License](LICENSE). Data in `data/` is licensed
under [CC-BY-4.0](LICENSE-DATA); attribute "modelfax" with a link back.

Prices are transcribed from provider documentation and may lag or contain
errors. Confirm against the linked `sources` before relying on them.
