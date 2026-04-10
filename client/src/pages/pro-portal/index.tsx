import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Home } from "lucide-react";
import InspectorPortal from "./inspector";
import AppraiserPortal from "./appraiser";
import LenderPortal from "./lender";
import TitlePortal from "./title";
import PhotographerPortal from "./photographer";
import InsurerPortal from "./insurer";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export interface PortalInfo {
  professional: {
    id: number;
    transactionId: number;
    listingId: number | null;
    type: string;
    name: string;
    company: string | null;
    email: string;
    phone: string | null;
    accessToken: string;
    status: string;
    createdAt: string | null;
    expiresAt: string | null;
  };
  transaction: {
    id: number;
    listingId: number;
    offerId: number;
    buyerId: number;
    sellerId: number;
    salePrice: number;
    status: string;
    closingDate: string | null;
    inspectionStatus: string;
    appraisalStatus: string;
    titleStatus: string;
    createdAt: string;
  };
  listing: {
    id: number;
    address: string;
    city: string;
    state: string;
    zip: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    yearBuilt: number | null;
    images: string;
    propertyType: string;
    title: string;
  } | null;
  buyer: { id: number; fullName: string; phone: string | null } | null;
  seller: { id: number; fullName: string; phone: string | null } | null;
}

const TYPE_LABELS: Record<string, string> = {
  inspector: "Home Inspector",
  appraiser: "Appraiser",
  lender: "Lender",
  title: "Title Company",
  photographer: "Photographer",
  insurer: "Home Insurer",
};

const TYPE_COLORS: Record<string, string> = {
  inspector: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  appraiser: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  lender: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  title: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  photographer: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  insurer: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

interface ProPortalProps {
  token: string;
}

export default function ProPortal({ token }: ProPortalProps) {
  const { data, isLoading, error } = useQuery<PortalInfo>({
    queryKey: [`/api/pro/${token}/info`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/info`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to load portal");
      }
      return res.json();
    },
    retry: false,
  });

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto" />
          <p className="text-gray-600 dark:text-gray-400">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Portal Unavailable</h2>
          <p className="text-gray-500 dark:text-gray-400">
            {(error as Error)?.message || "This portal link is invalid, expired, or has been revoked."}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            If you believe this is an error, contact the buyer or seller who invited you.
          </p>
        </div>
      </div>
    );
  }

  const { professional, transaction, listing, buyer, seller } = data;
  const typeLabel = TYPE_LABELS[professional.type] || professional.type;
  const typeColor = TYPE_COLORS[professional.type] || "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white text-lg hidden sm:block">HomeDirectAI</span>
          </div>

          {/* Professional Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{professional.name}</p>
              {professional.company && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{professional.company}</p>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${typeColor}`}>
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Property Bar */}
        {listing && (
          <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">
                  {listing.address}, {listing.city}, {listing.state} {listing.zip}
                </span>
                {transaction.salePrice && (
                  <span className="ml-2 text-gray-500">
                    · ${transaction.salePrice.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Portal Content */}
      <main className="flex-1">
        {professional.type === "inspector" && (
          <InspectorPortal token={token} portalInfo={data} />
        )}
        {professional.type === "appraiser" && (
          <AppraiserPortal token={token} portalInfo={data} />
        )}
        {professional.type === "lender" && (
          <LenderPortal token={token} portalInfo={data} />
        )}
        {professional.type === "title" && (
          <TitlePortal token={token} portalInfo={data} />
        )}
        {professional.type === "photographer" && (
          <PhotographerPortal token={token} portalInfo={data} />
        )}
        {professional.type === "insurer" && (
          <InsurerPortal token={token} portalInfo={data} />
        )}
        {!["inspector", "appraiser", "lender", "title", "photographer", "insurer"].includes(professional.type) && (
          <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">
            Unknown portal type: {professional.type}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            HomeDirectAI Professional Portal · Secure access for {typeLabel} · Token expires{" "}
            {professional.expiresAt
              ? new Date(professional.expiresAt).toLocaleDateString()
              : "never"}
          </p>
        </div>
      </footer>
    </div>
  );
}
