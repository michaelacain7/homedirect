import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Home, Calendar, User, FileText, Plus, CheckCircle, CheckCircle2, Bot } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface InspectorPortalProps {
  token: string;
  portalInfo: PortalInfo;
}

const CATEGORIES = ["Structural", "Electrical", "Plumbing", "HVAC", "Roof", "Exterior", "Interior", "Other"];
const SEVERITIES = ["Major", "Moderate", "Minor"];

interface Finding {
  category: string;
  severity: string;
  description: string;
  estimatedCost: string;
}

export default function InspectorPortal({ token, portalInfo }: InspectorPortalProps) {
  const { professional, transaction, listing, buyer, seller } = portalInfo;
  const [reportUploaded, setReportUploaded] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [newFinding, setNewFinding] = useState<Finding>({
    category: "Structural",
    severity: "Minor",
    description: "",
    estimatedCost: "",
  });

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/pro/${token}/documents`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasReport = reportUploaded || documents.some((d: any) => d.type === "inspection_report");
  const images = listing ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];

  const addFinding = () => {
    if (!newFinding.description) return;
    setFindings(prev => [...prev, { ...newFinding }]);
    setNewFinding({ category: "Structural", severity: "Minor", description: "", estimatedCost: "" });
    setShowFindingForm(false);
  };

  const severityColor = (s: string) => {
    if (s === "Major") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    if (s === "Moderate") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details */}
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
                  <img
                    src={images[0]}
                    alt="Property"
                    className="w-28 h-20 object-cover rounded-lg shrink-0"
                  />
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
                        <span className="capitalize">{listing.propertyType?.replace("_", " ")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transaction Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4 text-blue-600" />
                Transaction Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Buyer</p>
                  <p className="font-medium text-gray-900 dark:text-white">{buyer?.fullName || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Seller</p>
                  <p className="font-medium text-gray-900 dark:text-white">{seller?.fullName || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Sale Price</p>
                  <p className="font-medium text-gray-900 dark:text-white">${transaction.salePrice.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Inspection Status</p>
                  <Badge variant="outline" className="capitalize">{transaction.inspectionStatus.replace("_", " ")}</Badge>
                </div>
                {transaction.closingDate && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Closing Date</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {new Date(transaction.closingDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upload Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-purple-600" />
                Upload Inspection Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasReport ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">Report Submitted</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Your inspection report has been uploaded.</p>
                  </div>
                </div>
              ) : (
                <PortalUpload
                  token={token}
                  docType="inspection_report"
                  label="Upload Inspection Report (PDF or images)"
                  accept=".pdf,image/*"
                  multiple={true}
                  onUpload={() => setReportUploaded(true)}
                />
              )}
            </CardContent>
          </Card>

          {/* AI Analysis Notice */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="w-4 h-4 text-primary" />
                Automated Report Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <p className="text-sm">
                  When you upload the inspection report above, our AI will automatically:
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Read through the entire report and extract all findings
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Categorize each issue by severity (major, moderate, minor)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Estimate repair costs for each finding
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Generate recommendations for both buyer and seller
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  No manual entry needed — just upload the PDF and the AI handles the rest.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Chat */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <PortalChat token={token} proName={professional.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
