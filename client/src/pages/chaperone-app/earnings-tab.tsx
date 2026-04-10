import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, X, Loader2 } from "lucide-react";
import type { ChaperonePayout } from "@shared/schema";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEMO_DAILY = [0, 20, 0, 40, 20, 0, 0];

export function EarningsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCashOut, setShowCashOut] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { data: earningsData, isLoading } = useQuery<{
    total: number; pending: number; paid: number; payouts: ChaperonePayout[];
  }>({
    queryKey: ["/api/chaperone/earnings", user?.id],
    queryFn: async () => {
      if (!user) return { total: 0, pending: 0, paid: 0, payouts: [] };
      try { return await apiRequest("GET", `/api/chaperone/earnings/${user.id}`).then(r => r.json()); }
      catch { return { total: 0, pending: 0, paid: 0, payouts: [] }; }
    },
    enabled: !!user,
  });

  const { data: chaperoneApp } = useQuery<any>({
    queryKey: ["/api/chaperone/application", user?.id],
    queryFn: async () => {
      if (!user) return null;
      try { return await apiRequest("GET", `/api/chaperone/application/${user.id}`).then(r => r.json()); }
      catch { return null; }
    },
    enabled: !!user,
  });

  const payoutMutation = useMutation({
    mutationFn: (amount: number) =>
      apiRequest("POST", "/api/chaperone/request-payout", {
        chaperoneId: user!.id,
        amount,
        bankLast4: chaperoneApp?.accountNumberLast4 || "1234",
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Payout requested!", description: "Transfer will arrive in 1-2 business days." });
      setShowCashOut(false);
      setWithdrawAmount("");
      qc.invalidateQueries({ queryKey: ["/api/chaperone/earnings", user?.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payouts = earningsData?.payouts || [];
  const completedEarnings = payouts.filter(p => p.type === "earning" && p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const withdrawals = Math.abs(payouts.filter(p => p.type === "payout").reduce((s, p) => s + p.amount, 0));
  const availableBalance = completedEarnings - withdrawals;

  const maxBar = Math.max(...DEMO_DAILY, 1);

  const handleCashOut = () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0 || amt > availableBalance) {
      toast({ title: "Invalid amount", description: "Enter a valid amount to withdraw.", variant: "destructive" });
      return;
    }
    payoutMutation.mutate(amt);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d1a12]" data-testid="tab-earnings">
      {/* Hero balance */}
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-[#0d1a12] to-[#0d1a12]">
        <p className="text-gray-500 text-sm font-medium mb-1">Available Balance</p>
        <div className="flex items-end gap-3 mb-4">
          <span className="text-5xl font-bold text-white" data-testid="text-available-balance">
            {isLoading ? "—" : `$${availableBalance.toFixed(2)}`}
          </span>
        </div>

        <Button
          onClick={() => {
            setWithdrawAmount(availableBalance.toFixed(2));
            setShowCashOut(true);
          }}
          disabled={availableBalance <= 0}
          className="w-full h-12 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-semibold rounded-xl disabled:opacity-40"
          data-testid="button-cash-out"
        >
          <DollarSign className="w-4 h-4 mr-2" />
          Cash Out
        </Button>

        <div className="mt-4 flex gap-4">
          <div className="flex-1 p-3 rounded-xl bg-[#141f17] border border-[#2D7A4F]/20">
            <p className="text-gray-500 text-xs mb-0.5">This Week</p>
            <p className="text-white font-bold text-base">
              ${DEMO_DAILY.reduce((a, b) => a + b, 0).toFixed(2)}
            </p>
          </div>
          <div className="flex-1 p-3 rounded-xl bg-[#141f17] border border-[#2D7A4F]/20">
            <p className="text-gray-500 text-xs mb-0.5">This Month</p>
            <p className="text-white font-bold text-base">
              {isLoading ? "—" : `$${completedEarnings.toFixed(2)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="mx-4 mt-2 mb-4 p-4 rounded-2xl bg-[#141f17] border border-[#2D7A4F]/20">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-[#4CAF87]" />
          <p className="text-white text-sm font-semibold">This Week</p>
        </div>
        <div className="flex items-end gap-2 h-16">
          {DEMO_DAILY.map((amt, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-[#2D7A4F] transition-all"
                style={{ height: `${Math.max((amt / maxBar) * 52, amt > 0 ? 4 : 0)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          {DAYS.map((day, i) => (
            <div key={day} className="flex-1 text-center">
              <span className="text-gray-600 text-xs">{day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      <div className="px-4 pb-6">
        <h3 className="text-white font-semibold text-sm mb-3">Transactions</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-[#1a2e20] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : payouts.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center" data-testid="state-no-earnings">
            <DollarSign className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">No transactions yet</p>
            <p className="text-gray-700 text-xs mt-1">Complete a showing to start earning.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="earnings-list">
            {payouts.map(payout => {
              const isNeg = payout.amount < 0;
              const date = payout.createdAt ? new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
              return (
                <div
                  key={payout.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#141f17] border border-[#2D7A4F]/10"
                  data-testid={`row-payout-${payout.id}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isNeg ? "bg-red-900/30" : "bg-[#2D7A4F]/20"}`}>
                    <DollarSign className={`w-4 h-4 ${isNeg ? "text-red-400" : "text-[#4CAF87]"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-sm truncate">{payout.description}</p>
                    <p className="text-gray-600 text-xs">{date}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-semibold text-sm ${isNeg ? "text-red-400" : "text-[#4CAF87]"}`}>
                      {isNeg ? "-" : "+"}${Math.abs(payout.amount).toFixed(2)}
                    </p>
                    <p className="text-gray-600 text-xs capitalize">{payout.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cash Out Bottom Sheet */}
      {showCashOut && (
        <div className="fixed inset-0 z-50 flex items-end" data-testid="cash-out-sheet">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCashOut(false)} />
          <div className="relative w-full bg-[#141f17] rounded-t-3xl border-t border-[#2D7A4F]/30 p-6 pb-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-bold text-lg">Cash Out</h3>
              <button
                onClick={() => setShowCashOut(false)}
                className="w-8 h-8 rounded-full bg-[#1a2e20] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-xl bg-[#1a2e20]">
                <span className="text-gray-400 text-sm">Available Balance</span>
                <span className="text-white font-bold">${availableBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-[#1a2e20]">
                <span className="text-gray-400 text-sm">Bank Account</span>
                <span className="text-white font-medium">
                  ••••{chaperoneApp?.accountNumberLast4 || "1234"}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-gray-400 text-sm">Amount ($)</Label>
                <Input
                  type="number"
                  min="1"
                  max={availableBalance}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="h-12 bg-[#1a2e20] border-[#2D7A4F]/40 text-white rounded-xl"
                  data-testid="input-withdraw-amount"
                />
              </div>

              <Button
                onClick={handleCashOut}
                disabled={payoutMutation.isPending || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > availableBalance}
                className="w-full h-14 bg-[#2D7A4F] hover:bg-[#35905D] text-white font-bold rounded-xl"
                data-testid="button-transfer-bank"
              >
                {payoutMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <DollarSign className="w-5 h-5 mr-2" />}
                Transfer to Bank
              </Button>

              <p className="text-center text-gray-600 text-xs">Processing time: 1–2 business days</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
