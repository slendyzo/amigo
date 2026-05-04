// Vehicle image lookup via Wikipedia REST API.
//
// Hits Wikipedia search → page summary, returns the lead image URL for the
// matching article. Free, official, no scraping, model-level granularity
// (we drop year and trim before searching).
//
// V2 will add a NetCarShow scraper + R2 cache for cohesive press shots, but
// that requires Puppeteer + Chromium in the runtime image. Wikipedia is
// good enough for v1.

const WIKI_SEARCH = "https://en.wikipedia.org/w/api.php";
const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";

const USER_AGENT = "Amigo/0.4 (https://amigo.slendyzo.pt)";

export type VehicleImageInput = {
  brand: string;
  model: string;
  generation?: string | null;
};

export type VehicleImageResult = {
  url: string;
  source: "wikipedia";
  pageTitle: string;
} | null;

export async function lookupVehicleImage(input: VehicleImageInput): Promise<VehicleImageResult> {
  const query = [input.brand, input.model, input.generation].filter(Boolean).join(" ").trim();
  if (!query) return null;

  try {
    // 1. Find the most relevant Wikipedia page for the search.
    const searchUrl = new URL(WIKI_SEARCH);
    searchUrl.searchParams.set("action", "opensearch");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("limit", "5");
    searchUrl.searchParams.set("namespace", "0");
    searchUrl.searchParams.set("search", query);

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 * 60 * 24 }, // cache 24h
    });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as [string, string[], string[], string[]];
    const titles = searchData[1] ?? [];
    if (titles.length === 0) return null;

    // 2. Walk the candidates until we find one with a lead image.
    for (const title of titles) {
      const summaryUrl = WIKI_SUMMARY + encodeURIComponent(title);
      const summaryRes = await fetch(summaryUrl, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 60 * 60 * 24 * 7 }, // cache 7d
      });
      if (!summaryRes.ok) continue;
      const summary = (await summaryRes.json()) as {
        title?: string;
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
      };
      const url = summary.originalimage?.source ?? summary.thumbnail?.source;
      if (url) {
        return { url, source: "wikipedia", pageTitle: summary.title ?? title };
      }
    }
    return null;
  } catch (err) {
    console.error("[vehicle-image] Wikipedia lookup failed:", err);
    return null;
  }
}
