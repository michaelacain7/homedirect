/**
 * HomeDirectAI — Smart Document Filler
 * 
 * Auto-populates all document fields from transaction data.
 * When data is missing, generates targeted questionnaires.
 * Stores buyer/seller responses for future document fills.
 */

import { storage } from "./storage";
import { decryptObject } from "./encryption";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocumentField {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "boolean" | "select" | "address";
  required: boolean;
  source?: string;          // Where to pull data from: "buyer", "seller", "listing", "offer", "transaction", "questionnaire"
  sourceField?: string;     // Specific field path (e.g. "buyer.fullName")
  options?: string[];       // For select type
  helpText?: string;        // AI explains why this is needed
  category: string;         // Group fields for the questionnaire
}

export interface DocumentFieldMap {
  documentName: string;
  fields: DocumentField[];
}

export interface QuestionnaireQuestion {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "boolean" | "select" | "address";
  options?: string[];
  helpText: string;
  required: boolean;
  category: string;
}

export interface QuestionnaireResponse {
  transactionId: number;
  userId: number;
  role: "buyer" | "seller";
  responses: Record<string, any>;
  completedAt?: string;
}

export interface FilledDocumentData {
  documentName: string;
  fields: Record<string, any>;
  missingFields: QuestionnaireQuestion[];
  completionPercent: number;
}

// ── Field Definitions Per Document ───────────────────────────────────────────

