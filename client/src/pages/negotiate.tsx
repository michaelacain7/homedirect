import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Bot, User, Send, ArrowLeft, FileText, DollarSign } from "lucide-react";
import type { Offer, Message, Listing, Document as Doc } from "@shared/schema";

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

export default function Negotiate() {
  const [, params] = useRoute("/negotiate/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);

  const { data: offer } = useQuery<Offer>({
    queryKey: ["/api/offers", params?.id],
    queryFn: () => apiRequest("GET", `/api/offers/${params?.id}`).then(r => r.json()),
    enabled: !!params?.id,
  });

  const { data: listing } = useQuery<Listing>({
    queryKey: ["/api/listings", offer?.listingId],
    queryFn: () => apiRequest("GET", `/api/listings/${offer?.listingId}`).then(r => r.json()),
    enabled: !!offer?.listingId,
  });

  // Detect user role in this negotiation
  const isSeller = listing ? user?.id === listing.sellerId : false;
  const isBuyer = !isSeller;

  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages/offer", params?.id],
    queryFn: () => apiRequest("GET", `/api/messages/offer/${params?.id}`).then(r => r.json()),
    enabled: !!params?.id,
    refetchInterval: 2000,
  });

  const { data: documents = [] } = useQuery<Doc[]>({
    queryKey: ["/api/documents/offer", params?.id],
    queryFn: () => apiRequest("GET", `/api/documents/offer/${params?.id}`).then(r => r.json()),
    enabled: !!params?.id,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", "/api/messages", {
        offerId: parseInt(params?.id || "0"),
        senderId: user?.id,
        senderType: "user",
        content,
      });
    },
    onSuccess: () => {
      setInput("");
      setTimeout(() => refetchMessages(), 1000);
    },
  });

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!user) {
    return <div className="py-20 text-center"><p className="text-sm">Please sign in to view negotiations.</p></div>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col" data-testid="page-negotiate">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} data-testid="button-back-negotiate">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold" data-testid="text-negotiate-title">
                AI Negotiation {listing ? `- ${listing.title}` : ""}
              </h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {offer && <span>Offer: {formatPrice(offer.amount)}</span>}
                {offer && <Badge variant="outline" className="text-[10px]">{offer.status}</Badge>}
                {isSeller ? (
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">Seller View</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800">Buyer View</Badge>
                )}
              </div>
            </div>
          </div>
          {documents.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3 w-3" /> {documents.length} docs
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* AI Welcome */}
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="mx-auto mb-3 h-8 w-8 text-primary" />
              <h2 className="text-sm font-medium">
                {isSeller ? "AI Seller Negotiation Agent" : "AI Buyer Negotiation Agent"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {isSeller
                  ? "I'm managing this negotiation on your behalf. The buyer communicates through their own AI agent — messages are mediated through AI to protect both parties. Ask me anything about the offer, comparable sales, or counter-offer strategy."
                  : "I'll guide you through the entire negotiation and closing process. Ask me anything about the offer, market analysis, inspections, or paperwork."}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.senderType === "ai" ? "" : "flex-row-reverse"}`} data-testid={`message-${msg.id}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                msg.senderType === "ai" ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}>
                {msg.senderType === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm ${
                msg.senderType === "ai" ? "bg-muted" : "bg-primary text-primary-foreground"
              }`}>
                <p className="leading-relaxed">{msg.content}</p>
                <p className={`mt-1 text-[10px] ${msg.senderType === "ai" ? "text-muted-foreground" : "text-primary-foreground/60"}`}>
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Documents Panel */}
      {documents.length > 0 && (
        <div className="border-t px-4 py-2">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto">
            {documents.map((doc) => (
              <Badge key={doc.id} variant="outline" className="shrink-0 gap-1 px-2 py-1">
                <FileText className="h-3 w-3" />
                <span className="text-[10px]">{doc.name}</span>
                <Badge variant="secondary" className="text-[9px] ml-1">{doc.status}</Badge>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3">
        <form
          className="mx-auto flex max-w-3xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) sendMessage.mutate(input.trim());
          }}
          data-testid="form-message"
        >
          <Input
            placeholder="Ask about the deal, request documents, or negotiate..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            data-testid="input-message"
          />
          <Button type="submit" disabled={!input.trim() || sendMessage.isPending} data-testid="button-send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="mx-auto mt-2 flex max-w-3xl gap-1.5 flex-wrap">
          {(isSeller
            ? ["What are comparable sales?", "Should I counter this offer?", "Explain the contingencies", "Status of documents"]
            : ["What are the comps?", "Prepare inspection contingency", "Draft counter-offer", "Status of documents"]
          ).map((q) => (
            <Button
              key={q} variant="outline" size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => sendMessage.mutate(q)}
              data-testid={`button-quick-${q.substring(0, 10)}`}
            >
              {q}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
