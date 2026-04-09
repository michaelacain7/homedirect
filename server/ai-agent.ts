/**
 * HomeDirectAI Core Agent Loop
 *
 * Turns the LLM from a simple chatbot into an autonomous real estate agent
 * that can reason, plan, and take actions on behalf of users.
 *
 * Architecture:
 *   1. Build a rich system prompt (base knowledge + user context + tool descriptions)
 *   2. Send user message + history + tool definitions to the LLM via chatWithTools()
 *   3. Execute safe tools immediately; queue action tools for user confirmation
 *   4. Feed tool results back to the LLM for a follow-up pass (up to MAX_ITERATIONS)
 *   5. Return a structured AgentResponse with message, actions, confidence, and flags
 *
 * Guardrails:
 *   - Max 5 tool calls per turn
 *   - Max 3 agent loop iterations
 *   - Automatic escalation when legal advice is detected
 *   - Sensitive-data sanitization (handled by ai-engine)
 *   - Rule-based fallback when no LLM provider is configured
 */

import { chatWithTools, hasLLMProvider } from "./ai-engine";
import { getBaseKnowledge } from "./knowledge-base";
import { toolDefinitions, executeTool } from "./ai-tools";

// ── Public interfaces ────────────────────────────────────────────────────────

export interface AgentContext {
  userId: number;
  userRole: "buyer" | "seller" | "chaperone" | "admin";
  userName: string;
  page: string; // current page for context
  transactionId?: number;
  listingId?: number;
  offerId?: number;
}

export interface AgentAction {
  tool: string;
  args: Record<string, any>;
  result?: string;
  status: "executed" | "pending_confirmation" | "failed";
}

