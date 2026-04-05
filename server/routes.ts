import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertListingSchema, insertOfferSchema, insertWalkthroughSchema, insertDocumentSchema, insertMessageSchema, insertTransactionSchema, insertSavedSearchSchema, insertFavoriteSchema, insertChaperoneApplicationSchema, insertChaperonePayoutSchema } from "@shared/schema";
import { createPaymentIntent, TEST_MODE } from "./payments";
import { sendNewOfferEmail, sendOfferStatusEmail, sendWalkthroughScheduledEmail, sendWalkthroughAssignedEmail, sendDocumentReadyEmail } from "./email";
import { getAINegotiationResponse } from "./ai-negotiation";
import { getAdvisorResponse } from "./ai-advisor";
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

  // ── Seed Transaction Portal Data ──
  // Accept the offer and create a transaction for the Craftsman Bungalow
  storage.updateOffer(1, { status: "accepted" });

  // Create a transaction (listing 3 is the Craftsman Bungalow at $585,000)
  const salePrice = 560000;
  const txn = storage.createTransaction({
    listingId: 3,
    offerId: 1,
    buyerId: buyer1.id,
    sellerId: seller2.id,
    salePrice,
    platformFee: Math.round(salePrice * 0.01),
    status: "in_progress",
    closingDate: "2026-05-15",
    escrowStatus: "opened",
    titleStatus: "ordered",
    inspectionStatus: "in_progress",
    appraisalStatus: "not_started",
  });

  // Seed buyer checklist items (some completed/in_progress)
  const addDays = (d: number) => {
    const dt = new Date("2026-04-04");
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().split("T")[0];
  };

  const buyerItems = [
    { title: "Get mortgage pre-approval", description: "Contact your lender and submit pre-approval documentation", category: "lender", order: 1, dueDate: addDays(3), status: "completed" },
    { title: "Schedule home inspection", description: "Book an inspector within 10 days of contract", category: "inspection", order: 2, dueDate: addDays(10), status: "completed" },
    { title: "Review inspection report", description: "AI will analyze findings when uploaded", category: "inspection", order: 3, dueDate: addDays(14), status: "in_progress" },
    { title: "Request repairs or credits", description: "Based on inspection findings", category: "inspection", order: 4, dueDate: addDays(16), status: "pending" },
    { title: "Complete mortgage application", description: "Submit full application to your lender", category: "lender", order: 5, dueDate: addDays(7), status: "in_progress" },
    { title: "Order homeowner's insurance", description: "Required before closing", category: "general", order: 6, dueDate: addDays(20), status: "pending" },
    { title: "Schedule appraisal", description: "Your lender will order this", category: "appraisal", order: 7, dueDate: addDays(14), status: "pending" },
    { title: "Review appraisal report", description: "AI will analyze the valuation", category: "appraisal", order: 8, dueDate: addDays(18), status: "pending" },
    { title: "Review closing disclosure", description: "Review 3 days before closing (required by law)", category: "escrow", order: 9, dueDate: addDays(27), status: "pending" },
    { title: "Wire closing funds", description: "Send funds to escrow per wire instructions", category: "escrow", order: 10, dueDate: addDays(29), status: "pending" },
    { title: "Final walkthrough", description: "Schedule via the platform", category: "general", order: 11, dueDate: addDays(29), status: "pending" },
    { title: "Attend closing", description: "Sign final documents and get your keys", category: "general", order: 12, dueDate: addDays(30), status: "pending" },
  ];

  const sellerItems = [
    { title: "Complete seller disclosure", description: "Fill out property condition disclosure", category: "title", order: 1, dueDate: addDays(3), status: "completed" },
    { title: "Provide access for inspection", description: "Schedule access for buyer's inspector", category: "inspection", order: 2, dueDate: addDays(10), status: "completed" },
    { title: "Review inspection requests", description: "Respond to buyer's repair/credit requests", category: "inspection", order: 3, dueDate: addDays(16), status: "pending" },
    { title: "Provide access for appraisal", description: "Schedule access for appraiser", category: "appraisal", order: 4, dueDate: addDays(14), status: "pending" },
    { title: "Gather required documents", description: "Title, deed, HOA docs, tax records", category: "title", order: 5, dueDate: addDays(7), status: "in_progress" },
    { title: "Review title report", description: "Ensure no liens or encumbrances", category: "title", order: 6, dueDate: addDays(21), status: "pending" },
    { title: "Upload ID for title company", description: "Driver's license or passport", category: "title", order: 7, dueDate: addDays(14), status: "pending" },
    { title: "Review closing disclosure", description: "Review 3 days before closing", category: "escrow", order: 8, dueDate: addDays(27), status: "pending" },
    { title: "Prepare for final walkthrough", description: "Ensure property is in agreed condition", category: "general", order: 9, dueDate: addDays(29), status: "pending" },
    { title: "Attend closing", description: "Sign final documents and transfer ownership", category: "general", order: 10, dueDate: addDays(30), status: "pending" },
  ];

  for (const item of buyerItems) {
    storage.createChecklistItem({ transactionId: txn.id, role: "buyer", ...item });
  }
  for (const item of sellerItems) {
    storage.createChecklistItem({ transactionId: txn.id, role: "seller", ...item });
  }

  // Seed portal documents
  const portalDocs = [
    { portal: "title", name: "Government ID (Driver's License)", type: "id_document", status: "requested" },
    { portal: "title", name: "Proof of Homeowner's Insurance", type: "insurance", status: "requested" },
    { portal: "title", name: "HOA Documents", type: "hoa_docs", status: "uploaded", fileUrl: "/uploads/portal/hoa-docs.pdf", uploadedBy: seller2.id },
    { portal: "title", name: "Survey", type: "survey", status: "requested" },
    { portal: "lender", name: "Pay Stubs (Last 2 Months)", type: "pay_stub", status: "uploaded", fileUrl: "/uploads/portal/pay-stubs.pdf", uploadedBy: buyer1.id },
    { portal: "lender", name: "W-2s (Last 2 Years)", type: "w2", status: "uploaded", fileUrl: "/uploads/portal/w2s.pdf", uploadedBy: buyer1.id },
    { portal: "lender", name: "Tax Returns (Last 2 Years)", type: "tax_returns", status: "requested" },
    { portal: "lender", name: "Bank Statements (Last 2 Months)", type: "bank_statements", status: "requested" },
    { portal: "lender", name: "Employment Verification Letter", type: "employment_letter", status: "requested" },
    { portal: "inspection", name: "Inspection Report", type: "inspection_report", status: "uploaded", fileUrl: "/uploads/portal/inspection-report.pdf", uploadedBy: buyer1.id },
  ];

  for (const doc of portalDocs) {
    storage.createPortalDocument({ transactionId: txn.id, ...doc } as any);
  }

  // Seed some portal messages (AI chat history)
  const inspectionMsgs = [
    { role: "user", content: "What do I do about the foundation crack in the report?" },
    { role: "ai", content: "**Foundation Issues — What You Need to Know**\n\nThe inspector noted a hairline crack in the northeast corner. Based on its description, this appears to be a settlement crack rather than a structural issue.\n\n**Recommended action:**\n1. Request a structural engineer evaluation ($300–600)\n2. If the engineer confirms it's cosmetic, proceed with a $500 seller credit for future monitoring\n3. If structural, request a credit of $5,000–15,000 or reconsider the purchase\n\nWould you like me to draft a repair request?" },
  ];
  const escrowMsgs = [
    { role: "user", content: "How do I know the wire instructions are legitimate?" },
    { role: "ai", content: "**Wire Fraud Protection — Critical**\n\nAlways call the title company directly using a phone number from their official website (not from any email). Verify the routing and account number verbally before sending. Never wire based solely on emailed instructions." },
  ];

  for (const msg of inspectionMsgs) {
    storage.createPortalMessage({ transactionId: txn.id, portal: "inspection", userId: buyer1.id, role: msg.role, content: msg.content });
  }
  for (const msg of escrowMsgs) {
    storage.createPortalMessage({ transactionId: txn.id, portal: "escrow", userId: buyer1.id, role: msg.role, content: msg.content });
  }
}

