import { test, expect } from "@playwright/test";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let mcp: ChildProcessWithoutNullStreams;
let call: (method: string, args?: Record<string, unknown>) => Promise<any>;
const results: string[] = [];

test.beforeAll(async () => {
  await mkdir(resolve(import.meta.dirname, "screenshots"), { recursive: true });
  mcp = spawn(resolve(import.meta.dirname, "bin/archidraw-mcp"), ["--db", "/tmp/e2e.db"]);
  const rl = createInterface({ input: mcp.stdout }); const pending: ((value: any) => void)[] = [];
  rl.on("line", line => pending.shift()?.(JSON.parse(line)));
  call = (method, args = {}) => new Promise((resolve) => { pending.push(resolve); mcp.stdin.write(JSON.stringify({ method, ...args }) + "\n"); });
});
test.afterAll(async () => { mcp?.kill(); await writeFile(resolve(import.meta.dirname, "report.md"), `# Step 6 E2E report\n\n${results.join("\n")}`); });

test("GUI ↔ MCP four-step synchronization", async ({ page }) => {
  await page.goto("/"); await page.click('[data-tool="rect"]');
  await page.mouse.move(120, 120); await page.mouse.down(); await page.mouse.move(300, 240); await page.mouse.up();
  await expect(page.locator(".element")).toHaveCount(1); await page.screenshot({ path: resolve(import.meta.dirname, "screenshots/01-drawn.png") }); results.push("- Step 1: PASS — rectangle drawn and rendered.");

  const queried = await call("query_elements"); expect(queried.result.elements).toHaveLength(1); const element = queried.result.elements[0];
  results.push(`- Step 2: PASS — query_elements returned 1 element: \`${JSON.stringify(element)}\``); await page.screenshot({ path: resolve(import.meta.dirname, "screenshots/02-queried.png") });

  await call("update_element", { id: element.id, patch: { x: 420, y: 180 } });
  await expect(page.locator(`[data-element-id="${element.id}"]`)).toHaveCSS("left", "420px"); await page.screenshot({ path: resolve(import.meta.dirname, "screenshots/03-updated.png") }); results.push("- Step 3: PASS — update_element reflected in GUI within Playwright retry window (<1s target).");

  await call("delete_element", { id: element.id }); await expect(page.locator(`[data-element-id="${element.id}"]`)).toHaveCount(0); await page.screenshot({ path: resolve(import.meta.dirname, "screenshots/04-deleted.png") }); results.push("- Step 4: PASS — delete_element removed the element from GUI.");
});