export interface AgentResponse {
  message: string;            // The text response to show the user
  actions: AgentAction[];     // Actions that were taken
  pendingActions: AgentAction[]; // Actions that need user confirmation
  confidence: number;         // 0-1 confidence score
  escalate: boolean;          // Whether to escalate to human/attorney
  reasoning?: string;         // Internal reasoning (for debugging/logging)
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TOOL_CALLS_PER_TURN = 5;
const MAX_ITERATIONS = 3;

/**
 * Tools that are safe to execute without user confirmation.
 * These are read-only or computational — they never mutate data or
 * initiate financial/legal actions.
 */
const SAFE_TOOLS = new Set([
  "search_listings",
  "get_listing_details",
  "calculate_closing_costs",
  "calculate_mortgage",
  "compare_listings",
  "get_market_data",
  "get_comps",
  "estimate_home_value",
  "get_transaction_status",
  "get_inspection_summary",
  "get_document_list",
  "calculate_net_proceeds",
  "search_schools",
  "get_neighborhood_info",
  "get_flood_zone",
  "check_hoa_details",
]);

/**
 * Tools that require explicit user confirmation before execution.
 * These create, modify, or initiate real-world processes.
 */
const ACTION_TOOLS = new Set([
  "draft_offer",
  "submit_offer",
  "counter_offer",
  "accept_offer",
  "reject_offer",
  "schedule_walkthrough",
  "schedule_inspection",
  "request_repair_credit",
  "upload_document",
  "send_message",
  "update_listing_price",
  "cancel_transaction",
]);

// ── System prompt ────────────────────────────────────────────────────────────

function buildAgentSystemPrompt(context: AgentContext): string {
  const baseKnowledge = getBaseKnowledge();

  // Build a human-readable tool list for the system prompt so the LLM
  // knows what it can do beyond the structured tool definitions.
  const toolSummaries = toolDefinitions
    .map((t) => `  - ${t.name}: ${t.description}`)
    .join("\n");

  const safeToolList = Array.from(SAFE_TOOLS).join(", ");
  const actionToolList = Array.from(ACTION_TOOLS).join(", ");

  return `${baseKnowledge}

## YOU ARE AN AUTONOMOUS REAL ESTATE AGENT

You are not a chatbot. You are HomeDirectAI's AI real estate agent — you can **take actions**, not just answer questions. When a user asks you to do something, USE YOUR TOOLS to actually do it. Do not answer from memory when real data is available.

### Current Session
- **User:** ${context.userName} (${context.userRole})
- **Page:** ${context.page}
${context.transactionId ? `- **Transaction:** #${context.transactionId}` : ""}
${context.listingId ? `- **Listing:** #${context.listingId}` : ""}
${context.offerId ? `- **Offer:** #${context.offerId}` : ""}

### Available Tools
${toolSummaries}

### Tool Usage Rules

1. **Be proactive.** When a user asks about a property, LOOK IT UP with a tool. When they ask about costs, CALCULATE them. Do not guess or use placeholder numbers — use real data.

2. **Safe tools** (execute immediately, no confirmation needed):
   ${safeToolList}

3. **Action tools** (ALWAYS confirm with the user before executing):
   ${actionToolList}
   For ANY action tool, describe what you intend to do, show the details (amounts, dates, terms), and ask the user to confirm before proceeding.

4. **Financial actions require extra care:**
   - Always show the math before any financial action (offer amounts, closing costs, credits).
   - Present a clear breakdown so the user can verify numbers.
   - Never submit an offer or financial document without explicit user approval.

5. **Legal boundaries:**
   - You may provide general real estate knowledge and Florida-specific guidance.
   - You must NEVER give legal advice. If the user asks a question that requires legal interpretation, recommend they consult a Florida real estate attorney.
   - If the topic involves lawsuits, legal disputes, contract interpretation beyond standard terms, or liability, recommend an attorney.

6. **Wire fraud warning:**
   - Any time money transfers, wire instructions, or closing funds are discussed, include a wire fraud warning: "Always verify wire instructions by phone using a known number — never rely solely on email."

7. **Show your work:**
   - When calculating costs, mortgage payments, or net proceeds, show the formula and the numbers.
   - Use markdown tables or bullet lists for clarity.

8. **Stay in character:**
   - You ARE the agent. Never say "consult an agent" — you are the agent.
   - Be warm, confident, and specific.
   - Keep responses concise (2-4 paragraphs) unless the user asks for detail.
   - Proactively mention what comes next in the process.`;
}

// ── Escalation detection ─────────────────────────────────────────────────────

const ESCALATION_KEYWORDS = [
  "attorney",
  "lawyer",
  "legal advice",
  "sue",
  "lawsuit",
  "litigation",
  "liability",
  "legal action",
  "court order",
  "legal counsel",
];

function shouldEscalate(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// ── Rule-based fallback ──────────────────────────────────────────────────────

function getRuleBasedFallback(message: string, context: AgentContext): AgentResponse {
  const lower = message.toLowerCase();

  let response: string;

  if (lower.includes("offer") || lower.includes("negotiate")) {
    response = `Hi ${context.userName}! To help you with offers and negotiations, I need to look up the property details and comparable sales. On the HomeDirectAI platform, you can make an offer directly from any listing page — I'll guide you through setting the right price, choosing contingencies, and crafting a competitive offer. What property are you interested in?`;
  } else if (lower.includes("closing cost") || lower.includes("how much")) {
    response = `Great question, ${context.userName}! Closing costs in Florida typically run 2-5% of the purchase price for buyers. That includes title insurance (Florida-regulated rates), documentary stamps, recording fees, lender fees, and prepaid taxes/insurance. The big savings with HomeDirectAI is on commission — our 1% fee vs the traditional 5-6% saves sellers thousands. Would you like me to calculate the exact costs for a specific property?`;
  } else if (lower.includes("inspection")) {
    response = `Home inspections are critical, ${context.userName}! In Florida, the standard inspection period is 15 days from the effective date. A general inspection costs $350-$600. For homes over 30 years old, you'll also need a 4-Point Inspection for insurance. I recommend getting a WDO (termite) inspection and wind mitigation report too — the wind mitigation can save you 20-45% on insurance. What would you like to know about inspections?`;
  } else if (lower.includes("mortgage") || lower.includes("loan") || lower.includes("rate")) {
    response = `For financing, ${context.userName}, you have several options: Conventional (3-20% down, 620+ credit), FHA (3.5% down, 580+ credit), VA (0% down for veterans), or USDA (0% down, rural areas). Your debt-to-income ratio should be under 43%. I can calculate your estimated monthly payment for any property — just tell me the price and your expected down payment.`;
  } else if (lower.includes("wire") || lower.includes("transfer") || lower.includes("escrow")) {
    response = `**⚠️ Wire Fraud Warning:** Wire fraud is the #1 cybercrime in real estate. ALWAYS verify wire instructions by calling your title company at a number from their official website — never from an email. Your escrow portal has the wire details, but please verify by phone before sending any funds. How else can I help with closing, ${context.userName}?`;
  } else if (lower.includes("walkthrough") || lower.includes("showing") || lower.includes("tour")) {
    response = `Walkthroughs on HomeDirectAI work through our chaperone model — a local, background-checked chaperone meets you at the property for just $20. They'll unlock the home and walk you through. You can schedule one from any listing page. Would you like to set one up?`;
  } else if (lower.includes("sell") || lower.includes("list my")) {
    response = `Ready to sell, ${context.userName}? With HomeDirectAI, you pay just 1% at closing instead of the traditional 5-6% agent commission. On a $400K home, that saves you about $18,500! To get started, go to the "Sell" page to create your listing. I'll help you price it competitively, write a compelling description, and manage offers. What questions do you have about selling?`;
  } else {
    response = `Hi ${context.userName}! I'm your HomeDirectAI real estate agent. I can help you with:\n\n- **Search & compare** listings and neighborhoods\n- **Calculate** mortgage payments, closing costs, and net proceeds\n- **Draft & negotiate** offers with real market data\n- **Guide you** through inspections, appraisals, and closing\n- **Schedule** walkthroughs with our chaperone service\n\nWhat would you like to do?`;
  }

