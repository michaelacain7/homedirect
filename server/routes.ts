import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertListingSchema, insertOfferSchema, insertWalkthroughSchema, insertDocumentSchema, insertMessageSchema, insertTransactionSchema, insertSavedSearchSchema, insertFavoriteSchema, insertChaperoneApplicationSchema, insertChaperonePayoutSchema } from "@shared/schema";
import { createPaymentIntent, TEST_MODE } from "./payments";
import { sendNewOfferEmail, sendOfferStatusEmail, sendWalkthroughScheduledEmail, sendWalkthroughAssignedEmail, sendDocumentReadyEmail } from "./email";
import { getAINegotiationResponse } from "./ai-negotiation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { passport } from "./auth";
import fs from "fs";
import path from "path";
import { generatePurchaseAgreement, generateSellerDisclosure, generateClosingDisclosure } from "./documents";

// Ensure uploads directory exists
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads", { recursive: true });
}

// Multer configuration for image uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

// Geocoding via Nominatim (free, no API key)
async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "User-Agent": "HomeDirectAI/1.0" } }
    );
    const data = await res.json() as any[];
    if (data.length > 0)
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

// requireAuth middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
  next();
}

// requireAdmin middleware
function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Seed data on first load
function seedDatabase() {
  const existingUsers = storage.getUser(1);
  if (existingUsers) return;

  // Hash password for demo users (synchronous bcrypt)
  const demoHash = bcrypt.hashSync("demo123", 10);
  const adminHash = bcrypt.hashSync("admin123", 10);

  // Create admin user
  storage.createUser({ email: "admin@homedirectai.com", password: adminHash, fullName: "Platform Admin", phone: "", role: "admin" });

  // Create demo users with hashed passwords
  const seller1 = storage.createUser({ email: "sarah@example.com", password: demoHash, fullName: "Sarah Mitchell", phone: "813-555-0101", role: "seller", location: "Tampa, FL", bio: "Selling my family home after 15 wonderful years." });
  const seller2 = storage.createUser({ email: "james@example.com", password: demoHash, fullName: "James Chen", phone: "727-555-0202", role: "seller", location: "St. Petersburg, FL", bio: "Real estate investor transitioning properties." });
  const buyer1 = storage.createUser({ email: "mike@example.com", password: demoHash, fullName: "Michael Cain", phone: "813-555-0303", role: "buyer", location: "St. Petersburg, FL", bio: "Looking for the perfect family home." });
  const chaperone1 = storage.createUser({ email: "lisa@example.com", password: demoHash, fullName: "Lisa Rodriguez", phone: "813-555-0404", role: "chaperone", location: "Tampa, FL", bio: "Licensed realtor earning extra income as a walkthrough chaperone." });

  // Create demo listings
  const listings = [
    {
      sellerId: seller1.id, title: "Stunning Waterfront Colonial",
      description: "Beautifully renovated 4-bedroom waterfront home with panoramic bay views. Open floor plan, chef's kitchen with quartz countertops, hardwood floors throughout. Private dock with boat lift. Minutes from downtown St. Petersburg.",
      address: "1842 Bayshore Blvd", city: "St. Petersburg", state: "FL", zip: "33701",
      price: 875000, bedrooms: 4, bathrooms: 3, sqft: 3200, lotSize: 0.35, yearBuilt: 1998,
      propertyType: "single_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800"
      ]),
      features: JSON.stringify(["Waterfront", "Private Dock", "Renovated Kitchen", "Hardwood Floors", "Bay Views", "2-Car Garage"]),
      latitude: 27.7676, longitude: -82.6403, hoaFee: 150, taxAmount: 8750
    },
    {
      sellerId: seller1.id, title: "Modern Downtown Condo with Skyline Views",
      description: "Sleek 2-bedroom condo in the heart of downtown Tampa. Floor-to-ceiling windows, modern finishes, and resort-style amenities including pool, gym, and rooftop terrace. Walk to restaurants, shopping, and Riverwalk.",
      address: "505 E Jackson St Unit 1204", city: "Tampa", state: "FL", zip: "33602",
      price: 425000, bedrooms: 2, bathrooms: 2, sqft: 1450, lotSize: 0, yearBuilt: 2019,
      propertyType: "condo", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800"
      ]),
      features: JSON.stringify(["Downtown Location", "Skyline Views", "Pool", "Gym", "Concierge", "Valet Parking"]),
      latitude: 27.9475, longitude: -82.4572, hoaFee: 650, taxAmount: 4250
    },
    {
      sellerId: seller2.id, title: "Charming Craftsman Bungalow",
      description: "Adorable 3-bedroom Craftsman bungalow in the desirable Old Northeast neighborhood. Original hardwood floors, updated kitchen and baths, large screened porch. Walking distance to coffee shops and parks.",
      address: "725 15th Ave NE", city: "St. Petersburg", state: "FL", zip: "33704",
      price: 585000, bedrooms: 3, bathrooms: 2, sqft: 1850, lotSize: 0.18, yearBuilt: 1925,
      propertyType: "single_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
        "https://images.unsplash.com/photo-1600573472556-e636c2acda9e?w=800"
      ]),
      features: JSON.stringify(["Craftsman Style", "Hardwood Floors", "Screened Porch", "Updated Kitchen", "Walk to Shops", "Corner Lot"]),
      latitude: 27.7835, longitude: -82.6285, hoaFee: 0, taxAmount: 5850
    },
    {
      sellerId: seller2.id, title: "Luxury Townhome in Channelside",
      description: "Stunning 3-story townhome with rooftop terrace and water views. High-end finishes throughout including Italian tile, custom cabinetry, and smart home technology. Two-car garage. Steps from Sparkman Wharf.",
      address: "143 S 12th St", city: "Tampa", state: "FL", zip: "33602",
      price: 695000, bedrooms: 3, bathrooms: 3.5, sqft: 2400, lotSize: 0.05, yearBuilt: 2021,
      propertyType: "townhouse", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800",
        "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800"
      ]),
      features: JSON.stringify(["Rooftop Terrace", "Water Views", "Smart Home", "Italian Tile", "2-Car Garage", "Walk to Dining"]),
      latitude: 27.9395, longitude: -82.4505, hoaFee: 350, taxAmount: 6950
    },
    {
      sellerId: seller1.id, title: "Family-Friendly Ranch in Seminole",
      description: "Spacious 4-bedroom ranch on a quiet cul-de-sac. Updated throughout with new roof, HVAC, and impact windows. Large fenced backyard with pool, perfect for families. Top-rated schools nearby.",
      address: "9520 Seminole Blvd", city: "Seminole", state: "FL", zip: "33772",
      price: 475000, bedrooms: 4, bathrooms: 2.5, sqft: 2100, lotSize: 0.28, yearBuilt: 1985,
      propertyType: "single_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800",
        "https://images.unsplash.com/photo-1600585153490-76fb20a32601?w=800",
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800"
      ]),
      features: JSON.stringify(["Pool", "Fenced Yard", "New Roof", "Impact Windows", "Cul-de-Sac", "Top Schools"]),
      latitude: 27.8397, longitude: -82.7901, hoaFee: 0, taxAmount: 4750
    },
    {
      sellerId: seller2.id, title: "Beachside Retreat in Treasure Island",
      description: "Bright and airy 2-bedroom beach cottage just two blocks from the Gulf. Recently renovated with coastal chic design, new appliances, and tropical landscaping. Ideal vacation home or primary residence.",
      address: "312 Gulf Blvd", city: "Treasure Island", state: "FL", zip: "33706",
      price: 549000, bedrooms: 2, bathrooms: 1, sqft: 1100, lotSize: 0.12, yearBuilt: 1960,
      propertyType: "single_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
        "https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?w=800",
        "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=800"
      ]),
      features: JSON.stringify(["Near Beach", "Renovated", "Tropical Landscaping", "Coastal Design", "New Appliances", "Vacation Ready"]),
      latitude: 27.7681, longitude: -82.7687, hoaFee: 0, taxAmount: 5490
    },
    {
      sellerId: seller1.id, title: "Elegant Estate in Snell Isle",
      description: "Magnificent 5-bedroom Mediterranean estate on prestigious Snell Isle. Grand foyer, formal living and dining rooms, gourmet kitchen, home office, and resort-style pool. Deep water dock with no bridges to the bay.",
      address: "1200 Snell Isle Blvd NE", city: "St. Petersburg", state: "FL", zip: "33704",
      price: 2150000, bedrooms: 5, bathrooms: 4.5, sqft: 5200, lotSize: 0.45, yearBuilt: 2005,
      propertyType: "single_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
        "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800",
        "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800"
      ]),
      features: JSON.stringify(["Mediterranean", "Deep Water Dock", "Resort Pool", "Home Office", "Gourmet Kitchen", "No Bridges to Bay"]),
      latitude: 27.7923, longitude: -82.6178, hoaFee: 200, taxAmount: 21500
    },
    {
      sellerId: seller2.id, title: "Investment Duplex in Gulfport",
      description: "Well-maintained duplex with two 2-bed/1-bath units. Both units currently rented with excellent tenants. Great cash flow property in the artsy Gulfport community. Walking distance to beach and restaurants.",
      address: "2817 Beach Blvd S", city: "Gulfport", state: "FL", zip: "33707",
      price: 385000, bedrooms: 4, bathrooms: 2, sqft: 1800, lotSize: 0.15, yearBuilt: 1955,
      propertyType: "multi_family", status: "active",
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800",
        "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=800",
        "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800"
      ]),
      features: JSON.stringify(["Duplex", "Income Property", "Both Units Rented", "Near Beach", "Artsy Community", "Walk to Dining"]),
      latitude: 27.7482, longitude: -82.6937, hoaFee: 0, taxAmount: 3850
    }
  ];

  listings.forEach(l => storage.createListing(l as any));

  // Create a demo offer
  storage.createOffer({
    listingId: 3, buyerId: buyer1.id, amount: 560000, status: "pending",
    message: "We love this home! Our family is very interested. We're pre-approved and can close in 30 days.",
    contingencies: JSON.stringify(["Inspection", "Financing", "Appraisal"]),
    closingDate: "2026-05-15"
  });

  // Create a demo walkthrough
  storage.createWalkthrough({
    listingId: 1, buyerId: buyer1.id, scheduledDate: "2026-04-10", scheduledTime: "2:00 PM",
    status: "requested", chaperonePayment: 20, buyerNotes: "Would love to see the dock area and kitchen."
  });

  // Create demo messages for offer negotiation
  storage.createMessage({ offerId: 1, senderId: buyer1.id, senderType: "user", content: "We'd like to offer $560,000 for the Craftsman bungalow. We're pre-approved and flexible on closing." });
  storage.createMessage({ offerId: 1, senderId: null, senderType: "ai", content: "I've submitted your offer of $560,000 to the seller. The listing price is $585,000, so you're offering about 4.3% below asking. I'll keep you updated on the seller's response. In the meantime, would you like me to prepare any contingency clauses?" });

  // Create chaperone application for lisa@example.com (user id 4)
  storage.createChaperoneApplication({
    userId: chaperone1.id,
    status: "approved",
    firstName: "Lisa",
    lastName: "Rodriguez",
    email: "lisa@example.com",
    phone: "813-555-0404",
    address: "4210 W Cass St",
    city: "Tampa",
    state: "FL",
    zip: "33609",
    latitude: 27.9398,
    longitude: -82.4944,
    dateOfBirth: "1988-03-15",
    ssn: "1234",
    driversLicense: "FL-G12345678",
    hasRealtorLicense: true,
    realtorLicenseNumber: "FL-RE-3047821",
    hasVehicle: true,
    maxTravelMiles: 25,
    availability: JSON.stringify(["weekdays", "weekends", "evenings"]),
    backgroundCheckStatus: "passed",
    backgroundCheckDate: "2026-03-01",
    bankAccountName: "Lisa Rodriguez",
    bankRoutingNumber: "021000021",
    bankAccountNumber: "4532109876",
    bankAccountType: "checking",
    agreedToTerms: true,
    agreedToTermsDate: "2026-03-01",
    completedTraining: true,
  });

  // Create demo chaperone payouts for lisa
  storage.createChaperonePayout({
    chaperoneId: chaperone1.id,
    walkthroughId: 1,
    amount: 20,
    type: "earning",
    status: "completed",
    description: "Walkthrough showing at 1842 Bayshore Blvd",
    bankLast4: "9876",
  });
  storage.createChaperonePayout({
    chaperoneId: chaperone1.id,
    walkthroughId: null,
    amount: 20,
    type: "earning",
    status: "completed",
    description: "Walkthrough showing at 725 15th Ave NE",
    bankLast4: "9876",
  });
  storage.createChaperonePayout({
    chaperoneId: chaperone1.id,
    walkthroughId: null,
    amount: -30,
    type: "payout",
    status: "completed",
    description: "Bank transfer payout",
    bankLast4: "9876",
  });
}

