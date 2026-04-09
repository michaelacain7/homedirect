/**
 * HomeDirectAI — Document Orchestrator
 * The AI agent uses this to decide which documents are needed at each
 * transaction stage and routes them for signing via DocuSign.
 */

import { storage } from "./storage";
import { isDocuSignConfigured, createEnvelope, getEnvelopeStatus, getSigningUrl, type SignerInfo, type EnvelopeDocument } from "./docusign";

// ── Transaction Stages & Required Documents ──────────────────────────────────

export interface DocumentRequirement {
  documentType: string;
  name: string;
  description: string;
  signers: ("buyer" | "seller" | "both")[];
  stage: TransactionStage;
  condition?: (ctx: TransactionContext) => boolean;
  priority: number;  // 1 = must sign first, 2 = important, 3 = informational
  explanation: string;  // What the AI agent tells the user about this document
}

export type TransactionStage =
  | "offer_accepted"
  | "inspection_period"
  | "post_inspection"
  | "appraisal_period"
  | "title_review"
  | "pre_closing"
  | "closing";

export interface TransactionContext {
  transaction: any;
  listing: any;
  offer: any;
  buyer: any;
  seller: any;
  hasHOA: boolean;
  isPreMPC: boolean;  // pre-1978 (lead paint)
  isCondo: boolean;
  isCash: boolean;
  hasInspectionContingency: boolean;
  hasFinancingContingency: boolean;
  hasAppraisalContingency: boolean;
  hasRepairRequest: boolean;
  inspectionComplete: boolean;
  appraisalComplete: boolean;
  titleClear: boolean;
  isCoastal: boolean;     // wind coverage needed
  isSinkholeArea: boolean;
  isFloodZone: boolean;
  propertyAge: number;
}

// ── Master Document Registry ─────────────────────────────────────────────────

