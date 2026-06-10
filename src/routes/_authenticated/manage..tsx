
/* ---------------- Startup & Variables ---------------- */

function StartupTab({ orderId }: { orderId: string }) {
  const fetchStartup = useServerFn(getServerStartup);
  const saveStartup = useServerFn(updateServerStartup);
  const qc = useQueryClient();

  const startup = useQuery({
    queryKey: ["startup", orderId],
    queryFn: () => fetchStartup({ data: { orderId } }),
  });

  const [env, setEnv] = useState<Record<string, string>>({});
  const [reinstall, setReinstall] = useState(false);

  useEffect(() => {
    if (startup.data) setEnv({ ...startup.data.environment });
  }, [startup.data]);

  const save = useMutation({
    mutationFn: () => saveStartup({ data: { orderId, environment: env, reinstall } }),
    onSuccess: () => {
      toast.success(reinstall ? "Saved — reinstalling…" : "Variables saved");
      setReinstall(false);
      qc.invalidateQueries({ queryKey: ["startup", orderId] });
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (startup.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (startup.error) return <div className="text-sm text-destructive">{(startup.error as Error).message}</div>;
  if (!startup.data) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-6 space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold">Server variables</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Change version, mods, modpack ID, or any other option below. Changing the version or modpack usually requires a reinstall to take effect.
        </p>
      </div>

      <EggVariablesForm variables={startup.data.variables} values={env} onChange={setEnv} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reinstall}
            onChange={(e) => setReinstall(e.target.checked)}
            className="accent-[color:var(--primary)]"
          />
          Reinstall after save
          <span className="text-xs text-muted-foreground">(wipes & re-downloads server files — use when changing version or modpack)</span>
        </label>
        <Button
          onClick={() => {
            if (reinstall && !confirm("Reinstalling will wipe server files and re-run the install script. Continue?")) return;
            save.mutate();
          }}
          disabled={save.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
