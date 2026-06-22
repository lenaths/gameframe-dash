import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: {
      entry: "server",
    },
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("@xterm/")) return "vendor-xterm";
            if (id.includes("@sentry/")) return "vendor-sentry";
            if (id.includes("@supabase/")) return "vendor-supabase";
            if (id.includes("@tanstack/")) return "vendor-tanstack";
            if (id.includes("@radix-ui/")) return "vendor-radix";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("react-dom") || id.includes("react/")) return "vendor-react";
            if (id.includes("zod")) return "vendor-validation";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            return undefined;
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 8081,
      allowedHosts: ["dev.xntservers.com", "localhost", "127.0.0.1", "192.168.0.15"],
    },
  },
});
