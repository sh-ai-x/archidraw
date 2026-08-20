import {test,expect} from "@playwright/test";

test("canvas renders toolbar and empty scene",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Rectangle"})).toBeVisible();
  await expect(page.getByTestId("canvas")).toHaveScreenshot("canvas.png");
});

test("double-clicking a shape opens an in-place editor and the typed text is bound to that shape",async({page})=>{
  await page.goto("/");
  // Clear localStorage so we start from an empty scene regardless of any
  // leftover tabs from a prior run.
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  // Draw a rectangle by clicking on the Rectangle tool then dragging.
  const rectBtn = page.getByRole("button",{name:"Rectangle"});
  await rectBtn.click();
  const canvas = page.getByTestId("canvas");
  const box = (await canvas.boundingBox())!;
  const x1 = box.x + 200, y1 = box.y + 200, x2 = box.x + 400, y2 = box.y + 320;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, {steps: 8});
  await page.mouse.up();

  // Switch back to the Select tool so double-click triggers the shape editor.
  await page.getByRole("button",{name:"Select"}).click();

  // Double-click the rectangle's center to open the editor.
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  await page.mouse.dblclick(cx, cy);

  // The editor textarea appears. Type "Hello", press Enter to commit.
  const editor = page.getByTestId("text-editor");
  await expect(editor).toBeVisible();
  await editor.fill("Hello");
  await editor.press("Enter");

  // After commit, the editor is gone and the localStorage scene carries the
  // bound pair: one rectangle + one text element whose containerId points
  // at the rectangle's id. SceneTabs persists with a 300ms debounce — wait it out.
  await expect(editor).toBeHidden();
  await page.waitForTimeout(450);
  const els = await page.evaluate(() => {
    const tabsRaw = localStorage.getItem("archidraw:tabs");
    const tabs = tabsRaw ? JSON.parse(tabsRaw) : [];
    const active = tabs[0];
    return active?.scene?.elements ?? [];
  });
  expect(els.length).toBe(2);
  const rect = els.find((e:any)=>e.type==="rectangle");
  const text = els.find((e:any)=>e.type==="text");
  expect(rect).toBeTruthy();
  expect(text).toBeTruthy();
  expect(text.containerId).toBe(rect.id);
  expect(text.text).toBe("Hello");
  expect(text.originalText).toBe("Hello");
});