const DOCUMENT_FIELDS: DocumentFieldMap[] = [
  {
    documentName: "Purchase Agreement",
    fields: [
      { key: "buyerName", label: "Buyer's Full Legal Name", type: "text", required: true, source: "buyer", sourceField: "fullName", category: "parties" },
      { key: "buyerAddress", label: "Buyer's Current Mailing Address", type: "address", required: true, source: "questionnaire", category: "parties", helpText: "Needed for the contract — your current home address." },
      { key: "sellerName", label: "Seller's Full Legal Name", type: "text", required: true, source: "seller", sourceField: "fullName", category: "parties" },
      { key: "sellerAddress", label: "Seller's Current Mailing Address", type: "address", required: true, source: "questionnaire", category: "parties", helpText: "Needed for the contract." },
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, source: "listing", sourceField: "fullAddress", category: "property" },
      { key: "legalDescription", label: "Legal Description of Property", type: "text", required: false, source: "questionnaire", category: "property", helpText: "The legal description from the deed or title. If you don't have it, the title company will provide it." },
      { key: "parcelId", label: "Parcel/Tax ID Number", type: "text", required: false, source: "questionnaire", category: "property", helpText: "Found on your property tax bill or county appraiser website." },
      { key: "purchasePrice", label: "Purchase Price", type: "number", required: true, source: "offer", sourceField: "amount", category: "financial" },
      { key: "earnestMoney", label: "Earnest Money Deposit", type: "number", required: true, source: "offer", sourceField: "earnestMoney", category: "financial" },
      { key: "financingType", label: "Financing Type", type: "select", required: true, source: "offer", sourceField: "financingType", options: ["cash", "conventional", "fha", "va"], category: "financial" },
      { key: "downPaymentPercent", label: "Down Payment Percentage", type: "number", required: true, source: "offer", sourceField: "downPaymentPercent", category: "financial" },
      { key: "closingDate", label: "Closing Date", type: "date", required: true, source: "offer", sourceField: "closingDate", category: "timeline" },
      { key: "closingDays", label: "Days to Close", type: "number", required: true, source: "offer", sourceField: "closingDays", category: "timeline" },
      { key: "contingencies", label: "Contingencies", type: "text", required: false, source: "offer", sourceField: "contingencies", category: "terms" },
      { key: "personalPropertyIncluded", label: "Personal Property Included in Sale", type: "text", required: false, source: "questionnaire", category: "terms", helpText: "List any items staying with the home beyond fixtures (e.g., washer/dryer, refrigerator, patio furniture)." },
      { key: "sellerConcessions", label: "Seller Concessions / Credits", type: "number", required: false, source: "questionnaire", category: "financial", helpText: "Any agreed-upon credits from seller to buyer for closing costs or repairs." },
      { key: "occupancyDate", label: "Possession/Occupancy Date", type: "date", required: false, source: "questionnaire", category: "timeline", helpText: "When buyer takes possession. Usually the closing date, unless a rent-back is agreed." },
    ],
  },
  {
    documentName: "Seller's Property Disclosure",
    fields: [
      { key: "sellerName", label: "Seller's Full Legal Name", type: "text", required: true, source: "seller", sourceField: "fullName", category: "parties" },
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, source: "listing", sourceField: "fullAddress", category: "property" },
      { key: "yearBuilt", label: "Year Built", type: "number", required: true, source: "listing", sourceField: "yearBuilt", category: "property" },
      { key: "roofAge", label: "Age of Roof (years)", type: "number", required: true, source: "questionnaire", category: "structural", helpText: "How old is the current roof? Insurance companies need this." },
      { key: "roofMaterial", label: "Roof Material", type: "select", required: true, source: "questionnaire", options: ["Asphalt Shingle", "Tile", "Metal", "Flat/Built-up", "Other"], category: "structural", helpText: "What type of roofing material?" },
      { key: "foundationIssues", label: "Any Foundation Cracks or Settling?", type: "boolean", required: true, source: "questionnaire", category: "structural", helpText: "Any visible cracks, settling, or foundation repairs?" },
      { key: "roofLeaks", label: "Any Roof Leaks (past 5 years)?", type: "boolean", required: true, source: "questionnaire", category: "structural", helpText: "Any leaks or water intrusion through the roof?" },
      { key: "waterIntrusion", label: "Any Water Intrusion?", type: "boolean", required: true, source: "questionnaire", category: "structural", helpText: "Any water intrusion in basement, crawl space, or walls?" },
      { key: "previousRepairs", label: "Previous Structural Repairs?", type: "boolean", required: true, source: "questionnaire", category: "structural", helpText: "Any major structural repairs (foundation, roof, framing)?" },
      { key: "repairDetails", label: "If Yes, Describe Repairs", type: "text", required: false, source: "questionnaire", category: "structural", helpText: "Describe any repairs, including dates and who performed them." },
      { key: "hvacAge", label: "HVAC System Age (years)", type: "number", required: true, source: "questionnaire", category: "mechanical", helpText: "How old is the AC/heating system?" },
      { key: "hvacIssues", label: "Any HVAC Issues?", type: "boolean", required: true, source: "questionnaire", category: "mechanical", helpText: "Any known problems with heating or cooling?" },
      { key: "plumbingIssues", label: "Any Plumbing Issues?", type: "boolean", required: true, source: "questionnaire", category: "mechanical", helpText: "Any leaks, slow drains, or pipe problems?" },
      { key: "plumbingType", label: "Plumbing Pipe Material", type: "select", required: false, source: "questionnaire", options: ["Copper", "PVC", "CPVC", "Galvanized", "Polybutylene", "PEX", "Unknown"], category: "mechanical", helpText: "What type of pipes? Polybutylene and galvanized may need replacement." },
      { key: "electricalIssues", label: "Any Electrical Issues?", type: "boolean", required: true, source: "questionnaire", category: "mechanical", helpText: "Any known electrical problems, aluminum wiring, or panel issues?" },
      { key: "waterHeaterAge", label: "Water Heater Age (years)", type: "number", required: true, source: "questionnaire", category: "mechanical", helpText: "How old is the water heater?" },
      { key: "knownAsbestos", label: "Known Asbestos?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any known asbestos-containing materials?" },
      { key: "knownLeadPaint", label: "Known Lead Paint?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any known lead-based paint? (Required disclosure for pre-1978)" },
      { key: "knownMold", label: "Known Mold or Mildew?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any known mold, mildew, or remediation history?" },
      { key: "undergroundTanks", label: "Underground Storage Tanks?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any underground fuel or chemical storage tanks?" },
      { key: "sinkholeActivity", label: "Known Sinkhole Activity?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any known sinkhole activity or geological testing?" },
      { key: "floodDamage", label: "Previous Flood Damage?", type: "boolean", required: true, source: "questionnaire", category: "environmental", helpText: "Any history of flood damage or insurance claims?" },
      { key: "pendingLawsuits", label: "Pending Lawsuits Affecting Property?", type: "boolean", required: true, source: "questionnaire", category: "legal", helpText: "Any pending legal actions affecting the property?" },
      { key: "hoaViolations", label: "HOA Violations or Pending Assessments?", type: "boolean", required: true, source: "questionnaire", category: "legal", helpText: "Any HOA violations, fines, or upcoming special assessments?" },
      { key: "easements", label: "Easements Not in Public Records?", type: "boolean", required: true, source: "questionnaire", category: "legal", helpText: "Any easements or encumbrances not shown in public records?" },
      { key: "zoningViolations", label: "Zoning Violations?", type: "boolean", required: true, source: "questionnaire", category: "legal", helpText: "Any known zoning violations or non-conforming uses?" },
      { key: "additionalDisclosures", label: "Additional Disclosures", type: "text", required: false, source: "questionnaire", category: "legal", helpText: "Any other material facts about the property that a buyer should know?" },
    ],
  },
  {
    documentName: "Lead-Based Paint Disclosure",
    fields: [
      { key: "buyerName", label: "Buyer's Name", type: "text", required: true, source: "buyer", sourceField: "fullName", category: "parties" },
      { key: "sellerName", label: "Seller's Name", type: "text", required: true, source: "seller", sourceField: "fullName", category: "parties" },
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, source: "listing", sourceField: "fullAddress", category: "property" },
      { key: "yearBuilt", label: "Year Built", type: "number", required: true, source: "listing", sourceField: "yearBuilt", category: "property" },
      { key: "knownLeadPaint", label: "Known Lead-Based Paint Present?", type: "boolean", required: true, source: "questionnaire", category: "disclosure", helpText: "Do you know of any lead-based paint in the home?" },
      { key: "leadPaintRecords", label: "Lead Paint Records/Reports Available?", type: "boolean", required: true, source: "questionnaire", category: "disclosure", helpText: "Do you have any records or reports about lead paint?" },
      { key: "buyerWaivesInspection", label: "Buyer Waives 10-Day Inspection Right?", type: "boolean", required: true, source: "questionnaire", category: "buyer_options", helpText: "You have 10 days to conduct a lead inspection. Do you waive this right?" },
    ],
  },
  {
    documentName: "Closing Statement",
    fields: [
      { key: "buyerName", label: "Buyer's Name", type: "text", required: true, source: "buyer", sourceField: "fullName", category: "parties" },
      { key: "sellerName", label: "Seller's Name", type: "text", required: true, source: "seller", sourceField: "fullName", category: "parties" },
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, source: "listing", sourceField: "fullAddress", category: "property" },
      { key: "purchasePrice", label: "Purchase Price", type: "number", required: true, source: "transaction", sourceField: "salePrice", category: "financial" },
      { key: "loanAmount", label: "Loan Amount", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "The final loan amount from your lender." },
      { key: "interestRate", label: "Interest Rate", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "Your locked mortgage interest rate." },
      { key: "mortgagePayoff", label: "Seller's Existing Mortgage Payoff", type: "number", required: false, source: "questionnaire", category: "financial", helpText: "Amount needed to pay off seller's current mortgage. Your lender/title company will get this." },
      { key: "closingDate", label: "Closing Date", type: "date", required: true, source: "transaction", sourceField: "closingDate", category: "timeline" },
      { key: "prorationDate", label: "Tax Proration Date", type: "date", required: false, source: "questionnaire", category: "financial", helpText: "Date for splitting property taxes between buyer and seller. Usually the closing date." },
      { key: "sellerCredits", label: "Seller Credits to Buyer", type: "number", required: false, source: "questionnaire", category: "financial", helpText: "Any credits seller is giving buyer (repairs, closing costs)." },
    ],
  },
  {
    documentName: "Warranty Deed",
    fields: [
      { key: "grantorName", label: "Grantor (Seller) Full Legal Name", type: "text", required: true, source: "seller", sourceField: "fullName", category: "parties" },
      { key: "grantorAddress", label: "Grantor Mailing Address", type: "address", required: true, source: "questionnaire", category: "parties", helpText: "Seller's current mailing address for the deed." },
      { key: "granteeName", label: "Grantee (Buyer) Full Legal Name", type: "text", required: true, source: "buyer", sourceField: "fullName", category: "parties" },
      { key: "granteeAddress", label: "Grantee Mailing Address", type: "address", required: true, source: "questionnaire", category: "parties", helpText: "Buyer's mailing address for the deed. This will typically be the property address after closing." },
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, source: "listing", sourceField: "fullAddress", category: "property" },
      { key: "legalDescription", label: "Legal Description", type: "text", required: true, source: "questionnaire", category: "property", helpText: "Full legal description from the title commitment. The title company provides this." },
      { key: "county", label: "County", type: "text", required: true, source: "listing", sourceField: "city", category: "property" },
      { key: "purchasePrice", label: "Consideration (Purchase Price)", type: "number", required: true, source: "transaction", sourceField: "salePrice", category: "financial" },
      { key: "maritalStatus", label: "Seller's Marital Status", type: "select", required: true, source: "questionnaire", options: ["Single", "Married", "Divorced", "Widowed"], category: "parties", helpText: "Required for deed — affects how title is transferred. If married, spouse may need to sign." },
      { key: "vestingType", label: "How Buyer Takes Title", type: "select", required: true, source: "questionnaire", options: ["Sole ownership", "Joint tenants with right of survivorship", "Tenants in common", "Tenants by the entirety (married couples)", "Trust", "LLC/Corporation"], category: "parties", helpText: "How do you want to hold title? Married couples in FL typically use 'tenants by the entirety' for asset protection." },
    ],
  },
  {
    documentName: "Promissory Note",
    fields: [
      { key: "borrowerName", label: "Borrower's Full Legal Name", type: "text", required: true, source: "buyer", sourceField: "fullName", category: "parties" },
      { key: "lenderName", label: "Lender Name", type: "text", required: true, source: "questionnaire", category: "parties", helpText: "Your mortgage lender's full legal name." },
      { key: "loanAmount", label: "Loan Amount", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "Final mortgage loan amount." },
      { key: "interestRate", label: "Interest Rate (%)", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "Your locked annual interest rate." },
      { key: "termYears", label: "Loan Term (years)", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "Loan term — typically 15 or 30 years." },
      { key: "monthlyPayment", label: "Monthly P&I Payment", type: "number", required: true, source: "questionnaire", category: "financial", helpText: "Monthly principal and interest payment from your loan estimate." },
      { key: "firstPaymentDate", label: "First Payment Date", type: "date", required: true, source: "questionnaire", category: "timeline", helpText: "When your first mortgage payment is due — typically 30-45 days after closing." },
    ],
  },
];

