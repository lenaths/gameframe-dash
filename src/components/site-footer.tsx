export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10 mt-24">
      <div className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground flex flex-col md:flex-row gap-3 justify-between">
        <p>© {new Date().getFullYear()} NexusHost — game servers, instant deploy.</p>
        <p>Powered by Pterodactyl · 99.9% uptime · NVMe storage</p>
      </div>
    </footer>
  );
}
