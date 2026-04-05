import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import {
  Search, SlidersHorizontal, X, Bed, Bath, Maximize, MapPin, List, Map as MapIcon, ExternalLink
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Listing } from "@shared/schema";
import type { MLSListing } from "@shared/mls-types";

function formatPrice(price: number) {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(1)}M`;
  if (price >= 1000) return `$${Math.round(price / 1000)}K`;
  return `$${price}`;
}

function formatPriceFull(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

// ── Map marker icons ─────────────────────────────────────────────────────────

// Green markers for HomeDirectAI listings
function createPriceIcon(price: number, isActive: boolean) {
  const label = formatPrice(price);
  return L.divIcon({
    className: "custom-price-marker",
    html: `<div style="
      background: ${isActive ? "hsl(160, 60%, 28%)" : "white"};
      color: ${isActive ? "white" : "hsl(160, 60%, 28%)"};
      border: 2px solid ${isActive ? "hsl(160, 60%, 22%)" : "hsl(160, 60%, 28%)"};
      border-radius: 8px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      cursor: pointer;
      font-family: system-ui, sans-serif;
      line-height: 1;
      display: inline-block;
    ">${label}</div>`,
    iconSize: [70, 24],
    iconAnchor: [35, 12],
  });
}

// Blue markers for MLS listings
function createMLSPriceIcon(price: number, isActive: boolean) {
  const label = formatPrice(price);
  return L.divIcon({
    className: "custom-price-marker mls-marker",
    html: `<div style="
      background: ${isActive ? "#1d4ed8" : "white"};
      color: ${isActive ? "white" : "#1d4ed8"};
      border: 2px solid ${isActive ? "#1e3a8a" : "#1d4ed8"};
      border-radius: 8px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      cursor: pointer;
      font-family: system-ui, sans-serif;
      line-height: 1;
      display: inline-block;
    ">${label}</div>`,
    iconSize: [70, 24],
    iconAnchor: [35, 12],
  });
}

// ── Map event handlers ───────────────────────────────────────────────────────

function MapEventHandler({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => { onBoundsChange(map.getBounds()); },
    zoomend: () => { onBoundsChange(map.getBounds()); },
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, []);

  return null;
}

function FlyToLocation({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom || map.getZoom(), { duration: 0.8 });
  }, [center, zoom]);
  return null;
}

// ── Combined listing type for the sidebar ────────────────────────────────────

type CombinedListing =
  | { type: "local"; data: Listing }
  | { type: "mls"; data: MLSListing };

// ── Main Component ───────────────────────────────────────────────────────────

