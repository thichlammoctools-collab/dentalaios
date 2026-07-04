import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "threads", // threads pool - lighter weight than forks
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@shared": new URL("./../../src/shared", import.meta.url).pathname,
      "@db": new URL("./../../src/db", import.meta.url).pathname,
    },
  },
});