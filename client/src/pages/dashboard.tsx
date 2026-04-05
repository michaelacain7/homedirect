import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListingCard } from "@/components/listing-card";
import { SellerNetSheet } from "@/components/seller-net-sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Home, FileText, MessageSquare, Eye, DollarSign, Bot, Clock, ArrowRight, Plus, MapPin,
  CheckCircle2, Circle, AlertCircle, Check, X, MessageCircle, Edit, ExternalLink, Loader2,
  BarChart2, Star
} from "lucide-react";
import type { Listing, Offer, Walkthrough, Transaction, Document as Doc } from "@shared/schema";

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  countered: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  requested: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

// Counter offer dialog
function CounterOfferDialog({
  offer,
  open,
  onClose,
  onDone,
}: {
  offer: Offer;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const counterMutation = useMutation({
    mutationFn: async () => {
      // Update offer status to "countered" with counter amount/message
      const res = await apiRequest("PATCH", `/api/offers/${offer.id}`, {
        status: "countered",
        counterAmount: parseFloat(amount),
        counterMessage: message,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      // Also post a message in the negotiation chat
      await apiRequest("POST", "/api/messages", {
        offerId: offer.id,
        senderId: user?.id,
        senderType: "user",
        content: `Counter offer: ${formatPrice(parseFloat(amount))}. ${message}`,
      });
    },
    onSuccess: () => {
      toast({ title: "Counter offer sent", description: `Counter of ${formatPrice(parseFloat(amount))} sent to buyer.` });
      onDone();
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Counter Offer</DialogTitle>
          <DialogDescription>
            Current offer: {formatPrice(offer.amount)}. Enter your counter amount and message.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Counter Amount ($)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={offer.amount.toString()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Message (optional)</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Thank you for your offer. We'd like to counter at..."
            />
          </div>
          <Button
            className="w-full"
            disabled={!amount || counterMutation.isPending}
            onClick={() => counterMutation.mutate()}
          >
            {counterMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send Counter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Offer Comparison Modal
function OfferCompareModal({
  offers,
  myListings,
  open,
  onClose,
}: {
  offers: Offer[];
  myListings: Listing[];
  open: boolean;
  onClose: () => void;
}) {
  // Group offers by listingId and show the one with multiple
  const grouped = offers.reduce<Record<number, Offer[]>>((acc, o) => {
    if (!acc[o.listingId]) acc[o.listingId] = [];
    acc[o.listingId].push(o);
    return acc;
  }, {});

  const multipleOfferListings = Object.entries(grouped)
    .filter(([, list]) => list.length >= 2)
    .map(([listingId, offerList]) => ({
      listingId: parseInt(listingId),
      offers: offerList,
      listing: myListings.find(l => l.id === parseInt(listingId)),
    }));

  function getBestOffer(offerList: Offer[]) {
    // Score: cash > conventional > fha > va, fewer contingencies, shorter close, higher price
    const scored = offerList.map(o => {
      const contingencies = (() => { try { return JSON.parse(o.contingencies || "[]"); } catch { return []; } })();
      let score = o.amount;
      const ftype = (o as any).financingType || "conventional";
      if (ftype === "cash") score += 15000;
      else if (ftype === "conventional") score += 5000;
      score -= contingencies.length * 2000;
      score -= ((o as any).closingDays || 30) * 100;
      return { offer: o, score };
    });
    return scored.sort((a, b) => b.score - a.score)[0]?.offer;
  }

  function getNetProceeds(price: number) {
    // Florida costs: 1% platform + 0.7% doc stamps + 0.575% title + recording + etc.
    return Math.round(price * (1 - 0.01 - 0.007 - 0.00575) - 200 - 350);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Compare Offers</DialogTitle>
          <DialogDescription>Side-by-side comparison of all offers on your listings</DialogDescription>
        </DialogHeader>
        {multipleOfferListings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">You need 2 or more offers on the same listing to compare.</p>
        ) : (
          multipleOfferListings.map(({ listingId, offers: offerList, listing }) => {
            const best = getBestOffer(offerList);
            return (
              <div key={listingId}>
                <p className="text-sm font-semibold mb-3">{listing?.title || `Listing #${listingId}`}</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">Detail</TableHead>
                        {offerList.map(o => (
                          <TableHead key={o.id}>
                            Offer #{o.id}
                            {o.id === best?.id && (
                              <Badge className="ml-1 bg-yellow-100 text-yellow-800 text-[10px]"><Star className="h-2.5 w-2.5 mr-0.5" />Best</Badge>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Price</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id} className="font-semibold">{formatPrice(o.amount)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Financing</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id} className="capitalize">{(o as any).financingType || "Conventional"}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Closing</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id}>{(o as any).closingDays || 30} days</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Earnest Money</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id}>{(o as any).earnestMoney ? formatPrice((o as any).earnestMoney) : "—"}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Contingencies</TableCell>
                        {offerList.map(o => {
                          const cont = (() => { try { return JSON.parse(o.contingencies || "[]"); } catch { return []; } })();
                          return <TableCell key={o.id} className="text-xs">{cont.length > 0 ? cont.join(", ") : "None"}</TableCell>;
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">Net Proceeds</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id} className="font-semibold text-primary">{formatPrice(getNetProceeds(o.amount))}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground text-xs">AI Rec.</TableCell>
                        {offerList.map(o => (
                          <TableCell key={o.id}>
                            {o.id === best?.id ? (
                              <Badge className="bg-yellow-100 text-yellow-800 text-[10px]"><Star className="h-2.5 w-2.5 mr-0.5" />Best Overall</Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [counterOffer, setCounterOffer] = useState<Offer | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const { data: myListings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings/seller", user?.id],
    queryFn: () => apiRequest("GET", `/api/listings/seller/${user?.id}`).then(r => r.json()),
    enabled: !!user && (user.role === "seller" || user.role === "admin"),
  });

  const { data: myOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers/buyer", user?.id],
    queryFn: () => apiRequest("GET", `/api/offers/buyer/${user?.id}`).then(r => r.json()),
    enabled: !!user,
  });

  // Seller-side: offers on MY listings
  const { data: sellerOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers/seller", user?.id],
    queryFn: () => apiRequest("GET", `/api/offers/seller/${user?.id}`).then(r => r.json()),
    enabled: !!user && (user.role === "seller" || user.role === "admin"),
  });

  const { data: myWalkthroughs = [] } = useQuery<Walkthrough[]>({
    queryKey: ["/api/walkthroughs/buyer", user?.id],
    queryFn: () => apiRequest("GET", `/api/walkthroughs/buyer/${user?.id}`).then(r => r.json()),
    enabled: !!user,
  });

  const { data: chaperoneGigs = [] } = useQuery<Walkthrough[]>({
    queryKey: ["/api/walkthroughs/available"],
    queryFn: () => apiRequest("GET", "/api/walkthroughs/available").then(r => r.json()),
    enabled: !!user && user.role === "chaperone",
  });

  const { data: myTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/buyer", user?.id],
    queryFn: () => apiRequest("GET", `/api/transactions/buyer/${user?.id}`).then(r => r.json()),
    enabled: !!user,
  });

  // Seller transactions
  const { data: sellerTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/seller", user?.id],
    queryFn: () => apiRequest("GET", `/api/transactions/seller/${user?.id}`).then(r => r.json()),
    enabled: !!user && (user.role === "seller" || user.role === "admin"),
  });

  const updateOfferStatus = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/offers/${offerId}`, { status });
      if (!res.ok) throw new Error((await res.json()).message || "Update failed");
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers/seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/seller", user?.id] });
      toast({
        title: status === "accepted" ? "Offer accepted!" : "Offer rejected",
        description:
          status === "accepted"
            ? "A transaction has been created. Check the Transactions tab."
            : "The buyer has been notified.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // All transactions (buyer + seller combined for display)
  const allTransactions = [
    ...myTransactions,
    ...sellerTransactions.filter(st => !myTransactions.find(bt => bt.id === st.id)),
  ];

  if (!user) {
    return (
      <div className="py-20 text-center">
        <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Sign in to view your dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">Track your offers, walkthroughs, and transactions.</p>
      </div>
    );
  }

  const isSeller = user.role === "seller" || user.role === "admin";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6" data-testid="page-dashboard">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-welcome">Welcome, {user.fullName.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground capitalize">{user.role} Dashboard</p>
        </div>
        {isSeller && (
          <Button size="sm" onClick={() => setLocation("/sell")} data-testid="button-new-listing">
            <Plus className="mr-1 h-4 w-4" /> New Listing
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4" data-testid="stat-listings">
          <Home className="mb-1 h-4 w-4 text-muted-foreground" />
          <div className="text-xl font-bold">{myListings.length}</div>
          <p className="text-xs text-muted-foreground">My Listings</p>
        </Card>
        <Card className="p-4" data-testid="stat-offers">
          <DollarSign className="mb-1 h-4 w-4 text-muted-foreground" />
          <div className="text-xl font-bold">{isSeller ? sellerOffers.length : myOffers.length}</div>
          <p className="text-xs text-muted-foreground">{isSeller ? "Received Offers" : "Active Offers"}</p>
        </Card>
        <Card className="p-4" data-testid="stat-walkthroughs">
          <Eye className="mb-1 h-4 w-4 text-muted-foreground" />
          <div className="text-xl font-bold">{myWalkthroughs.length}</div>
          <p className="text-xs text-muted-foreground">Walkthroughs</p>
        </Card>
        <Card className="p-4" data-testid="stat-transactions">
          <FileText className="mb-1 h-4 w-4 text-muted-foreground" />
          <div className="text-xl font-bold">{allTransactions.length}</div>
          <p className="text-xs text-muted-foreground">Transactions</p>
        </Card>
      </div>

      <Tabs
        defaultValue={user.role === "chaperone" ? "gigs" : isSeller ? "seller-offers" : "offers"}
        data-testid="tabs-dashboard"
      >
        <TabsList className="flex-wrap">
          {user.role !== "chaperone" && !isSeller && <TabsTrigger value="offers">My Offers</TabsTrigger>}
          {isSeller && <TabsTrigger value="seller-offers">Received Offers</TabsTrigger>}
          {user.role !== "chaperone" && <TabsTrigger value="walkthroughs">Walkthroughs</TabsTrigger>}
          {isSeller && <TabsTrigger value="listings">My Listings</TabsTrigger>}
          {user.role === "chaperone" && <TabsTrigger value="gigs">Available Gigs</TabsTrigger>}
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        {/* Buyer Offers Tab */}
        <TabsContent value="offers" className="mt-4">
          {myOffers.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No offers yet</p>
              <p className="text-xs text-muted-foreground">Browse listings and make your first offer</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLocation("/search")}>
                Browse Listings
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {myOffers.map((offer) => (
                <Card key={offer.id} className="flex items-center justify-between p-4" data-testid={`card-offer-${offer.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Offer: {formatPrice(offer.amount)}</span>
                      <Badge variant="outline" className={statusColors[offer.status]}>{offer.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Listing #{offer.listingId} — {offer.createdAt?.split("T")[0]}
                    </p>
                    {offer.status === "countered" && offer.counterAmount && (
                      <p className="text-xs text-blue-600 mt-0.5">
                        Counter: {formatPrice(offer.counterAmount)} {offer.counterMessage ? `— "${offer.counterMessage}"` : ""}
                      </p>
                    )}
                  </div>
                  <Link href={`/negotiate/${offer.id}`}>
                    <Button size="sm" variant="ghost">
                      <MessageSquare className="mr-1 h-4 w-4" /> Negotiate
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Seller Received Offers Tab */}
        <TabsContent value="seller-offers" className="mt-4">
          {sellerOffers.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No offers received yet</p>
              <p className="text-xs text-muted-foreground">Buyers will submit offers on your listings here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Compare button if 2+ offers on same listing */}
              {(() => {
                const grouped = sellerOffers.reduce<Record<number, number>>((acc, o) => { acc[o.listingId] = (acc[o.listingId] || 0) + 1; return acc; }, {});
                const hasMultiple = Object.values(grouped).some(c => c >= 2);
                return hasMultiple ? (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setShowCompare(true)} data-testid="button-compare-offers">
                      <BarChart2 className="mr-1 h-3.5 w-3.5" /> Compare Offers
                    </Button>
                  </div>
                ) : null;
              })()}

              {sellerOffers.map((offer) => {
                const isActionable = offer.status === "pending" || offer.status === "countered";
                // Find the listing for this offer to get HOA/tax info
                const listing = myListings.find(l => l.id === offer.listingId);
                return (
                  <Card key={offer.id} className="p-4" data-testid={`card-seller-offer-${offer.id}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{formatPrice(offer.amount)}</span>
                          <Badge variant="outline" className={statusColors[offer.status]}>{offer.status}</Badge>
                          {(offer as any).financingType && (
                            <Badge variant="secondary" className="text-[10px] capitalize">{(offer as any).financingType}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Listing #{offer.listingId} — Received {offer.createdAt?.split("T")[0]}
                          {(offer as any).closingDays && ` — ${(offer as any).closingDays}-day close`}
                        </p>
                        {(offer as any).earnestMoney && (
                          <p className="text-xs text-muted-foreground">
                            Earnest money: {formatPrice((offer as any).earnestMoney)}
                          </p>
                        )}
                        {offer.message && (
                          <p className="mt-1.5 text-xs text-foreground/80 border-l-2 border-muted pl-2 italic">
                            "{offer.message}"
                          </p>
                        )}
                        {offer.closingDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Proposed closing: {offer.closingDate}
                          </p>
                        )}
                        {/* Net Sheet */}
                        <div className="mt-3">
                          <SellerNetSheet
                            offerPrice={offer.amount}
                            hoaFee={listing?.hoaFee}
                            taxAmount={listing?.taxAmount}
                          />
                        </div>
                      </div>
                      {isActionable ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => updateOfferStatus.mutate({ offerId: offer.id, status: "accepted" })}
                            disabled={updateOfferStatus.isPending}
                            data-testid={`button-accept-${offer.id}`}
                          >
                            <Check className="mr-1 h-3 w-3" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateOfferStatus.mutate({ offerId: offer.id, status: "rejected" })}
                            disabled={updateOfferStatus.isPending}
                            data-testid={`button-reject-${offer.id}`}
                          >
                            <X className="mr-1 h-3 w-3" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCounterOffer(offer)}
                            data-testid={`button-counter-${offer.id}`}
                          >
                            <MessageCircle className="mr-1 h-3 w-3" /> Counter
                          </Button>
                          <Link href={`/negotiate/${offer.id}`}>
                            <Button size="sm" variant="ghost">
                              <MessageSquare className="mr-1 h-3 w-3" /> Chat
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link href={`/negotiate/${offer.id}`}>
                            <Button size="sm" variant="ghost">
                              <MessageSquare className="mr-1 h-3 w-3" /> Chat
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Walkthroughs Tab */}
        <TabsContent value="walkthroughs" className="mt-4">
          {myWalkthroughs.length === 0 ? (
            <div className="py-12 text-center">
              <Eye className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No walkthroughs scheduled</p>
              <p className="text-xs text-muted-foreground">Find a home and schedule a $20 chaperone walkthrough</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myWalkthroughs.map((wt) => (
                <Card key={wt.id} className="p-4" data-testid={`card-walkthrough-${wt.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Listing #{wt.listingId}</span>
                        <Badge variant="outline" className={statusColors[wt.status]}>{wt.status}</Badge>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {wt.scheduledDate} at {wt.scheduledTime}</span>
                        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> $20 chaperone fee</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Listings Tab */}
        <TabsContent value="listings" className="mt-4">
          {myListings.length === 0 ? (
            <div className="py-12 text-center">
              <Home className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No listings yet</p>
              <p className="text-xs text-muted-foreground">List your first property and save thousands</p>
              <Button size="sm" className="mt-3" onClick={() => setLocation("/sell")}>
                <Plus className="mr-1 h-4 w-4" /> Create Listing
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {myListings.map((listing) => (
                <div key={listing.id} className="relative group">
                  <ListingCard listing={listing} />
                  <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                    <Link href={`/edit-listing/${listing.id}`}>
                      <Button size="sm" className="h-7 px-2 text-xs shadow-md">
                        <Edit className="mr-1 h-3 w-3" /> Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Chaperone Gigs Tab */}
        <TabsContent value="gigs" className="mt-4">
          {chaperoneGigs.length === 0 ? (
            <div className="py-12 text-center">
              <MapPin className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No available gigs</p>
              <p className="text-xs text-muted-foreground">Check back soon for walkthrough chaperone opportunities ($20 each)</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chaperoneGigs.map((gig) => (
                <Card key={gig.id} className="flex items-center justify-between p-4" data-testid={`card-gig-${gig.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Walkthrough - Listing #{gig.listingId}</span>
                      <Badge variant="secondary">$20</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{gig.scheduledDate} at {gig.scheduledTime}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={async () => {
                    await apiRequest("PATCH", `/api/walkthroughs/${gig.id}`, { chaperoneId: user.id, status: "assigned" });
                    window.location.reload();
                  }} data-testid={`button-accept-gig-${gig.id}`}>
                    Accept Gig
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="mt-4">
          {allTransactions.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm font-medium">No active transactions</p>
              <p className="text-xs text-muted-foreground">Accepted offers become transactions tracked here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allTransactions.map((txn) => (
                <Card key={txn.id} className="p-4" data-testid={`card-transaction-${txn.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Transaction #{txn.id}</span>
                      <Badge variant="outline" className={statusColors[txn.status]}>{txn.status}</Badge>
                      {txn.buyerId === user.id && (
                        <Badge variant="secondary" className="text-[10px]">Buyer</Badge>
                      )}
                      {txn.sellerId === user.id && (
                        <Badge variant="secondary" className="text-[10px]">Seller</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatPrice(txn.salePrice)}</span>
                      <Link href={`/transaction/${txn.id}`}>
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <div className="flex items-center gap-1.5">
                      {txn.escrowStatus === "not_started" ? <Circle className="h-3 w-3 text-muted-foreground" /> : txn.escrowStatus === "disbursed" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-blue-500" />}
                      <span>Escrow: {txn.escrowStatus?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {txn.titleStatus === "not_started" ? <Circle className="h-3 w-3 text-muted-foreground" /> : txn.titleStatus === "clear" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-blue-500" />}
                      <span>Title: {txn.titleStatus?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {txn.inspectionStatus === "not_started" ? <Circle className="h-3 w-3 text-muted-foreground" /> : <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      <span>Inspection: {txn.inspectionStatus?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {txn.appraisalStatus === "not_started" ? <Circle className="h-3 w-3 text-muted-foreground" /> : <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      <span>Appraisal: {txn.appraisalStatus?.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>Platform fee (1%): {formatPrice(txn.platformFee)}</span>
                    {txn.closingDate && <span>Est. closing: {txn.closingDate}</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Counter Offer Dialog */}
      {counterOffer && (
        <CounterOfferDialog
          offer={counterOffer}
          open={!!counterOffer}
          onClose={() => setCounterOffer(null)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/offers/seller", user?.id] });
          }}
        />
      )}

      {/* Offer Compare Modal */}
      <OfferCompareModal
        offers={sellerOffers}
        myListings={myListings}
        open={showCompare}
        onClose={() => setShowCompare(false)}
      />
    </div>
  );
}
