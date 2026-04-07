import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, DollarSign, TrendingUp, TrendingDown, AlertTriangle, FileText, CheckCircle } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface AppraiserPortalProps {
  token: string;
  portalInfo: PortalInfo;
}

export default function AppraiserPortal({ token, portalInfo }: AppraiserPortalProps) {
  const { professional, transaction, listing, buyer, seller } = portalInfo;
  const [appraisedValue, setAppraisedValue] = useState("");
  const [valueSaved, setValueSaved] = useState(false);
  const [reportUploaded, setReportUploaded] = useState(false);
  const { toast } = useToast();

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/pro/${token}/documents`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasReport = reportUploaded || documents.some((d: any) => d.type === "appraisal_report");
  const images = listing ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];
  const purchasePrice = transaction.salePrice;
  const appraisedNum = parseFloat(appraisedValue.replace(/[^0-9.]/g, ""));
  const isLow = !isNaN(appraisedNum) && appraisedNum < purchasePrice;
  const gap = !isNaN(appraisedNum) ? purchasePrice - appraisedNum : null;

  const handleSaveValue = () => {
    if (!appraisedValue || isNaN(appraisedNum)) {
      toast({ title: "Invalid value", description: "Please enter a valid appraisal value.", variant: "destructive" });
      return;
    }
    setValueSaved(true);
    toast({ title: "Appraisal Value Saved", description: `$${appraisedNum.toLocaleString()} logged.` });
  };

  // Mock comparables based on purchase price
  const comparables = listing ? [
    { address: `${listing.address.split(" ").slice(0, 2).join(" ")} Dr, ${listing.city}`, sqft: Math.round((listing.sqft || 1800) * 0.97), price: Math.round(purchasePrice * 0.96), ppsf: Math.round((purchasePrice * 0.96) / (listing.sqft || 1800)) },
    { address: `${listing.address.split(" ").slice(0, 2).join(" ")} Blvd, ${listing.city}`, sqft: listing.sqft || 1800, price: Math.round(purchasePrice * 1.01), ppsf: Math.round((purchasePrice * 1.01) / (listing.sqft || 1800)) },
    { address: `${listing.address.split(" ").slice(0, 2).join(" ")} Ln, ${listing.city}`, sqft: Math.round((listing.sqft || 1800) * 1.03), price: Math.round(purchasePrice * 1.04), ppsf: Math.round((purchasePrice * 1.04) / (listing.sqft || 1800)) },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Property Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="w-4 h-4 text-green-600" />
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {images[0] && (
                  <img src={images[0]} alt="Property" className="w-28 h-20 object-cover rounded-lg shrink-0" />
                )}
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {listing ? `${listing.address}, ${listing.city}, ${listing.state}` : "Address not available"}
                  </p>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    {listing && (
                      <>
                        <span>{listing.bedrooms} bed · {listing.bathrooms} bath · {listing.sqft.toLocaleString()} sqft</span>
                        {listing.yearBuilt && <span>Built {listing.yearBuilt}</span>}
                      </>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm pt-1">
                    <div>
                      <span className="text-gray-500">Contract Price: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">${purchasePrice.toLocaleString()}</span>
                    </div>
                    {listing && (
                      <div>
                        <span className="text-gray-500">Price/sqft: </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          ${Math.round(purchasePrice / listing.sqft)}/sqft
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appraisal Value Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-green-600" />
                Appraised Value
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {valueSaved ? (
                <div className="space-y-3">
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                    isLow
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  }`}>
                    {isLow ? (
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    )}
                    <div>
                      <p className={`font-semibold ${isLow ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}`}>
                        Appraised Value: ${appraisedNum.toLocaleString()}
                      </p>
                      {isLow ? (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          ⚠ Appraisal gap: ${gap!.toLocaleString()} below contract price
                        </p>
                      ) : (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Meets or exceeds contract price
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setValueSaved(false)}>
                    Edit Value
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Appraised Value</Label>
                    <Input
                      placeholder="e.g. 485000"
                      value={appraisedValue}
                      onChange={e => setAppraisedValue(e.target.value)}
                      type="number"
                    />
                    {isLow && !isNaN(appraisedNum) && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Value is ${gap!.toLocaleString()} below contract price of ${purchasePrice.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveValue}>
                    Save Appraised Value
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-purple-600" />
                Upload Appraisal Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasReport ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="font-medium text-green-800 dark:text-green-200">Appraisal Report Submitted</p>
                </div>
              ) : (
                <PortalUpload
                  token={token}
                  docType="appraisal_report"
                  label="Upload Appraisal Report (PDF)"
                  accept=".pdf"
                  onUpload={() => setReportUploaded(true)}
                />
              )}
            </CardContent>
          </Card>

          {/* Comparables */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Comparable Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {comparables.map((comp, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{comp.address}</p>
                      <p className="text-xs text-gray-500">{comp.sqft.toLocaleString()} sqft</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">${comp.price.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">${comp.ppsf}/sqft</p>
                    </div>
                  </div>
                ))}
                {comparables.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No comparable data available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <PortalChat token={token} proName={professional.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
