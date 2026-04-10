import { Switch, Route, Router, useLocation } from "wouter";
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
import ChaperoneApply from "@/pages/chaperone-apply";
import ChaperoneDashboard from "@/pages/chaperone-dashboard";
import TransactionPage from "@/pages/transaction";
import TransactionHub from "@/pages/transaction-hub";
import PreApproval from "@/pages/pre-approval";
import PortalInspection from "@/pages/portal-inspection";
import PortalEscrow from "@/pages/portal-escrow";
import PortalLender from "@/pages/portal-lender";
import PortalAppraisal from "@/pages/portal-appraisal";
import PortalTitle from "@/pages/portal-title";
import PortalInsurance from "@/pages/portal-insurance";
import EditListing from "@/pages/edit-listing";
import AdminDashboard from "@/pages/admin";
import ClosingPrep from "@/pages/closing-prep";
import NotFound from "@/pages/not-found";
import { AIAdvisor } from "@/components/ai-advisor";
import ChaperoneApp from "@/pages/chaperone-app/index";
import ProPortal from "@/pages/pro-portal/index";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/search" component={SearchPage} />
      <Route path="/map" component={MapSearch} />
      <Route path="/listing/:id" component={ListingDetail} />
      <Route path="/sell" component={Sell} />
      <Route path="/pre-approval" component={PreApproval} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/negotiate/:id" component={Negotiate} />
      <Route path="/chaperone-apply" component={ChaperoneApply} />
      <Route path="/chaperone-dashboard" component={ChaperoneDashboard} />
      <Route path="/transaction/:id/inspection" component={PortalInspection} />
      <Route path="/transaction/:id/escrow" component={PortalEscrow} />
      <Route path="/transaction/:id/lender" component={PortalLender} />
      <Route path="/transaction/:id/appraisal" component={PortalAppraisal} />
      <Route path="/transaction/:id/title" component={PortalTitle} />
      <Route path="/transaction/:id/insurance" component={PortalInsurance} />
      <Route path="/transaction/:id/closing-prep" component={ClosingPrep} />
      <Route path="/transaction/:id" component={TransactionHub} />
      <Route path="/edit-listing/:id" component={EditListing} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ChaperoneAppRouteGuard() {
  const [location] = useHashLocation();

  if (location.startsWith("/chaperone-app")) {
    return <ChaperoneApp />;
  }

  if (location.startsWith("/pro/")) {
    const token = location.replace("/pro/", "").split("/")[0];
    return <ProPortal token={token} />;
  }

  return (
    <div className="flex min-h-screen flex-col" data-testid="app-root">
      <Header />
      <main className="flex-1">
        <AppRouter />
      </main>
      <AIAdvisor />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <Router hook={useHashLocation}>
              <ChaperoneAppRouteGuard />
            </Router>
          </AuthProvider>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
