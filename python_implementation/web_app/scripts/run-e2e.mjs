import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = process.env.E2E_PORT || "4173";
const url = `http://${host}:${port}/wizard_of_oz.html`;

async function canReachApp() {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApp(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await canReachApp()) return;
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before ${url} became available.`);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function stopServer(server) {
  if (!server) return;
  server.stdout?.destroy();
  server.stderr?.destroy();
  if (server.exitCode !== null) return;
  if (process.platform === "win32" && server.pid) {
    spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  }
  if (server.exitCode === null) {
    server.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
  }
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function runPlaywrightChecks() {
  console.log("starting browser checks");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    acceptDownloads: true,
    baseURL: `http://${host}:${port}`
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/wizard_of_oz.html");
    await page.getByRole("heading", { name: "OZwizard" }).waitFor({ state: "visible", timeout: 15000 });
    console.log("page loaded");

    const logo = page.getByAltText("OZwizard logo");
    await logo.waitFor({ state: "visible", timeout: 15000 });
    const logoSize = await logo.evaluate((node) => ({
      naturalHeight: node.naturalHeight,
      naturalWidth: node.naturalWidth
    }));
    assertOk(logoSize.naturalWidth === 498 && logoSize.naturalHeight === 575, "cropped logo dimensions did not load");

    assertOk((await page.getByRole("button", { name: "RK45" }).getAttribute("class"))?.includes("active"), "RK45 preset was not active");
    assertOk(await page.locator("#sidebarControls").evaluate((node) => node.open), "sidebar controls should be open on desktop");
    assertOk(await page.locator("#solverButtons button").count() === 3, "expected three compact solver buttons");
    const solverRows = await page.locator("#solverButtons button").evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top))
    );
    assertOk(new Set(solverRows).size === 1, "solver buttons should fit on one row");
    assertOk((await page.getByLabel("Compare selected solver to midpoint").count()) === 0, "midpoint comparison checkbox should be removed");
    const integrationControl = (name) => page.locator(`#integrationControls .slider-control:visible input[aria-label="${name}"]`);
    assertOk(await integrationControl("relative tol").count() === 1, "RK45 should show relative tol");
    assertOk(await integrationControl("absolute tol").count() === 1, "RK45 should show absolute tol");
    assertOk(await integrationControl("tolerance").count() === 0, "RK45 should hide midpoint tolerance");
    assertOk(await integrationControl("stability tolerance").count() === 0, "stability tolerance should be hidden unless auto-stop is enabled");
    await page.getByRole("button", { name: "Mid" }).click();
    assertOk(await integrationControl("tolerance").count() === 1, "midpoint should show tolerance");
    assertOk(await integrationControl("relative tol").count() === 0, "midpoint should hide relative tol");
    assertOk(await integrationControl("absolute tol").count() === 0, "midpoint should hide absolute tol");
    await page.locator("#runUntilStable").check();
    assertOk(await integrationControl("stability tolerance").count() === 1, "stability tolerance should show when auto-stop is enabled");
    assertOk(await integrationControl("stable cycles required").count() === 1, "stable cycles should show when auto-stop is enabled");
    await page.getByRole("button", { name: "RK45" }).click();
    assertOk(await integrationControl("relative tol").count() === 1, "RK45 should restore relative tol");
    assertOk(await integrationControl("tolerance").count() === 0, "RK45 should hide midpoint tolerance after switching back");
    await page.locator("#runUntilStable").uncheck();
    assertOk(await integrationControl("stability tolerance").count() === 0, "stability tolerance should hide when auto-stop is disabled");
    const tauTickPositions = await page.locator("#integrationControls .slider-scale span").evaluateAll((spans) =>
      spans.map((span) => span.style.getPropertyValue("--tick-position"))
    );
    assertOk(tauTickPositions[4] === "66.6667%", `tau=100 tick should be at 66.6667%, saw ${tauTickPositions[4]}`);
    assertOk(tauTickPositions[5] === "82.5707%", `tau=300 tick should use log placement, saw ${tauTickPositions[5]}`);
    assertOk((await page.locator("#statusPill").count()) === 0, "status pill should be folded into model output");
    await page.waitForFunction(() => document.querySelector("#metrics")?.textContent?.includes("models"), null, { timeout: 15000 });
    const initialMetrics = await page.locator("#metrics").textContent();
    assertOk(initialMetrics?.includes("stop") && initialMetrics.includes("fixed-time complete"), "metrics did not include the stop result");
    assertOk(initialMetrics?.includes("models"), "metrics did not render");
    assertOk(!initialMetrics?.includes("stop reason"), "metrics should not show the old stop reason label");
    assertOk(!initialMetrics?.includes("reference"), "metrics should not duplicate reference metadata");
    assertOk(!initialMetrics?.includes("driver"), "metrics should not duplicate driver controls");
    assertOk(!initialMetrics?.includes("solver"), "metrics should not duplicate solver controls");
    await page.waitForFunction(() => !document.body.innerText.includes("\\("), null, { timeout: 15000 });

    assertOk(await page.locator("[data-symbol='tau']").first().isVisible(), "tau symbol was not visible");
    const tauColor = await page.locator("[data-symbol='tau']").first().evaluate((node) => getComputedStyle(node).color);
    assertOk(tauColor === "rgb(158, 167, 255)", `unexpected tau color: ${tauColor}`);
    assertOk(await page.getByRole("heading", { name: "Equations Solved" }).isVisible(), "equations panel was not visible");
    assertOk(await page.getByRole("heading", { name: "Variables" }).isVisible(), "variables panel was not visible");
    assertOk(await page.getByRole("heading", { name: "Parameters" }).isVisible(), "parameters panel was not visible");
    assertOk((await page.locator(".equation-label").count()) === 0, "closure relations label should be removed");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-geometry-mode")) === "radius-dependent", "luminosity equations should start radius-dependent");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.89", "eta should match the default m value");
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "h", "ODE driver should start with sqrt(H)");
    assertOk(await page.locator("#initialR").isVisible(), "initial R cell was not visible");
    assertOk(await page.locator("#initialLr").isVisible(), "computed initial Lr cell was not visible");
    assertOk(await page.locator("#initialL").isVisible(), "computed initial L cell was not visible");
    await page.locator("#initialR mjx-container").waitFor({ state: "visible", timeout: 15000 });
    const initialRadiusControl = page.locator("input[aria-label='initial radius']").locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
    const initialRadiusText = await initialRadiusControl.textContent();
    assertOk(initialRadiusText?.includes("initial radius") && initialRadiusText.includes("1.1"), "initial radius value should be shown beside the parameter name");
    await page.locator("input[aria-label='initial radius']").evaluate((input) => {
      const slider = input;
      slider.value = "1.2";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const node = document.querySelector("#initialR");
      return node?.dataset.mathState === "ready"
        && node.textContent?.includes("1.2")
        && !node.textContent.includes("\\(")
        && Boolean(node.querySelector("mjx-container"));
    });
    await page.locator("[data-reset-key='r0']").click();
    assertOk((await page.locator("[data-value-for='tEnd']").textContent()) === "100", "default tau_max value should render as 100");
    const maxTauLabel = await page.locator("input[aria-label='max time']").evaluate((input) => {
      const slider = input;
      slider.value = "3";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      const label = document.querySelector("[data-value-for='tEnd']")?.textContent || "";
      slider.value = "2";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      return label;
    });
    assertOk(maxTauLabel === "1000", `max tau_max value should render as 1000, saw ${maxTauLabel}`);
    assertOk(await page.getByRole("heading", { name: "Physical", exact: true }).isVisible(), "physical parameter section was not visible");
    assertOk((await page.getByRole("heading", { name: "Derived" }).count()) === 0, "derived parameter section should be removed");
    assertOk(await page.getByRole("heading", { name: "Numerical" }).isVisible(), "numerical parameter section was not visible");
    const parameterOverflow = await page.locator(".parameters-panel").evaluate((node) => getComputedStyle(node).overflowY);
    assertOk(parameterOverflow === "auto", `parameters panel should scroll vertically, saw ${parameterOverflow}`);

    assertOk(await page.locator("canvas").count() === 4, "expected four plot canvases");
    assertOk(await page.getByRole("heading", { name: "Lightcurve" }).isVisible(), "Lightcurve heading was not visible");
    assertOk((await page.locator(".phase-anchor-control").textContent())?.includes("phase to"), "phase anchor control was not visible");
    assertOk((await page.getByRole("button", { name: "min light" }).getAttribute("aria-pressed")) === "true", "min-light phase anchor should start active");
    await page.getByRole("button", { name: "max light" }).click();
    assertOk((await page.getByRole("button", { name: "max light" }).getAttribute("aria-pressed")) === "true", "max-light phase anchor did not activate");
    await page.getByRole("button", { name: "min light" }).click();
    assertOk((await page.getByRole("button", { name: "min light" }).getAttribute("aria-pressed")) === "true", "min-light phase anchor did not reactivate");
    assertOk(await page.getByRole("heading", { name: "RV Curve" }).isVisible(), "RV Curve heading was not visible");
    assertOk(await page.getByRole("heading", { name: "History" }).isVisible(), "History heading was not visible");
    const bodyText = await page.locator("body").innerText();
    assertOk(!bodyText.includes("state variables"), "old History subtitle should be removed");
    assertOk(!bodyText.includes("total, radiative, convective"), "old Luminosity Evolution subtitle should be removed");
    assertOk(await page.locator("#lightLegend").count() === 0, "phase luminosity legend should be removed");
    assertOk(await page.locator("#velocityLegend").count() === 0, "phase velocity legend should be removed");
    const hasPaint = await page.locator("#lightCanvas").evaluate((canvas) => {
      const node = canvas;
      const ctx = node.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
    });
    assertOk(hasPaint, "light curve canvas was blank");

    const timeLegend = await page.locator("#timeLegend").textContent();
    assertOk(
      timeLegend?.includes("radius") && timeLegend.includes("nonadiabatic pressure factor"),
      "time legend did not render expected entries"
    );
    const radiusToggle = page.locator("#timeLegend [data-plot-series='R']");
    assertOk((await radiusToggle.getAttribute("aria-pressed")) === "true", "radius toggle should start visible");
    await radiusToggle.click();
    assertOk((await radiusToggle.getAttribute("aria-pressed")) === "false", "radius toggle did not hide the radius series");
    await radiusToggle.click();
    assertOk((await radiusToggle.getAttribute("aria-pressed")) === "true", "radius toggle did not restore the radius series");
    await page.locator("#variableM").uncheck();
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-geometry-mode")) === "fixed", "luminosity equations did not switch back to fixed geometry");
    await page.locator("#variableM").check();
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-geometry-mode")) === "radius-dependent", "luminosity equations did not switch to radius-dependent geometry");
    const timeLegendHtmlBeforeMSlider = await page.locator("#timeLegend").innerHTML();
    await page.locator("input[aria-label='shell form factor']").evaluate((input) => {
      const slider = input;
      slider.value = "15";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk(await page.locator("#luminosityEquations mjx-container").count() > 0, "rendered equations should remain visible while m changes");
    assertOk(await page.locator("#metrics mjx-container").count() > 0, "rendered output metrics should remain visible while m changes");
    assertOk((await page.locator("#timeLegend").innerHTML()) === timeLegendHtmlBeforeMSlider, "plot legend should not be rebuilt while m changes");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.93", "eta did not update when m changed");
    await page.locator("input[aria-label='shell form factor']").evaluate((input) => {
      const slider = input;
      slider.value = "3";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.00", "eta should keep two decimal places at the Baker limit");
    await page.locator("[data-reset-key='m']").click();
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.89", "eta did not reset with m");
    await page.locator("[data-driver='abs-v']").click();
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "abs-v", "ODE driver did not switch to sqrt(abs(V))");
    await page.locator("[data-driver='h']").click();
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "h", "ODE driver did not switch back to sqrt(H)");

    const timeCanvas = page.locator("#timeCanvas");
    const timeBox = await timeCanvas.boundingBox();
    assertOk(Boolean(timeBox), "time canvas bounds were unavailable");
    const timeReset = page.locator("[data-plot-reset='time']");
    assertOk(await timeReset.isDisabled(), "time zoom reset should start disabled");
    await page.mouse.move(timeBox.x + 90, timeBox.y + 55);
    await page.mouse.down();
    await page.mouse.move(timeBox.x + 210, timeBox.y + 170);
    await page.mouse.up();
    assertOk(!(await timeReset.isDisabled()), "drag selection did not enable time zoom reset");
    await timeReset.click();
    assertOk(await timeReset.isDisabled(), "time zoom reset did not clear the selected range");
    await page.mouse.move(timeBox.x + 210, timeBox.y + 140);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(timeBox.x + 140, timeBox.y + 110);
    await page.mouse.up({ button: "right" });
    assertOk(!(await timeReset.isDisabled()), "right-drag pan did not enable time reset");
    await timeReset.click();
    assertOk(await timeReset.isDisabled(), "time reset did not clear the panned range");

    const lumCanvas = page.locator("#lumCanvas");
    const lumBox = await lumCanvas.boundingBox();
    assertOk(Boolean(lumBox), "luminosity evolution canvas bounds were unavailable");
    const lumReset = page.locator("[data-plot-reset='lum']");
    assertOk(await lumReset.isDisabled(), "luminosity reset should start disabled");
    await page.mouse.move(lumBox.x + 210, lumBox.y + 140);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(lumBox.x + 140, lumBox.y + 110);
    await page.mouse.up({ button: "right" });
    assertOk(!(await lumReset.isDisabled()), "right-drag pan did not enable luminosity reset");
    await lumReset.click();
    assertOk(await lumReset.isDisabled(), "luminosity reset did not clear the panned range");

    await page.getByRole("button", { name: "DOP853" }).click();
    assertOk((await page.getByRole("button", { name: "DOP853" }).getAttribute("class"))?.includes("active"), "DOP853 was not active after click");
    console.log("interactions passed");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click()
    ]);
    const path = await download.path();
    assertOk(Boolean(path), "download path was missing");
    const csv = await readFile(path, "utf8");
    assertOk(csv.split(/\r?\n/, 1)[0] === "tau,R,V,H,Uc,Lr,Lc,L", "downloaded CSV header was incorrect");
    assertOk(pageErrors.length === 0, `page errors: ${pageErrors.join("; ")}`);
    console.log("download passed");

    await page.setViewportSize({ width: 760, height: 900 });
    assertOk(!(await page.locator("#sidebarControls").evaluate((node) => node.open)), "sidebar controls should collapse below the half-width threshold");
    await page.locator("#sidebarControls > summary").click();
    assertOk(await page.locator("#physicalControls").isVisible(), "collapsed sidebar controls did not reopen");
  } finally {
    await context.close();
    await browser.close();
    console.log("browser closed");
  }
}

let server;
let startedServer = false;

try {
  if (!(await canReachApp())) {
    server = spawn(
      process.execPath,
      ["./node_modules/vite/bin/vite.js", "--host", host, "--port", port, "--strictPort"],
      { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true }
    );
    startedServer = true;
    await waitForApp(server);
  }

  console.log(`server ready at ${url}`);
  await runPlaywrightChecks();
  console.log("e2e checks passed");
} finally {
  if (startedServer) stopServer(server);
}
