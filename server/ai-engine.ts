/**
 * HomeDirectAI Unified AI Engine
 * Provider-agnostic LLM integration with automatic fallback chain:
 *   Together AI → Fireworks AI → DeepSeek → Rule-based
 *
 * All three cloud providers use OpenAI-compatible APIs (same request/response format).
 * If only DEEPSEEK_API_KEY is set, behavior is identical to the previous implementation.
 *
 * Features:
 *   - Streaming support (chatStream)
 *   - Retry logic with exponential backoff
 *   - Tool/function calling (chatWithTools)
 *   - Configurable model sizes via AI_MODEL_SIZE
 *   - Confidence scoring with escalation (chatWithConfidence)
 *   - Request logging (provider, model, tokens, latency)
 *   - Cost estimation per request
 */

// ── Types & Interfaces ───────────────────────────────────────────────────────

export type ProviderName = "together" | "fireworks" | "deepseek" | "fallback";
export type ModelSize = "small" | "medium" | "large";

export interface AIConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface ChatMessage {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunction;
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ToolCallResponse {
  content: string | null;
  tool_calls: ToolCall[];
}

export interface ConfidenceResult {
  content: string;
  confidence: number;
  escalationNeeded: boolean;
}

export interface RequestLog {
  provider: ProviderName;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  latencyMs: number;
  estimatedCost: number;
  timestamp: Date;
}

// ── Model size configuration ─────────────────────────────────────────────────

const TOGETHER_MODELS: Record<ModelSize, string> = {
  small: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  medium: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  large: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
};

const FIREWORKS_MODELS: Record<ModelSize, string> = {
  small: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  medium: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  large: "accounts/fireworks/models/llama-v3p1-405b-instruct",
};

// Cost per 1K tokens (input / output) — rough estimates in USD
const COST_PER_1K_TOKENS: Record<ProviderName, { input: number; output: number }> = {
  together: { input: 0.0002, output: 0.0002 },
  fireworks: { input: 0.0002, output: 0.0002 },
  deepseek: { input: 0.00014, output: 0.00028 },
  fallback: { input: 0, output: 0 },
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function getModelSize(): ModelSize {
  const size = (process.env.AI_MODEL_SIZE || "small").toLowerCase();
  if (size === "medium" || size === "large") return size;
  return "small";
}

/**
 * Detect which provider to use based on available environment variables.
 * Priority: Together AI → Fireworks AI → DeepSeek → rule-based fallback
 *
 * Respects AI_MODEL_SIZE ("small" | "medium" | "large") for Together AI
 * and Fireworks AI. DeepSeek always uses "deepseek-chat".
 */
function getProvider(): AIConfig {
  const size = getModelSize();

  if (process.env.TOGETHER_API_KEY) {
    return {
      provider: "together",
      model: process.env.TOGETHER_MODEL || TOGETHER_MODELS[size],
      apiKey: process.env.TOGETHER_API_KEY,
      baseUrl: "https://api.together.xyz/v1",
    };
  }
  if (process.env.FIREWORKS_API_KEY) {
    return {
      provider: "fireworks",
      model: process.env.FIREWORKS_MODEL || FIREWORKS_MODELS[size],
      apiKey: process.env.FIREWORKS_API_KEY,
      baseUrl: "https://api.fireworks.ai/inference/v1",
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: "https://api.deepseek.com",
    };
  }
  return { provider: "fallback", model: "rule-based", apiKey: "", baseUrl: "" };
}

/**
 * Rough token count estimate: ~4 characters per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate estimated cost in USD for a request.
 */
function estimateCost(
  provider: ProviderName,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = COST_PER_1K_TOKENS[provider];
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

/**
 * Log details about a completed request.
 */
function logRequest(log: RequestLog): void {
  console.log(
    `[AI Engine] Provider: ${log.provider} | Model: ${log.model} | ` +
      `Input ~${log.inputTokensEstimate} tokens | Output ~${log.outputTokensEstimate} tokens | ` +
      `Latency: ${log.latencyMs}ms | Est. cost: $${log.estimatedCost.toFixed(6)}`
  );
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level LLM call with retry logic.
 * Retries failed API calls up to 2 times with exponential backoff (1s, 2s).
 * Returns null if provider is "fallback" (no API keys configured).
 * Throws on network/API errors after all retries are exhausted.
 */
async function callLLM(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 800,
  options?: {
    tools?: ToolDefinition[];
    temperature?: number;
  }
): Promise<{ content: string | null; tool_calls?: ToolCall[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  const config = getProvider();

  if (config.provider === "fallback") {
    return { content: null };
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature: options?.temperature ?? 0.7,
  };

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const maxRetries = 2;
  const backoffMs = [1000, 2000];
  let lastError: Error | null = null;

  const inputText = messages.map((m) => m.content).join(" ");
  const inputTokensEstimate = estimateTokens(inputText);
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const statusText = `${config.provider} API error: ${response.status} ${response.statusText}`;
        // Retry on 5xx and 429 (rate limit) errors
        if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
          console.warn(
            `[AI Engine] ${statusText} — retrying (attempt ${attempt + 1}/${maxRetries}) in ${backoffMs[attempt]}ms`
          );
          await sleep(backoffMs[attempt]);
          continue;
        }
        throw new Error(statusText);
      }

      const data = (await response.json()) as any;
      const latencyMs = Date.now() - startTime;
      const message = data.choices?.[0]?.message;
      const outputText = message?.content || "";
      const outputTokensEstimate = data.usage?.completion_tokens || estimateTokens(outputText);
      const actualInputTokens = data.usage?.prompt_tokens || inputTokensEstimate;

      logRequest({
        provider: config.provider,
        model: config.model,
        inputTokensEstimate: actualInputTokens,
        outputTokensEstimate,
        latencyMs,
        estimatedCost: estimateCost(config.provider, actualInputTokens, outputTokensEstimate),
        timestamp: new Date(),
      });

      return {
        content: message?.content || null,
        tool_calls: message?.tool_calls || undefined,
        usage: data.usage || undefined,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.warn(
          `[AI Engine] Request failed — retrying (attempt ${attempt + 1}/${maxRetries}) in ${backoffMs[attempt]}ms:`,
          (error as Error).message
        );
        await sleep(backoffMs[attempt]);
      }
    }
  }

  throw lastError || new Error("callLLM failed after retries");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Primary public interface for all AI features.
 *
 * @param systemPrompt  Full system prompt (base knowledge + context)
 * @param userMessage   The user's current message (will be sanitized)
 * @param history       Previous conversation messages (kept to last 10)
 * @param maxTokens     Max tokens in the response (default 800)
 * @returns             AI response string, or null if no provider is available
 */
export async function chat(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  maxTokens: number = 800
): Promise<string | null> {
  const config = getProvider();

  const sanitized = sanitizeMessage(userMessage);

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: sanitizeMessage(m.content),
    })),
    { role: "user", content: sanitized },
  ];

  try {
    const result = await callLLM(messages, maxTokens);
    if (result.content === null && config.provider === "fallback") {
      console.log(`[AI Engine] No API keys configured — using rule-based fallback`);
    }
    return result.content;
  } catch (error) {
    console.error(`[AI Engine] ${config.provider} call failed:`, error);
    return null;
  }
}

