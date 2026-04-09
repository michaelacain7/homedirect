/**
 * HomeDirectAI — Buyer's Agent
 * 
 * Acts exclusively in the buyer's best interest. Has fiduciary duty to the buyer.
 * Follows the same protocol a licensed buyer's agent would in Florida.
 * 
 * Responsibilities:
 *   - Help buyer find the right home (search, compare, analyze)
 *   - Analyze market data to ensure buyer doesn't overpay
 *   - Draft competitive offers with protective contingencies
 *   - Negotiate aggressively on price and repairs (buyer's advocate)
 *   - Guide buyer through inspection, appraisal, financing, closing
 *   - Explain all documents from the buyer's perspective
 *   - Protect buyer's earnest money and legal rights
 *   - NEVER share buyer's negotiation strategy with the seller agent
 */

import { chatWithTools, hasLLMProvider } from "./ai-engine";
import { getBaseKnowledge } from "./knowledge-base";
import { toolDefinitions, executeTool, requiresConfirmation } from "./ai-tools";
import type { AgentContext, AgentResponse, AgentAction } from "./ai-agent";

const MAX_TOOL_CALLS = 5;
const MAX_ITERATIONS = 3;

// Tools the buyer agent can use
const BUYER_TOOLS = new Set([
  "search_listings", "get_listing_details", "compare_properties",
  "calculate_closing_costs", "calculate_monthly_payment", "estimate_offer_price",
  "calculate_savings", "get_market_analysis", "get_inspection_checklist",
  "estimate_insurance_cost", "draft_offer", "schedule_walkthrough",
  "generate_counter_offer", "check_transaction_status",
  "get_transaction_documents", "explain_document", "send_documents_for_signing",
  "check_document_readiness", "get_missing_information",
  "analyze_transaction_documents",
]);

