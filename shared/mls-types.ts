/**
 * Shared MLS types used by both client and server.
 * The server mls-api.ts re-exports MLSListing from here.
 */

export interface MLSListing {
  id: string;           // prefixed with "mls_" to distinguish from local listings
  source: "mls";
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize: string;
  yearBuilt: number;
  propertyType: string;
  images: string;       // JSON array of photo URLs
  description: string;
  latitude: number;
  longitude: number;
  daysOnMarket: number;
  listingUrl: string;   // link to realtor.com
  mlsId: string;
  // Extra fields to make it compatible with display components
  status: "active";
  features: string;     // JSON array (empty for MLS)
  hoaFee: number | null;
  taxAmount: number | null;
  createdAt: string;
  sellerId: number;
  mlsNumber: string | null;
}

export interface MLSSearchParams {
  location?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  sort?: string;
  limit?: number;
  offset?: number;
  propertyType?: string;
}

export interface MLSSearchResponse {
  listings: MLSListing[];
  total: number;
  source: "mls";
}