export function registerRoutes(server: Server, app: Express) {
  seedDatabase();

  // ── Auth Routes ──
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = storage.getUserByEmail(data.email);
      if (existing) return res.status(400).json({ message: "Email already registered" });
      const hashedPassword = bcrypt.hashSync(data.password, 10);
      const user = storage.createUser({ ...data, password: hashedPassword });
      // Log the user in immediately after registration
      await new Promise<void>((resolve, reject) => {
        (req as any).logIn(user, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const { password, ...safe } = user;
      res.json(safe);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password, ...safe } = user;
        res.json(safe);
      });
    })(req, res, next);
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safe } = req.user as any;
    res.json(safe);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  // ── File Upload Route ──
  app.post("/api/upload", requireAuth, upload.array("images", 10), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });
    const urls = files.map(f => `/uploads/${f.filename}`);
    res.json({ urls });
  });

  // ── User Routes ──
  app.get("/api/users/:id", (req, res) => {
    const user = storage.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  app.patch("/api/users/:id", requireAuth, (req, res) => {
    const user = storage.updateUser(parseInt(req.params.id), req.body);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  // ── Listing Routes ──
  app.get("/api/listings", (req, res) => {
    const filters: any = {};
    if (req.query.city) filters.city = req.query.city;
    if (req.query.state) filters.state = req.query.state;
    if (req.query.minPrice) filters.minPrice = parseFloat(req.query.minPrice as string);
    if (req.query.maxPrice) filters.maxPrice = parseFloat(req.query.maxPrice as string);
    if (req.query.minBeds) filters.minBeds = parseInt(req.query.minBeds as string);
    if (req.query.maxBeds) filters.maxBeds = parseInt(req.query.maxBeds as string);
    if (req.query.minBaths) filters.minBaths = parseFloat(req.query.minBaths as string);
    if (req.query.maxBaths) filters.maxBaths = parseFloat(req.query.maxBaths as string);
    if (req.query.minSqft) filters.minSqft = parseInt(req.query.minSqft as string);
    if (req.query.maxSqft) filters.maxSqft = parseInt(req.query.maxSqft as string);
    if (req.query.propertyType) filters.propertyType = req.query.propertyType;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.search) filters.search = req.query.search;
    if (req.query.sort) filters.sort = req.query.sort;
    if (req.query.page) filters.page = parseInt(req.query.page as string);
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    res.json(storage.getListings(Object.keys(filters).length > 0 ? filters : undefined));
  });

  app.get("/api/listings/featured", (_req, res) => {
    res.json(storage.getFeaturedListings());
  });

  // Map bounds search (must be before :id route)
  app.get("/api/listings/bounds", (req, res) => {
    const { north, south, east, west, minPrice, maxPrice, minBeds, maxBeds, propertyType } = req.query;
    if (!north || !south || !east || !west) {
      return res.status(400).json({ message: "Bounds required: north, south, east, west" });
    }
    const { listings: allListings } = storage.getListings({
      status: "active",
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      minBeds: minBeds ? parseInt(minBeds as string) : undefined,
      maxBeds: maxBeds ? parseInt(maxBeds as string) : undefined,
      propertyType: propertyType && propertyType !== "all" ? propertyType as string : undefined,
    });
    const bounded = allListings.filter((l: any) =>
      l.latitude && l.longitude &&
      l.latitude >= parseFloat(south as string) &&
      l.latitude <= parseFloat(north as string) &&
      l.longitude >= parseFloat(west as string) &&
      l.longitude <= parseFloat(east as string)
    );
    res.json(bounded);
  });

  app.get("/api/listings/seller/:sellerId", (req, res) => {
    res.json(storage.getListingsBySeller(parseInt(req.params.sellerId)));
  });

  app.get("/api/listings/:id", (req, res) => {
    const listing = storage.getListing(parseInt(req.params.id));
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    res.json(listing);
  });

  app.post("/api/listings", requireAuth, async (req, res) => {
    try {
      const data = insertListingSchema.parse(req.body);
      // Auto-geocode the address
      let lat: number | undefined;
      let lng: number | undefined;
      if (data.address && data.city && data.state && data.zip) {
        const coords = await geocodeAddress(data.address, data.city, data.state, data.zip);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }
      const listing = storage.createListing({
        ...data,
        latitude: lat ?? data.latitude,
        longitude: lng ?? data.longitude,
      });
      res.json(listing);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/listings/:id", requireAuth, (req, res) => {
    const listingId = parseInt(req.params.id);
    const existing = storage.getListing(listingId);
    if (!existing) return res.status(404).json({ message: "Listing not found" });
    const currentUser = (req as any).user;
    if (currentUser.id !== existing.sellerId) {
      return res.status(403).json({ message: "Not authorized to edit this listing" });
    }
    const listing = storage.updateListing(listingId, req.body);
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    res.json(listing);
  });

  app.delete("/api/listings/:id", requireAuth, (req, res) => {
    const listingId = parseInt(req.params.id);
    const existing = storage.getListing(listingId);
    if (!existing) return res.status(404).json({ message: "Listing not found" });
    const currentUser = (req as any).user;
    if (currentUser.id !== existing.sellerId) {
      return res.status(403).json({ message: "Not authorized to delete this listing" });
    }
    storage.deleteListing(listingId);
    res.json({ success: true });
  });

  // ── Offer Routes ──
  app.get("/api/offers/listing/:listingId", (req, res) => {
    res.json(storage.getOffersByListing(parseInt(req.params.listingId)));
  });

  app.get("/api/offers/buyer/:buyerId", (req, res) => {
    res.json(storage.getOffersByBuyer(parseInt(req.params.buyerId)));
  });

  app.get("/api/offers/seller/:userId", requireAuth, (req, res) => {
    res.json(storage.getOffersBySeller(parseInt(req.params.userId)));
  });

  app.get("/api/offers/:id", (req, res) => {
    const offer = storage.getOffer(parseInt(req.params.id));
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", requireAuth, (req, res) => {
    try {
      const data = insertOfferSchema.parse(req.body);

      // Only allow one active offer per buyer per listing
      const existingOffers = storage.getOffersByBuyer(data.buyerId);
      const activeOffer = existingOffers.find(
        o => o.listingId === data.listingId && ["pending", "countered"].includes(o.status)
      );
      if (activeOffer) {
        return res.status(400).json({ message: "You already have an active offer on this listing. Please wait for a response or withdraw your existing offer." });
      }

      const offer = storage.createOffer(data);

      // Auto-generate AI response
      storage.createMessage({
        offerId: offer.id, senderId: null, senderType: "ai",
        content: `I've received your offer of $${offer.amount.toLocaleString()} and submitted it to the seller. I'll analyze the market comparables and help negotiate the best deal for you. The seller typically responds within 24-48 hours.`
      });

      // Email seller about new offer + create notification
      const listing = storage.getListing(offer.listingId);
      const buyer = storage.getUser(offer.buyerId);
      if (listing && buyer) {
        const seller = storage.getUser(listing.sellerId);
        if (seller) {
          const addr = `${listing.address}, ${listing.city}, ${listing.state}`;
          sendNewOfferEmail(seller.email, seller.fullName, buyer.fullName, offer.amount, addr).catch(() => {});
          storage.createNotification({
            userId: seller.id,
            type: "offer_received",
            title: "New Offer Received",
            message: `${buyer.fullName} offered $${offer.amount.toLocaleString()} on ${listing.address}`,
            relatedUrl: `/dashboard`,
          });
        }
      }

      res.json(offer);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/offers/:id", requireAuth, (req, res) => {
    const offerId = parseInt(req.params.id);
    const existingOffer = storage.getOffer(offerId);
    if (!existingOffer) return res.status(404).json({ message: "Offer not found" });
    // Check user is either the buyer or the listing seller
    const currentUser = (req as any).user;
    const listing = storage.getListing(existingOffer.listingId);
    const isBuyer = currentUser.id === existingOffer.buyerId;
    const isSeller = listing && currentUser.id === listing.sellerId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: "Not authorized to update this offer" });
    }
    const offer = storage.updateOffer(offerId, req.body);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    // Email buyer about offer status change
    if (req.body.status && ["accepted", "rejected", "countered"].includes(req.body.status)) {
      const buyerUser = storage.getUser(offer.buyerId);
      const listingForOffer = storage.getListing(offer.listingId);
      if (buyerUser && listingForOffer) {
        const addr = `${listingForOffer.address}, ${listingForOffer.city}, ${listingForOffer.state}`;
        sendOfferStatusEmail(buyerUser.email, buyerUser.fullName, req.body.status, addr, offer.amount, req.body.counterAmount).catch(() => {});
        storage.createNotification({
          userId: buyerUser.id,
          type: `offer_${req.body.status}`,
          title: `Offer ${req.body.status.charAt(0).toUpperCase() + req.body.status.slice(1)}`,
          message: `Your offer on ${listingForOffer.address} was ${req.body.status}`,
          relatedUrl: `/negotiate/${offer.id}`,
        });
      }
    }

    // If accepted, create transaction
    if (req.body.status === "accepted") {
      const listing = storage.getListing(offer.listingId);
      if (listing) {
        const buyer = storage.getUser(offer.buyerId);
        const seller = storage.getUser(listing.sellerId);

        storage.createTransaction({
          listingId: offer.listingId, offerId: offer.id,
          buyerId: offer.buyerId, sellerId: listing.sellerId,
          salePrice: offer.amount, platformFee: offer.amount * 0.01,
          status: "in_progress", closingDate: offer.closingDate || undefined,
          escrowStatus: "opened",
        });
        storage.updateListing(offer.listingId, { status: "pending" });

        // Generate PDFs and create document records
        const closingDate = offer.closingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const contingencies = (() => { try { return JSON.parse(offer.contingencies || "[]"); } catch { return []; } })();

        let purchaseAgreementUrl: string | undefined;
        let disclosureUrl: string | undefined;
        let closingDisclosureUrl: string | undefined;
        try {
          purchaseAgreementUrl = generatePurchaseAgreement({
            buyerName: buyer?.fullName || "Buyer",
            sellerName: seller?.fullName || "Seller",
            propertyAddress: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
            purchasePrice: offer.amount,
            closingDate,
            contingencies,
          });
          disclosureUrl = generateSellerDisclosure({
            sellerName: seller?.fullName || "Seller",
            propertyAddress: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
            yearBuilt: listing.yearBuilt || undefined,
          });
          closingDisclosureUrl = generateClosingDisclosure({
            buyerName: buyer?.fullName || "Buyer",
            sellerName: seller?.fullName || "Seller",
            propertyAddress: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
            purchasePrice: offer.amount,
            platformFee: offer.amount * 0.01,
            closingDate,
          });
        } catch (err) {
          console.error("PDF generation error:", err);
        }

        // Create initial closing documents
        const docTypes = [
          { type: "contract", name: "Purchase Agreement", url: purchaseAgreementUrl },
          { type: "disclosure", name: "Seller's Property Disclosure", url: disclosureUrl },
          { type: "title", name: "Title Search Report", url: undefined },
          { type: "inspection", name: "Home Inspection Report", url: undefined },
          { type: "closing", name: "Closing Disclosure (CD)", url: closingDisclosureUrl },
        ];
        docTypes.forEach(d => {
          storage.createDocument({
            listingId: offer.listingId, offerId: offer.id,
            type: d.type, name: d.name, status: "draft",
            content: d.url || null,
          });
          // Notify buyer about document
          sendDocumentReadyEmail(buyer?.email || "", buyer?.fullName || "Buyer", d.name, `${listing.address}, ${listing.city}, ${listing.state}`).catch(() => {});
          storage.createNotification({
            userId: offer.buyerId,
            type: "document_ready",
            title: `Document Ready: ${d.name}`,
            message: `${d.name} is ready for your review`,
            relatedUrl: `/negotiate/${offer.id}`,
          });
        });
      }
    }

    res.json(offer);
  });

  // ── Walkthrough Routes ──
  app.get("/api/walkthroughs/listing/:listingId", (req, res) => {
    res.json(storage.getWalkthroughsByListing(parseInt(req.params.listingId)));
  });

  app.get("/api/walkthroughs/buyer/:buyerId", (req, res) => {
    res.json(storage.getWalkthroughsByBuyer(parseInt(req.params.buyerId)));
  });

  app.get("/api/walkthroughs/chaperone/:chaperoneId", (req, res) => {
    res.json(storage.getWalkthroughsByChaperone(parseInt(req.params.chaperoneId)));
  });

  app.get("/api/walkthroughs/available", (_req, res) => {
    res.json(storage.getAvailableWalkthroughs());
  });

  app.post("/api/walkthroughs", requireAuth, (req, res) => {
    try {
      const data = insertWalkthroughSchema.parse(req.body);
      const walkthrough = storage.createWalkthrough(data);

      // Email seller about walkthrough
      const wtListing = storage.getListing(walkthrough.listingId);
      const wtBuyer = storage.getUser(walkthrough.buyerId);
      if (wtListing && wtBuyer) {
        const wtSeller = storage.getUser(wtListing.sellerId);
        if (wtSeller) {
          sendWalkthroughScheduledEmail(
            wtSeller.email, wtSeller.fullName, wtBuyer.fullName,
            `${wtListing.address}, ${wtListing.city}`,
            walkthrough.scheduledDate, walkthrough.scheduledTime
          ).catch(() => {});
          storage.createNotification({
            userId: wtSeller.id,
            type: "walkthrough_scheduled",
            title: "Walkthrough Scheduled",
            message: `${wtBuyer.fullName} scheduled a walkthrough on ${walkthrough.scheduledDate} at ${walkthrough.scheduledTime}`,
            relatedUrl: `/dashboard`,
          });
        }
        // Notify buyer
        storage.createNotification({
          userId: wtBuyer.id,
          type: "walkthrough_requested",
          title: "Walkthrough Requested",
          message: `Your walkthrough at ${wtListing.address} on ${walkthrough.scheduledDate} is being assigned to a chaperone`,
          relatedUrl: `/dashboard`,
        });
      }

      res.json(walkthrough);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/walkthroughs/:id", requireAuth, (req, res) => {
    const walkthrough = storage.updateWalkthrough(parseInt(req.params.id), req.body);
    if (!walkthrough) return res.status(404).json({ message: "Walkthrough not found" });
    res.json(walkthrough);
  });

  // ── Document Routes ──
  app.get("/api/documents/listing/:listingId", (req, res) => {
    res.json(storage.getDocumentsByListing(parseInt(req.params.listingId)));
  });

  app.get("/api/documents/offer/:offerId", (req, res) => {
    res.json(storage.getDocumentsByOffer(parseInt(req.params.offerId)));
  });

  app.get("/api/documents/:id", (req, res) => {
    const doc = storage.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });

  app.post("/api/documents", requireAuth, (req, res) => {
    try {
      const data = insertDocumentSchema.parse(req.body);
      const doc = storage.createDocument(data);
      res.json(doc);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/documents/:id", requireAuth, (req, res) => {
    const doc = storage.updateDocument(parseInt(req.params.id), req.body);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });

  // ── Message Routes ──
  app.get("/api/messages/offer/:offerId", (req, res) => {
    res.json(storage.getMessagesByOffer(parseInt(req.params.offerId)));
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const data = insertMessageSchema.parse(req.body);
      const msg = storage.createMessage(data);

      // Generate AI response asynchronously
      if (data.senderType === "user") {
        // Fire-and-forget — respond to client immediately
        (async () => {
          try {
            const offer = storage.getOffer(data.offerId);
            const listing = offer ? storage.getListing(offer.listingId) : null;
            const conversationHistory = storage.getMessagesByOffer(data.offerId);

            if (!offer || !listing) {
              storage.createMessage({ offerId: data.offerId, senderId: null, senderType: "ai", content: "I'm here to help with your offer. Could you provide more details about what you need?" });
              return;
            }

            const aiResponse = await getAINegotiationResponse({
              message: data.content,
              offer,
              listing,
              messages: conversationHistory,
              userRole: "buyer",
            });

            storage.createMessage({ offerId: data.offerId, senderId: null, senderType: "ai", content: aiResponse });
          } catch (err) {
            console.error("AI response error:", err);
            storage.createMessage({ offerId: data.offerId, senderId: null, senderType: "ai", content: "I'm analyzing your request. One moment while I pull up the market data for this property." });
          }
        })();
      }

      res.json(msg);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── Transaction Routes ──
  app.get("/api/transactions/buyer/:buyerId", (req, res) => {
    res.json(storage.getTransactionsByBuyer(parseInt(req.params.buyerId)));
  });

  app.get("/api/transactions/seller/:sellerId", (req, res) => {
    res.json(storage.getTransactionsBySeller(parseInt(req.params.sellerId)));
  });

  app.get("/api/transactions/:id", (req, res) => {
    const txn = storage.getTransaction(parseInt(req.params.id));
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  });

  app.patch("/api/transactions/:id", requireAuth, (req, res) => {
    const txn = storage.updateTransaction(parseInt(req.params.id), req.body);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  });

  // Advance a specific step in the transaction
  app.patch("/api/transactions/:id/step", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const existing = storage.getTransaction(txnId);
    if (!existing) return res.status(404).json({ message: "Transaction not found" });

    const currentUser = (req as any).user;
    if (currentUser.id !== existing.buyerId && currentUser.id !== existing.sellerId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { step, status } = req.body as { step: string; status: string };
    const allowedSteps = ["escrowStatus", "titleStatus", "inspectionStatus", "appraisalStatus", "status"];
    if (!allowedSteps.includes(step)) {
      return res.status(400).json({ message: "Invalid step" });
    }

    const updated = storage.updateTransaction(txnId, { [step]: status });
    res.json(updated);
  });

  // Document download
  app.get("/api/documents/:id/download", (req, res) => {
    const doc = storage.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!doc.content) return res.status(404).json({ message: "No file available" });
    // content holds the relative URL path like /uploads/documents/purchase-agreement-xxx.pdf
    const filePath = path.join(process.cwd(), doc.content);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found on disk" });
    res.download(filePath, path.basename(filePath));
  });

  // E-Signature: sign a document
  app.post("/api/documents/:id/sign", requireAuth, (req, res) => {
    const docId = parseInt(req.params.id);
    const doc = storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const currentUser = (req as any).user;
    const { signatureName } = req.body;
    if (!signatureName) return res.status(400).json({ message: "signatureName required" });

    // Find the transaction/offer to determine if user is buyer or seller
    const offer = doc.offerId ? storage.getOffer(doc.offerId) : null;
    const listing = storage.getListing(doc.listingId);

    const isBuyer = offer && currentUser.id === offer.buyerId;
    const isSeller = listing && currentUser.id === listing.sellerId;

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: "Not authorized to sign this document" });
    }

    const updateData: any = {};
    if (isBuyer) updateData.signedByBuyer = true;
    if (isSeller) updateData.signedBySeller = true;

    // If both have signed, mark as completed
    const willBeBuyerSigned = isBuyer ? true : doc.signedByBuyer;
    const willBeSellerSigned = isSeller ? true : doc.signedBySeller;
    if (willBeBuyerSigned && willBeSellerSigned) {
      updateData.status = "completed";
    } else {
      updateData.status = "pending_review";
    }

    const updated = storage.updateDocument(docId, updateData);
    res.json(updated);
  });

  // ── Saved Search Routes ──
  app.get("/api/saved-searches/:userId", (req, res) => {
    res.json(storage.getSavedSearches(parseInt(req.params.userId)));
  });

  app.post("/api/saved-searches", requireAuth, (req, res) => {
    try {
      const data = insertSavedSearchSchema.parse(req.body);
      const search = storage.createSavedSearch(data);
      res.json(search);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/saved-searches/:id", requireAuth, (req, res) => {
    storage.deleteSavedSearch(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ── Favorite Routes ──
  app.get("/api/favorites/:userId", (req, res) => {
    res.json(storage.getFavorites(parseInt(req.params.userId)));
  });

  app.post("/api/favorites", requireAuth, (req, res) => {
    try {
      const data = insertFavoriteSchema.parse(req.body);
      const fav = storage.addFavorite(data);
      res.json(fav);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/favorites/:userId/:listingId", requireAuth, (req, res) => {
    storage.removeFavorite(parseInt(req.params.userId), parseInt(req.params.listingId));
    res.json({ success: true });
  });

  app.get("/api/favorites/:userId/:listingId", (req, res) => {
    const isFav = storage.isFavorite(parseInt(req.params.userId), parseInt(req.params.listingId));
    res.json({ isFavorite: isFav });
  });

  // ── Stats ──
  app.get("/api/stats", (_req, res) => {
    const { listings: allListings } = storage.getListings({ status: "active" });
    res.json({
      totalListings: allListings.length,
      averagePrice: allListings.reduce((sum: number, l: any) => sum + l.price, 0) / (allListings.length || 1),
      platformFee: "1%",
      chaperoneRate: "$20/walkthrough"
    });
  });

  // ── Chaperone Application Routes ──
  app.post("/api/chaperone/apply", requireAuth, (req, res) => {
    try {
      const body = { ...req.body, status: "pending" };

      // Encrypt SSN: store hashed version + last4 for display
      if (body.ssn && body.ssn.length > 4) {
        const ssnLast4 = body.ssn.slice(-4);
        const ssnHash = bcrypt.hashSync(body.ssn, 10);
        body.ssn = ssnHash;
        body.ssnLast4 = ssnLast4;
      } else if (body.ssn) {
        // Already just last4 (e.g. seed data)
        body.ssnLast4 = body.ssn;
      }

      // Encrypt bank account number: store hash + last4
      if (body.bankAccountNumber && body.bankAccountNumber.length > 4) {
        const acctLast4 = body.bankAccountNumber.slice(-4);
        const acctHash = bcrypt.hashSync(body.bankAccountNumber, 10);
        body.bankAccountNumber = acctHash;
        body.accountNumberLast4 = acctLast4;
      } else if (body.bankAccountNumber) {
        body.accountNumberLast4 = body.bankAccountNumber;
      }

      // Mask routing number (store as-is for now since we need it for payouts)
      if (body.bankRoutingNumber && body.bankRoutingNumber.length > 4) {
        body.routingNumberLast4 = body.bankRoutingNumber.slice(-4);
      }

      const data = insertChaperoneApplicationSchema.parse(body);
      // Check if user already has an application
      const existing = storage.getChaperoneApplicationByUser(data.userId);
      if (existing) {
        return res.status(400).json({ message: "Application already exists for this user" });
      }
      const app_ = storage.createChaperoneApplication(data);
      res.json(app_);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.get("/api/chaperone/application/:userId", requireAuth, (req, res) => {
    const app_ = storage.getChaperoneApplicationByUser(parseInt(req.params.userId));
    if (!app_) return res.status(404).json({ message: "Application not found" });
    res.json(app_);
  });

  app.patch("/api/chaperone/application/:id", requireAuth, (req, res) => {
    const app_ = storage.updateChaperoneApplication(parseInt(req.params.id), req.body);
    if (!app_) return res.status(404).json({ message: "Application not found" });
    // When application is approved, update the user's role to chaperone
    if (req.body.status === "approved" && app_.userId) {
      storage.updateUser(app_.userId, { role: "chaperone" });
    }
    res.json(app_);
  });

  app.post("/api/chaperone/application/:id/background-check", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const app_ = storage.getChaperoneApplication(id);
    if (!app_) return res.status(404).json({ message: "Application not found" });

    // Start background check
    storage.updateChaperoneApplication(id, {
      status: "background_check",
      backgroundCheckStatus: "processing",
    });

    // Simulate check passing after 2 seconds
    setTimeout(() => {
      storage.updateChaperoneApplication(id, {
        status: "approved",
        backgroundCheckStatus: "passed",
        backgroundCheckDate: new Date().toISOString().split("T")[0],
      });
      // Update user role to chaperone
      storage.updateUser(app_.userId, { role: "chaperone" });
    }, 2000);

    res.json({ message: "Background check initiated", status: "processing" });
  });

  app.get("/api/chaperone/available-gigs/:chaperoneId", (req, res) => {
    const walkthroughs = storage.getAvailableWalkthroughs();
    const gigs = walkthroughs.map(w => {
      const listing = storage.getListing(w.listingId);
      return { ...w, listing: listing || null };
    });
    res.json(gigs);
  });

  app.post("/api/chaperone/accept-gig/:walkthroughId", requireAuth, (req, res) => {
    const walkthroughId = parseInt(req.params.walkthroughId);
    const { chaperoneId } = req.body;
    if (!chaperoneId) return res.status(400).json({ message: "chaperoneId required" });

    const walkthrough = storage.updateWalkthrough(walkthroughId, {
      chaperoneId,
      status: "assigned",
    });
    if (!walkthrough) return res.status(404).json({ message: "Walkthrough not found" });

    // Get chaperone application for bank info
    const chaperoneApp = storage.getChaperoneApplicationByUser(chaperoneId);
    const bankLast4 = chaperoneApp?.accountNumberLast4 || null;

    // Create earning payout record
    storage.createChaperonePayout({
      chaperoneId,
      walkthroughId,
      amount: 20,
      type: "earning",
      status: "pending",
      description: `Walkthrough showing at ${storage.getListing(walkthrough.listingId)?.address || "property"}`,
      bankLast4,
    });

    // Email buyer about chaperone assignment
    const listing = storage.getListing(walkthrough.listingId);
    const wtBuyer2 = storage.getUser(walkthrough.buyerId);
    const chaperone = storage.getUser(chaperoneId);
    if (wtBuyer2 && chaperone && listing) {
      sendWalkthroughAssignedEmail(
        wtBuyer2.email, wtBuyer2.fullName, chaperone.fullName,
        `${listing.address}, ${listing.city}`,
        walkthrough.scheduledDate, walkthrough.scheduledTime
      ).catch(() => {});
      storage.createNotification({
        userId: wtBuyer2.id,
        type: "walkthrough_assigned",
        title: "Chaperone Assigned",
        message: `${chaperone.fullName} will guide your walkthrough at ${listing.address} on ${walkthrough.scheduledDate}`,
        relatedUrl: `/dashboard`,
      });
    }

    res.json({ ...walkthrough, listing: listing || null });
  });

  app.post("/api/chaperone/complete-gig/:walkthroughId", requireAuth, (req, res) => {
    const walkthroughId = parseInt(req.params.walkthroughId);
    const walkthrough = storage.updateWalkthrough(walkthroughId, { status: "completed" });
    if (!walkthrough) return res.status(404).json({ message: "Walkthrough not found" });

    // Update related payout to completed
    if (walkthrough.chaperoneId) {
      const payouts = storage.getChaperonePayouts(walkthrough.chaperoneId);
      const relatedPayout = payouts.find(p => p.walkthroughId === walkthroughId);
      if (relatedPayout) {
        storage.updateChaperonePayout(relatedPayout.id, { status: "completed" });
      }
    }

    res.json({ success: true, walkthrough });
  });

  app.post("/api/chaperone/decline-gig/:walkthroughId", requireAuth, (_req, res) => {
    res.json({ success: true });
  });

  app.get("/api/chaperone/my-gigs/:chaperoneId", (req, res) => {
    const chaperoneId = parseInt(req.params.chaperoneId);
    const walkthroughs = storage.getWalkthroughsByChaperone(chaperoneId);
    const gigs = walkthroughs.map(w => {
      const listing = storage.getListing(w.listingId);
      return { ...w, listing: listing || null };
    });
    res.json(gigs);
  });

  app.get("/api/chaperone/earnings/:chaperoneId", (req, res) => {
    const chaperoneId = parseInt(req.params.chaperoneId);
    const earnings = storage.getChaperoneEarnings(chaperoneId);
    const payouts = storage.getChaperonePayouts(chaperoneId);
    res.json({ ...earnings, payouts });
  });

  app.post("/api/chaperone/request-payout", requireAuth, (req, res) => {
    try {
      const { chaperoneId, amount, bankLast4 } = req.body;
      if (!chaperoneId || !amount) return res.status(400).json({ message: "chaperoneId and amount required" });

      const earnings = storage.getChaperoneEarnings(chaperoneId);
      const available = earnings.paid + earnings.pending; // total earned minus already withdrawn
      // Recalculate available balance properly
      const payouts = storage.getChaperonePayouts(chaperoneId);
      const totalEarned = payouts.filter(p => p.type === "earning" && p.status === "completed").reduce((s, p) => s + p.amount, 0);
      const totalWithdrawn = Math.abs(payouts.filter(p => p.type === "payout" && p.status === "completed").reduce((s, p) => s + p.amount, 0));
      const balance = totalEarned - totalWithdrawn;

      if (amount > balance) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const payout = storage.createChaperonePayout({
        chaperoneId,
        walkthroughId: undefined,
        amount: -Math.abs(amount), // negative for withdrawals
        type: "payout",
        status: "processing",
        description: "Bank transfer payout",
        bankLast4: bankLast4 || null,
      });

      res.json(payout);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── Payment Routes ──────────────────────────────────────────────────

  // POST /api/payments/walkthrough — charge buyer $20 for walkthrough
  app.post("/api/payments/walkthrough", requireAuth, async (req, res) => {
    try {
      const { walkthroughId, userId } = req.body;
      if (!walkthroughId || !userId) return res.status(400).json({ message: "walkthroughId and userId required" });

      const pi = await createPaymentIntent(20, {
        type: "walkthrough_fee",
        walkthroughId: String(walkthroughId),
        userId: String(userId),
      });

      const payment = storage.createPayment({
        userId,
        amount: "20.00",
        type: "walkthrough_fee",
        status: pi.status === "succeeded" ? "completed" : "pending",
        stripePaymentId: pi.id,
        relatedId: walkthroughId,
      });

      res.json({ payment, testMode: TEST_MODE, clientSecret: (pi as any).client_secret });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // POST /api/payments/closing — charge 1% platform fee
  app.post("/api/payments/closing", requireAuth, async (req, res) => {
    try {
      const { transactionId, userId, salePrice } = req.body;
      if (!transactionId || !userId || !salePrice) return res.status(400).json({ message: "transactionId, userId, and salePrice required" });

      const fee = salePrice * 0.01;
      const pi = await createPaymentIntent(fee, {
        type: "platform_fee",
        transactionId: String(transactionId),
        userId: String(userId),
      });

      const payment = storage.createPayment({
        userId,
        amount: fee.toFixed(2),
        type: "platform_fee",
        status: pi.status === "succeeded" ? "completed" : "pending",
        stripePaymentId: pi.id,
        relatedId: transactionId,
      });

      res.json({ payment, testMode: TEST_MODE, clientSecret: (pi as any).client_secret });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // POST /api/payments/chaperone-payout/:payoutId — process real payout
  app.post("/api/payments/chaperone-payout/:payoutId", requireAuth, async (req, res) => {
    try {
      const payoutId = parseInt(req.params.payoutId);
      const { destination } = req.body;

      if (TEST_MODE) {
        // Simulate: just mark the payout as completed
        const updated = storage.updateChaperonePayout(payoutId, { status: "completed" });
        return res.json({ success: true, testMode: true, payout: updated });
      }

      // In production, use Stripe
      const { createPayout } = await import("./payments");
      const transfer = await createPayout(20, destination || "");

      const updated = storage.updateChaperonePayout(payoutId, { status: "completed" });
      res.json({ success: true, testMode: false, transfer, payout: updated });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── Notification Routes ──────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const notifs = storage.getNotificationsByUser(userId);
    res.json(notifs);
  });

  app.patch("/api/notifications/:id/read", requireAuth, (req, res) => {
    const notif = storage.markNotificationRead(parseInt(req.params.id));
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json(notif);
  });

  app.get("/api/notifications/unread-count", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const count = storage.getUnreadCount(userId);
    res.json({ count });
  });

  // ── Admin Routes ─────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
    const allUsers = storage.getAllUsers().map(u => {
      const { password, ...safe } = u;
      return safe;
    });
    res.json(allUsers);
  });

  app.get("/api/admin/stats", requireAuth, requireAdmin, (_req, res) => {
    res.json(storage.getPlatformStats());
  });

  app.get("/api/admin/listings", requireAuth, requireAdmin, (_req, res) => {
    res.json(storage.getAllListings());
  });

  app.get("/api/admin/transactions", requireAuth, requireAdmin, (_req, res) => {
    const txns = storage.getAllTransactions();
    const enriched = txns.map(t => ({
      ...t,
      buyer: (() => { const u = storage.getUser(t.buyerId); return u ? { id: u.id, fullName: u.fullName, email: u.email } : null; })(),
      seller: (() => { const u = storage.getUser(t.sellerId); return u ? { id: u.id, fullName: u.fullName, email: u.email } : null; })(),
      listing: storage.getListing(t.listingId),
    }));
    res.json(enriched);
  });

  app.get("/api/admin/payments", requireAuth, requireAdmin, (_req, res) => {
    res.json(storage.getAllPayments());
  });

  app.patch("/api/admin/users/:id/role", requireAuth, requireAdmin, (req, res) => {
    const { role } = req.body;
    if (!role) return res.status(400).json({ message: "role required" });
    const user = storage.updateUser(parseInt(req.params.id), { role });
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  app.delete("/api/admin/listings/:id", requireAuth, requireAdmin, (req, res) => {
    const listingId = parseInt(req.params.id);
    const existing = storage.getListing(listingId);
    if (!existing) return res.status(404).json({ message: "Listing not found" });
    storage.deleteListing(listingId);
    res.json({ success: true });
  });
}