// ── Data Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a field's value from the transaction data sources.
 */
function resolveField(
  field: DocumentField,
  data: { buyer: any; seller: any; listing: any; offer: any; transaction: any; questionnaire: Record<string, any> },
): any {
  // Check questionnaire responses first (user-provided overrides everything)
  if (data.questionnaire[field.key] !== undefined) {
    return data.questionnaire[field.key];
  }

  if (!field.source || field.source === "questionnaire") return undefined;

  const sourceObj = (data as any)[field.source];
  if (!sourceObj) return undefined;

  if (field.sourceField === "fullAddress" && field.source === "listing") {
    return `${sourceObj.address}, ${sourceObj.city}, ${sourceObj.state} ${sourceObj.zip}`;
  }

  if (field.sourceField) {
    return sourceObj[field.sourceField];
  }

  return undefined;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get all field definitions for a document.
 */
export function getDocumentFields(documentName: string): DocumentField[] {
  const map = DOCUMENT_FIELDS.find(d => d.documentName === documentName);
  return map?.fields || [];
}

/**
 * Auto-fill a document with all available data and identify what's missing.
 */
export function fillDocument(
  documentName: string,
  transactionId: number,
  questionnaireResponses: Record<string, any> = {},
): FilledDocumentData {
  const fields = getDocumentFields(documentName);
  if (fields.length === 0) {
    return { documentName, fields: {}, missingFields: [], completionPercent: 100 };
  }

  const txn = storage.getTransaction(transactionId);
  if (!txn) {
    return { documentName, fields: {}, missingFields: [], completionPercent: 0 };
  }

  const listing = storage.getListing(txn.listingId);
  const offer = storage.getOffer(txn.offerId);
  const buyer = storage.getUser(txn.buyerId);
  const seller = storage.getUser(txn.sellerId);

  // Decrypt any encrypted questionnaire responses for document filling
  const decryptedResponses = decryptObject(questionnaireResponses);
  const data = { buyer, seller, listing, offer, transaction: txn, questionnaire: decryptedResponses };

  const filledFields: Record<string, any> = {};
  const missingFields: QuestionnaireQuestion[] = [];
  let filledCount = 0;

  for (const field of fields) {
    const value = resolveField(field, data);
    if (value !== undefined && value !== null && value !== "") {
      filledFields[field.key] = value;
      filledCount++;
    } else if (field.required) {
      missingFields.push({
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options,
        helpText: field.helpText || `Please provide: ${field.label}`,
        required: field.required,
        category: field.category,
      });
    }
  }

  const totalRequired = fields.filter(f => f.required).length;
  const completionPercent = totalRequired > 0 ? Math.round((filledCount / fields.length) * 100) : 100;

  return { documentName, fields: filledFields, missingFields, completionPercent };
}

/**
 * Generate the questionnaire for all missing fields across all documents in a transaction.
 */
export function generateFullQuestionnaire(
  transactionId: number,
  role: "buyer" | "seller",
  existingResponses: Record<string, any> = {},
): { categories: Record<string, QuestionnaireQuestion[]>; totalQuestions: number; answeredQuestions: number } {
  const txn = storage.getTransaction(transactionId);
  if (!txn) return { categories: {}, totalQuestions: 0, answeredQuestions: 0 };

  const allMissing = new Map<string, QuestionnaireQuestion>();

  for (const docMap of DOCUMENT_FIELDS) {
    const result = fillDocument(docMap.documentName, transactionId, existingResponses);
    for (const q of result.missingFields) {
      // Filter strictly by role — buyers only see buyer fields, sellers only see seller fields
      const field = docMap.fields.find(f => f.key === q.key);
      if (!field) continue;

      // Buyer-specific fields
      const BUYER_FIELDS = new Set([
        "buyerAddress", "vestingType", "lenderName", "loanAmount", "interestRate",
        "termYears", "monthlyPayment", "firstPaymentDate", "buyerWaivesInspection",
        "personalPropertyIncluded", "occupancyDate", "sellerConcessions",
        "granteeAddress",
      ]);
      // Seller-specific fields
      const SELLER_FIELDS = new Set([
        "sellerAddress", "grantorAddress", "legalDescription", "parcelId",
        "roofAge", "roofMaterial", "foundationIssues", "roofLeaks", "waterIntrusion",
        "previousRepairs", "repairDetails", "hvacAge", "hvacIssues", "plumbingIssues",
        "plumbingType", "electricalIssues", "waterHeaterAge",
        "knownAsbestos", "knownLeadPaint", "knownMold", "undergroundTanks",
        "sinkholeActivity", "floodDamage", "pendingLawsuits", "hoaViolations",
        "easements", "zoningViolations", "additionalDisclosures",
        "maritalStatus", "mortgagePayoff",
        "leadPaintRecords",
      ]);

      const isForRole =
        (role === "buyer" && BUYER_FIELDS.has(field.key)) ||
        (role === "seller" && SELLER_FIELDS.has(field.key));

      if (isForRole && !allMissing.has(q.key)) {
        allMissing.set(q.key, q);
      }
    }
  }

  // Group by category
  const categories: Record<string, QuestionnaireQuestion[]> = {};
  for (const q of allMissing.values()) {
    if (!categories[q.category]) categories[q.category] = [];
    categories[q.category].push(q);
  }

  const totalQuestions = allMissing.size;
  const answeredQuestions = [...allMissing.keys()].filter(k => existingResponses[k] !== undefined).length;

  return { categories, totalQuestions, answeredQuestions };
}

/**
 * Get a simple list of all document names that have field definitions.
 */
export function getConfiguredDocuments(): string[] {
  return DOCUMENT_FIELDS.map(d => d.documentName);
}

/**
 * Check if all required data is available to fill a document completely.
 */
export function isDocumentReady(
  documentName: string,
  transactionId: number,
  questionnaireResponses: Record<string, any> = {},
): boolean {
  const result = fillDocument(documentName, transactionId, questionnaireResponses);
  return result.missingFields.length === 0;
}
