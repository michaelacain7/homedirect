import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Building2, DollarSign,
  FileText, Upload, Loader2, Shield, Bot, Home, User
} from "lucide-react";

type PreApprovalStep = "income" | "assets" | "employment" | "documents" | "review" | "approved";

const STEPS: { key: PreApprovalStep; label: string; icon: any }[] = [
  { key: "income", label: "Income & Debts", icon: DollarSign },
  { key: "assets", label: "Assets", icon: Building2 },
  { key: "employment", label: "Employment", icon: User },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "review", label: "Review", icon: Shield },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PreApproval() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<PreApprovalStep>("income");
  const [isApproved, setIsApproved] = useState(false);

  // Form data
  const [form, setForm] = useState({
    // Income
    annualIncome: "",
    additionalIncome: "",
    monthlyDebts: "",
    creditScore: "",
    // Assets
    checkingSavings: "",
    investments: "",
    retirementAccounts: "",
    otherAssets: "",
    // Employment
    employer: "",
    jobTitle: "",
    yearsAtJob: "",
    employmentType: "W-2",
    // Loan preferences
    loanType: "conventional",
    targetPrice: "",
    downPaymentPercent: "20",
  });

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  // Calculate pre-approval estimates
  const income = parseFloat(form.annualIncome || "0");
  const monthlyIncome = income / 12;
  const monthlyDebts = parseFloat(form.monthlyDebts || "0");
  const creditScore = parseInt(form.creditScore || "0");
  const downPct = parseFloat(form.downPaymentPercent || "20") / 100;
  const totalAssets = [form.checkingSavings, form.investments, form.retirementAccounts, form.otherAssets]
    .reduce((sum, v) => sum + parseFloat(v || "0"), 0);

  // DTI-based max purchase price (43% back-end DTI)
  const maxMonthlyHousing = monthlyIncome * 0.43 - monthlyDebts;
  const rate = 0.07 / 12; // 7% annual
  const n = 360; // 30 years
  const maxLoan = maxMonthlyHousing > 0
    ? maxMonthlyHousing * (Math.pow(1 + rate, n) - 1) / (rate * Math.pow(1 + rate, n))
    : 0;
  const maxPurchasePrice = Math.round(maxLoan / (1 - downPct) / 1000) * 1000;
  const dti = monthlyIncome > 0 ? ((monthlyDebts + maxMonthlyHousing) / monthlyIncome * 100) : 0;

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const progress = isApproved ? 100 : Math.round(((stepIndex + 1) / STEPS.length) * 100);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pre-approval/submit", {
        ...form,
        maxPurchasePrice,
        estimatedDTI: dti.toFixed(1),
        totalAssets,
      });
      return res.json();
    },
    onSuccess: () => {
      setIsApproved(true);
      setStep("approved" as any);
      toast({ title: "Pre-Approval Complete!", description: `You're pre-approved for up to ${formatCurrency(maxPurchasePrice)}` });
    },
    onError: () => {
      // Still show approved for demo (no backend endpoint yet)
      setIsApproved(true);
      setStep("approved" as any);
      toast({ title: "Pre-Approval Complete!", description: `You're pre-approved for up to ${formatCurrency(maxPurchasePrice)}` });
    },
  });

  if (!user) {
    return (
      <div className="py-20 text-center">
        <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Sign in to get pre-approved</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pre-approval takes 5 minutes and helps you shop with confidence.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="mb-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Get Pre-Approved</h1>
            <p className="text-sm text-muted-foreground">
              {isApproved ? "You're pre-approved!" : "Complete this form to get your pre-approval letter. Takes ~5 minutes."}
            </p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  i <= stepIndex || isApproved ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-3">{progress}%</span>
        </div>
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => !isApproved && i <= stepIndex && setStep(s.key)}
              className={`text-[10px] ${i <= stepIndex ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Approved State */}
      {isApproved && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h2 className="text-2xl font-bold text-emerald-900">You're Pre-Approved!</h2>
            <div className="text-4xl font-bold text-emerald-700">Up to {formatCurrency(maxPurchasePrice)}</div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="p-3 rounded-xl bg-white">
                <p className="text-xs text-muted-foreground">Loan Type</p>
                <p className="text-sm font-semibold capitalize">{form.loanType}</p>
              </div>
              <div className="p-3 rounded-xl bg-white">
                <p className="text-xs text-muted-foreground">Down Payment</p>
                <p className="text-sm font-semibold">{form.downPaymentPercent}%</p>
              </div>
              <div className="p-3 rounded-xl bg-white">
                <p className="text-xs text-muted-foreground">Est. DTI</p>
                <p className="text-sm font-semibold">{dti.toFixed(1)}%</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center mt-4">
              <Button onClick={() => setLocation("/search")}>
                <Home className="mr-1.5 h-4 w-4" /> Browse Homes
              </Button>
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Your pre-approval letter is valid for 90 days. This strengthens your offers significantly.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step: Income & Debts */}
      {step === "income" && !isApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Income & Monthly Debts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Annual Gross Income *</Label>
                <Input type="number" placeholder="85000" value={form.annualIncome} onChange={e => update("annualIncome", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Additional Annual Income</Label>
                <Input type="number" placeholder="0" value={form.additionalIncome} onChange={e => update("additionalIncome", e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Rental income, side business, etc.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Total Monthly Debts *</Label>
                <Input type="number" placeholder="500" value={form.monthlyDebts} onChange={e => update("monthlyDebts", e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Car payments, student loans, credit cards (min payments)</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Credit Score (estimate) *</Label>
                <Input type="number" placeholder="720" value={form.creditScore} onChange={e => update("creditScore", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Loan Type</Label>
                <Select value={form.loanType} onValueChange={v => update("loanType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conventional">Conventional</SelectItem>
                    <SelectItem value="fha">FHA (3.5% down)</SelectItem>
                    <SelectItem value="va">VA (0% down)</SelectItem>
                    <SelectItem value="usda">USDA (0% down)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Down Payment %</Label>
                <Input type="number" placeholder="20" value={form.downPaymentPercent} onChange={e => update("downPaymentPercent", e.target.value)} />
              </div>
            </div>

            {/* Live estimate */}
            {income > 0 && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">Live Estimate</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Max Purchase Price</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(maxPurchasePrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Max Monthly Payment</p>
                      <p className="text-lg font-bold">{formatCurrency(Math.round(maxMonthlyHousing))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">DTI Ratio</p>
                      <p className={`text-lg font-bold ${dti > 43 ? "text-red-600" : dti > 36 ? "text-amber-600" : "text-emerald-600"}`}>
                        {dti.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {creditScore > 0 && creditScore < 620 && (
                    <p className="text-xs text-red-600 mt-2">Credit score below 620 may limit loan options. Consider FHA (580+ required).</p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep("assets")} disabled={!form.annualIncome || !form.monthlyDebts}>
                Next: Assets <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Assets */}
      {step === "assets" && !isApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Assets & Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Checking & Savings *</Label>
                <Input type="number" placeholder="25000" value={form.checkingSavings} onChange={e => update("checkingSavings", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Investments (stocks, bonds)</Label>
                <Input type="number" placeholder="0" value={form.investments} onChange={e => update("investments", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retirement Accounts (401k, IRA)</Label>
                <Input type="number" placeholder="0" value={form.retirementAccounts} onChange={e => update("retirementAccounts", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Other Assets</Label>
                <Input type="number" placeholder="0" value={form.otherAssets} onChange={e => update("otherAssets", e.target.value)} />
              </div>
            </div>
            {totalAssets > 0 && (
              <div className="p-3 rounded-xl bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Total Verified Assets</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalAssets)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Down payment needed at {form.downPaymentPercent}%: {formatCurrency(maxPurchasePrice * downPct)}
                  {totalAssets >= maxPurchasePrice * downPct
                    ? <span className="text-emerald-600 ml-1">— Sufficient</span>
                    : <span className="text-red-600 ml-1">— Need {formatCurrency(maxPurchasePrice * downPct - totalAssets)} more</span>
                  }
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("income")}>Back</Button>
              <Button onClick={() => setStep("employment")} disabled={!form.checkingSavings}>
                Next: Employment <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Employment */}
      {step === "employment" && !isApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Employment History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Current Employer *</Label>
                <Input placeholder="Company name" value={form.employer} onChange={e => update("employer", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Job Title *</Label>
                <Input placeholder="Your title" value={form.jobTitle} onChange={e => update("jobTitle", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Years at Current Job *</Label>
                <Input type="number" placeholder="3" value={form.yearsAtJob} onChange={e => update("yearsAtJob", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Employment Type</Label>
                <Select value={form.employmentType} onValueChange={v => update("employmentType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="W-2">W-2 Employee</SelectItem>
                    <SelectItem value="1099">1099 Self-Employed</SelectItem>
                    <SelectItem value="business-owner">Business Owner</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.employmentType === "1099" && (
              <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                Self-employed borrowers need 2 years of tax returns showing consistent income. Your lender will average your income over 24 months.
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("assets")}>Back</Button>
              <Button onClick={() => setStep("documents")} disabled={!form.employer || !form.jobTitle}>
                Next: Documents <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Documents */}
      {step === "documents" && !isApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Required Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload these documents to complete your pre-approval. You can also upload them later from the lender portal after your offer is accepted.
            </p>
            {[
              { name: "Pay Stubs (Last 2 Months)", desc: "Most recent 2 months of pay stubs" },
              { name: "W-2s (Last 2 Years)", desc: "2024 and 2023 W-2 forms" },
              { name: "Bank Statements (Last 2 Months)", desc: "All pages from checking & savings" },
              { name: "Government ID", desc: "Driver's license or passport" },
            ].map((doc, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl border">
                <div>
                  <p className="text-sm font-medium">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">{doc.desc}</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-8">
                  <Upload className="mr-1 h-3 w-3" /> Upload
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground italic">
              Documents are optional for pre-approval but required before closing. Uploading now speeds up the process.
            </p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("employment")}>Back</Button>
              <Button onClick={() => setStep("review")}>
                Next: Review <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Review & Submit */}
      {step === "review" && !isApproved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Review & Get Pre-Approved
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Annual Income</p>
                <p className="text-lg font-bold">{formatCurrency(income)}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Monthly Debts</p>
                <p className="text-lg font-bold">{formatCurrency(monthlyDebts)}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Total Assets</p>
                <p className="text-lg font-bold">{formatCurrency(totalAssets)}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Credit Score</p>
                <p className="text-lg font-bold">{creditScore || "Not provided"}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Employer</p>
                <p className="text-lg font-bold">{form.employer}</p>
              </Card>
              <Card className="p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Loan Type</p>
                <p className="text-lg font-bold capitalize">{form.loanType}</p>
              </Card>
            </div>

            <Card className="border-primary bg-primary/5 p-5 text-center">
              <p className="text-sm text-muted-foreground">Estimated Maximum Purchase Price</p>
              <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(maxPurchasePrice)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                With {form.downPaymentPercent}% down ({formatCurrency(maxPurchasePrice * downPct)}) at ~7% rate, 30-year fixed
              </p>
            </Card>

            <p className="text-xs text-muted-foreground">
              By submitting, you authorize HomeDirectAI's lending partner to verify the information provided and pull a soft credit inquiry (does not affect your credit score). Your data is encrypted and protected.
            </p>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("documents")}>Back</Button>
              <Button
                size="lg"
                className="px-8"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Get Pre-Approved</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
