import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.js"] }, // browser tests live in e2e/ and run under Playwright
});
