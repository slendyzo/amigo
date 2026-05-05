// Build an OSM static-map URL from cached lat/lon. Free, no API key.
// Renderer: staticmap.openstreetmap.de (community-run mapnik tiles).
// Used for the property thumbnail (postal-code-zoom, no marker per design).

const STATIC_MAP_BASE = "https://staticmap.openstreetmap.de/staticmap.php";

export type StaticMapInput = {
  lat: number;
  lon: number;
  zoom?: number; // 13 ~ postal-code level for PT
  width?: number;
  height?: number;
};

export function buildStaticMapUrl({
  lat,
  lon,
  zoom = 13,
  width = 600,
  height = 338, // 16:9 to match aspect-[16/9] property image slots
}: StaticMapInput): string {
  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    maptype: "mapnik",
  });
  return `${STATIC_MAP_BASE}?${params.toString()}`;
}
