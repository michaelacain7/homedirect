import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, Camera, Check, DollarSign, MapPin, HomeIcon, Bot, X, Upload, Sparkles, Loader2, TrendingUp } from "lucide-react";

const STEPS = ["Property Details", "Description & Features", "Photos & Pricing", "Review & List"];

export default function Sell() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiPriceSuggestion, setAiPriceSuggestion] = useState<null | {
    suggestedPrice: number;
    priceRange: { low: number; high: number };
    rationale: string;
    comparables: Array<{ address: string; sqft: number; price: number; pricePerSqft: number }>;
    netProceeds: number;
  }>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", address: "", city: "", state: "FL", zip: "",
    price: "", bedrooms: "", bathrooms: "", sqft: "", lotSize: "",
    yearBuilt: "", propertyType: "single_family", features: "",
    hoaFee: "", taxAmount: "",
  });

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append("images", file));

      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }

      const data = await res.json();
      setUploadedImages(prev => [...prev, ...data.urls]);
      toast({ title: "Photos uploaded", description: `${data.urls.length} photo(s) added successfully.` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset file input so same files can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (url: string) => {
    setUploadedImages(prev => prev.filter(u => u !== url));
  };

  const submit = async () => {
    if (!user) return toast({ title: "Sign in required", variant: "destructive" });
    setSubmitting(true);
    try {
      const featureList = form.features.split(",").map(f => f.trim()).filter(Boolean);

      // Use uploaded images, or fallback to placeholder images
      const images = uploadedImages.length > 0
        ? uploadedImages
        : [
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
          ];

      await apiRequest("POST", "/api/listings", {
        sellerId: user.id, title: form.title, description: form.description,
        address: form.address, city: form.city, state: form.state, zip: form.zip,
        price: parseFloat(form.price), bedrooms: parseInt(form.bedrooms),
        bathrooms: parseFloat(form.bathrooms), sqft: parseInt(form.sqft),
        lotSize: form.lotSize ? parseFloat(form.lotSize) : 0,
        yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt) : null,
        propertyType: form.propertyType,
        features: JSON.stringify(featureList),
        images: JSON.stringify(images),
        hoaFee: form.hoaFee ? parseFloat(form.hoaFee) : 0,
        taxAmount: form.taxAmount ? parseFloat(form.taxAmount) : 0,
      });
      toast({ title: "Listing created", description: "Your property is now live. AI will help manage inquiries and offers." });
      setLocation("/dashboard");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center px-4">
        <HomeIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="mb-1 text-lg font-semibold">Sign in to list your home</h2>
        <p className="text-sm text-muted-foreground">Create an account or sign in to start selling your property with HomeDirectAI.</p>
      </div>
    );
  }

  const platformFee = form.price ? parseFloat(form.price) * 0.01 : 0;
  const traditionalFee = form.price ? parseFloat(form.price) * 0.06 : 0;

  const getAIPrice = async () => {
    if (!form.sqft) return toast({ title: "Enter sqft first", description: "We need the square footage to estimate a price.", variant: "destructive" });
    setLoadingPrice(true);
    try {
      const res = await apiRequest("POST", "/api/ai/price-suggestion", {
        address: form.address,
        city: form.city,
        state: form.state,
        beds: form.bedrooms,
        baths: form.bathrooms,
        sqft: form.sqft,
        yearBuilt: form.yearBuilt,
        propertyType: form.propertyType,
      });
      const data = await res.json();
      setAiPriceSuggestion(data);
      // Auto-fill price with suggested
      if (data.suggestedPrice && !form.price) {
        update("price", data.suggestedPrice.toString());
      }
    } catch (e: any) {
      toast({ title: "AI pricing unavailable", description: "Using manual pricing mode.", variant: "destructive" });
    } finally {
      setLoadingPrice(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" data-testid="page-sell">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">List Your Home</h1>
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

      {/* Step 1: Property Details */}
      {step === 0 && (
        <Card className="p-6 space-y-4" data-testid="step-property-details">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Property Details</h2>
          </div>
          <div className="space-y-2">
            <Label>Property Title</Label>
            <Input placeholder="e.g., Stunning Waterfront Colonial" value={form.title} onChange={e => update("title", e.target.value)} data-testid="input-title" />
          </div>
          <div className="space-y-2">
            <Label>Street Address</Label>
            <Input placeholder="1234 Main St" value={form.address} onChange={e => update("address", e.target.value)} data-testid="input-address" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input placeholder="Tampa" value={form.city} onChange={e => update("city", e.target.value)} data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={e => update("state", e.target.value)} data-testid="input-state" />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input placeholder="33601" value={form.zip} onChange={e => update("zip", e.target.value)} data-testid="input-zip" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Property Type</Label>
              <Select value={form.propertyType} onValueChange={v => update("propertyType", v)}>
                <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_family">Single Family</SelectItem>
                  <SelectItem value="condo">Condo</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="multi_family">Multi Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year Built</Label>
              <Input type="number" placeholder="2005" value={form.yearBuilt} onChange={e => update("yearBuilt", e.target.value)} data-testid="input-year" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Beds</Label>
              <Input type="number" placeholder="3" value={form.bedrooms} onChange={e => update("bedrooms", e.target.value)} data-testid="input-beds" />
            </div>
            <div className="space-y-2">
              <Label>Baths</Label>
              <Input type="number" step="0.5" placeholder="2" value={form.bathrooms} onChange={e => update("bathrooms", e.target.value)} data-testid="input-baths" />
            </div>
            <div className="space-y-2">
              <Label>Sqft</Label>
              <Input type="number" placeholder="2000" value={form.sqft} onChange={e => update("sqft", e.target.value)} data-testid="input-sqft" />
            </div>
            <div className="space-y-2">
              <Label>Lot (acres)</Label>
              <Input type="number" step="0.01" placeholder="0.25" value={form.lotSize} onChange={e => update("lotSize", e.target.value)} data-testid="input-lot" />
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Description & Features */}
      {step === 1 && (
        <Card className="p-6 space-y-4" data-testid="step-description">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Description & Features</h2>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={6} placeholder="Describe your home. AI will help optimize this for buyers..."
              value={form.description} onChange={e => update("description", e.target.value)}
              data-testid="input-description"
            />
          </div>
          <div className="space-y-2">
            <Label>Features (comma-separated)</Label>
            <Textarea
              rows={3} placeholder="Pool, Updated Kitchen, Hardwood Floors, 2-Car Garage..."
              value={form.features} onChange={e => update("features", e.target.value)}
              data-testid="input-features"
            />
          </div>
        </Card>
      )}

      {/* Step 3: Photos & Pricing */}
      {step === 2 && (
        <Card className="p-6 space-y-4" data-testid="step-pricing">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Photos & Pricing</h2>
          </div>

          {/* Real file upload area */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-images"
            />
            <div
              className="rounded-md border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Upload className="mx-auto mb-2 h-6 w-6 text-primary animate-pulse" />
                  <p className="text-sm font-medium">Uploading...</p>
                </>
              ) : (
                <>
                  <Camera className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload Photos</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to select images (max 10, 10MB each)</p>
                </>
              )}
            </div>

            {/* Preview uploaded images */}
            {uploadedImages.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {uploadedImages.map((url, idx) => (
                  <div key={url} className="relative group aspect-square">
                    <img
                      src={url}
                      alt={`Upload ${idx + 1}`}
                      className="w-full h-full object-cover rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadedImages.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground text-center">
                No photos uploaded — placeholder images will be used
              </p>
            )}
          </div>

          {/* AI Price Suggestion */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full border-primary/40 text-primary hover:bg-primary/5"
              onClick={getAIPrice}
              disabled={loadingPrice}
              data-testid="button-ai-price"
            >
              {loadingPrice ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing property...</>  
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Get AI Price Suggestion</>  
              )}
            </Button>

            {aiPriceSuggestion && (
              <Card className="p-4 border-primary/20 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">AI Recommended Price</span>
                </div>
                <div className="text-center py-1">
                  <p className="text-2xl font-bold">
                    ${aiPriceSuggestion.priceRange.low.toLocaleString()} — ${aiPriceSuggestion.priceRange.high.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Suggested: ${aiPriceSuggestion.suggestedPrice.toLocaleString()}</p>
                </div>
                <p className="text-xs text-muted-foreground">{aiPriceSuggestion.rationale}</p>

                {/* Comparables */}
                <div className="space-y-1">
                  <p className="text-xs font-medium">Comparable Sales:</p>
                  {aiPriceSuggestion.comparables.map((comp, i) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span>{comp.address}</span>
                      <span>${comp.price.toLocaleString()} · ${comp.pricePerSqft}/sqft</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 p-2.5 text-xs">
                  <span className="text-green-700 dark:text-green-400 font-medium">Estimated net proceeds after 1% fee:</span>
                  <span className="font-bold text-green-700 dark:text-green-400">${aiPriceSuggestion.netProceeds.toLocaleString()}</span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => update("price", aiPriceSuggestion.suggestedPrice.toString())}
                >
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Use Suggested Price
                </Button>
              </Card>
            )}
          </div>

          <div className="space-y-2">
            <Label>Listing Price ($)</Label>
            <Input type="number" placeholder="500000" value={form.price} onChange={e => update("price", e.target.value)} data-testid="input-price" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>HOA Fee ($/month)</Label>
              <Input type="number" placeholder="0" value={form.hoaFee} onChange={e => update("hoaFee", e.target.value)} data-testid="input-hoa" />
            </div>
            <div className="space-y-2">
              <Label>Annual Taxes ($)</Label>
              <Input type="number" placeholder="5000" value={form.taxAmount} onChange={e => update("taxAmount", e.target.value)} data-testid="input-tax" />
            </div>
          </div>
          {form.price && (
            <div className="rounded-md bg-primary/10 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Your fee (1%)</span>
                <span className="font-medium">${platformFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Traditional agent fee (6%)</span>
                <span className="line-through">${traditionalFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary border-t pt-1">
                <span>You save</span>
                <span>${(traditionalFee - platformFee).toLocaleString()}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 3 && (
        <Card className="p-6 space-y-4" data-testid="step-review">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Review Your Listing</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium">{form.title || "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Address</span>
              <span className="font-medium">{form.address}, {form.city}, {form.state} {form.zip}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{form.price ? `$${parseFloat(form.price).toLocaleString()}` : "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Beds / Baths / Sqft</span>
              <span className="font-medium">{form.bedrooms} bd / {form.bathrooms} ba / {form.sqft} sqft</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium capitalize">{form.propertyType.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Photos</span>
              <span className="font-medium">{uploadedImages.length > 0 ? `${uploadedImages.length} uploaded` : "Placeholder images"}</span>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            By listing, you agree to the 1% closing fee. AI will handle all buyer inquiries, schedule walkthroughs
            with local chaperones, negotiate offers, and prepare closing documents on your behalf.
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : setLocation("/")} data-testid="button-prev-step">
          <ArrowLeft className="mr-1 h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep(step + 1)} data-testid="button-next-step">
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={submitting} data-testid="button-publish">
            {submitting ? "Publishing..." : "Publish Listing"}
          </Button>
        )}
      </div>
    </div>
  );
}
