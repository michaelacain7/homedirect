import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertListingSchema, insertOfferSchema, insertWalkthroughSchema, insertDocumentSchema, insertMessageSchema, insertTransactionSchema, insertSavedSearchSchema, insertFavoriteSchema, insertChaperoneApplicationSchema, insertChaperonePayoutSchema } from "@shared/schema";
import { z } from "zod";

// Seed data on first load
function seedDatabase() {
  const existingUsers = storage.getUser(1);
  if (existingUsers) return;

  // Create demo users
  const seller1 = storage.createUser({ email: "sarah@example.com", password: "demo123", fullName: "Sarah Mitchell", phone: "813-555-0101", role: "seller", location: "Tampa, FL", bio: "Selling my family home after 15 wonderful years." });
  const seller2 = storage.createUser({ email: "james@example.com", password: "demo123", fullName: "James Chen", phone: "727-555-0202", role: "seller", location: "St. Petersburg, FL", bio: "Real estate investor transitioning properties." });
  const buyer1 = storage.createUser({ email: "mike@example.com", password: "demo123", fullName: "Michael Cain", phone: "813-555-0303", role: "buyer", location: "St. Petersburg, FL", bio: "Looking for the perfect family home." });
  const chaperone1 = storage.createUser({ email: "lisa@example.com", password: "demo123", fullName: "Lisa Rodriguez", phone: "813-555-0404", role: "chaperone", location: "Tampa, FL", bio: "Licensed realtor earning extra income as a walkthrough chaperone." });

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
  app.post("/api/auth/register", (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = storage.getUserByEmail(data.email);
      if (existing) return res.status(400).json({ message: "Email already registered" });
      const user = storage.createUser(data);
      const { password, ...safe } = user;
      res.json(safe);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      const user = storage.getUserByEmail(email);
      if (!user || user.password !== password) return res.status(401).json({ message: "Invalid credentials" });
      const { password: _, ...safe } = user;
      res.json(safe);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── User Routes ──
  app.get("/api/users/:id", (req, res) => {
    const user = storage.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  app.patch("/api/users/:id", (req, res) => {
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
    const allListings = storage.getListings({
      status: "active",
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      minBeds: minBeds ? parseInt(minBeds as string) : undefined,
      maxBeds: maxBeds ? parseInt(maxBeds as string) : undefined,
      propertyType: propertyType && propertyType !== "all" ? propertyType as string : undefined,
    });
    const bounded = allListings.filter(l =>
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

  app.post("/api/listings", (req, res) => {
    try {
      const data = insertListingSchema.parse(req.body);
      const listing = storage.createListing(data);
      res.json(listing);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/listings/:id", (req, res) => {
    const listing = storage.updateListing(parseInt(req.params.id), req.body);
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    res.json(listing);
  });

  app.delete("/api/listings/:id", (req, res) => {
    storage.deleteListing(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ── Offer Routes ──
  app.get("/api/offers/listing/:listingId", (req, res) => {
    res.json(storage.getOffersByListing(parseInt(req.params.listingId)));
  });

  app.get("/api/offers/buyer/:buyerId", (req, res) => {
    res.json(storage.getOffersByBuyer(parseInt(req.params.buyerId)));
  });

  app.get("/api/offers/:id", (req, res) => {
    const offer = storage.getOffer(parseInt(req.params.id));
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", (req, res) => {
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

      res.json(offer);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/offers/:id", (req, res) => {
    const offer = storage.updateOffer(parseInt(req.params.id), req.body);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    // If accepted, create transaction
    if (req.body.status === "accepted") {
      const listing = storage.getListing(offer.listingId);
      if (listing) {
        storage.createTransaction({
          listingId: offer.listingId, offerId: offer.id,
          buyerId: offer.buyerId, sellerId: listing.sellerId,
          salePrice: offer.amount, platformFee: offer.amount * 0.01,
          status: "in_progress", closingDate: offer.closingDate || undefined
        });
        storage.updateListing(offer.listingId, { status: "pending" });

        // Create initial closing documents
        const docTypes = [
          { type: "contract", name: "Purchase Agreement" },
          { type: "disclosure", name: "Seller's Property Disclosure" },
          { type: "title", name: "Title Search Report" },
          { type: "inspection", name: "Home Inspection Report" },
          { type: "closing", name: "Closing Disclosure (CD)" }
        ];
        docTypes.forEach(d => {
          storage.createDocument({
            listingId: offer.listingId, offerId: offer.id,
            type: d.type, name: d.name, status: "draft"
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

  app.post("/api/walkthroughs", (req, res) => {
    try {
      const data = insertWalkthroughSchema.parse(req.body);
      const walkthrough = storage.createWalkthrough(data);
      res.json(walkthrough);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/walkthroughs/:id", (req, res) => {
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

  app.post("/api/documents", (req, res) => {
    try {
      const data = insertDocumentSchema.parse(req.body);
      const doc = storage.createDocument(data);
      res.json(doc);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/documents/:id", (req, res) => {
    const doc = storage.updateDocument(parseInt(req.params.id), req.body);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });

  // ── Message Routes ──
  app.get("/api/messages/offer/:offerId", (req, res) => {
    res.json(storage.getMessagesByOffer(parseInt(req.params.offerId)));
  });

  app.post("/api/messages", (req, res) => {
    try {
      const data = insertMessageSchema.parse(req.body);
      const msg = storage.createMessage(data);

      // Generate AI response
      if (data.senderType === "user") {
        setTimeout(() => {
          const offer = storage.getOffer(data.offerId);
          const listing = offer ? storage.getListing(offer.listingId) : null;

          let aiResponse = "I understand your concern. Let me help you with that.";
          const content = data.content.toLowerCase();

          if (content.includes("counter") || content.includes("higher") || content.includes("lower")) {
            aiResponse = `Based on comparable sales in the area, I'd suggest a counter-offer strategy. ${listing ? `The listing at ${listing.address} is priced at $${listing.price.toLocaleString()}.` : ''} Market data shows similar properties have sold within 3-5% of asking price. Would you like me to prepare a counter-offer?`;
          } else if (content.includes("inspect") || content.includes("condition")) {
            aiResponse = "Great question about the property condition. I recommend including an inspection contingency in your offer. This protects you and gives you leverage to negotiate repairs or price adjustments. Would you like me to add an inspection contingency?";
          } else if (content.includes("closing") || content.includes("timeline")) {
            aiResponse = "For the closing timeline, a typical transaction takes 30-45 days from accepted offer. This includes time for inspection (7-10 days), appraisal (2-3 weeks), and title work. I'll help coordinate all the paperwork to keep things on track.";
          } else if (content.includes("document") || content.includes("paper")) {
            aiResponse = "I'll prepare all necessary documents including the purchase agreement, disclosures, and closing paperwork. Everything will be available in your dashboard for electronic signature. No need to visit any offices.";
          } else {
            aiResponse = `Thank you for your message. I'm here to help guide you through every step of the process. ${listing ? `Regarding the property at ${listing.address}, ` : ''}I can help with offer strategy, negotiations, paperwork, inspections, and closing coordination. What would you like to focus on?`;
          }

          storage.createMessage({ offerId: data.offerId, senderId: null, senderType: "ai", content: aiResponse });
        }, 500);
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

  app.patch("/api/transactions/:id", (req, res) => {
    const txn = storage.updateTransaction(parseInt(req.params.id), req.body);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  });

  // ── Saved Search Routes ──
  app.get("/api/saved-searches/:userId", (req, res) => {
    res.json(storage.getSavedSearches(parseInt(req.params.userId)));
  });

  app.post("/api/saved-searches", (req, res) => {
    try {
      const data = insertSavedSearchSchema.parse(req.body);
      const search = storage.createSavedSearch(data);
      res.json(search);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/saved-searches/:id", (req, res) => {
    storage.deleteSavedSearch(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ── Favorite Routes ──
  app.get("/api/favorites/:userId", (req, res) => {
    res.json(storage.getFavorites(parseInt(req.params.userId)));
  });

  app.post("/api/favorites", (req, res) => {
    try {
      const data = insertFavoriteSchema.parse(req.body);
      const fav = storage.addFavorite(data);
      res.json(fav);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/favorites/:userId/:listingId", (req, res) => {
    storage.removeFavorite(parseInt(req.params.userId), parseInt(req.params.listingId));
    res.json({ success: true });
  });

  app.get("/api/favorites/:userId/:listingId", (req, res) => {
    const isFav = storage.isFavorite(parseInt(req.params.userId), parseInt(req.params.listingId));
    res.json({ isFavorite: isFav });
  });

  // ── Stats ──
  app.get("/api/stats", (_req, res) => {
    const allListings = storage.getListings({ status: "active" });
    res.json({
      totalListings: allListings.length,
      averagePrice: allListings.reduce((sum, l) => sum + l.price, 0) / (allListings.length || 1),
      platformFee: "1%",
      chaperoneRate: "$20/walkthrough"
    });
  });

  // ── Chaperone Application Routes ──
  app.post("/api/chaperone/apply", (req, res) => {
    try {
      const data = insertChaperoneApplicationSchema.parse({ ...req.body, status: "pending" });
      // Check if user already has an application
      const existing = storage.getChaperoneApplicationByUser(data.userId);
      if (existing) {
        return res.status(400).json({ message: "Application already exists for this user" });
      }
      const app_ = storage.createChaperoneApplication(data);
      res.json(app_);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.get("/api/chaperone/application/:userId", (req, res) => {
    const app_ = storage.getChaperoneApplicationByUser(parseInt(req.params.userId));
    if (!app_) return res.status(404).json({ message: "Application not found" });
    res.json(app_);
  });

  app.patch("/api/chaperone/application/:id", (req, res) => {
    const app_ = storage.updateChaperoneApplication(parseInt(req.params.id), req.body);
    if (!app_) return res.status(404).json({ message: "Application not found" });
    // When application is approved, update the user's role to chaperone
    if (req.body.status === "approved" && app_.userId) {
      storage.updateUser(app_.userId, { role: "chaperone" });
    }
    res.json(app_);
  });

  app.post("/api/chaperone/application/:id/background-check", (req, res) => {
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

  app.post("/api/chaperone/accept-gig/:walkthroughId", (req, res) => {
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
    const bankLast4 = chaperoneApp?.bankAccountNumber
      ? chaperoneApp.bankAccountNumber.slice(-4)
      : null;

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

    const listing = storage.getListing(walkthrough.listingId);
    res.json({ ...walkthrough, listing: listing || null });
  });

  app.post("/api/chaperone/complete-gig/:walkthroughId", (req, res) => {
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

  app.post("/api/chaperone/decline-gig/:walkthroughId", (_req, res) => {
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

  app.post("/api/chaperone/request-payout", (req, res) => {
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
}
