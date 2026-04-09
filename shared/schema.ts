import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ───────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("buyer"), // buyer | seller | chaperone | admin
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  location: text("location"),
  isVerified: integer("is_verified", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Listings ────────────────────────────────────────────────────────────
export const listings = sqliteTable("listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  price: real("price").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  sqft: integer("sqft").notNull(),
  lotSize: real("lot_size"),
  yearBuilt: integer("year_built"),
  propertyType: text("property_type").notNull().default("single_family"), // single_family | condo | townhouse | multi_family
  status: text("status").notNull().default("active"), // active | pending | sold | withdrawn
  images: text("images").notNull().default("[]"), // JSON array of image URLs
  features: text("features").notNull().default("[]"), // JSON array of feature strings
  latitude: real("latitude"),
  longitude: real("longitude"),
  mlsNumber: text("mls_number"),
  hoaFee: real("hoa_fee"),
  taxAmount: real("tax_amount"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertListingSchema = createInsertSchema(listings).omit({ id: true, createdAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listings.$inferSelect;

// ── Offers ──────────────────────────────────────────────────────────────
export const offers = sqliteTable("offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | countered | accepted | rejected | withdrawn
  message: text("message"),
  contingencies: text("contingencies").notNull().default("[]"), // JSON array
  closingDate: text("closing_date"),
  counterAmount: real("counter_amount"),
  counterMessage: text("counter_message"),
  // Enhanced offer fields
  financingType: text("financing_type").default("conventional"), // cash | conventional | fha | va
  downPaymentPercent: real("down_payment_percent"),
  earnestMoney: real("earnest_money"),
  closingDays: integer("closing_days").default(30),
  escalationMax: real("escalation_max"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

// ── Walkthroughs ────────────────────────────────────────────────────────
export const walkthroughs = sqliteTable("walkthroughs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  chaperoneId: integer("chaperone_id"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("requested"), // requested | assigned | confirmed | completed | cancelled
  chaperonePayment: real("chaperone_payment").notNull().default(20),
  buyerNotes: text("buyer_notes"),
  chaperoneNotes: text("chaperone_notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertWalkthroughSchema = createInsertSchema(walkthroughs).omit({ id: true, createdAt: true });
export type InsertWalkthrough = z.infer<typeof insertWalkthroughSchema>;
export type Walkthrough = typeof walkthroughs.$inferSelect;

// ── Documents ───────────────────────────────────────────────────────────
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull(),
  offerId: integer("offer_id"),
  type: text("type").notNull(), // disclosure | title | contract | inspection | appraisal | closing
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft | pending_review | signed | completed
  content: text("content"), // JSON content for form-based docs
  signedByBuyer: integer("signed_by_buyer", { mode: "boolean" }).default(false),
  signedBySeller: integer("signed_by_seller", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(""),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ── Messages (AI negotiation chat) ──────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offerId: integer("offer_id").notNull(),
  senderId: integer("sender_id"), // null for AI messages
  senderType: text("sender_type").notNull().default("user"), // user | ai
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ── Transactions ────────────────────────────────────────────────────────
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull(),
  offerId: integer("offer_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  salePrice: real("sale_price").notNull(),
  platformFee: real("platform_fee").notNull(), // 1% of sale price
  status: text("status").notNull().default("in_progress"), // in_progress | closing | completed | cancelled
  closingDate: text("closing_date"),
  escrowStatus: text("escrow_status").default("not_started"), // not_started | opened | funded | disbursed
  titleStatus: text("title_status").default("not_started"), // not_started | ordered | clear | issues
  inspectionStatus: text("inspection_status").default("not_started"),
  appraisalStatus: text("appraisal_status").default("not_started"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// ── Saved Searches ──────────────────────────────────────────────────────
export const savedSearches = sqliteTable("saved_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  filters: text("filters").notNull().default("{}"), // JSON search criteria
  createdAt: text("created_at").notNull().default(""),
});

export const insertSavedSearchSchema = createInsertSchema(savedSearches).omit({ id: true, createdAt: true });
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearches.$inferSelect;

// ── Favorites ───────────────────────────────────────────────────────────
export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  listingId: integer("listing_id").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({ id: true, createdAt: true });
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favorites.$inferSelect;

// ── Chaperone Applications ──────────────────────────────────────────
export const chaperoneApplications = sqliteTable("chaperone_applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | background_check | approved | rejected
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  dateOfBirth: text("date_of_birth").notNull(),
  ssn: text("ssn").notNull(), // bcrypt hash of full SSN
  ssnLast4: text("ssn_last4"), // last 4 digits for display only
  driversLicense: text("drivers_license").notNull(),
  hasRealtorLicense: integer("has_realtor_license", { mode: "boolean" }).default(false),
  realtorLicenseNumber: text("realtor_license_number"),
  hasVehicle: integer("has_vehicle", { mode: "boolean" }).default(false),
  maxTravelMiles: integer("max_travel_miles").default(15),
  availability: text("availability").notNull().default("[]"), // JSON: ["weekdays","weekends","evenings"]
  backgroundCheckStatus: text("background_check_status").default("not_started"), // not_started | processing | passed | failed
  backgroundCheckDate: text("background_check_date"),
  bankAccountName: text("bank_account_name"),
  bankRoutingNumber: text("bank_routing_number"),
  bankAccountNumber: text("bank_account_number"), // bcrypt hash of full account number
  accountNumberLast4: text("account_number_last4"), // last 4 digits for display
  bankAccountType: text("bank_account_type").default("checking"), // checking | savings
  agreedToTerms: integer("agreed_to_terms", { mode: "boolean" }).default(false),
  agreedToTermsDate: text("agreed_to_terms_date"),
  completedTraining: integer("completed_training", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(""),
});

export const insertChaperoneApplicationSchema = createInsertSchema(chaperoneApplications).omit({ id: true, createdAt: true });
export type InsertChaperoneApplication = z.infer<typeof insertChaperoneApplicationSchema>;
export type ChaperoneApplication = typeof chaperoneApplications.$inferSelect;

// ── Chaperone Payouts ──────────────────────────────────────────────
export const chaperonePayouts = sqliteTable("chaperone_payouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chaperoneId: integer("chaperone_id").notNull(),
  walkthroughId: integer("walkthrough_id"), // null for manual payouts
  amount: real("amount").notNull(),
  type: text("type").notNull().default("earning"), // earning | payout | bonus
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  description: text("description").notNull(),
  bankLast4: text("bank_last4"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertChaperonePayoutSchema = createInsertSchema(chaperonePayouts).omit({ id: true, createdAt: true });
export type InsertChaperonePayout = z.infer<typeof insertChaperonePayoutSchema>;
export type ChaperonePayout = typeof chaperonePayouts.$inferSelect;

// ── Payments ────────────────────────────────────────────────────────────
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  amount: text("amount").notNull(), // e.g. "20.00"
  type: text("type").notNull(), // "walkthrough_fee", "platform_fee", "chaperone_payout"
  status: text("status").notNull().default("pending"), // pending, completed, failed
  stripePaymentId: text("stripe_payment_id"),
  relatedId: integer("related_id"), // walkthrough_id, transaction_id, or payout_id
  createdAt: text("created_at").default(""),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// ── Notifications ────────────────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // "offer_received", "offer_accepted", "walkthrough_scheduled", etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read").default(0),
  relatedUrl: text("related_url"), // hash route to navigate to
  createdAt: text("created_at").default(""),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ── Transaction Checklist ────────────────────────────────────────────────
export const transactionChecklist = sqliteTable("transaction_checklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  role: text("role").notNull(), // "buyer" or "seller"
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // "inspection", "lender", "escrow", "title", "appraisal", "general"
  status: text("status").notNull().default("pending"), // pending, in_progress, completed
  dueDate: text("due_date"),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").default(""),
});

export const insertTransactionChecklistSchema = createInsertSchema(transactionChecklist).omit({ id: true, createdAt: true });
export type InsertTransactionChecklist = z.infer<typeof insertTransactionChecklistSchema>;
export type TransactionChecklist = typeof transactionChecklist.$inferSelect;

// ── Portal Messages ──────────────────────────────────────────────────────
export const portalMessages = sqliteTable("portal_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  portal: text("portal").notNull(), // "inspection", "escrow", "lender", "appraisal", "title", "general"
  userId: integer("user_id").notNull(),
  role: text("role").notNull(), // "user" or "ai"
  content: text("content").notNull(),
  createdAt: text("created_at").default(""),
});

export const insertPortalMessageSchema = createInsertSchema(portalMessages).omit({ id: true, createdAt: true });
export type InsertPortalMessage = z.infer<typeof insertPortalMessageSchema>;
export type PortalMessage = typeof portalMessages.$inferSelect;

// ── Portal Documents ─────────────────────────────────────────────────────
export const portalDocuments = sqliteTable("portal_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  portal: text("portal").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "inspection_report", "id_document", "insurance", "pay_stub", etc.
  fileUrl: text("file_url"),
  status: text("status").notNull().default("requested"), // requested, uploaded, approved, rejected
  uploadedBy: integer("uploaded_by"),
  createdAt: text("created_at").default(""),
});

export const insertPortalDocumentSchema = createInsertSchema(portalDocuments).omit({ id: true, createdAt: true });
export type InsertPortalDocument = z.infer<typeof insertPortalDocumentSchema>;
export type PortalDocument = typeof portalDocuments.$inferSelect;

// ── Repair Requests ──────────────────────────────────────────────────────
export const repairRequests = sqliteTable("repair_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | responded | accepted | countered
  buyerItems: text("buyer_items").notNull(), // JSON array of { finding, type, estimatedCost }
  buyerNotes: text("buyer_notes"),
  sellerResponse: text("seller_response"), // JSON array of { finding, decision, counterAmount }
  sellerNotes: text("seller_notes"),
  agreedCredits: text("agreed_credits"),
  createdAt: text("created_at").default(""),
});

export const insertRepairRequestSchema = createInsertSchema(repairRequests).omit({ id: true, createdAt: true });
export type InsertRepairRequest = z.infer<typeof insertRepairRequestSchema>;
export type RepairRequest = typeof repairRequests.$inferSelect;

// ── Professional Access ──────────────────────────────────────────────────────
export const professionalAccess = sqliteTable("professional_access", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  listingId: integer("listing_id"),
  type: text("type").notNull(), // "inspector", "appraiser", "lender", "title", "photographer"
  name: text("name").notNull(),
  company: text("company"),
  email: text("email").notNull(),
  phone: text("phone"),
  accessToken: text("access_token").notNull(),
  status: text("status").notNull().default("invited"), // invited, active, completed, revoked
  createdAt: text("created_at").default(""),
  expiresAt: text("expires_at"),
});

export const insertProfessionalAccessSchema = createInsertSchema(professionalAccess).omit({ id: true, createdAt: true });
export type InsertProfessionalAccess = z.infer<typeof insertProfessionalAccessSchema>;
export type ProfessionalAccess = typeof professionalAccess.$inferSelect;

// ── Professional Messages ────────────────────────────────────────────────────
export const professionalMessages = sqliteTable("professional_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  professionalAccessId: integer("professional_access_id").notNull(),
  senderType: text("sender_type").notNull(), // "professional", "buyer", "seller", "system"
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  createdAt: text("created_at").default(""),
});

export const insertProfessionalMessageSchema = createInsertSchema(professionalMessages).omit({ id: true, createdAt: true });
export type InsertProfessionalMessage = z.infer<typeof insertProfessionalMessageSchema>;
export type ProfessionalMessage = typeof professionalMessages.$inferSelect;

// ── Professional Documents ───────────────────────────────────────────────────
export const professionalDocuments = sqliteTable("professional_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  professionalAccessId: integer("professional_access_id").notNull(),
  transactionId: integer("transaction_id").notNull(),
  type: text("type").notNull(), // "inspection_report", "appraisal_report", "loan_estimate", "closing_disclosure", "title_commitment", "photos"
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  status: text("status").notNull().default("uploaded"), // uploaded, reviewed, approved
  notes: text("notes"),
  createdAt: text("created_at").default(""),
});

export const insertProfessionalDocumentSchema = createInsertSchema(professionalDocuments).omit({ id: true, createdAt: true });
export type InsertProfessionalDocument = z.infer<typeof insertProfessionalDocumentSchema>;
export type ProfessionalDocument = typeof professionalDocuments.$inferSelect;

// ── Questionnaire Responses (buyer/seller form data for document filling) ────
export const questionnaireResponses = sqliteTable("questionnaire_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(), // "buyer" | "seller"
  responses: text("responses").notNull().default("{}"), // JSON object of key-value pairs
  completedSections: text("completed_sections").notNull().default("[]"), // JSON array of completed category names
  createdAt: text("created_at").default(""),
  updatedAt: text("updated_at").default(""),
});

export const insertQuestionnaireResponseSchema = createInsertSchema(questionnaireResponses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuestionnaireResponse = z.infer<typeof insertQuestionnaireResponseSchema>;
export type QuestionnaireResponse = typeof questionnaireResponses.$inferSelect;
