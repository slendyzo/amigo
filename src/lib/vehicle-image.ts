// Vehicle/bike image lookup.
//
// Cars & motorcycles: Wikipedia REST API — model articles reliably carry a
// clean lead image. Free, official, no key.
//
// Bicycles: Wikipedia has no per-model articles ("Canyon Endurace CF 6" isn't
// a page), so we fall back to a keyless DuckDuckGo image search driven by the
// AI's `imageHint` (e.g. "Canyon Endurace 2024 road bike side profile"). It's
// best-effort — if DDG rate-limits the server IP it returns null and the UI
// shows the placeholder (no worse than before). A keyed provider (Bing/SerpAPI)
// can drop in later for max reliability.
//
// Order: bikes try DDG(imageHint) first then Wikipedia; cars/motos try
// Wikipedia first then DDG — so the proven car path is never regressed.

const WIKI_SEARCH = "https://en.wikipedia.org/w/api.php";
const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";

const USER_AGENT = "Amigo/0.4 (https://amigo.slendyzo.pt)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0";

export type VehicleImageInput = {
  brand: string;
  model: string;
  generation?: string | null;
  imageHint?: string | null;
  vehicleClass?: "CAR" | "MOTORCYCLE" | "BICYCLE";
};

export type VehicleImageResult = {
  url: string;
  source: "wikipedia" | "ddg" | "serpapi";
  pageTitle: string;
} | null;

export async function lookupVehicleImage(input: VehicleImageInput): Promise<VehicleImageResult> {
  const isBike = input.vehicleClass === "BICYCLE";
  const ddgQuery =
    input.imageHint?.trim() ||
    [input.brand, input.model, isBike ? "bicycle side profile" : input.generation]
      .filter(Boolean)
      .join(" ")
      .trim();

  const tryWiki = () => wikipediaImage([input.brand, input.model, input.generation].filter(Boolean).join(" ").trim());
  const trySerp = () => serpApiImage(ddgQuery);
  const tryDdg = () => ddgImage(ddgQuery);

  // Bikes: a real image search first (Wikipedia has no model article), then
  // Wikipedia as a last resort. Cars/motos: Wikipedia first (proven), search
  // as fallback. The image search prefers SerpAPI (keyed, reliable) and only
  // falls back to keyless DDG, which DuckDuckGo often blocks from server IPs.
  const order = isBike ? [trySerp, tryDdg, tryWiki] : [tryWiki, trySerp, tryDdg];
  for (const attempt of order) {
    try {
      const hit = await attempt();
      if (hit) return hit;
    } catch {
      // fall through to the next source
    }
  }
  return null;
}

async function wikipediaImage(query: string): Promise<VehicleImageResult> {
  if (!query) return null;
  const searchUrl = new URL(WIKI_SEARCH);
  searchUrl.searchParams.set("action", "opensearch");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("limit", "5");
  searchUrl.searchParams.set("namespace", "0");
  searchUrl.searchParams.set("search", query);

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!searchRes.ok) return null;
  const searchData = (await searchRes.json()) as [string, string[], string[], string[]];
  const titles = searchData[1] ?? [];

  for (const title of titles) {
    const summaryRes = await fetch(WIKI_SUMMARY + encodeURIComponent(title), {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!summaryRes.ok) continue;
    const summary = (await summaryRes.json()) as {
      title?: string;
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    };
    const url = summary.originalimage?.source ?? summary.thumbnail?.source;
    if (url) return { url, source: "wikipedia", pageTitle: summary.title ?? title };
  }
  return null;
}

// SerpAPI Google Images — reliable clean press shots, but needs a key
// (SERPAPI_KEY env). Free tier = 100 searches/month. No-op without the key.
async function serpApiImage(query: string): Promise<VehicleImageResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey || !query) return null;
  const url =
    `https://serpapi.com/search.json?engine=google_images&google_domain=google.com&ijn=0` +
    `&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    images_results?: Array<{ original?: string; thumbnail?: string; title?: string }>;
  };
  const first = (data.images_results ?? []).find(
    (r) => typeof r.original === "string" && /^https?:\/\//.test(r.original),
  );
  const url2 = first?.original ?? first?.thumbnail;
  if (!url2) return null;
  return { url: url2, source: "serpapi", pageTitle: first?.title ?? query };
}

// Keyless DuckDuckGo image search. Two-step: fetch a vqd token, then hit i.js.
// Best-effort — returns null on any hiccup (token miss, rate limit, parse).
async function ddgImage(query: string): Promise<VehicleImageResult> {
  if (!query) return null;

  const tokenRes = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en;q=0.9" } },
  );
  if (!tokenRes.ok) return null;
  const html = await tokenRes.text();
  const vqdMatch = html.match(/vqd=["']?([0-9-]+)["']?/);
  if (!vqdMatch) return null;
  const vqd = vqdMatch[1];

  const apiRes = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1`,
    {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://duckduckgo.com/",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    },
  );
  if (!apiRes.ok) return null;
  const data = (await apiRes.json()) as { results?: Array<{ image?: string; title?: string }> };
  const first = (data.results ?? []).find(
    (r) => typeof r.image === "string" && /^https?:\/\//.test(r.image),
  );
  if (!first?.image) return null;
  return { url: first.image, source: "ddg", pageTitle: first.title ?? query };
}