  return {
    message: response,
    actions: [],
    pendingActions: [],
    confidence: 0.5,
    escalate: shouldEscalate(message) || shouldEscalate(response),
    reasoning: "Rule-based fallback — no LLM provider configured.",
  };
}

// ── Core agent loop ──────────────────────────────────────────────────────────

export async function runAgent(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
  context: AgentContext,
): Promise<AgentResponse> {
  // Track all actions across iterations
  const executedActions: AgentAction[] = [];
  const pendingActions: AgentAction[] = [];
  let totalToolCalls = 0;

  // ── Fallback: no LLM provider ──────────────────────────────────────────
  if (!hasLLMProvider()) {
    console.log("[Agent] No LLM provider available — using rule-based fallback.");
    return getRuleBasedFallback(message, context);
  }

  // ── Build system prompt ────────────────────────────────────────────────
  const systemPrompt = buildAgentSystemPrompt(context);

  // Mutable history that we'll extend with tool results across iterations.
  // We keep only the last 10 messages from the incoming history to stay
  // within context limits, then append the current user message.
  const workingHistory: Array<{ role: string; content: string }> = [
    ...conversationHistory.slice(-10),
  ];

  let finalMessage: string | null = null;
  let reasoning = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(`[Agent] Iteration ${iteration + 1}/${MAX_ITERATIONS} | Tools used so far: ${totalToolCalls}`);

    // Determine the user message for this iteration. On the first pass we
    // use the actual user message; on subsequent passes we use a synthetic
    // message containing tool results so the LLM can incorporate them.
    const currentUserMessage = iteration === 0
      ? message
      : "Here are the results from the tools you requested. Please use them to provide a complete answer to the user.";

    try {
      const llmResponse = await chatWithTools(
        systemPrompt,
        currentUserMessage,
        iteration === 0 ? workingHistory : workingHistory,
        toolDefinitions,
        1200,
      );

      // ── Process tool calls ─────────────────────────────────────────
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolResultMessages: string[] = [];

        for (const toolCall of llmResponse.toolCalls) {
          // Enforce per-turn tool call limit
          if (totalToolCalls >= MAX_TOOL_CALLS_PER_TURN) {
            console.log(`[Agent] Tool call limit reached (${MAX_TOOL_CALLS_PER_TURN}). Skipping: ${toolCall.name}`);
            toolResultMessages.push(
              `[Tool: ${toolCall.name}] Skipped — maximum tool calls per turn reached.`,
            );
            continue;
          }

          const isSafe = SAFE_TOOLS.has(toolCall.name);
          const isAction = ACTION_TOOLS.has(toolCall.name);

          if (isSafe) {
            // Execute safe tools immediately
            try {
              console.log(`[Agent] Executing safe tool: ${toolCall.name}`, JSON.stringify(toolCall.args));
              const result = await executeTool(toolCall.name, toolCall.args, context.userId);
              totalToolCalls++;

              executedActions.push({
                tool: toolCall.name,
                args: toolCall.args,
                result,
                status: "executed",
              });

              toolResultMessages.push(
                `[Tool: ${toolCall.name}] Result:\n${result}`,
              );
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error(`[Agent] Tool execution failed: ${toolCall.name}`, errorMsg);
              totalToolCalls++;

              executedActions.push({
                tool: toolCall.name,
                args: toolCall.args,
                result: `Error: ${errorMsg}`,
                status: "failed",
              });

              toolResultMessages.push(
                `[Tool: ${toolCall.name}] Error: ${errorMsg}`,
              );
            }
          } else if (isAction) {
            // Queue action tools for user confirmation
            console.log(`[Agent] Queuing action tool for confirmation: ${toolCall.name}`, JSON.stringify(toolCall.args));
            totalToolCalls++;

            pendingActions.push({
              tool: toolCall.name,
              args: toolCall.args,
              status: "pending_confirmation",
            });

            toolResultMessages.push(
              `[Tool: ${toolCall.name}] This action requires user confirmation before execution. Describe what you intend to do and ask the user to confirm.`,
            );
          } else {
            // Unknown tool — treat as safe but log a warning
            console.warn(`[Agent] Unknown tool category: ${toolCall.name}. Attempting execution.`);
            try {
              const result = await executeTool(toolCall.name, toolCall.args, context.userId);
              totalToolCalls++;

              executedActions.push({
                tool: toolCall.name,
                args: toolCall.args,
                result,
                status: "executed",
              });

              toolResultMessages.push(
                `[Tool: ${toolCall.name}] Result:\n${result}`,
              );
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              totalToolCalls++;

              executedActions.push({
                tool: toolCall.name,
                args: toolCall.args,
                result: `Error: ${errorMsg}`,
                status: "failed",
              });

              toolResultMessages.push(
                `[Tool: ${toolCall.name}] Error: ${errorMsg}`,
              );
            }
          }
        }

        // Append the LLM's assistant reply and tool results to the working
        // history so the next iteration has full context.
        if (llmResponse.content) {
          workingHistory.push({ role: "assistant", content: llmResponse.content });
        }
        workingHistory.push({
          role: "user",
          content: toolResultMessages.join("\n\n"),
        });

        reasoning += `Iteration ${iteration + 1}: Called ${llmResponse.toolCalls.length} tool(s): ${llmResponse.toolCalls.map((tc) => tc.name).join(", ")}. `;

        // Continue the loop so the LLM can process tool results
        continue;
      }

      // ── No tool calls — we have our final answer ──────────────────
      finalMessage = llmResponse.content;
      reasoning += `Iteration ${iteration + 1}: Final response generated.`;
      break;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Agent] LLM call failed on iteration ${iteration + 1}:`, errorMsg);
      reasoning += `Iteration ${iteration + 1}: LLM error — ${errorMsg}. `;

      // If the LLM fails on the first iteration, fall back to rule-based
      if (iteration === 0) {
        console.log("[Agent] Falling back to rule-based response after LLM failure.");
        return getRuleBasedFallback(message, context);
      }

      // On later iterations we have partial results — use what we have
      break;
    }
  }

  // ── Assemble final response ────────────────────────────────────────────

  // If we exhausted iterations without a final message, ask the LLM for a
  // summary or fall back.
  if (!finalMessage) {
    finalMessage =
      "I gathered some information but wasn't able to complete my full analysis. Here's what I found so far — let me know if you'd like me to dig deeper into any of these areas.";
    reasoning += " Reached max iterations without a final LLM response.";
  }

  // ── Confidence heuristic ───────────────────────────────────────────────
  // Higher confidence when we used tools successfully (real data) and the
  // response is substantive.
  const successfulTools = executedActions.filter((a) => a.status === "executed").length;
  const failedTools = executedActions.filter((a) => a.status === "failed").length;
  let confidence = 0.7; // baseline from LLM response
  if (successfulTools > 0) confidence += 0.1 * Math.min(successfulTools, 3);
  if (failedTools > 0) confidence -= 0.1 * failedTools;
  if (pendingActions.length > 0) confidence = Math.max(confidence, 0.6);
  confidence = Math.max(0.1, Math.min(1.0, confidence));

  // ── Escalation check ──────────────────────────────────────────────────
  const escalate = shouldEscalate(message) || shouldEscalate(finalMessage);

  // Log summary
  console.log(
    `[Agent] Complete | Tools executed: ${executedActions.length} | Pending: ${pendingActions.length} | Confidence: ${confidence.toFixed(2)} | Escalate: ${escalate}`,
  );

  return {
    message: finalMessage,
    actions: executedActions,
    pendingActions,
    confidence,
    escalate,
    reasoning,
  };
}
