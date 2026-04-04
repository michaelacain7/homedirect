import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Home, ArrowLeft, DollarSign, BarChart2, Trash2, Shield,
  RefreshCw, TrendingUp, Activity, CreditCard
} from "lucide-react";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("stats");

  // Redirect non-admins
  if (user && user.role !== "admin") {
    return (
      <div className="py-24 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page.</p>
        <Button className="mt-4" onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground">Please sign in as an admin.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="page-admin">
      <div className="border-b py-3 px-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Admin Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Platform management & analytics</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="stats"><BarChart2 className="mr-1.5 h-4 w-4" />Stats</TabsTrigger>
            <TabsTrigger value="users"><Users className="mr-1.5 h-4 w-4" />Users</TabsTrigger>
            <TabsTrigger value="listings"><Home className="mr-1.5 h-4 w-4" />Listings</TabsTrigger>
            <TabsTrigger value="transactions"><Activity className="mr-1.5 h-4 w-4" />Transactions</TabsTrigger>
            <TabsTrigger value="payments"><CreditCard className="mr-1.5 h-4 w-4" />Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="stats"><PlatformStats /></TabsContent>
          <TabsContent value="users"><UsersTab qc={qc} toast={toast} /></TabsContent>
          <TabsContent value="listings"><ListingsTab qc={qc} toast={toast} /></TabsContent>
          <TabsContent value="transactions"><TransactionsTab /></TabsContent>
          <TabsContent value="payments"><PaymentsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Platform Stats ────────────────────────────────────────────────────────────

function PlatformStats() {
  const { data: stats, isLoading } = useQuery<{
    totalUsers: number;
    totalListings: number;
    activeTransactions: number;
    totalRevenue: number;
    totalPayouts: number;
  }>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiRequest("GET", "/api/admin/stats").then(r => r.json()),
  });

  if (isLoading) return <div className="animate-pulse h-40 rounded-lg bg-muted" />;

  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-500" },
    { label: "Total Listings", value: stats?.totalListings ?? 0, icon: Home, color: "text-green-500" },
    { label: "Active Transactions", value: stats?.activeTransactions ?? 0, icon: Activity, color: "text-orange-500" },
    { label: "Platform Revenue", value: formatPrice(stats?.totalRevenue ?? 0), icon: TrendingUp, color: "text-primary" },
    { label: "Chaperone Payouts", value: formatPrice(stats?.totalPayouts ?? 0), icon: DollarSign, color: "text-purple-500" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-5">
          <div className="flex items-center gap-3">
            <div className={`rounded-full bg-muted p-2 ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-xl font-bold">{c.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ qc, toast }: { qc: any; toast: any }) {
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiRequest("GET", "/api/admin/users").then(r => r.json()),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="animate-pulse h-40 rounded-lg bg-muted" />;

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Email</th>
            <th className="px-4 py-2 text-left">Role</th>
            <th className="px-4 py-2 text-left">Joined</th>
            <th className="px-4 py-2 text-left">Change Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t hover:bg-muted/40">
              <td className="px-4 py-2 font-medium">{u.fullName}</td>
              <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
              <td className="px-4 py-2">
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatDate(u.createdAt)}</td>
              <td className="px-4 py-2">
                <Select
                  defaultValue={u.role}
                  onValueChange={(role) => changeRole.mutate({ id: u.id, role })}
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["buyer", "seller", "chaperone", "admin"].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users found.</p>
      )}
    </div>
  );
}

// ── Listings Tab ──────────────────────────────────────────────────────────────

function ListingsTab({ qc, toast }: { qc: any; toast: any }) {
  const { data: listings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/listings"],
    queryFn: () => apiRequest("GET", "/api/admin/listings").then(r => r.json()),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/listings/${id}`);
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      toast({ title: "Listing removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="animate-pulse h-40 rounded-lg bg-muted" />;

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-2 text-left">Title</th>
            <th className="px-4 py-2 text-left">Address</th>
            <th className="px-4 py-2 text-left">Price</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.id} className="border-t hover:bg-muted/40">
              <td className="px-4 py-2 font-medium max-w-[180px] truncate">{l.title}</td>
              <td className="px-4 py-2 text-muted-foreground max-w-[150px] truncate">{l.address}, {l.city}</td>
              <td className="px-4 py-2">{formatPrice(l.price)}</td>
              <td className="px-4 py-2">
                <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatDate(l.createdAt)}</td>
              <td className="px-4 py-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("Remove this listing?")) deleteListing.mutate(l.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {listings.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No listings found.</p>
      )}
    </div>
  );
}

// ── Transactions Tab ──────────────────────────────────────────────────────────

function TransactionsTab() {
  const { data: transactions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/transactions"],
    queryFn: () => apiRequest("GET", "/api/admin/transactions").then(r => r.json()),
  });

  if (isLoading) return <div className="animate-pulse h-40 rounded-lg bg-muted" />;

  return (
    <div className="space-y-4">
      {transactions.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No transactions yet.</p>
      )}
      {transactions.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t.listing?.address || `Listing #${t.listingId}`}
              </p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Buyer: {t.buyer?.fullName || "—"}</span>
                <span>Seller: {t.seller?.fullName || "—"}</span>
              </div>
              <div className="flex gap-2 flex-wrap mt-2">
                {[
                  { label: "Escrow", val: t.escrowStatus },
                  { label: "Title", val: t.titleStatus },
                  { label: "Inspection", val: t.inspectionStatus },
                  { label: "Appraisal", val: t.appraisalStatus },
                ].map(s => (
                  <Badge key={s.label} variant="outline" className="text-[10px]">
                    {s.label}: {s.val?.replace("_", " ") || "—"}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">{formatPrice(t.salePrice)}</p>
              <p className="text-xs text-muted-foreground">
                Fee: {formatPrice(t.platformFee)}
              </p>
              <Badge variant={t.status === "completed" ? "default" : "secondary"} className="mt-1 text-[10px]">
                {t.status}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Payments Tab ──────────────────────────────────────────────────────────────

function PaymentsTab() {
  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/payments"],
    queryFn: () => apiRequest("GET", "/api/admin/payments").then(r => r.json()),
  });

  if (isLoading) return <div className="animate-pulse h-40 rounded-lg bg-muted" />;

  const typeLabels: Record<string, string> = {
    walkthrough_fee: "Walkthrough Fee",
    platform_fee: "Platform Fee",
    chaperone_payout: "Chaperone Payout",
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">Amount</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Stripe ID</th>
            <th className="px-4 py-2 text-left">Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t hover:bg-muted/40">
              <td className="px-4 py-2 font-medium">{typeLabels[p.type] || p.type}</td>
              <td className="px-4 py-2">${p.amount}</td>
              <td className="px-4 py-2">
                <Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status}</Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground text-xs font-mono truncate max-w-[120px]">
                {p.stripePaymentId || "—"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatDate(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {payments.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
      )}
    </div>
  );
}
