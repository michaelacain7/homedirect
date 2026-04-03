import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ListingCard } from "@/components/listing-card";
import { Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import type { Listing } from "@shared/schema";

export default function SearchPage() {
  const queryString = useSearch();
  const params = new URLSearchParams(queryString);
  const initialQ = params.get("q") || "";

  const [search, setSearch] = useState(initialQ);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: "", maxPrice: "", minBeds: "", maxBeds: "",
    minBaths: "", maxBaths: "", minSqft: "", maxSqft: "",
    propertyType: "all",
  });

  const buildQuery = () => {
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
    return p.toString();
  };

  const { data: listings = [], isLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings", search, filters],
    queryFn: async () => {
      const q = buildQuery();
      const res = await apiRequest("GET", `/api/listings?${q}`);
      return res.json();
    },
  });

  const clearFilters = () => {
    setFilters({ minPrice: "", maxPrice: "", minBeds: "", maxBeds: "", minBaths: "", maxBaths: "", minSqft: "", maxSqft: "", propertyType: "all" });
    setSearch("");
  };

  const hasActiveFilters = Object.values(filters).some(v => v && v !== "all") || search;

  return (
    <div className="min-h-screen" data-testid="page-search">
      {/* Search Header */}
      <div className="border-b bg-background py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by city, address, or ZIP..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
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
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-b bg-muted/30 py-4" data-testid="panel-filters">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Min Price</Label>
                <Input type="number" placeholder="$0" value={filters.minPrice} onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))} data-testid="input-min-price" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Price</Label>
                <Input type="number" placeholder="Any" value={filters.maxPrice} onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))} data-testid="input-max-price" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min Beds</Label>
                <Select value={filters.minBeds || "any"} onValueChange={v => setFilters(f => ({ ...f, minBeds: v === "any" ? "" : v }))}>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Min Baths</Label>
                <Select value={filters.minBaths || "any"} onValueChange={v => setFilters(f => ({ ...f, minBaths: v === "any" ? "" : v }))}>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Property Type</Label>
                <Select value={filters.propertyType} onValueChange={v => setFilters(f => ({ ...f, propertyType: v }))}>
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
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground" data-testid="text-results-count">
            {isLoading ? "Searching..." : `${listings.length} ${listings.length === 1 ? "home" : "homes"} found`}
          </p>
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
        ) : listings.length === 0 ? (
          <div className="py-20 text-center">
            <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <h3 className="mb-1 text-sm font-medium">No homes found</h3>
            <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
