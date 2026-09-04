// fetch with timeout + retries + identifying User-Agent (build spec §5.1).
import { FetchError } from "./errors.js";

export const USER_AGENT =
  "modelfax-scraper/0.1 (+https://github.com/bytebrujo/modelfax; data registry bot)";

const DEFAULTS = { timeoutMs: 10_000, retries: 2, backoffMs: 1_000 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 * @param {{provider: string, timeoutMs?: number, retries?: number, backoffMs?: number, fetchImpl?: typeof fetch}} opts
 * @returns {Promise<string>} response body as text
 */
export async function fetchText(url, opts) {
  const { provider, timeoutMs, retries, backoffMs } = { ...DEFAULTS, ...opts };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const attempts = retries + 1;
  let lastCause = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,*/*",
          // Without this, a docs site localizes by geo-IP and the page that
          // comes back depends on where the runner happens to be. Google served
          // a GitHub Actions runner Persian numerals for its prices
          // ("۱.۵۰ دلار") while leaving the table headers in English, so the
          // structure matched and only the values were unreadable.
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (res.ok) {
        return await res.text();
      }
      lastCause = `HTTP ${res.status}`;
      // 4xx other than 429 will not get better on retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastCause = err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : String(err.message);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) {
      await sleep(backoffMs * attempt);
    }
  }

  throw new FetchError(`fetch failed for ${url}: ${lastCause}`, {
    provider,
    url,
    status: lastStatus,
    attempts,
    cause: lastCause,
  });
}
