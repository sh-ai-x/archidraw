import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);

export default defineConfig({
  testDir: root,
  testMatch: "**/*.spec.ts",
  timeout: 15_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:5173", browserName: "chromium", headless: true },
  reporter: [["list"], ["html", { outputFolder: resolve(root, "playwright-report"), open: "never" }]],
  webServer: { command: `node ${resolve(root, "fixtures/servers.mjs")}`, url: "http://localhost:5173", reuseExistingServer: false },
  outputDir: resolve(root, "test-results"),
});
