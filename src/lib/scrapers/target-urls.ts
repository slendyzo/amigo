// Search-URL builders per source.
//
// These are best-effort and may need updating when the sites restructure.
// Each builder returns the URL string. Slug normalization is liberal —
// lowercase + ASCII-fold + spaces-to-dashes — so "Mazda" → "mazda",
// "MX-5" → "mx-5", "Vila Verde" → "vila-verde".
//
// All builders bias toward Portugal-domain endpoints (.pt) and PT-language
// search filters where supported.

import type { PropertyScrapeQuery, VehicleScrapeQuery } from "./types";

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Generate variants of a vehicle model slug. Standvirtual + OLX canonicalize
// in different ways: "MX5" → "mx-5", "C-Class" → "c-class" or "cclass",
// "Series 3" → "series-3" or "3-series". Returning multiple variants lets
// the Web Archive lookup try each until one hits.
function modelSlugVariants(model: string): string[] {
  const base = slug(model);
  const variants = new Set<string>();
  variants.add(base);

  // Insert hyphen between letter-run and digit-run (mx5 → mx-5).
  variants.add(base.replace(/([a-z])(\d)/g, "$1-$2").replace(/(\d)([a-z])/g, "$1-$2"));
  // Strip all hyphens (m-class → mclass).
  variants.add(base.replace(/-/g, ""));
  // Strip "series-" prefix (3-series → 3, series-3 → 3) — too narrow, skip.

  return Array.from(variants).filter((v) => v.length > 0);
}

// ─── Vehicles ───────────────────────────────────────────────────────────────

export function standvirtualSearchUrl(q: VehicleScrapeQuery): string {
  const make = slug(q.make);
  const model = slug(q.model);
  const params = new URLSearchParams();
  // Year band ±1 — listings often span a model year transition.
  params.set("search[filter_float_first_registration_year:from]", String(q.year - 1));
  params.set("search[filter_float_first_registration_year:to]", String(q.year + 1));
  return `https://www.standvirtual.com/carros/${make}/${model}?${params.toString()}`;
}

/**
 * Archive-friendly URL variants for Standvirtual vehicle search.
 * Strips query params (CDX rarely indexes the full filter URL) and tries
 * multiple model slug variants to handle "MX5" / "MX-5" inconsistencies.
 */
export function standvirtualArchiveUrls(q: VehicleScrapeQuery): string[] {
  const make = slug(q.make);
  return modelSlugVariants(q.model).map(
    (m) => `https://www.standvirtual.com/carros/${make}/${m}`,
  );
}

export function olxCarsSearchUrl(q: VehicleScrapeQuery): string {
  const make = slug(q.make);
  const model = slug(q.model);
  const params = new URLSearchParams();
  params.set("search[filter_float_year:from]", String(q.year - 1));
  params.set("search[filter_float_year:to]", String(q.year + 1));
  return `https://www.olx.pt/carros-motos-e-barcos/carros/q-${make}-${model}/?${params.toString()}`;
}

export function olxArchiveUrls(q: VehicleScrapeQuery): string[] {
  const make = slug(q.make);
  return modelSlugVariants(q.model).map(
    (m) => `https://www.olx.pt/carros-motos-e-barcos/carros/q-${make}-${m}/`,
  );
}

// ─── Properties ─────────────────────────────────────────────────────────────

const IDEALISTA_PROPERTY_TYPE: Record<string, string> = {
  APARTMENT: "comprar-casas",
  HOUSE: "comprar-casas",
  LAND: "comprar-terrenos",
  COMMERCIAL: "comprar-imoveis-comerciais",
  OTHER: "comprar-casas",
};

export function idealistaSearchUrl(q: PropertyScrapeQuery): string {
  const concelho = slug(q.concelho);
  const root = IDEALISTA_PROPERTY_TYPE[q.propertyType] ?? "comprar-casas";
  // Idealista path filters: dimension (m²), tipologia (T0..T5).
  const segs: string[] = [`${root}`, concelho];
  const filters: string[] = [];
  if (q.livableAreaM2 && q.livableAreaM2 > 0) {
    const min = Math.max(20, Math.floor(q.livableAreaM2 * 0.8));
    const max = Math.ceil(q.livableAreaM2 * 1.2);
    filters.push(`com-tamanho_${min}-${max}`);
  }
  if (q.bedrooms != null && q.bedrooms >= 0 && q.bedrooms <= 5) {
    filters.push(`tipologias_T${q.bedrooms}`);
  }
  const filterPath = filters.length > 0 ? "/" + filters.join(",") + "/" : "/";
  return `https://www.idealista.pt/${segs.join("/")}${filterPath}`;
}

/**
 * Archive-friendly Idealista URL — drops the filter segments because CDX
 * rarely has snapshots at the filtered-path level. Listings on the broader
 * concelho page are noisier (any size, any tipologia) but at least exist.
 */
export function idealistaArchiveUrls(q: PropertyScrapeQuery): string[] {
  const concelho = slug(q.concelho);
  const root = IDEALISTA_PROPERTY_TYPE[q.propertyType] ?? "comprar-casas";
  return [`https://www.idealista.pt/${root}/${concelho}/`];
}

const IMOVIRTUAL_PROPERTY_TYPE: Record<string, string> = {
  APARTMENT: "comprar/apartamento",
  HOUSE: "comprar/moradia",
  LAND: "comprar/terreno",
  COMMERCIAL: "comprar/imovel-comercial",
  OTHER: "comprar/apartamento",
};

export function imovirtualSearchUrl(q: PropertyScrapeQuery): string {
  const concelho = slug(q.concelho);
  const root = IMOVIRTUAL_PROPERTY_TYPE[q.propertyType] ?? "comprar/apartamento";
  const params = new URLSearchParams();
  if (q.livableAreaM2 && q.livableAreaM2 > 0) {
    params.set("search[filter_float_m:from]", String(Math.floor(q.livableAreaM2 * 0.8)));
    params.set("search[filter_float_m:to]", String(Math.ceil(q.livableAreaM2 * 1.2)));
  }
  if (q.bedrooms != null && q.bedrooms >= 0) {
    params.set("search[filter_enum_rooms_num][0]", String(q.bedrooms));
  }
  const qs = params.toString();
  return `https://www.imovirtual.com/${root}/${concelho}/${qs ? `?${qs}` : ""}`;
}

export function imovirtualArchiveUrls(q: PropertyScrapeQuery): string[] {
  const concelho = slug(q.concelho);
  const root = IMOVIRTUAL_PROPERTY_TYPE[q.propertyType] ?? "comprar/apartamento";
  return [`https://www.imovirtual.com/${root}/${concelho}/`];
}