// Portal AI response generator (rule-based with OpenAI fallback)
async function getPortalAIResponse(
  portal: string,
  message: string,
  context: { txn: any; listing: any; offer: any; userRole: string }
): Promise<string> {
  const { txn, listing, userRole } = context;
  const address = listing ? `${listing.address}, ${listing.city}, ${listing.state}` : `Transaction #${txn.id}`;
  const lower = message.toLowerCase();

  const portalResponses: Record<string, string> = {
    inspection: (() => {
      if (lower.includes("foundation") || lower.includes("crack")) {
        return `**Foundation Issues — What You Need to Know**\n\nFoundation cracks can range from cosmetic settlement cracks (common in any home) to structural issues requiring immediate attention.\n\n**Red flags to watch for:**\n• Horizontal cracks (most serious — indicate soil pressure)\n• Stair-step cracks in brick/block\n• Cracks wider than 1/4 inch\n• Doors/windows that stick or won't close properly\n\n**Recommended action:** Request a structural engineer evaluation. Cost: $300–600. If serious issues are confirmed, request a seller credit of $5,000–20,000+ depending on severity. You also have the right to exit the contract during the inspection period with your earnest money back.`;
      }
      if (lower.includes("roof")) {
        return `**Roof Issues — Your Options**\n\nRoof replacement costs $8,000–20,000 depending on size and materials. Here's how to handle this:\n\n1. **Request a seller credit** equal to the repair estimate — this is often the cleanest solution\n2. **Request seller repair** using a licensed contractor\n3. **Negotiate a price reduction** to reflect the needed work\n4. **Walk away** during the inspection period if issues are too severe\n\n**Pro tip:** Get 2–3 contractor bids and use the average in your repair request. Sellers are more likely to accept credits backed by written estimates.`;
      }
      if (lower.includes("walk away") || lower.includes("exit") || lower.includes("cancel")) {
        return `**Exercising Your Inspection Contingency**\n\nYou have the right to exit this transaction during the inspection period without penalty. Here's what that means:\n\n✅ Your earnest money is fully refunded\n✅ No further obligation to purchase\n✅ No penalties or fees\n\n**Timeline:** You typically have 10 days from contract acceptance. Check your contract for the exact deadline.\n\nIf you'd like to continue but want better terms, I can help you draft a repair request or negotiate a credit instead. What would you like to do?`;
      }
      return `**Inspection Guidance for ${address}**\n\nI can help you navigate the inspection findings. Common areas to focus on:\n\n• **Roof** — Check age and condition. Average lifespan: 20–25 years\n• **HVAC** — Systems over 15 years old may need replacement soon ($4,000–12,000)\n• **Foundation** — Any cracks should be evaluated by a structural engineer\n• **Electrical** — Older panels may need upgrading ($1,500–4,000)\n• **Plumbing** — Check for galvanized pipes or signs of leaks\n\nFor issues found, you can request: (1) repairs, (2) seller credit, or (3) price reduction. What specific finding would you like guidance on?`;
    })(),
    escrow: (() => {
      if (lower.includes("wire fraud") || lower.includes("fraud") || lower.includes("safe")) {
        return `**Wire Fraud Protection — Critical Information**\n\n⚠️ **Wire fraud is the #1 cybercrime in real estate.** Criminals intercept email and send fake wire instructions posing as your title company.\n\n**Always follow these rules:**\n1. **Call to verify** wire instructions using a phone number from the title company's official website — not from any email\n2. **Never send wire** based solely on emailed instructions\n3. **Verify the routing and account number** over the phone before sending\n4. **Be suspicious** of any last-minute changes to wire instructions\n\nOnce a wire is sent and received, recovery is nearly impossible. Banks recover less than 25% of fraudulently wired funds.`;
      }
      if (lower.includes("closing cost") || lower.includes("how much") || lower.includes("cash")) {
        const salePrice = txn.salePrice;
        const estimatedCosts = Math.round(salePrice * 0.025);
        const downPayment = Math.round(salePrice * 0.2);
        const total = estimatedCosts + downPayment;
        return `**Estimated Cash Needed to Close**\n\nBased on the ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(salePrice)} sale price:\n\n• Down payment (20%): ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(downPayment)}\n• Closing costs (~2.5%): ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(estimatedCosts)}\n• **Estimated total at closing: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total)}**\n\nLess your earnest money deposit (already paid). You'll receive the exact Closing Disclosure 3 business days before closing with your precise wire amount.`;
      }
      return `**Escrow & Closing Questions**\n\nI can help with:\n• Wire transfer instructions and fraud prevention\n• Closing cost breakdown\n• What happens at closing\n• Proration of taxes and HOA fees\n• Title insurance\n\nWhat would you like to know about your escrow and closing?`;
    })(),
    lender: (() => {
      if (lower.includes("rate") || lower.includes("interest")) {
        return `**Current Mortgage Rate Context**\n\nMortgage rates fluctuate daily. As of early 2026, 30-year fixed rates are in the 6.5–7.5% range depending on credit score and down payment.\n\n**Ways to get a better rate:**\n• Improve your credit score (720+ gets the best rates)\n• Put 20%+ down to avoid PMI\n• Buy down the rate with points (1 point = 1% of loan = ~0.25% rate reduction)\n• Shop multiple lenders — rates can vary by 0.5% or more\n• Consider a 15-year loan (lower rate, higher payment)\n\nFor your ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(txn.salePrice)} purchase, each 0.25% rate difference changes your monthly payment by ~${Math.round(txn.salePrice * 0.8 * 0.0025 / 12)} per month.`;
      }
      if (lower.includes("pmi") || lower.includes("down payment") || lower.includes("20%")) {
        return `**PMI and Down Payment Guidance**\n\nPMI (Private Mortgage Insurance) is required when your down payment is less than 20%.\n\n**PMI costs:** 0.5%–1.5% of loan amount per year. On an ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(txn.salePrice * 0.8))} loan, that's $${Math.round(txn.salePrice * 0.8 * 0.01 / 12)}/month.\n\n**How to eliminate PMI:**\n• Put 20% down (avoids PMI entirely)\n• Reach 20% equity and request cancellation\n• Refinance when you have 20% equity\n\n**Low down payment options:**\n• FHA loan: 3.5% down (MIP required, harder to remove)\n• Conventional: 3–5% down with PMI\n• VA loan: 0% down (if eligible) — no PMI ever`;
      }
      return `**Mortgage & Lending Questions**\n\nI can help you understand:\n• Pre-approval vs. pre-qualification\n• Mortgage types (fixed, ARM, FHA, VA, USDA)\n• How to get the best rate\n• PMI and how to avoid it\n• Debt-to-income ratio requirements\n• What underwriting looks for\n\nFor this ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(txn.salePrice)} purchase, what mortgage question can I help you with?`;
    })(),
    appraisal: (() => {
      if (lower.includes("low") || lower.includes("below") || lower.includes("under")) {
        return `**Low Appraisal — Your Options**\n\nIf the appraisal comes in below purchase price, you have several options:\n\n1. **Renegotiate the price** — Ask the seller to reduce the price to the appraised value\n2. **Split the difference** — Agree to a price between the appraised value and contract price\n3. **Make up the gap in cash** (appraisal gap coverage) — Pay the difference out of pocket\n4. **Challenge the appraisal** — Request a reconsideration with comparable sales data\n5. **Order a second appraisal** — Check if your lender allows this\n6. **Exercise your appraisal contingency** — Exit with your earnest money back\n\n**Recommended approach:** First request reconsideration with 3 comparable sales the appraiser may have missed. If that fails, negotiate with the seller — they may prefer to reduce the price over losing the deal entirely.`;
      }
      return `**Appraisal Questions**\n\nThe appraisal determines if the lender will fund your loan at the contract price.\n\n**Key things to know:**\n• Appraiser is hired by the lender (not buyer or seller)\n• Must be comparable to recent nearby sales\n• Usually takes 1–3 weeks to complete\n• You have a right to receive a copy\n\nFor ${address}:\n• Purchase price: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(txn.salePrice)}\n• If appraised at or above this value, great news — you're proceeding as planned\n• If below, we'll review your options together\n\nWhat specifically would you like to know about the appraisal process?`;
    })(),
    title: (() => {
      if (lower.includes("lien") || lower.includes("encumbrance") || lower.includes("cloud")) {
        return `**Title Issues — Liens and Encumbrances**\n\nTitle issues must be resolved before closing. Common issues include:\n\n• **Mortgage liens** — Must be paid off at closing (handled automatically)\n• **Mechanic's liens** — From unpaid contractors. Seller must satisfy before closing\n• **Tax liens** — Unpaid property taxes. Must be cleared\n• **HOA liens** — Unpaid HOA dues. Must be resolved\n• **Easements** — Rights others have to use part of the property (utility companies, etc.). Usually not a problem unless they affect planned use\n\n**Title insurance** protects you from undiscovered issues. Owner's policy is a one-time premium and covers you for as long as you own the home.\n\nAsk the title company for a copy of the preliminary title report so we can review any issues together.`;
      }
      return `**Title Company Questions**\n\nThe title company handles:\n• Title search (verifying clean ownership history)\n• Title insurance\n• Escrow and closing coordination\n• Document preparation\n• Recording the deed with the county\n\nCommon questions I can help with:\n• What does title insurance cover?\n• How long does the title search take?\n• What documents does the title company need from me?\n• What is an encumbrance or lien?\n• What happens at the closing table?\n\nWhat would you like to know?`;
    })(),
    general: `**Transaction Assistant for ${address}**\n\nI can help you navigate every step of your ${userRole === "buyer" ? "home purchase" : "home sale"} at ${address}.\n\n**Your portals:**\n• Inspection — Upload and analyze your inspection report\n• Escrow & Closing — Wire instructions and closing costs\n• Lender — Mortgage status and required documents\n• Appraisal — Valuation report and analysis\n• Title — Document requests and title search status\n\nWhat would you like help with?`,
  };

  const response = portalResponses[portal] || portalResponses.general;

  // Try OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    try {
      const systemPrompt = `You are an expert real estate AI assistant helping a ${userRole} navigate their ${portal} portal for the property at ${address} (sale price: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(txn.salePrice)}). Be specific, practical, and concise. Format responses with markdown.`;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }],
          max_tokens: 600,
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        return data.choices?.[0]?.message?.content || response;
      }
    } catch {
      // Fall through to rule-based
    }
  }

  return response;
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

  // ── Portal: Checklist ──────────────────────────────────────────────────────
  app.get("/api/transactions/:id/checklist", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const currentUser = (req as any).user;
    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    // Determine user role
    const role = currentUser.id === txn.buyerId ? "buyer" : currentUser.id === txn.sellerId ? "seller" : null;
    if (!role) return res.status(403).json({ message: "Not authorized" });

    let items = storage.getChecklistByRole(txnId, role);

    // Auto-seed checklist if empty
    if (items.length === 0) {
      const now = new Date();
      const addDays = (d: number) => { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt.toISOString().split("T")[0]; };

      const buyerItems = [
        { title: "Get mortgage pre-approval", description: "Contact your lender and submit pre-approval documentation", category: "lender", order: 1, dueDate: addDays(3) },
        { title: "Schedule home inspection", description: "Book an inspector within 10 days of contract", category: "inspection", order: 2, dueDate: addDays(10) },
        { title: "Review inspection report", description: "AI will analyze findings when uploaded", category: "inspection", order: 3, dueDate: addDays(14) },
        { title: "Request repairs or credits", description: "Based on inspection findings", category: "inspection", order: 4, dueDate: addDays(16) },
        { title: "Complete mortgage application", description: "Submit full application to your lender", category: "lender", order: 5, dueDate: addDays(7) },
        { title: "Order homeowner's insurance", description: "Required before closing", category: "general", order: 6, dueDate: addDays(20) },
        { title: "Schedule appraisal", description: "Your lender will order this", category: "appraisal", order: 7, dueDate: addDays(14) },
        { title: "Review appraisal report", description: "AI will analyze the valuation", category: "appraisal", order: 8, dueDate: addDays(18) },
        { title: "Review closing disclosure", description: "Review 3 days before closing (required by law)", category: "escrow", order: 9, dueDate: addDays(27) },
        { title: "Wire closing funds", description: "Send funds to escrow per wire instructions", category: "escrow", order: 10, dueDate: addDays(29) },
        { title: "Final walkthrough", description: "Schedule via the platform", category: "general", order: 11, dueDate: addDays(29) },
        { title: "Attend closing", description: "Sign final documents and get your keys", category: "general", order: 12, dueDate: addDays(30) },
      ];
      const sellerItems = [
        { title: "Complete seller disclosure", description: "Fill out property condition disclosure", category: "title", order: 1, dueDate: addDays(3) },
        { title: "Provide access for inspection", description: "Schedule access for buyer's inspector", category: "inspection", order: 2, dueDate: addDays(10) },
        { title: "Review inspection requests", description: "Respond to buyer's repair/credit requests", category: "inspection", order: 3, dueDate: addDays(16) },
        { title: "Provide access for appraisal", description: "Schedule access for appraiser", category: "appraisal", order: 4, dueDate: addDays(14) },
        { title: "Gather required documents", description: "Title, deed, HOA docs, tax records", category: "title", order: 5, dueDate: addDays(7) },
        { title: "Review title report", description: "Ensure no liens or encumbrances", category: "title", order: 6, dueDate: addDays(21) },
        { title: "Upload ID for title company", description: "Driver's license or passport", category: "title", order: 7, dueDate: addDays(14) },
        { title: "Review closing disclosure", description: "Review 3 days before closing", category: "escrow", order: 8, dueDate: addDays(27) },
        { title: "Prepare for final walkthrough", description: "Ensure property is in agreed condition", category: "general", order: 9, dueDate: addDays(29) },
        { title: "Attend closing", description: "Sign final documents and transfer ownership", category: "general", order: 10, dueDate: addDays(30) },
      ];

      const toSeed = role === "buyer" ? buyerItems : sellerItems;
      for (const item of toSeed) {
        storage.createChecklistItem({ transactionId: txnId, role, status: "pending", ...item });
      }
      items = storage.getChecklistByRole(txnId, role);
    }

    res.json(items);
  });

  app.patch("/api/transactions/:id/checklist/:itemId", requireAuth, (req, res) => {
    const id = parseInt(req.params.itemId);
    const { status } = req.body as { status: string };
    const allowed = ["pending", "in_progress", "completed"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const updated = storage.updateChecklistItem(id, { status });
    if (!updated) return res.status(404).json({ message: "Item not found" });
    res.json(updated);
  });

  // ── Portal: AI Chat ────────────────────────────────────────────────────────
  app.post("/api/transactions/:id/portal-chat", requireAuth, async (req, res) => {
    const txnId = parseInt(req.params.id);
    const currentUser = (req as any).user;
    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    const { portal, message } = req.body as { portal: string; message: string };
    if (!portal || !message) return res.status(400).json({ message: "portal and message required" });

    // Save user message
    storage.createPortalMessage({ transactionId: txnId, portal, userId: currentUser.id, role: "user", content: message });

    // Generate AI response
    const listing = storage.getListing(txn.listingId);
    const offer = storage.getOffer(txn.offerId);
    const userRole = currentUser.id === txn.buyerId ? "buyer" : "seller";

    const aiResponse = await getPortalAIResponse(portal, message, { txn, listing, offer, userRole });

    const aiMsg = storage.createPortalMessage({ transactionId: txnId, portal, userId: currentUser.id, role: "ai", content: aiResponse });

    res.json({ message: aiMsg, response: aiResponse });
  });

  app.get("/api/transactions/:id/portal-messages/:portal", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const { portal } = req.params;
    const msgs = storage.getPortalMessages(txnId, portal);
    res.json(msgs);
  });

  // ── Portal: Documents ─────────────────────────────────────────────────────
  app.get("/api/transactions/:id/portal-documents", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const portal = req.query.portal as string | undefined;
    const docs = storage.getPortalDocuments(txnId, portal);
    res.json(docs);
  });

  app.post("/api/transactions/:id/documents/upload", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const currentUser = (req as any).user;
    const { portal, name, type, documentId } = req.body as { portal: string; name: string; type: string; documentId?: number };

    if (documentId) {
      // Update existing document status
      const updated = storage.updatePortalDocument(documentId, { status: "uploaded", uploadedBy: currentUser.id, fileUrl: `/uploads/portal/${Date.now()}-${name}` });
      return res.json(updated);
    }

    const doc = storage.createPortalDocument({
      transactionId: txnId,
      portal: portal || "general",
      name: name || "Document",
      type: type || "document",
      status: "uploaded",
      uploadedBy: currentUser.id,
      fileUrl: `/uploads/portal/${Date.now()}-${name}`,
    });
    res.json(doc);
  });

  app.patch("/api/transactions/:id/portal-documents/:docId", requireAuth, (req, res) => {
    const id = parseInt(req.params.docId);
    const updated = storage.updatePortalDocument(id, req.body);
    if (!updated) return res.status(404).json({ message: "Document not found" });
    res.json(updated);
  });

  // ── Portal: Lender Info ───────────────────────────────────────────────────
  app.patch("/api/transactions/:id/lender", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    // We store lender info as a portal message with role "system"
    const msg = storage.createPortalMessage({
      transactionId: txnId,
      portal: "lender",
      userId: (req as any).user.id,
      role: "user",
      content: JSON.stringify({ type: "lender_info", ...req.body }),
    });
    res.json(msg);
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

  // ========== AI HOME ADVISOR (global chat) ==========
  app.post("/api/advisor/chat", async (req, res) => {
    try {
      const { message, history, context } = req.body;
      if (!message) return res.status(400).json({ message: "message required" });

      const user = req.isAuthenticated() ? (req.user as any) : null;
      const advisorContext = {
        page: context?.page || "/",
        userRole: user?.role || context?.userRole,
        userName: user?.fullName?.split(" ")[0] || undefined,
        transactionId: context?.transactionId,
        listingAddress: context?.listingAddress,
        offerAmount: context?.offerAmount,
        listingPrice: context?.listingPrice,
      };

      const response = await getAdvisorResponse(
        message,
        history || [],
        advisorContext
      );

      res.json({ response });
    } catch (error: any) {
      console.error("Advisor chat error:", error);
      res.status(500).json({ message: "Failed to get AI response" });
    }
  });
}
