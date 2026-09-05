import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

const STORAGE_KEY = "ozwizard-shell-luminosity-visible-v1";

test("luminosity shells can be hidden in live and paper views and restore into the export manifest", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();

  const toggle = page.locator("#shellLuminosityToggle");
  const model = page.locator("#modelCanvas");
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(model).toHaveAttribute("data-convection-active", "true");
  await expect(model).toHaveAttribute("data-luminosity-shells", "visible");
  await expect(model).toHaveAttribute("data-luminosity-arc-labels", "L_c,L,L_r");
  await expect(model).toHaveAttribute("data-geometry-guides", "R=1,eta,minR,maxR");

  await toggle.uncheck();
  await expect(model).toHaveAttribute("data-convection-active", "true");
  await expect(model).toHaveAttribute("data-luminosity-shells", "hidden");
  await expect(model).toHaveAttribute("data-luminosity-arc-labels", "");
  await expect(model).toHaveAttribute("data-geometry-guides", "R=1,eta,minR,maxR");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("false");

  await page.reload();
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(model).toHaveAttribute("data-luminosity-shells", "hidden");
  await expect(model).toHaveAttribute("data-luminosity-arc-labels", "");

  await page.locator("#themeToggle").click();
  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await expect(toggle).toBeVisible();
  await expect(model).toHaveAttribute("data-model-mode", "paper");
  await expect(model).toHaveAttribute("data-paper-snapshot-count", "4");
  await expect(model).toHaveAttribute("data-luminosity-shells", "hidden");
  await expect(model).toHaveAttribute("data-luminosity-arc-labels", "");
  await expect(model).toHaveAttribute("data-geometry-guides", "R=1,eta,minR,maxR");
  const hiddenPaperImage = await model.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());

  await toggle.check();
  await expect(model).toHaveAttribute("data-luminosity-shells", "visible");
  await expect(model).toHaveAttribute("data-luminosity-arc-labels", "L_c,L,L_r");
  const visiblePaperImage = await model.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  expect(visiblePaperImage).not.toBe(hiddenPaperImage);

  await toggle.uncheck();
  await page.locator("[data-plot-toggle]").evaluateAll((inputs) => {
    inputs.forEach((node) => {
      const input = node as HTMLInputElement;
      if (input.dataset.plotToggle !== "model" && input.checked && !input.disabled) input.click();
    });
  });
  await expect(page.locator("#plotGrid .plot-panel:visible")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download", { timeout: 150_000 });
  await page.locator("#paperExportBundle").click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const archive = unzipSync(new Uint8Array(await readFile(path!)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
  expect(manifest.display.shellLuminosityVisible).toBe(false);
});
