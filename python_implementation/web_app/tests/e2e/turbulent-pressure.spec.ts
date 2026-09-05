import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

async function setAlpha(page: Page, value: number): Promise<void> {
  await page.getByRole("slider", { name: "turbulent pressure fraction", exact: true }).evaluate((node, alpha) => {
    (node as HTMLInputElement).value = String(alpha);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(page.locator("#workCanvas")).toHaveAttribute("data-alpha-p", String(value));
}

test("turbulent pressure updates equations, force components, work and stability", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("slider", { name: "turbulent pressure fraction", exact: true })).toHaveValue("0");
  await setAlpha(page, 0.1);
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-turbulent-pressure", "active");
  await expect(page.locator("#heatEngineCanvas")).toHaveAttribute("data-force-terms", "gas-pressure,turbulent-pressure,gravity,damping");
  await expect(page.locator("#workCanvas")).toHaveAttribute("data-work-terms", "W_gas,W_turb,W_damp,DeltaE_mech");
  await expect(page.locator("#metrics")).toHaveAttribute("data-linear-period-formula", /alphaP/);
  const work = await page.locator("#workCanvas").evaluate((node) => {
    const d = (node as HTMLCanvasElement).dataset;
    return { gas: Number(d.cycleWorkGasPressure), turb: Number(d.cycleWorkTurbulentPressure), total: Number(d.cycleWorkPressure) };
  });
  expect(work.gas + work.turb).toBeCloseTo(work.total, 5);
  const forces = await page.locator("#heatEngineCanvas").evaluate((node) => {
    const d = (node as HTMLCanvasElement).dataset;
    return { gas: Number(d.gasPressureForce), turb: Number(d.turbulentPressureForce), total: Number(d.pressureForce) };
  });
  expect(forces.turb).toBeGreaterThan(0);
  expect(forces.gas + forces.turb).toBeCloseTo(forces.total, 12);
  await page.locator("#derivationPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  await expect(page.locator("[data-derivation-block='turbulent-pressure']")).toContainText("Munteanu et al. (2005)");
  await expect(page.locator("[data-derivation-block='linear']")).toContainText("characteristic polynomial");
  await page.locator("[data-plot-panel='work']").screenshot({ path: testInfo.outputPath("turbulent-work.png") });
  await page.locator("[data-plot-panel='heatEngine']").screenshot({ path: testInfo.outputPath("turbulent-piston.png") });
  await setAlpha(page, 0);
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-turbulent-pressure", "off");
  await expect(page.locator("#workCanvas")).toHaveAttribute("data-work-terms", "W_P,W_damp,DeltaE_mech");
  expect(errors).toEqual([]);
});

test("inlists expose alphaP and legacy input restores zero turbulent pressure", async ({ page }) => {
  await page.goto("/wizard_of_oz.html");
  await setAlpha(page, 0.1);
  await page.locator("#presetPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  await page.getByRole("button", { name: "Edit inlist" }).click();
  await expect(page.locator("#inlistText")).toHaveValue(/alphaP = 0\.1/);
  await page.locator("#inlistText").fill(`&preset\n name = 'Legacy gas model'\n/\n&controls\n gammac = 0.3\n/\n&solver\n tEnd = 10\n runUntilStable = .false.\n/\n`);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("slider", { name: "turbulent pressure fraction", exact: true })).toHaveValue("0");
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-turbulent-pressure", "off");
});

test("paper work export archives the gas and turbulent forces used by the model", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/wizard_of_oz.html");
  await page.getByRole("combobox", { name: "Density geometry" }).selectOption("constant");
  await setAlpha(page, 0.1);
  await page.locator("[data-plot-toggle]").evaluateAll((inputs) => {
    inputs.forEach((node) => {
      const input = node as HTMLInputElement;
      if (input.dataset.plotToggle !== "work" && input.checked && !input.disabled) input.click();
    });
  });
  await page.locator("#themeToggle").click();
  await page.locator("#themeToggle").click();
  const downloadPromise = page.waitForEvent("download", { timeout: 150_000 });
  await page.locator("#paperExportBundle").click();
  const path = await (await downloadPromise).path();
  const archive = unzipSync(new Uint8Array(await readFile(path!)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
  const parameters = manifest.model.displayParameters ?? manifest.model.parameters;
  expect(parameters.alphaP).toBe(0.1);
  const csvName = Object.keys(archive).find((name) => /^data\/.*work\.csv$/.test(name));
  expect(csvName).toBeTruthy();
  const [header, ...lines] = strFromU8(archive[csvName!]).trim().split(/\r?\n/);
  const columns = header.split(",");
  expect(columns).toEqual(expect.arrayContaining(["gas_pressure_support", "turbulent_pressure_support", "gas_pressure_power", "turbulent_pressure_power", "Uc"]));
  const row = Object.fromEntries(lines[0].split(",").map((value, index) => [columns[index], Number(value)]));
  const density = row.R ** -parameters.m;
  const gasForce = (1 - parameters.alphaP) * row.R ** 2 * row.H * density ** parameters.gamma1;
  const turbulentForce = parameters.alphaP * row.R ** 2 * density * row.Uc ** 2;
  expect(row.gas_pressure_support).toBeCloseTo(gasForce, 8);
  expect(row.turbulent_pressure_support).toBeCloseTo(turbulentForce, 8);
  expect(row.pressure_support).toBeCloseTo(gasForce + turbulentForce, 8);
  expect(row.gas_pressure_power).toBeCloseTo(gasForce * row.V, 8);
  expect(row.turbulent_pressure_power).toBeCloseTo(turbulentForce * row.V, 8);
});

test("frozen convection invalidates and restores the normalized stability maps", async ({ page }) => {
  await page.goto("/wizard_of_oz.html");
  await page.locator("#presetPanel").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  for (const uc0 of [1, 0, 1]) {
    await page.getByRole("button", { name: "Edit inlist" }).click();
    await page.locator("#inlistText").fill(`&preset\n name = 'Frozen turbulent pressure'\n/\n&controls\n alphaP = 0.1\n zetac = 0\n gammac = 0\n uc0 = ${uc0}\n/\n&solver\n tEnd = 5\n runUntilStable = .false.\n/\n`);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator("#inlistDialog")).toBeHidden();
    await expect(page.locator("#metrics")).toHaveAttribute("data-equilibrium-valid", String(uc0 === 1));
    await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-equilibrium-valid", String(uc0 === 1));
    const strip = page.locator("#cepheidGuideCanvas");
    await expect(strip).toHaveAttribute("data-equilibrium-valid", String(uc0 === 1));
    if (uc0 === 0) {
      await expect(page.locator("#metrics")).toContainText("Frozen Uc differs from 1");
      await expect(strip).toHaveAttribute("data-instability-legend", "normalized equilibrium unavailable");
      await expect(strip).toHaveAttribute("data-instability-counts", /unavailable:[1-9]/);
    } else {
      await expect(strip).toHaveAttribute("data-instability-counts", /unavailable:0$/);
    }
  }
});
