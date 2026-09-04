# Single entry point. `make check` is the agent's whole world (build spec §7).
# Every target runs headlessly and fails fast.

NODE ?= node
SITE_DIR := _site

.PHONY: check lint schema test scrape-dry site-smoke scrape serve build-site clean

check: lint schema test scrape-dry site-smoke
	@echo '{"ts":"'$$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","component":"make","msg":"check passed"}'

lint:
	npx eslint .
	npx prettier --check .

schema:
	$(NODE) scrapers/lib/schema.js

test:
	$(NODE) --test "test/**/*.test.js"

scrape-dry:
	$(NODE) scrapers/run.js --check-only --offline

site-smoke:
	$(NODE) test/site-smoke.js

# Live scrape (network). Exit 3 = data changed, 4 = parse failure, 5 = fetch failure.
scrape:
	$(NODE) scrapers/run.js

# Assemble the Pages layout locally: site/ at root, data/ and schema/ beside it.
build-site:
	rm -rf $(SITE_DIR)
	mkdir -p $(SITE_DIR)
	cp -R site/. $(SITE_DIR)/
	cp -R data $(SITE_DIR)/data
	cp -R schema $(SITE_DIR)/schema

serve: build-site
	cd $(SITE_DIR) && python3 -m http.server 8000

clean:
	rm -rf $(SITE_DIR)
