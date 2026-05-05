// Build an OSM map thumbnail URL from cached lat/lon.
//
// We hit the standard OSM tile server (tile.openstreetmap.org) directly with
// the slippy-map tile coords containing the lat/lon. Returns a single 256x256
// PNG which the UI crops to 16:9 via object-fit. Free, no API key, no signup.
//
// (We had originally targeted staticmap.openstreetmap.de but that service was
// retired — domain no longer resolves. The raw tile server is a reliable
// fallback for thumbnail-scale embeds.)
//
// OSM tile usage policy: fine for low-volume embedded thumbnails. We add the
// `loading="lazy"` attribute at the call site so cards off-screen don't fetch.

const TILE_SERVER = "https://tile.openstreetmap.org";

export type StaticMapInput = {
  lat: number;
  lon: number;
  zoom?: number; // 13 = postal-code level for PT
};

export function buildStaticMapUrl({ lat, lon, zoom = 13 }: StaticMapInput): string {
  const { x, y } = lonLatToTile(lon, lat, zoom);
  return `${TILE_SERVER}/${zoom}/${x}/${y}.png`;
}

// Standard slippy-map tile coordinate conversion.
// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}
