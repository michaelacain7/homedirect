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
