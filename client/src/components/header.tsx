import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { useState } from "react";
import { AuthModal } from "./auth-modal";
import { Home, Search, Plus, LayoutDashboard, Moon, Sun, User, LogOut, Menu, X, Map, UserCheck } from "lucide-react";

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showAuth, setShowAuth] = useState<"login" | "register" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  const isChaperone = user?.role === "chaperone";
  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/map", label: "Map", icon: Map },
    ...(isAuthenticated ? [
      { href: "/sell", label: "Sell", icon: Plus },
      { href: isChaperone ? "/chaperone-dashboard" : "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ...(isChaperone ? [{ href: "/chaperone-dashboard", label: "Chaperone", icon: UserCheck }] : []),
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
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

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
