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
  hasRepairRequest: boolean;
  inspectionComplete: boolean;
  appraisalComplete: boolean;
  titleClear: boolean;
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

  return {
    transaction: txn,
    listing,
    offer,
    buyer,
    seller,
    hasHOA: !!(listing?.hoaFee && listing.hoaFee > 0),
    isPreMPC: !!(listing?.yearBuilt && listing.yearBuilt < 1978),
    hasRepairRequest: !!repairReq,
    inspectionComplete: txn.inspectionStatus === "completed" || txn.inspectionStatus === "passed",
    appraisalComplete: txn.appraisalStatus === "completed" || txn.appraisalStatus === "passed",
    titleClear: txn.titleStatus === "clear",
  };
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
