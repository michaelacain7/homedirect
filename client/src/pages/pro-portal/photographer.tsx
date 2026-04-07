import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Home, Calendar, Image, CheckCircle, List } from "lucide-react";
import type { PortalInfo } from "./index";
import PortalChat from "./portal-chat";
import PortalUpload from "./portal-upload";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface PhotographerPortalProps {
  token: string;
  portalInfo: PortalInfo;
}

const SHOT_LIST = [
  { shot: "Front Exterior", tip: "Golden hour, wide-angle, curb appeal" },
  { shot: "Back Exterior", tip: "Capture yard, patio, pool if present" },
  { shot: "Kitchen", tip: "Multiple angles, highlight countertops & appliances" },
  { shot: "Living Room", tip: "Wide shot toward focal point, natural light" },
  { shot: "Primary Bedroom", tip: "From doorway, toward windows or focal wall" },
  { shot: "Primary Bathroom", tip: "Vanity, shower/tub, highlight finishes" },
  { shot: "All Bedrooms", tip: "At least one wide shot each" },
  { shot: "All Bathrooms", tip: "Clean, bright, mirrors wiped" },
  { shot: "Garage", tip: "Open door, clean, show size" },
  { shot: "Backyard/Pool", tip: "Sun behind camera, capture amenities" },
  { shot: "Aerial/Drone", tip: "If FAA-authorized, lot size & location" },
  { shot: "Neighborhood/Street", tip: "Context, proximity to amenities" },
];

export default function PhotographerPortal({ token, portalInfo }: PhotographerPortalProps) {
  const { professional, transaction, listing, seller } = portalInfo;
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ url: string; caption: string; name: string }>>([]);
  const [schedule, setSchedule] = useState({ date: "", time: "", notes: "" });
  const [completedShots, setCompletedShots] = useState<Set<string>>(new Set());

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/pro/${token}/documents`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const photoDocs = documents.filter((d: any) => d.type === "photos" || d.fileUrl?.match(/\.(jpg|jpeg|png|webp)/i));

  const handlePhotoUpload = (url: string, doc: any) => {
    setUploadedPhotos(prev => [...prev, { url, caption: "", name: doc?.name || url.split("/").pop() || "Photo" }]);
  };

  const toggleShot = (shot: string) => {
    setCompletedShots(prev => {
      const next = new Set(prev);
      if (next.has(shot)) next.delete(shot);
      else next.add(shot);
      return next;
    });
  };

  const images = listing ? (() => { try { return JSON.parse(listing.images); } catch { return []; } })() : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Property Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="w-4 h-4 text-green-600" />
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {images[0] && (
                  <img src={images[0]} alt="Property" className="w-28 h-20 object-cover rounded-lg shrink-0" />
                )}
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {listing ? `${listing.address}, ${listing.city}, ${listing.state}` : "Address not available"}
                  </p>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    {listing && (
                      <>
                        <span>{listing.bedrooms} bed · {listing.bathrooms} bath · {listing.sqft.toLocaleString()} sqft</span>
                        {listing.yearBuilt && <span>Built {listing.yearBuilt}</span>}
                      </>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Contact: {seller?.fullName || "Seller"}
                    {seller?.phone && ` · ${seller.phone}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4 text-blue-600" />
                Shoot Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Shoot Date</Label>
                  <Input
                    type="date"
                    value={schedule.date}
                    onChange={e => setSchedule(p => ({ ...p, date: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Arrival Time</Label>
                  <Input
                    type="time"
                    value={schedule.time}
                    onChange={e => setSchedule(p => ({ ...p, time: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Access Instructions / Notes</Label>
                  <Input
                    placeholder="e.g. Lockbox code: 1234, enter from side gate"
                    value={schedule.notes}
                    onChange={e => setSchedule(p => ({ ...p, notes: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shot List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <List className="w-4 h-4 text-orange-600" />
                Shot List
                <Badge variant="outline" className="ml-auto text-xs">
                  {completedShots.size}/{SHOT_LIST.length} done
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SHOT_LIST.map(({ shot, tip }) => {
                  const done = completedShots.has(shot);
                  return (
                    <button
                      key={shot}
                      onClick={() => toggleShot(shot)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        done
                          ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                          : "border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {done
                          ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                          : <Camera className="w-4 h-4 text-gray-400 shrink-0" />
                        }
                        <span className={`text-sm font-medium ${done ? "text-green-700 dark:text-green-300 line-through" : "text-gray-900 dark:text-white"}`}>
                          {shot}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 pl-6">{tip}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upload Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Image className="w-4 h-4 text-pink-600" />
                Upload Photos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalUpload
                token={token}
                docType="photos"
                label="Upload Photos (select multiple)"
                accept="image/*"
                multiple={true}
                onUpload={handlePhotoUpload}
              />

              {/* Photo Grid */}
              {(uploadedPhotos.length > 0 || photoDocs.length > 0) && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Uploaded ({uploadedPhotos.length + photoDocs.length} photos)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photoDocs.map((doc: any, i: number) => (
                      <div key={`existing-${i}`} className="space-y-1">
                        <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border">
                          <img src={doc.fileUrl} alt={doc.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-xs text-gray-500 truncate">{doc.name}</p>
                      </div>
                    ))}
                    {uploadedPhotos.map((photo, i) => (
                      <div key={`new-${i}`} className="space-y-1">
                        <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border">
                          <img src={photo.url} alt={photo.caption || photo.name} className="w-full h-full object-cover" />
                        </div>
                        <input
                          type="text"
                          placeholder="Add caption..."
                          value={photo.caption}
                          onChange={e => setUploadedPhotos(prev =>
                            prev.map((p, j) => j === i ? { ...p, caption: e.target.value } : p)
                          )}
                          className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-transparent"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <PortalChat token={token} proName={professional.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
