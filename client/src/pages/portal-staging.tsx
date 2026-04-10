import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Palette, CheckCircle2, Send, Bot, User,
  Loader2, Camera, Home, Calendar, Star, Sparkles,
  Image, Sofa, Eye, DollarSign, Clock
} from "lucide-react";
import type { Transaction, Listing } from "@shared/schema";

type PortalMessage = { id: number; role: string; content: string; createdAt: string };

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

function renderMarkdown(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

const STAGING_STEPS = ["Consultation", "Room Plan", "Staging Day", "Photo Shoot", "Listed"];

// Room staging recommendations based on home type
const ROOM_PLANS = [
  { room: "Living Room", priority: "Critical", impact: "High", tips: "Neutral furniture, remove personal photos, add throw pillows and a rug. Less is more — buyers need to imagine their own furniture.", cost: "$800 - $1,500" },
  { room: "Primary Bedroom", priority: "Critical", impact: "High", tips: "Fresh white bedding, matching nightstands, minimal decor. Make the bed the focal point. Remove everything from dressers.", cost: "$500 - $900" },
  { room: "Kitchen", priority: "Critical", impact: "High", tips: "Clear all countertops except 1-2 decorative items. Fresh fruit bowl, small herb plant. Clean and degrease everything.", cost: "$200 - $400" },
  { room: "Bathrooms", priority: "High", impact: "Medium", tips: "White towels, new shower curtain, remove all personal products. Add a small plant or candle. Re-caulk if needed.", cost: "$150 - $300" },
  { room: "Dining Room", priority: "Medium", impact: "Medium", tips: "Set the table with neutral place settings. Centerpiece with fresh or faux flowers. Remove extra chairs if crowded.", cost: "$300 - $600" },
  { room: "Exterior / Curb Appeal", priority: "Critical", impact: "Very High", tips: "Fresh mulch, trimmed hedges, power wash driveway & walkways. New doormat, potted plants at entry. Paint front door if faded.", cost: "$300 - $800" },
  { room: "Guest Bedrooms", priority: "Low", impact: "Low", tips: "Simple bedding, one piece of art, clear closets to 50%. Show the space, not the stuff.", cost: "$200 - $400" },
  { room: "Home Office", priority: "Medium", impact: "Medium", tips: "Clean desk with laptop, small plant, and one accessory. Show the room has a purpose — remote work is a selling point.", cost: "$100 - $300" },
];

const SHOWCASE_PHOTOS = [
  { url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600", label: "Staged Living Room", before: "Cluttered with personal items", after: "Open, neutral, inviting" },
  { url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600", label: "Staged Kitchen", before: "Counter clutter, dated accessories", after: "Clean counters, fresh feel" },
  { url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600", label: "Staged Bedroom", before: "Busy bedding, full dressers", after: "Crisp white, hotel-quality feel" },
  { url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600", label: "Curb Appeal", before: "Overgrown, faded paint", after: "Fresh landscaping, welcoming entry" },
];

const VIRTUAL_STAGING_OPTIONS = [
  { style: "Modern Minimalist", description: "Clean lines, neutral palette, contemporary furniture", price: "$75/room" },
  { style: "Coastal Florida", description: "Light blues, natural textures, beach-inspired", price: "$75/room" },
  { style: "Traditional Warm", description: "Rich tones, classic furniture, cozy feel", price: "$75/room" },
  { style: "Farmhouse Chic", description: "Rustic elements, shiplap accents, warm whites", price: "$75/room" },
];

export default function PortalStaging() {
  const [, params] = useRoute("/transaction/:id/staging");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [consultDate, setConsultDate] = useState("");
  const [consultTime, setConsultTime] = useState("");
  const [stagingStyle, setStagingStyle] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeTab, setActiveTab] = useState<"plan" | "virtual" | "showcase" | "schedule">("plan");
  const messagesEnd = useRef<HTMLDivElement>(null);

  const { data: txn } = useQuery<Transaction>({
    queryKey: ["/api/transactions", params?.id],
    queryFn: () => apiRequest("GET", `/api/transactions/${params?.id}`).then(r => r.json()),
    enabled: !!params?.id,
  });

  const { data: listing } = useQuery<Listing>({
    queryKey: ["/api/listings", txn?.listingId],
    queryFn: () => apiRequest("GET", `/api/listings/${txn?.listingId}`).then(r => r.json()),
    enabled: !!txn?.listingId,
  });

  const { data: messages = [] } = useQuery<PortalMessage[]>({
    queryKey: ["/api/transactions", params?.id, "portal-messages", "staging"],
    queryFn: async () => {
      try { return await apiRequest("GET", `/api/transactions/${params?.id}/portal-messages/staging`).then(r => r.json()); }
      catch { return []; }
    },
    enabled: !!params?.id,
    refetchInterval: 15000,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/transactions/${params?.id}/portal-chat`, {
        portal: "staging",
        message: content,
      });
    },
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", params?.id, "portal-messages", "staging"] });
    },
  });

  if (!user || !txn) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const address = listing ? `${listing.address}, ${listing.city}, ${listing.state}` : "Property";
  const sqft = listing?.sqft || 2000;
  const rooms = Math.max(3, (listing?.bedrooms || 3) + 2); // bedrooms + living + kitchen
  const estimatedCost = rooms * 450;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/transaction/${params?.id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Transaction
        </Button>
        <div className="mt-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center">
            <Palette className="h-6 w-6 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Home Staging Portal</h1>
            <p className="text-sm text-muted-foreground">{address}</p>
          </div>
        </div>
      </div>

      {/* Staging Impact Banner */}
      <Card className="mb-6 border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Sparkles className="h-8 w-8 text-pink-600 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-pink-900">Staged homes sell 73% faster and for 5-10% more</h2>
              <p className="text-sm text-pink-700 mt-1">
                NAR data shows staged homes spend 33 days on market vs 125 days unstaged. 
                On a {formatPrice(listing?.price || 560000)} home, that's {formatPrice((listing?.price || 560000) * 0.07)} more in your pocket.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { key: "plan", label: "Room-by-Room Plan", icon: Sofa },
          { key: "virtual", label: "Virtual Staging", icon: Image },
          { key: "showcase", label: "Before & After", icon: Eye },
          { key: "schedule", label: "Schedule Staging", icon: Calendar },
        ].map(tab => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            className="text-xs whitespace-nowrap"
            onClick={() => setActiveTab(tab.key as any)}
          >
            <tab.icon className="mr-1 h-3.5 w-3.5" /> {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">

          {/* Room-by-Room Plan */}
          {activeTab === "plan" && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sofa className="h-4 w-4 text-pink-600" /> Room-by-Room Staging Plan
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    AI-generated recommendations for your {listing?.bedrooms || 3}BR/{listing?.bathrooms || 2}BA home ({sqft.toLocaleString()} sqft)
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ROOM_PLANS.map((room, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${
                      room.priority === "Critical" ? "border-pink-200 bg-pink-50/50" :
                      room.priority === "High" ? "border-amber-200 bg-amber-50/30" :
                      "border-border"
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{room.room}</h3>
                          <Badge className={`text-[9px] ${
                            room.priority === "Critical" ? "bg-pink-100 text-pink-700" :
                            room.priority === "High" ? "bg-amber-100 text-amber-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{room.priority} Priority</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{room.cost}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{room.tips}</p>
                    </div>
                  ))}
                  <Card className="bg-muted/50 border-dashed">
                    <CardContent className="p-4 text-center">
                      <DollarSign className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-sm font-semibold">Estimated Total: {formatPrice(estimatedCost)}</p>
                      <p className="text-[10px] text-muted-foreground">For {rooms} rooms — typically pays for itself 10x over in higher sale price</p>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </>
          )}

          {/* Virtual Staging */}
          {activeTab === "virtual" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="h-4 w-4 text-purple-600" /> Virtual Staging
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Digitally stage empty rooms for listing photos — fraction of the cost of physical staging
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-semibold text-purple-900">How Virtual Staging Works</span>
                  </div>
                  <ol className="text-xs text-purple-700 space-y-1 list-decimal list-inside">
                    <li>Upload photos of empty or cluttered rooms</li>
                    <li>Choose a staging style below</li>
                    <li>AI removes existing furniture and digitally stages with new pieces</li>
                    <li>Receive staged photos within 24-48 hours</li>
                    <li>Use in your listing — buyers see the potential</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Choose Staging Style</Label>
                  {VIRTUAL_STAGING_OPTIONS.map((opt, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                        stagingStyle === opt.style ? "border-purple-400 bg-purple-50" : "border-border hover:border-purple-200"
                      }`}
                      onClick={() => setStagingStyle(opt.style)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{opt.style}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{opt.price}</Badge>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl border border-dashed text-center">
                  <Camera className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Upload Room Photos</p>
                  <p className="text-[10px] text-muted-foreground">Drop photos here or click to browse</p>
                  <Button size="sm" variant="outline" className="mt-2 text-xs">
                    <Camera className="mr-1 h-3 w-3" /> Upload Photos
                  </Button>
                </div>

                {stagingStyle && (
                  <Button className="w-full">
                    <Sparkles className="mr-1 h-4 w-4" /> Request Virtual Staging — {stagingStyle}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Before & After Showcase */}
          {activeTab === "showcase" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-600" /> Staging Before & After
                </CardTitle>
                <p className="text-xs text-muted-foreground">See the transformation staging creates</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {SHOWCASE_PHOTOS.map((photo, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border">
                    <img src={photo.url} alt={photo.label} className="w-full h-48 object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-semibold">{photo.label}</p>
                      <div className="flex gap-4 mt-1">
                        <div className="flex-1">
                          <p className="text-[10px] text-red-500 font-medium">Before</p>
                          <p className="text-xs text-muted-foreground">{photo.before}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-emerald-500 font-medium">After</p>
                          <p className="text-xs text-muted-foreground">{photo.after}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Schedule Staging */}
          {activeTab === "schedule" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600" /> Schedule Staging Consultation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What to Expect</h3>
                  <div className="space-y-2 text-xs text-blue-700">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong>Free consultation</strong> — Stager walks through your home and creates a custom plan</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong>Room-by-room quote</strong> — Choose which rooms to stage based on budget</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong>Staging day</strong> — Professional team brings furniture, art, and accessories</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong>Photo shoot</strong> — Professional photography of staged home for listing</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong>Timeline:</strong> Consultation to photos in 5-7 business days</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Preferred Date</Label>
                    <Input type="date" value={consultDate} onChange={e => setConsultDate(e.target.value)} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preferred Time</Label>
                    <Select value={consultTime} onValueChange={setConsultTime}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Select time" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9am">9:00 AM</SelectItem>
                        <SelectItem value="10am">10:00 AM</SelectItem>
                        <SelectItem value="11am">11:00 AM</SelectItem>
                        <SelectItem value="1pm">1:00 PM</SelectItem>
                        <SelectItem value="2pm">2:00 PM</SelectItem>
                        <SelectItem value="3pm">3:00 PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Special Notes for Stager</Label>
                  <Textarea placeholder="Any rooms you want to focus on? Furniture staying vs going? Budget constraints?" className="text-sm min-h-[80px]" />
                </div>

                <Button
                  className="w-full"
                  disabled={!consultDate || !consultTime}
                  onClick={() => {
                    toast({ title: "Consultation Requested!", description: `Staging consultation scheduled for ${consultDate} at ${consultTime}` });
                  }}
                >
                  <Calendar className="mr-1 h-4 w-4" /> Schedule Free Consultation
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: AI Chat */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20" style={{ maxHeight: "calc(100vh - 6rem)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Staging AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col" style={{ height: "400px" }}>
              <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                {messages.length === 0 && (
                  <div className="text-center py-6">
                    <Palette className="mx-auto mb-2 h-6 w-6 text-pink-400" />
                    <p className="text-xs text-muted-foreground">
                      Ask me about staging strategy, what rooms to prioritize, DIY tips, or virtual staging options.
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === "ai" ? "" : "flex-row-reverse"}`}>
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      msg.role === "ai" ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}>
                      {msg.role === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </div>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === "ai" ? "bg-muted" : "bg-primary text-primary-foreground"
                    }`}>
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    </div>
                  </div>
                ))}
                <div ref={messagesEnd} />
              </div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && input.trim()) sendMessage.mutate(input.trim()); }}
                  placeholder="Ask about staging..."
                  className="text-xs h-8"
                />
                <Button
                  size="sm"
                  className="h-8 px-3"
                  disabled={!input.trim() || sendMessage.isPending}
                  onClick={() => sendMessage.mutate(input.trim())}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
