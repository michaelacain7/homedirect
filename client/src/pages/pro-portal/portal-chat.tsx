import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageSquare, User } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface Message {
  id: number;
  senderType: string;
  senderName: string;
  content: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string | null;
}

interface PortalChatProps {
  token: string;
  proName: string;
}

const SENDER_COLORS: Record<string, string> = {
  professional: "bg-blue-600 text-white",
  buyer: "bg-green-600 text-white",
  seller: "bg-purple-600 text-white",
  system: "bg-gray-400 text-white",
};

function formatTime(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function getInitials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

export default function PortalChat({ token, proName }: PortalChatProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/pro/${token}/messages`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`${API_BASE}/api/pro/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/pro/${token}/messages`] });
      setInput("");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-green-600" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Messages</h3>
        {messages.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-8">
            <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs mt-1">Send a message to get started.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderType === "professional";
          const colorClass = SENDER_COLORS[msg.senderType] || "bg-gray-500 text-white";
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colorClass}`}>
                {getInitials(msg.senderName)}
              </div>
              {/* Bubble */}
              <div className={`max-w-[75%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{msg.senderName}</span>
                  <span className="text-xs text-gray-400">{formatTime(msg.createdAt)}</span>
                </div>
                <div className={`px-3 py-2 rounded-xl text-sm ${
                  isMe
                    ? "bg-green-600 text-white rounded-tr-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-sm"
                }`}>
                  {msg.content}
                </div>
                {msg.attachmentName && msg.attachmentUrl && (
                  <a
                    href={msg.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    📎 {msg.attachmentName}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="resize-none min-h-[60px] max-h-[120px] text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="icon"
            className="bg-green-600 hover:bg-green-700 shrink-0 self-end h-10 w-10"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
