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
    assertOk(await page.locator("#solverButtons button").count() === 3, "expected three compact solver buttons");
    const solverRows = await page.locator("#solverButtons button").evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top))
    );
    assertOk(new Set(solverRows).size === 1, "solver buttons should fit on one row");
    assertOk((await page.getByLabel("Compare selected solver to midpoint").count()) === 0, "midpoint comparison checkbox should be removed");
    assertOk((await page.locator("#statusPill").textContent())?.includes("stop:"), "status pill did not update");
    assertOk((await page.locator("#metrics").textContent())?.includes("stop reason"), "metrics did not render");
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
    assertOk(await page.getByRole("heading", { name: "Tunable" }).isVisible(), "tunable parameter section was not visible");
    assertOk((await page.getByRole("heading", { name: "Derived" }).count()) === 0, "derived parameter section should be removed");
    assertOk(await page.getByRole("heading", { name: "Numerical" }).isVisible(), "numerical parameter section was not visible");
    const parameterOverflow = await page.locator(".parameters-panel").evaluate((node) => getComputedStyle(node).overflowY);
    assertOk(parameterOverflow === "auto", `parameters panel should scroll vertically, saw ${parameterOverflow}`);

    assertOk(await page.locator("canvas").count() === 4, "expected four plot canvases");
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
    await page.locator("input[aria-label='shell form factor']").evaluate((input) => {
      const slider = input;
      slider.value = "15";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
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
