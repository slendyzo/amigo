// OSM map composites for property thumbnails. We render a 2×2 tile grid at
// rooftop zoom (18) and return the sub-tile pin offset so the UI can drop a
// marker on the exact lat/lon — not just somewhere in a postal-code square.
//
// Why a 2×2 grid: at zoom 18 a single 256px tile spans only ~38m, and the
// lat/lon can land anywhere inside it. By picking a 2×2 grid where the point
// always lands in the inner half (pin position ∈ [0.25, 0.75] in both axes),
// the pin stays visible no matter where it falls within its containing tile.
//
// Free, no API key. OSM tile usage policy is fine for low-volume embeds —
// callers should still set loading="lazy" on the rendered tiles.

const TILE_SERVER = "https://tile.openstreetmap.org";
const DEFAULT_ZOOM = 18;
const GRID_TILES = 2;

export type StaticMapInput = {
  lat: number;
  lon: number;
  zoom?: number;
};

export type StaticMapTile = {
  url: string;
  // Position of this tile within the grid as a fraction [0, 1).
  // Grid is GRID_TILES × GRID_TILES, so increments are 1/GRID_TILES.
  xFrac: number;
  yFrac: number;
};

export type StaticMap = {
  tiles: StaticMapTile[];
  // Pin position as a fraction [0, 1] of the full grid.
  // Always falls in [0.25, 0.75] by construction.
  pinPctX: number;
  pinPctY: number;
  zoom: number;
};

export function buildStaticMap({ lat, lon, zoom = DEFAULT_ZOOM }: StaticMapInput): StaticMap {
  const { x: fx, y: fy } = lonLatToFractionalTile(lon, lat, zoom);

  // Pick a top-left tile such that the lat/lon lands in the inner half of the
  // 2×2 grid. round(fx) - 1 puts pin's tile-fraction in [0.5, 1.5),
  // i.e. grid-fraction in [0.25, 0.75).
  const startX = Math.round(fx) - 1;
  const startY = Math.round(fy) - 1;

  const pinPctX = (fx - startX) / GRID_TILES;
  const pinPctY = (fy - startY) / GRID_TILES;

  const tiles: StaticMapTile[] = [];
  for (let dy = 0; dy < GRID_TILES; dy++) {
    for (let dx = 0; dx < GRID_TILES; dx++) {
      tiles.push({
        url: `${TILE_SERVER}/${zoom}/${startX + dx}/${startY + dy}.png`,
        xFrac: dx / GRID_TILES,
        yFrac: dy / GRID_TILES,
      });
    }
  }

  return { tiles, pinPctX, pinPctY, zoom };
}

// Standard slippy-map tile coordinate conversion (fractional).
// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
function lonLatToFractionalTile(lon: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}
