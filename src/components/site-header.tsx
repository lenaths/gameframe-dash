import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { XntLogo } from "@/components/xnt-logo";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-50 border-b border-primary/15 bg-background/78 shadow-[0_8px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="xnt-neon-line absolute inset-x-0 bottom-0" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <XntLogo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-foreground" }}
          >
            Home
          </Link>
          <Link
            to="/pricing"
            className="text-muted-foreground hover:text-foreground transition-colors"
            activeProps={{ className: "text-foreground" }}
          >
            Pricing
          </Link>
          {user && (
            <Link
              to="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground" }}
            >
              Dashboard
            </Link>
          )}
          {user && (
            <Link
              to="/billing"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground" }}
            >
              Billing
            </Link>
          )}
          {user && (
            <Link
              to="/support"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground" }}
            >
              Support
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => signOut()}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-primary text-primary-foreground shadow-[0_0_28px_rgba(0,191,255,0.25)] hover:bg-primary/90"
              >
                <Link to="/pricing">Get a server</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
