import { Link } from "@tanstack/react-router";
import { Gamepad2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            NEXUS<span className="text-primary">HOST</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground" }}>Home</Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors" activeProps={{ className: "text-foreground" }}>Pricing</Link>
          {user && (
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors" activeProps={{ className: "text-foreground" }}>Dashboard</Link>
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
              <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary">
                <Link to="/pricing">Get a server</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
