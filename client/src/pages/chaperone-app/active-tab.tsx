import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  MapPin, Phone, CheckCircle2, Loader2, Navigation,
  Calendar, Clock, Home, Check, Square
} from "lucide-react";

type GigWithListing = {
  id: number;
  listingId: number;
  buyerId: number;
  chaperoneId: number | null;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  chaperonePayment: number;
  buyerNotes: string | null;
  chaperoneNotes: string | null;
  createdAt: string;
  listing: {
    id: number;
    address: string;
    city: string;
    state: string;
    zip: string;
    images: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
  } | null;
};

function getPhoto(listing: GigWithListing["listing"]) {
  const images = listing?.images ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];
  return images[0] || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800";
}

const CHECKLIST_ITEMS = [
  "Arrived at property",
  "Unlocked and prepared for showing",
  "Buyer arrived",
  "Completed walkthrough",
  "Locked up and secured property",
];

interface ActiveTabProps {
  onComplete?: () => void;
}

export function ActiveTab({ onComplete }: ActiveTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [checklistDone, setChecklistDone] = useState<boolean[]>(Array(CHECKLIST_ITEMS.length).fill(false));
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: myGigs = [], isLoading } = useQuery<GigWithListing[]>({
    queryKey: ["/api/chaperone/my-gigs", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/my-gigs/${user.id}`).then(r => r.json()) : [],
    enabled: !!user,
  });

  const activeGig = myGigs.find(g => g.status === "assigned");

  const completeMutation = useMutation({
    mutationFn: (gigId: number) =>
      apiRequest("POST", `/api/chaperone/complete-gig/${gigId}`, {}).then(r => r.json()),
    onSuccess: () => {
      setShowSuccess(true);
      qc.invalidateQueries({ queryKey: ["/api/chaperone/my-gigs", user?.id] });
      qc.invalidateQueries({ queryKey: ["/api/chaperone/earnings", user?.id] });
      qc.invalidateQueries({ queryKey: ["/api/chaperone/app/status", user?.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleCheck = (idx: number) => {
    setChecklistDone(prev => prev.map((v, i) => i === idx ? !v : v));
  };

  if (showSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-[#0d1a12]" data-testid="showing-complete-screen">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">Showing Complete!</h2>
        <div className="w-24 h-24 rounded-full bg-[#2D7A4F]/20 border-2 border-[#2D7A4F] flex items-center justify-center my-6">
          <span className="text-3xl font-bold text-[#4CAF87]">
            ${activeGig?.chaperonePayment.toFixed(2) || "20.00"}
          </span>
        </div>
        <p className="text-[#4CAF87] font-semibold text-lg mb-1">
          ${activeGig?.chaperonePayment.toFixed(2) || "20.00"} earned
        </p>
        <p className="text-gray-500 text-sm mb-8">Funds will be available in your balance shortly.</p>
        <Button
          onClick={() => {
            setShowSuccess(false);
            setChecklistDone(Array(CHECKLIST_ITEMS.length).fill(false));
            onComplete?.();
          }}
          className="h-12 px-8 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-semibold rounded-xl"
        >
          Back to Home
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 bg-[#0d1a12] px-4 py-6">
        <div className="h-48 bg-[#1a2e20] rounded-2xl animate-pulse mb-4" />
        <div className="h-12 bg-[#1a2e20] rounded-xl animate-pulse mb-3" />
        <div className="h-12 bg-[#1a2e20] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!activeGig) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-[#0d1a12]" data-testid="state-no-active-gig">
        <div className="w-16 h-16 rounded-full bg-[#1a2e20] flex items-center justify-center mb-4">
          <Home className="w-8 h-8 text-gray-600" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-2">No active showing</h3>
        <p className="text-gray-500 text-sm leading-relaxed">
          Accept a gig from the Home tab<br />to get started.
        </p>
      </div>
    );
  }

  const listing = activeGig.listing;
  const photo = getPhoto(listing);
  const mapsAddress = encodeURIComponent(`${listing?.address}, ${listing?.city}, ${listing?.state} ${listing?.zip}`);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsAddress}`;
  const appleMapsUrl = `https://maps.apple.com/?q=${mapsAddress}`;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d1a12] pb-6" data-testid="tab-active">
      {/* Hero photo */}
      <div className="relative h-52 w-full overflow-hidden">
        <img src={photo} alt="Property" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1a12] via-[#0d1a12]/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <span className="inline-flex items-center gap-1.5 bg-[#2D7A4F] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Active Showing
          </span>
        </div>
      </div>

      {/* Address */}
      <div className="px-4 pt-2 pb-4 border-b border-[#1a2e20]">
        <h2 className="text-white text-xl font-bold leading-tight">
          {listing?.address || "Address"}
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">
          {listing?.city}, {listing?.state} {listing?.zip}
        </p>
        <div className="mt-2 flex items-center gap-3 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[#4CAF87]" />
            {activeGig.scheduledDate}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-[#4CAF87]" />
            {activeGig.scheduledTime}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-4 flex gap-3 border-b border-[#1a2e20]">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1"
          data-testid="button-directions"
        >
          <Button
            variant="outline"
            className="w-full h-12 border-[#2D7A4F]/40 bg-[#1a2e20] text-[#4CAF87] hover:bg-[#2D7A4F]/20 rounded-xl text-sm font-semibold"
          >
            <Navigation className="w-4 h-4 mr-2" />
            Directions
          </Button>
        </a>
        <a href="tel:+18135550303" className="flex-1" data-testid="button-call-buyer">
          <Button
            variant="outline"
            className="w-full h-12 border-[#2D7A4F]/40 bg-[#1a2e20] text-[#4CAF87] hover:bg-[#2D7A4F]/20 rounded-xl text-sm font-semibold"
          >
            <Phone className="w-4 h-4 mr-2" />
            Call Buyer
          </Button>
        </a>
      </div>

      {/* Showing details */}
      <div className="px-4 py-4 space-y-4 border-b border-[#1a2e20]">
        <h3 className="text-white font-semibold text-sm">Showing Details</h3>

        {listing && (
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-white font-bold text-lg">{listing.bedrooms}</p>
              <p className="text-gray-500 text-xs">Beds</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg">{listing.bathrooms}</p>
              <p className="text-gray-500 text-xs">Baths</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg">{listing.sqft?.toLocaleString()}</p>
              <p className="text-gray-500 text-xs">Sqft</p>
            </div>
          </div>
        )}

        {activeGig.buyerNotes && (
          <div className="p-3 rounded-xl bg-[#1a2e20] border border-[#2D7A4F]/20">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Buyer's Note</p>
            <p className="text-gray-300 text-sm italic">"{activeGig.buyerNotes}"</p>
          </div>
        )}

        <div className="p-3 rounded-xl bg-[#1a2e20] border border-amber-500/20">
          <p className="text-xs text-amber-400 mb-1 font-semibold uppercase tracking-wide">Access Instructions</p>
          <p className="text-gray-300 text-sm">Lockbox code: <span className="font-bold text-white">1234</span></p>
        </div>
      </div>

      {/* Checklist */}
      <div className="px-4 py-4 border-b border-[#1a2e20]">
        <h3 className="text-white font-semibold text-sm mb-3">Showing Checklist</h3>
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map((item, idx) => (
            <button
              key={item}
              onClick={() => toggleCheck(idx)}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl bg-[#1a2e20] border border-[#2D7A4F]/20 hover:bg-[#2D7A4F]/10 transition-colors text-left"
              data-testid={`checklist-item-${idx}`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                checklistDone[idx]
                  ? "bg-[#2D7A4F] border-[#2D7A4F]"
                  : "border-gray-600"
              }`}>
                {checklistDone[idx] && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={`text-sm transition-colors ${checklistDone[idx] ? "text-gray-500 line-through" : "text-gray-300"}`}>
                {item}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Mark Complete */}
      <div className="px-4 py-4">
        <Button
          onClick={() => completeMutation.mutate(activeGig.id)}
          disabled={completeMutation.isPending}
          className="w-full h-14 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-bold text-base rounded-xl shadow-lg shadow-green-900/30"
          data-testid="button-mark-complete"
        >
          {completeMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="w-5 h-5 mr-2" />
          )}
          Mark Showing Complete
        </Button>
        <p className="text-center text-gray-600 text-xs mt-2">
          Earn ${activeGig.chaperonePayment.toFixed(2)} upon completion
        </p>
      </div>
    </div>
  );
}
