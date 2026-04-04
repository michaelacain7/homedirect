import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, FileText, Download, PenLine,
  Home, Shield, Search, Eye, Key, AlertTriangle, RefreshCw
} from "lucide-react";
import type { Transaction, Document as Doc, Listing, Offer } from "@shared/schema";

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

type StepStatus = "not_started" | "in_progress" | "completed" | "opened" | "funded" | "disbursed" | "ordered" | "clear" | "issues";

interface PipelineStep {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  fieldKey: keyof Transaction;
  nextStatus: string;
  nextLabel: string;
  completedStatus: string[];
}

const STEPS: PipelineStep[] = [
  {
    key: "escrow",
    label: "Escrow",
    description: "Funds held securely in escrow account",
    icon: <Shield className="h-4 w-4" />,
    fieldKey: "escrowStatus",
    nextStatus: "opened",
    nextLabel: "Open Escrow",
    completedStatus: ["opened", "funded", "disbursed"],
  },
  {
    key: "inspection",
    label: "Inspection",
    description: "Property inspection by licensed inspector",
    icon: <Search className="h-4 w-4" />,
    fieldKey: "inspectionStatus",
    nextStatus: "in_progress",
    nextLabel: "Start Inspection",
    completedStatus: ["completed"],
  },
  {
    key: "appraisal",
    label: "Appraisal",
    description: "Property appraisal for fair market value",
    icon: <Home className="h-4 w-4" />,
    fieldKey: "appraisalStatus",
    nextStatus: "in_progress",
    nextLabel: "Order Appraisal",
    completedStatus: ["completed"],
  },
  {
    key: "title",
    label: "Title Search",
    description: "Title search to verify clear ownership",
    icon: <FileText className="h-4 w-4" />,
    fieldKey: "titleStatus",
    nextStatus: "ordered",
    nextLabel: "Order Title Search",
    completedStatus: ["clear"],
  },
  {
    key: "walkthrough",
    label: "Final Walkthrough",
    description: "Buyer final walkthrough before closing",
    icon: <Eye className="h-4 w-4" />,
    fieldKey: "inspectionStatus",
    nextStatus: "completed",
    nextLabel: "Mark Complete",
    completedStatus: ["completed"],
  },
  {
    key: "closing",
    label: "Closing",
    description: "Sign documents and transfer funds",
    icon: <Key className="h-4 w-4" />,
    fieldKey: "status",
    nextStatus: "completed",
    nextLabel: "Mark Closed",
    completedStatus: ["completed"],
  },
];

function getStepState(step: PipelineStep, txn: Transaction): "completed" | "in_progress" | "not_started" {
  const val = txn[step.fieldKey] as string;
  if (step.completedStatus.includes(val)) return "completed";
  if (val && val !== "not_started" && val !== "in_progress") return "in_progress";
  if (val === "in_progress") return "in_progress";
  return "not_started";
}

