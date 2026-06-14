import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: {
      entry: "server",
    },
  },

  vite: {
    server: {
      host: "0.0.0.0",
      port: 8081,
      allowedHosts: ["dev.xntservers.com", "localhost", "127.0.0.1", "192.168.0.15"],
    },
  },
});
