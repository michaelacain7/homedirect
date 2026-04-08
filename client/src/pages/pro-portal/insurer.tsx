import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, Shield, DollarSign, FileText, Bell, CheckCircle, ChevronRight, AlertTriangle } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface InsurerPortalProps {
  token: string;
  portalInfo: PortalInfo;
}

const POLICY_STATUSES = [
  "Quote Requested",
  "Quote Provided",
  "Application Submitted",
  "Underwriting",
  "Policy Bound",
  "Policy Issued",
];

const COVERAGE_TYPES = [
  "HO-3 (Standard)",
  "HO-5 (Comprehensive)",
  "HO-6 (Condo)",
  "HO-8 (Older Home)",
];

const DOC_REQUESTS = [
  "Proof of Prior Insurance",
  "Home Inspection Report",
  "Roof Certification",
  "4-Point Inspection",
  "Wind Mitigation Report",
  "Flood Zone Determination",
  "Property Survey",
  "Photos of Property",
];

export default function InsurerPortal({ token, portalInfo }: InsurerPortalProps) {
  const { professional, transaction, listing, buyer, seller } = portalInfo;
  const { toast } = useToast();
  const [policyStatus, setPolicyStatus] = useState("Quote Provided");
  const [policyDetails, setPolicyDetails] = useState({
    coverageType: "HO-3 (Standard)",
    dwellingCoverage: "",
    personalProperty: "",
    liability: "300000",
    deductible: "",
    annualPremium: "",
    effectiveDate: "",
    floodInsurance: "not_required",
  });
  const [docRequests, setDocRequests] = useState<string[]>([]);
  const [showDocRequest, setShowDocRequest] = useState(false);

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/pro/${token}/documents`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleDocRequest = (doc: string) => {
    if (docRequests.includes(doc)) return;
    setDocRequests(prev => [...prev, doc]);
    toast({ title: "Document Requested", description: `${doc} has been requested from the buyer.` });
    setShowDocRequest(false);
  };

  const statusIndex = POLICY_STATUSES.indexOf(policyStatus);
  const images = listing ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];
  const purchasePrice = transaction.salePrice;

  // Estimate replacement cost (typically 80-100% of purchase price for dwelling)
  const dwellingNum = parseFloat(policyDetails.dwellingCoverage.replace(/[^0-9.]/g, ""));
  const isUnderinsured = !isNaN(dwellingNum) && dwellingNum < purchasePrice * 0.8;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Property & Buyer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="w-4 h-4 text-green-600" />
                Property & Insured Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {images[0] && (
                  <img src={images[0]} alt="Property" className="w-28 h-20 object-cover rounded-lg shrink-0" />
                )}
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {listing ? `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}` : "Address not available"}
                  </p>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    {listing && (
                      <>
                        <span>{listing.bedrooms} bed · {listing.bathrooms} bath · {listing.sqft.toLocaleString()} sqft</span>
                        {listing.yearBuilt && <span>Built {listing.yearBuilt}</span>}
                        <span className="capitalize">{listing.propertyType.replace("_", " ")}</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm pt-2">
                    <div>
                      <span className="text-gray-500">Buyer / Insured</span>
                      <p className="font-medium text-gray-900 dark:text-white">{buyer?.fullName || "—"}</p>
                      {buyer?.phone && <p className="text-xs text-gray-400">{buyer.phone}</p>}
                    </div>
                    <div>
                      <span className="text-gray-500">Purchase Price</span>
                      <p className="font-semibold text-gray-900 dark:text-white">${purchasePrice.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Policy Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-blue-600" />
                Policy Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress track */}
              <div className="flex items-center gap-1 flex-wrap">
                {POLICY_STATUSES.map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                      i < statusIndex
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : i === statusIndex
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                    }`}>
                      {s}
                    </span>
                    {i < POLICY_STATUSES.length - 1 && (
                      <ChevronRight className={`w-3 h-3 ${i < statusIndex ? "text-green-500" : "text-gray-300"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Update Status</Label>
                <Select value={policyStatus} onValueChange={setPolicyStatus}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Coverage Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-green-600" />
                Coverage Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Policy Type</Label>
                  <Select
                    value={policyDetails.coverageType}
                    onValueChange={v => setPolicyDetails(p => ({ ...p, coverageType: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COVERAGE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dwelling Coverage ($)</Label>
                  <Input
                    placeholder="e.g. 450000"
                    value={policyDetails.dwellingCoverage}
                    onChange={e => setPolicyDetails(p => ({ ...p, dwellingCoverage: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
                  {isUnderinsured && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Below 80% of purchase price — may be underinsured
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Personal Property ($)</Label>
                  <Input
                    placeholder="e.g. 150000"
                    value={policyDetails.personalProperty}
                    onChange={e => setPolicyDetails(p => ({ ...p, personalProperty: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Liability Coverage ($)</Label>
                  <Select
                    value={policyDetails.liability}
                    onValueChange={v => setPolicyDetails(p => ({ ...p, liability: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["100000", "300000", "500000", "1000000"].map(v => (
                        <SelectItem key={v} value={v}>${parseInt(v).toLocaleString()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deductible ($)</Label>
                  <Input
                    placeholder="e.g. 2500"
                    value={policyDetails.deductible}
                    onChange={e => setPolicyDetails(p => ({ ...p, deductible: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Annual Premium ($)</Label>
                  <Input
                    placeholder="e.g. 2400"
                    value={policyDetails.annualPremium}
                    onChange={e => setPolicyDetails(p => ({ ...p, annualPremium: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Effective Date</Label>
                  <Input
                    type="date"
                    value={policyDetails.effectiveDate}
                    onChange={e => setPolicyDetails(p => ({ ...p, effectiveDate: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Flood Insurance</Label>
                  <Select
                    value={policyDetails.floodInsurance}
                    onValueChange={v => setPolicyDetails(p => ({ ...p, floodInsurance: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_required">Not Required</SelectItem>
                      <SelectItem value="required">Required by Lender</SelectItem>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="bound">Bound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Document Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-orange-600" />
                  Document Requests
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowDocRequest(!showDocRequest)}
                >
                  Request Document
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {showDocRequest && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border space-y-2">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Select document to request:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {DOC_REQUESTS.map(doc => (
                      <button
                        key={doc}
                        onClick={() => handleDocRequest(doc)}
                        disabled={docRequests.includes(doc)}
                        className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                          docRequests.includes(doc)
                            ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "border-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        }`}
                      >
                        {docRequests.includes(doc) ? "\u2713 " : ""}{doc}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {docRequests.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">No document requests yet.</p>
              ) : (
                <div className="space-y-2">
                  {docRequests.map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{doc}</span>
                      <Badge variant="outline" className="ml-auto text-xs">Requested</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-purple-600" />
                Upload Insurance Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalUpload token={token} docType="insurance_quote" label="Insurance Quote" accept=".pdf" />
              <PortalUpload token={token} docType="insurance_binder" label="Insurance Binder" accept=".pdf" />
              <PortalUpload token={token} docType="insurance_policy" label="Insurance Policy (Declarations Page)" accept=".pdf" />
              <PortalUpload token={token} docType="flood_certificate" label="Flood Zone Determination" accept=".pdf" />
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
