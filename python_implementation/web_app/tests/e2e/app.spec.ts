import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("app renders solver controls, canvases, and comparison metrics", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  await expect(page.getByAltText("OZwizard logo")).toBeVisible();
  await expect(page.getByAltText("OZwizard logo")).toHaveJSProperty("naturalWidth", 498);
  await expect(page.getByRole("button", { name: "RK45" })).toHaveClass(/active/);
  await expect(page.locator("#statusPill")).toContainText("stop:");
  await expect(page.locator("#metrics")).toContainText("stop reason");
  await expect.poll(async () => (await page.locator("body").innerText()).includes("\\(")).toBe(false);

  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(4);
  const tauCell = page.locator("[data-symbol='tau']").first();
  const tauRow = tauCell.locator("xpath=ancestor::tr");
  await expect(tauCell).toBeVisible();
  await expect(tauRow).toContainText("free-fall/dynamical time");
  await expect(tauCell).toHaveCSS("color", "rgb(158, 167, 255)");
  await expect(page.locator("#timeLegend")).toContainText("radius");
  await expect(page.locator("#timeLegend")).toContainText("pressure");
  const legendHtml = await page.locator("#timeLegend").innerHTML();
  expect(legendHtml).toContain("R");
  expect(legendHtml).toContain("P");
  const hasPaint = await page.locator("#lightCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasPaint).toBe(true);

  await page.getByRole("button", { name: "DOP853" }).click();
  await expect(page.getByRole("button", { name: "DOP853" })).toHaveClass(/active/);
  await page.getByLabel("Compare selected solver to midpoint").check();
  await expect(page.getByText("midpoint Δy")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, "utf8");
  expect(csv.split(/\r?\n/, 1)[0]).toBe("tau,R,V,P,Uc,Lr,Lc,L");
  expect(pageErrors).toEqual([]);
});
