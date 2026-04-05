import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  MapPin, Calendar, Clock, DollarSign, Navigation,
  Briefcase, Loader2, CheckCircle
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

interface GigsTabProps {
  isOnline: boolean;
  onToggleOnline: () => void;
  onGigAccepted: () => void;
}

function getPhoto(listing: GigWithListing["listing"]) {
  const images = listing?.images ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];
  return images[0] || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400";
}

export function GigsTab({ isOnline, onToggleOnline, onGigAccepted }: GigsTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [passedIds, setPassedIds] = useState<number[]>([]);
  const [acceptedGigId, setAcceptedGigId] = useState<number | null>(null);

  const { data: gigs = [], isLoading } = useQuery<GigWithListing[]>({
    queryKey: ["/api/chaperone/available-gigs", user?.id],
    queryFn: () =>
      user ? apiRequest("GET", `/api/chaperone/available-gigs/${user.id}`).then(r => r.json()) : [],
    enabled: !!user && isOnline,
    refetchInterval: isOnline ? 30000 : false,
  });

  const acceptMutation = useMutation({
    mutationFn: (gigId: number) =>
      apiRequest("POST", `/api/chaperone/accept-gig/${gigId}`, { chaperoneId: user!.id }).then(r => r.json()),
    onSuccess: (_, gigId) => {
      setAcceptedGigId(gigId);
      qc.invalidateQueries({ queryKey: ["/api/chaperone/available-gigs", user?.id] });
      qc.invalidateQueries({ queryKey: ["/api/chaperone/my-gigs", user?.id] });
      qc.invalidateQueries({ queryKey: ["/api/chaperone/app/status", user?.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handlePass = async (gigId: number) => {
    try {
      await apiRequest("POST", `/api/chaperone/decline-gig/${gigId}`, {});
      setPassedIds(ids => [...ids, gigId]);
    } catch {
      // silently ignore
    }
  };

  // Show success overlay briefly before switching tabs
  if (acceptedGigId !== null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-[#0d1a12]" data-testid="gig-accepted-celebration">
        <div className="w-20 h-20 rounded-full bg-[#2D7A4F]/20 border-2 border-[#2D7A4F] flex items-center justify-center mb-6 animate-pulse">
          <CheckCircle className="w-10 h-10 text-[#4CAF87]" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Gig Accepted!</h2>
        <p className="text-gray-400 text-sm mb-8">Check the Active tab for details and directions.</p>
        <Button
          className="h-12 px-8 bg-[#2D7A4F] hover:bg-[#35905D] text-white rounded-xl font-semibold"
          onClick={() => {
            setAcceptedGigId(null);
            onGigAccepted();
          }}
        >
          View Active Gig
        </Button>
      </div>
    );
  }

  const visibleGigs = gigs.filter(g => !passedIds.includes(g.id));

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d1a12]" data-testid="tab-gigs">
      {/* Online/Offline toggle section */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={onToggleOnline}
          className={`w-full h-16 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
            isOnline
              ? "bg-[#2D7A4F] text-white shadow-green-900/40"
              : "bg-[#1a2e20] text-gray-400 border border-[#2D7A4F]/30"
          }`}
          data-testid="button-toggle-online"
        >
          <span className={`w-3 h-3 rounded-full ${isOnline ? "bg-white animate-pulse" : "bg-gray-600"}`} />
          {isOnline ? "You're Online — Looking for Showings" : "Go Online"}
        </button>

        {isOnline && (
          <div className="mt-3 flex items-center gap-2 px-1">
            <MapPin className="w-4 h-4 text-[#4CAF87]" />
            <span className="text-gray-400 text-sm">Tampa, FL</span>
            <span className="ml-auto text-xs text-gray-600">
              {isLoading ? "Loading..." : `${visibleGigs.length} available`}
            </span>
          </div>
        )}
      </div>

      {/* Offline state */}
      {!isOnline && (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center" data-testid="state-offline">
          <div className="w-16 h-16 rounded-full bg-[#1a2e20] flex items-center justify-center mb-4">
            <Navigation className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">You're Offline</h3>
          <p className="text-gray-500 text-sm leading-relaxed">
            Tap "Go Online" to start receiving<br />showing requests near you.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {isOnline && isLoading && (
        <div className="px-4 py-2 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-[#1a2e20] rounded-2xl p-4 h-36 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isOnline && !isLoading && visibleGigs.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-no-gigs">
          <div className="w-16 h-16 rounded-full bg-[#1a2e20] flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-[#2D7A4F]" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">No showings available right now</h3>
          <p className="text-gray-500 text-sm leading-relaxed mb-3">
            We'll notify you when one pops up nearby.
          </p>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1a2e20] border border-[#2D7A4F]/20">
            <Clock className="w-4 h-4 text-[#4CAF87]" />
            <span className="text-xs text-gray-400">Average wait: 15–30 minutes</span>
          </div>
        </div>
      )}

      {/* Gig cards */}
      {isOnline && !isLoading && visibleGigs.length > 0 && (
        <div className="px-4 py-2 space-y-3 pb-4">
          {visibleGigs.map(gig => (
            <MobileGigCard
              key={gig.id}
              gig={gig}
              onAccept={() => acceptMutation.mutate(gig.id)}
              onPass={() => handlePass(gig.id)}
              isAccepting={acceptMutation.isPending && acceptMutation.variables === gig.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileGigCard({
  gig,
  onAccept,
  onPass,
  isAccepting,
}: {
  gig: GigWithListing;
  onAccept: () => void;
  onPass: () => void;
  isAccepting: boolean;
}) {
  const photo = getPhoto(gig.listing);
  const listing = gig.listing;

  return (
    <div className="bg-[#141f17] border border-[#2D7A4F]/20 rounded-2xl overflow-hidden shadow-lg" data-testid={`card-gig-${gig.id}`}>
      {/* Property photo */}
      <div className="relative h-32 w-full overflow-hidden">
        <img src={photo} alt="Property" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141f17]/80 to-transparent" />
        {/* Payout badge */}
        <div className="absolute bottom-3 right-3 bg-[#2D7A4F] px-3 py-1 rounded-full">
          <span className="text-white font-bold text-lg">${gig.chaperonePayment.toFixed(2)}</span>
        </div>
        {/* Live dot */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="text-xs text-white">New</span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4">
        <h3 className="text-white font-semibold text-base leading-tight">
          {listing?.address || "Unknown Address"}
        </h3>
        <p className="text-gray-500 text-sm mt-0.5">
          {listing?.city}, {listing?.state} {listing?.zip}
        </p>

        <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[#4CAF87]" />
            {gig.scheduledDate}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-[#4CAF87]" />
            {gig.scheduledTime}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4 text-[#4CAF87]" />
            2.3 mi away
          </span>
          {listing && (
            <span className="text-gray-600">
              {listing.bedrooms}bd · {listing.bathrooms}ba · {listing.sqft?.toLocaleString()} sqft
            </span>
          )}
        </div>

        {gig.buyerNotes && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-[#1a2e20] border border-[#2D7A4F]/20">
            <p className="text-gray-400 text-xs italic">"{gig.buyerNotes}"</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={onAccept}
            disabled={isAccepting}
            className="flex-1 h-12 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-semibold rounded-xl text-sm"
            data-testid={`button-accept-gig-${gig.id}`}
          >
            {isAccepting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-1.5" />}
            Accept — ${gig.chaperonePayment.toFixed(2)}
          </Button>
          <Button
            onClick={onPass}
            variant="ghost"
            className="h-12 px-4 text-gray-500 hover:text-gray-300 hover:bg-[#1a2e20] rounded-xl text-sm"
            data-testid={`button-pass-gig-${gig.id}`}
          >
            Pass
          </Button>
        </div>
      </div>
    </div>
  );
}
