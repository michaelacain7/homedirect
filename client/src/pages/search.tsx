import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListingCard } from "@/components/listing-card";
import { Search as SearchIcon, SlidersHorizontal, X, ChevronLeft, ChevronRight, ExternalLink, Building2 } from "lucide-react";
import type { Listing } from "@shared/schema";
import type { MLSListing } from "@shared/mls-types";

interface ListingsResponse {
  listings: Listing[];
  total: number;
}

interface MLSResponse {
  listings: MLSListing[];
  total: number;
  source: "mls";
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

// Compact MLS listing card that mimics local ListingCard layout
function MLSListingCard({ listing }: { listing: MLSListing }) {
  const images: string[] = JSON.parse(listing.images || "[]");

  return (
    <Card className="group overflow-hidden" data-testid={`card-mls-${listing.id}`}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={images[0] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800"}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            crossOrigin="anonymous"
            loading="lazy"
          />
        </a>
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge className="bg-blue-600 text-white text-[10px] font-semibold" data-testid={`badge-mls-${listing.id}`}>
            MLS
          </Badge>
          <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs">
            {listing.propertyType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </Badge>
        </div>
        {listing.daysOnMarket > 0 && (
          <div className="absolute right-3 top-3">
            <Badge variant="outline" className="bg-background/80 text-[10px]">
              {listing.daysOnMarket}d on market
            </Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">{formatPrice(listing.price)}</span>
        </div>
        <h3 className="mb-1 text-sm font-medium leading-snug">{listing.title}</h3>
        <p className="mb-2 text-xs text-muted-foreground truncate">
          {listing.address}, {listing.city}, {listing.state}
        </p>
        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{listing.bedrooms} bd</span>
          <span>{listing.bathrooms} ba</span>
          {listing.sqft > 0 && <span>{listing.sqft.toLocaleString()} sqft</span>}
        </div>
        <a
          href={listing.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          data-testid={`link-realtor-${listing.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          View on Realtor.com
        </a>
      </div>
    </Card>
  );
}

type Tab = "local" | "mls";

export default function SearchPage() {
  const queryString = useSearch();
  const params = new URLSearchParams(queryString);
  const initialQ = params.get("q") || "";

  const [activeTab, setActiveTab] = useState<Tab>("local");
  const [search, setSearch] = useState(initialQ);
  const [mlsLocation, setMlsLocation] = useState(initialQ || "Tampa, FL");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const [filters, setFilters] = useState({
    minPrice: "", maxPrice: "", minBeds: "", maxBeds: "",
    minBaths: "", maxBaths: "", minSqft: "", maxSqft: "",
    propertyType: "all",
  });

  // ── Local listings query ────────────────────────────────────────────────────
  const buildLocalQuery = () => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (filters.minPrice) p.set("minPrice", filters.minPrice);
    if (filters.maxPrice) p.set("maxPrice", filters.maxPrice);
    if (filters.minBeds) p.set("minBeds", filters.minBeds);
    if (filters.maxBeds) p.set("maxBeds", filters.maxBeds);
    if (filters.minBaths) p.set("minBaths", filters.minBaths);
    if (filters.maxBaths) p.set("maxBaths", filters.maxBaths);
    if (filters.minSqft) p.set("minSqft", filters.minSqft);
    if (filters.maxSqft) p.set("maxSqft", filters.maxSqft);
    if (filters.propertyType && filters.propertyType !== "all") p.set("propertyType", filters.propertyType);
    p.set("sort", sort);
    p.set("page", page.toString());
    p.set("limit", LIMIT.toString());
    return p.toString();
  };

  const { data: localData, isLoading: localLoading } = useQuery<ListingsResponse>({
    queryKey: ["/api/listings", search, filters, sort, page],
    queryFn: async () => {
      const q = buildLocalQuery();
      const res = await apiRequest("GET", `/api/listings?${q}`);
      return res.json();
    },
    enabled: activeTab === "local",
  });

  // ── MLS listings query ──────────────────────────────────────────────────────
  const buildMLSQuery = () => {
    const p = new URLSearchParams();
    p.set("location", mlsLocation || "Tampa, FL");
    if (filters.minPrice) p.set("minPrice", filters.minPrice);
    if (filters.maxPrice) p.set("maxPrice", filters.maxPrice);
    if (filters.minBeds) p.set("minBeds", filters.minBeds);
    if (filters.propertyType && filters.propertyType !== "all") p.set("propertyType", filters.propertyType);
    p.set("sort", sort === "oldest" ? "newest" : sort);
    p.set("limit", LIMIT.toString());
    p.set("offset", ((page - 1) * LIMIT).toString());
    return p.toString();
  };

  const { data: mlsData, isLoading: mlsLoading } = useQuery<MLSResponse>({
    queryKey: ["/api/mls/search", mlsLocation, filters, sort, page],
    queryFn: async () => {
      const q = buildMLSQuery();
      const res = await apiRequest("GET", `/api/mls/search?${q}`);
      return res.json();
    },
    enabled: activeTab === "mls",
  });

  // ── Derived state ───────────────────────────────────────────────────────────
  const isLoading = activeTab === "local" ? localLoading : mlsLoading;
  const listings = activeTab === "local" ? (localData?.listings ?? []) : [];
  const mlsListings = activeTab === "mls" ? (mlsData?.listings ?? []) : [];
  const total = activeTab === "local" ? (localData?.total ?? 0) : (mlsData?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const clearFilters = () => {
    setFilters({ minPrice: "", maxPrice: "", minBeds: "", maxBeds: "", minBaths: "", maxBaths: "", minSqft: "", maxSqft: "", propertyType: "all" });
    setSearch("");
    setMlsLocation("Tampa, FL");
    setPage(1);
  };

  const handleSortChange = (val: string) => {
    setSort(val);
    setPage(1);
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v && v !== "all") || search;

  return (
    <div className="min-h-screen" data-testid="page-search">
      {/* Tab Toggle */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-0 px-4 pt-3">
          <button
            className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "local"
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchTab("local")}
            data-testid="tab-local"
          >
            Our Listings
          </button>
          <button
            className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "mls"
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchTab("mls")}
            data-testid="tab-mls"
          >
            <Building2 className="h-3.5 w-3.5" />
            MLS Listings (All)
          </button>
        </div>
      </div>

      {/* Search Header */}
      <div className="border-b bg-background py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4">
          {activeTab === "local" ? (
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by city, address, or ZIP..."
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-search"
              />
            </div>
          ) : (
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Enter city, state or ZIP (e.g. Tampa, FL)"
                className="pl-9"
                value={mlsLocation}
                onChange={(e) => { setMlsLocation(e.target.value); setPage(1); }}
                onKeyDown={(e) => e.key === "Enter" && setPage(1)}
                data-testid="input-mls-location"
              />
            </div>
          )}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filters
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        {/* MLS info bar */}
        {activeTab === "mls" && (
          <div className="mx-auto mt-2 max-w-7xl px-4">
            <p className="text-xs text-muted-foreground">
              MLS listings are sourced from the broader market. These properties may have traditional agents —
              HomeDirectAI can still help you with AI negotiation tools.
            </p>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-b bg-muted/30 py-4" data-testid="panel-filters">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Min Price</Label>
                <Input type="number" placeholder="$0" value={filters.minPrice} onChange={e => { setFilters(f => ({ ...f, minPrice: e.target.value })); setPage(1); }} data-testid="input-min-price" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Price</Label>
                <Input type="number" placeholder="Any" value={filters.maxPrice} onChange={e => { setFilters(f => ({ ...f, maxPrice: e.target.value })); setPage(1); }} data-testid="input-max-price" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min Beds</Label>
                <Select value={filters.minBeds || "any"} onValueChange={v => { setFilters(f => ({ ...f, minBeds: v === "any" ? "" : v })); setPage(1); }}>
                  <SelectTrigger data-testid="select-min-beds"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3+</SelectItem>
                    <SelectItem value="4">4+</SelectItem>
                    <SelectItem value="5">5+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeTab === "local" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Min Baths</Label>
                  <Select value={filters.minBaths || "any"} onValueChange={v => { setFilters(f => ({ ...f, minBaths: v === "any" ? "" : v })); setPage(1); }}>
                    <SelectTrigger data-testid="select-min-baths"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="1">1+</SelectItem>
                      <SelectItem value="2">2+</SelectItem>
                      <SelectItem value="3">3+</SelectItem>
                      <SelectItem value="4">4+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Property Type</Label>
                <Select value={filters.propertyType} onValueChange={v => { setFilters(f => ({ ...f, propertyType: v })); setPage(1); }}>
                  <SelectTrigger data-testid="select-property-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="single_family">Single Family</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="multi_family">Multi Family</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground" data-testid="text-results-count">
            {isLoading
              ? "Searching..."
              : activeTab === "mls"
                ? `${mlsListings.length} MLS listings found`
                : `${total} ${total === 1 ? "home" : "homes"} found`}
          </p>
          {/* Sort */}
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Sort by</Label>
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                {activeTab === "local" && <SelectItem value="oldest">Oldest First</SelectItem>}
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-[4/3] bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-1/3 rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </Card>
            ))}
          </div>
        ) : activeTab === "local" && listings.length === 0 ? (
          <div className="py-20 text-center">
            <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <h3 className="mb-1 text-sm font-medium">No homes found</h3>
            <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => switchTab("mls")}>
              Browse MLS Listings
            </Button>
          </div>
        ) : activeTab === "mls" && mlsListings.length === 0 ? (
          <div className="py-20 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <h3 className="mb-1 text-sm font-medium">No MLS listings found</h3>
            <p className="text-xs text-muted-foreground">
              Try a different location (e.g. "Tampa, FL" or "33601")
            </p>
          </div>
        ) : (
          <>
            {activeTab === "local" ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {mlsListings.map((listing) => (
                  <MLSListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