export const DOCUMENT_REGISTRY: DocumentRequirement[] = [
  // STAGE: Offer Accepted
  {
    documentType: "contract",
    name: "Purchase Agreement",
    description: "The binding contract between buyer and seller for the property purchase.",
    signers: ["both"],
    stage: "offer_accepted",
    priority: 1,
    explanation: "This is your Purchase Agreement — the legally binding contract for the sale. It includes the purchase price, closing date, contingencies, and all agreed terms. Both buyer and seller must sign. Review carefully — once signed, you're committed to the terms unless a contingency allows you to exit.",
  },
  {
    documentType: "disclosure",
    name: "Seller's Property Disclosure",
    description: "Seller's disclosure of all known material defects per Johnson v. Davis.",
    signers: ["seller"],
    stage: "offer_accepted",
    priority: 1,
    explanation: "Florida law (Johnson v. Davis) requires sellers to disclose all known material defects. This form covers structural issues, mechanical systems, environmental concerns, and legal matters. Complete it honestly — failure to disclose known defects can result in legal liability.",
  },
  {
    documentType: "disclosure",
    name: "Radon Disclosure Notice",
    description: "Florida-required radon gas disclosure per Statute 404.056(5).",
    signers: ["both"],
    stage: "offer_accepted",
    priority: 2,
    explanation: "Florida law requires this radon gas disclosure in every residential transaction. Radon is a naturally occurring radioactive gas that can accumulate in buildings. This acknowledges that you've been informed about radon risks. It does NOT mean radon is present — just that you're aware of the possibility.",
  },
  {
    documentType: "disclosure",
    name: "Flood Zone Disclosure",
    description: "Notification of property's FEMA flood zone designation.",
    signers: ["both"],
    stage: "offer_accepted",
    priority: 2,
    explanation: "This discloses whether the property is in a FEMA Special Flood Hazard Area. If it is (Zone A or AE), flood insurance is required by your lender. Even in Zone X (lower risk), flood insurance is recommended — 25% of flood claims come from outside high-risk zones.",
  },
  {
    documentType: "disclosure",
    name: "Lead-Based Paint Disclosure",
    description: "Federal requirement for homes built before 1978.",
    signers: ["both"],
    stage: "offer_accepted",
    condition: (ctx) => ctx.isPreMPC,
    priority: 1,
    explanation: "Federal law requires this disclosure because the home was built before 1978, when lead-based paint was commonly used. You have a 10-day right to conduct a lead paint inspection. Lead is especially dangerous for children under 6 and pregnant women.",
  },
  {
    documentType: "disclosure",
    name: "HOA/Condo Disclosure",
    description: "HOA association documents and buyer's 3-day rescission right.",
    signers: ["both"],
    stage: "offer_accepted",
    condition: (ctx) => ctx.hasHOA,
    priority: 2,
    explanation: "This property is in an HOA/condo association. You have a legal right to review the association's declaration, bylaws, rules, financials, and meeting minutes. After receiving these documents, you have 3 BUSINESS DAYS to cancel the contract if you're not satisfied — this is a Florida law that cannot be waived.",
  },

  // STAGE: Post-Inspection
  {
    documentType: "inspection",
    name: "Repair Addendum",
    description: "Buyer's repair/credit requests based on inspection findings.",
    signers: ["both"],
    stage: "post_inspection",
    condition: (ctx) => ctx.hasRepairRequest,
    priority: 1,
    explanation: "Based on the home inspection findings, this addendum lists specific repairs or credits you're requesting from the seller. Each item includes the finding, estimated cost, and whether you want the seller to fix it or provide a credit. The seller has 5 business days to respond — they can accept, counter, or reject each item.",
  },

  // STAGE: Pre-Closing
  {
    documentType: "closing",
    name: "Closing Disclosure (CD)",
    description: "Final closing costs, loan terms, and transaction summary.",
    signers: ["both"],
    stage: "pre_closing",
    condition: (ctx) => !ctx.isCash, // Cash deals don't have a federally-required CD from a lender
    priority: 1,
    explanation: "The Closing Disclosure is a federally required document that shows your final loan terms, monthly payment, and all closing costs. By law, you must receive this at least 3 BUSINESS DAYS before closing. Review every line carefully — compare it to your Loan Estimate. If anything looks wrong, speak up before you sign at the closing table.",
  },
  {
    documentType: "closing",
    name: "Closing Statement",
    description: "Detailed settlement statement showing all debits and credits.",
    signers: ["both"],
    stage: "pre_closing",
    priority: 1,
    explanation: "This is the detailed breakdown of every dollar in this transaction. Buyer side: purchase price, loan amount, down payment, closing costs (doc stamps, title insurance, lender fees, prepaid items). Seller side: sale price minus payoff, doc stamps, title insurance, and our 1% platform fee. The bottom line shows exactly what the buyer brings to closing and what the seller takes home.",
  },
  {
    documentType: "closing",
    name: "Final Walkthrough Checklist",
    description: "Pre-closing property inspection to verify condition.",
    signers: ["buyer"],
    stage: "pre_closing",
    priority: 2,
    explanation: "This is your final walkthrough checklist — do this 24-48 hours before closing. Walk through every room and check that all agreed repairs were made, appliances work, no new damage occurred, and the seller has moved out. If something is wrong, document it and we'll address it before closing. Do NOT skip this step.",
  },
  {
    documentType: "closing",
    name: "Insurance Binder Request",
    description: "Homeowner's insurance requirements for closing.",
    signers: ["buyer"],
    stage: "pre_closing",
    condition: (ctx) => !ctx.isCash || true, // Always needed — even cash buyers need insurance
    priority: 2,
    explanation: "Your lender requires proof of homeowner's insurance before closing. This document outlines the coverage requirements and Florida-specific needs (wind, flood, sinkhole). Get quotes from at least 3 insurers. The insurance binder must list your lender as loss payee and be delivered to the title company before closing day.",
  },

  // STAGE: Closing
  {
    documentType: "closing",
    name: "Warranty Deed",
    description: "Transfers ownership from seller to buyer.",
    signers: ["seller"],
    stage: "closing",
    priority: 1,
    explanation: "The Warranty Deed is the legal document that transfers ownership of the property from seller to buyer. The seller (grantor) warrants that they have clear title and the right to sell. This deed is recorded with the county clerk after closing — it becomes the public record of your ownership.",
  },
  {
    documentType: "closing",
    name: "Promissory Note",
    description: "Borrower's promise to repay the mortgage loan.",
    signers: ["buyer"],
    stage: "closing",
    condition: (ctx) => ctx.offer?.financingType !== "cash",
    priority: 1,
    explanation: "The Promissory Note is your promise to repay the mortgage loan. It specifies the loan amount, interest rate, monthly payment, term, late fees, and default provisions. This is between you and your lender. Read the interest rate, payment amount, and prepayment terms carefully.",
  },
];

