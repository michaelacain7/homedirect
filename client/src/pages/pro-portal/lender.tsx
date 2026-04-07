import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, DollarSign, FileText, Bell, CheckCircle, ChevronRight } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";
import { useToast } from "@/hooks/use-toast";

interface LenderPortalProps {
  token: string;
  portalInfo: PortalInfo;
}

const LOAN_STATUSES = [
  "Pre-qualified",
  "Pre-approved",
  "Submitted",
  "Underwriting",
  "Conditional Approval",
  "Clear to Close",
];

const DOC_REQUESTS = [
  "Pay Stubs (30 days)",
  "W-2 Forms (2 years)",
  "Tax Returns (2 years)",
  "Bank Statements (3 months)",
  "Gift Letter",
  "Proof of Down Payment",
  "Employment Verification",
  "Social Security Award Letter",
];

export default function LenderPortal({ token, portalInfo }: LenderPortalProps) {
  const { professional, transaction, listing, buyer, seller } = portalInfo;
  const { toast } = useToast();
  const [loanStatus, setLoanStatus] = useState("Pre-approved");
  const [loanDetails, setLoanDetails] = useState({
    loanType: "Conventional",
    rate: "",
    term: "30",
    downPayment: "",
    monthlyPayment: "",
  });
  const [docRequests, setDocRequests] = useState<string[]>([]);
  const [showDocRequest, setShowDocRequest] = useState(false);

  const handleDocRequest = (doc: string) => {
    if (docRequests.includes(doc)) return;
    setDocRequests(prev => [...prev, doc]);
    toast({ title: "Document Requested", description: `${doc} has been requested from the buyer.` });
    setShowDocRequest(false);
  };

  const statusIndex = LOAN_STATUSES.indexOf(loanStatus);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Borrower Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-4 h-4 text-green-600" />
                Borrower Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Borrower</p>
                  <p className="font-medium text-gray-900 dark:text-white">{buyer?.fullName || "—"}</p>
                  {buyer?.phone && <p className="text-xs text-gray-400">{buyer.phone}</p>}
                </div>
                <div>
                  <p className="text-gray-500">Seller</p>
                  <p className="font-medium text-gray-900 dark:text-white">{seller?.fullName || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Purchase Price</p>
                  <p className="font-semibold text-gray-900 dark:text-white">${transaction.salePrice.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Property</p>
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {listing ? `${listing.address}, ${listing.city}` : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loan Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChevronRight className="w-4 h-4 text-blue-600" />
                Loan Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress track */}
              <div className="flex items-center gap-1 flex-wrap">
                {LOAN_STATUSES.map((s, i) => (
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
                    {i < LOAN_STATUSES.length - 1 && (
                      <ChevronRight className={`w-3 h-3 ${i < statusIndex ? "text-green-500" : "text-gray-300"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Update Status</Label>
                <Select value={loanStatus} onValueChange={setLoanStatus}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Loan Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-green-600" />
                Loan Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Loan Type</Label>
                  <Select
                    value={loanDetails.loanType}
                    onValueChange={v => setLoanDetails(p => ({ ...p, loanType: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Conventional", "FHA", "VA", "USDA", "Jumbo"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Loan Term</Label>
                  <Select
                    value={loanDetails.term}
                    onValueChange={v => setLoanDetails(p => ({ ...p, term: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["10", "15", "20", "25", "30"].map(t => (
                        <SelectItem key={t} value={t}>{t} years</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Interest Rate (%)</Label>
                  <Input
                    placeholder="e.g. 6.875"
                    value={loanDetails.rate}
                    onChange={e => setLoanDetails(p => ({ ...p, rate: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Down Payment ($)</Label>
                  <Input
                    placeholder="e.g. 50000"
                    value={loanDetails.downPayment}
                    onChange={e => setLoanDetails(p => ({ ...p, downPayment: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Estimated Monthly Payment ($)</Label>
                  <Input
                    placeholder="e.g. 2850"
                    value={loanDetails.monthlyPayment}
                    onChange={e => setLoanDetails(p => ({ ...p, monthlyPayment: e.target.value }))}
                    className="h-8 text-xs"
                    type="number"
                  />
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
                        {docRequests.includes(doc) ? "✓ " : ""}{doc}
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
                Upload Loan Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalUpload token={token} docType="loan_estimate" label="Loan Estimate" accept=".pdf" />
              <PortalUpload token={token} docType="conditional_approval" label="Conditional Approval" accept=".pdf" />
              <PortalUpload token={token} docType="clear_to_close" label="Clear to Close Letter" accept=".pdf" />
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
