import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertListingSchema, insertOfferSchema, insertWalkthroughSchema, insertDocumentSchema, insertMessageSchema, insertTransactionSchema, insertSavedSearchSchema, insertFavoriteSchema, insertChaperoneApplicationSchema, insertChaperonePayoutSchema } from "@shared/schema";
import { createPaymentIntent, TEST_MODE } from "./payments";
import { sendNewOfferEmail, sendOfferStatusEmail, sendWalkthroughScheduledEmail, sendWalkthroughAssignedEmail, sendDocumentReadyEmail, sendEmail } from "./email";
import { getAINegotiationResponse } from "./ai-negotiation";
import { getAdvisorResponse } from "./ai-advisor";
import { chat, chatStream, chatWithTools, chatWithConfidence, hasLLMProvider, getActiveProvider } from "./ai-engine";
import { getBaseKnowledge, getPortalKnowledge } from "./knowledge-base";
import { getRelevantContext } from "./vector-store";
import { runAgent, type AgentContext } from "./ai-agent";
import { runBuyerAgent } from "./buyer-agent";
import { runSellerAgent } from "./seller-agent";
import { runEvalSuite, getEvalCases, getEvalCasesByCategory } from "./ai-eval";
import { toolDefinitions } from "./ai-tools";
import { getDocumentSummary, sendDocumentsForSigning, buildTransactionContext, getCurrentStage, getDocumentsForRole, getFullDocumentPlan, analyzeTransactionDocuments, DOCUMENT_REGISTRY } from "./document-orchestrator";
import { fillDocument, generateFullQuestionnaire, getConfiguredDocuments, isDocumentReady } from "./document-filler";
import { encrypt, decrypt, encryptObject, decryptObject, prepareForDisplay, decryptForAgent, isEncryptionConfigured } from "./encryption";
import { isDocuSignConfigured, getEnvelopeStatus, getSigningUrl } from "./docusign";
import { searchMLSListings } from "./mls-api";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { passport } from "./auth";
import fs from "fs";
import path from "path";
import { generatePurchaseAgreement, generateSellerDisclosure, generateClosingDisclosure, generateLeadPaintDisclosure, generateRadonDisclosure, generateFloodZoneDisclosure, generateRepairAddendum, generateFinalWalkthroughChecklist, generateClosingStatement, generatePromissoryNote, generateDeed, generateHOADisclosure, generateInsuranceBinder } from "./documents";
import crypto from "crypto";

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

