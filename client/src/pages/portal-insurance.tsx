import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Shield, CheckCircle2, Send, Bot, User,
  Loader2, AlertTriangle, Info, Home, DollarSign, FileText
} from "lucide-react";
import type { Transaction } from "@shared/schema";

type PortalMessage = { id: number; role: string; content: string; createdAt: string };

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

const INSURANCE_STEPS = ["Shop Quotes", "Select Policy", "Bind Coverage", "Policy Issued"];

function getInsuranceStep(hasBinder: boolean, hasPolicy: boolean): number {
  if (hasPolicy) return 3;
  if (hasBinder) return 2;
  return 0;
}

const COVERAGE_INFO = [
  { label: "Dwelling (Coverage A)", description: "Covers the structure of your home — walls, roof, foundation, built-in appliances." },
  { label: "Personal Property (Coverage C)", description: "Covers your belongings — furniture, electronics, clothing, appliances." },
  { label: "Liability (Coverage E)", description: "Protects you if someone is injured on your property or you cause damage to others." },
  { label: "Loss of Use (Coverage D)", description: "Covers additional living expenses if your home is uninhabitable after a covered loss." },
];

const POLICY_TIPS = [
  "Your lender requires proof of insurance before closing — typically an insurance binder.",
  "Dwelling coverage should be at least the replacement cost of your home (not the purchase price).",
  "Consider flood insurance even if not in a high-risk zone — standard policies don't cover flooding.",
  "Ask about bundling auto + home insurance for a multi-policy discount.",
  "A higher deductible lowers your premium but increases your out-of-pocket cost if you file a claim.",
];

