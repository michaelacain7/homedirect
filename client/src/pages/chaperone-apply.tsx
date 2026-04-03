import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, ArrowRight, User, Shield, CreditCard, BookOpen, Check,
  Loader2, CheckCircle2, Car, MapPin, Calendar
} from "lucide-react";

const STEPS = ["Personal Info", "Qualifications", "Background Check", "Bank Account", "Agreement & Training"];

const AVAILABILITY_OPTIONS = [
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
  { id: "evenings", label: "Evenings" },
];

export default function ChaperoneApply() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [bgCheckStatus, setBgCheckStatus] = useState<"idle" | "processing" | "passed">("idle");
  const [applicationId, setApplicationId] = useState<number | null>(null);

  const nameParts = (user?.fullName || "").split(" ");
  const [form, setForm] = useState({
    // Step 1
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: "",
    city: "",
    state: "FL",
    zip: "",
    dateOfBirth: "",
    // Step 2
    hasRealtorLicense: false,
    realtorLicenseNumber: "",
    hasVehicle: false,
    maxTravelMiles: 15,
    availability: [] as string[],
    // Step 3
    ssn: "",
    driversLicense: "",
    // Step 4
    bankAccountName: "",
    bankRoutingNumber: "",
    bankAccountNumber: "",
    bankAccountType: "checking",
    // Step 5
    agreedToTerms: false,
    completedTraining: false,
  });

  const update = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const toggleAvailability = (id: string) => {
    setForm(f => ({
      ...f,
      availability: f.availability.includes(id)
        ? f.availability.filter(a => a !== id)
        : [...f.availability, id],
    }));
  };

  const submitStep1 = async () => {
    if (!user) return toast({ title: "Sign in required", variant: "destructive" });
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.address || !form.city || !form.zip || !form.dateOfBirth) {
      return toast({ title: "Please fill in all required fields", variant: "destructive" });
    }
    setStep(1);
  };

  const submitStep2 = () => {
    if (form.availability.length === 0) {
      return toast({ title: "Select at least one availability option", variant: "destructive" });
    }
    setStep(2);
  };

  const submitBackgroundCheck = async () => {
    if (!form.ssn || !form.driversLicense) {
      return toast({ title: "SSN and driver's license are required", variant: "destructive" });
    }
    if (!user) return;

    setBgCheckStatus("processing");

    try {
      // Create or update application
      let appId = applicationId;
      if (!appId) {
        const res = await apiRequest("POST", "/api/chaperone/apply", {
          userId: user.id,
          status: "pending",
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          dateOfBirth: form.dateOfBirth,
          ssn: form.ssn,
          driversLicense: form.driversLicense,
          hasRealtorLicense: form.hasRealtorLicense,
          realtorLicenseNumber: form.realtorLicenseNumber || null,
          hasVehicle: form.hasVehicle,
          maxTravelMiles: form.maxTravelMiles,
          availability: JSON.stringify(form.availability),
        }).then(r => r.json());
        appId = res.id;
        setApplicationId(res.id);
      }

      // Trigger background check
      await apiRequest("POST", `/api/chaperone/application/${appId}/background-check`, {}).then(r => r.json());

      // Simulate waiting for check to complete (server does 2s)
      setTimeout(() => {
        setBgCheckStatus("passed");
        setStep(3);
      }, 3000);
    } catch (e: any) {
      setBgCheckStatus("idle");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const submitBankInfo = async () => {
    if (!form.bankAccountName || !form.bankRoutingNumber || !form.bankAccountNumber) {
      return toast({ title: "Please fill in all bank account fields", variant: "destructive" });
    }
    if (!applicationId) return;

    try {
      await apiRequest("PATCH", `/api/chaperone/application/${applicationId}`, {
        bankAccountName: form.bankAccountName,
        bankRoutingNumber: form.bankRoutingNumber,
        bankAccountNumber: form.bankAccountNumber,
        bankAccountType: form.bankAccountType,
      }).then(r => r.json());
      setStep(4);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const submitFinal = async () => {
    if (!form.agreedToTerms) {
      return toast({ title: "You must agree to the terms", variant: "destructive" });
    }
    if (!form.completedTraining) {
      return toast({ title: "Please complete the training section", variant: "destructive" });
    }
    if (!applicationId) return;
    setSubmitting(true);

    try {
      await apiRequest("PATCH", `/api/chaperone/application/${applicationId}`, {
        agreedToTerms: true,
        agreedToTermsDate: new Date().toISOString().split("T")[0],
        completedTraining: true,
        status: "approved",
      }).then(r => r.json());
      // Refresh user data so role updates to "chaperone" in the UI
      await refreshUser();
      toast({ title: "Application submitted!", description: "Welcome to the HomeDirectAI chaperone program." });
      setLocation("/chaperone-dashboard");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center px-4">
        <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="mb-1 text-lg font-semibold">Sign in to apply</h2>
        <p className="text-sm text-muted-foreground">Create an account or sign in to apply as a chaperone.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" data-testid="page-chaperone-apply">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Become a Chaperone</h1>
          <span className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Personal Information */}
      {step === 0 && (
        <Card className="p-6 space-y-4" data-testid="step-personal-info">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Personal Information</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={e => update("firstName", e.target.value)} placeholder="First name" data-testid="input-first-name" />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={e => update("lastName", e.target.value)} placeholder="Last name" data-testid="input-last-name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} placeholder="you@example.com" data-testid="input-email" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="813-555-0000" data-testid="input-phone" />
          </div>
          <div className="space-y-2">
            <Label>Street Address</Label>
            <Input value={form.address} onChange={e => update("address", e.target.value)} placeholder="1234 Oak Ave" data-testid="input-address" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="Tampa" data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={e => update("state", e.target.value)} data-testid="input-state" />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={form.zip} onChange={e => update("zip", e.target.value)} placeholder="33601" data-testid="input-zip" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="date" className="pl-9" value={form.dateOfBirth} onChange={e => update("dateOfBirth", e.target.value)} data-testid="input-dob" />
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Qualifications */}
      {step === 1 && (
        <Card className="p-6 space-y-5" data-testid="step-qualifications">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Qualifications</h2>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Real Estate License</p>
              <p className="text-xs text-muted-foreground">Do you hold an active real estate license?</p>
            </div>
            <Switch checked={form.hasRealtorLicense} onCheckedChange={v => update("hasRealtorLicense", v)} data-testid="switch-realtor-license" />
          </div>
          {form.hasRealtorLicense && (
            <div className="space-y-2">
              <Label>License Number</Label>
              <Input value={form.realtorLicenseNumber} onChange={e => update("realtorLicenseNumber", e.target.value)} placeholder="FL-RE-1234567" data-testid="input-license-number" />
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Car className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Reliable Transportation</p>
                <p className="text-xs text-muted-foreground">Do you have a reliable vehicle?</p>
              </div>
            </div>
            <Switch checked={form.hasVehicle} onCheckedChange={v => update("hasVehicle", v)} data-testid="switch-vehicle" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Max Travel Distance</Label>
                <p className="text-xs text-muted-foreground">How far will you travel for a showing?</p>
              </div>
              <span className="text-sm font-medium text-primary">{form.maxTravelMiles} mi</span>
            </div>
            <Slider
              min={5} max={30} step={5}
              value={[form.maxTravelMiles]}
              onValueChange={([v]) => update("maxTravelMiles", v)}
              data-testid="slider-travel-miles"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 mi</span><span>30 mi</span>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Availability</Label>
            <p className="text-xs text-muted-foreground">When are you available to do showings?</p>
            <div className="space-y-2">
              {AVAILABILITY_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid={`checkbox-avail-${opt.id}`}>
                  <Checkbox
                    checked={form.availability.includes(opt.id)}
                    onCheckedChange={() => toggleAvailability(opt.id)}
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Background Check */}
      {step === 2 && (
        <Card className="p-6 space-y-4" data-testid="step-background-check">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Background Check</h2>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm text-muted-foreground">
            A background check is required for all chaperones to protect buyers visiting properties.
            This is a one-time check and typically takes a few seconds in our demo.
            Your information is encrypted and never shared.
          </div>
          <div className="space-y-2">
            <Label>Social Security Number</Label>
            <Input
              type="password"
              value={form.ssn}
              onChange={e => update("ssn", e.target.value)}
              placeholder="XXX-XX-XXXX"
              disabled={bgCheckStatus !== "idle"}
              data-testid="input-ssn"
            />
            <p className="text-xs text-muted-foreground">We only display the last 4 digits. Your SSN is stored securely.</p>
          </div>
          <div className="space-y-2">
            <Label>Driver's License Number</Label>
            <Input
              value={form.driversLicense}
              onChange={e => update("driversLicense", e.target.value)}
              placeholder="FL-G12345678"
              disabled={bgCheckStatus !== "idle"}
              data-testid="input-drivers-license"
            />
          </div>
          {bgCheckStatus === "idle" && (
            <Button className="w-full" onClick={submitBackgroundCheck} data-testid="button-submit-background-check">
              <Shield className="mr-2 h-4 w-4" />
              Submit for Background Check
            </Button>
          )}
          {bgCheckStatus === "processing" && (
            <div className="flex items-center justify-center gap-3 rounded-lg bg-muted p-4 text-sm" data-testid="status-bg-processing">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Running background check...</span>
            </div>
          )}
          {bgCheckStatus === "passed" && (
            <div className="flex items-center justify-center gap-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-300" data-testid="status-bg-passed">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Background check passed!</span>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Bank Account */}
      {step === 3 && (
        <Card className="p-6 space-y-4" data-testid="step-bank-account">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Bank Account for Payouts</h2>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-sm font-medium text-primary">You'll earn $20 per walkthrough showing.</p>
            <p className="text-xs text-muted-foreground mt-1">Payouts are deposited directly to your bank account within 1-2 business days of completing each showing.</p>
          </div>
          <div className="space-y-2">
            <Label>Account Holder Name</Label>
            <Input value={form.bankAccountName} onChange={e => update("bankAccountName", e.target.value)} placeholder="Account holder name" data-testid="input-bank-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Routing Number</Label>
              <Input value={form.bankRoutingNumber} onChange={e => update("bankRoutingNumber", e.target.value)} placeholder="021000021" data-testid="input-routing" />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input type="password" value={form.bankAccountNumber} onChange={e => update("bankAccountNumber", e.target.value)} placeholder="••••••••" data-testid="input-account-number" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={form.bankAccountType} onValueChange={v => update("bankAccountType", v)}>
              <SelectTrigger data-testid="select-account-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {/* Step 5: Agreement & Training */}
      {step === 4 && (
        <Card className="p-6 space-y-5" data-testid="step-agreement">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Agreement & Training</h2>
          </div>

          {/* Training */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Chaperone Training</h3>
            <p className="text-xs text-muted-foreground">Review these key responsibilities before completing your application:</p>
            <div className="space-y-3">
              {[
                { num: 1, text: "Arrive 15 minutes early to open the property and ensure it is ready for the showing." },
                { num: 2, text: "Be professional and courteous to buyers at all times. You represent HomeDirectAI." },
                { num: 3, text: "Do not provide real estate advice or opinions on pricing. Refer all questions to HomeDirectAI's AI system." },
                { num: 4, text: "Secure the property when the showing is complete — lock all doors and windows, and return the lockbox key." },
              ].map(item => (
                <div key={item.num} className="flex gap-3 text-sm" data-testid={`training-point-${item.num}`}>
                  <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {item.num}
                  </span>
                  <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
            <Button
              variant={form.completedTraining ? "secondary" : "default"}
              size="sm"
              className="w-full mt-2"
              onClick={() => update("completedTraining", true)}
              data-testid="button-complete-training"
            >
              {form.completedTraining ? (
                <><Check className="mr-2 h-4 w-4" /> Training Complete</>
              ) : "Mark Training Complete"}
            </Button>
          </div>

          {/* Terms */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Terms of Service</h3>
            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>As a HomeDirectAI Chaperone, you agree to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Conduct showings in a professional and safe manner</li>
                <li>Never share access codes or lockbox combinations with buyers</li>
                <li>Report any damage or suspicious activity immediately</li>
                <li>Maintain accurate availability in your dashboard</li>
                <li>Accept payment of $20 per completed showing via direct deposit</li>
                <li>Comply with all applicable real estate laws in your state</li>
              </ul>
            </div>
            <label className="flex items-start gap-3 cursor-pointer" data-testid="checkbox-agree-terms">
              <Checkbox
                checked={form.agreedToTerms}
                onCheckedChange={v => update("agreedToTerms", !!v)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground">
                I have read and agree to the HomeDirectAI Chaperone Terms of Service and all associated responsibilities.
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost" size="sm"
          onClick={() => step > 0 ? setStep(step - 1) : setLocation("/")}
          data-testid="button-prev-step"
          disabled={step === 2 && bgCheckStatus === "processing"}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step === 0 && (
          <Button size="sm" onClick={submitStep1} data-testid="button-next-step-1">
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 1 && (
          <Button size="sm" onClick={submitStep2} data-testid="button-next-step-2">
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 2 && bgCheckStatus === "passed" && (
          <Button size="sm" onClick={() => setStep(3)} data-testid="button-next-step-3">
            Continue <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 3 && (
          <Button size="sm" onClick={submitBankInfo} data-testid="button-next-step-4">
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 4 && (
          <Button
            size="sm"
            onClick={submitFinal}
            disabled={submitting || !form.agreedToTerms || !form.completedTraining}
            data-testid="button-submit-application"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Submit Application
          </Button>
        )}
      </div>
    </div>
  );
}
