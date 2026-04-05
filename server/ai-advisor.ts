/**
 * AI Home Advisor — DeepSeek-powered chat assistant
 * Available on every page, context-aware, with sensitive data filtering
 */

// Strip sensitive data before sending to external API
function sanitizeMessage(text: string): string {
  return text
    // SSN patterns
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, "[SSN REDACTED]")
    // Bank account numbers (8+ digits)
    .replace(/\b\d{8,17}\b/g, "[ACCOUNT REDACTED]")
    // Routing numbers (9 digits)
    .replace(/\b\d{9}\b/g, "[NUMBER REDACTED]")
    // Credit card patterns
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD REDACTED]")
    // Email-looking things that might be personal (keep for context but note it)
    // Don't strip emails — they're needed for context
    ;
}

function buildSystemPrompt(context: {
  page: string;
  userRole?: string;
  userName?: string;
  transactionId?: number;
  listingAddress?: string;
  offerAmount?: number;
  listingPrice?: number;
}): string {
  const { page, userRole, userName, transactionId, listingAddress, offerAmount, listingPrice } = context;

  let pageContext = "";
  switch (true) {
    case page.includes("/transaction") && page.includes("/inspection"):
      pageContext = "The user is in the INSPECTION PORTAL. Help them understand inspection findings, what's serious vs cosmetic, whether to request repairs or credits, and how to negotiate inspection issues.";
      break;
    case page.includes("/transaction") && page.includes("/escrow"):
      pageContext = "The user is in the ESCROW & CLOSING PORTAL. Help with wire transfer questions, closing costs, escrow timelines, and what to expect. ALWAYS warn about wire fraud — tell them to verify instructions by phone.";
      break;
    case page.includes("/transaction") && page.includes("/lender"):
      pageContext = "The user is in the LENDER PORTAL. Help with mortgage questions — rates, loan types (FHA/VA/conventional), PMI, DTI ratios, pre-approval, required documents, and the underwriting process.";
      break;
    case page.includes("/transaction") && page.includes("/appraisal"):
      pageContext = "The user is in the APPRAISAL PORTAL. Help with appraisal questions — how appraisals work, what happens if it comes in low (appraisal gap), comparables, and how to challenge a low appraisal.";
      break;
    case page.includes("/transaction") && page.includes("/title"):
      pageContext = "The user is in the TITLE COMPANY PORTAL. Help with title insurance, title searches, liens, encumbrances, what documents the title company needs, and the closing process.";
      break;
    case page.includes("/transaction"):
      pageContext = "The user is viewing their TRANSACTION HUB — the main closing dashboard. Help them understand their checklist items, what steps come next, and the overall closing timeline.";
      break;
    case page.includes("/negotiate"):
      pageContext = "The user is in the NEGOTIATION CHAT. Help with offer strategy, counter-offers, contingencies, and negotiation tactics.";
      break;
    case page.includes("/listing"):
      pageContext = `The user is viewing a PROPERTY LISTING.${listingPrice ? ` Listing price: $${listingPrice.toLocaleString()}.` : ""} Help with questions about the property, neighborhood, pricing, whether it's a good deal, and how to make an offer.`;
      break;
    case page.includes("/sell"):
      pageContext = "The user is LISTING THEIR HOME for sale. Help with pricing strategy, staging tips, what photos to take, how to write a compelling description, and what to expect.";
      break;
    case page.includes("/dashboard"):
      pageContext = "The user is on their DASHBOARD. Help them understand their offers, walkthroughs, transactions, and what actions they need to take.";
      break;
    case page.includes("/search") || page.includes("/map"):
      pageContext = "The user is BROWSING LISTINGS. Help them with search tips, what to look for in a home, neighborhood questions, and how the buying process works on HomeDirectAI.";
      break;
    case page.includes("/chaperone"):
      pageContext = "The user is in the CHAPERONE section. Help with questions about becoming a chaperone, the application process, how payments work, and what to expect during showings.";
      break;
    default:
      pageContext = "The user is on the HomeDirectAI platform. Help with any real estate questions — buying, selling, the closing process, financing, inspections, or how the platform works.";
  }

  return `You are the HomeDirectAI Home Advisor — a friendly, knowledgeable AI real estate assistant. You help buyers and sellers navigate the entire home buying and selling process.

PLATFORM CONTEXT:
- HomeDirectAI charges just 1% at closing (vs traditional 5-6% agent commission)
- Buyers pay $20 for walkthrough chaperones (local people who guide showings, like DoorDash for real estate)
- AI handles negotiations, contracts, disclosures, and closing coordination
- No traditional real estate agents are involved
${userName ? `- The user's name is ${userName}` : ""}
${userRole ? `- The user is a ${userRole}` : ""}
${transactionId ? `- They have an active transaction (#${transactionId})` : ""}
${listingAddress ? `- Property: ${listingAddress}` : ""}
${offerAmount ? `- Offer amount: $${offerAmount.toLocaleString()}` : ""}

CURRENT PAGE CONTEXT:
${pageContext}

YOUR PERSONALITY:
- Warm, approachable, and encouraging — buying/selling a home is stressful
- Give specific, actionable advice — not vague generalities
- Use simple language — avoid jargon unless explaining it
- When you don't know something specific, say so and suggest who to contact
- Keep responses concise (2-4 paragraphs max) unless the user asks for detail
- If asked about something outside real estate, gently redirect
- NEVER provide legal advice — always recommend consulting an attorney for legal questions
- ALWAYS warn about wire fraud when discussing money transfers
- Proactively mention how HomeDirectAI saves money when relevant (1% vs 5-6%)

IMPORTANT: You do not have access to real MLS data, actual property values, or the user's specific financial information. Be clear about this when relevant. You can provide general market knowledge and guidance.`;
}