// ── Orchestrator Functions ───────────────────────────────────────────────────

/**
 * Build the transaction context from database records.
 */
export function buildTransactionContext(transactionId: number): TransactionContext | null {
  const txn = storage.getTransaction(transactionId);
  if (!txn) return null;

  const listing = storage.getListing(txn.listingId);
  const offer = storage.getOffer(txn.offerId);
  const buyer = storage.getUser(txn.buyerId);
  const seller = storage.getUser(txn.sellerId);
  const repairReq = storage.getRepairRequestByTransaction(transactionId);

  // Parse contingencies from offer
  const contingencies: string[] = (() => {
    try { return JSON.parse(offer?.contingencies || "[]"); } catch { return []; }
  })();
  const contingencyLower = contingencies.map((c: string) => c.toLowerCase());

  // Detect coastal areas (Florida Gulf/Atlantic coast cities)
  const coastalCities = ["clearwater", "st. petersburg", "st pete", "tampa", "sarasota", "fort myers", "naples", "miami", "fort lauderdale", "west palm", "daytona", "jacksonville beach", "key west", "cape coral"];
  const cityLower = (listing?.city || "").toLowerCase();
  const isCoastal = coastalCities.some(c => cityLower.includes(c));

  // Sinkhole-prone counties
  const sinkholeAreas = ["hillsborough", "pasco", "hernando", "pinellas", "polk"];
  const isSinkholeArea = sinkholeAreas.some(c => cityLower.includes(c));

  const yearBuilt = listing?.yearBuilt || 2000;
  const propertyAge = new Date().getFullYear() - yearBuilt;

  return {
    transaction: txn,
    listing,
    offer,
    buyer,
    seller,
    hasHOA: !!(listing?.hoaFee && listing.hoaFee > 0),
    isCondo: listing?.propertyType === "condo" || listing?.propertyType === "townhouse",
    isPreMPC: yearBuilt < 1978,
    isCash: offer?.financingType === "cash",
    hasInspectionContingency: contingencyLower.includes("inspection"),
    hasFinancingContingency: contingencyLower.includes("financing"),
    hasAppraisalContingency: contingencyLower.includes("appraisal"),
    hasRepairRequest: !!repairReq,
    inspectionComplete: txn.inspectionStatus === "completed" || txn.inspectionStatus === "passed",
    appraisalComplete: txn.appraisalStatus === "completed" || txn.appraisalStatus === "passed",
    titleClear: txn.titleStatus === "clear",
    isCoastal,
    isSinkholeArea,
    isFloodZone: false, // Would come from FEMA API or listing data
    propertyAge,
  };
}

/**
 * AI agent calls this to analyze a transaction and get a smart recommendation
 * of exactly which documents are needed and why. No duplicates, no unnecessary docs.
 */