export default function MapSearch() {
  const [, setLocation] = useLocation();
  const [listings, setListings] = useState<Listing[]>([]);
  const [mlsListings, setMlsListings] = useState<MLSListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [mlsLoading, setMlsLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showList, setShowList] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showMLS, setShowMLS] = useState(true);

  const [filters, setFilters] = useState({
    minPrice: "", maxPrice: "", minBeds: "", maxBeds: "", propertyType: "all",
  });

  const listRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const mlsLocationRef = useRef<string>("Tampa, FL");

  // Tampa Bay center
  const defaultCenter: [number, number] = [27.85, -82.52];
  const defaultZoom = 11;

  // ── Fetch local listings ─────────────────────────────────────────────────

  const fetchListings = useCallback(async (bounds: L.LatLngBounds) => {
    boundsRef.current = bounds;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        north: bounds.getNorth().toString(),
        south: bounds.getSouth().toString(),
        east: bounds.getEast().toString(),
        west: bounds.getWest().toString(),
      });
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
      if (filters.minBeds) params.set("minBeds", filters.minBeds);
      if (filters.maxBeds) params.set("maxBeds", filters.maxBeds);
      if (filters.propertyType && filters.propertyType !== "all") params.set("propertyType", filters.propertyType);

      const res = await apiRequest("GET", `/api/listings/bounds?${params}`);
      const data = await res.json();
      setListings(data);
    } catch (e) {
      console.error("Failed to fetch map listings:", e);
    }
    setLoading(false);
  }, [filters]);

  // ── Fetch MLS listings ───────────────────────────────────────────────────

  const fetchMLSListings = useCallback(async (location: string) => {
    if (!showMLS) return;
    setMlsLoading(true);
    try {
      const params = new URLSearchParams({ location, limit: "20" });
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
      if (filters.minBeds) params.set("minBeds", filters.minBeds);
      if (filters.propertyType && filters.propertyType !== "all") params.set("propertyType", filters.propertyType);

      const res = await apiRequest("GET", `/api/mls/search?${params}`);
      const data = await res.json();
      setMlsListings(data.listings ?? []);
    } catch (e) {
      console.error("Failed to fetch MLS listings:", e);
      setMlsListings([]);
    }
    setMlsLoading(false);
  }, [filters, showMLS]);

  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    fetchListings(bounds);
  }, [fetchListings]);

  // Re-fetch when filters change
  useEffect(() => {
    if (boundsRef.current) fetchListings(boundsRef.current);
  }, [filters]);

  // Re-fetch MLS when showMLS or filters change
  useEffect(() => {
    fetchMLSListings(mlsLocationRef.current);
  }, [showMLS, filters]);

  // ── Search handler ───────────────────────────────────────────────────────

  const handleSearch = () => {
    const term = searchInput.toLowerCase().trim();
    const cities: Record<string, [number, number]> = {
      "tampa": [27.9506, -82.4572],
      "st. petersburg": [27.7676, -82.6403],
      "st petersburg": [27.7676, -82.6403],
      "clearwater": [27.9659, -82.8001],
      "brandon": [27.9378, -82.2859],
      "riverview": [27.8758, -82.3265],
      "gulfport": [27.7481, -82.7262],
      "seminole": [27.8398, -82.7901],
      "largo": [27.9095, -82.7873],
      "dunedin": [28.0197, -82.7718],
      "palm harbor": [28.0786, -82.7637],
      "safety harbor": [28.0027, -82.6929],
    };
    for (const [city, coords] of Object.entries(cities)) {
      if (term.includes(city)) {
        setFlyTo(coords);
        mlsLocationRef.current = searchInput;
        fetchMLSListings(searchInput);
        setTimeout(() => setFlyTo(null), 1000);
        return;
      }
    }
    if (term) {
      setFlyTo(defaultCenter);
      mlsLocationRef.current = searchInput;
      fetchMLSListings(searchInput);
    }
  };

  const scrollToListing = (id: string) => {
    const el = document.getElementById(`map-listing-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // ── Combined sidebar listing list ────────────────────────────────────────

  const combined: CombinedListing[] = [
    ...listings.map((l): CombinedListing => ({ type: "local", data: l })),
    ...(showMLS ? mlsListings.map((l): CombinedListing => ({ type: "mls", data: l })) : []),
  ];

  const totalCount = listings.length + (showMLS ? mlsListings.length : 0);
  const isAnyLoading = loading || (showMLS && mlsLoading);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }} data-testid="page-map-search">
      {/* Top filter bar */}
      <div className="flex items-center gap-2 border-b bg-background px-3 py-2" data-testid="map-filter-bar">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search city or area..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            data-testid="input-map-search"
          />
        </div>

        <Button
          variant={showFilters ? "secondary" : "outline"} size="sm" className="h-8 text-xs"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <SlidersHorizontal className="mr-1 h-3 w-3" /> Filters
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          <Select value={filters.propertyType} onValueChange={(v) => setFilters(f => ({ ...f, propertyType: v }))}>
            <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-property-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="single_family">House</SelectItem>
              <SelectItem value="condo">Condo</SelectItem>
              <SelectItem value="townhouse">Townhouse</SelectItem>
              <SelectItem value="multi_family">Multi-Family</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.minBeds || "any"}
            onValueChange={(v) => setFilters(f => ({ ...f, minBeds: v === "any" ? "" : v }))}
          >
            <SelectTrigger className="h-8 w-[100px] text-xs" data-testid="select-beds">
              <SelectValue placeholder="Beds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any Beds</SelectItem>
              <SelectItem value="1">1+ Bed</SelectItem>
              <SelectItem value="2">2+ Beds</SelectItem>
              <SelectItem value="3">3+ Beds</SelectItem>
              <SelectItem value="4">4+ Beds</SelectItem>
              <SelectItem value="5">5+ Beds</SelectItem>
            </SelectContent>
          </Select>

          {/* MLS toggle */}
          <Button
            variant={showMLS ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs ${showMLS ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
            onClick={() => setShowMLS(!showMLS)}
            data-testid="button-toggle-mls"
            title={showMLS ? "Hide MLS listings" : "Show MLS listings"}
          >
            {showMLS ? "MLS On" : "MLS Off"}
          </Button>
        </div>

        <Badge variant="outline" className="ml-auto text-xs">
          {isAnyLoading ? "Loading..." : `${totalCount} homes`}
        </Badge>

        {/* Mobile list/map toggle */}
        <Button
          variant="outline" size="sm" className="h-8 text-xs md:hidden"
          onClick={() => setShowList(!showList)}
          data-testid="button-toggle-view"
        >
          {showList ? <><MapIcon className="mr-1 h-3 w-3" /> Map</> : <><List className="mr-1 h-3 w-3" /> List</>}
        </Button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2" data-testid="map-expanded-filters">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Price:</span>
            <Input className="h-7 w-24 text-xs" type="number" placeholder="Min"
              value={filters.minPrice} onChange={(e) => setFilters(f => ({ ...f, minPrice: e.target.value }))}
            />
            <span className="text-xs text-muted-foreground">-</span>
            <Input className="h-7 w-24 text-xs" type="number" placeholder="Max"
              value={filters.maxPrice} onChange={(e) => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
            />
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => setFilters({ minPrice: "", maxPrice: "", minBeds: "", maxBeds: "", propertyType: "all" })}
          >
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
          {/* Legend */}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border-2 border-[hsl(160,60%,28%)] bg-white" />
              Our Listings (1%)
            </span>
            {showMLS && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border-2 border-blue-600 bg-white" />
                MLS Listings
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main content: Map + Listing sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Listing sidebar */}
        <div
          ref={listRef}
          className={`w-full overflow-y-auto border-r md:w-[380px] lg:w-[420px] ${showList ? "block" : "hidden md:block"}`}
          data-testid="map-listing-sidebar"
        >
          {combined.length === 0 && !isAnyLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MapPin className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No homes in this area</p>
              <p className="mt-1 text-xs text-muted-foreground">Try zooming out or moving the map</p>
            </div>
          )}

          {combined.map((item) => {
            if (item.type === "local") {
              const listing = item.data;
              const images: string[] = JSON.parse(listing.images || "[]");
              const itemId = `local_${listing.id}`;
              const isHovered = hoveredId === itemId;
              return (
                <div
                  key={itemId}
                  id={`map-listing-${itemId}`}
                  className={`cursor-pointer border-b p-3 transition-colors hover:bg-muted/50 ${isHovered || selectedId === itemId ? "bg-muted/50 ring-1 ring-inset ring-primary/20" : ""}`}
                  onMouseEnter={() => setHoveredId(itemId)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setLocation(`/listing/${listing.id}`)}
                  data-testid={`map-listing-card-${listing.id}`}
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-md">
                      <img
                        src={images[0] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400"}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-primary" data-testid={`text-price-${listing.id}`}>
                        {formatPriceFull(listing.price)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Bed className="h-3 w-3" /> {listing.bedrooms}</span>
                        <span className="flex items-center gap-0.5"><Bath className="h-3 w-3" /> {listing.bathrooms}</span>
                        <span className="flex items-center gap-0.5"><Maximize className="h-3 w-3" /> {listing.sqft.toLocaleString()}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {listing.address}, {listing.city}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {listing.propertyType.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            } else {
              // MLS listing
              const listing = item.data;
              const images: string[] = JSON.parse(listing.images || "[]");
              const itemId = listing.id;
              const isHovered = hoveredId === itemId;
              return (
                <div
                  key={itemId}
                  id={`map-listing-${itemId}`}
                  className={`cursor-pointer border-b p-3 transition-colors hover:bg-blue-50/50 ${isHovered || selectedId === itemId ? "bg-blue-50/50 ring-1 ring-inset ring-blue-200" : ""}`}
                  onMouseEnter={() => setHoveredId(itemId)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => window.open(listing.listingUrl, "_blank")}
                  data-testid={`map-listing-card-${listing.id}`}
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-md">
                      <img
                        src={images[0] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400"}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-blue-700">
                        {formatPriceFull(listing.price)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Bed className="h-3 w-3" /> {listing.bedrooms}</span>
                        <span className="flex items-center gap-0.5"><Bath className="h-3 w-3" /> {listing.bathrooms}</span>
                        {listing.sqft > 0 && <span className="flex items-center gap-0.5"><Maximize className="h-3 w-3" /> {listing.sqft.toLocaleString()}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {listing.address}, {listing.city}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge className="bg-blue-600 text-white text-[10px]">(MLS)</Badge>
                        <a
                          href={listing.listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> Realtor.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </div>

        {/* Map */}
        <div className={`flex-1 min-h-0 ${showList ? "hidden md:block" : "block"}`} data-testid="map-container">
          <MapContainer
            center={defaultCenter}
            zoom={defaultZoom}
            className="h-full w-full"
            style={{ height: "100%", width: "100%", minHeight: "300px" }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEventHandler onBoundsChange={handleBoundsChange} />
            {flyTo && <FlyToLocation center={flyTo} zoom={13} />}

            {/* Local listings — green markers */}
            {listings.map((listing) => {
              if (!listing.latitude || !listing.longitude) return null;
              const itemId = `local_${listing.id}`;
              const isActive = hoveredId === itemId || selectedId === itemId;
              return (
                <Marker
                  key={itemId}
                  position={[listing.latitude, listing.longitude]}
                  icon={createPriceIcon(listing.price, isActive)}
                  eventHandlers={{
                    click: () => {
                      setSelectedId(itemId);
                      scrollToListing(itemId);
                    },
                    mouseover: () => setHoveredId(itemId),
                    mouseout: () => setHoveredId(null),
                  }}
                >
                  <Popup>
                    <div
                      className="cursor-pointer"
                      onClick={() => setLocation(`/listing/${listing.id}`)}
                      style={{ minWidth: 200 }}
                    >
                      <img
                        src={JSON.parse(listing.images || "[]")[0] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400"}
                        alt={listing.title}
                        style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4, marginBottom: 6 }}
                        crossOrigin="anonymous"
                      />
                      <div style={{ fontWeight: 700, fontSize: 15, color: "hsl(160, 60%, 28%)" }}>
                        {formatPriceFull(listing.price)}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        {listing.bedrooms} bd | {listing.bathrooms} ba | {listing.sqft.toLocaleString()} sqft
                      </div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                        {listing.address}, {listing.city}
                      </div>
                      <div style={{ fontSize: 10, color: "hsl(160, 60%, 28%)", marginTop: 4, fontWeight: 600 }}>
                        HomeDirectAI — 1% fee
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* MLS listings — blue markers */}
            {showMLS && mlsListings.map((listing) => {
              if (!listing.latitude || !listing.longitude) return null;
              const itemId = listing.id;
              const isActive = hoveredId === itemId || selectedId === itemId;
              return (
                <Marker
                  key={itemId}
                  position={[listing.latitude, listing.longitude]}
                  icon={createMLSPriceIcon(listing.price, isActive)}
                  eventHandlers={{
                    click: () => {
                      setSelectedId(itemId);
                      scrollToListing(itemId);
                    },
                    mouseover: () => setHoveredId(itemId),
                    mouseout: () => setHoveredId(null),
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 200 }}>
                      <img
                        src={JSON.parse(listing.images || "[]")[0] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400"}
                        alt={listing.title}
                        style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4, marginBottom: 6 }}
                        crossOrigin="anonymous"
                      />
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#1d4ed8" }}>
                        {formatPriceFull(listing.price)}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        {listing.bedrooms} bd | {listing.bathrooms} ba
                        {listing.sqft > 0 ? ` | ${listing.sqft.toLocaleString()} sqft` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                        {listing.address}, {listing.city}
                      </div>
                      <a
                        href={listing.listingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: "#1d4ed8" }}
                      >
                        View on Realtor.com ↗
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
