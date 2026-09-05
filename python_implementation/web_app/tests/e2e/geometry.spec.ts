import { expect, test } from "@playwright/test";

test("density geometry selection updates the equations and nonlinear luminosity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  const geometry = page.getByRole("combobox", { name: "Density geometry" });
  await expect(geometry).toHaveValue("homogeneous-shell");
  await expect(page.locator("#initialL")).toContainText("0.44");
  await page.locator("#derivationPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  await expect(page.locator("[data-derivation-block='geometry']")).toContainText("Exact mass conservation");

  await geometry.selectOption("local-exponent");
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-geometry-mode", "local-exponent");
  await expect(page.locator("#initialL")).toContainText("0.42");
  await expect(page.locator("[data-derivation-block='geometry']")).toContainText("legacy prescription");

  await geometry.selectOption("constant");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "constant");
  await expect(page.locator("[data-derivation-block='geometry']")).toContainText("constant exponent");
  await geometry.selectOption("homogeneous-shell");
  await expect(page.locator("#initialL")).toContainText("0.44");
  await expect(page.locator("#workCanvas")).toHaveAttribute("data-geometry-mode", "homogeneous-shell");
  expect(errors).toEqual([]);
});

test("an exact-shell initial radius inside the core reports the domain error and recovers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("combobox", { name: "Density geometry" })).toHaveValue("homogeneous-shell");
  await page.locator("#initialControlSection").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  const radius = page.getByRole("slider", { name: "initial radius", exact: true });
  await radius.evaluate((node) => {
    (node as HTMLInputElement).value = "0.85";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#metrics")).toContainText("homogeneous shell boundary reached");
  await expect(page.locator("#heatEngineCanvas")).toHaveAttribute("data-heat-engine-mode", "unavailable");
  await radius.evaluate((node) => {
    (node as HTMLInputElement).value = "1.1";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#initialL")).toContainText("0.44");
  await expect(page.locator("#heatEngineCanvas")).toHaveAttribute("data-heat-engine-mode", "single");
  expect(errors).toEqual([]);
});

test("the Hertzsprung preset preserves exact geometry and full period metadata for figure exports", async ({ page }) => {
  await page.goto("/wizard_of_oz.html");
  await page.locator("#metrics[data-nonlinear-period]").waitFor();
  await page.locator("#presetPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  await page.locator("#presetButtons").getByRole("button", { name: "Hertzsprung progression", exact: true }).click();
  await page.locator("#gridModeToggle").uncheck();
  await page.getByRole("slider", { name: "convective flux fraction", exact: true }).evaluate((node) => {
    (node as HTMLInputElement).value = "0.25";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByRole("combobox", { name: "Density geometry" })).toHaveValue("homogeneous-shell");
  await expect.poll(async () => Number(await page.locator("#metrics").getAttribute("data-nonlinear-period"))).toBeGreaterThan(2.3718);
  expect(Number(await page.locator("#metrics").getAttribute("data-nonlinear-period"))).toBeLessThan(2.3725);
});

test("Fourier phase curves stay wrapped and break at a phase discontinuity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await page.locator("#presetPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  await page.locator("#presetButtons").getByRole("button", { name: "Hertzsprung progression", exact: true }).click();
  await expect(page.locator("#gridStatusText")).toContainText("Grid complete", { timeout: 20000 });
  const canvas = page.locator("#fourierCanvas");
  await expect(canvas).toHaveAttribute("data-fourier-phase-convention", "wrapped-0-2pi; break-at-wrap");
  await expect.poll(async () => Number(await canvas.getAttribute("data-fourier-phase-break-count"))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
