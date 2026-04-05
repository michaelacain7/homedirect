/**
 * MLS API integration via Realtor16 on RapidAPI
 * Fetches real MLS listings and transforms them into our MLSListing shape.
 * Results are cached in-memory for 15 minutes to avoid rate limits.
 * Falls back gracefully when RAPIDAPI_KEY is not set.
 */

import type { MLSListing, MLSSearchParams } from "@shared/mls-types";
export type { MLSListing, MLSSearchParams };

// ── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: MLSListing[]; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key: string): MLSListing[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
}

function setCached(key: string, data: MLSListing[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Data transformation ──────────────────────────────────────────────────────

function mapPropertyType(apiType: string | undefined): string {
  if (!apiType) return "single_family";
  const t = apiType.toLowerCase();
  if (t.includes("condo") || t.includes("apartment")) return "condo";
  if (t.includes("town") || t.includes("row")) return "townhouse";
  if (t.includes("multi") || t.includes("duplex") || t.includes("triplex") || t.includes("quadruplex")) return "multi_family";
  return "single_family";
}

function extractPhotos(property: any): string[] {
  try {
    const photos: string[] = [];

    // Try primary_photo
    if (property.primary_photo?.href) photos.push(property.primary_photo.href);

    // Try photos array
    if (Array.isArray(property.photos)) {
      for (const p of property.photos) {
        if (p?.href) photos.push(p.href);
        else if (typeof p === "string") photos.push(p);
      }
    }

    // Try photo array
    if (Array.isArray(property.photo)) {
      for (const p of property.photo) {
        if (p?.href) photos.push(p.href);
        else if (typeof p === "string") photos.push(p);
      }
    }

    // Deduplicate
    return [...new Set(photos)].slice(0, 20);
  } catch {
    return [];
  }
}

function transformListing(property: any): MLSListing | null {
  try {
    // Property can be nested differently depending on API version
    const loc = property.location?.address || property.address || {};
    const desc = property.description || {};

    const price = property.list_price || property.price || desc.list_price || 0;
    if (!price || price <= 0) return null;

    const address = loc.line || loc.street || property.address || "";
    const city = loc.city || property.city || "";
    const state = loc.state_code || loc.state || property.state || "";
    const zip = loc.postal_code || loc.zip || property.zip || "";

    if (!address || !city) return null;

    const beds = desc.beds || property.beds || property.bedrooms || 0;
    const baths = desc.baths_consolidated || desc.baths || property.baths || property.bathrooms || 0;
    const sqft = desc.sqft || property.sqft || property.living_area || 0;
    const lotSqft = desc.lot_sqft || property.lot_sqft || 0;
    const lotAcres = desc.lot_sqft
      ? (desc.lot_sqft / 43560).toFixed(2)
      : property.lot_sqft
        ? (property.lot_sqft / 43560).toFixed(2)
        : "";
    const yearBuilt = desc.year_built || property.year_built || 0;
    const rawType = desc.type || property.type || property.property_type || "";
    const propertyType = mapPropertyType(rawType);
    const dom = property.days_on_market ?? property.list_date_delta ?? 0;

    // IDs
    const propertyId = property.property_id || property.listing_id || property.id || "";
    const listingId = property.listing_id || propertyId;
    const mlsId = property.mls?.id || property.mls_id || listingId;

    const photos = extractPhotos(property);

    // Coordinates
    const coord = property.location?.address?.coordinate || property.location?.coordinate || {};
    const lat = coord.lat || property.lat || property.latitude || 0;
    const lng = coord.lon || coord.lng || property.lon || property.longitude || 0;

    // Description text
    const descText =
      property.description?.text ||
      property.remarks ||
      property.public_remarks ||
      `${beds} bed, ${baths} bath ${propertyType.replace("_", " ")} in ${city}, ${state}. Listed at $${price.toLocaleString()}.`;

    // Listing URL
    const permalink = property.permalink || property.href || property.url || "";
    const listingUrl = permalink.startsWith("http")
      ? permalink
      : permalink
        ? `https://www.realtor.com/realestateandhomes-detail/${permalink}`
        : `https://www.realtor.com/realestateandhomes-detail/${address.replace(/ /g, "-")}_${city.replace(/ /g, "-")}_${state}_${zip}`;

    const title = `${beds > 0 ? `${beds}BR ` : ""}${propertyType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} in ${city}`;

    return {
      id: `mls_${listingId || propertyId}`,
      source: "mls",
      title,
      address,
      city,
      state,
      zip,
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft: sqft || 0,
      lotSize: lotAcres,
      yearBuilt: yearBuilt || 0,
      propertyType,
      images: JSON.stringify(photos),
      description: descText,
      latitude: lat || 0,
      longitude: lng || 0,
      daysOnMarket: dom,
      listingUrl,
      mlsId: String(mlsId),
      // Compatibility fields
      status: "active",
      features: "[]",
      hoaFee: null,
      taxAmount: null,
      createdAt: new Date().toISOString(),
      sellerId: 0,
      mlsNumber: mlsId ? String(mlsId) : null,
    };
  } catch (err) {
    console.error("[MLS] Failed to transform listing:", err);
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function searchMLSListings(params: MLSSearchParams): Promise<MLSListing[]> {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    console.warn("[MLS] RAPIDAPI_KEY not set — MLS search disabled");
    return [];
  }

  // Build cache key
  const cacheKey = JSON.stringify(params);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log("[MLS] Cache hit for:", cacheKey.slice(0, 80));
    return cached;
  }

  // Build query params for Realtor16 /forsale endpoint
  const qs = new URLSearchParams();

  const location = params.location || "Tampa, FL";
  qs.set("location", location);
  qs.set("limit", String(Math.min(params.limit || 20, 42))); // API max ~42
  qs.set("offset", String(params.offset || 0));

  // Sort mapping
  const sortMap: Record<string, string> = {
    newest: "newest",
    oldest: "newest",      // API doesn't have oldest, use newest
    price_asc: "price_low",
    price_desc: "price_high",
    price_low: "price_low",
    price_high: "price_high",
    relevant: "relevant",
  };
  qs.set("sort", sortMap[params.sort || "newest"] || "newest");

  if (params.minPrice) qs.set("price_min", String(params.minPrice));
  if (params.maxPrice) qs.set("price_max", String(params.maxPrice));
  if (params.minBeds) qs.set("beds_min", String(params.minBeds));

  // Property type
  if (params.propertyType && params.propertyType !== "all") {
    const typeMap: Record<string, string> = {
      single_family: "single_family",
      condo: "condos",
      townhouse: "townhomes",
      multi_family: "multi_family",
    };
    const apiType = typeMap[params.propertyType];
    if (apiType) qs.set("type", apiType);
  }

  const url = `https://realtor16.p.rapidapi.com/search/forsale?${qs.toString()}`;
  console.log("[MLS] Fetching:", url);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "realtor16.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
    });

    if (!res.ok) {
      console.error(`[MLS] API error ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json() as any;

    // Realtor16 response shape: { data: { home_search: { results: [...] } } } or { results: [...] }
    let results: any[] = [];

    if (Array.isArray(data?.data?.home_search?.results)) {
      results = data.data.home_search.results;
    } else if (Array.isArray(data?.data?.results)) {
      results = data.data.results;
    } else if (Array.isArray(data?.results)) {
      results = data.results;
    } else if (Array.isArray(data?.properties)) {
      results = data.properties;
    } else if (Array.isArray(data)) {
      results = data;
    } else {
      // Try to find any array in the response
      for (const key of Object.keys(data || {})) {
        if (Array.isArray((data as any)[key])) {
          results = (data as any)[key];
          break;
        }
      }
    }

    console.log(`[MLS] Got ${results.length} raw results`);

    const listings = results
      .map(transformListing)
      .filter((l): l is MLSListing => l !== null);

    console.log(`[MLS] Transformed ${listings.length} valid listings`);

    setCached(cacheKey, listings);
    return listings;
  } catch (err) {
    console.error("[MLS] Fetch failed:", err);
    return [];
  }
}
