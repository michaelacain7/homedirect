import { eq, like, and, gte, lte, desc, asc, or } from "drizzle-orm";
import {
  users, listings, offers, walkthroughs, documents, messages, transactions, savedSearches, favorites,
  chaperoneApplications, chaperonePayouts, payments, notifications,
  transactionChecklist, portalMessages, portalDocuments, repairRequests,
  professionalAccess, professionalMessages, professionalDocuments,
  type User, type InsertUser,
  type Listing, type InsertListing,
  type Offer, type InsertOffer,
  type Walkthrough, type InsertWalkthrough,
  type Document, type InsertDocument,
  type Message, type InsertMessage,
  type Transaction, type InsertTransaction,
  type SavedSearch, type InsertSavedSearch,
  type Favorite, type InsertFavorite,
  type ChaperoneApplication, type InsertChaperoneApplication,
  type ChaperonePayout, type InsertChaperonePayout,
  type Payment, type InsertPayment,
  type Notification, type InsertNotification,
  type TransactionChecklist, type InsertTransactionChecklist,
  type PortalMessage, type InsertPortalMessage,
  type PortalDocument, type InsertPortalDocument,
  type RepairRequest, type InsertRepairRequest,
  type ProfessionalAccess, type InsertProfessionalAccess,
  type ProfessionalMessage, type InsertProfessionalMessage,
  type ProfessionalDocument, type InsertProfessionalDocument,
} from "@shared/schema";

// ── Database Connection (PostgreSQL in production, SQLite for local dev) ──────
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";

let db: any;
let sqlite: any = null;
let rawPool: any = null;

if (process.env.DATABASE_URL) {
  // PostgreSQL (production / Railway)
  // Dynamic import at startup handled by init function below
  console.log("[DB] PostgreSQL mode (DATABASE_URL detected)");
} else {
  // SQLite (local development)
  sqlite = new Database("data.db");
  sqlite.pragma("journal_mode = WAL");
  db = drizzleSqlite(sqlite);
  console.log("[DB] Using SQLite (local development — set DATABASE_URL for PostgreSQL)");
}

// Async init for PostgreSQL (called at startup)
async function initPostgres() {
  if (!process.env.DATABASE_URL) return;
  const pg = await import("pg");
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  rawPool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(rawPool);
  console.log("[DB] Connected to PostgreSQL");
}

// Auto-create tables if they don't exist (needed for fresh deploys like Railway)
// For PostgreSQL: uses Drizzle push or raw SQL. For SQLite: uses raw SQL.
// Raw SQL for table creation (SQLite syntax — converted to PG at runtime)
const tableSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'buyer',
    avatar_url TEXT,
    bio TEXT,
    location TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT NOT NULL,
    price REAL NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms REAL NOT NULL,
    sqft INTEGER NOT NULL,
    lot_size REAL,
    year_built INTEGER,
    property_type TEXT NOT NULL DEFAULT 'single_family',
    status TEXT NOT NULL DEFAULT 'active',
    images TEXT NOT NULL DEFAULT '[]',
    features TEXT NOT NULL DEFAULT '[]',
    latitude REAL,
    longitude REAL,
    mls_number TEXT,
    hoa_fee REAL,
    tax_amount REAL,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    message TEXT,
    contingencies TEXT NOT NULL DEFAULT '[]',
    closing_date TEXT,
    counter_amount REAL,
    counter_message TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS walkthroughs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    chaperone_id INTEGER,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    chaperone_payment REAL NOT NULL DEFAULT 20,
    buyer_notes TEXT,
    chaperone_notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    offer_id INTEGER,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    content TEXT,
    signed_by_buyer INTEGER DEFAULT 0,
    signed_by_seller INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id INTEGER NOT NULL,
    sender_id INTEGER,
    sender_type TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    offer_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    sale_price REAL NOT NULL,
    platform_fee REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    closing_date TEXT,
    escrow_status TEXT DEFAULT 'not_started',
    title_status TEXT DEFAULT 'not_started',
    inspection_status TEXT DEFAULT 'not_started',
    appraisal_status TEXT DEFAULT 'not_started',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filters TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS chaperone_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    date_of_birth TEXT NOT NULL,
    ssn TEXT NOT NULL,
    ssn_last4 TEXT,
    drivers_license TEXT NOT NULL,
    has_realtor_license INTEGER DEFAULT 0,
    realtor_license_number TEXT,
    has_vehicle INTEGER DEFAULT 0,
    max_travel_miles INTEGER DEFAULT 15,
    availability TEXT NOT NULL DEFAULT '[]',
    background_check_status TEXT DEFAULT 'not_started',
    background_check_date TEXT,
    bank_account_name TEXT,
    bank_routing_number TEXT,
    bank_account_number TEXT,
    account_number_last4 TEXT,
    bank_account_type TEXT DEFAULT 'checking',
    agreed_to_terms INTEGER DEFAULT 0,
    agreed_to_terms_date TEXT,
    completed_training INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS chaperone_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chaperone_id INTEGER NOT NULL,
    walkthrough_id INTEGER,
    amount REAL NOT NULL,
    type TEXT NOT NULL DEFAULT 'earning',
    status TEXT NOT NULL DEFAULT 'pending',
    description TEXT NOT NULL,
    bank_last4 TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_payment_id TEXT,
    related_id INTEGER,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    related_url TEXT,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS transaction_checklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    due_date TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS portal_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    portal TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS portal_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    portal TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    file_url TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    uploaded_by INTEGER,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS repair_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    buyer_items TEXT NOT NULL,
    buyer_notes TEXT,
    seller_response TEXT,
    seller_notes TEXT,
    agreed_credits TEXT,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS professional_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    listing_id INTEGER,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    access_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'invited',
    created_at TEXT DEFAULT '',
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS professional_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professional_access_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS professional_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professional_access_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    notes TEXT,
    created_at TEXT DEFAULT ''
  );
