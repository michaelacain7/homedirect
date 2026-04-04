import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Save, Upload, X, Loader2, Lock, Camera } from "lucide-react";
import type { Listing } from "@shared/schema";

export default function EditListing() {
  const [, params] = useRoute("/edit-listing/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    city: "",
    state: "FL",
    zip: "",
    price: "",
    bedrooms: "",
    bathrooms: "",
    sqft: "",
    lotSize: "",
    yearBuilt: "",
    propertyType: "single_family",
    features: "",
    hoaFee: "",
    taxAmount: "",
    status: "active",
  });

  const { data: listing, isLoading } = useQuery<Listing>({
    queryKey: ["/api/listings", params?.id],
    queryFn: () => apiRequest("GET", `/api/listings/${params?.id}`).then((r) => r.json()),
    enabled: !!params?.id,
  });

  // Pre-fill form when listing loads
  useEffect(() => {
    if (!listing) return;
    const features = (() => {
      try { return JSON.parse(listing.features || "[]").join(", "); } catch { return ""; }
    })();
    const images = (() => {
      try { return JSON.parse(listing.images || "[]"); } catch { return []; }
    })();
    setForm({
      title: listing.title || "",
      description: listing.description || "",
      address: listing.address || "",
      city: listing.city || "",
      state: listing.state || "FL",
      zip: listing.zip || "",
      price: listing.price?.toString() || "",
      bedrooms: listing.bedrooms?.toString() || "",
      bathrooms: listing.bathrooms?.toString() || "",
      sqft: listing.sqft?.toString() || "",
      lotSize: listing.lotSize?.toString() || "",
      yearBuilt: listing.yearBuilt?.toString() || "",
      propertyType: listing.propertyType || "single_family",
      features,
      hoaFee: listing.hoaFee?.toString() || "",
      taxAmount: listing.taxAmount?.toString() || "",
      status: listing.status || "active",
    });
    setUploadedImages(images);
  }, [listing]);

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("images", file));
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
      setUploadedImages((prev) => [...prev, ...data.urls]);
      toast({ title: "Photos uploaded", description: `${data.urls.length} photo(s) added.` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const featureList = form.features
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const payload: any = {
        title: form.title,
        description: form.description,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        price: parseFloat(form.price),
        bedrooms: parseInt(form.bedrooms),
        bathrooms: parseFloat(form.bathrooms),
        sqft: parseInt(form.sqft),
        propertyType: form.propertyType,
        status: form.status,
        images: JSON.stringify(uploadedImages),
        features: JSON.stringify(featureList),
      };
      if (form.lotSize) payload.lotSize = parseFloat(form.lotSize);
      if (form.yearBuilt) payload.yearBuilt = parseInt(form.yearBuilt);
      if (form.hoaFee) payload.hoaFee = parseFloat(form.hoaFee);
      if (form.taxAmount) payload.taxAmount = parseFloat(form.taxAmount);

      const res = await apiRequest("PATCH", `/api/listings/${params?.id}`, payload);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Listing saved", description: "Your listing has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/listings", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/seller", user?.id] });
      setLocation("/dashboard");
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="py-20 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm">Sign in to edit listings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 animate-pulse space-y-4">
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  if (listing && listing.sellerId !== user.id) {
    return (
      <div className="py-20 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Not Authorized</h2>
        <p className="text-sm text-muted-foreground mt-1">You can only edit your own listings.</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-testid="page-edit-listing">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Edit Listing</h1>
          <p className="text-sm text-muted-foreground">{listing?.address || `Listing #${params?.id}`}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Property Details</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Listing Title</Label>
              <Input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g., Stunning Waterfront Colonial"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Describe your property..."
              />
            </div>
          </div>
        </Card>

        {/* Address */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Address</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Street Address</Label>
              <Input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Tampa" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="FL" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>ZIP</Label>
              <Input value={form.zip} onChange={(e) => update("zip", e.target.value)} placeholder="33701" />
            </div>
          </div>
        </Card>

        {/* Specs */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Property Specs</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Price ($)</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="450000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bedrooms</Label>
              <Input type="number" value={form.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="3" />
            </div>
            <div className="space-y-1.5">
              <Label>Bathrooms</Label>
              <Input type="number" step="0.5" value={form.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <Label>Sqft</Label>
              <Input type="number" value={form.sqft} onChange={(e) => update("sqft", e.target.value)} placeholder="1800" />
            </div>
            <div className="space-y-1.5">
              <Label>Lot Size (acres)</Label>
              <Input type="number" step="0.01" value={form.lotSize} onChange={(e) => update("lotSize", e.target.value)} placeholder="0.25" />
            </div>
            <div className="space-y-1.5">
              <Label>Year Built</Label>
              <Input type="number" value={form.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} placeholder="1990" />
            </div>
            <div className="space-y-1.5">
              <Label>HOA Fee/mo ($)</Label>
              <Input type="number" value={form.hoaFee} onChange={(e) => update("hoaFee", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Annual Tax ($)</Label>
              <Input type="number" value={form.taxAmount} onChange={(e) => update("taxAmount", e.target.value)} placeholder="4500" />
            </div>
            <div className="space-y-1.5">
              <Label>Property Type</Label>
              <Select value={form.propertyType} onValueChange={(v) => update("propertyType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_family">Single Family</SelectItem>
                  <SelectItem value="condo">Condo</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="multi_family">Multi Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Features (comma-separated)</Label>
            <Input
              value={form.features}
              onChange={(e) => update("features", e.target.value)}
              placeholder="Pool, Garage, Hardwood Floors, Updated Kitchen"
            />
          </div>
        </Card>

        {/* Status */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Listing Status</h2>
          <Select value={form.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        {/* Photos */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Photos</h2>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload Photos"}
          </Button>
          {uploadedImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {uploadedImages.map((url, i) => (
                <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-md">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setUploadedImages((imgs) => imgs.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Save Button */}
        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !form.title || !form.price}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
