/**
 * HomeDirectAI Agent Tools
 * Defines executable tools the AI agent can invoke to take real actions.
 * Uses OpenAI-compatible function calling format.
 */

import { storage } from "./storage";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_listings",
      description: "Search for available property listings with filters. Use this when the user asks about homes for sale, available properties, or wants to browse listings.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City to search in (e.g. 'Tampa', 'Orlando')" },
          minPrice: { type: "number", description: "Minimum price filter" },
          maxPrice: { type: "number", description: "Maximum price filter" },
          minBeds: { type: "number", description: "Minimum bedrooms" },
          maxBeds: { type: "number", description: "Maximum bedrooms" },
          minBaths: { type: "number", description: "Minimum bathrooms" },
          minSqft: { type: "number", description: "Minimum square footage" },
          propertyType: { type: "string", enum: ["single_family", "condo", "townhouse", "multi_family"], description: "Property type filter" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_listing_details",
      description: "Get full details for a specific property listing by ID. Use when the user asks about a specific property.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "number", description: "The listing ID to retrieve" },
        },
        required: ["listingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_closing_costs",
      description: "Calculate detailed buyer or seller closing costs for a Florida real estate transaction. Use when users ask about closing costs, fees, or what they'll pay at closing.",
      parameters: {
        type: "object",
        properties: {
          salePrice: { type: "number", description: "The sale price of the property" },
          loanAmount: { type: "number", description: "The mortgage loan amount (0 for cash)" },
          role: { type: "string", enum: ["buyer", "seller"], description: "Whether calculating for buyer or seller" },
          loanType: { type: "string", enum: ["conventional", "fha", "va", "cash"], description: "Type of financing" },
        },
        required: ["salePrice", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_monthly_payment",
      description: "Calculate monthly mortgage payment including principal, interest, taxes, insurance, HOA, and PMI. Use when users ask what their monthly payment would be.",
      parameters: {
        type: "object",
        properties: {
          price: { type: "number", description: "Purchase price" },
          downPaymentPercent: { type: "number", description: "Down payment as percentage (e.g. 20)" },
          interestRate: { type: "number", description: "Annual interest rate (e.g. 7.0)" },
          termYears: { type: "number", description: "Loan term in years (default 30)" },
          propertyTax: { type: "number", description: "Annual property tax amount" },
          hoaMonthly: { type: "number", description: "Monthly HOA fee" },
          insuranceAnnual: { type: "number", description: "Annual homeowner's insurance" },
        },
        required: ["price", "downPaymentPercent", "interestRate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_offer_price",
      description: "Suggest a competitive offer price based on listing details and market conditions. Use when buyers ask what to offer.",
      parameters: {
        type: "object",
        properties: {
          listingPrice: { type: "number", description: "The asking price" },
          daysOnMarket: { type: "number", description: "How long the listing has been active" },
          comparablePricePerSqft: { type: "number", description: "Average price/sqft for comparable homes" },
          marketCondition: { type: "string", enum: ["buyers", "balanced", "sellers"], description: "Current market condition" },
          propertyCondition: { type: "string", enum: ["excellent", "good", "fair", "needs_work"], description: "Property condition" },
        },
        required: ["listingPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_savings",
      description: "Calculate how much the user saves by using HomeDirectAI (1% fee) vs a traditional real estate agent (5-6% commission). Use when users ask about savings or platform fees.",
      parameters: {
        type: "object",
        properties: {
          salePrice: { type: "number", description: "The sale price of the property" },
          traditionalRate: { type: "number", description: "Traditional commission rate (default 6%)" },
        },
        required: ["salePrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_properties",
      description: "Compare 2-3 property listings side by side. Use when the user wants to compare homes.",
      parameters: {
        type: "object",
        properties: {
          listingIds: { type: "array", items: { type: "number" }, description: "Array of 2-3 listing IDs to compare" },
        },
        required: ["listingIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_transaction_status",
      description: "Get the current status of a real estate transaction including escrow, title, inspection, and appraisal progress.",
      parameters: {
        type: "object",
        properties: {
          transactionId: { type: "number", description: "The transaction ID" },
        },
        required: ["transactionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inspection_checklist",
      description: "Generate a property-specific inspection checklist based on age, type, and location.",
      parameters: {
        type: "object",
        properties: {
          yearBuilt: { type: "number", description: "Year the home was built" },
          propertyType: { type: "string", description: "Type of property" },
          city: { type: "string", description: "City/area for location-specific concerns" },
          sqft: { type: "number", description: "Square footage" },
        },
        required: ["yearBuilt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_net_proceeds",
      description: "Calculate seller's net proceeds after all fees, taxes, and costs. Use when sellers ask how much they'll take home.",
      parameters: {
        type: "object",
        properties: {
          salePrice: { type: "number", description: "Expected sale price" },
          mortgageBalance: { type: "number", description: "Remaining mortgage balance" },
          repairCredits: { type: "number", description: "Any repair credits offered to buyer" },
        },
        required: ["salePrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_analysis",
      description: "Get market statistics for a city or area including average prices, price per sqft, and trends.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City to analyze" },
          propertyType: { type: "string", description: "Property type filter" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_walkthrough",
      description: "Schedule a $20 chaperone-guided property walkthrough. REQUIRES USER CONFIRMATION before executing.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "number", description: "The listing to schedule a walkthrough for" },
          preferredDate: { type: "string", description: "Preferred date (ISO format)" },
          preferredTime: { type: "string", description: "Preferred time slot" },
        },
        required: ["listingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_offer",
      description: "Draft a complete purchase offer with all terms. REQUIRES USER CONFIRMATION before submitting.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "number", description: "The listing to make an offer on" },
          amount: { type: "number", description: "Offer amount in dollars" },
          financingType: { type: "string", enum: ["cash", "conventional", "fha", "va"], description: "Financing type" },
          downPaymentPercent: { type: "number", description: "Down payment percentage" },
          earnestMoney: { type: "number", description: "Earnest money deposit amount" },
          closingDays: { type: "number", description: "Days to close (default 30)" },
          contingencies: { type: "array", items: { type: "string" }, description: "List of contingencies" },
          message: { type: "string", description: "Personal message to seller" },
        },
        required: ["listingId", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_insurance_cost",
      description: "Estimate annual homeowner's insurance cost for a Florida property.",
      parameters: {
        type: "object",
        properties: {
          propertyValue: { type: "number", description: "Property value" },
          yearBuilt: { type: "number", description: "Year built" },
          sqft: { type: "number", description: "Square footage" },
          roofAge: { type: "number", description: "Age of roof in years" },
          floodZone: { type: "string", enum: ["A", "AE", "X", "unknown"], description: "FEMA flood zone" },
          hasPool: { type: "boolean", description: "Whether property has a pool" },
        },
        required: ["propertyValue"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_counter_offer",
      description: "Generate a strategic counter-offer with suggested price and terms. Use during negotiation.",
      parameters: {
        type: "object",
        properties: {
          currentOfferAmount: { type: "number", description: "The current offer on the table" },
          listingPrice: { type: "number", description: "Original listing price" },
          userRole: { type: "string", enum: ["buyer", "seller"], description: "Whether user is buyer or seller" },
          targetPrice: { type: "number", description: "User's target price (optional)" },
          closingCostCredit: { type: "number", description: "Closing cost credit to request" },
        },
        required: ["currentOfferAmount", "listingPrice", "userRole"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction_documents",
      description: "Get all documents for a transaction, organized by signing status and stage. Use when buyer/seller asks about documents, what needs to be signed, or document status.",
      parameters: {
        type: "object",
        properties: {
          transactionId: { type: "number", description: "The transaction ID" },
        },
        required: ["transactionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_document",
      description: "Get a detailed plain-English explanation of a specific real estate document — what it is, why it matters, what to look for. Use when buyer/seller asks questions about a document.",
      parameters: {
        type: "object",
        properties: {
          documentName: { type: "string", description: "Name of the document to explain" },
          userRole: { type: "string", enum: ["buyer", "seller"], description: "Whether the user is buyer or seller" },
        },
        required: ["documentName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_documents_for_signing",
      description: "Send specific documents to buyer and/or seller for e-signature via DocuSign. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          transactionId: { type: "number", description: "The transaction ID" },
          documentNames: { type: "array", items: { type: "string" }, description: "Names of documents to send for signing" },
        },
        required: ["transactionId", "documentNames"],
      },
    },
  },
];

// ── Tools that require user confirmation before executing ─────────────────────

const ACTION_TOOLS = new Set(["schedule_walkthrough", "draft_offer", "send_documents_for_signing"]);

export function requiresConfirmation(toolName: string): boolean {
  return ACTION_TOOLS.has(toolName);
}

// ── Tool Executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId?: number
): Promise<string> {
  switch (toolName) {
    case "search_listings": {
      const allListings = storage.getListings();
      let results = allListings.filter((l: any) => l.status === "active");
      if (args.city) results = results.filter((l: any) => l.city.toLowerCase().includes(args.city.toLowerCase()));
      if (args.minPrice) results = results.filter((l: any) => l.price >= args.minPrice);
      if (args.maxPrice) results = results.filter((l: any) => l.price <= args.maxPrice);
      if (args.minBeds) results = results.filter((l: any) => l.bedrooms >= args.minBeds);
      if (args.maxBeds) results = results.filter((l: any) => l.bedrooms <= args.maxBeds);
      if (args.minBaths) results = results.filter((l: any) => l.bathrooms >= args.minBaths);
      if (args.minSqft) results = results.filter((l: any) => l.sqft >= args.minSqft);
      if (args.propertyType) results = results.filter((l: any) => l.propertyType === args.propertyType);
      const mapped = results.slice(0, 10).map((l: any) => ({
        id: l.id, title: l.title, price: l.price, address: l.address, city: l.city,
        bedrooms: l.bedrooms, bathrooms: l.bathrooms, sqft: l.sqft,
        pricePerSqft: Math.round(l.price / l.sqft), propertyType: l.propertyType,
      }));
      return JSON.stringify({ count: results.length, listings: mapped });
    }

    case "get_listing_details": {
      const listing = storage.getListing(args.listingId);
      if (!listing) return JSON.stringify({ error: "Listing not found" });
      return JSON.stringify(listing);
    }

    case "calculate_closing_costs": {
      const price = args.salePrice;
      const loan = args.loanAmount || price * 0.8;
      const role = args.role || "buyer";
      if (role === "buyer") {
        const docStampsMortgage = loan * 0.0035;
        const intangibleTax = loan * 0.002;
        const titleInsurance = (Math.min(price, 100000) * 5.75 + Math.max(0, Math.min(price, 1000000) - 100000) * 5.0 + Math.max(0, price - 1000000) * 2.5) / 1000;
        const lenderFees = loan * 0.01;
        const prepaid = price * 0.008;
        const recording = 200;
        const survey = 400;
        const total = docStampsMortgage + intangibleTax + titleInsurance + lenderFees + prepaid + recording + survey;
        return JSON.stringify({
          role: "buyer", salePrice: price, loanAmount: loan,
          breakdown: { docStampsMortgage: Math.round(docStampsMortgage), intangibleTax: Math.round(intangibleTax), titleInsurance: Math.round(titleInsurance), lenderFees: Math.round(lenderFees), prepaidTaxesInsurance: Math.round(prepaid), recording, survey },
          total: Math.round(total), percentOfPrice: (total / price * 100).toFixed(1) + "%",
        });
      } else {
        const docStampsDeed = price * 0.007;
        const titleInsurance = (Math.min(price, 100000) * 5.75 + Math.max(0, Math.min(price, 1000000) - 100000) * 5.0) / 1000;
        const platformFee = price * 0.01;
        const total = docStampsDeed + titleInsurance + platformFee;
        return JSON.stringify({
          role: "seller", salePrice: price,
          breakdown: { docStampsDeed: Math.round(docStampsDeed), titleInsurance: Math.round(titleInsurance), platformFee: Math.round(platformFee) },
          total: Math.round(total), percentOfPrice: (total / price * 100).toFixed(1) + "%",
        });
      }
    }

    case "calculate_monthly_payment": {
      const p = args.price;
      const dp = (args.downPaymentPercent || 20) / 100;
      const rate = (args.interestRate || 7.0) / 100 / 12;
      const n = (args.termYears || 30) * 12;
      const loanAmt = p * (1 - dp);
      const pi = Math.round(loanAmt * rate * Math.pow(1 + rate, n) / (Math.pow(1 + rate, n) - 1));
      const tax = Math.round((args.propertyTax || p * 0.015) / 12);
      const ins = Math.round((args.insuranceAnnual || 4000) / 12);
      const hoa = args.hoaMonthly || 0;
      const pmi = dp < 0.2 ? Math.round(loanAmt * 0.005 / 12) : 0;
      const total = pi + tax + ins + hoa + pmi;
      return JSON.stringify({
        price: p, downPayment: Math.round(p * dp), loanAmount: Math.round(loanAmt),
        monthly: { principalAndInterest: pi, propertyTax: tax, insurance: ins, hoa, pmi, total },
      });
    }

    case "estimate_offer_price": {
      const lp = args.listingPrice;
      const dom = args.daysOnMarket || 30;
      const market = args.marketCondition || "balanced";
      const condition = args.propertyCondition || "good";
      let adjustment = 0;
      if (market === "buyers") adjustment -= 0.03;
      if (market === "sellers") adjustment += 0.02;
      if (dom > 60) adjustment -= 0.03;
      if (dom > 90) adjustment -= 0.02;
      if (condition === "needs_work") adjustment -= 0.05;
      if (condition === "excellent") adjustment += 0.02;
      const suggested = Math.round(lp * (1 + adjustment) / 1000) * 1000;
      const low = Math.round(suggested * 0.97 / 1000) * 1000;
      const high = Math.round(suggested * 1.02 / 1000) * 1000;
      return JSON.stringify({
        listingPrice: lp, suggestedOffer: suggested, range: { low, high },
        adjustment: (adjustment * 100).toFixed(1) + "%",
        rationale: `Based on ${dom} days on market, ${market} market, ${condition} condition.`,
      });
    }

    case "calculate_savings": {
      const sp = args.salePrice;
      const tradRate = (args.traditionalRate || 6) / 100;
      const tradFee = Math.round(sp * tradRate);
      const platformFee = Math.round(sp * 0.01);
      const savings = tradFee - platformFee;
      return JSON.stringify({
        salePrice: sp, traditionalFee: tradFee, traditionalRate: tradRate * 100 + "%",
        homeDirectFee: platformFee, homeDirectRate: "1%", savings,
        savingsPercent: ((savings / sp) * 100).toFixed(1) + "%",
      });
    }

    case "compare_properties": {
      const ids = args.listingIds || [];
      const listings = ids.map((id: number) => storage.getListing(id)).filter(Boolean);
      const comparison = listings.map((l: any) => ({
        id: l.id, title: l.title, price: l.price, pricePerSqft: Math.round(l.price / l.sqft),
        bedrooms: l.bedrooms, bathrooms: l.bathrooms, sqft: l.sqft,
        yearBuilt: l.yearBuilt, propertyType: l.propertyType,
        hoaFee: l.hoaFee, city: l.city, address: l.address,
      }));
      return JSON.stringify({ properties: comparison, count: comparison.length });
    }

    case "check_transaction_status": {
      const txn = storage.getTransaction(args.transactionId);
      if (!txn) return JSON.stringify({ error: "Transaction not found" });
      return JSON.stringify({
        id: txn.id, status: txn.status,
        escrowStatus: txn.escrowStatus, titleStatus: txn.titleStatus,
        inspectionStatus: txn.inspectionStatus, appraisalStatus: txn.appraisalStatus,
        closingDate: txn.closingDate,
      });
    }

    case "get_inspection_checklist": {
      const age = new Date().getFullYear() - (args.yearBuilt || 2000);
      const checklist: string[] = [
        "Roof condition and remaining life",
        "HVAC system — age, service records, operation test",
        "Electrical panel — capacity, condition, code compliance",
        "Plumbing — water pressure, drain speed, pipe material",
        "Foundation — cracks, settling, moisture intrusion",
        "Water heater — age, capacity, condition",
        "Windows and doors — seals, operation, glass condition",
        "Attic — insulation, ventilation, moisture",
      ];
      if (age > 15) checklist.push("Roof replacement timeline (FL insurers often require roof under 15-20 years)");
      if (age > 20) checklist.push("Galvanized plumbing check (may need replacement)");
      if (age > 30) checklist.push("4-Point inspection (required for insurance)");
      if (age > 30) checklist.push("Aluminum wiring check (fire hazard, may need remediation)");
      if (args.yearBuilt && args.yearBuilt >= 2006 && args.yearBuilt <= 2009) checklist.push("Chinese drywall inspection (sulfur smell, corroded copper)");
      checklist.push("Wind mitigation report (saves 20-45% on insurance)");
      checklist.push("WDO/termite inspection");
      checklist.push("Radon test (48-hour test)");
      if (args.city && ["tampa", "pasco", "hernando", "hillsborough"].some(c => (args.city || "").toLowerCase().includes(c))) {
        checklist.push("Sinkhole assessment (high-risk area)");
      }
      return JSON.stringify({ yearBuilt: args.yearBuilt, homeAge: age, checklist, totalItems: checklist.length });
    }

    case "calculate_net_proceeds": {
      const sp = args.salePrice;
      const mortgage = args.mortgageBalance || 0;
      const repairs = args.repairCredits || 0;
      const docStamps = Math.round(sp * 0.007);
      const titleIns = Math.round((Math.min(sp, 100000) * 5.75 + Math.max(0, Math.min(sp, 1000000) - 100000) * 5.0) / 1000);
      const platformFee = Math.round(sp * 0.01);
      const totalCosts = docStamps + titleIns + platformFee + repairs;
      const net = sp - mortgage - totalCosts;
      return JSON.stringify({
        salePrice: sp, mortgagePayoff: mortgage, repairCredits: repairs,
        costs: { docStamps, titleInsurance: titleIns, platformFee },
        totalCosts, netProceeds: net,
      });
    }

    case "get_market_analysis": {
      const allListings = storage.getListings().filter((l: any) => l.status === "active");
      let relevant = allListings;
      if (args.city) relevant = relevant.filter((l: any) => l.city.toLowerCase().includes(args.city.toLowerCase()));
      if (args.propertyType) relevant = relevant.filter((l: any) => l.propertyType === args.propertyType);
      if (relevant.length === 0) return JSON.stringify({ city: args.city, message: "No listings found for analysis" });
      const prices = relevant.map((l: any) => l.price);
      const ppsf = relevant.map((l: any) => l.price / l.sqft);
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
      return JSON.stringify({
        city: args.city || "All", listingCount: relevant.length,
        avgPrice: Math.round(avg(prices)), medianPrice: Math.round(median(prices)),
        avgPricePerSqft: Math.round(avg(ppsf)), medianPricePerSqft: Math.round(median(ppsf)),
        priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      });
    }

    case "schedule_walkthrough": {
      return JSON.stringify({
        requiresConfirmation: true,
        action: "schedule_walkthrough",
        listingId: args.listingId,
        preferredDate: args.preferredDate || "Next available",
        preferredTime: args.preferredTime || "Flexible",
        cost: "$20",
        message: "Ready to schedule a $20 chaperone-guided walkthrough. Please confirm to proceed.",
      });
    }

    case "draft_offer": {
      const listing = storage.getListing(args.listingId);
      if (!listing) return JSON.stringify({ error: "Listing not found" });
      return JSON.stringify({
        requiresConfirmation: true,
        action: "draft_offer",
        listing: { id: listing.id, title: listing.title, price: listing.price, address: listing.address },
        offer: {
          amount: args.amount,
          financingType: args.financingType || "conventional",
          downPaymentPercent: args.downPaymentPercent || 20,
          earnestMoney: args.earnestMoney || Math.round(args.amount * 0.01),
          closingDays: args.closingDays || 30,
          contingencies: args.contingencies || ["Inspection", "Financing", "Appraisal"],
          message: args.message || "",
        },
        message: `Ready to submit offer of $${args.amount.toLocaleString()} on ${listing.title}. Please confirm to proceed.`,
      });
    }

    case "estimate_insurance_cost": {
      const value = args.propertyValue;
      const year = args.yearBuilt || 2000;
      const age = new Date().getFullYear() - year;
      let base = value * 0.01;
      if (age > 30) base *= 1.3;
      else if (age > 20) base *= 1.15;
      if (args.roofAge && args.roofAge > 15) base *= 1.2;
      if (args.hasPool) base += 500;
      const flood = args.floodZone === "A" || args.floodZone === "AE" ? Math.round(value * 0.005) : 0;
      const windMit = Math.round(base * 0.3);
      return JSON.stringify({
        estimatedAnnual: Math.round(base),
        estimatedMonthly: Math.round(base / 12),
        floodInsurance: flood,
        windMitigationSavings: windMit,
        note: "Estimates based on Florida averages. Get quotes from 3+ insurers.",
      });
    }

    case "generate_counter_offer": {
      const current = args.currentOfferAmount;
      const listing = args.listingPrice;
      const role = args.userRole;
      let suggested: number;
      if (role === "seller") {
        const gap = listing - current;
        suggested = Math.round((current + gap * 0.6) / 1000) * 1000;
      } else {
        const gap = listing - current;
        suggested = Math.round((current + gap * 0.4) / 1000) * 1000;
      }
      const credit = args.closingCostCredit || 0;
      return JSON.stringify({
        currentOffer: current, listingPrice: listing, role,
        suggestedCounter: suggested,
        closingCostCredit: credit,
        script: `Counter-offer at $${suggested.toLocaleString()}${credit > 0 ? ` with $${credit.toLocaleString()} closing cost credit` : ""}.`,
      });
    }

    case "get_transaction_documents": {
      const { getDocumentSummary } = await import("./document-orchestrator");
      const summary = getDocumentSummary(args.transactionId);
      return JSON.stringify(summary);
    }

    case "explain_document": {
      const { DOCUMENT_REGISTRY } = await import("./document-orchestrator");
      const docReq = DOCUMENT_REGISTRY.find(d => d.name.toLowerCase().includes((args.documentName || "").toLowerCase()));
      if (!docReq) return JSON.stringify({ error: "Document not found in registry", available: DOCUMENT_REGISTRY.map(d => d.name) });
      return JSON.stringify({
        name: docReq.name,
        type: docReq.documentType,
        stage: docReq.stage,
        signers: docReq.signers,
        priority: docReq.priority,
        explanation: docReq.explanation,
        description: docReq.description,
      });
    }

    case "send_documents_for_signing": {
      const { sendDocumentsForSigning } = await import("./document-orchestrator");
      return JSON.stringify({
        requiresConfirmation: true,
        action: "send_documents_for_signing",
        transactionId: args.transactionId,
        documentNames: args.documentNames,
        message: `Ready to send ${(args.documentNames || []).length} document(s) for e-signature: ${(args.documentNames || []).join(", ")}. Please confirm.`,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
