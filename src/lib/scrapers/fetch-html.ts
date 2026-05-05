// Polite HTML fetcher used by every live scraper.
//
//   - Realistic Firefox UA so the request doesn't look like a bot
//   - Randomized 1–3s delay before the actual fetch
//   - 15s timeout via AbortController
//   - `Accept-Language: pt-PT,pt;q=0.9,en;q=0.8` so PT sites serve PT pages
//   - Returns null on any failure (timeout, non-2xx, network) — never throws

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 3000;
const FETCH_TIMEOUT_MS = 15_000;

export type FetchHtmlOptions = {
  /** Skip the random delay (useful when batching with own pacing). */
  skipDelay?: boolean;
  /** Extra headers (e.g. Cookie) merged on top of defaults. */
  headers?: Record<string, string>;
};

export async function fetchHtml(
  url: string,
  opts: FetchHtmlOptions = {},
): Promise<string | null> {
  if (!opts.skipDelay) {
    const delay = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
    await new Promise((r) => setTimeout(r, delay));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...(opts.headers ?? {}) },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`[fetch-html] ${res.status} ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[fetch-html] ${msg} ${url}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