export async function getAdvisorResponse(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
  context: {
    page: string;
    userRole?: string;
    userName?: string;
    transactionId?: number;
    listingAddress?: string;
    offerAmount?: number;
    listingPrice?: number;
  }
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    // Fallback: basic rule-based responses when no API key
    return getFallbackResponse(message, context);
  }

  const sanitizedMessage = sanitizeMessage(message);
  const systemPrompt = buildSystemPrompt(context);

  // Build messages array (keep last 10 messages for context)
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-10).map(m => ({
      role: m.role as "user" | "assistant",
      content: sanitizeMessage(m.content),
    })),
    { role: "user", content: sanitizedMessage },
  ];

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: 800,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(`DeepSeek API error: ${response.status}`);
      return getFallbackResponse(message, context);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || getFallbackResponse(message, context);
  } catch (error) {
    console.error("DeepSeek API call failed:", error);
    return getFallbackResponse(message, context);
  }
}

function getFallbackResponse(message: string, context: { page: string }): string {
  const lower = message.toLowerCase();

  if (lower.includes("how") && lower.includes("work")) {
    return "HomeDirectAI handles the entire home buying and selling process — from listing to closing. Sellers list their home and we charge just 1% at closing (saving thousands vs the traditional 5-6% agent commission). Buyers can browse listings, schedule $20 chaperone walkthroughs, and make offers. Our AI handles negotiations, document preparation, and closing coordination. Is there a specific part of the process you'd like to know more about?";
  }
  if (lower.includes("closing cost") || lower.includes("how much")) {
    return "Closing costs typically include your 1% HomeDirectAI fee, title insurance, recording fees, prorated taxes, and any lender fees. For a typical $400K home, buyers can expect $8,000-$12,000 in total closing costs. The big savings is on the commission — you save about $18,000 compared to using a traditional agent. Would you like me to break down the specific costs?";
  }
  if (lower.includes("inspection")) {
    return "A home inspection is one of the most important steps in buying a home. A licensed inspector examines the property's structure, systems, and condition. The inspection typically costs $300-$500 and takes 2-3 hours. After receiving the report, our AI will analyze the findings and help you decide whether to request repairs, credits, or move forward as-is. Do you have specific concerns about the inspection?";
  }
  if (lower.includes("offer") || lower.includes("negotiate")) {
    return "When you're ready to make an offer, our AI analyzes comparable sales, market conditions, and the property's time on market to help you determine a competitive offer price. Once submitted, the AI handles back-and-forth negotiation with the seller. You can ask for comps, suggest counter-offers, or request specific contingencies through the negotiation chat.";
  }
  if (lower.includes("wire") || lower.includes("transfer") || lower.includes("escrow")) {
    return "⚠️ Wire fraud is the #1 cybercrime in real estate. ALWAYS verify wire instructions by calling your title company directly using a phone number from their official website — never from an email. Your escrow portal has the wire details, but please verify by phone before sending any funds. How can I help with the closing process?";
  }
  if (lower.includes("mortgage") || lower.includes("loan") || lower.includes("rate")) {
    return "For mortgage questions, your lender portal has your loan details and required documents. Generally, you'll want to compare rates from at least 3 lenders. A conventional loan with 20% down avoids PMI. FHA loans allow as low as 3.5% down. Your total monthly payment includes principal, interest, property taxes, and homeowner's insurance. Want me to explain any of these in more detail?";
  }
  if (lower.includes("chaperone") || lower.includes("walkthrough") || lower.includes("showing")) {
    return "Our chaperone model is like DoorDash for home tours! When you schedule a walkthrough, a local, background-checked chaperone meets you at the property to guide you through. It costs just $20. They'll unlock the home, walk you through each room, and answer basic questions about the property. Any specific questions about scheduling a walkthrough?";
  }

  return "I'm your HomeDirectAI Home Advisor! I can help with anything related to buying or selling a home — from understanding the closing process and inspections, to mortgage questions and negotiation strategy. Our platform saves you thousands with just a 1% fee at closing. What would you like to know?";
}
