import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import Home from "@/pages/home";
import SearchPage from "@/pages/search";
import ListingDetail from "@/pages/listing-detail";
import Sell from "@/pages/sell";
import Dashboard from "@/pages/dashboard";
import Negotiate from "@/pages/negotiate";
import MapSearch from "@/pages/map-search";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/search" component={SearchPage} />
      <Route path="/map" component={MapSearch} />
      <Route path="/listing/:id" component={ListingDetail} />
      <Route path="/sell" component={Sell} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/negotiate/:id" component={Negotiate} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <Router hook={useHashLocation}>
              <div className="flex min-h-screen flex-col" data-testid="app-root">
                <Header />
                <main className="flex-1">
                  <AppRouter />
                </main>
              </div>
            </Router>
          </AuthProvider>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
