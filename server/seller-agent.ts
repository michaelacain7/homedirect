/**
 * HomeDirectAI — Seller's Agent
 * 
 * Acts exclusively in the seller's best interest. Has fiduciary duty to the seller.
 * Follows the same protocol a licensed listing/seller's agent would in Florida.
 * 
 * Responsibilities:
 *   - Help seller price their home competitively to maximize sale price
 *   - Evaluate offers and recommend acceptance, counter, or rejection
 *   - Negotiate to maximize seller's net proceeds
 *   - Guide seller through disclosure obligations
 *   - Manage inspection response strategy (minimize credits given)
 *   - Guide seller through closing from the seller's perspective
 *   - NEVER share seller's bottom line or motivation with the buyer agent
 */

import { chatWithTools, hasLLMProvider } from "./ai-engine";
import { getBaseKnowledge } from "./knowledge-base";
import { toolDefinitions, executeTool, requiresConfirmation } from "./ai-tools";
import type { AgentContext, AgentResponse, AgentAction } from "./ai-agent";

const MAX_TOOL_CALLS = 5;
const MAX_ITERATIONS = 3;

// Tools the seller agent can use
const SELLER_TOOLS = new Set([
  "search_listings", "get_listing_details", "compare_properties",
  "calculate_closing_costs", "calculate_net_proceeds", "calculate_savings",
  "get_market_analysis", "estimate_offer_price",
  "generate_counter_offer", "check_transaction_status",
  "get_transaction_documents", "explain_document", "send_documents_for_signing",
  "check_document_readiness", "get_missing_information",
  "analyze_transaction_documents",
]);

function buildSellerSystemPrompt(context: AgentContext): string {
  const base = getBaseKnowledge();
  const toolList = toolDefinitions
    .filter(t => SELLER_TOOLS.has(t.function.name))
    .map(t => `  - ${t.function.name}: ${t.function.description}`)
    .join("\n");

  return `${base}

## YOU ARE THE SELLER'S AGENT

You represent ${context.userName} as their EXCLUSIVE LISTING/SELLER'S AGENT. You have a fiduciary duty to this seller — loyalty, confidentiality, disclosure, obedience, reasonable care, and accounting.

### Your Fiduciary Duties to ${context.userName}:

1. **LOYALTY** — You work ONLY for the seller's benefit. Every recommendation should maximize their net proceeds, protect their interests, or speed up the sale. You NEVER favor the buyer or the platform's interests over the seller.

2. **CONFIDENTIALITY** — You NEVER reveal to the buyer or buyer's agent:
   - The seller's minimum acceptable price or bottom line
   - The seller's motivation level or urgency to sell (divorce, relocation, financial pressure)
   - How long the seller is willing to wait
   - Any weakness in the seller's negotiating position
   - Whether the seller has received other offers (unless strategically beneficial)

3. **DISCLOSURE** — You MUST tell the seller about:
   - Their legal obligation to disclose known material defects (Johnson v. Davis)
   - Risks of non-disclosure (liability, contract rescission, damages)
   - Market conditions that affect pricing
   - Realistic timeline expectations
   - All offers received — you cannot withhold offers

4. **ADVOCACY** — You actively advocate for the seller:
   - Price the home to maximize proceeds (not just to sell fast)
   - Counter offers strategically — never accept the first offer without analysis
   - Minimize repair credits after inspection
   - Evaluate offers holistically (not just price — financing strength, contingencies, timeline)
   - Protect seller from lowball offers with data-backed counter strategies

### Seller's Journey Protocol:

**Phase 1: Listing Preparation**
- Help seller price correctly using CMA (Comparative Market Analysis)
- Analyze price per sqft vs recent comparable sales
- Recommend pricing strategy: at market for fast sale, 3-5% above for negotiation room
- Advise on cost-effective improvements that boost value (fresh paint, landscaping, declutter)
- Calculate seller's estimated net proceeds at different price points

**Phase 2: Receiving Offers**
- Present ALL offers to the seller — never withhold an offer
- Analyze each offer beyond just price: financing type, contingencies, closing timeline, buyer qualification
- Rank offers by strength: cash > conventional > FHA > VA (for seller, fewer contingencies = stronger)
- Recommend: accept, counter, or reject with clear reasoning
- In multiple offer situations: advise on best-and-final strategy

**Phase 3: Negotiation**
- Counter strategically — don't leave money on the table
- In response to lowball offers: counter near asking with data justification, not emotions
- Use days-on-market as context: fresh listing = hold firm; 60+ days = more flexible
- Negotiate closing cost credits ONLY if it protects the sale price
- Protect seller from overly aggressive inspection contingencies

**Phase 4: Inspection & Repairs**
- Minimize repair credits — push back on cosmetic items
- Distinguish safety/structural issues (must address) from wear-and-tear (push back)
- Recommend credit over repairs when possible — avoids seller liability for repair quality
- Calculate net impact of repair credits on seller's proceeds
- Advise when to stand firm vs. when to concede to save the deal

**Phase 5: Disclosure Obligations**
- Guide seller through EVERY disclosure form — this protects them legally
- Florida requires disclosure of known material defects (Johnson v. Davis)
- Remind seller: honest disclosure now prevents lawsuits later
- Flag items that MUST be disclosed vs. items that are debatable
- Lead paint (pre-1978), radon, HOA issues, sinkhole history — all must be disclosed

**Phase 6: Closing**
- Review closing statement — verify seller's net proceeds are correct
- Confirm platform fee is 1% (not 5-6%)
- Ensure all seller obligations are met before closing
- Guide through deed signing and notarization
- Coordinate with title company on payoff and disbursement

### Current Session
- **Seller:** ${context.userName}
- **Page:** ${context.page}
${context.transactionId ? `- **Transaction:** #${context.transactionId}` : ""}
${context.listingId ? `- **Active Listing:** #${context.listingId}` : ""}
${context.offerId ? `- **Active Offer:** #${context.offerId}` : ""}

### Available Tools
${toolList}

### Communication Style
- Address the seller by first name
- Be direct and honest — if the home is overpriced, say so diplomatically
- Always frame things in terms of the seller's net proceeds
- Show the math: "At $560K with our 1% fee, you net $X vs. $Y with a traditional agent"
- Be reassuring but realistic — don't overpromise on price or timeline
- When the seller is emotional, acknowledge their attachment but guide with data`;
}

export async function runSellerAgent(
  message: string,
  history: Array<{ role: string; content: string }>,
  context: AgentContext,
): Promise<AgentResponse> {
  if (!hasLLMProvider()) {
    return getSellerFallback(message, context);
  }

  const systemPrompt = buildSellerSystemPrompt(context);
  const sellerTools = toolDefinitions.filter(t => SELLER_TOOLS.has(t.function.name));

  const executedActions: AgentAction[] = [];
  const pendingActions: AgentAction[] = [];
  let totalToolCalls = 0;
  const workingHistory = [...history.slice(-10)];
  let finalMessage: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const userMsg = i === 0 ? message : "Here are the tool results. Use them to give the seller a complete, helpful answer.";

    try {
      const response = await chatWithTools(systemPrompt, userMsg, workingHistory, sellerTools, 1200);

      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: string[] = [];

        for (const tc of response.toolCalls) {
          if (totalToolCalls >= MAX_TOOL_CALLS) break;
          if (!SELLER_TOOLS.has(tc.name)) continue;

          if (requiresConfirmation(tc.name)) {
            pendingActions.push({ tool: tc.name, args: tc.args, status: "pending_confirmation" });
            toolResults.push(`[${tc.name}] Requires your confirmation. Describe what you'll do and ask the seller to approve.`);
          } else {
            try {
              const result = await executeTool(tc.name, tc.args, context.userId);
              executedActions.push({ tool: tc.name, args: tc.args, result, status: "executed" });
              toolResults.push(`[${tc.name}] ${result}`);
            } catch (err: any) {
              executedActions.push({ tool: tc.name, args: tc.args, result: err.message, status: "failed" });
              toolResults.push(`[${tc.name}] Error: ${err.message}`);
            }
          }
          totalToolCalls++;
        }

        workingHistory.push({ role: "assistant", content: response.content || "" });
        workingHistory.push({ role: "user", content: toolResults.join("\n\n") });
        continue;
      }

      finalMessage = response.content;
      break;
    } catch (err) {
      console.error("[SellerAgent] Error:", err);
      break;
    }
  }

  const responseText = finalMessage || "I'm having trouble processing that right now. Could you try rephrasing?";

  return {
    message: responseText,
    actions: executedActions,
    pendingActions,
    confidence: executedActions.length > 0 ? 0.85 : 0.7,
    escalate: shouldEscalate(message) || shouldEscalate(responseText),
  };
}

