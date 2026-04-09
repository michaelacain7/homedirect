import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle, X, Send, Sparkles, Home, Bot,
  AlertTriangle, CheckCircle2, Wrench, Loader2,
  ChevronDown, ChevronUp,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: AgentAction[];
  pendingActions?: AgentAction[];
  confidence?: number;
  escalate?: boolean;
  streaming?: boolean;
}

interface AgentAction {
  tool: string;
  args: Record<string, any>;
  result?: string;
  status: "executed" | "pending_confirmation" | "failed";
}

export function AIAdvisor() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [showActions, setShowActions] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !hasGreeted) {
      const name = user?.fullName?.split(" ")[0];
      setMessages([{
        role: "assistant",
        content: `Hey${name ? ` ${name}` : ""}! I'm your AI Real Estate Agent — I can search listings, calculate costs, draft offers, analyze deals, and guide you through the entire buying or selling process. What can I help with?`,
        timestamp: new Date(),
      }]);
      setHasGreeted(true);
    }
  }, [isOpen, hasGreeted, user]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));

      // Use the new agent endpoint if logged in, fallback to advisor
      const isLoggedIn = !!user;
      const endpoint = isLoggedIn ? "/api/agent/chat" : "/api/advisor/chat";
      const payload = isLoggedIn
        ? {
            message: text,
            history,
            context: {
              page: location,
              listingId: extractIdFromPath(location, "listing"),
              transactionId: extractIdFromPath(location, "transaction"),
              offerId: extractIdFromPath(location, "negotiate"),
            },
          }
        : {
            message: text,
            history,
            context: { page: location, userRole: user?.role },
          };

      const res = await apiRequest("POST", endpoint, payload);
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        actions: data.actions || [],
        pendingActions: data.pendingActions || [],
        confidence: data.confidence,
        escalate: data.escalate,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I had trouble connecting. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, location, user]);

  const confirmAction = useCallback(async (action: AgentAction, msgIndex: number) => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/agent/confirm-action", {
        action,
        confirmed: true,
      });
      const data = await res.json();

      setMessages(prev => {
        const updated = [...prev];
        const msg = updated[msgIndex];
        if (msg?.pendingActions) {
          msg.pendingActions = msg.pendingActions.map(a =>
            a.tool === action.tool ? { ...a, status: "executed" as const, result: JSON.stringify(data.result) } : a
          );
        }
        return updated;
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Done! ${action.tool === "draft_offer" ? "Your offer has been submitted." : action.tool === "schedule_walkthrough" ? "Your walkthrough has been scheduled." : "Action completed successfully."}`,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I couldn't complete that action. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const declineAction = useCallback((action: AgentAction, msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      const msg = updated[msgIndex];
      if (msg?.pendingActions) {
        msg.pendingActions = msg.pendingActions.filter(a => a.tool !== action.tool);
      }
      return updated;
    });
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "No problem — I've cancelled that action. What else can I help with?",
      timestamp: new Date(),
    }]);
  }, []);

  const suggestedQuestions = user?.role === "seller"
    ? [
        "How should I price my home?",
        "What are my net proceeds?",
        "How does the 1% fee work?",
        "What should I disclose?",
      ]
    : [
        "Search homes in Tampa under $400K",
        "What are closing costs?",
        "Calculate my monthly payment",
        "How do inspections work?",
      ];

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 group"
          aria-label="Talk to AI Agent"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: "3s" }} />
            <div className="relative flex items-center gap-2.5 bg-primary text-primary-foreground pl-4 pr-5 py-3 sm:py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="relative">
                <Home className="h-5 w-5" />
                <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300" />
              </div>
              <span className="font-semibold text-sm whitespace-nowrap">AI Real Estate Agent</span>
            </div>
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed z-50 bg-background border border-border shadow-2xl flex flex-col overflow-hidden bottom-0 right-0 w-full h-[85dvh] rounded-t-2xl sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[600px] sm:rounded-2xl">
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm">AI Real Estate Agent</div>
                <div className="text-xs text-primary-foreground/70">
                  {user ? `${user.role === "seller" ? "Seller" : "Buyer"} mode` : "AI-powered"} • Can take actions
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-white/20 rounded-full p-1.5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Confidence & Escalation indicators */}
                    {msg.role === "assistant" && msg.confidence !== undefined && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {msg.confidence >= 0.8 && (
                          <Badge variant="outline" className="text-[9px] gap-1 text-green-600 border-green-200 bg-green-50">
                            <CheckCircle2 className="h-2.5 w-2.5" /> High confidence
                          </Badge>
                        )}
                        {msg.confidence > 0 && msg.confidence < 0.6 && (
                          <Badge variant="outline" className="text-[9px] gap-1 text-amber-600 border-amber-200 bg-amber-50">
                            <AlertTriangle className="h-2.5 w-2.5" /> Verify with professional
                          </Badge>
                        )}
                        {msg.escalate && (
                          <Badge variant="outline" className="text-[9px] gap-1 text-red-600 border-red-200 bg-red-50">
                            <AlertTriangle className="h-2.5 w-2.5" /> Consult attorney
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions taken */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="ml-2 mt-1">
                    <button
                      onClick={() => setShowActions(showActions === i ? null : i)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Wrench className="h-3 w-3" />
                      {msg.actions.length} tool{msg.actions.length > 1 ? "s" : ""} used
                      {showActions === i ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showActions === i && (
                      <div className="mt-1 space-y-1">
                        {msg.actions.map((a, j) => (
                          <div key={j} className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                            <span className="font-mono">{a.tool}</span>
                            <span className={`ml-1 ${a.status === "executed" ? "text-green-600" : a.status === "failed" ? "text-red-600" : "text-amber-600"}`}>
                              ({a.status})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Pending actions requiring confirmation */}
                {msg.pendingActions && msg.pendingActions.filter(a => a.status === "pending_confirmation").length > 0 && (
                  <div className="ml-2 mt-2 space-y-2">
                    {msg.pendingActions.filter(a => a.status === "pending_confirmation").map((action, j) => (
                      <div key={j} className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Action requires confirmation</span>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                          {action.tool === "draft_offer" && `Submit offer of $${(action.args.amount || 0).toLocaleString()}`}
                          {action.tool === "schedule_walkthrough" && `Schedule a $20 walkthrough`}
                          {!["draft_offer", "schedule_walkthrough"].includes(action.tool) && `Execute: ${action.tool}`}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => confirmAction(action, i)}
                            disabled={isLoading}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => declineAction(action, i)}
                            disabled={isLoading}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}

            {/* Suggested questions */}
            {messages.length <= 1 && !isLoading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium px-1">Try asking:</p>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); }}
                    className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything or tell me what to do..."
                className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="rounded-full h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              AI Real Estate Agent by HomeDirectAI • Not legal or financial advice
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** Extract a numeric ID from a URL path like /listing/5 or /transaction/3 */
function extractIdFromPath(path: string, segment: string): number | undefined {
  const match = path.match(new RegExp(`/${segment}/(\\d+)`));
  return match ? parseInt(match[1]) : undefined;
}
