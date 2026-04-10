import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, Clock, AlertCircle, Circle,
  Search, Shield, Building2, BarChart3, FileText, MessageSquare,
  Home, ChevronRight, Loader2, UserPlus, Users, X, Mail, Phone, Camera
} from "lucide-react";
import type { Transaction, Listing } from "@shared/schema";

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysInContract(createdAt: string | null | undefined) {
  if (!createdAt) return 0;
  const start = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysToClose(closingDate: string | null | undefined) {
  if (!closingDate) return 30;
  const closing = new Date(closingDate);
  const now = new Date();
  return Math.max(0, Math.ceil((closing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

type ChecklistItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  dueDate: string | null;
  order: number;
};

function statusBadge(status: string, dueDate?: string | null) {
  const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== "completed";
  if (isOverdue) return <Badge className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">In Progress</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
}

const PORTAL_CARDS = [
  {
    key: "inspection",
    icon: Search,
    title: "Inspection Portal",
    description: "Upload and analyze inspection report",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    roles: ["buyer", "seller"],
  },
  {
    key: "escrow",
    icon: Shield,
    title: "Escrow & Closing",
    description: "Wire instructions, closing documents",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    roles: ["buyer", "seller"],
  },
  {
    key: "lender",
    icon: Building2,
    title: "Lender Portal",
    description: "Mortgage info, pre-approval, rate comparison",
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    roles: ["buyer"],
  },
  {
    key: "appraisal",
    icon: BarChart3,
    title: "Appraisal Portal",
    description: "Valuation report and analysis",
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    roles: ["buyer", "seller"],
  },
  {
    key: "title",
    icon: FileText,
    title: "Title Company",
    description: "Document requests, title search status",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    roles: ["buyer"],
  },
  {
    key: "insurance",
    icon: Shield,
    title: "Insurance Portal",
    description: "Homeowner's insurance coverage and policy",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    roles: ["buyer"],
  },
];

function getPortalStatus(txn: Transaction, portalKey: string): "not_started" | "in_progress" | "complete" {
  switch (portalKey) {
    case "inspection":
      return txn.inspectionStatus === "completed" ? "complete"
        : txn.inspectionStatus && txn.inspectionStatus !== "not_started" ? "in_progress"
        : "not_started";
    case "escrow":
      return txn.escrowStatus === "disbursed" ? "complete"
        : txn.escrowStatus && txn.escrowStatus !== "not_started" ? "in_progress"
        : "not_started";
    case "title":
      return txn.titleStatus === "clear" ? "complete"
        : txn.titleStatus && txn.titleStatus !== "not_started" ? "in_progress"
        : "not_started";
    case "appraisal":
      return txn.appraisalStatus === "completed" ? "complete"
        : txn.appraisalStatus && txn.appraisalStatus !== "not_started" ? "in_progress"
        : "not_started";
    case "lender":
    case "insurance":
      return "in_progress";
    default:
      return "not_started";
  }
}

function PortalStatusBadge({ status }: { status: "not_started" | "in_progress" | "complete" }) {
  if (status === "complete") return <Badge className="bg-emerald-100 text-emerald-700 text-xs">Complete</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-100 text-amber-700 text-xs">In Progress</Badge>;
  return <Badge variant="outline" className="text-muted-foreground text-xs">Not Started</Badge>;
}

const PRO_TYPES = [
  { value: "inspector", label: "Inspector", icon: Search, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { value: "appraiser", label: "Appraiser", icon: BarChart3, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  { value: "lender", label: "Lender", icon: Building2, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { value: "title", label: "Title Company", icon: FileText, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
  { value: "photographer", label: "Photographer", icon: Camera, color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200" },
  { value: "insurer", label: "Home Insurer", icon: Shield, color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
];

interface ProfessionalAccessRecord {
  id: number;
  type: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  status: string;
  accessToken: string;
  createdAt: string | null;
}

function InviteProfessionalSection({ txnId, userRole }: { txnId: number; userRole?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openType, setOpenType] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });

  const { data: professionals = [] } = useQuery<ProfessionalAccessRecord[]>({
    queryKey: ["/api/transactions", txnId, "professionals"],
    queryFn: () => apiRequest("GET", `/api/transactions/${txnId}/professionals`).then(r => r.json()),
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { type: string; name: string; company: string; email: string; phone: string }) =>
      apiRequest("POST", `/api/transactions/${txnId}/invite-professional`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/transactions", txnId, "professionals"] });
      setOpenType(null);
      setForm({ name: "", company: "", email: "", phone: "" });
      toast({ title: "Invitation Sent", description: "The professional will receive an email with their portal link." });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to send invitation.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (proId: number) =>
      apiRequest("DELETE", `/api/transactions/${txnId}/professionals/${proId}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/transactions", txnId, "professionals"] });
      toast({ title: "Access Revoked" });
    },
  });

  const handleInvite = (type: string) => {
    if (!form.name || !form.email) {
      toast({ title: "Missing fields", description: "Name and email are required.", variant: "destructive" });
      return;
    }
    inviteMutation.mutate({ type, ...form });
  };

  const getPros = (type: string) => professionals.filter(p => p.type === type && p.status !== "revoked");

  const statusBadge = (s: string) => {
    if (s === "active") return <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>;
    if (s === "completed") return <Badge className="bg-blue-100 text-blue-700 text-xs">Completed</Badge>;
    if (s === "invited") return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Invited</Badge>;
    return <Badge variant="outline" className="text-xs">{s}</Badge>;
  };

  const [showProfessionals, setShowProfessionals] = useState(false);
  const invitedCount = professionals.filter(p => p.status !== "revoked").length;

  return (
    <div className="mt-6">
      <button
        onClick={() => setShowProfessionals(!showProfessionals)}
        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Invite Professionals</span>
          {invitedCount > 0 && (
            <Badge variant="secondary" className="text-xs">{invitedCount} invited</Badge>
          )}
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showProfessionals ? "rotate-90" : ""}`} />
      </button>
      {showProfessionals && (
      <>
      <p className="text-xs text-muted-foreground mt-3 mb-4">
        Give third-party professionals secure, login-free access to collaborate on this transaction.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PRO_TYPES.filter(p => p.value !== "photographer" || userRole === "seller" || userRole === "admin").map(({ value, label, icon: Icon, color, bg, border }) => {
          const pros = getPros(value);
          const isOpen = openType === value;
          return (
            <Card
              key={value}
              className={`border transition-all ${isOpen ? "border-primary/50 shadow-md" : ""}`}
              style={{ borderRadius: "14px" }}
            >
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${bg} ${border} border`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    {pros.length > 0 && (
                      <p className="text-xs text-muted-foreground">{pros.length} invited</p>
                    )}
                  </div>
                  {!isOpen && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setOpenType(value); setForm({ name: "", company: "", email: "", phone: "" }); }}
                    >
                      <UserPlus className="h-3 w-3" /> Invite
                    </Button>
                  )}
                  {isOpen && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setOpenType(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Existing professionals */}
                {pros.length > 0 && (
                  <div className="space-y-2">
                    {pros.map(pro => (
                      <div
                        key={pro.id}
                        className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{pro.name}</p>
                          {pro.company && <p className="text-gray-500 truncate">{pro.company}</p>}
                          <div className="flex items-center gap-1.5 mt-1">
                            {statusBadge(pro.status)}
                            <a
                              href={`#/pro/${pro.accessToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              View Portal
                            </a>
                          </div>
                        </div>
                        <button
                          onClick={() => revokeMutation.mutate(pro.id)}
                          className="text-gray-400 hover:text-red-500 p-0.5 shrink-0"
                          title="Revoke access"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Invite Form */}
                {isOpen && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input
                        placeholder="Full name"
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Company</Label>
                      <Input
                        placeholder="Company name (optional)"
                        value={form.company}
                        onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email *</Label>
                      <Input
                        placeholder="professional@example.com"
                        type="email"
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone (optional)</Label>
                      <Input
                        placeholder="555-000-0000"
                        value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 gap-1"
                      onClick={() => handleInvite(value)}
                      disabled={inviteMutation.isPending}
                    >
                      {inviteMutation.isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</>
                      ) : (
                        <><Mail className="h-3 w-3" /> Send Invitation</>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

export default function TransactionHub() {
  const [, params] = useRoute("/transaction/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showChecklist, setShowChecklist] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);

  const { data: txn, isLoading } = useQuery<Transaction>({
    queryKey: ["/api/transactions", params?.id],
    queryFn: () => apiRequest("GET", `/api/transactions/${params?.id}`).then((r) => r.json()),
    enabled: !!params?.id,
    refetchInterval: 15000,
  });

  const { data: listing } = useQuery<Listing>({
    queryKey: ["/api/listings", txn?.listingId],
    queryFn: () => apiRequest("GET", `/api/listings/${txn?.listingId}`).then((r) => r.json()),
    enabled: !!txn?.listingId,
  });

  const { data: checklist = [], isLoading: checklistLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/transactions", params?.id, "checklist"],
    queryFn: () => apiRequest("GET", `/api/transactions/${params?.id}/checklist`).then((r) => r.json()),
    enabled: !!params?.id && !!user,
  });

  // Fetch transaction documents
  type DocRecord = { id: number; name: string; type: string; status: string; content: string | null; signedByBuyer: boolean; signedBySeller: boolean };
  const { data: documents = [] } = useQuery<DocRecord[]>({
    queryKey: ["/api/documents/listing", txn?.listingId],
    queryFn: () => apiRequest("GET", `/api/documents/listing/${txn?.listingId}`).then((r) => r.json()),
    enabled: !!txn?.listingId,
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: string }) =>
      apiRequest("PATCH", `/api/transactions/${params?.id}/checklist/${itemId}`, { status }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", params?.id, "checklist"] });
    },
  });

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">Please sign in to view this transaction.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-1/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Transaction not found</h2>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isBuyer = user.id === txn.buyerId;
  const isSeller = user.id === txn.sellerId;
  const daysInContract = getDaysInContract(txn.createdAt);
  const daysToClose = getDaysToClose(txn.closingDate);
  const totalDays = daysInContract + daysToClose || 30;
  const progressPct = Math.min(100, Math.round((daysInContract / totalDays) * 100));

  const completedItems = checklist.filter((i) => i.status === "completed").length;
  const checklistPct = checklist.length > 0 ? Math.round((completedItems / checklist.length) * 100) : 0;

  const listingImages: string[] = (() => {
    try { return JSON.parse(listing?.images || "[]"); } catch { return []; }
  })();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6" data-testid="page-transaction-hub">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">Closing Portal</h1>
            <Badge
              className={`${txn.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}
            >
              {txn.status === "in_progress" ? "Under Contract" : txn.status}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground text-xs">
              {isBuyer ? "Buyer" : isSeller ? "Seller" : "Observer"}
            </Badge>
          </div>
          {listing && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {listing.address}, {listing.city}, {listing.state} {listing.zip}
            </p>
          )}
        </div>
      </div>

      {/* Property + Status Card */}
      <Card className="mb-6 overflow-hidden border-0 shadow-md" style={{ borderRadius: "16px" }}>
        <div className="flex flex-col sm:flex-row">
          {/* Property Photo */}
          <div className="sm:w-48 h-36 sm:h-auto flex-shrink-0 bg-muted">
            {listingImages[0] ? (
              <img
                src={listingImages[0]}
                alt={listing?.address}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Home className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Stats */}
          <CardContent className="flex-1 p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sale Price</p>
                <p className="text-lg font-bold text-primary">{formatPrice(txn.salePrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Day in Contract</p>
                <p className="text-lg font-bold">Day {daysInContract}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Est. Closing</p>
                <p className="text-lg font-bold">{txn.closingDate ? formatDate(txn.closingDate) : "TBD"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Days to Close</p>
                <p className="text-lg font-bold">{daysToClose} days</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Timeline Progress</span>
                <span className="text-xs font-semibold" style={{ color: "hsl(160, 60%, 28%)" }}>
                  Day {daysInContract} of {totalDays}
                </span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Checklist — Collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowChecklist(!showChecklist)}
          className="w-full flex items-center justify-between p-4 rounded-xl border hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="text-left">
              <h2 className="text-sm font-semibold">Closing Checklist</h2>
              <p className="text-xs text-muted-foreground">
                {completedItems} of {checklist.length} complete ({checklistPct}%)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24">
              <Progress value={checklistPct} className="h-2" />
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showChecklist ? "rotate-90" : ""}`} />
          </div>
        </button>
        {showChecklist && <div className="mt-3">

        {checklistLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {checklist.map((item) => (
              <Card
                key={item.id}
                className={`p-4 transition-all cursor-pointer border ${
                  item.status === "completed"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : item.status === "in_progress"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-border hover:border-primary/30"
                }`}
                style={{ borderRadius: "12px" }}
              >
                <div className="flex items-start gap-3">
                  <button
                    className="mt-0.5 flex-shrink-0"
                    onClick={() =>
                      updateItem.mutate({
                        itemId: item.id,
                        status: item.status === "completed" ? "pending" : item.status === "pending" ? "in_progress" : "completed",
                      })
                    }
                    disabled={updateItem.isPending}
                  >
                    {item.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : item.status === "in_progress" ? (
                      <Clock className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                      >
                        {item.title}
                      </span>
                      {statusBadge(item.status, item.dueDate)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  {item.dueDate && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Due</p>
                      <p className="text-xs font-medium">{formatDate(item.dueDate)}</p>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        </div>}
      </div>

      {/* Documents Section */}
      {documents.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowDocuments(!showDocuments)}
            className="w-full flex items-center justify-between p-4 rounded-xl border hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h2 className="text-sm font-semibold">Transaction Documents</h2>
                <p className="text-xs text-muted-foreground">
                  {documents.filter(d => (isBuyer ? d.signedByBuyer : d.signedBySeller)).length} of {documents.length} signed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {documents.filter(d => !(isBuyer ? d.signedByBuyer : d.signedBySeller)).length} need signature
              </Badge>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showDocuments ? "rotate-90" : ""}`} />
            </div>
          </button>
          {showDocuments && (
            <div className="mt-3 space-y-2">
              {documents.map((doc) => {
                const mySigned = isBuyer ? doc.signedByBuyer : doc.signedBySeller;
                const otherSigned = isBuyer ? doc.signedBySeller : doc.signedByBuyer;
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      mySigned ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className={`h-4 w-4 flex-shrink-0 ${mySigned ? "text-emerald-600" : "text-amber-600"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[9px]">{doc.type}</Badge>
                          {mySigned ? (
                            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> You signed
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600">Needs your signature</span>
                          )}
                          {otherSigned && (
                            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> {isBuyer ? "Seller" : "Buyer"} signed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {doc.content && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => window.open(doc.content!, "_blank")}
                        >
                          View
                        </Button>
                      )}
                      {!mySigned && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={async () => {
                            try {
                              await apiRequest("POST", `/api/documents/${doc.id}/sign`, { role: isBuyer ? "buyer" : "seller" });
                              queryClient.invalidateQueries({ queryKey: ["/api/documents/listing", txn?.listingId] });
                            } catch {}
                          }}
                        >
                          Sign
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Portal Cards */}
      <div>
        <h2 className="text-base font-semibold mb-3">Your Transaction Portals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PORTAL_CARDS
            .filter((portal) => {
              const role = isBuyer ? "buyer" : "seller";
              return portal.roles.includes(role);
            })
            .map((portal) => {
            const Icon = portal.icon;
            const status = getPortalStatus(txn, portal.key);
            const href = `/transaction/${params?.id}/${portal.key}`;

            return (
              <Card
                key={portal.key}
                className="p-4 cursor-pointer border hover:shadow-md transition-all group"
                style={{ borderRadius: "16px" }}
                onClick={() => setLocation(href)}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl ${portal.bg} ${portal.border} border flex-shrink-0`}>
                    <Icon className={`h-5 w-5 ${portal.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-sm font-semibold leading-tight">{portal.title}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{portal.description}</p>
                    <div className="mt-2">
                      <PortalStatusBadge status={status} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Invite Professionals */}
      {(isBuyer || isSeller) && (
        <InviteProfessionalSection txnId={txn.id} userRole={user?.role} />
      )}

      {/* Closing Prep Banner — shown when closing is within 7 days */}
      {daysToClose <= 7 && (
        <div className="mt-6">
          <Card
            className="p-5 cursor-pointer border-green-300 bg-green-50/50 hover:shadow-md transition-all"
            style={{ borderRadius: "16px" }}
            onClick={() => setLocation(`/transaction/${params?.id}/closing-prep`)}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100 border border-green-300">
                <Home className="h-6 w-6 text-green-700" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-green-800">Closing Day Preparation</h3>
                  <Badge className="bg-red-100 text-red-700 text-xs">{daysToClose === 0 ? "Today!" : `${daysToClose} days`}</Badge>
                </div>
                <p className="text-xs text-green-700 mt-0.5">
                  Your closing is coming up! Review what to bring, what to expect, and your post-closing checklist.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-green-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Platform fee info */}
      <div className="mt-6 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">HomeDirectAI Platform Fee</p>
            <p className="text-xs text-muted-foreground">
              {formatPrice(txn.platformFee)} (1% of sale price) — saving you {formatPrice(txn.salePrice * 0.05)} vs. traditional agents
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