// Sign Document Dialog
function SignDocumentDialog({
  doc,
  open,
  onClose,
  onSigned,
}: {
  doc: Doc;
  open: boolean;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const { toast } = useToast();

  const sign = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/documents/${doc.id}/sign`, { signatureName: name });
      if (!res.ok) throw new Error((await res.json()).message || "Sign failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document signed", description: "Your signature has been recorded." });
      onSigned();
      onClose();
      setName("");
      setAgreed(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign: {doc.name}</DialogTitle>
          <DialogDescription>
            Review and provide your electronic signature below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Document Summary</p>
            <p>Type: {doc.type}</p>
            <p>Status: {doc.status}</p>
            <p>Created: {doc.createdAt?.split("T")[0]}</p>
            {doc.content && (
              <a
                href={doc.content}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1 text-primary hover:underline"
              >
                <Download className="h-3 w-3" /> View PDF
              </a>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-name">Full Legal Name (as signature)</Label>
            <Input
              id="sig-name"
              placeholder="Type your full legal name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-muted-foreground">
              I, <strong>{name || "____"}</strong>, agree that typing my name above constitutes my legally binding
              electronic signature on this document.
            </span>
          </label>
          <Button
            className="w-full"
            disabled={!name.trim() || !agreed || sign.isPending}
            onClick={() => sign.mutate()}
          >
            {sign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
            Sign Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionPage() {
  const [, params] = useRoute("/transaction/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [signingDoc, setSigningDoc] = useState<Doc | null>(null);

  const { data: txn, isLoading } = useQuery<Transaction>({
    queryKey: ["/api/transactions", params?.id],
    queryFn: () => apiRequest("GET", `/api/transactions/${params?.id}`).then((r) => r.json()),
    enabled: !!params?.id,
    refetchInterval: 10000,
  });

  const { data: listing } = useQuery<Listing>({
    queryKey: ["/api/listings", txn?.listingId],
    queryFn: () => apiRequest("GET", `/api/listings/${txn?.listingId}`).then((r) => r.json()),
    enabled: !!txn?.listingId,
  });

  const { data: offer } = useQuery<Offer>({
    queryKey: ["/api/offers", txn?.offerId],
    queryFn: () => apiRequest("GET", `/api/offers/${txn?.offerId}`).then((r) => r.json()),
    enabled: !!txn?.offerId,
  });

  const { data: documents = [] } = useQuery<Doc[]>({
    queryKey: ["/api/documents/offer", txn?.offerId],
    queryFn: () => apiRequest("GET", `/api/documents/offer/${txn?.offerId}`).then((r) => r.json()),
    enabled: !!txn?.offerId,
  });

  const advanceStep = useMutation({
    mutationFn: async ({ step, status }: { step: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/transactions/${txn?.id}/step`, { step, status });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update step");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", params?.id] });
      toast({ title: "Step updated", description: "Transaction progress has been updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm">Please sign in to view this transaction.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
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
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Transaction not found</h2>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isBuyer = user.id === txn.buyerId;
  const isSeller = user.id === txn.sellerId;

  // Build pipeline: which steps are done/active
  // We'll track the first non-completed step as "active"
  const stepStates = STEPS.map((s) => ({ step: s, state: getStepState(s, txn) }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6" data-testid="page-transaction">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            Transaction #{txn.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {listing ? `${listing.address}, ${listing.city}, ${listing.state}` : `Listing #${txn.listingId}`}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`ml-auto ${txn.status === "completed" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
        >
          {txn.status}
        </Badge>
      </div>

      {/* Summary Card */}
      <Card className="mb-6 p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Sale Price</p>
            <p className="text-base font-semibold">{formatPrice(txn.salePrice)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Platform Fee</p>
            <p className="text-base font-semibold">{formatPrice(txn.platformFee)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Your Role</p>
            <p className="text-base font-semibold capitalize">{isBuyer ? "Buyer" : isSeller ? "Seller" : "Observer"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. Closing</p>
            <p className="text-base font-semibold">{txn.closingDate || "TBD"}</p>
          </div>
        </div>
      </Card>

      {/* Pipeline Stepper */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Transaction Pipeline</h2>
        <div className="space-y-3">
          {stepStates.map(({ step, state }, idx) => (
            <Card
              key={step.key}
              className={`p-4 transition-all ${
                state === "completed"
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
                  : state === "in_progress"
                  ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20"
                  : "opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      state === "completed"
                        ? "bg-green-500 text-white"
                        : state === "in_progress"
                        ? "bg-blue-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {state === "completed" ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{step.label}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          state === "completed"
                            ? "border-green-300 text-green-700"
                            : state === "in_progress"
                            ? "border-blue-300 text-blue-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        {state === "not_started" ? "Not started" : (txn[step.fieldKey] as string)?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {(isBuyer || isSeller) && state !== "completed" && (
                  <Button
                    size="sm"
                    variant={state === "in_progress" ? "default" : "outline"}
                    onClick={() =>
                      advanceStep.mutate({
                        step: step.fieldKey as string,
                        status: state === "in_progress" ? step.completedStatus[0] : step.nextStatus,
                      })
                    }
                    disabled={advanceStep.isPending}
                  >
                    {advanceStep.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : state === "in_progress" ? (
                      <>
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Mark Complete
                      </>
                    ) : (
                      step.nextLabel
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Documents Section */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Documents</h2>
        {documents.length === 0 ? (
          <Card className="p-6 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No documents yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const alreadySigned = (isBuyer && doc.signedByBuyer) || (isSeller && doc.signedBySeller);
              return (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              doc.status === "completed"
                                ? "border-green-300 text-green-700"
                                : doc.status === "pending_review"
                                ? "border-yellow-300 text-yellow-700"
                                : "text-muted-foreground"
                            }`}
                          >
                            {doc.status}
                          </Badge>
                          {doc.signedByBuyer && (
                            <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
                              Buyer signed
                            </Badge>
                          )}
                          {doc.signedBySeller && (
                            <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
                              Seller signed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.content && (
                        <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost">
                            <Download className="mr-1 h-3 w-3" /> PDF
                          </Button>
                        </a>
                      )}
                      {(isBuyer || isSeller) && !alreadySigned && doc.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSigningDoc(doc)}
                        >
                          <PenLine className="mr-1 h-3 w-3" /> Sign
                        </Button>
                      )}
                      {alreadySigned && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" /> Signed
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Offer link */}
      {offer && (
        <div className="mt-4">
          <Link href={`/negotiate/${offer.id}`}>
            <Button variant="ghost" size="sm" className="text-xs">
              <RefreshCw className="mr-1 h-3 w-3" /> View Negotiation Chat
            </Button>
          </Link>
        </div>
      )}

      {/* Sign document dialog */}
      {signingDoc && (
        <SignDocumentDialog
          doc={signingDoc}
          open={!!signingDoc}
          onClose={() => setSigningDoc(null)}
          onSigned={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/documents/offer", txn?.offerId] });
          }}
        />
      )}
    </div>
  );
}