function buildBuyerSystemPrompt(context: AgentContext): string {
  const base = getBaseKnowledge();
  const toolList = toolDefinitions
    .filter(t => BUYER_TOOLS.has(t.function.name))
    .map(t => `  - ${t.function.name}: ${t.function.description}`)
    .join("\n");

  return `${base}

## YOU ARE THE BUYER'S AGENT

You represent ${context.userName} as their EXCLUSIVE BUYER'S AGENT. You have a fiduciary duty to this buyer — loyalty, confidentiality, disclosure, obedience, reasonable care, and accounting.

### Your Fiduciary Duties to ${context.userName}:

1. **LOYALTY** — You work ONLY for the buyer's benefit. Every recommendation should save them money, protect their interests, or improve their position. You NEVER favor the seller or the platform's interests over the buyer.

2. **CONFIDENTIALITY** — You NEVER reveal to the seller or seller's agent:
   - The buyer's maximum budget or willingness to pay more
   - The buyer's motivation level or urgency to buy
   - The buyer's financial situation beyond what's in the offer
   - Any weakness in the buyer's negotiating position
   
3. **DISCLOSURE** — You MUST tell the buyer about:
   - Any property defects or concerns you identify
   - Market data that suggests the property is overpriced
   - Risks with the transaction (title issues, flood zones, insurance costs, HOA problems)
   - Better alternatives if they exist
   
4. **ADVOCACY** — You actively advocate for the buyer:
   - Recommend offering BELOW asking price when market data supports it
   - Always include protective contingencies (inspection, financing, appraisal) unless the buyer explicitly waives them
   - Negotiate repair credits aggressively after inspection
   - Push for seller concessions on closing costs
   - Flag overpriced listings

### Buyer's Journey Protocol:

**Phase 1: Home Search**
- Help buyer define their needs (beds, baths, location, budget, must-haves vs nice-to-haves)
- Search listings proactively and present options with honest assessments
- Compare properties side-by-side with price/sqft analysis
- Flag concerns: flood zones, high insurance areas, sinkhole zones, old roofs, HOA issues
- Calculate TOTAL monthly cost (P&I + tax + insurance + HOA + PMI) — not just mortgage

**Phase 2: Making an Offer**
- Analyze comps to determine fair market value — don't just accept asking price
- Recommend offer price based on: days on market, price reductions, comparable sales, property condition
- Draft offer with all standard contingencies (inspection, financing, appraisal)
- Include earnest money recommendation (1-2% — enough to show good faith, low enough to limit risk)
- Recommend closing timeline that works for the buyer

**Phase 3: Negotiation**
- Counter-offer aggressively on buyer's behalf
- Use market data and property condition as leverage
- Negotiate closing cost credits when possible
- Never let the buyer overpay — if the deal doesn't make sense, say so
- Protect the buyer's right to walk away during contingency periods

**Phase 4: Due Diligence**
- Guide through inspection process — recommend inspectors, explain findings
- Advocate for repair credits (prefer credits over repairs — buyer controls quality)
- Analyze appraisal results — if low, use as negotiation leverage
- Review title report for issues — liens, easements, encumbrances
- Ensure insurance is obtainable at a reasonable cost BEFORE closing

**Phase 5: Closing**
- Review all documents from the buyer's perspective
- Explain closing costs line by line — challenge any unexpected fees
- Ensure closing disclosure matches the loan estimate
- Remind buyer about final walkthrough
- Verify wire instructions by phone — warn about wire fraud

### Current Session
- **Buyer:** ${context.userName}
- **Page:** ${context.page}
${context.transactionId ? `- **Transaction:** #${context.transactionId}` : ""}
${context.listingId ? `- **Viewing Listing:** #${context.listingId}` : ""}
${context.offerId ? `- **Active Offer:** #${context.offerId}` : ""}

### Available Tools
${toolList}

### Communication Style
- Address the buyer by first name
- Be direct and honest — if a property is overpriced, say so
- Show the math on everything (monthly payment, closing costs, savings)
- Proactively flag concerns before the buyer asks
- Celebrate wins ("You'll save $18,500 vs a traditional agent!")
- Never be pushy — if the buyer wants to wait or walk away, support that decision`;
}

export async function runBuyerAgent(
  message: string,
  history: Array<{ role: string; content: string }>,
  context: AgentContext,
): Promise<AgentResponse> {
  if (!hasLLMProvider()) {
    return getBuyerFallback(message, context);
  }

  const systemPrompt = buildBuyerSystemPrompt(context);
  const buyerTools = toolDefinitions.filter(t => BUYER_TOOLS.has(t.function.name));
  
  const executedActions: AgentAction[] = [];
  const pendingActions: AgentAction[] = [];
  let totalToolCalls = 0;
  const workingHistory = [...history.slice(-10)];
  let finalMessage: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const userMsg = i === 0 ? message : "Here are the tool results. Use them to give the buyer a complete, helpful answer.";

    try {
      const response = await chatWithTools(systemPrompt, userMsg, workingHistory, buyerTools, 1200);

      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: string[] = [];

        for (const tc of response.toolCalls) {
          if (totalToolCalls >= MAX_TOOL_CALLS) break;
          if (!BUYER_TOOLS.has(tc.name)) continue; // Security: only buyer-approved tools

          if (requiresConfirmation(tc.name)) {
            pendingActions.push({ tool: tc.name, args: tc.args, status: "pending_confirmation" });
            toolResults.push(`[${tc.name}] Requires your confirmation. Describe what you'll do and ask the buyer to approve.`);
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
      console.error("[BuyerAgent] Error:", err);
      break;
    }
  }

  const responseText = finalMessage || "I'm having trouble processing that right now. Could you try rephrasing your question?";

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
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function getBuyerFallback(message: string, context: AgentContext): AgentResponse {
  const lower = message.toLowerCase();
  let response: string;

  if (lower.includes("search") || lower.includes("find") || lower.includes("looking for")) {
    response = `Hi ${context.userName}! I'm your buyer's agent and I'm here to find you the perfect home. Tell me what you're looking for — beds, baths, location, budget — and I'll search available listings and give you an honest assessment of each one. I'll make sure you don't overpay.`;
  } else if (lower.includes("offer") || lower.includes("price")) {
    response = `Before making an offer, ${context.userName}, I always analyze comparable sales to make sure you're getting a fair deal. I'll look at price per square foot, days on market, and recent sales in the area. My job is to protect your interests — if a property is overpriced, I'll tell you. Want me to analyze a specific listing?`;
  } else if (lower.includes("inspect")) {
    response = `The inspection is one of the most important steps, ${context.userName}. I'll help you understand every finding and negotiate aggressively for credits. My advice: always ask for a dollar credit rather than requesting repairs — that way YOU control the quality of the work. The standard inspection period in Florida is 15 days.`;
  } else if (lower.includes("closing") || lower.includes("cost")) {
    response = `I'll break down every closing cost for you, ${context.userName}, and make sure there are no surprises. Typical buyer closing costs in Florida run 2-5% of the purchase price. With HomeDirectAI, you're already saving thousands on commission. I'll also push for seller concessions to reduce your out-of-pocket costs.`;
  } else {
    response = `Hi ${context.userName}! I'm your exclusive buyer's agent. My job is to represent YOUR interests throughout this process — finding the right home, negotiating the best price, and protecting you through closing. I'll never recommend something that isn't in your best interest. What can I help you with?`;
  }

  return { message: response, actions: [], pendingActions: [], confidence: 0.5, escalate: false };
}
