import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, like, and, gte, lte, desc, or } from "drizzle-orm";
import {
  users, listings, offers, walkthroughs, documents, messages, transactions, savedSearches, favorites,
  type User, type InsertUser,
  type Listing, type InsertListing,
  type Offer, type InsertOffer,
  type Walkthrough, type InsertWalkthrough,
  type Document, type InsertDocument,
  type Message, type InsertMessage,
  type Transaction, type InsertTransaction,
  type SavedSearch, type InsertSavedSearch,
  type Favorite, type InsertFavorite,
} from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Auto-create tables if they don't exist (needed for fresh deploys like Railway)
sqlite.exec(`
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
`);

export const db = drizzle(sqlite);

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
  }): Listing[];
  getListingsBySeller(sellerId: number): Listing[];
  createListing(listing: InsertListing): Listing;
  updateListing(id: number, data: Partial<InsertListing>): Listing | undefined;
  deleteListing(id: number): void;
  getFeaturedListings(): Listing[];

  // Offers
  getOffer(id: number): Offer | undefined;
  getOffersByListing(listingId: number): Offer[];
  getOffersByBuyer(buyerId: number): Offer[];
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
  }): Listing[] {
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
    return db.select().from(listings).where(and(...conditions)).orderBy(desc(listings.createdAt)).all();
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
}

export const storage = new DatabaseStorage();
