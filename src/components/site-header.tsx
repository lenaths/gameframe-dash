import { Link } from "@tanstack/react-router";
import { Bell, LogOut } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { XntLogo } from "@/components/xnt-logo";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

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
          <Link
            to={"/status" as never}
            className="text-muted-foreground hover:text-foreground transition-colors"
            activeProps={{ className: "text-foreground" }}
          >
            Status
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
              <NotificationsMenu />
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

type HeaderNotification = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function NotificationsMenu() {
  const qc = useQueryClient();
  const fetchNotifications = useServerFn(listMyNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const markAllReadFn = useServerFn(markAllNotificationsRead);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications(),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => markReadFn({ data: { notificationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllReadFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });
  const notifications = (query.data?.notifications ?? []) as HeaderNotification[];

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
        <Bell className="h-4 w-4" />
        {(query.data?.unreadCount ?? 0) > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
            {query.data?.unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="xnt-card absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-1rem))] rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-display font-semibold">Notifications</div>
            <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
              Tout lire
            </Button>
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Aucune notification.
              </div>
            ) : (
              notifications.map((notification) => (
                <Link
                  key={notification.id}
                  to={(notification.href ?? "/dashboard") as never}
                  onClick={() => {
                    if (!notification.read_at) markRead.mutate(notification.id);
                    setOpen(false);
                  }}
                  className={`block rounded-lg border p-3 text-sm transition-colors hover:border-primary/45 hover:bg-primary/10 ${
                    notification.read_at
                      ? "border-border/60 bg-background/20"
                      : "border-primary/30 bg-primary/10"
                  }`}
                >
                  <div className="font-medium">{notification.title}</div>
                  {notification.body && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {notification.body}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(notification.created_at).toLocaleString()}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
