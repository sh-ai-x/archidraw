import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);

/**
 * Playwright config for the canvas-gestures e2e suite.
 *
 * Runs against the real Vite dev server which the test harness must
 * start on http://localhost:5173 BEFORE invoking this config. This
 * file does NOT spin up its own webServer because the GUI's Vite
 * dev server is the actual SUT — the mock gui-server.mjs in
 * fixtures/ is a different (MCP-integration) test target.
 */
export default defineConfig({
  testDir: root,
  testMatch: "**/canvas-gestures.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    headless: true,
  },
  reporter: [["list"]],
});
