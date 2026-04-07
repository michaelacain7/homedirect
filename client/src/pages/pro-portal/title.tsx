import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building, Shield, Bell, FileText, Calendar, DollarSign, CheckCircle, ChevronRight } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";
import { useToast } from "@/hooks/use-toast";

interface TitlePortalProps {
  token: string;
  portalInfo: PortalInfo;
}

const TITLE_STATUSES = ["Ordered", "In Progress", "Preliminary", "Clear"];

const BUYER_DOCS = [
  "Government-Issued ID",
  "Proof of Homeowner's Insurance",
  "Power of Attorney (if applicable)",
  "Final Walk-Through Confirmation",
];

const SELLER_DOCS = [
  "Government-Issued ID",
  "HOA Documents",
  "Survey",
  "Payoff Statement",
  "Power of Attorney (if applicable)",
];

export default function TitlePortal({ token, portalInfo }: TitlePortalProps) {
  const { professional, transaction, listing, buyer, seller } = portalInfo;
  const { toast } = useToast();
  const [titleStatus, setTitleStatus] = useState("In Progress");
  const [wireInstructions, setWireInstructions] = useState({
    bankName: "",
    accountName: "",
    routingNumber: "",
    accountNumber: "",
    reference: "",
  });
  const [closingDetails, setClosingDetails] = useState({
    date: "",
    time: "",
    location: "",
  });
  const [requestedDocs, setRequestedDocs] = useState<string[]>([]);
  const [showBuyerDocs, setShowBuyerDocs] = useState(false);
  const [showSellerDocs, setShowSellerDocs] = useState(false);

  const requestDoc = (doc: string, party: string) => {
    const key = `${party}: ${doc}`;
    if (requestedDocs.includes(key)) return;
    setRequestedDocs(prev => [...prev, key]);
    toast({ title: "Document Requested", description: `${doc} requested from ${party}.` });
    setShowBuyerDocs(false);
    setShowSellerDocs(false);
  };

  const statusIndex = TITLE_STATUSES.indexOf(titleStatus);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Transaction Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building className="w-4 h-4 text-green-600" />
                Transaction Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Buyer</p>
                  <p className="font-medium text-gray-900 dark:text-white">{buyer?.fullName || "—"}</p>
                  {buyer?.phone && <p className="text-xs text-gray-400">{buyer.phone}</p>}
                </div>
                <div>
                  <p className="text-gray-500">Seller</p>
                  <p className="font-medium text-gray-900 dark:text-white">{seller?.fullName || "—"}</p>
                  {seller?.phone && <p className="text-xs text-gray-400">{seller.phone}</p>}
                </div>
                <div>
                  <p className="text-gray-500">Purchase Price</p>
                  <p className="font-semibold text-gray-900 dark:text-white">${transaction.salePrice.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Property</p>
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {listing ? `${listing.address}, ${listing.city}, ${listing.state}` : "—"}
                  </p>
                </div>
                {transaction.closingDate && (
                  <div>
                    <p className="text-gray-500">Closing Date</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {new Date(transaction.closingDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Title Search Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-blue-600" />
                Title Search Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-1 flex-wrap">
                {TITLE_STATUSES.map((s, i) => (
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
                    {i < TITLE_STATUSES.length - 1 && (
                      <ChevronRight className={`w-3 h-3 ${i < statusIndex ? "text-green-500" : "text-gray-300"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Update Status</Label>
                <Select value={titleStatus} onValueChange={setTitleStatus}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TITLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setShowBuyerDocs(!showBuyerDocs); setShowSellerDocs(false); }}>
                    From Buyer
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setShowSellerDocs(!showSellerDocs); setShowBuyerDocs(false); }}>
                    From Seller
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {showBuyerDocs && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Request from Buyer</p>
                  {BUYER_DOCS.map(doc => (
                    <button
                      key={doc}
                      onClick={() => requestDoc(doc, "Buyer")}
                      disabled={requestedDocs.includes(`Buyer: ${doc}`)}
                      className={`block w-full text-left text-xs px-3 py-2 rounded border transition-colors ${
                        requestedDocs.includes(`Buyer: ${doc}`)
                          ? "bg-green-50 border-green-200 text-green-700"
                          : "bg-white dark:bg-gray-900 border-gray-200 hover:border-blue-400"
                      }`}
                    >
                      {requestedDocs.includes(`Buyer: ${doc}`) ? "✓ " : ""}{doc}
                    </button>
                  ))}
                </div>
              )}
              {showSellerDocs && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 space-y-1">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">Request from Seller</p>
                  {SELLER_DOCS.map(doc => (
                    <button
                      key={doc}
                      onClick={() => requestDoc(doc, "Seller")}
                      disabled={requestedDocs.includes(`Seller: ${doc}`)}
                      className={`block w-full text-left text-xs px-3 py-2 rounded border transition-colors ${
                        requestedDocs.includes(`Seller: ${doc}`)
                          ? "bg-green-50 border-green-200 text-green-700"
                          : "bg-white dark:bg-gray-900 border-gray-200 hover:border-purple-400"
                      }`}
                    >
                      {requestedDocs.includes(`Seller: ${doc}`) ? "✓ " : ""}{doc}
                    </button>
                  ))}
                </div>
              )}
              {requestedDocs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">No documents requested yet.</p>
              ) : (
                <div className="space-y-2">
                  {requestedDocs.map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 text-xs">{doc}</span>
                      <Badge variant="outline" className="ml-auto text-xs">Requested</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Closing Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4 text-green-600" />
                Closing Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Closing Date</Label>
                  <Input
                    type="date"
                    value={closingDetails.date}
                    onChange={e => setClosingDetails(p => ({ ...p, date: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input
                    type="time"
                    value={closingDetails.time}
                    onChange={e => setClosingDetails(p => ({ ...p, time: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input
                    placeholder="Office address"
                    value={closingDetails.location}
                    onChange={e => setClosingDetails(p => ({ ...p, location: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wire Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-yellow-600" />
                Wire Instructions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: "bankName", label: "Bank Name", placeholder: "e.g. First National Bank" },
                  { key: "accountName", label: "Account Name", placeholder: "e.g. First Title Trust IOLTA" },
                  { key: "routingNumber", label: "Routing Number", placeholder: "9-digit ABA" },
                  { key: "accountNumber", label: "Account Number", placeholder: "••••••••" },
                  { key: "reference", label: "Reference / File #", placeholder: "e.g. FT-2024-001234" },
                ].map(field => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      placeholder={field.placeholder}
                      value={(wireInstructions as any)[field.key]}
                      onChange={e => setWireInstructions(p => ({ ...p, [field.key]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upload Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-purple-600" />
                Upload Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalUpload token={token} docType="title_commitment" label="Title Commitment" accept=".pdf" />
              <PortalUpload token={token} docType="title_insurance" label="Title Insurance Policy" accept=".pdf" />
              <PortalUpload token={token} docType="closing_disclosure" label="Closing Disclosure" accept=".pdf" />
              <PortalUpload token={token} docType="settlement_statement" label="Settlement Statement (HUD-1)" accept=".pdf" />
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
