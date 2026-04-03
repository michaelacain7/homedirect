import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ListingCard } from "@/components/listing-card";
import { Search, Bot, DollarSign, Users, FileCheck, ArrowRight, Shield, Clock, Sparkles, MapPin } from "lucide-react";
import type { Listing } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: featured = [], isLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings/featured"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      setLocation("/search");
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary/5 py-16 md:py-24" data-testid="section-hero">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="mb-4 text-xl font-bold tracking-tight md:text-xl" data-testid="text-hero-title">
              Buy and sell your home.
              <br />
              <span className="text-primary">No agents. Just AI.</span>
            </h1>
            <p className="mb-8 text-base text-muted-foreground" data-testid="text-hero-subtitle">
              Save thousands with our 1% closing fee. AI handles everything from listing to closing
              &mdash; negotiations, paperwork, title, and disclosures. All of it.
            </p>
            <form onSubmit={handleSearch} className="mx-auto flex max-w-lg gap-2" data-testid="form-hero-search">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by city, address, or ZIP..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-hero-search"
                />
              </div>
              <Button type="submit" data-testid="button-hero-search">Search</Button>
            </form>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span>{stats?.totalListings || 0} active listings</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>1% closing fee</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>$20 walkthrough chaperones</span>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-16" data-testid="section-value-props">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-2 text-center text-lg font-semibold" data-testid="text-vp-title">How it works</h2>
          <p className="mb-10 text-center text-sm text-muted-foreground">From listing to closing, AI handles every step</p>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: DollarSign,
                title: "1% Closing Fee",
                desc: "Traditional agents charge 5-6%. We charge just 1% when the house closes. On a $500K home, that's $25,000 saved.",
              },
              {
                icon: Bot,
                title: "AI Negotiation",
                desc: "Our AI agent analyzes comparables, market trends, and negotiation tactics to get you the best deal possible.",
              },
              {
                icon: Users,
                title: "$20 Walkthroughs",
                desc: "Need to tour a home? A local chaperone shows up for $20 to guide you through. Like DoorDash for home tours.",
              },
              {
                icon: FileCheck,
                title: "Full Paperwork",
                desc: "AI prepares purchase agreements, disclosures, title docs, and everything needed to close. Review and e-sign online.",
              },
            ].map((item) => (
              <Card key={item.title} className="p-5" data-testid={`card-vp-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <item.icon className="mb-3 h-5 w-5 text-primary" />
                <h3 className="mb-1 text-sm font-semibold">{item.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="border-t py-16" data-testid="section-featured">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold" data-testid="text-featured-title">Featured listings</h2>
              <p className="text-sm text-muted-foreground">Latest properties in the Tampa Bay area</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/search")} data-testid="button-view-all">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <div className="aspect-[4/3] bg-muted" />
                  <div className="space-y-2 p-4">
                    <div className="h-5 w-1/3 rounded bg-muted" />
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Trust Section */}
      <section className="border-t bg-primary/5 py-16" data-testid="section-trust">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-2 text-lg font-semibold">Why people trust HomeDirectAI</h2>
            <p className="mb-8 text-sm text-muted-foreground">Real technology replacing expensive middlemen</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Shield, title: "Transparent Process", desc: "Every step tracked in your dashboard. No hidden fees, no surprise costs. Just 1% at closing." },
              { icon: Clock, title: "Faster Closings", desc: "AI processes paperwork instantly. No waiting for agents to return calls or schedule meetings." },
              { icon: Sparkles, title: "Smarter Deals", desc: "AI analyzes thousands of comparables and market data to negotiate better than any human agent." },
            ].map((item) => (
              <div key={item.title} className="text-center" data-testid={`text-trust-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <item.icon className="mx-auto mb-3 h-5 w-5 text-primary" />
                <h3 className="mb-1 text-sm font-semibold">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" data-testid="section-cta">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="mb-2 text-lg font-semibold">Ready to save thousands?</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            List your home or start searching. No commitment, no agent fees.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => setLocation("/sell")} data-testid="button-cta-sell">
              Sell Your Home
            </Button>
            <Button variant="secondary" onClick={() => setLocation("/search")} data-testid="button-cta-search">
              Browse Listings
            </Button>
            <Button variant="outline" onClick={() => setLocation("/map")} data-testid="button-cta-map">
              <MapPin className="mr-1.5 h-4 w-4" /> Explore Map
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8" data-testid="footer">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-muted-foreground">
          <span>2026 HomeDirectAI. All rights reserved.</span>
          <div className="flex gap-4">
            <span>1% closing fee</span>
            <span>AI-powered transactions</span>
            <span>Tampa Bay, FL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