/**
 * Variant of chat() specifically for structured JSON responses.
 * Returns parsed object or null on failure.
 */
export async function chatJSON<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 400
): Promise<T | null> {
  // Add JSON instruction to system prompt
  const jsonSystemPrompt = systemPrompt + "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.";

  const result = await chat(jsonSystemPrompt, userMessage, [], maxTokens);
  if (!result) return null;

  try {
    return JSON.parse(result.replace(/```json\n?|```/g, "").trim()) as T;
  } catch {
    console.error(`[AI Engine] Failed to parse JSON response:`, result.substring(0, 200));
    return null;
  }
}

/**
 * Streaming variant of chat(). Returns a ReadableStream that yields
 * Server-Sent Events (SSE) text chunks as they arrive from the LLM.
 *
 * Each chunk is a string fragment of the assistant's response.
 * The stream closes when the response is complete.
 *
 * Returns null if no provider is configured (fallback mode).
 */
export function chatStream(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  maxTokens: number = 800
): ReadableStream<string> | null {
  const config = getProvider();

  if (config.provider === "fallback") {
    console.log(`[AI Engine] No API keys configured — streaming unavailable in fallback mode`);
    return null;
  }

  const sanitized = sanitizeMessage(userMessage);
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: sanitizeMessage(m.content),
    })),
    { role: "user", content: sanitized },
  ];

  const inputText = messages.map((m) => m.content).join(" ");
  const inputTokensEstimate = estimateTokens(inputText);
  const startTime = Date.now();

  return new ReadableStream<string>({
    async start(controller) {
      const maxRetries = 2;
      const backoffMs = [1000, 2000];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages,
              max_tokens: maxTokens,
              temperature: 0.7,
              stream: true,
            }),
          });

          if (!response.ok) {
            const statusText = `${config.provider} API error: ${response.status} ${response.statusText}`;
            if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
              console.warn(
                `[AI Engine] Stream ${statusText} — retrying (attempt ${attempt + 1}/${maxRetries}) in ${backoffMs[attempt]}ms`
              );
              await sleep(backoffMs[attempt]);
              continue;
            }
            throw new Error(statusText);
          }

          if (!response.body) {
            throw new Error("Response body is null — streaming not supported");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullOutput = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last (possibly incomplete) line in the buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const payload = trimmed.slice(6);
              if (payload === "[DONE]") continue;

              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullOutput += delta;
                  controller.enqueue(delta);
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          }

          const latencyMs = Date.now() - startTime;
          const outputTokensEstimate = estimateTokens(fullOutput);

          logRequest({
            provider: config.provider,
            model: config.model,
            inputTokensEstimate,
            outputTokensEstimate,
            latencyMs,
            estimatedCost: estimateCost(config.provider, inputTokensEstimate, outputTokensEstimate),
            timestamp: new Date(),
          });

          controller.close();
          return;
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxRetries) {
            console.warn(
              `[AI Engine] Stream request failed — retrying (attempt ${attempt + 1}/${maxRetries}) in ${backoffMs[attempt]}ms:`,
              (error as Error).message
            );
            await sleep(backoffMs[attempt]);
          }
        }
      }

      // All retries exhausted
      console.error(`[AI Engine] Stream failed after retries:`, lastError);
      controller.error(lastError || new Error("Stream failed after retries"));
    },
  });
}