`;

async function initializeTables() {
  // Initialize PostgreSQL connection if needed
  await initPostgres();

  if (process.env.DATABASE_URL && rawPool) {
    const client = await rawPool.connect();
    try {
      // Convert SQLite SQL to PostgreSQL-compatible
      const pgSQL = tableSQL
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY")
        .replace(/REAL /g, "DOUBLE PRECISION ");
      // Execute each CREATE TABLE separately for PG
      const statements = pgSQL.split(";").filter(s => s.trim().length > 10);
      for (const stmt of statements) {
        try { await client.query(stmt + ";"); } catch (e: any) {
          if (!e.message?.includes("already exists")) console.error("[DB] PG table error:", e.message);
        }
      }
      // Add migration columns for PG
      const alters = [
        "ALTER TABLE offers ADD COLUMN IF NOT EXISTS financing_type TEXT DEFAULT 'conventional'",
        "ALTER TABLE offers ADD COLUMN IF NOT EXISTS down_payment_percent DOUBLE PRECISION",
        "ALTER TABLE offers ADD COLUMN IF NOT EXISTS earnest_money DOUBLE PRECISION",
        "ALTER TABLE offers ADD COLUMN IF NOT EXISTS closing_days INTEGER DEFAULT 30",
        "ALTER TABLE offers ADD COLUMN IF NOT EXISTS escalation_max DOUBLE PRECISION",
      ];
      for (const alt of alters) { try { await client.query(alt); } catch {} }
      console.log("[DB] PostgreSQL tables initialized");
    } catch (err) {
      console.error("[DB] PostgreSQL table init error:", err);
    } finally {
      client.release();
    }
  } else if (sqlite) {
    // SQLite — execute the same SQL directly (it uses SQLite syntax already)
    sqlite.exec(tableSQL);
    // Add migration columns for existing SQLite DBs
    try { sqlite.exec(`ALTER TABLE offers ADD COLUMN financing_type TEXT DEFAULT 'conventional'`); } catch {}
    try { sqlite.exec(`ALTER TABLE offers ADD COLUMN down_payment_percent REAL`); } catch {}
    try { sqlite.exec(`ALTER TABLE offers ADD COLUMN earnest_money REAL`); } catch {}
    try { sqlite.exec(`ALTER TABLE offers ADD COLUMN closing_days INTEGER DEFAULT 30`); } catch {}
    try { sqlite.exec(`ALTER TABLE offers ADD COLUMN escalation_max REAL`); } catch {}
    console.log("[DB] SQLite tables initialized");
  }
}

// Run table initialization
initializeTables().catch(console.error);

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  createUser(user: InsertUser): User;
  updateUser(id: number, data: Partial<InsertUser>): User | undefined;

  // Listings
  getListing(id: number): Listing | undefined;
  getListings(filters?: {
    city?: string;
    state?: string;
    minPrice?: number;
    maxPrice?: number;
    minBeds?: number;
    maxBeds?: number;
    minBaths?: number;
    maxBaths?: number;
    minSqft?: number;
    maxSqft?: number;
    propertyType?: string;
    status?: string;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): { listings: Listing[]; total: number };
  getListingsBySeller(sellerId: number): Listing[];
  createListing(listing: InsertListing): Listing;
  updateListing(id: number, data: Partial<InsertListing>): Listing | undefined;
  deleteListing(id: number): void;
  getFeaturedListings(): Listing[];

  // Offers
  getOffer(id: number): Offer | undefined;
  getOffersByListing(listingId: number): Offer[];
  getOffersByBuyer(buyerId: number): Offer[];
  getOffersBySeller(userId: number): Offer[];
  createOffer(offer: InsertOffer): Offer;
  updateOffer(id: number, data: Partial<InsertOffer>): Offer | undefined;

  // Walkthroughs
  getWalkthrough(id: number): Walkthrough | undefined;
  getWalkthroughsByListing(listingId: number): Walkthrough[];
  getWalkthroughsByBuyer(buyerId: number): Walkthrough[];
  getWalkthroughsByChaperone(chaperoneId: number): Walkthrough[];
  getAvailableWalkthroughs(): Walkthrough[];
  createWalkthrough(walkthrough: InsertWalkthrough): Walkthrough;
  updateWalkthrough(id: number, data: Partial<InsertWalkthrough>): Walkthrough | undefined;

  // Documents
  getDocument(id: number): Document | undefined;
  getDocumentsByListing(listingId: number): Document[];
  getDocumentsByOffer(offerId: number): Document[];
  createDocument(doc: InsertDocument): Document;
  updateDocument(id: number, data: Partial<InsertDocument>): Document | undefined;

  // Messages
  getMessagesByOffer(offerId: number): Message[];
  createMessage(msg: InsertMessage): Message;

  // Transactions
  getTransaction(id: number): Transaction | undefined;
  getTransactionsByBuyer(buyerId: number): Transaction[];
  getTransactionsBySeller(sellerId: number): Transaction[];
  createTransaction(txn: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;

  // Saved Searches
  getSavedSearches(userId: number): SavedSearch[];
  createSavedSearch(search: InsertSavedSearch): SavedSearch;
  deleteSavedSearch(id: number): void;

  // Favorites
  getFavorites(userId: number): Favorite[];
  addFavorite(fav: InsertFavorite): Favorite;
  removeFavorite(userId: number, listingId: number): void;
  isFavorite(userId: number, listingId: number): boolean;

  // Chaperone Applications
  getChaperoneApplication(id: number): ChaperoneApplication | undefined;
  getChaperoneApplicationByUser(userId: number): ChaperoneApplication | undefined;
  createChaperoneApplication(app: InsertChaperoneApplication): ChaperoneApplication;
  updateChaperoneApplication(id: number, data: Partial<InsertChaperoneApplication>): ChaperoneApplication | undefined;
  getApprovedChaperones(): ChaperoneApplication[];

  // Chaperone Payouts
  getChaperonePayouts(chaperoneId: number): ChaperonePayout[];
  createChaperonePayout(payout: InsertChaperonePayout): ChaperonePayout;
  updateChaperonePayout(id: number, data: Partial<InsertChaperonePayout>): ChaperonePayout | undefined;
  getChaperoneEarnings(chaperoneId: number): { total: number; pending: number; paid: number };

  // Payments
  createPayment(payment: InsertPayment): Payment;
  getPaymentsByUser(userId: number): Payment[];
  getAllPayments(): Payment[];
  updatePayment(id: number, data: Partial<InsertPayment>): Payment | undefined;

  // Notifications
  createNotification(notification: InsertNotification): Notification;
  getNotificationsByUser(userId: number): Notification[];
  markNotificationRead(id: number): Notification | undefined;
  getUnreadCount(userId: number): number;

  // Transaction Checklist
  getChecklist(transactionId: number): TransactionChecklist[];
  getChecklistByRole(transactionId: number, role: string): TransactionChecklist[];
  createChecklistItem(item: InsertTransactionChecklist): TransactionChecklist;
  updateChecklistItem(id: number, data: Partial<InsertTransactionChecklist>): TransactionChecklist | undefined;

  // Portal Messages
  getPortalMessages(transactionId: number, portal: string): PortalMessage[];
  createPortalMessage(msg: InsertPortalMessage): PortalMessage;

  // Portal Documents
  getPortalDocuments(transactionId: number, portal?: string): PortalDocument[];
  createPortalDocument(doc: InsertPortalDocument): PortalDocument;
  updatePortalDocument(id: number, data: Partial<InsertPortalDocument>): PortalDocument | undefined;

  // Repair Requests
  getRepairRequestByTransaction(transactionId: number): RepairRequest | undefined;
  createRepairRequest(req: InsertRepairRequest): RepairRequest;
  updateRepairRequest(id: number, data: Partial<InsertRepairRequest>): RepairRequest | undefined;

  // Admin
  getAllUsers(): User[];
  getAllListings(): Listing[];
  getAllTransactions(): Transaction[];
  getPlatformStats(): { totalUsers: number; totalListings: number; activeTransactions: number; totalRevenue: number; totalPayouts: number };

  // Professional Access
  getProfessionalAccess(id: number): ProfessionalAccess | undefined;
  getProfessionalAccessByToken(token: string): ProfessionalAccess | undefined;
  getProfessionalsByTransaction(transactionId: number): ProfessionalAccess[];
  createProfessionalAccess(data: InsertProfessionalAccess): ProfessionalAccess;
  updateProfessionalAccess(id: number, data: Partial<InsertProfessionalAccess>): ProfessionalAccess | undefined;
  deleteProfessionalAccess(id: number): void;

  // Professional Messages
  getProfessionalMessages(professionalAccessId: number): ProfessionalMessage[];
  createProfessionalMessage(msg: InsertProfessionalMessage): ProfessionalMessage;

  // Professional Documents
  getProfessionalDocuments(professionalAccessId: number): ProfessionalDocument[];
  createProfessionalDocument(doc: InsertProfessionalDocument): ProfessionalDocument;
  updateProfessionalDocument(id: number, data: Partial<InsertProfessionalDocument>): ProfessionalDocument | undefined;
}

export class DatabaseStorage implements IStorage {
  // ── Users ──
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  createUser(user: InsertUser): User {
    return db.insert(users).values({ ...user, createdAt: new Date().toISOString() }).returning().get();
  }

  updateUser(id: number, data: Partial<InsertUser>): User | undefined {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }

  // ── Listings ──
  getListing(id: number): Listing | undefined {
    return db.select().from(listings).where(eq(listings.id, id)).get();
  }

  getListings(filters?: {
    city?: string; state?: string; minPrice?: number; maxPrice?: number;
    minBeds?: number; maxBeds?: number; minBaths?: number; maxBaths?: number;
    minSqft?: number; maxSqft?: number; propertyType?: string; status?: string; search?: string;
    sort?: string; page?: number; limit?: number;
  }): { listings: Listing[]; total: number } {
    const conditions: any[] = [];
    if (filters) {
      if (filters.status) conditions.push(eq(listings.status, filters.status));
      else conditions.push(eq(listings.status, "active"));
      if (filters.city) conditions.push(like(listings.city, `%${filters.city}%`));
      if (filters.state) conditions.push(eq(listings.state, filters.state));
      if (filters.minPrice) conditions.push(gte(listings.price, filters.minPrice));
      if (filters.maxPrice) conditions.push(lte(listings.price, filters.maxPrice));
      if (filters.minBeds) conditions.push(gte(listings.bedrooms, filters.minBeds));
      if (filters.maxBeds) conditions.push(lte(listings.bedrooms, filters.maxBeds));
      if (filters.minBaths) conditions.push(gte(listings.bathrooms, filters.minBaths));
      if (filters.maxBaths) conditions.push(lte(listings.bathrooms, filters.maxBaths));
      if (filters.minSqft) conditions.push(gte(listings.sqft, filters.minSqft));
      if (filters.maxSqft) conditions.push(lte(listings.sqft, filters.maxSqft));
      if (filters.propertyType) conditions.push(eq(listings.propertyType, filters.propertyType));
      if (filters.search) conditions.push(or(
        like(listings.address, `%${filters.search}%`),
        like(listings.city, `%${filters.search}%`),
        like(listings.title, `%${filters.search}%`)
      ));
    } else {
      conditions.push(eq(listings.status, "active"));
    }
    const whereClause = and(...conditions);

    // Count total
    const countRow = db.select({ count: listings.id }).from(listings).where(whereClause).all();
    const total = countRow.length;

    // Sort
    const sort = filters?.sort || "newest";
    let orderClause: any;
    if (sort === "price_asc") orderClause = asc(listings.price);
    else if (sort === "price_desc") orderClause = desc(listings.price);
    else if (sort === "oldest") orderClause = asc(listings.createdAt);
    else orderClause = desc(listings.createdAt); // newest

    // Pagination
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const result = db.select().from(listings).where(whereClause).orderBy(orderClause).limit(limit).offset(offset).all();
    return { listings: result, total };
  }

  getListingsBySeller(sellerId: number): Listing[] {
    return db.select().from(listings).where(eq(listings.sellerId, sellerId)).orderBy(desc(listings.createdAt)).all();
  }

  createListing(listing: InsertListing): Listing {
    return db.insert(listings).values({ ...listing, createdAt: new Date().toISOString() }).returning().get();
  }

  updateListing(id: number, data: Partial<InsertListing>): Listing | undefined {
    return db.update(listings).set(data).where(eq(listings.id, id)).returning().get();
  }

  deleteListing(id: number): void {
    db.delete(listings).where(eq(listings.id, id)).run();
  }

  getFeaturedListings(): Listing[] {
    return db.select().from(listings).where(eq(listings.status, "active")).orderBy(desc(listings.createdAt)).limit(6).all();
  }

  // ── Offers ──
  getOffer(id: number): Offer | undefined {
    return db.select().from(offers).where(eq(offers.id, id)).get();
  }

  getOffersByListing(listingId: number): Offer[] {
    return db.select().from(offers).where(eq(offers.listingId, listingId)).orderBy(desc(offers.createdAt)).all();
  }

  getOffersByBuyer(buyerId: number): Offer[] {
    return db.select().from(offers).where(eq(offers.buyerId, buyerId)).orderBy(desc(offers.createdAt)).all();
  }

  getOffersBySeller(userId: number): Offer[] {
    const result = sqlite.prepare(`
      SELECT offers.* FROM offers
      JOIN listings ON offers.listing_id = listings.id
      WHERE listings.seller_id = ?
      ORDER BY offers.created_at DESC
    `).all(userId);
    // Map snake_case columns to camelCase to match the Drizzle schema output
    return (result as any[]).map((r: any) => ({
      id: r.id,
      listingId: r.listing_id,
      buyerId: r.buyer_id,
      amount: r.amount,
      status: r.status,
      message: r.message,
      contingencies: r.contingencies,
      closingDate: r.closing_date,
      counterAmount: r.counter_amount,
      counterMessage: r.counter_message,
      createdAt: r.created_at,
    }));
  }

  createOffer(offer: InsertOffer): Offer {
    return db.insert(offers).values({ ...offer, createdAt: new Date().toISOString() }).returning().get();
  }

  updateOffer(id: number, data: Partial<InsertOffer>): Offer | undefined {
    return db.update(offers).set(data).where(eq(offers.id, id)).returning().get();
  }

  // ── Walkthroughs ──
  getWalkthrough(id: number): Walkthrough | undefined {
    return db.select().from(walkthroughs).where(eq(walkthroughs.id, id)).get();
  }

  getWalkthroughsByListing(listingId: number): Walkthrough[] {
    return db.select().from(walkthroughs).where(eq(walkthroughs.listingId, listingId)).all();
  }

  getWalkthroughsByBuyer(buyerId: number): Walkthrough[] {
    return db.select().from(walkthroughs).where(eq(walkthroughs.buyerId, buyerId)).all();
  }

  getWalkthroughsByChaperone(chaperoneId: number): Walkthrough[] {
    return db.select().from(walkthroughs).where(eq(walkthroughs.chaperoneId, chaperoneId)).all();
  }

  getAvailableWalkthroughs(): Walkthrough[] {
    return db.select().from(walkthroughs).where(eq(walkthroughs.status, "requested")).all();
  }

  createWalkthrough(walkthrough: InsertWalkthrough): Walkthrough {
    return db.insert(walkthroughs).values({ ...walkthrough, createdAt: new Date().toISOString() }).returning().get();
  }

  updateWalkthrough(id: number, data: Partial<InsertWalkthrough>): Walkthrough | undefined {
    return db.update(walkthroughs).set(data).where(eq(walkthroughs.id, id)).returning().get();
  }

  // ── Documents ──
  getDocument(id: number): Document | undefined {
    return db.select().from(documents).where(eq(documents.id, id)).get();
  }

  getDocumentsByListing(listingId: number): Document[] {
    return db.select().from(documents).where(eq(documents.listingId, listingId)).all();
  }

  getDocumentsByOffer(offerId: number): Document[] {
    return db.select().from(documents).where(eq(documents.offerId, offerId)).all();
  }

  createDocument(doc: InsertDocument): Document {
    return db.insert(documents).values({ ...doc, createdAt: new Date().toISOString() }).returning().get();
  }

  updateDocument(id: number, data: Partial<InsertDocument>): Document | undefined {
    return db.update(documents).set(data).where(eq(documents.id, id)).returning().get();
  }

  // ── Messages ──
  getMessagesByOffer(offerId: number): Message[] {
    return db.select().from(messages).where(eq(messages.offerId, offerId)).all();
  }

  createMessage(msg: InsertMessage): Message {
    return db.insert(messages).values({ ...msg, createdAt: new Date().toISOString() }).returning().get();
  }

  // ── Transactions ──
  getTransaction(id: number): Transaction | undefined {
    return db.select().from(transactions).where(eq(transactions.id, id)).get();
  }

  getTransactionsByBuyer(buyerId: number): Transaction[] {
    return db.select().from(transactions).where(eq(transactions.buyerId, buyerId)).all();
  }

  getTransactionsBySeller(sellerId: number): Transaction[] {
    return db.select().from(transactions).where(eq(transactions.sellerId, sellerId)).all();
  }

  createTransaction(txn: InsertTransaction): Transaction {
    return db.insert(transactions).values({ ...txn, createdAt: new Date().toISOString() }).returning().get();
  }

  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined {
    return db.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
  }

  // ── Saved Searches ──
  getSavedSearches(userId: number): SavedSearch[] {
    return db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).all();
  }

  createSavedSearch(search: InsertSavedSearch): SavedSearch {
    return db.insert(savedSearches).values({ ...search, createdAt: new Date().toISOString() }).returning().get();
  }

  deleteSavedSearch(id: number): void {
    db.delete(savedSearches).where(eq(savedSearches.id, id)).run();
  }

  // ── Favorites ──
  getFavorites(userId: number): Favorite[] {
    return db.select().from(favorites).where(eq(favorites.userId, userId)).all();
  }

  addFavorite(fav: InsertFavorite): Favorite {
    return db.insert(favorites).values({ ...fav, createdAt: new Date().toISOString() }).returning().get();
  }

  removeFavorite(userId: number, listingId: number): void {
    db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId))).run();
  }

  isFavorite(userId: number, listingId: number): boolean {
    const result = db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId))).get();
    return !!result;
  }

  // ── Chaperone Applications ──
  getChaperoneApplication(id: number): ChaperoneApplication | undefined {
    return db.select().from(chaperoneApplications).where(eq(chaperoneApplications.id, id)).get();
  }

  getChaperoneApplicationByUser(userId: number): ChaperoneApplication | undefined {
    return db.select().from(chaperoneApplications).where(eq(chaperoneApplications.userId, userId)).get();
  }

  createChaperoneApplication(app: InsertChaperoneApplication): ChaperoneApplication {
    return db.insert(chaperoneApplications).values({ ...app, createdAt: new Date().toISOString() }).returning().get();
  }

  updateChaperoneApplication(id: number, data: Partial<InsertChaperoneApplication>): ChaperoneApplication | undefined {
    return db.update(chaperoneApplications).set(data).where(eq(chaperoneApplications.id, id)).returning().get();
  }

  getApprovedChaperones(): ChaperoneApplication[] {
    return db.select().from(chaperoneApplications).where(eq(chaperoneApplications.status, "approved")).all();
  }

  // ── Chaperone Payouts ──
  getChaperonePayouts(chaperoneId: number): ChaperonePayout[] {
    return db.select().from(chaperonePayouts).where(eq(chaperonePayouts.chaperoneId, chaperoneId)).orderBy(desc(chaperonePayouts.createdAt)).all();
  }

  createChaperonePayout(payout: InsertChaperonePayout): ChaperonePayout {
    return db.insert(chaperonePayouts).values({ ...payout, createdAt: new Date().toISOString() }).returning().get();
  }

  updateChaperonePayout(id: number, data: Partial<InsertChaperonePayout>): ChaperonePayout | undefined {
    return db.update(chaperonePayouts).set(data).where(eq(chaperonePayouts.id, id)).returning().get();
  }

  getChaperoneEarnings(chaperoneId: number): { total: number; pending: number; paid: number } {
    const payouts = db.select().from(chaperonePayouts).where(eq(chaperonePayouts.chaperoneId, chaperoneId)).all();
    let total = 0;
    let pending = 0;
    let paid = 0;
    for (const p of payouts) {
      if (p.type === "earning") {
        total += p.amount;
        if (p.status === "completed") paid += p.amount;
        else if (p.status === "pending" || p.status === "processing") pending += p.amount;
      } else if (p.type === "payout") {
        // negative: withdrawal reduces paid
        paid += p.amount; // amount is negative for withdrawals
      }
    }
    return { total, pending, paid };
  }

  // ── Payments ──
  createPayment(payment: InsertPayment): Payment {
    return db.insert(payments).values({ ...payment, createdAt: new Date().toISOString() }).returning().get();
  }

  getPaymentsByUser(userId: number): Payment[] {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).all();
  }

  getAllPayments(): Payment[] {
    return db.select().from(payments).orderBy(desc(payments.createdAt)).all();
  }

  updatePayment(id: number, data: Partial<InsertPayment>): Payment | undefined {
    return db.update(payments).set(data).where(eq(payments.id, id)).returning().get();
  }

  // ── Notifications ──
  createNotification(notification: InsertNotification): Notification {
    return db.insert(notifications).values({ ...notification, createdAt: new Date().toISOString() }).returning().get();
  }

  getNotificationsByUser(userId: number): Notification[] {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50).all();
  }

  markNotificationRead(id: number): Notification | undefined {
    return db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id)).returning().get();
  }

  getUnreadCount(userId: number): number {
    const rows = db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, 0))).all();
    return rows.length;
  }

  // ── Transaction Checklist ──
  getChecklist(transactionId: number): TransactionChecklist[] {
    return db.select().from(transactionChecklist).where(eq(transactionChecklist.transactionId, transactionId)).orderBy(asc(transactionChecklist.order)).all();
  }

  getChecklistByRole(transactionId: number, role: string): TransactionChecklist[] {
    return db.select().from(transactionChecklist).where(and(eq(transactionChecklist.transactionId, transactionId), eq(transactionChecklist.role, role))).orderBy(asc(transactionChecklist.order)).all();
  }

  createChecklistItem(item: InsertTransactionChecklist): TransactionChecklist {
    return db.insert(transactionChecklist).values({ ...item, createdAt: new Date().toISOString() }).returning().get();
  }

  updateChecklistItem(id: number, data: Partial<InsertTransactionChecklist>): TransactionChecklist | undefined {
    return db.update(transactionChecklist).set(data).where(eq(transactionChecklist.id, id)).returning().get();
  }

  // ── Portal Messages ──
  getPortalMessages(transactionId: number, portal: string): PortalMessage[] {
    return db.select().from(portalMessages).where(and(eq(portalMessages.transactionId, transactionId), eq(portalMessages.portal, portal))).orderBy(asc(portalMessages.createdAt)).all();
  }

  createPortalMessage(msg: InsertPortalMessage): PortalMessage {
    return db.insert(portalMessages).values({ ...msg, createdAt: new Date().toISOString() }).returning().get();
  }

  // ── Portal Documents ──
  getPortalDocuments(transactionId: number, portal?: string): PortalDocument[] {
    if (portal) {
      return db.select().from(portalDocuments).where(and(eq(portalDocuments.transactionId, transactionId), eq(portalDocuments.portal, portal))).orderBy(asc(portalDocuments.createdAt)).all();
    }
    return db.select().from(portalDocuments).where(eq(portalDocuments.transactionId, transactionId)).orderBy(asc(portalDocuments.createdAt)).all();
  }

  createPortalDocument(doc: InsertPortalDocument): PortalDocument {
    return db.insert(portalDocuments).values({ ...doc, createdAt: new Date().toISOString() }).returning().get();
  }

  updatePortalDocument(id: number, data: Partial<InsertPortalDocument>): PortalDocument | undefined {
    return db.update(portalDocuments).set(data).where(eq(portalDocuments.id, id)).returning().get();
  }

  // ── Repair Requests ──
  getRepairRequestByTransaction(transactionId: number): RepairRequest | undefined {
    return db.select().from(repairRequests).where(eq(repairRequests.transactionId, transactionId)).get();
  }

  createRepairRequest(req: InsertRepairRequest): RepairRequest {
    return db.insert(repairRequests).values({ ...req, createdAt: new Date().toISOString() }).returning().get();
  }

  updateRepairRequest(id: number, data: Partial<InsertRepairRequest>): RepairRequest | undefined {
    return db.update(repairRequests).set(data).where(eq(repairRequests.id, id)).returning().get();
  }

  // ── Professional Access ──
  getProfessionalAccess(id: number): ProfessionalAccess | undefined {
    return db.select().from(professionalAccess).where(eq(professionalAccess.id, id)).get();
  }

  getProfessionalAccessByToken(token: string): ProfessionalAccess | undefined {
    return db.select().from(professionalAccess).where(eq(professionalAccess.accessToken, token)).get();
  }

  getProfessionalsByTransaction(transactionId: number): ProfessionalAccess[] {
    return db.select().from(professionalAccess).where(eq(professionalAccess.transactionId, transactionId)).orderBy(desc(professionalAccess.createdAt)).all();
  }

  createProfessionalAccess(data: InsertProfessionalAccess): ProfessionalAccess {
    return db.insert(professionalAccess).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  updateProfessionalAccess(id: number, data: Partial<InsertProfessionalAccess>): ProfessionalAccess | undefined {
    return db.update(professionalAccess).set(data).where(eq(professionalAccess.id, id)).returning().get();
  }

  deleteProfessionalAccess(id: number): void {
    db.delete(professionalAccess).where(eq(professionalAccess.id, id)).run();
  }

  // ── Professional Messages ──
  getProfessionalMessages(professionalAccessId: number): ProfessionalMessage[] {
    return db.select().from(professionalMessages).where(eq(professionalMessages.professionalAccessId, professionalAccessId)).orderBy(asc(professionalMessages.createdAt)).all();
  }

  createProfessionalMessage(msg: InsertProfessionalMessage): ProfessionalMessage {
    return db.insert(professionalMessages).values({ ...msg, createdAt: new Date().toISOString() }).returning().get();
  }

  // ── Professional Documents ──
  getProfessionalDocuments(professionalAccessId: number): ProfessionalDocument[] {
    return db.select().from(professionalDocuments).where(eq(professionalDocuments.professionalAccessId, professionalAccessId)).orderBy(desc(professionalDocuments.createdAt)).all();
  }

  createProfessionalDocument(doc: InsertProfessionalDocument): ProfessionalDocument {
    return db.insert(professionalDocuments).values({ ...doc, createdAt: new Date().toISOString() }).returning().get();
  }

  updateProfessionalDocument(id: number, data: Partial<InsertProfessionalDocument>): ProfessionalDocument | undefined {
    return db.update(professionalDocuments).set(data).where(eq(professionalDocuments.id, id)).returning().get();
  }

  // ── Admin ──
  getAllUsers(): User[] {
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
  }

  getAllListings(): Listing[] {
    return db.select().from(listings).orderBy(desc(listings.createdAt)).all();
  }

  getAllTransactions(): Transaction[] {
    return db.select().from(transactions).orderBy(desc(transactions.createdAt)).all();
  }

  getPlatformStats(): { totalUsers: number; totalListings: number; activeTransactions: number; totalRevenue: number; totalPayouts: number } {
    const allUsers = db.select().from(users).all();
    const allListings = db.select().from(listings).all();
    const activeTransactions = db.select().from(transactions).where(eq(transactions.status, "in_progress")).all();
    const allPayments = db.select().from(payments).where(eq(payments.status, "completed")).all();
    const totalRevenue = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const chaperonePayoutRecords = db.select().from(chaperonePayouts).where(and(eq(chaperonePayouts.type, "payout"), eq(chaperonePayouts.status, "completed"))).all();
    const totalPayouts = chaperonePayoutRecords.reduce((sum, p) => sum + Math.abs(p.amount), 0);
    return {
      totalUsers: allUsers.length,
      totalListings: allListings.length,
      activeTransactions: activeTransactions.length,
      totalRevenue,
      totalPayouts,
    };
  }
}

export const storage = new DatabaseStorage();
