import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Home, DollarSign, Shield } from "lucide-react";
import { Link } from "wouter";

export function ChaperoneLogin() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1a12] flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[#2D7A4F] flex items-center justify-center mb-4 shadow-lg shadow-green-900/40">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">HomeDirectAI</h1>
          <p className="text-[#2D7A4F] font-semibold text-sm mt-1">Chaperone</p>
        </div>

        {/* Value props */}
        <div className="w-full max-w-sm mb-10">
          <h2 className="text-3xl font-bold text-white text-center mb-2">
            Earn $20 per showing
          </h2>
          <p className="text-gray-400 text-center text-sm leading-relaxed">
            The DoorDash of real estate tours. Set your hours,<br />
            accept showings near you, get paid fast.
          </p>
          <div className="mt-6 flex justify-center gap-8">
            {[
              { icon: DollarSign, label: "$20/showing" },
              { icon: Home, label: "Your schedule" },
              { icon: Shield, label: "Background checked" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-[#1a2e20] border border-[#2D7A4F]/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#4CAF87]" />
                </div>
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Login form */}
        <div className="w-full max-w-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lisa@example.com"
                required
                className="h-12 bg-[#1a2e20] border-[#2D7A4F]/40 text-white placeholder:text-gray-600 focus:border-[#2D7A4F] focus:ring-[#2D7A4F]/20 rounded-xl"
                data-testid="input-chaperone-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-12 bg-[#1a2e20] border-[#2D7A4F]/40 text-white placeholder:text-gray-600 focus:border-[#2D7A4F] focus:ring-[#2D7A4F]/20 rounded-xl"
                data-testid="input-chaperone-password"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 text-base font-semibold bg-[#2D7A4F] hover:bg-[#35905D] text-white rounded-xl shadow-lg shadow-green-900/30 mt-2"
              data-testid="button-chaperone-login"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              Not a chaperone yet?{" "}
              <Link href="/chaperone-apply">
                <span className="text-[#4CAF87] font-medium underline underline-offset-2">
                  Apply now
                </span>
              </Link>
            </p>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-[#1a2e20] border border-[#2D7A4F]/20">
            <p className="text-xs text-gray-500 text-center">
              Demo: <span className="text-gray-400">lisa@example.com</span> / <span className="text-gray-400">demo123</span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom safe area */}
      <div className="h-8 bg-[#0d1a12]" />
    </div>
  );
}