/**
 * Send a request with tool/function calling definitions (OpenAI-compatible format).
 *
 * The LLM may respond with text content, tool calls, or both.
 * Returns an object with `content` (string | null) and `tool_calls` (array of tool calls).
 *
 * @param systemPrompt  System prompt for the LLM
 * @param userMessage   User message
 * @param tools         Array of tool definitions in OpenAI format
 * @param history       Previous conversation messages
 * @param maxTokens     Max tokens in the response
 */
export async function chatWithTools(
  systemPrompt: string,
  userMessage: string,
  tools: ToolDefinition[],
  history: Array<ChatMessage> = [],
  maxTokens: number = 800
): Promise<ToolCallResponse> {
  const config = getProvider();

  if (config.provider === "fallback") {
    console.log(`[AI Engine] No API keys configured — tool calling unavailable in fallback mode`);
    return { content: null, tool_calls: [] };
  }

  const sanitized = sanitizeMessage(userMessage);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role,
      content: sanitizeMessage(m.content),
    })),
    { role: "user", content: sanitized },
  ];

  try {
    const result = await callLLM(messages, maxTokens, { tools });
    return {
      content: result.content,
      tool_calls: result.tool_calls || [],
    };
  } catch (error) {
    console.error(`[AI Engine] ${config.provider} tool call failed:`, error);
    return { content: null, tool_calls: [] };
  }
}

/**
 * Ask the LLM to respond along with a self-assessed confidence score (0–1).
 *
 * The response includes:
 *   - `content`: The actual answer text
 *   - `confidence`: A number between 0 and 1
 *   - `escalationNeeded`: True if confidence < 0.6 (answer may need human review)
 *
 * @param systemPrompt  System prompt for the LLM
 * @param userMessage   User message
 * @param history       Previous conversation messages
 * @param maxTokens     Max tokens in the response
 */
export async function chatWithConfidence(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  maxTokens: number = 800
): Promise<ConfidenceResult | null> {
  const confidencePrompt =
    systemPrompt +
    "\n\n" +
    "After providing your response, you MUST add a final line in exactly this format:\n" +
    "CONFIDENCE: <number between 0 and 1>\n" +
    "where 1.0 means you are completely certain and 0.0 means you have no idea. " +
    "Be honest about your confidence level. If you are guessing or unsure, use a low score.";

  const result = await chat(confidencePrompt, userMessage, history, maxTokens);
  if (!result) return null;

  // Parse the confidence score from the response
  const confidenceMatch = result.match(/CONFIDENCE:\s*([\d.]+)\s*$/m);
  let confidence = 0.5; // default if parsing fails

  if (confidenceMatch) {
    const parsed = parseFloat(confidenceMatch[1]);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      confidence = parsed;
    }
  }

  // Strip the confidence line from the content
  const content = result.replace(/\n?CONFIDENCE:\s*[\d.]+\s*$/m, "").trim();

  const escalationNeeded = confidence < 0.6;

  if (escalationNeeded) {
    console.warn(
      `[AI Engine] Low confidence (${confidence.toFixed(2)}) — escalation recommended`
    );
  }

  return { content, confidence, escalationNeeded };
}

/**
 * Returns the name of the currently active provider (for logging/debugging).
 */
export function getActiveProvider(): string {
  return getProvider().provider;
}

/**
 * Returns true if any LLM provider is configured (not rule-based fallback).
 */
export function hasLLMProvider(): boolean {
  return getProvider().provider !== "fallback";
}

// ── Shared utilities ──────────────────────────────────────────────────────────

/**
 * Strip sensitive data before sending to any external API.
 */
export function sanitizeMessage(text: string): string {
  return text
    // SSN patterns
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, "[SSN REDACTED]")
    // Bank account numbers (8–17 digits)
    .replace(/\b\d{8,17}\b/g, "[ACCOUNT REDACTED]")
    // Routing numbers (9 digits)
    .replace(/\b\d{9}\b/g, "[NUMBER REDACTED]")
    // Credit card patterns
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD REDACTED]");
}
