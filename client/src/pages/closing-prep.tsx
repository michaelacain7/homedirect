import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, CheckCircle2, Clock, FileText, Key, DollarSign,
  Shield, Home, AlertTriangle, Bot, Users, CalendarDays
} from "lucide-react";
import type { Transaction } from "@shared/schema";

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const BUYER_CHECKLIST = [
  { id: "b1", label: "Transfer utilities (electric, water, gas, internet)" },
  { id: "b2", label: "Set up USPS mail forwarding" },
  { id: "b3", label: "Change all locks" },
  { id: "b4", label: "Set up home security system" },
  { id: "b5", label: "File homestead exemption (Florida — saves on property taxes)" },
  { id: "b6", label: "Update address on driver's license and voter registration" },
  { id: "b7", label: "Keep all closing documents in a safe place" },
  { id: "b8", label: "Update address with employer, bank, and IRS" },
];

const SELLER_CHECKLIST = [
  { id: "s1", label: "Cancel homeowner's insurance (after closing date)" },
  { id: "s2", label: "Cancel utilities (after moving out)" },
  { id: "s3", label: "Set up USPS mail forwarding" },
  { id: "s4", label: "Keep copies of all closing documents for tax purposes" },
  { id: "s5", label: "Report sale to accountant (capital gains consideration)" },
  { id: "s6", label: "Funds typically arrive in 1-3 business days via wire" },
  { id: "s7", label: "Remove all personal property from home" },
  { id: "s8", label: "Leave all keys, remotes, and manuals for buyer" },
];

const BRING_ITEMS = [
  { icon: Shield, text: "Valid government-issued photo ID (driver's license or passport)" },
  { icon: DollarSign, text: "Cashier's check or wire confirmation (exact amount on Closing Disclosure)" },
  { icon: FileText, text: "Proof of homeowner's insurance (buyers only — binder from your insurer)" },
  { icon: FileText, text: "Any power of attorney documents (if applicable)" },
  { icon: CheckCircle2, text: "Certified funds — personal checks are NOT accepted" },
];

const TIMELINE = [
  { time: "−15 min", desc: "Arrive early and review your ID and documents" },
  { time: "0:00", desc: "Meet title company representative and notary" },
  { time: "0:15", desc: "Review loan documents and disclosures (buyers)" },
  { time: "0:45", desc: "Sign all closing documents (50–100+ pages)" },
  { time: "1:30", desc: "Fund verification and recording with county" },
  { time: "2:00", desc: "Key exchange (buyers) or fund disbursement confirmation (sellers)" },
];

export default function ClosingPrep() {
  const [, params] = useRoute("/transaction/:id/closing-prep");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const txnId = params?.id;

  const { data: txn } = useQuery<Transaction>({
    queryKey: ["/api/transactions", txnId],
    queryFn: () => apiRequest("GET", `/api/transactions/${txnId}`).then(r => r.json()),
    enabled: !!txnId,
  });

  const [buyerChecked, setBuyerChecked] = useState<Record<string, boolean>>({});
  const [sellerChecked, setSellerChecked] = useState<Record<string, boolean>>({});

  const isBuyer = txn ? user?.id === txn.buyerId : true;
  const isSeller = txn ? user?.id === txn.sellerId : false;
  const checklist = isSeller ? SELLER_CHECKLIST : BUYER_CHECKLIST;
  const checked = isSeller ? sellerChecked : buyerChecked;
  const setChecked = isSeller ? setSellerChecked : setBuyerChecked;

  const daysToClose = txn?.closingDate
    ? Math.max(0, Math.ceil((new Date(txn.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6" data-testid="page-closing-prep">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/transaction/${txnId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-green-50 border border-green-200">
            <Key className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Closing Day Preparation</h1>
            <p className="text-xs text-muted-foreground">Everything you need to know before closing</p>
          </div>
        </div>
      </div>

      {/* Closing Date Alert */}
      {txn?.closingDate && (
        <Card className={`mb-6 ${daysToClose !== null && daysToClose <= 7 ? "border-amber-300 bg-amber-50/50" : "border-green-200 bg-green-50/50"}`}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className={`h-6 w-6 ${daysToClose !== null && daysToClose <= 7 ? "text-amber-600" : "text-green-600"}`} />
              <div>
                <p className="font-semibold">{formatDate(txn.closingDate)}</p>
                <p className="text-sm text-muted-foreground">Scheduled Closing Date</p>
              </div>
            </div>
            {daysToClose !== null && (
              <Badge className={daysToClose <= 3 ? "bg-red-100 text-red-700 text-sm px-3 py-1" : daysToClose <= 7 ? "bg-amber-100 text-amber-700 text-sm px-3 py-1" : "bg-green-100 text-green-700 text-sm px-3 py-1"}>
                {daysToClose === 0 ? "Closing Today!" : `${daysToClose} days away`}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Summary */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Bot className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm mb-1">AI has prepared all your documents</p>
              <p className="text-sm text-muted-foreground">
                Your closing documents have been prepared and coordinated with the title company.
                The HomeDirectAI platform has handled all paperwork — you just need to review and sign.
                {txn && ` Sale price: ${formatPrice(txn.salePrice)} · Platform fee: ${formatPrice(txn.platformFee)}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* What to Bring */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              What to Bring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {BRING_ITEMS.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <item.icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{item.text}</span>
              </div>
            ))}
            <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">
                  <strong>Wire Fraud Warning:</strong> Always call the title company directly
                  using their official website number to verify wire instructions.
                  Never wire funds based solely on email instructions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What to Expect */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              What to Expect
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
              <p>The closing typically takes <strong>1–2 hours</strong> from start to finish</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
              <p>You'll review and sign <strong>50–100+ pages</strong> of documents — all prepared by AI</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
              <p>A notary and title company representative will be present</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</div>
              <p>Read each document before signing — ask questions at any time</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">5</div>
              {isBuyer ? (
                <p>Keys are transferred to you after all documents are signed and funds verified</p>
              ) : (
                <p>Funds are disbursed to your account within <strong>1–3 business days</strong></p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Day-Of Timeline */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Day-Of Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
            <div className="space-y-4">
              {TIMELINE.map((step, i) => (
                <div key={i} className="flex items-start gap-4 pl-2">
                  <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{step.time}</span>
                      <span className="text-sm">{step.desc}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Post-Closing Checklist */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {isSeller ? <Home className="h-4 w-4 text-primary" /> : <Key className="h-4 w-4 text-primary" />}
            Post-Closing Checklist — {isSeller ? "Seller" : "Buyer"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checklist.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <Checkbox
                  id={item.id}
                  checked={!!checked[item.id]}
                  onCheckedChange={v => setChecked(prev => ({ ...prev, [item.id]: !!v }))}
                />
                <Label
                  htmlFor={item.id}
                  className={`text-sm cursor-pointer leading-relaxed ${checked[item.id] ? "line-through text-muted-foreground" : ""}`}
                >
                  {item.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-primary/10 text-xs text-muted-foreground">
            {Object.values(checked).filter(Boolean).length} of {checklist.length} tasks completed
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => setLocation(`/transaction/${txnId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Transaction
        </Button>
        {txn?.closingDate && (
          <p className="text-xs text-muted-foreground self-center">
            Closing: {formatDate(txn.closingDate)}
          </p>
        )}
      </div>
    </div>
  );
}
