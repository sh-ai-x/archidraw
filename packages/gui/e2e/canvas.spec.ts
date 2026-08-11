import {test,expect} from "@playwright/test";
test("canvas renders toolbar and empty scene",async({page})=>{await page.goto("/");await expect(page.getByRole("button",{name:"Rectangle"})).toBeVisible();await expect(page.getByTestId("canvas")).toHaveScreenshot("canvas.png")});
