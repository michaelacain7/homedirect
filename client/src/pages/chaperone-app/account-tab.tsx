import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Star, HelpCircle, CreditCard, Bell, LogOut,
  ChevronRight, Shield, MapPin
} from "lucide-react";

export function AccountTab() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [availability, setAvailability] = useState({
    weekdays: true,
    weekends: false,
    evenings: true,
  });
  const [travelMiles, setTravelMiles] = useState(15);
  const [notifications, setNotifications] = useState({
    newGigs: true,
    payments: true,
  });

  const { data: myGigs = [] } = useQuery<any[]>({
    queryKey: ["/api/chaperone/my-gigs", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/my-gigs/${user.id}`).then(r => r.json()) : [],
    enabled: !!user,
  });

  const { data: earningsData } = useQuery<{
    total: number; pending: number; paid: number; payouts: any[];
  }>({
    queryKey: ["/api/chaperone/earnings", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/earnings/${user.id}`).then(r => r.json()) : null,
    enabled: !!user,
  });

  const { data: chaperoneApp } = useQuery<any>({
    queryKey: ["/api/chaperone/application", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/application/${user.id}`).then(r => r.json()) : null,
    enabled: !!user,
  });

  const payouts = earningsData?.payouts || [];
  const completedEarnings = payouts.filter((p: any) => p.type === "earning" && p.status === "completed").reduce((s: number, p: any) => s + p.amount, 0);
  const completedShowings = myGigs.filter((g: any) => g.status === "completed").length;
  const totalShowings = myGigs.length;
  const acceptanceRate = totalShowings > 0 ? Math.round((completedShowings / totalShowings) * 100) : 100;

  const initials = user?.fullName
    ? user.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "CX";

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const handleLogout = async () => {
    await logout();
    toast({ title: "Signed out", description: "See you next time!" });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d1a12] pb-6" data-testid="tab-account">
      {/* Profile card */}
      <div className="px-4 pt-6 pb-4 border-b border-[#1a2e20]">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#2D7A4F] flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-900/30">
            <span className="text-white font-bold text-xl">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg leading-tight">{user?.fullName || "Chaperone"}</h2>
            <p className="text-gray-500 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(s => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${s <= 4 ? "fill-amber-400 text-amber-400" : "text-gray-600"}`}
                />
              ))}
              <span className="text-gray-400 text-xs ml-1">4.8</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-3 text-xs text-gray-500">
          <span>Member since {memberSince}</span>
          <span>·</span>
          <span>{completedShowings} showings</span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="px-4 py-4 flex gap-3 border-b border-[#1a2e20]">
        {[
          { label: "This Month", value: `$${completedEarnings.toFixed(2)}` },
          { label: "Showings", value: completedShowings.toString() },
          { label: "Accept Rate", value: `${acceptanceRate}%` },
        ].map(stat => (
          <div key={stat.label} className="flex-1 p-3 rounded-xl bg-[#141f17] border border-[#2D7A4F]/20 text-center">
            <p className="text-white font-bold text-base">{stat.value}</p>
            <p className="text-gray-600 text-xs mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Availability */}
      <div className="px-4 py-4 border-b border-[#1a2e20]">
        <h3 className="text-white font-semibold text-sm mb-3">Availability</h3>
        <div className="space-y-2">
          {(["weekdays", "weekends", "evenings"] as const).map(slot => (
            <div key={slot} className="flex items-center justify-between py-2">
              <span className="text-gray-300 text-sm capitalize">{slot}</span>
              <button
                onClick={() => setAvailability(prev => ({ ...prev, [slot]: !prev[slot] }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${availability[slot] ? "bg-[#2D7A4F]" : "bg-gray-700"}`}
                data-testid={`toggle-${slot}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${availability[slot] ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Travel distance */}
      <div className="px-4 py-4 border-b border-[#1a2e20]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">Max Travel Distance</h3>
          <div className="flex items-center gap-1.5 bg-[#2D7A4F]/20 px-2.5 py-1 rounded-full">
            <MapPin className="w-3.5 h-3.5 text-[#4CAF87]" />
            <span className="text-[#4CAF87] text-sm font-bold">{travelMiles} mi</span>
          </div>
        </div>
        <input
          type="range"
          min={5}
          max={30}
          step={5}
          value={travelMiles}
          onChange={e => setTravelMiles(parseInt(e.target.value))}
          className="w-full accent-[#2D7A4F]"
          data-testid="slider-travel-distance"
        />
        <div className="flex justify-between text-gray-600 text-xs mt-1">
          <span>5 mi</span>
          <span>30 mi</span>
        </div>
      </div>

      {/* Notifications */}
      <div className="px-4 py-4 border-b border-[#1a2e20]">
        <h3 className="text-white font-semibold text-sm mb-3">Notifications</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#4CAF87]" />
              <span className="text-gray-300 text-sm">New gig requests</span>
            </div>
            <button
              onClick={() => setNotifications(prev => ({ ...prev, newGigs: !prev.newGigs }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${notifications.newGigs ? "bg-[#2D7A4F]" : "bg-gray-700"}`}
              data-testid="toggle-notif-gigs"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications.newGigs ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#4CAF87]" />
              <span className="text-gray-300 text-sm">Payment received</span>
            </div>
            <button
              onClick={() => setNotifications(prev => ({ ...prev, payments: !prev.payments }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${notifications.payments ? "bg-[#2D7A4F]" : "bg-gray-700"}`}
              data-testid="toggle-notif-payments"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications.payments ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Settings links */}
      <div className="px-4 py-4 space-y-1 border-b border-[#1a2e20]">
        <button className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#1a2e20] rounded-xl px-2 transition-colors">
          <CreditCard className="w-5 h-5 text-[#4CAF87] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-gray-300 text-sm">Bank Account</p>
            {chaperoneApp?.accountNumberLast4 && (
              <p className="text-gray-600 text-xs">Ends in ••••{chaperoneApp.accountNumberLast4}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>

        <button className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#1a2e20] rounded-xl px-2 transition-colors">
          <Shield className="w-5 h-5 text-[#4CAF87] flex-shrink-0" />
          <span className="flex-1 text-gray-300 text-sm">Background Check Status</span>
          <span className="text-xs text-green-400 font-medium capitalize">
            {chaperoneApp?.backgroundCheckStatus || "Passed"}
          </span>
        </button>

        <button className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#1a2e20] rounded-xl px-2 transition-colors">
          <HelpCircle className="w-5 h-5 text-[#4CAF87] flex-shrink-0" />
          <span className="flex-1 text-gray-300 text-sm">Help & Support</span>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Sign Out */}
      <div className="px-4 py-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 py-3 text-left rounded-xl px-2 hover:bg-red-900/10 transition-colors"
          data-testid="button-sign-out"
        >
          <LogOut className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
