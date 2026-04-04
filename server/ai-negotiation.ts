interface NegotiationParams {
  message: string;
  offer: {
    id: number;
    amount: number;
    status: string;
    counterAmount?: number | null;
    contingencies?: string;
    closingDate?: string | null;
    message?: string | null;
  };
  listing: {
    price: number;
    title: string;
    address: string;
    city: string;
    state: string;
    sqft: number;
    bedrooms: number;
    bathrooms: number;
    yearBuilt?: number | null;
    propertyType: string;
    hoaFee?: number | null;
    taxAmount?: number | null;
  };
  messages: Array<{ senderType: string; content: string }>;
  userRole: "buyer" | "seller";
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function detectIntent(msg: string): string {
  const lower = msg.toLowerCase();

  // Price / comps analysis
  if (
    lower.includes("comp") ||
    lower.includes("market") ||
    lower.includes("fair") ||
    lower.includes("good deal") ||
    lower.includes("worth") ||
    lower.includes("value") ||
    lower.includes("price")
  ) {
    return "price_analysis";
  }

  // Counter offer
  if (
    lower.includes("counter") ||
    lower.includes("counter-offer") ||
    lower.includes("counteroffer") ||
    lower.includes("propose") ||
    (lower.includes("offer") && (lower.includes("draft") || lower.includes("write") || lower.includes("submit")))
  ) {
    return "counter_offer";
  }

  // Inspection
  if (
    lower.includes("inspect") ||
    lower.includes("repair") ||
    lower.includes("condition") ||
    lower.includes("fix") ||
    lower.includes("damage") ||
    lower.includes("issue") ||
    lower.includes("problem")
  ) {
    return "inspection";
  }

  // Closing timeline
  if (
    lower.includes("close") ||
    lower.includes("closing") ||
    lower.includes("timeline") ||
    lower.includes("expedit") ||
    lower.includes("fast") ||
    lower.includes("quick") ||
    lower.includes("date")
  ) {
    return "closing_timeline";
  }

  // Contingencies
  if (
    lower.includes("contingenc") ||
    lower.includes("financing") ||
    lower.includes("appraisal") ||
    lower.includes("waiv") ||
    lower.includes("clause") ||
    lower.includes("condition")
  ) {
    return "contingencies";
  }

  // Closing costs / financial calculations
  if (
    lower.includes("cost") ||
    lower.includes("fee") ||
    lower.includes("save") ||
    lower.includes("saving") ||
    lower.includes("calculat") ||
    lower.includes("afford") ||
    lower.includes("mortgage") ||
    lower.includes("down payment")
  ) {
    return "financial_calc";
  }

  // What happens next
  if (
    lower.includes("next") ||
    lower.includes("step") ||
    lower.includes("process") ||
    lower.includes("happen") ||
    lower.includes("explain") ||
    lower.includes("what do") ||
    lower.includes("what should")
  ) {
    return "process_explain";
  }

  // Status / documents
  if (
    lower.includes("status") ||
    lower.includes("document") ||
    lower.includes("sign") ||
    lower.includes("paper")
  ) {
    return "status_docs";
  }

  return "general";
}

function getRuleBasedResponse(params: NegotiationParams): string {
  const { message, offer, listing, messages } = params;
  const intent = detectIntent(message);

  const offerPct = ((offer.amount - listing.price) / listing.price) * 100;
  const offerPctAbs = Math.abs(offerPct);
  const isBelow = offer.amount < listing.price;
  const pricePerSqft = Math.round(listing.price / listing.sqft);
  const offerPerSqft = Math.round(offer.amount / listing.sqft);
  const agentFee6pct = listing.price * 0.06;
  const platformFee = listing.price * 0.01;
  const savings = agentFee6pct - platformFee;
  const conversationLength = messages.length;

  switch (intent) {
    case "price_analysis": {
      const dealQuality =
        offerPctAbs < 2
          ? "essentially at asking price"
          : offerPctAbs < 5
          ? "a reasonable offer that may be accepted with minor negotiation"
          : offerPctAbs < 10
          ? "below market — there is room to negotiate but expect pushback"
          : "a significant lowball — the seller is likely to counter or reject unless the property has been sitting";

      return `**Market Analysis for ${listing.title}**

Your offer of ${formatPrice(offer.amount)} is ${isBelow ? offerPctAbs.toFixed(1) + "% below" : offerPctAbs.toFixed(1) + "% above"} the listing price of ${formatPrice(listing.price)} — ${dealQuality}.

**Price per Square Foot:**
• Listing asks: $${pricePerSqft}/sqft  
• Your offer: $${offerPerSqft}/sqft  
• For ${listing.city}, ${listing.bedrooms}BR/${listing.bathrooms}BA ${listing.propertyType.replace("_", " ")} properties, $${pricePerSqft - 20}–$${pricePerSqft + 30}/sqft is a typical range.

${listing.yearBuilt ? `**Age Factor:** Built in ${listing.yearBuilt} (${new Date().getFullYear() - listing.yearBuilt} years old). Older homes may have deferred maintenance — use that in your inspection negotiation.` : ""}

**My Recommendation:** ${
  offerPct < -10
    ? `Consider coming up to around ${formatPrice(offer.amount * 1.04)} to show good faith while staying below ask.`
    : offerPct < -3
    ? `Your offer is competitive. Request the seller cover $${Math.round(listing.price * 0.015).toLocaleString()} in closing costs to offset the difference.`
    : `You're in a strong negotiating position. Focus on contingencies and closing timeline rather than price.`
}`;
    }

    case "counter_offer": {
      // Extract a specific price from the message if mentioned
      const priceMatch = message.match(/\$?([\d,]+)/);
      let targetPrice = offer.amount;
      if (priceMatch) {
        const extracted = parseFloat(priceMatch[1].replace(/,/g, ""));
        if (extracted > 100000) targetPrice = extracted;
      }

      const suggestedCounter = Math.round(offer.amount * 1.02 / 1000) * 1000;
      const midpoint = Math.round((offer.amount + listing.price) / 2 / 1000) * 1000;

      return `**Counter-Offer Strategy**

${
  targetPrice !== offer.amount
    ? `**Your Target: ${formatPrice(targetPrice)}**\nThis is ${(((targetPrice - listing.price) / listing.price) * 100).toFixed(1)}% ${targetPrice < listing.price ? "below" : "above"} the asking price.`
    : `**Current offer:** ${formatPrice(offer.amount)} | **Listing price:** ${formatPrice(listing.price)}`
}

**Suggested counter-offer script:**

"We are pleased to offer ${formatPrice(targetPrice !== offer.amount ? targetPrice : suggestedCounter)} for the property at ${listing.address}. This reflects current market conditions for comparable ${listing.bedrooms}BR properties in ${listing.city}. We are pre-approved, motivated buyers who can close in 30 days. We request the seller contribute ${formatPrice(Math.min(listing.price * 0.02, 8000))} toward closing costs."

**Three levels to consider:**
1. **Aggressive:** ${formatPrice(offer.amount)} (current) — maximum savings
2. **Balanced:** ${formatPrice(suggestedCounter)} — shows good faith
3. **Competitive:** ${formatPrice(midpoint)} — likely to secure acceptance

Would you like me to formally draft one of these?`;
    }

    case "inspection": {
      const creditEstimate = Math.round(listing.price * 0.015);
      return `**Inspection Strategy**

Your offer already includes an inspection contingency — excellent. Here's how to use it effectively:

**Standard inspection timeline:**
• Home inspection: within 10 days of acceptance
• Radon test: 48 hours (important in FL for mitigation)
• WDO (termite) inspection: required for FHA/VA loans
• Roof inspection: strongly recommended for homes ${listing.yearBuilt && new Date().getFullYear() - listing.yearBuilt > 15 ? "over 15 years old like this one" : ""}

**Negotiation leverage after inspection:**
• Ask for a seller credit of ${formatPrice(creditEstimate)} (≈1.5% of purchase price) to cover repairs rather than requiring them to fix items
• Seller credits reduce your out-of-pocket closing costs
• Any defect over $500 is worth documenting and requesting repair/credit for

**What to look for at ${listing.title}:**
${listing.yearBuilt && new Date().getFullYear() - listing.yearBuilt > 20 ? "• Electrical panel (older homes often need updates)\n• Plumbing (galvanized pipes may need replacement)\n• HVAC systems (check age and service records)\n" : ""}• Roof condition and remaining life
• Foundation for any settling or cracks
• Water intrusion or mold signs
• Pool/dock equipment (if applicable)

**If significant issues are found:** You can (1) request repairs, (2) request a price reduction, or (3) walk away with your earnest money back.`;
    }

    case "closing_timeline": {
      const daysToClose = offer.closingDate
        ? Math.ceil((new Date(offer.closingDate).getTime() - Date.now()) / 86400000)
        : 30;

      return `**Closing Timeline Analysis**

**Your current closing date:** ${offer.closingDate || "30 days from acceptance"} (approximately ${daysToClose} days away)

**Standard timeline breakdown:**
• Days 1–3: Executed contract, earnest money deposit due
• Days 1–10: Home inspection window
• Days 1–14: Appraisal ordered by lender
• Days 1–21: Title search & title insurance
• Days 10–25: Lender processing & underwriting
• Days 25–28: Clear to close issued
• Day 30: Closing day

**Expedited closing (21 days):** Possible with cash or pre-underwritten loans. Sellers love fast closes — you can use this to negotiate $${Math.round(listing.price * 0.005).toLocaleString()} off the price.

**Extended closing (45–60 days):** Useful if you need to sell your current home first, but sellers may counter with higher price.

**My advice:** ${
  daysToClose < 21
    ? "Your timeline is very aggressive — make sure your lender can commit to this in writing."
    : daysToClose > 45
    ? "A 45+ day close weakens your offer. Consider tightening to 30 days to stay competitive."
    : "30 days is standard and strong. Your offer is competitive on timeline."
}`;
    }

    case "contingencies": {
      const contingencies = (() => {
        try {
          return JSON.parse(offer.contingencies || "[]") as string[];
        } catch {
          return [];
        }
      })();

      return `**Contingency Analysis**

**Currently included:** ${contingencies.length > 0 ? contingencies.join(", ") : "None specified"}

**Standard contingencies for your protection:**

✅ **Inspection Contingency** (10-day window) — Allows you to back out or renegotiate if inspection reveals major issues. ${contingencies.includes("Inspection") ? "Already included." : "RECOMMEND ADDING."}

✅ **Financing Contingency** (21-day window) — Protects your earnest money if your loan falls through. ${contingencies.includes("Financing") ? "Already included." : "RECOMMEND ADDING."}

✅ **Appraisal Contingency** — If the home appraises below your offer, you can renegotiate or exit. Critical if you're offering above asking price. ${contingencies.includes("Appraisal") ? "Already included." : "RECOMMEND ADDING."}

**Optional contingencies:**
• **Home Sale Contingency** — Only if you need to sell your current home first (weakens offer)
• **Kick-Out Clause** — Seller can continue marketing; you have 72hrs to remove contingency
• **HOA Review** (applies to condos) — Review HOA docs and budget

**Market context:** ${
  listing.city
    ? `In ${listing.city}, most accepted offers retain all three standard contingencies. Waiving appraisal is only advisable if you're offering at or below asking.`
    : "Standard three contingencies are well-accepted in most markets."
}

**Earnest money recommendation:** 1%–2% of purchase price = ${formatPrice(listing.price * 0.01)}–${formatPrice(listing.price * 0.02)}`;
    }

    case "financial_calc": {
      const downPayment20 = listing.price * 0.2;
      const loanAmount = offer.amount - downPayment20;
      const monthlyRate = 0.07 / 12; // ~7% mortgage rate
      const numPayments = 360;
      const monthlyPayment = Math.round(
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
      );
      const estimatedClosingCosts = Math.round(offer.amount * 0.025); // ~2.5%

      return `**Financial Breakdown at ${formatPrice(offer.amount)}**

**Down Payment (20%):** ${formatPrice(downPayment20)}
**Loan Amount:** ${formatPrice(loanAmount)}
**Est. Monthly Payment:** ${formatPrice(monthlyPayment)}/mo (30yr @ 7%)

**Closing Costs Estimate (≈2.5%):** ${formatPrice(estimatedClosingCosts)}
• Lender fees: ${formatPrice(Math.round(offer.amount * 0.01))}
• Title insurance: ${formatPrice(Math.round(offer.amount * 0.005))}
• Prepaid taxes/insurance: ${formatPrice(Math.round(offer.amount * 0.008))}
• Recording fees: ~$500

**HomeDirectAI vs. Traditional Agent:**
• Traditional agent fee (6%): ${formatPrice(listing.price * 0.06)} ❌
• HomeDirectAI fee (1%): ${formatPrice(platformFee)} ✅
• **You save: ${formatPrice(savings)}**

${listing.hoaFee && listing.hoaFee > 0 ? `**Monthly HOA:** $${listing.hoaFee}/month = $${listing.hoaFee * 12}/year` : ""}
${listing.taxAmount ? `**Annual Property Tax:** ${formatPrice(listing.taxAmount)} = ${formatPrice(Math.round(listing.taxAmount / 12))}/month` : ""}

**Total Monthly Housing Cost:**
${formatPrice(monthlyPayment + Math.round((listing.taxAmount || offer.amount * 0.015) / 12) + (listing.hoaFee || 0))}/month (P&I + taxes + HOA)`;
    }

    case "process_explain": {
      const statusMessages: Record<string, string> = {
        pending:
          "Your offer has been submitted and is awaiting seller review. Sellers typically respond within 24–48 hours.",
        countered:
          "The seller has made a counter-offer. You can accept, counter back, or decline.",
        accepted:
          "Your offer was accepted! We're now in the contract phase.",
        rejected:
          "Your offer was declined. You can make a new offer at a higher price or move on.",
      };

      return `**What Happens Next — Your Roadmap to Closing**

**Current status:** ${statusMessages[offer.status] || `Offer is ${offer.status}.`}

**Full process from here to keys:**

${
  offer.status === "pending" || offer.status === "countered"
    ? `1. **Negotiation** (now) — Continue negotiating price & terms via this chat\n2. **Acceptance** — Seller agrees to your offer\n`
    : ""
}${
  ["accepted", "pending", "countered"].includes(offer.status)
    ? `3. **Inspection** (days 1–10 after acceptance) — Schedule home inspection at ~$300–500\n4. **Appraisal** (days 7–14) — Your lender orders an independent appraisal\n5. **Title Search** (days 7–21) — Title company confirms clean ownership history\n6. **Underwriting** (days 14–25) — Lender reviews your full financial package\n7. **Clear to Close** (day 25–28) — Final approval from lender\n8. **Closing Day** (day 30) — Sign documents, wire down payment, get keys! 🏠\n`
    : ""
}
**Documents you'll sign at closing:**
• Purchase Agreement (already generated by HomeDirectAI)
• Seller's Disclosure
• Closing Disclosure (final costs breakdown)
• Deed & Title Transfer

**Your HomeDirectAI savings:** ${formatPrice(savings)} compared to a traditional agent — that's money back in your pocket at closing.

What specific step would you like more detail on?`;
    }

    case "status_docs": {
      return `**Offer & Document Status**

**Your offer:** ${formatPrice(offer.amount)} — Status: ${offer.status.toUpperCase()}

${offer.counterAmount ? `**Seller's counter-offer:** ${formatPrice(offer.counterAmount)}` : ""}

**Documents in your transaction:**
Once your offer is accepted, HomeDirectAI automatically generates:
• ✅ Purchase Agreement (legally binding contract)
• ✅ Seller's Property Disclosure
• 📋 Closing Disclosure (generated at closing)
• 📋 Title Search Report (ordered by title company)
• 📋 Home Inspection Report (after your inspection)

**To sign documents:** They will appear in your dashboard after offer acceptance. Click any document to view and digitally sign.

**Questions about a specific document?** Just ask — I can explain what each one means and what to look for.`;
    }

    default: {
      const intro =
        conversationLength < 3
          ? `Welcome! I'm your AI negotiation agent for ${listing.title} at ${formatPrice(listing.price)}.`
          : `Still here to help with ${listing.title}.`;

      return `${intro}

Your current offer of ${formatPrice(offer.amount)} is ${Math.abs(offerPct).toFixed(1)}% ${isBelow ? "below" : "above"} the asking price of ${formatPrice(listing.price)}.

**I can help you with:**
• 📊 **Market analysis** — "What are the comps? Is this a fair price?"
• 💬 **Counter-offers** — "Draft a counter-offer at $X"
• 🔍 **Inspection advice** — "What should I look for? How do I use inspection results?"
• 📅 **Closing timeline** — "How do we expedite closing?"
• 📋 **Contingencies** — "What contingencies protect me?"
• 💰 **Cost breakdown** — "What are the closing costs? How much will I save?"
• ❓ **Process guidance** — "What happens next?"

What would you like to know?`;
    }
  }
}

