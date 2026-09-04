// Structured errors. Every scraper failure must name what broke so an agent can
// act on it without reading the page (build spec §5.2).

export class ParseError extends Error {
  /**
   * @param {string} message
   * @param {{provider: string, sourceKind: string, selector: string|null, expectation: string, found?: unknown}} details
   */
  constructor(message, details) {
    super(message);
    this.name = "ParseError";
    this.provider = details.provider;
    this.sourceKind = details.sourceKind;
    this.selector = details.selector;
    this.expectation = details.expectation;
    this.found = details.found;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      sourceKind: this.sourceKind,
      selector: this.selector,
      expectation: this.expectation,
      found: this.found,
    };
  }
}

export class FetchError extends Error {
  /**
   * @param {string} message
   * @param {{provider: string, url: string, status?: number|null, attempts: number, cause?: string}} details
   */
  constructor(message, details) {
    super(message);
    this.name = "FetchError";
    this.provider = details.provider;
    this.url = details.url;
    this.status = details.status ?? null;
    this.attempts = details.attempts;
    this.cause = details.cause;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      url: this.url,
      status: this.status,
      attempts: this.attempts,
      cause: this.cause,
    };
  }
}

// Exit codes for scrapers/run.js (build spec §5.1).
export const EXIT = Object.freeze({
  NO_CHANGES: 0,
  CHANGES_WRITTEN: 3,
  PARSE_FAILURE: 4,
  FETCH_FAILURE: 5,
});
