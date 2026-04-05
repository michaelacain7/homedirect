import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Bed, Bath, Maximize, MapPin, Calendar, DollarSign, Home as HomeIcon,
  ArrowLeft, Heart, Share2, Bot, ChevronLeft, ChevronRight, Clock, Tag, CreditCard, CheckCircle
} from "lucide-react";
import type { Listing } from "@shared/schema";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

export default function ListingDetail() {
  const [, params] = useRoute("/listing/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [imgIndex, setImgIndex] = useState(0);
  const [showOffer, setShowOffer] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerFinancingType, setOfferFinancingType] = useState("conventional");
  const [offerDownPayment, setOfferDownPayment] = useState("20");
  const [offerEarnestMoney, setOfferEarnestMoney] = useState("");
  const [offerClosingDays, setOfferClosingDays] = useState("30");
  const [offerContingencies, setOfferContingencies] = useState<string[]>(["Inspection", "Financing", "Appraisal"]);
  const [offerEscalationMax, setOfferEscalationMax] = useState("");
  const [wtDate, setWtDate] = useState("");
  const [wtTime, setWtTime] = useState("");
  const [wtNotes, setWtNotes] = useState("");
  const [wtStep, setWtStep] = useState<"form" | "payment" | "done">("form");
  const [wtPaymentProcessing, setWtPaymentProcessing] = useState(false);
  const [wtTestMode, setWtTestMode] = useState(true);

  const { data: listing, isLoading } = useQuery<Listing>({
    queryKey: ["/api/listings", params?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/listings/${params?.id}`);
      return res.json();
    },
    enabled: !!params?.id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-8">
        <div className="aspect-[16/9] rounded-md bg-muted" />
        <div className="mt-6 space-y-3">
          <div className="h-6 w-1/3 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-lg font-semibold">Listing not found</h2>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/search")}>Back to search</Button>
      </div>
    );
  }

  const images: string[] = JSON.parse(listing.images || "[]");
  const features: string[] = JSON.parse(listing.features || "[]");
  const platformFee = listing.price * 0.01;

  const submitOffer = async () => {
    if (!user) return toast({ title: "Sign in required", description: "Please sign in to make an offer.", variant: "destructive" });
    try {
      const closingDaysNum = parseInt(offerClosingDays) || 30;
      const closingDate = new Date(Date.now() + closingDaysNum * 86400000).toISOString().split("T")[0];
      await apiRequest("POST", "/api/offers", {
        listingId: listing.id, buyerId: user.id,
        amount: parseFloat(offerAmount), message: offerMessage,
        contingencies: JSON.stringify(offerContingencies),
        closingDate,
        financingType: offerFinancingType,
        downPaymentPercent: parseFloat(offerDownPayment) || 20,
        earnestMoney: offerEarnestMoney ? parseFloat(offerEarnestMoney) : Math.round(parseFloat(offerAmount) * 0.01),
        closingDays: closingDaysNum,
        escalationMax: offerEscalationMax ? parseFloat(offerEscalationMax) : null,
      });
      toast({ title: "Offer submitted", description: "Your AI agent will guide you through the negotiation process." });
      setShowOffer(false);
      setLocation("/dashboard");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // Step 1: Advance from form to payment
  const proceedToPayment = () => {
    if (!user) return toast({ title: "Sign in required", description: "Please sign in to schedule a walkthrough.", variant: "destructive" });
    setWtStep("payment");
  };

  // Step 2: Process payment then create walkthrough
  const submitWalkthrough = async () => {
    if (!user) return;
    setWtPaymentProcessing(true);
    try {
      // First create the walkthrough record
      const wtRes = await apiRequest("POST", "/api/walkthroughs", {
        listingId: listing.id, buyerId: user.id,
        scheduledDate: wtDate, scheduledTime: wtTime,
        buyerNotes: wtNotes, chaperonePayment: 20,
      });
      const walkthrough = await wtRes.json();

      // Then process payment
      const payRes = await apiRequest("POST", "/api/payments/walkthrough", {
        walkthroughId: walkthrough.id,
        userId: user.id,
      });
      const payData = await payRes.json();
      setWtTestMode(payData.testMode ?? true);
      setWtStep("done");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setWtPaymentProcessing(false);
    }
  };

  const closeWalkthrough = () => {
    setShowWalkthrough(false);
    setWtStep("form");
    setWtDate("");
    setWtTime("");
    setWtNotes("");
  };

  return (
    <div className="min-h-screen" data-testid="page-listing-detail">
      {/* Top Bar */}
      <div className="border-b py-2">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/search")} data-testid="button-back">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" data-testid="button-share"><Share2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" data-testid="button-heart"><Heart className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Image Gallery */}
        <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-md md:aspect-[2.5/1]" data-testid="gallery">
          <img
            src={images[imgIndex] || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200"}
            alt={listing.title}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
            data-testid="img-main"
          />
          {images.length > 1 && (
            <>
              <Button
                size="icon" variant="secondary"
                className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                onClick={() => setImgIndex((imgIndex - 1 + images.length) % images.length)}
                data-testid="button-prev-img"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon" variant="secondary"
                className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                onClick={() => setImgIndex((imgIndex + 1) % images.length)}
                data-testid="button-next-img"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {images.map((_, i) => (
                  <button key={i} onClick={() => setImgIndex(i)}
                    className={`h-1.5 w-1.5 rounded-full transition ${i === imgIndex ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="secondary">{listing.status === "pending" ? "Under Contract" : "Active"}</Badge>
                <Badge variant="outline">{listing.propertyType.replace("_", " ")}</Badge>
              </div>
              <h1 className="text-xl font-bold" data-testid="text-listing-title">{listing.title}</h1>
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span data-testid="text-listing-address">{listing.address}, {listing.city}, {listing.state} {listing.zip}</span>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 text-sm" data-testid="text-detail-beds">
                <Bed className="h-4 w-4 text-muted-foreground" /> {listing.bedrooms} Bedrooms
              </div>
              <div className="flex items-center gap-1.5 text-sm" data-testid="text-detail-baths">
                <Bath className="h-4 w-4 text-muted-foreground" /> {listing.bathrooms} Bathrooms
              </div>
              <div className="flex items-center gap-1.5 text-sm" data-testid="text-detail-sqft">
                <Maximize className="h-4 w-4 text-muted-foreground" /> {listing.sqft.toLocaleString()} sqft
              </div>
              {listing.yearBuilt && (
                <div className="flex items-center gap-1.5 text-sm" data-testid="text-detail-year">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> Built {listing.yearBuilt}
                </div>
              )}
              {listing.lotSize && listing.lotSize > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <HomeIcon className="h-4 w-4 text-muted-foreground" /> {listing.lotSize} acre lot
                </div>
              )}
            </div>

            <Tabs defaultValue="details" data-testid="tabs-listing">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-4">
                <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-description">{listing.description}</p>
              </TabsContent>
              <TabsContent value="features" className="mt-4">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Tag className="h-3.5 w-3.5 text-primary" /> {f}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="financials" className="mt-4">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Listing Price</span>
                    <span className="font-medium">{formatPrice(listing.price)}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Platform Fee (1%)</span>
                    <span className="font-medium">{formatPrice(platformFee)}</span>
                  </div>
                  {listing.hoaFee && listing.hoaFee > 0 && (
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">HOA Fee</span>
                      <span className="font-medium">${listing.hoaFee}/month</span>
                    </div>
                  )}
                  {listing.taxAmount && (
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Annual Taxes</span>
                      <span className="font-medium">{formatPrice(listing.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Traditional Agent Fee (6%)</span>
                    <span className="font-medium line-through text-muted-foreground">{formatPrice(listing.price * 0.06)}</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-primary/10 p-3">
                    <span className="font-medium text-primary">You Save</span>
                    <span className="font-bold text-primary">{formatPrice(listing.price * 0.05)}</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-4">
            <Card className="p-5" data-testid="card-price">
              <div className="mb-1 text-xl font-bold" data-testid="text-detail-price">{formatPrice(listing.price)}</div>
              <p className="mb-4 text-xs text-muted-foreground">
                Est. {formatPrice(listing.price * 0.005)}/mo with 20% down
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => setShowOffer(true)} data-testid="button-make-offer">
                  <Bot className="mr-2 h-4 w-4" /> Make an Offer with AI
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setShowWalkthrough(true)} data-testid="button-schedule-tour">
                  <Clock className="mr-2 h-4 w-4" /> Schedule Walkthrough ($20)
                </Button>
              </div>
            </Card>

            <Card className="p-5" data-testid="card-ai-info">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AI Agent Ready</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Our AI agent will handle your offer negotiation, prepare all necessary documents including purchase
                agreements, disclosures, and title paperwork. It will guide you through every step to closing.
              </p>
            </Card>

            <Card className="p-5" data-testid="card-savings">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Your Savings</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traditional (6%)</span>
                  <span className="line-through text-muted-foreground">{formatPrice(listing.price * 0.06)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HomeDirectAI (1%)</span>
                  <span>{formatPrice(platformFee)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold text-primary">
                  <span>You save</span>
                  <span>{formatPrice(listing.price * 0.05)}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Offer Modal */}
      <Dialog open={showOffer} onOpenChange={setShowOffer}>
        <DialogContent className="max-w-lg" data-testid="dialog-offer">
          <DialogHeader>
            <DialogTitle>Make an Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              Your AI agent will submit this offer and guide you through negotiation.
              Listing price: {formatPrice(listing.price)}
            </p>

            {/* Offer Amount */}
            <div className="space-y-1.5">
              <Label>Offer Amount ($)</Label>
              <Input type="number" placeholder={listing.price.toString()} value={offerAmount} onChange={e => setOfferAmount(e.target.value)} data-testid="input-offer-amount" />
            </div>

            {/* Financing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Financing Type</Label>
                <Select value={offerFinancingType} onValueChange={setOfferFinancingType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="conventional">Conventional</SelectItem>
                    <SelectItem value="fha">FHA</SelectItem>
                    <SelectItem value="va">VA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {offerFinancingType !== "cash" && (
                <div className="space-y-1.5">
                  <Label>Down Payment (%)</Label>
                  <Input type="number" placeholder="20" value={offerDownPayment} onChange={e => setOfferDownPayment(e.target.value)} />
                </div>
              )}
            </div>

            {/* Earnest Money & Closing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Earnest Money ($)</Label>
                <Input
                  type="number"
                  placeholder={offerAmount ? Math.round(parseFloat(offerAmount) * 0.01).toString() : "5000"}
                  value={offerEarnestMoney}
                  onChange={e => setOfferEarnestMoney(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Closing Timeline</Label>
                <Select value={offerClosingDays} onValueChange={setOfferClosingDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="21">21 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="45">45 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contingencies */}
            <div className="space-y-1.5">
              <Label>Contingencies</Label>
              <div className="flex flex-wrap gap-2">
                {["Inspection", "Financing", "Appraisal", "Sale of Current Home"].map(cont => (
                  <button
                    key={cont}
                    type="button"
                    onClick={() => setOfferContingencies(prev =>
                      prev.includes(cont) ? prev.filter(c => c !== cont) : [...prev, cont]
                    )}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      offerContingencies.includes(cont)
                        ? "bg-primary text-white border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {cont}
                  </button>
                ))}
              </div>
            </div>

            {/* Escalation Clause */}
            <div className="space-y-1.5">
              <Label>Escalation Clause (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Will beat competing offers up to:</span>
                <Input
                  type="number"
                  placeholder="550000"
                  value={offerEscalationMax}
                  onChange={e => setOfferEscalationMax(e.target.value)}
                  className="flex-1"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Leave blank if not using escalation</p>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label>Message to Seller (optional)</Label>
              <Textarea placeholder="Tell the seller why you love their home..." value={offerMessage} onChange={e => setOfferMessage(e.target.value)} data-testid="input-offer-message" rows={3} />
            </div>

            <Button className="w-full" onClick={submitOffer} disabled={!offerAmount} data-testid="button-submit-offer">
              <Bot className="mr-2 h-4 w-4" /> Submit Offer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Walkthrough Modal */}
      <Dialog open={showWalkthrough} onOpenChange={closeWalkthrough}>
        <DialogContent data-testid="dialog-walkthrough">
          <DialogHeader>
            <DialogTitle>
              {wtStep === "form" && "Schedule a Walkthrough"}
              {wtStep === "payment" && "Confirm Payment"}
              {wtStep === "done" && "Walkthrough Confirmed!"}
            </DialogTitle>
          </DialogHeader>

          {wtStep === "form" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                A local chaperone will meet you at the property to guide you through. Cost: <strong>$20.00</strong>.
              </p>
              <div className="space-y-2">
                <Label>Preferred Date</Label>
                <Input type="date" value={wtDate} onChange={e => setWtDate(e.target.value)} data-testid="input-wt-date" />
              </div>
              <div className="space-y-2">
                <Label>Preferred Time</Label>
                <Select value={wtTime} onValueChange={setWtTime}>
                  <SelectTrigger data-testid="select-wt-time"><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent>
                    {["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes for Chaperone (optional)</Label>
                <Textarea placeholder="Any specific areas you'd like to see?" value={wtNotes} onChange={e => setWtNotes(e.target.value)} data-testid="input-wt-notes" />
              </div>
              <Button className="w-full" onClick={proceedToPayment} disabled={!wtDate || !wtTime} data-testid="button-proceed-payment">
                Continue to Payment
              </Button>
            </div>
          )}

          {wtStep === "payment" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Walkthrough Fee
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span>{wtDate} at {wtTime}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Property</span>
                  <span className="text-right max-w-[200px] truncate">{listing.address}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span className="text-primary">$20.00</span>
                </div>
              </div>

              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                <strong>Test Mode — Payment Simulated</strong><br />
                In production, this would use Stripe to securely collect your payment. The $20 is held until the chaperone completes the showing, then transferred to them.
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setWtStep("form")}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={submitWalkthrough}
                  disabled={wtPaymentProcessing}
                  data-testid="button-submit-walkthrough"
                >
                  {wtPaymentProcessing ? "Processing..." : "Confirm & Pay $20"}
                </Button>
              </div>
            </div>
          )}

          {wtStep === "done" && (
            <div className="space-y-4 text-center py-2">
              <CheckCircle className="mx-auto h-12 w-12 text-primary" />
              <div>
                <p className="font-semibold">Walkthrough Booked!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {wtDate} at {wtTime}
                </p>
              </div>
              {wtTestMode && (
                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Test Mode — Payment of $20.00 simulated successfully
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A chaperone will be assigned soon. You'll receive a notification when confirmed.
              </p>
              <Button className="w-full" onClick={closeWalkthrough}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
