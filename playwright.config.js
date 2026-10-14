import { defineConfig } from "@playwright/test";

// BASE_URL points the suite at a live site; otherwise it builds and serves the local app with `vite preview`.
const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: 0,
  use: { baseURL, browserName: "chromium" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173", timeout: 120_000, reuseExistingServer: false },
});