// Multer for professional document uploads (images + PDFs)
const proUpload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) =>
      cb(null, `pro-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only images and PDFs allowed"));
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

  // Create a demo offer (offer 1 on listing 3 - Craftsman Bungalow, seller2)
  storage.createOffer({
    listingId: 3, buyerId: buyer1.id, amount: 560000, status: "pending",
    message: "We love this home! Our family is very interested. We're pre-approved and can close in 30 days.",
    contingencies: JSON.stringify(["Inspection", "Financing", "Appraisal"]),
    closingDate: "2026-05-15",
    financingType: "conventional", downPaymentPercent: 20, earnestMoney: 5600, closingDays: 30,
  });

  // Create a SECOND offer on the same listing (listing 3) from a different buyer — for offer comparison demo
  // Create a second demo buyer
  const buyer2 = storage.createUser({ email: "jennifer@example.com", password: demoHash, fullName: "Jennifer Walsh", phone: "813-555-0505", role: "buyer", location: "Tampa, FL", bio: "Relocating from Atlanta, cash buyer." });
  storage.createOffer({
    listingId: 3, buyerId: buyer2.id, amount: 572000, status: "pending",
    message: "We are cash buyers relocating from Atlanta. Can close in 21 days, no financing contingency.",
    contingencies: JSON.stringify(["Inspection"]),
    closingDate: "2026-04-26",
    financingType: "cash", downPaymentPercent: 100, earnestMoney: 10000, closingDays: 21,
  });

  // Create a third offer on listing 3
  const buyer3 = storage.createUser({ email: "robert@example.com", password: demoHash, fullName: "Robert Nguyen", phone: "813-555-0606", role: "buyer", location: "Clearwater, FL", bio: "First time home buyer." });
  storage.createOffer({
    listingId: 3, buyerId: buyer3.id, amount: 551000, status: "pending",
    message: "We are a young family that fell in love with this neighborhood. FHA financing, ready to make it work.",
    contingencies: JSON.stringify(["Inspection", "Financing", "Appraisal", "Sale of Current Home"]),
    closingDate: "2026-06-01",
    financingType: "fha", downPaymentPercent: 3.5, earnestMoney: 3000, closingDays: 45,
  });

  // Create a demo walkthrough
  storage.createWalkthrough({
    listingId: 1, buyerId: buyer1.id, scheduledDate: "2026-04-10", scheduledTime: "2:00 PM",
    status: "requested", chaperonePayment: 20, buyerNotes: "Would love to see the dock area and kitchen."
  });

  // Additional walkthroughs in various statuses
  storage.createWalkthrough({
    listingId: 2, buyerId: buyer2.id, scheduledDate: "2026-04-12", scheduledTime: "11:00 AM",
    status: "assigned", chaperonePayment: 20, chaperoneId: chaperone1.id,
  });
  storage.createWalkthrough({
    listingId: 4, buyerId: buyer3.id, scheduledDate: "2026-04-20", scheduledTime: "3:00 PM",
    status: "requested", chaperonePayment: 20,
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
  // Set closing date within 7 days of seeding for closing-prep demo
  const closingDateDemo = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split("T")[0];
  })();
  const salePrice = 560000;
  const txn = storage.createTransaction({
    listingId: 3,
    offerId: 1,
    buyerId: buyer1.id,
    sellerId: seller2.id,
    salePrice,
    platformFee: Math.round(salePrice * 0.01),
    status: "in_progress",
    closingDate: closingDateDemo,
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

  // Seed a demo repair request
  storage.createRepairRequest({
    transactionId: txn.id,
    status: "pending",
    buyerItems: JSON.stringify([
      { finding: "Roof damage — multiple shingles missing", type: "credit", estimatedCost: 10000 },
      { finding: "Electrical panel — double-tapped breakers", type: "repair", estimatedCost: 1650 },
      { finding: "Water heater at end of useful life", type: "credit", estimatedCost: 1200 },
    ]),
    buyerNotes: "Please address these items before closing. The roof and electrical issues are safety concerns.",
  });

  // Notify seller of repair request
  storage.createNotification({
    userId: seller2.id,
    type: "repair_request",
    title: "Repair Request Received",
    message: "The buyer has submitted a repair request with $12,850 in requested credits/repairs.",
    relatedUrl: `/transaction/${txn.id}/inspection`,
    read: 0,
  });

  // ── Seed Professional Access ──
  const proTokens = {
    inspector: "demo-inspector-token-0001-0000000000001",
    appraiser: "demo-appraiser-token-002-0000000000002",
    lender:    "demo-lender-token-00003-0000000000003",
    title:     "demo-title-company-0004-0000000000004",
    photographer: "demo-photographer-005-0000000000005",
    insurer:      "demo-insurer-token-006-0000000000006",
  };

  const expiresAt90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const inspector = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "inspector", name: "David Martinez", company: "ProHome Inspections",
    email: "david@prohome.com", phone: "813-555-1001",
    accessToken: proTokens.inspector, status: "active", expiresAt: expiresAt90,
  });
  const appraiser = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "appraiser", name: "Jennifer Walsh", company: "Metro Appraisals",
    email: "jwalsh@metroappraisals.com", phone: "813-555-1002",
    accessToken: proTokens.appraiser, status: "active", expiresAt: expiresAt90,
  });
  const lender = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "lender", name: "Marcus Johnson", company: "First Federal Mortgage",
    email: "mjohnson@firstfederal.com", phone: "813-555-1003",
    accessToken: proTokens.lender, status: "active", expiresAt: expiresAt90,
  });
  const titleCo = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "title", name: "Maria Gonzalez", company: "First Title Trust",
    email: "mgonzalez@firsttitletrust.com", phone: "813-555-1004",
    accessToken: proTokens.title, status: "active", expiresAt: expiresAt90,
  });
  const photographer = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "photographer", name: "Alex Rivera", company: "HomeSnap Photography",
    email: "alex@homesnap.com", phone: "813-555-1005",
    accessToken: proTokens.photographer, status: "completed", expiresAt: expiresAt90,
  });
  const insurer = storage.createProfessionalAccess({
    transactionId: txn.id, listingId: txn.listingId,
    type: "insurer", name: "Sarah Thompson", company: "Sunshine State Insurance",
    email: "sthompson@sunshineins.com", phone: "813-555-1006",
    accessToken: proTokens.insurer, status: "active", expiresAt: expiresAt90,
  });

  // Seed professional messages
  const buyerName = "Michael Cain";
  const sellerName = "James Chen";

  storage.createProfessionalMessage({
    professionalAccessId: inspector.id,
    senderType: "system", senderName: "HomeDirectAI",
    content: "Welcome, David! This is your inspection portal for 725 15th Ave NE, St. Petersburg, FL. The buyer is Michael Cain and the seller is James Chen. Please upload your inspection report when complete.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: inspector.id,
    senderType: "buyer", senderName: buyerName,
    content: "Hi David, looking forward to your report. Please pay special attention to the roof and foundation — this is an older Craftsman home from 1925.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: inspector.id,
    senderType: "professional", senderName: "David Martinez",
    content: "Hi Michael, absolutely. I'll be thorough on all systems given the age of the home. I'll note the condition of the original plumbing and electrical as well. Inspection is scheduled for tomorrow at 9 AM.",
  });

  storage.createProfessionalMessage({
    professionalAccessId: lender.id,
    senderType: "system", senderName: "HomeDirectAI",
    content: "Welcome, Marcus! This is the lender portal for Michael Cain's purchase at 725 15th Ave NE, St. Petersburg, FL. The purchase price is $560,000.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: lender.id,
    senderType: "buyer", senderName: buyerName,
    content: "Hi Marcus, just checking in on the loan status. Any updates on the appraisal order?",
  });
  storage.createProfessionalMessage({
    professionalAccessId: lender.id,
    senderType: "professional", senderName: "Marcus Johnson",
    content: "Hi Michael! The loan is progressing well. We've ordered the appraisal and you should hear back within 7–10 business days. Currently in Underwriting. Conditional approval expected by end of week.",
  });

  storage.createProfessionalMessage({
    professionalAccessId: titleCo.id,
    senderType: "system", senderName: "HomeDirectAI",
    content: "Welcome, Maria! This is the title portal for the transaction at 725 15th Ave NE, St. Petersburg, FL. Buyer: Michael Cain. Seller: James Chen. Purchase price: $560,000.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: titleCo.id,
    senderType: "seller", senderName: sellerName,
    content: "Hi Maria, I wanted to confirm — we'll need to get the payoff statement from my mortgage lender. Do you need anything else from me before closing?",
  });
  storage.createProfessionalMessage({
    professionalAccessId: titleCo.id,
    senderType: "professional", senderName: "Maria Gonzalez",
    content: "Hi James, yes please provide the payoff statement and a valid government-issued ID. Also, do you have an HOA for this property? If so, we'll need the HOA demand letter. I'll follow up with exact wire instructions once the closing disclosure is ready.",
  });

  storage.createProfessionalMessage({
    professionalAccessId: photographer.id,
    senderType: "professional", senderName: "Alex Rivera",
    content: "Hi! Photos are complete and uploaded. Shot list is 100% done — 47 photos total including exterior, interior, and aerial drone shots. You should see them in the portal.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: photographer.id,
    senderType: "seller", senderName: sellerName,
    content: "These look amazing Alex, thank you! The drone shots especially came out fantastic.",
  });

  storage.createProfessionalMessage({
    professionalAccessId: insurer.id,
    senderType: "system", senderName: "HomeDirectAI",
    content: "Welcome, Sarah! This is the insurance portal for Michael Cain's purchase at 725 15th Ave NE, St. Petersburg, FL. The purchase price is $560,000. Please provide a homeowner's insurance quote and binder for closing.",
  });
  storage.createProfessionalMessage({
    professionalAccessId: insurer.id,
    senderType: "buyer", senderName: buyerName,
    content: "Hi Sarah, I'd like to get a quote for an HO-3 policy. The home was built in 1925 — will the age of the roof affect the premium?",
  });
  storage.createProfessionalMessage({
    professionalAccessId: insurer.id,
    senderType: "professional", senderName: "Sarah Thompson",
    content: "Hi Michael! Great question. Given the home's age, we may need a 4-point inspection (roof, electrical, plumbing, HVAC) to finalize the rate. I'll prepare a preliminary quote based on the listing details. Also, this property is not in a flood zone, so flood insurance won't be required by the lender — but I'd recommend it given Florida's weather.",
  });

  // ── Seed Transaction Documents (auto-generated on offer acceptance) ──
  const fullAddr = "725 15th Ave NE, St. Petersburg, FL 33704";
  try {
    const paUrl = generatePurchaseAgreement({ buyerName: buyerName, sellerName: sellerName, propertyAddress: fullAddr, purchasePrice: salePrice, closingDate: closingDateDemo, contingencies: ["Inspection", "Financing", "Appraisal"] });
    const sdUrl = generateSellerDisclosure({ sellerName, propertyAddress: fullAddr, yearBuilt: 1925 });
    const cdUrl = generateClosingDisclosure({ buyerName: buyerName, sellerName: sellerName, propertyAddress: fullAddr, purchasePrice: salePrice, platformFee: Math.round(salePrice * 0.01), closingDate: closingDateDemo });
    const radonUrl = generateRadonDisclosure({ sellerName, buyerName: buyerName, propertyAddress: fullAddr });
    const floodUrl = generateFloodZoneDisclosure({ sellerName, buyerName: buyerName, propertyAddress: fullAddr });
    const leadUrl = generateLeadPaintDisclosure({ buyerName: buyerName, sellerName, propertyAddress: fullAddr, yearBuilt: 1925 });
    const walkUrl = generateFinalWalkthroughChecklist({ buyerName: buyerName, propertyAddress: fullAddr, scheduledDate: closingDateDemo });
    const csUrl = generateClosingStatement({ buyerName: buyerName, sellerName, propertyAddress: fullAddr, purchasePrice: salePrice, loanAmount: salePrice * 0.8, closingDate: closingDateDemo });
    const deedUrl = generateDeed({ grantorName: sellerName, granteeName: buyerName, propertyAddress: fullAddr, county: "Pinellas", purchasePrice: salePrice });
    const insUrl = generateInsuranceBinder({ buyerName: buyerName, propertyAddress: fullAddr, purchasePrice: salePrice, effectiveDate: closingDateDemo });

    const demoDocTypes = [
      { type: "contract", name: "Purchase Agreement", status: "draft", content: paUrl, signedByBuyer: true, signedBySeller: true },
      { type: "disclosure", name: "Seller's Property Disclosure", status: "draft", content: sdUrl, signedByBuyer: false, signedBySeller: true },
      { type: "disclosure", name: "Radon Disclosure Notice", status: "draft", content: radonUrl, signedByBuyer: true, signedBySeller: true },
      { type: "disclosure", name: "Flood Zone Disclosure", status: "draft", content: floodUrl, signedByBuyer: true, signedBySeller: true },
      { type: "disclosure", name: "Lead-Based Paint Disclosure", status: "draft", content: leadUrl, signedByBuyer: false, signedBySeller: false },
      { type: "title", name: "Title Search Report", status: "pending_review", content: null },
      { type: "inspection", name: "Home Inspection Report", status: "uploaded", content: null },
      { type: "closing", name: "Closing Disclosure (CD)", status: "draft", content: cdUrl, signedByBuyer: false, signedBySeller: false },
      { type: "closing", name: "Closing Statement", status: "draft", content: csUrl },
      { type: "closing", name: "Warranty Deed", status: "draft", content: deedUrl },
      { type: "closing", name: "Final Walkthrough Checklist", status: "draft", content: walkUrl },
      { type: "closing", name: "Insurance Binder Request", status: "draft", content: insUrl },
    ];
    demoDocTypes.forEach(d => {
      storage.createDocument({ listingId: 3, offerId: 1, type: d.type, name: d.name, status: d.status, content: d.content, signedByBuyer: (d as any).signedByBuyer || false, signedBySeller: (d as any).signedBySeller || false });
    });
    console.log("[Seed] Generated 12 transaction documents");
  } catch (err) {
    console.error("[Seed] Document generation error:", err);
  }

  // ── Seed Questionnaire Responses (pre-filled buyer/seller data) ──
  if (storage.createQuestionnaireResponse) {
    // Buyer questionnaire responses — intentionally INCOMPLETE to demo "Information Needed"
    // Missing: vestingType, lenderName, interestRate, monthlyPayment, firstPaymentDate
    storage.createQuestionnaireResponse({
      transactionId: txn.id,
      userId: buyer1.id,
      role: "buyer",
      responses: JSON.stringify({
        buyerAddress: "4521 Gulf Blvd, St. Pete Beach, FL 33706",
        personalPropertyIncluded: "Refrigerator, washer, dryer, and patio furniture",
        occupancyDate: closingDateDemo,
        // vestingType: intentionally missing — AI will ask
        // lenderName: intentionally missing — AI will ask
        loanAmount: salePrice * 0.8,
        // interestRate: intentionally missing — AI will ask
        termYears: 30,
        // monthlyPayment: intentionally missing — AI will ask
        // firstPaymentDate: intentionally missing — AI will ask
        buyerWaivesInspection: false,
      }),
      completedSections: JSON.stringify(["parties"]),
    });

    // Seller questionnaire responses — intentionally INCOMPLETE for some disclosure items
    // Missing: maritalStatus, mortgagePayoff, knownLeadPaint, sinkholeActivity
    storage.createQuestionnaireResponse({
      transactionId: txn.id,
      userId: seller2.id,
      role: "seller",
      responses: JSON.stringify({
        sellerAddress: "1200 Main St, Tampa, FL 33607",
        legalDescription: "Lot 15, Block 3, OLD NORTHEAST SUBDIVISION, according to map or plat thereof recorded in Plat Book 9, Page 45, Public Records of Pinellas County, Florida",
        parcelId: "24-31-16-12345-003-0150",
        roofAge: 8,
        roofMaterial: "Asphalt Shingle",
        foundationIssues: true,
        roofLeaks: false,
        waterIntrusion: false,
        previousRepairs: true,
        repairDetails: "Foundation hairline crack repaired in 2019 by ABC Foundation Repair. Lifetime transferable warranty.",
        hvacAge: 6,
        hvacIssues: false,
        plumbingIssues: false,
        plumbingType: "Copper",
        electricalIssues: true,
        waterHeaterAge: 4,
        knownAsbestos: false,
        // knownLeadPaint: intentionally missing — AI will ask (pre-1978 home)
        knownMold: false,
        undergroundTanks: false,
        // sinkholeActivity: intentionally missing — AI will ask (Pinellas County)
        floodDamage: false,
        pendingLawsuits: false,
        hoaViolations: false,
        easements: false,
        zoningViolations: false,
        additionalDisclosures: "Electrical panel has double-tapped breakers noted in previous inspection. Quote obtained for repair: $1,650.",
        // maritalStatus: intentionally missing — needed for deed
        // mortgagePayoff: intentionally missing — needed for closing statement
      }),
      completedSections: JSON.stringify(["parties", "property", "structural", "mechanical"]),
    });
    console.log("[Seed] Created buyer and seller questionnaire responses");
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

  const ruleBasedResponse = portalResponses[portal] || portalResponses.general;

  // Use the unified AI engine (Together AI -> Fireworks AI -> DeepSeek -> rule-based)
  if (hasLLMProvider()) {
    try {
      const portalContext = getPortalKnowledge(portal, userRole, address, txn.salePrice);
      const systemPrompt = getBaseKnowledge() + portalContext;
      const aiResult = await chat(systemPrompt, message, [], 600);
      if (aiResult) return aiResult;
    } catch {
      // Fall through to rule-based
    }
  }

  return ruleBasedResponse;
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

        // ── Smart Document Generation via Orchestrator ──
        // The agent analyzes this specific transaction and generates ONLY the documents needed.
        const closingDate = offer.closingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const contingencies = (() => { try { return JSON.parse(offer.contingencies || "[]"); } catch { return []; } })();
        const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
        const buyerFullName = buyer?.fullName || "Buyer";
        const sellerFullName = seller?.fullName || "Seller";
        const isCash = offer.financingType === "cash";
        const loanAmount = isCash ? 0 : offer.amount * (1 - ((offer.downPaymentPercent || 20) / 100));

        // Map of document generators by name
        const generators: Record<string, () => string | undefined> = {
          "Purchase Agreement": () => generatePurchaseAgreement({ buyerName: buyerFullName, sellerName: sellerFullName, propertyAddress: fullAddress, purchasePrice: offer.amount, closingDate, contingencies }),
          "Seller's Property Disclosure": () => generateSellerDisclosure({ sellerName: sellerFullName, propertyAddress: fullAddress, yearBuilt: listing.yearBuilt || undefined }),
          "Radon Disclosure Notice": () => generateRadonDisclosure({ sellerName: sellerFullName, buyerName: buyerFullName, propertyAddress: fullAddress }),
          "Flood Zone Disclosure": () => generateFloodZoneDisclosure({ sellerName: sellerFullName, buyerName: buyerFullName, propertyAddress: fullAddress }),
          "Lead-Based Paint Disclosure": () => generateLeadPaintDisclosure({ buyerName: buyerFullName, sellerName: sellerFullName, propertyAddress: fullAddress, yearBuilt: listing.yearBuilt || 1970 }),
          "HOA/Condo Disclosure": () => generateHOADisclosure({ sellerName: sellerFullName, buyerName: buyerFullName, propertyAddress: fullAddress, monthlyFee: listing.hoaFee || 0 }),
          "Closing Disclosure (CD)": () => generateClosingDisclosure({ buyerName: buyerFullName, sellerName: sellerFullName, propertyAddress: fullAddress, purchasePrice: offer.amount, platformFee: offer.amount * 0.01, closingDate }),
          "Closing Statement": () => generateClosingStatement({ buyerName: buyerFullName, sellerName: sellerFullName, propertyAddress: fullAddress, purchasePrice: offer.amount, loanAmount, closingDate }),
          "Final Walkthrough Checklist": () => generateFinalWalkthroughChecklist({ buyerName: buyerFullName, propertyAddress: fullAddress, scheduledDate: closingDate }),
          "Warranty Deed": () => generateDeed({ grantorName: sellerFullName, granteeName: buyerFullName, propertyAddress: fullAddress, county: listing.city, purchasePrice: offer.amount }),
          "Insurance Binder Request": () => generateInsuranceBinder({ buyerName: buyerFullName, propertyAddress: fullAddress, purchasePrice: offer.amount, effectiveDate: closingDate }),
          "Promissory Note": () => generatePromissoryNote({ borrowerName: buyerFullName, lenderName: "Lender TBD", propertyAddress: fullAddress, loanAmount, interestRate: 7.0, termYears: 30, monthlyPayment: Math.round(loanAmount * 0.006653), firstPaymentDate: closingDate }),
        };

        // Use the orchestrator to determine which documents this transaction needs
        const analysis = analyzeTransactionDocuments(transaction.id);
        const allNeededDocs = [...analysis.requiredNow, ...analysis.requiredLater];

        console.log(`[Documents] Transaction ${transaction.id}: ${allNeededDocs.length} docs needed, ${analysis.notNeeded.length} excluded`);
        if (analysis.notNeeded.length > 0) {
          console.log(`[Documents] Excluded: ${analysis.notNeeded.map(d => `${d.name} (${d.reason})`).join(", ")}`);
        }

        // Generate only the documents that the orchestrator says are needed
        const generatedDocTypes: Array<{ type: string; name: string; url?: string }> = [];
        for (const doc of allNeededDocs) {
          const generator = generators[doc.name];
          let url: string | undefined;
          if (generator) {
            try { url = generator(); } catch (err) { console.error(`[Documents] Failed to generate ${doc.name}:`, err); }
          }
          // Find the registry entry for the document type
          const regEntry = DOCUMENT_REGISTRY.find(r => r.name === doc.name);
          generatedDocTypes.push({ type: regEntry?.documentType || "closing", name: doc.name, url });
        }

        // Also add placeholder entries for third-party docs that will be uploaded
        if (!isCash) {
          generatedDocTypes.push({ type: "title", name: "Title Search Report", url: undefined });
          generatedDocTypes.push({ type: "inspection", name: "Home Inspection Report", url: undefined });
        }

        // Create document records
        generatedDocTypes.forEach(d => {
          storage.createDocument({
            listingId: offer.listingId, offerId: offer.id,
            type: d.type, name: d.name, status: d.url ? "draft" : "pending_review",
            content: d.url || null,
          });
          sendDocumentReadyEmail(buyer?.email || "", buyerFullName, d.name, `${listing.address}, ${listing.city}, ${listing.state}`).catch(() => {});
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

  // ── Chaperone App Mobile Endpoints ──────────────────────────────────

  // GET /api/chaperone/app/status — chaperone's current status, active gig, balance, stats
  app.get("/api/chaperone/app/status", requireAuth, (req, res) => {
    try {
      const userId = (req.user as any).id;
      const walkthroughs = storage.getWalkthroughsByChaperone(userId);
      const activeGig = walkthroughs.find((w: any) => w.status === "assigned") || null;
      const payouts = storage.getChaperonePayouts(userId);
      const completedEarnings = payouts
        .filter((p: any) => p.type === "earning" && p.status === "completed")
        .reduce((s: number, p: any) => s + p.amount, 0);
      const withdrawals = Math.abs(payouts
        .filter((p: any) => p.type === "payout")
        .reduce((s: number, p: any) => s + p.amount, 0));
      const balance = completedEarnings - withdrawals;
      const completedShowings = walkthroughs.filter((w: any) => w.status === "completed").length;

      res.json({
        isOnline: false,
        activeGig,
        balance,
        totalEarnings: completedEarnings,
        completedShowings,
        rating: 4.8,
      });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // PATCH /api/chaperone/app/online — toggle online/offline (stateless stub)
  app.patch("/api/chaperone/app/online", requireAuth, (req, res) => {
    const { online } = req.body;
    res.json({ online: !!online });
  });

  // GET /api/chaperone/app/active-gig — get the current accepted gig with full listing details
  app.get("/api/chaperone/app/active-gig", requireAuth, (req, res) => {
    try {
      const userId = (req.user as any).id;
      const walkthroughs = storage.getWalkthroughsByChaperone(userId);
      const activeWalkthrough = walkthroughs.find((w: any) => w.status === "assigned");
      if (!activeWalkthrough) return res.json(null);

      const listing = storage.getListing(activeWalkthrough.listingId);
      res.json({ ...activeWalkthrough, listing: listing || null });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // POST /api/chaperone/app/gig/:id/checklist — update checklist items for active gig
  app.post("/api/chaperone/app/gig/:id/checklist", requireAuth, (req, res) => {
    // Stateless checklist stored client-side; this endpoint acknowledges the update
    const { items } = req.body;
    res.json({ id: parseInt(req.params.id), items: items || [] });
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

  // ========== AI TRAINING DATA (admin only) ==========
  app.get("/api/admin/training-data", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { generateTrainingData } = await import("./training-data");
      const filePath = await generateTrainingData();
      res.download(filePath, "real-estate-knowledge.jsonl", (err) => {
        if (err) {
          console.error("Training data download error:", err);
          res.status(500).json({ message: "Failed to download training data" });
        }
      });
    } catch (error: any) {
      console.error("Training data generation error:", error);
      res.status(500).json({ message: "Failed to generate training data" });
    }
  });

  // ========== MLS LISTINGS (Realtor16 via RapidAPI) ==========
  app.get("/api/mls/search", async (req, res) => {
    try {
      const {
        location,
        minPrice, maxPrice, minBeds,
        sort, limit, offset, propertyType,
      } = req.query as Record<string, string>;

      const listings = await searchMLSListings({
        location: location || "Tampa, FL",
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minBeds: minBeds ? parseFloat(minBeds) : undefined,
        sort: sort || "newest",
        limit: limit ? parseInt(limit) : 20,
        offset: offset ? parseInt(offset) : 0,
        propertyType: propertyType || undefined,
      });

      const configured = !!process.env.RAPIDAPI_KEY;
      res.json({ listings, total: listings.length, source: "mls", configured });
    } catch (error: any) {
      console.error("MLS search error:", error);
      res.status(500).json({ message: "MLS search failed", listings: [], total: 0, configured: !!process.env.RAPIDAPI_KEY });
    }
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

  // ========== AI PRICE SUGGESTION ==========
  app.post("/api/ai/price-suggestion", async (req, res) => {
    try {
      const { address, city, state, beds, baths, sqft, yearBuilt, propertyType } = req.body;
      if (!sqft) return res.status(400).json({ message: "sqft required" });

      // Rule-based estimate (Florida / Tampa area)
      let basePricePerSqft = 200;

      // Waterfront/beach premium
      const combined = `${address || ""} ${city || ""}`.toLowerCase();
      if (combined.includes("bay") || combined.includes("beach") || combined.includes("gulf") ||
          combined.includes("water") || combined.includes("shore") || combined.includes("isle")) {
        basePricePerSqft *= 1.15;
      }

      // Age adjustment
      const yr = parseInt(yearBuilt || "2000");
      if (yr > 2015) basePricePerSqft *= 1.10;
      else if (yr < 1970) basePricePerSqft *= 0.90;

      // Condo adjustment
      if (propertyType === "condo") basePricePerSqft *= 0.95;
      if (propertyType === "townhouse") basePricePerSqft *= 1.02;

      const sqftNum = parseInt(sqft);
      const suggestedPrice = Math.round(basePricePerSqft * sqftNum / 1000) * 1000;
      const low = Math.round(suggestedPrice * 0.95 / 1000) * 1000;
      const high = Math.round(suggestedPrice * 1.05 / 1000) * 1000;

      // Try AI engine if available (Together AI -> Fireworks AI -> DeepSeek)
      if (hasLLMProvider()) {
        try {
          const pricingSystemPrompt = "You are a real estate pricing expert for the Tampa Bay, Florida area. Provide a realistic price suggestion based on property details. Respond with JSON only in the format: {\"suggestedPrice\": number, \"low\": number, \"high\": number, \"rationale\": string}";
          const pricingUserMessage = `Price this property: ${beds} bed / ${baths} bath / ${sqft} sqft / built ${yearBuilt} / ${propertyType} at ${address}, ${city}, ${state}`;
          const aiContent = await chat(pricingSystemPrompt, pricingUserMessage, [], 300);
          if (aiContent) {
            const parsed = JSON.parse(aiContent.replace(/```json\n?|```/g, "").trim());
            if (parsed.suggestedPrice) {
              return res.json({
                suggestedPrice: parsed.suggestedPrice,
                priceRange: { low: parsed.low || low, high: parsed.high || high },
                rationale: parsed.rationale || `Based on ${sqft} sqft at ${city}, ${state} area comparables.`,
                comparables: [
                  { address: `Similar home nearby`, sqft: sqftNum, price: suggestedPrice, pricePerSqft: Math.round(basePricePerSqft) },
                ],
                netProceeds: Math.round(parsed.suggestedPrice * 0.99 - suggestedPrice * 0.02),
              });
            }
          }
        } catch { /* fall through to rule-based */ }
      }

      const rationale = [
        `Based on ${sqft} sqft at ~$${Math.round(basePricePerSqft)}/sqft for ${city || "Tampa Bay"} area`,
        yr > 2015 ? "(+10% for newer construction post-2015)" : yr < 1970 ? "(-10% for pre-1970 construction)" : "",
        combined.includes("bay") || combined.includes("beach") || combined.includes("gulf") ? "(+15% waterfront/beach premium)" : "",
      ].filter(Boolean).join(". ");

      res.json({
        suggestedPrice,
        priceRange: { low, high },
        rationale,
        comparables: [
          { address: `Comparable A — ${city || "Tampa"}`, sqft: Math.round(sqftNum * 0.95), price: Math.round(suggestedPrice * 0.97), pricePerSqft: Math.round(basePricePerSqft * 0.97) },
          { address: `Comparable B — ${city || "Tampa"}`, sqft: sqftNum, price: suggestedPrice, pricePerSqft: Math.round(basePricePerSqft) },
          { address: `Comparable C — ${city || "Tampa"}`, sqft: Math.round(sqftNum * 1.05), price: Math.round(suggestedPrice * 1.03), pricePerSqft: Math.round(basePricePerSqft * 1.03) },
        ],
        netProceeds: Math.round(suggestedPrice * 0.99 - suggestedPrice * 0.015),
      });
    } catch (error: any) {
      console.error("Price suggestion error:", error);
      res.status(500).json({ message: "Failed to generate price suggestion" });
    }
  });

  // ========== REPAIR REQUESTS ==========
  app.get("/api/transactions/:id/repair-request", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const repairReq = storage.getRepairRequestByTransaction(txnId);
    if (!repairReq) return res.status(404).json({ message: "No repair request found" });
    res.json(repairReq);
  });

  app.post("/api/transactions/:id/repair-request", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const { items, notes } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ message: "items array required" });

    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    // Create or update repair request
    const existing = storage.getRepairRequestByTransaction(txnId);
    let repairReq;
    if (existing) {
      repairReq = storage.updateRepairRequest(existing.id, {
        buyerItems: JSON.stringify(items),
        buyerNotes: notes || "",
        status: "pending",
      });
    } else {
      repairReq = storage.createRepairRequest({
        transactionId: txnId,
        buyerItems: JSON.stringify(items),
        buyerNotes: notes || "",
        status: "pending",
      });
    }

    // Notify the seller
    const totalCredit = items.reduce((sum: number, item: any) => sum + (item.estimatedCost || 0), 0);
    storage.createNotification({
      userId: txn.sellerId,
      type: "repair_request",
      title: "Repair Request Received",
      message: `The buyer has submitted a repair request with $${totalCredit.toLocaleString()} in requested credits/repairs.`,
      relatedUrl: `/transaction/${txnId}/inspection`,
      read: 0,
    });

    res.json(repairReq);
  });

  app.post("/api/transactions/:id/repair-response", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const { responses, notes } = req.body;
    if (!responses || !Array.isArray(responses)) return res.status(400).json({ message: "responses array required" });

    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    const existing = storage.getRepairRequestByTransaction(txnId);
    if (!existing) return res.status(404).json({ message: "No repair request found" });

    // Calculate agreed credits
    const agreedCredits = responses
      .filter((r: any) => r.decision === "accept")
      .reduce((sum: number, r: any) => sum + (r.counterAmount || r.estimatedCost || 0), 0);

    const hasCounters = responses.some((r: any) => r.decision === "counter");
    const allAccepted = responses.every((r: any) => r.decision === "accept");

    const repairReq = storage.updateRepairRequest(existing.id, {
      sellerResponse: JSON.stringify(responses),
      sellerNotes: notes || "",
      agreedCredits: agreedCredits.toString(),
      status: allAccepted ? "accepted" : hasCounters ? "countered" : "responded",
    });

    // Notify the buyer
    storage.createNotification({
      userId: txn.buyerId,
      type: "repair_response",
      title: "Seller Responded to Repair Request",
      message: `The seller has responded to your repair request. Agreed credits: $${agreedCredits.toLocaleString()}.`,
      relatedUrl: `/transaction/${txnId}/inspection`,
      read: 0,
    });

    res.json(repairReq);
  });

  // ========== DOCUMENT GENERATION ON DEMAND ==========

  // Generate Repair Addendum PDF
  app.post("/api/transactions/:id/repair-addendum", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const txn = storage.getTransaction(txnId);
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const repairReq = storage.getRepairRequestByTransaction(txnId);
      if (!repairReq) return res.status(404).json({ message: "No repair request found" });

      const listing = storage.getListing(txn.listingId);
      const buyer = storage.getUser(txn.buyerId);
      const seller = storage.getUser(txn.sellerId);

      const items = (() => { try { return JSON.parse(repairReq.buyerItems || "[]"); } catch { return []; } })();
      const totalCredits = items.reduce((sum: number, item: any) => sum + (item.estimatedCost || 0), 0);

      const url = generateRepairAddendum({
        buyerName: buyer?.fullName || "Buyer",
        sellerName: seller?.fullName || "Seller",
        propertyAddress: listing ? `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}` : "Property",
        purchasePrice: txn.salePrice,
        items,
        totalCreditsRequested: totalCredits,
      });

      // Create document record
      storage.createDocument({
        listingId: txn.listingId, offerId: txn.offerId,
        type: "inspection", name: "Repair Addendum", status: "draft", content: url,
      });

      res.json({ url, message: "Repair Addendum generated" });
    } catch (error: any) {
      console.error("Repair addendum error:", error);
      res.status(500).json({ message: "Failed to generate repair addendum" });
    }
  });

  // Generate Promissory Note
  app.post("/api/transactions/:id/promissory-note", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const txn = storage.getTransaction(txnId);
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const buyer = storage.getUser(txn.buyerId);
      const { lenderName, interestRate, termYears, monthlyPayment } = req.body;
      const offer = storage.getOffer(txn.offerId);
      const downPct = (offer?.downPaymentPercent || 20) / 100;
      const loanAmount = txn.salePrice * (1 - downPct);

      const url = generatePromissoryNote({
        borrowerName: buyer?.fullName || "Borrower",
        lenderName: lenderName || "Lender",
        propertyAddress: "Property",
        loanAmount,
        interestRate: interestRate || 7.0,
        termYears: termYears || 30,
        monthlyPayment: monthlyPayment || Math.round(loanAmount * 0.006653),
        firstPaymentDate: txn.closingDate || new Date().toISOString().split("T")[0],
      });

      storage.createDocument({
        listingId: txn.listingId, offerId: txn.offerId,
        type: "closing", name: "Promissory Note", status: "draft", content: url,
      });

      res.json({ url, message: "Promissory Note generated" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate promissory note" });
    }
  });

  // ========== DOCUSIGN & DOCUMENT ORCHESTRATION ==========

  // Get document plan for a transaction (what needs signing, by whom, at what stage)
  app.get("/api/transactions/:id/document-plan", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const ctx = buildTransactionContext(txnId);
      if (!ctx) return res.status(404).json({ message: "Transaction not found" });

      const user = req.user as any;
      const role = user.id === ctx.transaction.buyerId ? "buyer" : "seller";
      const stage = getCurrentStage(ctx);
      const myDocs = getDocumentsForRole(stage, role as "buyer" | "seller", ctx);
      const fullPlan = getFullDocumentPlan(ctx);

      res.json({
        currentStage: stage,
        role,
        myDocumentsToSign: myDocs.map(d => ({
          name: d.name, type: d.documentType, priority: d.priority,
          explanation: d.explanation, description: d.description,
        })),
        fullPlan: Object.fromEntries(
          Object.entries(fullPlan).map(([stage, docs]) => [
            stage,
            docs.map(d => ({ name: d.name, signers: d.signers, priority: d.priority })),
          ])
        ),
        docusignEnabled: isDocuSignConfigured(),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get document plan" });
    }
  });

  // Get signing status for a transaction
  app.get("/api/transactions/:id/signing-status", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const summary = getDocumentSummary(txnId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get signing status" });
    }
  });

  // Send documents for e-signature
  app.post("/api/transactions/:id/send-for-signing", requireAuth, async (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const { documentNames } = req.body;
      if (!documentNames || !Array.isArray(documentNames)) {
        return res.status(400).json({ message: "documentNames array required" });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const returnUrl = `${baseUrl}/#/transaction/${txnId}?signing=complete`;

      const result = await sendDocumentsForSigning(txnId, documentNames, returnUrl);

      res.json({
        success: true,
        envelopeId: result.envelopeId,
        signingUrls: result.signingUrls,
        usingDocuSign: !result.fallback,
        message: result.fallback
          ? "Documents marked for signing in the platform (DocuSign not configured)."
          : `Documents sent via DocuSign. Signing links generated for ${Object.keys(result.signingUrls).join(", ")}.`,
      });
    } catch (error: any) {
      console.error("Send for signing error:", error);
      res.status(500).json({ message: error.message || "Failed to send documents for signing" });
    }
  });

  // DocuSign envelope status check
  app.get("/api/docusign/envelope/:envelopeId", requireAuth, async (req, res) => {
    try {
      if (!isDocuSignConfigured()) {
        return res.json({ configured: false, message: "DocuSign not configured" });
      }
      const status = await getEnvelopeStatus(req.params.envelopeId);
      res.json({ configured: true, ...status });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to check envelope status" });
    }
  });

  // Get fresh signing URL (if previous expired)
  app.post("/api/docusign/signing-url", requireAuth, async (req, res) => {
    try {
      const { envelopeId, role } = req.body;
      const user = req.user as any;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const url = await getSigningUrl(
        envelopeId, user.email, user.fullName, role || user.role,
        `${baseUrl}/#/dashboard?signing=complete`,
      );
      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate signing URL" });
    }
  });

  // DocuSign webhook (status updates)
  app.post("/api/docusign/webhook", async (req, res) => {
    try {
      const event = req.body;
      console.log(`[DocuSign Webhook] Event: ${event?.event}`, JSON.stringify(event).substring(0, 200));

      if (event?.event === "envelope-completed") {
        // TODO: Update document status in DB, notify users
        console.log(`[DocuSign] Envelope ${event.data?.envelopeId} completed`);
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("DocuSign webhook error:", error);
      res.status(200).json({ received: true }); // Always return 200 to DocuSign
    }
  });

  // ========== QUESTIONNAIRE (Document Data Collection) ==========

  // Get questionnaire for a transaction — what info is still needed
  app.get("/api/transactions/:id/questionnaire", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const user = req.user as any;
      const txn = storage.getTransaction(txnId);
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const role = user.id === txn.buyerId ? "buyer" : "seller";

      // Get existing responses
      const existing = storage.getQuestionnaireResponses?.(txnId, user.id);
      const responses = existing ? JSON.parse(existing.responses || "{}") : {};

      const questionnaire = generateFullQuestionnaire(txnId, role as "buyer" | "seller", responses);

      res.json({
        role,
        ...questionnaire,
        existingResponses: responses,
        isComplete: questionnaire.totalQuestions === 0,
      });
    } catch (error: any) {
      console.error("Questionnaire error:", error);
      res.status(500).json({ message: "Failed to get questionnaire" });
    }
  });

  // Submit questionnaire responses
  app.post("/api/transactions/:id/questionnaire", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const user = req.user as any;
      const { responses, completedSections } = req.body;
      const txn = storage.getTransaction(txnId);
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const role = user.id === txn.buyerId ? "buyer" : "seller";

      // Encrypt sensitive fields before storage
      const encryptedResponses = encryptObject(responses || {});

      // Merge with existing responses
      const existing = storage.getQuestionnaireResponses?.(txnId, user.id);
      let mergedResponses = encryptedResponses;
      if (existing) {
        const prev = JSON.parse(existing.responses || "{}");
        mergedResponses = { ...prev, ...encryptedResponses };
      }

      // Save (create or update)
      if (existing && storage.updateQuestionnaireResponse) {
        storage.updateQuestionnaireResponse(existing.id, {
          responses: JSON.stringify(mergedResponses),
          completedSections: JSON.stringify(completedSections || []),
          updatedAt: new Date().toISOString(),
        });
      } else if (storage.createQuestionnaireResponse) {
        storage.createQuestionnaireResponse({
          transactionId: txnId,
          userId: user.id,
          role,
          responses: JSON.stringify(mergedResponses),
          completedSections: JSON.stringify(completedSections || []),
        });
      }

      // Check what documents are now ready to generate
      const readyDocs = getConfiguredDocuments().filter(docName =>
        isDocumentReady(docName, txnId, mergedResponses)
      );

      res.json({
        saved: true,
        totalResponses: Object.keys(mergedResponses).length,
        readyDocuments: readyDocs,
        message: readyDocs.length > 0
          ? `${readyDocs.length} document(s) now have all required information and can be generated.`
          : "Responses saved. Some documents still need additional information.",
      });
    } catch (error: any) {
      console.error("Questionnaire submit error:", error);
      res.status(500).json({ message: "Failed to save questionnaire responses" });
    }
  });

  // Preview filled document data (what fields are populated, what's missing)
  app.get("/api/transactions/:id/document-fill/:documentName", requireAuth, (req, res) => {
    try {
      const txnId = parseInt(req.params.id);
      const docName = decodeURIComponent(req.params.documentName);
      const user = req.user as any;

      const existing = storage.getQuestionnaireResponses?.(txnId, user.id);
      const responses = existing ? JSON.parse(existing.responses || "{}") : {};

      const result = fillDocument(docName, txnId, responses);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to preview document fill" });
    }
  });

  // Get the full document registry (all possible documents)
  app.get("/api/documents/registry", requireAuth, (_req, res) => {
    res.json({
      documents: DOCUMENT_REGISTRY.map(d => ({
        name: d.name, type: d.documentType, stage: d.stage,
        signers: d.signers, priority: d.priority,
        description: d.description, explanation: d.explanation,
        conditional: !!d.condition,
      })),
      total: DOCUMENT_REGISTRY.length,
    });
  });

  // List all available document generators
  app.get("/api/documents/generators", requireAuth, (_req, res) => {
    res.json({
      autoGenerated: [
        "Purchase Agreement", "Seller's Property Disclosure", "Closing Disclosure",
        "Radon Disclosure Notice", "Flood Zone Disclosure", "Closing Statement",
        "Warranty Deed", "Final Walkthrough Checklist", "Insurance Binder Request",
      ],
      conditional: [
        { name: "Lead-Based Paint Disclosure", condition: "Pre-1978 homes only" },
        { name: "HOA/Condo Disclosure", condition: "Properties with HOA fees" },
      ],
      onDemand: [
        { name: "Repair Addendum", endpoint: "POST /api/transactions/:id/repair-addendum" },
        { name: "Promissory Note", endpoint: "POST /api/transactions/:id/promissory-note" },
      ],
      thirdParty: [
        "Title Search Report (uploaded by title company)",
        "Home Inspection Report (uploaded by inspector)",
        "Appraisal Report (uploaded by appraiser)",
        "Loan Estimate (uploaded by lender)",
        "4-Point Inspection (uploaded by inspector)",
        "Wind Mitigation Report (uploaded by inspector)",
      ],
    });
  });

  // ========== PROFESSIONAL PORTAL ==========

  // Invite a professional to a transaction
  app.post("/api/transactions/:id/invite-professional", requireAuth, async (req, res) => {
    const txnId = parseInt(req.params.id);
    const { type, name, company, email, phone } = req.body;
    if (!type || !name || !email) return res.status(400).json({ message: "type, name, and email required" });

    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    // Authorization: must be buyer or seller
    const user = req.user as any;
    if (txn.buyerId !== user.id && txn.sellerId !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const listing = storage.getListing(txn.listingId);
    const buyer = storage.getUser(txn.buyerId);
    const seller = storage.getUser(txn.sellerId);

    // Generate unique access token
    const accessToken = crypto.randomUUID();
    // Expires in 90 days
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const proAccess = storage.createProfessionalAccess({
      transactionId: txnId,
      listingId: txn.listingId,
      type,
      name,
      company: company || null,
      email,
      phone: phone || null,
      accessToken,
      status: "invited",
      expiresAt,
    });

    // Send invitation email
    const appUrl = process.env.APP_URL || "https://homedirectai.com";
    const portalLink = `${appUrl}/#/pro/${accessToken}`;
    const address = listing ? `${listing.address}, ${listing.city}, ${listing.state}` : "Property";
    const typeLabels: Record<string, string> = {
      inspector: "Home Inspector",
      appraiser: "Appraiser",
      lender: "Lender",
      title: "Title Company",
      photographer: "Photographer",
    };
    const roleLabel = typeLabels[type] || type;

    try {
      await sendEmail(
        email,
        "HomeDirectAI — You\'ve been invited to a transaction",
        `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1a7a4a">You\'ve Been Invited</h2>
          <p>Hi ${name},</p>
          <p>You\'ve been invited to participate in a real estate transaction on <strong>HomeDirectAI</strong>.</p>
          <table style="border-collapse:collapse;margin:16px 0;width:100%">
            <tr><td style="padding:6px 0;color:#666">Property:</td><td style="padding:6px 0"><strong>${address}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#666">Your Role:</td><td style="padding:6px 0"><strong>${roleLabel}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#666">Transaction:</td><td style="padding:6px 0">${buyer?.fullName || "Buyer"} purchasing from ${seller?.fullName || "Seller"}</td></tr>
          </table>
          <p>Access your portal here:</p>
          <a href="${portalLink}" style="background:#1a7a4a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;font-size:16px">
            Open My Portal
          </a>
          <p style="color:#666;font-size:14px">This link is unique to you and this transaction. No login required.</p>
          <p><strong>What you can do:</strong></p>
          <ul>
            <li>Upload documents</li>
            <li>Chat with the buyer and seller</li>
            <li>View property and transaction details</li>
          </ul>
          <p style="color:#999;font-size:12px">This link expires in 90 days.</p>
          <p>— HomeDirectAI</p>
        </div>
        `
      );
    } catch (e) {
      console.error("Failed to send invitation email:", e);
    }

    res.json(proAccess);
  });

  // List professionals for a transaction
  app.get("/api/transactions/:id/professionals", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    const user = req.user as any;
    if (txn.buyerId !== user.id && txn.sellerId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const pros = storage.getProfessionalsByTransaction(txnId);
    res.json(pros);
  });

  // Revoke professional access
  app.delete("/api/transactions/:id/professionals/:proId", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const proId = parseInt(req.params.proId);
    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    const user = req.user as any;
    if (txn.buyerId !== user.id && txn.sellerId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const updated = storage.updateProfessionalAccess(proId, { status: "revoked" });
    res.json(updated);
  });

  // Send message from buyer/seller to professional
  app.post("/api/transactions/:id/pro-message/:proId", requireAuth, (req, res) => {
    const txnId = parseInt(req.params.id);
    const proId = parseInt(req.params.proId);
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: "content required" });

    const txn = storage.getTransaction(txnId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    const user = req.user as any;
    if (txn.buyerId !== user.id && txn.sellerId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const proAccess = storage.getProfessionalAccess(proId);
    if (!proAccess || proAccess.transactionId !== txnId) {
      return res.status(404).json({ message: "Professional not found" });
    }

    const senderType = txn.buyerId === user.id ? "buyer" : "seller";
    const msg = storage.createProfessionalMessage({
      professionalAccessId: proId,
      senderType,
      senderName: user.fullName,
      content,
    });
    res.json(msg);
  });

  // ── Token-based professional portal routes (no auth required) ──

  // Validate token and get portal info
  app.get("/api/pro/:token/info", (req, res) => {
    const { token } = req.params;
    const proAccess = storage.getProfessionalAccessByToken(token);
    if (!proAccess) return res.status(404).json({ message: "Invalid or expired portal link" });
    if (proAccess.status === "revoked") return res.status(403).json({ message: "This portal access has been revoked" });
    if (proAccess.expiresAt && new Date(proAccess.expiresAt) < new Date()) {
      return res.status(403).json({ message: "This portal link has expired" });
    }

    const txn = storage.getTransaction(proAccess.transactionId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    const listing = storage.getListing(txn.listingId);
    const buyer = storage.getUser(txn.buyerId);
    const seller = storage.getUser(txn.sellerId);

    // Mark as active on first access
    if (proAccess.status === "invited") {
      storage.updateProfessionalAccess(proAccess.id, { status: "active" });
    }

    res.json({
      professional: { ...proAccess, status: proAccess.status === "invited" ? "active" : proAccess.status },
      transaction: txn,
      listing,
      buyer: buyer ? { id: buyer.id, fullName: buyer.fullName, phone: buyer.phone } : null,
      seller: seller ? { id: seller.id, fullName: seller.fullName, phone: seller.phone } : null,
    });
  });

  // Get messages for a professional portal
  app.get("/api/pro/:token/messages", (req, res) => {
    const { token } = req.params;
    const proAccess = storage.getProfessionalAccessByToken(token);
    if (!proAccess || proAccess.status === "revoked") return res.status(404).json({ message: "Invalid portal link" });
    const msgs = storage.getProfessionalMessages(proAccess.id);
    res.json(msgs);
  });

  // Send message from professional
  app.post("/api/pro/:token/messages", (req, res) => {
    const { token } = req.params;
    const { content, attachmentUrl, attachmentName } = req.body;
    if (!content) return res.status(400).json({ message: "content required" });

    const proAccess = storage.getProfessionalAccessByToken(token);
    if (!proAccess || proAccess.status === "revoked") return res.status(404).json({ message: "Invalid portal link" });

    const msg = storage.createProfessionalMessage({
      professionalAccessId: proAccess.id,
      senderType: "professional",
      senderName: proAccess.name,
      content,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
    });
    res.json(msg);
  });

  // Upload document via professional portal
  app.post("/api/pro/:token/upload", proUpload.single("file"), (req, res) => {
    const { token } = req.params;
    const proAccess = storage.getProfessionalAccessByToken(token);
    if (!proAccess || proAccess.status === "revoked") return res.status(404).json({ message: "Invalid portal link" });

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { docType, docName } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;

    const doc = storage.createProfessionalDocument({
      professionalAccessId: proAccess.id,
      transactionId: proAccess.transactionId,
      type: docType || "document",
      name: docName || req.file.originalname,
      fileUrl,
      uploadedBy: proAccess.name,
      status: "uploaded",
    });

    res.json({ url: fileUrl, document: doc });
  });

  // List documents for a professional portal
  app.get("/api/pro/:token/documents", (req, res) => {
    const { token } = req.params;
    const proAccess = storage.getProfessionalAccessByToken(token);
    if (!proAccess || proAccess.status === "revoked") return res.status(404).json({ message: "Invalid portal link" });
    const docs = storage.getProfessionalDocuments(proAccess.id);
    res.json(docs);
  });

  // ========== AI AGENTS (role-specific: buyer's agent or seller's agent) ==========
  app.post("/api/agent/chat", requireAuth, async (req, res) => {
    try {
      const { message, history, context } = req.body;
      if (!message) return res.status(400).json({ message: "message required" });

      const user = req.user as any;
      const agentContext: AgentContext = {
        userId: user.id,
        userRole: user.role || "buyer",
        userName: user.fullName?.split(" ")[0] || "there",
        page: context?.page || "/",
        transactionId: context?.transactionId,
        listingId: context?.listingId,
        offerId: context?.offerId,
      };

      // Route to the correct agent based on user role
      let result;
      if (user.role === "seller") {
        console.log(`[Agent] Routing ${user.fullName} to SELLER'S AGENT`);
        result = await runSellerAgent(message, history || [], agentContext);
      } else if (user.role === "buyer" || !user.role) {
        console.log(`[Agent] Routing ${user.fullName} to BUYER'S AGENT`);
        result = await runBuyerAgent(message, history || [], agentContext);
      } else {
        // Admin, chaperone, or unknown role — use the general agent
        console.log(`[Agent] Routing ${user.fullName} (${user.role}) to GENERAL AGENT`);
        result = await runAgent(message, history || [], agentContext);
      }

      res.json({
        response: result.message,
        actions: result.actions,
        pendingActions: result.pendingActions,
        confidence: result.confidence,
        escalate: result.escalate,
        agentType: user.role === "seller" ? "seller_agent" : user.role === "buyer" ? "buyer_agent" : "general_agent",
      });
    } catch (error: any) {
      console.error("Agent chat error:", error);
      res.status(500).json({ message: "Failed to get agent response" });
    }
  });

  // ========== AI AGENT — Confirm pending action ==========
  app.post("/api/agent/confirm-action", requireAuth, async (req, res) => {
    try {
      const { action, confirmed } = req.body;
      if (!action) return res.status(400).json({ message: "action required" });

      if (!confirmed) {
        return res.json({ message: "Action cancelled by user", status: "cancelled" });
      }

      // Execute the confirmed action through the tools system
      const { executeTool } = await import("./ai-tools");
      const user = req.user as any;
      const result = await executeTool(action.tool, action.args, user.id);

      res.json({
        message: "Action executed successfully",
        status: "executed",
        result: JSON.parse(result),
      });
    } catch (error: any) {
      console.error("Action confirmation error:", error);
      res.status(500).json({ message: "Failed to execute action" });
    }
  });

  // ========== AI AGENT — Streaming response ==========
  app.post("/api/agent/stream", requireAuth, async (req, res) => {
    try {
      const { message, history, context } = req.body;
      if (!message) return res.status(400).json({ message: "message required" });

      const user = req.user as any;

      // Build system prompt with RAG context
      const ragContext = getRelevantContext(message, 5);
      const systemPrompt = getBaseKnowledge() + "\n\n## RELEVANT KNOWLEDGE\n" + ragContext;

      const conversationHistory = (history || []).slice(-10).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const stream = await chatStream(
        systemPrompt,
        message,
        conversationHistory,
        1000
      );

      if (!stream) {
        // No streaming provider — fall back to regular response
        const { getAdvisorResponse } = await import("./ai-advisor");
        const response = await getAdvisorResponse(message, history || [], {
          page: context?.page || "/",
          userRole: user?.role,
          userName: user?.fullName?.split(" ")[0],
        });
        res.json({ response, streamed: false });
        return;
      }

      // Set up SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = typeof value === "string" ? value : decoder.decode(value);
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      } catch (streamErr) {
        console.error("Stream read error:", streamErr);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Agent stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to stream response" });
      }
    }
  });

  // ========== RAG — Search knowledge base ==========
  app.post("/api/ai/knowledge-search", async (req, res) => {
    try {
      const { query, topK, category } = req.body;
      if (!query) return res.status(400).json({ message: "query required" });

      const context = getRelevantContext(query, topK || 5, category);
      res.json({ context, query });
    } catch (error: any) {
      console.error("Knowledge search error:", error);
      res.status(500).json({ message: "Knowledge search failed" });
    }
  });

  // ========== AI CONFIDENCE CHECK ==========
  app.post("/api/ai/confidence-check", requireAuth, async (req, res) => {
    try {
      const { message, context } = req.body;
      if (!message) return res.status(400).json({ message: "message required" });

      const systemPrompt = getBaseKnowledge();
      const result = await chatWithConfidence(systemPrompt, message);

      res.json({
        response: result?.content || "I'm not sure about that. Let me connect you with a professional.",
        confidence: result?.confidence || 0,
        escalationNeeded: result?.escalationNeeded ?? true,
      });
    } catch (error: any) {
      console.error("Confidence check error:", error);
      res.status(500).json({ message: "Confidence check failed" });
    }
  });

  // ========== AI TOOLS — List available tools ==========
  app.get("/api/ai/tools", requireAuth, (_req, res) => {
    res.json({
      tools: toolDefinitions.map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
      })),
      count: toolDefinitions.length,
    });
  });

  // ========== AI EVAL SUITE (admin only) ==========
  app.get("/api/admin/eval/cases", requireAuth, requireAdmin, (_req, res) => {
    try {
      const cases = getEvalCases();
      const categories = [...new Set(cases.map((c) => c.category))];
      res.json({
        total: cases.length,
        categories,
        cases: cases.map((c) => ({
          id: c.id,
          category: c.category,
          description: c.description,
          userMessage: c.userMessage,
        })),
      });
    } catch (error: any) {
      console.error("Eval cases error:", error);
      res.status(500).json({ message: "Failed to get eval cases" });
    }
  });

  app.get("/api/admin/eval/cases/:category", requireAuth, requireAdmin, (req, res) => {
    try {
      const cases = getEvalCasesByCategory(req.params.category);
      res.json({ category: req.params.category, total: cases.length, cases });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get eval cases" });
    }
  });

  app.post("/api/admin/eval/run", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { category } = req.body;
      let cases;
      if (category) {
        cases = getEvalCasesByCategory(category);
      }

      console.log(`[Eval] Starting eval suite${category ? ` (category: ${category})` : ""} — ${cases ? cases.length : "all"} cases`);

      const result = await runEvalSuite(cases);

      console.log(`[Eval] Complete — ${result.passed}/${result.totalCases} passed (${(result.score * 100).toFixed(1)}%)`);

      res.json(result);
    } catch (error: any) {
      console.error("Eval run error:", error);
      res.status(500).json({ message: "Eval suite failed" });
    }
  });

  // ========== AI STATUS — Provider info & diagnostics ==========
  app.get("/api/ai/status", requireAuth, requireAdmin, (_req, res) => {
    res.json({
      provider: getActiveProvider(),
      hasProvider: hasLLMProvider(),
      modelSize: process.env.AI_MODEL_SIZE || "small",
      features: {
        chat: true,
        streaming: hasLLMProvider(),
        toolCalling: hasLLMProvider(),
        confidenceScoring: hasLLMProvider(),
        rag: true,
        agentLoop: true,
        evalSuite: true,
      },
      toolCount: toolDefinitions.length,
      evalCaseCount: getEvalCases().length,
    });
  });

  // ========== ENHANCED TRAINING DATA ==========
  app.get("/api/admin/training-data/stats", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { getTrainingDataCount, getTrainingExamples } = await import("./training-data");
      const count = getTrainingDataCount();
      const examples = getTrainingExamples();
      const categories = new Map<string, number>();

      // Count by first user message keyword patterns
      for (const ex of examples) {
        const userMsg = ex.messages[1]?.content?.toLowerCase() || "";
        let cat = "general";
        if (userMsg.includes("florida") || userMsg.includes("law") || userMsg.includes("statute")) cat = "florida_law";
        else if (userMsg.includes("offer") || userMsg.includes("negotiat") || userMsg.includes("counter")) cat = "negotiation";
        else if (userMsg.includes("inspect") || userMsg.includes("repair")) cat = "inspection";
        else if (userMsg.includes("mortgage") || userMsg.includes("loan") || userMsg.includes("financ")) cat = "mortgage";
        else if (userMsg.includes("apprais")) cat = "appraisal";
        else if (userMsg.includes("title") || userMsg.includes("closing") || userMsg.includes("escrow")) cat = "title_closing";
        else if (userMsg.includes("homedirect") || userMsg.includes("platform") || userMsg.includes("chaperone")) cat = "platform";
        else if (userMsg.includes("insurance") || userMsg.includes("flood") || userMsg.includes("wind")) cat = "insurance";
        else if (userMsg.includes("market") || userMsg.includes("price") || userMsg.includes("trend")) cat = "market";
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }

      res.json({
        totalExamples: count,
        byCategory: Object.fromEntries(categories),
        format: "OpenAI chat JSONL",
        readyForFineTuning: count >= 500,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get training data stats" });
    }
  });
}
