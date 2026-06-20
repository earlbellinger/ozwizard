import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function referencePanelMetrics(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".reference-grid");
    if (!grid) throw new Error("missing reference grid");
    const panels = [...document.querySelectorAll<HTMLElement>(".reference-grid > .reference-panel")];
    return {
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      panels: panels.map((node) => ({
        heading: node.querySelector("h3")?.textContent || "",
        height: Math.round(node.getBoundingClientRect().height),
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight
      }))
    };
  });
}

test("app renders solver controls, canvases, and output metrics", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  const sonificationToggle = page.locator("#sonificationToggle");
  await expect(sonificationToggle).not.toBeDisabled();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Start lightcurve sonification" })).toBeVisible();
  expect(await sonificationToggle.evaluate((node) => getComputedStyle(node, "::after").opacity)).toBe("1");
  await expect(page.getByLabel("reference pitch")).toHaveValue("60");
  await expect(page.locator("#sonificationHz")).toHaveText("262 Hz");
  const sonificationLayout = await page.locator(".brand-title-row").evaluate((row) => {
    const title = row.querySelector("h1")!.getBoundingClientRect();
    const control = row.querySelector(".sonification-control")!.getBoundingClientRect();
    return {
      titleRight: title.right,
      controlLeft: control.left,
      titleCenterY: title.top + title.height / 2,
      controlCenterY: control.top + control.height / 2
    };
  });
  expect(sonificationLayout.controlLeft).toBeGreaterThan(sonificationLayout.titleRight);
  expect(Math.abs(sonificationLayout.controlCenterY - sonificationLayout.titleCenterY)).toBeLessThan(6);
  await page.locator("#sonificationPitch").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "69";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#sonificationHz")).toHaveText("440 Hz");
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Stop lightcurve sonification" })).toBeVisible();
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByAltText("OZwizard logo")).toBeVisible();
  await expect(page.getByAltText("OZwizard logo")).toHaveJSProperty("naturalWidth", 498);
  await expect(page.locator("#sidebarControls")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "RK45" })).toHaveClass(/active/);
  await expect(page.locator("#solverButtons button")).toHaveCount(3);
  await expect(page.locator("#presetButtons")).not.toBeVisible();
  await expect(page.locator("#presetSummaryLabel")).toContainText("RR Lyrae low-amplitude fundamental, damped");
  await page.locator("#presetPanel summary").click();
  await expect(page.locator("#presetButtons")).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae low-amplitude fundamental, damped" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Baker radiative pulsator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae first overtone", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae first overtone, damped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae high-amplitude first overtone" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae low-amplitude fundamental, damped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Local radiative OZ1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /corrected/i })).toHaveCount(0);
  await expect(page.getByLabel("Compare selected solver to midpoint")).toHaveCount(0);
  await expect(page.locator("#runUntilStable")).not.toBeChecked();
  const integrationControl = (name: string) => page.locator(`#integrationControls .slider-control:visible input[aria-label="${name}"]`);
  await expect(integrationControl("relative tol")).toHaveCount(1);
  await expect(integrationControl("absolute tol")).toHaveCount(1);
  await expect(integrationControl("tolerance")).toHaveCount(0);
  await expect(integrationControl("stability tolerance")).toHaveCount(0);
  await page.getByRole("button", { name: "Mid" }).click();
  await expect(integrationControl("tolerance")).toHaveCount(1);
  await expect(integrationControl("relative tol")).toHaveCount(0);
  await expect(integrationControl("absolute tol")).toHaveCount(0);
  await page.locator("#runUntilStable").check();
  await expect(integrationControl("stability tolerance")).toHaveCount(1);
  await expect(integrationControl("stable cycles required")).toHaveCount(1);
  await page.getByRole("button", { name: "RK45" }).click();
  await page.locator("#runUntilStable").uncheck();
  await expect(page.locator("#integrationControls .slider-scale span").nth(4)).toHaveAttribute("style", /66\.6667%/);
  await expect(page.locator("#integrationControls .slider-scale span").nth(5)).toHaveAttribute("style", /82\.5707%/);
  const maxTauLabel = await page.locator("input[aria-label='max time']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const label = document.querySelector("[data-value-for='tEnd']")?.textContent || "";
    slider.value = "2";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return label;
  });
  expect(maxTauLabel).toBe("1000");
  const physicalControlsBox = await page.locator("#physicalControls").boundingBox();
  const geometryBox = await page.locator("#variableM").boundingBox();
  const driverBox = await page.locator("[data-driver='h']").boundingBox();
  expect(physicalControlsBox).not.toBeNull();
  expect(geometryBox).not.toBeNull();
  expect(driverBox).not.toBeNull();
  expect(physicalControlsBox!.y).toBeLessThan(geometryBox!.y);
  expect(geometryBox!.y).toBeLessThan(driverBox!.y);
  await expect(page.locator("#statusPill")).toHaveCount(0);
  await expect(page.locator("#metrics")).toContainText("stop");
  await expect(page.locator("#metrics")).toContainText("fixed-time complete");
  await expect(page.locator("#metrics")).toContainText("models");
  await expect(page.locator("#metrics")).not.toContainText("stop reason");
  await expect(page.locator("#metrics")).not.toContainText("reference");
  await expect(page.locator("#metrics")).not.toContainText("driver");
  await expect(page.locator("#metrics")).not.toContainText("solver");
  await expect(page.getByRole("heading", { name: "Lightcurve" })).toBeVisible();
  await expect(page.locator(".phase-anchor-control")).toContainText("phase to");
  await expect(page.getByRole("button", { name: "min light" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "min light" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "max light" }).click();
  await expect(page.getByRole("button", { name: "max light" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "max light" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "min light" }).click();
  await expect(page.getByRole("button", { name: "min light" })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: "RV Curve" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("state variables");
  await expect(page.locator("body")).not.toContainText("total, radiative, convective");
  await expect.poll(async () => (await page.locator("body").innerText()).includes("\\(")).toBe(false);

  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(4);
  await expect(page.locator("#lightLegend")).toHaveCount(0);
  await expect(page.locator("#velocityLegend")).toHaveCount(0);
  const tauCell = page.locator("[data-symbol='tau']").first();
  const tauRow = tauCell.locator("xpath=ancestor::tr");
  await expect(tauCell).toBeVisible();
  await expect(tauRow).toContainText("free-fall/dynamical time");
  await expect(tauCell).toHaveCSS("color", "rgb(158, 167, 255)");
  await expect(page.locator("#initialR")).toBeVisible();
  await expect(page.locator("#initialLr")).toBeVisible();
  await expect(page.locator("#initialL")).toBeVisible();
  const initialRadiusControl = page.locator("input[aria-label='initial radius']").locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
  await expect(initialRadiusControl).toContainText("initial radius");
  await expect(initialRadiusControl).toContainText("1.1");
  await expect(page.locator("[data-value-for='tEnd']")).toHaveText("100");
  await expect(page.locator(".equation-label")).toHaveCount(0);
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.89");
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "h");
  await expect(page.getByRole("heading", { name: "Derived" })).toHaveCount(0);
  await expect(page.locator("#timeLegend")).toContainText("radius");
  await expect(page.locator("#timeLegend")).toContainText("nonadiabatic pressure factor");
  const legendHtml = await page.locator("#timeLegend").innerHTML();
  expect(legendHtml).toContain("R");
  expect(legendHtml).toContain("H");
  const hasPaint = await page.locator("#lightCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasPaint).toBe(true);
  await page.locator("#variableM").uncheck();
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "fixed");
  await page.locator("#variableM").check();
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  const timeLegendHtmlBeforeMSlider = await page.locator("#timeLegend").innerHTML();
  await page.locator("input[aria-label='shell form factor']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "15";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#luminosityEquations mjx-container")).not.toHaveCount(0);
  await expect(page.locator("#metrics mjx-container")).not.toHaveCount(0);
  expect(await page.locator("#timeLegend").innerHTML()).toBe(timeLegendHtmlBeforeMSlider);
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.93");
  await page.locator("input[aria-label='shell form factor']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.00");
  await page.locator("[data-reset-key='m']").click();
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.89");
  await page.locator("[data-driver='abs-v']").click();
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "abs-v");
  await page.locator("[data-driver='h']").click();
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "h");

  await page.locator("input[aria-label='max time']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#metrics")).toContainText("1000", { timeout: 15000 });
  await page.getByRole("button", { name: "DOP853" }).click();
  await expect(page.getByRole("button", { name: "DOP853" })).toHaveClass(/active/);
  await expect(page.locator("#metrics")).toContainText("1000", { timeout: 15000 });
  await page.getByRole("button", { name: "Final cycles" }).click();
  await expect(page.getByRole("button", { name: "Final cycles" })).toHaveClass(/active/);
  await expect(page.locator("#metrics")).not.toContainText("final cycles");
  await expect(page.locator("#metrics")).not.toContainText("unavailable");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, "utf8");
  expect(csv.split(/\r?\n/, 1)[0]).toBe("tau,R,V,H,Uc,Lr,Lc,L");

  await page.setViewportSize({ width: 1300, height: 1200 });
  const mediumReferenceLayout = await referencePanelMetrics(page);
  expect(mediumReferenceLayout.gridColumns.split(" ")).toHaveLength(2);
  const mediumHeights = mediumReferenceLayout.panels.map((panel) => panel.height);
  expect(new Set(mediumHeights).size).toBeGreaterThan(1);

  await page.setViewportSize({ width: 1800, height: 1200 });
  const wideReferenceLayout = await referencePanelMetrics(page);
  expect(wideReferenceLayout.panels.map((panel) => panel.height)).toEqual([500, 500, 500]);
  const wideVariables = wideReferenceLayout.panels.find((panel) => panel.heading === "Variables");
  const wideParameters = wideReferenceLayout.panels.find((panel) => panel.heading === "Parameters");
  expect(wideVariables?.scrollHeight).toBeGreaterThanOrEqual(wideVariables?.clientHeight || 0);
  expect(wideParameters?.scrollHeight).toBeGreaterThan(wideParameters?.clientHeight || 0);

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.locator("#sidebarControls")).not.toHaveAttribute("open", "");
  await expect(page.locator("#sidebarControls > summary")).toBeVisible();
  await page.locator("#sidebarControls > summary").click();
  await expect(page.locator("#physicalControls")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
