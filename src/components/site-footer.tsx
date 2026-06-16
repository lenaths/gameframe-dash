export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-primary/15 py-10">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-4 text-sm text-muted-foreground sm:px-6 md:flex-row lg:px-8">
        <p>© {new Date().getFullYear()} XNT Servers — premium game server hosting.</p>
        <p>XNT Infrastructure · 99.9% uptime · NVMe storage</p>
      </div>
    </footer>
  );
}
