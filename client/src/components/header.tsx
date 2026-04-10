import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { useState, useRef, useEffect } from "react";
import { AuthModal } from "./auth-modal";
import { Home, Search, Plus, LayoutDashboard, Moon, Sun, User, LogOut, Menu, X, Map, UserCheck, Bell, Shield } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "@shared/schema";

function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: () => apiRequest("GET", "/api/notifications").then(r => r.json()),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(!open)}
        data-testid="button-notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-popover shadow-lg" data-testid="notifications-dropdown">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{unreadCount} new</Badge>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet</p>
            ) : (
              notifications.slice(0, 15).map(n => (
                <button
                  key={n.id}
                  className={`w-full px-3 py-2.5 text-left hover:bg-muted transition-colors border-b last:border-b-0 ${!n.read ? "bg-primary/5" : ""}`}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <div className={!n.read ? "" : "pl-3.5"}>
                      <p className="text-xs font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                      {n.createdAt && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showAuth, setShowAuth] = useState<"login" | "register" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  const isChaperone = user?.role === "chaperone";
  const isAdmin = user?.role === "admin";

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/map", label: "Map", icon: Map },
    ...(isAuthenticated ? [
      { href: "/sell", label: "Sell", icon: Plus },
      { href: isChaperone ? "/chaperone-dashboard" : "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ...(isChaperone ? [{ href: "/chaperone-dashboard", label: "Chaperone", icon: UserCheck }] : []),
      ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
    ] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" data-testid="header">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 no-underline" data-testid="link-home-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="HomeDirectAI logo">
              <path d="M16 3L2 14h4v14h8v-8h4v8h8V14h4L16 3z" fill="currentColor" className="text-primary"/>
              <circle cx="16" cy="16" r="3" fill="currentColor" className="text-primary-foreground dark:text-background"/>
            </svg>
            <span className="text-base font-semibold tracking-tight" data-testid="text-brand">HomeDirectAI</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" data-testid="nav-desktop">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={location === item.href ? "secondary" : "ghost"}
                  size="sm"
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="mr-1.5 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated && <NotificationBell />}

            {isAuthenticated ? (
              <div className="hidden items-center gap-2 md:flex">
                <Link href={isChaperone ? "/chaperone-dashboard" : "/dashboard"}>
                  <Button variant="ghost" size="sm" data-testid="link-user-profile">
                    <User className="mr-1.5 h-4 w-4" />
                    {user?.fullName?.split(" ")[0]}
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Button variant="ghost" size="sm" onClick={() => setShowAuth("login")} data-testid="button-login">
                  Sign In
                </Button>
                <Button size="sm" onClick={() => setShowAuth("register")} data-testid="button-register">
                  Get Started
                </Button>
              </div>
            )}

            <Button
              variant="ghost" size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t px-4 pb-4 pt-2 md:hidden" data-testid="nav-mobile">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                  <Button variant={location === item.href ? "secondary" : "ghost"} size="sm" className="w-full justify-start">
                    <item.icon className="mr-2 h-4 w-4" /> {item.label}
                  </Button>
                </Link>
              ))}
              {!isAuthenticated && (
                <>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowAuth("login"); setMobileOpen(false); }}>Sign In</Button>
                  <Button size="sm" className="w-full justify-start" onClick={() => { setShowAuth("register"); setMobileOpen(false); }}>Get Started</Button>
                </>
              )}
              {isAuthenticated && (
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { logout(); setMobileOpen(false); }}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
              )}
            </nav>
          </div>
        )}
      </header>

      {showAuth && <AuthModal mode={showAuth} onClose={() => setShowAuth(null)} onSwitch={(mode) => setShowAuth(mode)} />}
    </>
  );
}