async function callOpenAI(params: NegotiationParams): Promise<string> {
  const { message, offer, listing, messages, userRole } = params;

  const systemPrompt = `You are an expert real estate AI negotiation agent helping a ${userRole} with their transaction. 
You have deep knowledge of real estate law, market analysis, negotiation tactics, and the home buying process.
Always provide specific numbers based on the actual listing and offer data provided.
Be concise, practical, and action-oriented. Format responses with markdown when helpful.

CURRENT TRANSACTION:
- Listing: ${listing.title} at ${listing.address}, ${listing.city}, ${listing.state}
- Listing price: $${listing.price.toLocaleString()}
- Property: ${listing.bedrooms}BR/${listing.bathrooms}BA, ${listing.sqft} sqft${listing.yearBuilt ? `, built ${listing.yearBuilt}` : ""}
- Offer amount: $${offer.amount.toLocaleString()} (${(((offer.amount - listing.price) / listing.price) * 100).toFixed(1)}% ${offer.amount < listing.price ? "below" : "above"} asking)
- Offer status: ${offer.status}
${offer.counterAmount ? `- Counter-offer: $${offer.counterAmount.toLocaleString()}` : ""}
- Platform fee: 1% = $${(listing.price * 0.01).toLocaleString()} (saves $${(listing.price * 0.05).toLocaleString()} vs traditional 6% agent)`;

  const conversationHistory = messages.slice(-10).map((m) => ({
    role: m.senderType === "ai" ? "assistant" : "user",
    content: m.content,
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: message },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI API error:", err);
    // Fallback to rule-based on API failure
    return getRuleBasedResponse(params);
  }

  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || getRuleBasedResponse(params);
}

export async function getAINegotiationResponse(
  params: NegotiationParams
): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(params);
  }
  return getRuleBasedResponse(params);
}
