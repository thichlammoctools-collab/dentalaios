import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite dev server proxies /api → Worker dev (wrangler dev runs on :8788
// because port 8787 is held by another instance on this machine).
// so the browser sees everything as same-origin while we code.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../src/shared"),
      "@db": path.resolve(__dirname, "../../src/db"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});