export function analyzeTransactionDocuments(transactionId: number): {
  summary: string;
  requiredNow: Array<{ name: string; reason: string; signers: string[] }>;
  requiredLater: Array<{ name: string; stage: string; reason: string }>;
  notNeeded: Array<{ name: string; reason: string }>;
  flags: string[];
} {
  const ctx = buildTransactionContext(transactionId);
  if (!ctx) return { summary: "Transaction not found", requiredNow: [], requiredLater: [], notNeeded: [], flags: [] };

  const stage = getCurrentStage(ctx);
  const flags: string[] = [];

  // Analyze property-specific concerns
  if (ctx.propertyAge > 30) flags.push(`Home is ${ctx.propertyAge} years old — 4-point inspection likely required for insurance`);
  if (ctx.isPreMPC) flags.push("Pre-1978 home — lead-based paint disclosure REQUIRED by federal law");
  if (ctx.isCoastal) flags.push("Coastal property — separate wind coverage may be needed");
  if (ctx.isSinkholeArea) flags.push("Property in sinkhole-prone area — consider sinkhole coverage");
  if (ctx.isCash) flags.push("Cash transaction — no lender documents needed (Closing Disclosure, Promissory Note)");
  if (ctx.hasHOA) flags.push("HOA property — buyer has 3-day rescission right after receiving HOA docs");
  if (ctx.isCondo) flags.push("Condo — Florida SB 4-D structural inspection requirements may apply");

  const requiredNow: Array<{ name: string; reason: string; signers: string[] }> = [];
  const requiredLater: Array<{ name: string; stage: string; reason: string }> = [];
  const notNeeded: Array<{ name: string; reason: string }> = [];

  for (const doc of DOCUMENT_REGISTRY) {
    const meetsCondition = !doc.condition || doc.condition(ctx);

    if (!meetsCondition) {
      // Document not needed for this transaction
      let reason = "Not applicable to this transaction";
      if (doc.name === "Lead-Based Paint Disclosure") reason = `Home built in ${ctx.listing?.yearBuilt || "unknown"} — only required for pre-1978`;
      if (doc.name === "HOA/Condo Disclosure") reason = "No HOA or condo association";
      if (doc.name === "Repair Addendum") reason = "No repair request submitted yet";
      if (doc.name === "Promissory Note") reason = "Cash transaction — no mortgage";
      if (doc.name === "Closing Disclosure (CD)") reason = "Cash transaction — no lender-required CD";
      notNeeded.push({ name: doc.name, reason });
      continue;
    }

    if (doc.stage === stage) {
      let reason = doc.description;
      if (doc.name === "Purchase Agreement") reason = "Must be signed first to make the contract binding";
      if (doc.name === "Seller's Property Disclosure") reason = "Florida law requires seller to disclose known defects";
      if (doc.name === "Radon Disclosure Notice") reason = "Florida statute requires this in every residential transaction";
      requiredNow.push({
        name: doc.name,
        reason,
        signers: doc.signers.includes("both") ? ["buyer", "seller"] : [...doc.signers],
      });
    } else {
      requiredLater.push({
        name: doc.name,
        stage: doc.stage,
        reason: doc.description,
      });
    }
  }

  const totalDocs = requiredNow.length + requiredLater.length;
  const listing = ctx.listing;
  const summary = `This transaction for ${listing?.address || "the property"} at $${(ctx.transaction.salePrice || 0).toLocaleString()} requires ${totalDocs} documents total. ${requiredNow.length} need attention now (${stage.replace(/_/g, " ")} stage), ${requiredLater.length} will be needed at later stages.${ctx.isCash ? " Cash deal — lender docs excluded." : ""}${ctx.isPreMPC ? " Pre-1978 home — lead paint disclosure included." : ""}${ctx.hasHOA ? " HOA property — association docs required." : ""}`;

  return { summary, requiredNow, requiredLater, notNeeded, flags };
}

/**
 * Get documents required for a specific transaction stage.
 */