export default function PortalInsurance() {
  const [, params] = useRoute("/transaction/:id/insurance");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [chatMessage, setChatMessage] = useState("");

  const txnId = params?.id;

  const { data: txn } = useQuery<Transaction>({
    queryKey: ["/api/transactions", txnId],
    queryFn: () => apiRequest("GET", `/api/transactions/${txnId}`).then((r) => r.json()),
    enabled: !!txnId,
  });

  const { data: messages = [], refetch: refetchMsgs } = useQuery<PortalMessage[]>({
    queryKey: ["/api/transactions", txnId, "portal-messages", "insurance"],
    queryFn: () => apiRequest("GET", `/api/transactions/${txnId}/portal-messages/insurance`).then((r) => r.json()),
    enabled: !!txnId && !!user,
  });

  const sendChat = useMutation({
    mutationFn: (msg: string) =>
      apiRequest("POST", `/api/transactions/${txnId}/portal-chat`, { portal: "insurance", message: msg }).then((r) => r.json()),
    onSuccess: () => { refetchMsgs(); setChatMessage(""); },
    onError: () => toast({ title: "Error", description: "Failed to send message", variant: "destructive" }),
  });

  const handleSendChat = () => {
    const msg = chatMessage.trim();
    if (!msg) return;
    sendChat.mutate(msg);
  };

  if (!txn) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const salePrice = txn.salePrice;
  // Estimate insurance costs
  const estimatedAnnual = Math.round(salePrice * 0.005);
  const estimatedMonthly = Math.round(estimatedAnnual / 12);
  const recommendedDwelling = Math.round(salePrice * 0.9); // replacement cost estimate
  const recommendedPersonalProperty = Math.round(recommendedDwelling * 0.5);
  const recommendedLiability = 300000;

  // Mock: assume binder uploaded, policy not yet issued
  const hasBinder = true;
  const hasPolicy = false;
  const currentStep = getInsuranceStep(hasBinder, hasPolicy);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6" data-testid="portal-insurance">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/transaction/${txnId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-50 border border-cyan-200">
            <Shield className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Insurance Portal</h1>
            <p className="text-xs text-muted-foreground">Homeowner's insurance status, coverage, and tips</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Status Tracker */}
        <Card style={{ borderRadius: "14px" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Insurance Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative flex items-center justify-between">
              <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-muted" />
              <div
                className="absolute top-3.5 left-0 h-0.5 transition-all"
                style={{
                  backgroundColor: "hsl(160, 60%, 28%)",
                  width: `${(currentStep / (INSURANCE_STEPS.length - 1)) * 100}%`,
                }}
              />
              {INSURANCE_STEPS.map((step, idx) => {
                const complete = idx <= currentStep;
                return (
                  <div key={step} className="relative flex flex-col items-center gap-2 z-10">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white ${
                        complete ? "text-white" : "bg-muted text-muted-foreground"
                      }`}
                      style={complete ? { backgroundColor: "hsl(160, 60%, 28%)" } : {}}
                    >
                      {complete ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <span
                      className={`text-[10px] font-medium text-center max-w-[70px] leading-tight ${complete ? "text-primary" : "text-muted-foreground"}`}
                      style={complete ? { color: "hsl(160, 60%, 28%)" } : {}}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Binder Status Banner */}
        {hasBinder && !hasPolicy && (
          <Card
            style={{ borderRadius: "14px" }}
            className="border-2 border-amber-200 bg-amber-50/50"
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-amber-100">
                  <FileText className="h-6 w-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-amber-800">Insurance Binder Received</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Your insurance binder has been submitted to the lender. The full policy will be issued after closing.
                    Make sure your effective date matches or precedes your closing date.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPolicy && (
          <Card
            style={{ borderRadius: "14px" }}
            className="border-2 border-emerald-200 bg-emerald-50/50"
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-emerald-100">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-emerald-800">Insurance Policy Issued</p>
                  <p className="text-sm text-emerald-700 mt-1">
                    Your homeowner's insurance policy is active. Keep a copy of your declarations page for your records.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Estimated Costs */}
          <Card style={{ borderRadius: "14px" }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Estimated Insurance Costs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Purchase Price</span>
                <span className="font-medium">{formatPrice(salePrice)}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Est. Annual Premium</span>
                <span className="font-semibold">{formatPrice(estimatedAnnual)}/yr</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Est. Monthly (in escrow)</span>
                <span className="font-semibold" style={{ color: "hsl(160, 60%, 28%)" }}>{formatPrice(estimatedMonthly)}/mo</span>
              </div>
              <div className="mt-2 p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  This is an AI estimate based on ~0.5% of purchase price. Actual premiums vary based on location,
                  coverage, deductible, claims history, and property condition.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Recommended Coverage */}
          <Card style={{ borderRadius: "14px" }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-cyan-600" />
                Recommended Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Dwelling (Coverage A)</span>
                <span className="font-medium">{formatPrice(recommendedDwelling)}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Personal Property (C)</span>
                <span className="font-medium">{formatPrice(recommendedPersonalProperty)}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Liability (E)</span>
                <span className="font-medium">{formatPrice(recommendedLiability)}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-muted/40">
                <span className="text-muted-foreground">Deductible</span>
                <span className="font-medium">$2,500</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coverage Breakdown */}
        <Card style={{ borderRadius: "14px" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What Does Homeowner's Insurance Cover?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COVERAGE_INFO.map((item) => (
                <div key={item.label} className="p-3 rounded-xl border border-border">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card style={{ borderRadius: "14px" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Important Tips
              </CardTitle>
              <div className="flex items-center gap-1">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">AI guidance</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {POLICY_TIPS.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40">
                  <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-700 dark:text-gray-300">{tip}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Chat */}
        <Card style={{ borderRadius: "14px" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Ask about Insurance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Ask about homeowner's insurance, coverage types, flood insurance, or how to lower your premium.
                </p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${msg.role === "ai" ? "bg-primary/10" : "bg-muted"}`}>
                    {msg.role === "ai" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div
                    className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.role === "ai" ? "bg-muted" : "text-white"}`}
                    style={msg.role === "user" ? { backgroundColor: "hsl(160, 60%, 28%)" } : {}}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ask about coverage, deductibles, flood insurance, bundling..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                disabled={sendChat.isPending}
              />
              <Button
                size="icon"
                onClick={handleSendChat}
                disabled={sendChat.isPending || !chatMessage.trim()}
                style={{ backgroundColor: "hsl(160, 60%, 28%)" }}
              >
                {sendChat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