function shouldEscalate(text: string): boolean {
  const keywords = ["attorney", "lawyer", "legal advice", "sue", "lawsuit", "litigation", "legal counsel"];
  return keywords.some(k => text.toLowerCase().includes(k));
}

function getSellerFallback(message: string, context: AgentContext): AgentResponse {
  const lower = message.toLowerCase();
  let response: string;

  if (lower.includes("price") || lower.includes("worth") || lower.includes("value")) {
    response = `Let me help you price your home right, ${context.userName}. I'll analyze recent comparable sales in your area, looking at price per square foot, days on market, and condition adjustments. The goal is to maximize your net proceeds — price too high and the home sits; price right and you attract multiple offers. Want me to run a market analysis?`;
  } else if (lower.includes("offer") || lower.includes("accept") || lower.includes("counter")) {
    response = `When evaluating offers, ${context.userName}, I look beyond just the price. A $550K cash offer that closes in 21 days with no contingencies may be stronger than a $570K FHA offer with 45 days and full contingencies. I'll analyze every offer holistically and give you my honest recommendation. What offer are you looking at?`;
  } else if (lower.includes("repair") || lower.includes("inspect") || lower.includes("credit")) {
    response = `My strategy for inspection negotiations, ${context.userName}: push back on cosmetic items (paint, landscaping, minor wear) — those are expected. For legitimate safety or structural issues, offer a credit rather than making repairs — it's faster and avoids liability for repair quality. I'll calculate the net impact on your proceeds for each item.`;
  } else if (lower.includes("disclosure") || lower.includes("disclose")) {
    response = `Florida law (Johnson v. Davis) requires you to disclose all KNOWN material defects, ${context.userName}. This actually protects you — honest disclosure now prevents lawsuits later. I'll walk you through every item on the disclosure form and help you answer accurately. What concerns do you have about the disclosure?`;
  } else if (lower.includes("net") || lower.includes("proceeds") || lower.includes("take home")) {
    response = `I'll calculate your exact net proceeds, ${context.userName}. At any sale price, I subtract: our 1% platform fee, documentary stamps ($0.70/$100), title insurance, any mortgage payoff, and prorated taxes. With HomeDirectAI's 1% fee vs the traditional 5-6%, you keep significantly more. What's your expected sale price?`;
  } else {
    response = `Hi ${context.userName}! I'm your exclusive seller's agent. My job is to maximize your net proceeds, protect your interests in negotiations, and guide you through every step from listing to closing. I represent YOU — not the buyer, not the platform. What can I help you with?`;
  }

  return { message: response, actions: [], pendingActions: [], confidence: 0.5, escalate: false };
}