export function getDocumentsForStage(
  stage: TransactionStage,
  ctx: TransactionContext,
): DocumentRequirement[] {
  return DOCUMENT_REGISTRY
    .filter(doc => doc.stage === stage)
    .filter(doc => !doc.condition || doc.condition(ctx))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get ALL documents needed for a transaction, organized by stage.
 */
export function getFullDocumentPlan(ctx: TransactionContext): Record<TransactionStage, DocumentRequirement[]> {
  const stages: TransactionStage[] = [
    "offer_accepted", "inspection_period", "post_inspection",
    "appraisal_period", "title_review", "pre_closing", "closing",
  ];

  const plan: Record<string, DocumentRequirement[]> = {};
  for (const stage of stages) {
    const docs = getDocumentsForStage(stage, ctx);
    if (docs.length > 0) plan[stage] = docs;
  }
  return plan as Record<TransactionStage, DocumentRequirement[]>;
}

/**
 * Get documents that a specific role (buyer/seller) needs to sign at a given stage.
 */
export function getDocumentsForRole(
  stage: TransactionStage,
  role: "buyer" | "seller",
  ctx: TransactionContext,
): DocumentRequirement[] {
  return getDocumentsForStage(stage, ctx).filter(
    doc => doc.signers.includes(role) || doc.signers.includes("both")
  );
}

/**
 * Determine the current transaction stage based on statuses.
 */
export function getCurrentStage(ctx: TransactionContext): TransactionStage {
  const txn = ctx.transaction;
  if (txn.status === "completed") return "closing";
  if (ctx.titleClear && ctx.appraisalComplete && ctx.inspectionComplete) return "pre_closing";
  if (txn.titleStatus !== "not_started") return "title_review";
  if (ctx.appraisalComplete || txn.appraisalStatus !== "not_started") return "appraisal_period";
  if (ctx.hasRepairRequest) return "post_inspection";
  if (ctx.inspectionComplete || txn.inspectionStatus !== "not_started") return "inspection_period";
  return "offer_accepted";
}

/**
 * Get a human-readable summary of all documents and their signing status.
 */
export function getDocumentSummary(transactionId: number): {
  stage: TransactionStage;
  documents: Array<{
    name: string;
    type: string;
    status: string;
    signers: string[];
    explanation: string;
    needsSignature: boolean;
    priority: number;
  }>;
} {
  const ctx = buildTransactionContext(transactionId);
  if (!ctx) return { stage: "offer_accepted", documents: [] };

  const stage = getCurrentStage(ctx);
  const allDocs = storage.getDocumentsByListing(ctx.transaction.listingId);

  const requirements = getDocumentsForStage(stage, ctx);

  return {
    stage,
    documents: requirements.map(req => {
      const existing = allDocs.find(d => d.name === req.name);
      return {
        name: req.name,
        type: req.documentType,
        status: existing?.status || "pending",
        signers: req.signers.includes("both") ? ["buyer", "seller"] : req.signers,
        explanation: req.explanation,
        needsSignature: existing ? !(existing.signedByBuyer && existing.signedBySeller) : true,
        priority: req.priority,
      };
    }),
  };
}

/**
 * Send documents for signing via DocuSign (or track locally if DocuSign not configured).
 */
export async function sendDocumentsForSigning(
  transactionId: number,
  documentNames: string[],
  returnUrl: string,
): Promise<{ envelopeId?: string; signingUrls: Record<string, string>; fallback: boolean }> {
  const ctx = buildTransactionContext(transactionId);
  if (!ctx) throw new Error("Transaction not found");

  const allDocs = storage.getDocumentsByListing(ctx.transaction.listingId);
  const docsToSign = allDocs.filter(d => documentNames.includes(d.name) && d.content);

  if (docsToSign.length === 0) {
    throw new Error("No signable documents found");
  }

  // Build signer list
  const signers: SignerInfo[] = [];
  if (ctx.buyer?.email) {
    signers.push({ email: ctx.buyer.email, name: ctx.buyer.fullName, role: "buyer", routingOrder: 1 });
  }
  if (ctx.seller?.email) {
    signers.push({ email: ctx.seller.email, name: ctx.seller.fullName, role: "seller", routingOrder: 2 });
  }

  // Build document list
  const envelopeDocs: EnvelopeDocument[] = docsToSign.map((doc, i) => ({
    documentId: String(i + 1),
    name: doc.name,
    fileUrl: doc.content || "",
    requiresSignature: true,
  }));

  if (isDocuSignConfigured()) {
    // Real DocuSign flow
    const listing = ctx.listing;
    const address = listing ? `${listing.address}, ${listing.city}` : "Property";
    const result = await createEnvelope(
      envelopeDocs,
      signers,
      `HomeDirectAI — Documents for ${address}`,
      returnUrl,
    );

    // Update document records with envelope ID
    docsToSign.forEach(doc => {
      storage.updateDocument(doc.id, { status: "pending_review" });
    });

    return { envelopeId: result.envelopeId, signingUrls: result.signingUrls, fallback: false };
  }

  // Fallback: local signing (mark as sent, use platform's built-in signing)
  docsToSign.forEach(doc => {
    storage.updateDocument(doc.id, { status: "pending_review" });
  });

  return {
    signingUrls: {
      buyer: `/#/transaction/${transactionId}`,
      seller: `/#/transaction/${transactionId}`,
    },
    fallback: true,
  };
}
