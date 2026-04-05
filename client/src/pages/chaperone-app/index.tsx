import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Home, ClipboardList, DollarSign, User, Wifi, WifiOff } from "lucide-react";
import { ChaperoneLogin } from "./login";
import { GigsTab } from "./gigs-tab";
import { ActiveTab } from "./active-tab";
import { EarningsTab } from "./earnings-tab";
import { AccountTab } from "./account-tab";

type Tab = "home" | "active" | "earnings" | "account";

const TABS = [
  { id: "home" as Tab, label: "Home", Icon: Home },
  { id: "active" as Tab, label: "Active", Icon: ClipboardList },
  { id: "earnings" as Tab, label: "Earnings", Icon: DollarSign },
  { id: "account" as Tab, label: "Account", Icon: User },
];

export default function ChaperoneApp() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [isOnline, setIsOnline] = useState(false);

  // Check if user is a chaperone
  const { data: chaperoneApp, isLoading: appLoading } = useQuery<any>({
    queryKey: ["/api/chaperone/application", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/application/${user.id}`).then(r => r.json()) : null,
    enabled: !!user,
  });

  // Count active gigs for badge
  const { data: myGigs = [] } = useQuery<any[]>({
    queryKey: ["/api/chaperone/my-gigs", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/my-gigs/${user.id}`).then(r => r.json()) : [],
    enabled: !!user,
  });

  const activeGigCount = myGigs.filter((g: any) => g.status === "assigned").length;

  if (authLoading || (user && appLoading)) {
    return (
      <div className="min-h-screen bg-[#0d1a12] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#2D7A4F] border-t-transparent animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in — show login screen
  if (!user) {
    return <ChaperoneLogin />;
  }

  // Logged in but not a chaperone
  const isApprovedChaperone = user.role === "chaperone" || chaperoneApp?.status === "approved";
  if (!isApprovedChaperone && chaperoneApp !== undefined) {
    return (
      <div className="min-h-screen bg-[#0d1a12] flex flex-col items-center justify-center px-6 text-center" data-testid="not-chaperone-screen">
        <div className="w-16 h-16 rounded-2xl bg-[#2D7A4F]/20 border border-[#2D7A4F]/40 flex items-center justify-center mb-6">
          <User className="w-8 h-8 text-[#4CAF87]" />
        </div>
        <h2 className="text-white text-xl font-bold mb-2">Not a Chaperone Yet</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Apply to become a HomeDirectAI chaperone<br />and earn $20 per showing.
        </p>
        <a
          href="/#/chaperone-apply"
          className="w-full max-w-xs h-12 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-semibold rounded-xl flex items-center justify-center transition-colors"
          data-testid="button-apply-from-app"
        >
          Apply Now
        </a>
        <button
          onClick={() => {
            // Allow signed-in users with pending apps to use the app anyway
            window.location.hash = "#/";
          }}
          className="mt-4 text-gray-600 text-sm underline underline-offset-2"
        >
          Back to main site
        </button>
      </div>
    );
  }

  const toggleOnline = () => setIsOnline(prev => !prev);

  return (
    <div className="fixed inset-0 bg-[#0d1a12] flex flex-col overflow-hidden" data-testid="chaperone-app-shell">
      {/* Status bar */}
      <div className="flex-shrink-0 bg-[#0d1a12] border-b border-[#1a2e20] px-4 pt-safe-top">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#2D7A4F] flex items-center justify-center">
              <Home className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">HomeDirectAI Chaperone</span>
          </div>
          <button
            onClick={toggleOnline}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isOnline
                ? "bg-[#2D7A4F]/20 text-[#4CAF87] border border-[#2D7A4F]/40"
                : "bg-gray-800 text-gray-500 border border-gray-700"
            }`}
            data-testid="status-bar-toggle"
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === "home" && (
          <GigsTab
            isOnline={isOnline}
            onToggleOnline={toggleOnline}
            onGigAccepted={() => setActiveTab("active")}
          />
        )}
        {activeTab === "active" && (
          <ActiveTab onComplete={() => setActiveTab("home")} />
        )}
        {activeTab === "earnings" && <EarningsTab />}
        {activeTab === "account" && <AccountTab />}
      </div>

      {/* Bottom tab navigation */}
      <div
        className="flex-shrink-0 bg-[#0d1a12] border-t border-[#1a2e20] pb-safe-bottom"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
        data-testid="bottom-tab-nav"
      >
        <div className="flex h-14">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            const badge = id === "active" && activeGigCount > 0 ? activeGigCount : null;

            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                  isActive ? "text-[#4CAF87]" : "text-gray-600"
                }`}
                data-testid={`tab-${id}`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {badge && (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-[#2D7A4F] text-white text-[10px] font-bold flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-[#4CAF87]" : "text-gray-600"}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#2D7A4F]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
