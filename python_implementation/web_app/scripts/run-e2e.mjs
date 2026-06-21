import { spawn, spawnSync } from "node:child_process";
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
    const metadata = await page.evaluate(() => {
      const meta = (selector) => document.querySelector(selector)?.getAttribute("content") || "";
      const link = (selector) => document.querySelector(selector)?.getAttribute("href") || "";
      return {
        title: document.title,
        description: meta("meta[name='description']"),
        canonical: link("link[rel='canonical']"),
        icon32: link("link[rel='icon'][sizes='32x32']"),
        appleTouchIcon: link("link[rel='apple-touch-icon']"),
        manifest: link("link[rel='manifest']"),
        ogImage: meta("meta[property='og:image']"),
        twitterCard: meta("meta[name='twitter:card']")
      };
    });
    assertOk(metadata.title === "OZwizard | Interactive Stellar Pulsation Explorer", "document title should describe the shared app");
    assertOk(
      metadata.description === "Interactive one-zone convection and pulsation explorer for Stellingwerf-style stellar-envelope models.",
      "meta description should describe OZwizard"
    );
    assertOk(metadata.canonical === "https://earlbellinger.com/apps/ozwizard/", "canonical URL should target the deployed app");
    assertOk(metadata.icon32 === "./assets/favicon-32x32.png", "32px favicon link should be present");
    assertOk(metadata.appleTouchIcon === "./assets/apple-touch-icon.png", "Apple touch icon link should be present");
    assertOk(metadata.manifest === "./site.webmanifest", "web manifest link should be present");
    assertOk(
      metadata.ogImage === "https://earlbellinger.com/apps/ozwizard/assets/ozwizard-social-card.png",
      "Open Graph image should use the deployed social card"
    );
    assertOk(metadata.twitterCard === "summary_large_image", "Twitter card should use a large preview image");

    const pianoToggle = page.locator("#pianoToggle");
    const sonificationToggle = page.locator("#sonificationToggle");
    assertOk(!(await pianoToggle.isDisabled()), "piano toggle should be enabled");
    assertOk((await pianoToggle.getAttribute("aria-pressed")) === "false", "piano panel should start closed");
    assertOk(!(await page.locator("#pianoPanel").isVisible()), "piano panel should start hidden");
    assertOk(!(await sonificationToggle.isDisabled()), "sonification toggle should be enabled");
    assertOk((await sonificationToggle.getAttribute("aria-pressed")) === "false", "sonification should start muted");
    assertOk((await page.locator("#sonificationHz").textContent()) === "262 Hz", "sonification should default to middle C");
    const sonificationLayout = await page.locator(".brand-title-row").evaluate((row) => {
      const title = row.querySelector("h1").getBoundingClientRect();
      const control = row.querySelector(".sonification-control").getBoundingClientRect();
      return {
        titleRight: title.right,
        controlLeft: control.left,
        titleCenterY: title.top + title.height / 2,
        controlCenterY: control.top + control.height / 2
      };
    });
    assertOk(sonificationLayout.controlLeft > sonificationLayout.titleRight, "sonification controls should sit to the right of OZwizard");
    assertOk(
      Math.abs(sonificationLayout.controlCenterY - sonificationLayout.titleCenterY) < 6,
      "sonification controls should stay on the OZwizard title row"
    );
    await page.locator("#sonificationPitch").evaluate((input) => {
      input.value = "69";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#sonificationHz").textContent()) === "440 Hz", "sonification pitch slider should reach A4");
    await sonificationToggle.click();
    assertOk((await sonificationToggle.getAttribute("aria-pressed")) === "true", "sonification did not turn on");
    await sonificationToggle.click();
    assertOk((await sonificationToggle.getAttribute("aria-pressed")) === "false", "sonification did not turn off");
    await pianoToggle.click();
    assertOk((await pianoToggle.getAttribute("aria-pressed")) === "true", "piano mode did not turn on");
    assertOk(await page.locator("#pianoPanel").isVisible(), "piano panel did not open");
    assertOk(await sonificationToggle.isDisabled(), "continuous speaker should be disabled in piano mode");
    assertOk((await page.getByLabel("shown piano octaves").inputValue()) === "3", "piano octave slider should start at C3-B4");
    assertOk((await page.locator("#sonificationHz").textContent()) === "C3-B4", "piano mode should show visible octaves");
    assertOk((await page.locator(".piano-key").count()) === 24, "piano should render two octaves of keys");
    assertOk((await page.locator("#pianoSustainValue").textContent()) === "38%", "piano sustain default should render");
    assertOk((await page.locator(".sonify-source-control").textContent())?.includes("sonify:"), "sonification source control should render");
    const luminositySource = page.locator("[data-sonify-source='luminosity']");
    const velocitySource = page.locator("[data-sonify-source='velocity']");
    const pressureSource = page.locator("[data-sonify-source='pressure']");
    assertOk((await luminositySource.getAttribute("aria-pressed")) === "true", "luminosity should be the default sonification source");
    assertOk(!(await page.locator("#pressurePhasePanel").isVisible()), "pressure panel should start hidden for luminosity sonification");
    await velocitySource.click();
    assertOk((await velocitySource.getAttribute("aria-pressed")) === "true", "radial velocity source did not activate");
    assertOk(!(await page.locator("#pressurePhasePanel").isVisible()), "pressure panel should stay hidden for radial velocity sonification");
    await pressureSource.click();
    assertOk((await pressureSource.getAttribute("aria-pressed")) === "true", "pressure source did not reactivate");
    assertOk(await page.locator("#pressurePhasePanel").isVisible(), "pressure panel should show when pressure is selected");
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#pressureCanvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0);
    }, null, { timeout: 5000 });
    await luminositySource.click();
    assertOk((await luminositySource.getAttribute("aria-pressed")) === "true", "luminosity source did not reactivate");
    assertOk(!(await page.locator("#pressurePhasePanel").isVisible()), "pressure panel should hide when returning to luminosity sonification");
    assertOk((await page.locator("[data-piano-reset]").count()) === 4, "piano ADSR reset buttons should render");
    const sustainReset = page.getByRole("button", { name: "Reset sustain" });
    assertOk(await sustainReset.isDisabled(), "piano sustain reset should start disabled");
    await page.locator("#pianoSustain").evaluate((input) => {
      input.value = "0.72";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#pianoSustainValue").textContent()) === "72%", "piano sustain slider should update");
    assertOk(!(await sustainReset.isDisabled()), "piano sustain reset should enable after a change");
    await sustainReset.click();
    assertOk((await page.locator("#pianoSustainValue").textContent()) === "38%", "piano sustain reset should restore the default");
    assertOk(await sustainReset.isDisabled(), "piano sustain reset should disable at the default");
    await page.locator("#sonificationPitch").evaluate((input) => {
      input.value = "4";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#sonificationHz").textContent()) === "C4-B5", "piano octave slider should update visible octaves");
    await page.getByLabel("shown piano octaves").focus();
    await page.keyboard.down("z");
    assertOk((await page.locator(".piano-key[data-midi='60']").getAttribute("class"))?.includes("active"), "keyboard Z should press visible C");
    await page.keyboard.up("z");
    const cKeyClassAfterRelease = await page.locator(".piano-key[data-midi='60']").getAttribute("class");
    assertOk(!cKeyClassAfterRelease?.includes("active"), "keyboard Z should release visible C");
    await pianoToggle.click();
    assertOk(!(await page.locator("#pianoPanel").isVisible()), "piano panel did not close");
    assertOk(!(await sonificationToggle.isDisabled()), "speaker should re-enable after piano mode closes");
    assertOk((await sonificationToggle.getAttribute("aria-pressed")) === "false", "speaker should stay muted after piano mode closes");
    assertOk((await page.getByLabel("reference pitch").inputValue()) === "69", "reference pitch slider should be restored after piano mode");
    assertOk((await page.locator("#sonificationHz").textContent()) === "440 Hz", "reference pitch readout should return after piano mode");

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
    const sectionActionLayouts = await page.locator(".section-title-with-actions").evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = node.querySelector("span")?.getBoundingClientRect();
        const actions = node.querySelector(".section-action-row, .grid-mode-control")?.getBoundingClientRect();
        const buttonHeights = [...node.querySelectorAll(".section-action-row button, .grid-mode-control input")]
          .map((control) => Math.round(control.getBoundingClientRect().height));
        if (!label || !actions) return null;
        return {
          label: node.querySelector("span")?.textContent?.trim() || "",
          labelCenterY: Math.round(label.top + label.height / 2),
          actionsCenterY: Math.round(actions.top + actions.height / 2),
          buttonHeights
        };
      })
    );
    assertOk(sectionActionLayouts.map((layout) => layout?.label).join("|") === "Physical Parameters|Integration|Convective Driver|Phase Window", "expected compact action rows in four section headers");
    sectionActionLayouts.forEach((layout) => {
      assertOk(layout?.actionsCenterY === layout?.labelCenterY, `${layout?.label || "section"} buttons should sit on the header line`);
      assertOk(Math.max(...layout.buttonHeights) <= 30, `${layout?.label || "section"} buttons should be compact`);
    });
    assertOk(await page.locator("#physicalControlSection").evaluate((node) => node.open), "physical controls should start open");
    assertOk(await page.locator("#integrationControlSection").evaluate((node) => node.open), "integration controls should start open");
    assertOk(!(await page.locator("#initialControlSection").evaluate((node) => node.open)), "initial conditions should start collapsed");
    assertOk(!(await page.locator("#initialControls").isVisible()), "initial condition sliders should start hidden");
    assertOk(!(await page.locator("#presetButtons").isVisible()), "preset buttons should start hidden");
    assertOk((await page.locator("input[aria-label='convective response']").inputValue()) === "1", "convective response should default to one");
    await page.locator("#presetPanel summary").click();
    assertOk(await page.locator("#presetButtons").isVisible(), "preset buttons should show inside the presets menu");
    assertOk(await page.locator("#presetPanel #resetPreset").isVisible(), "reset preset should live inside the presets menu");
    assertOk(await page.getByRole("button", { name: "Download CSV" }).count() === 0, "download CSV button should be removed");
    await page.locator("#initialControlSection > summary").click();
    assertOk(await page.locator("#initialControlSection").evaluate((node) => node.open), "initial conditions should open from its summary");
    assertOk(await page.locator("#initialControls").isVisible(), "initial condition sliders should show after opening");
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
    const tauTickLabels = await page.locator("#integrationControls .slider-scale span").evaluateAll((spans) =>
      spans.map((span) => span.textContent?.trim()).join("|")
    );
    assertOk(tauTickLabels === "1|3|10|30|100|300", `tau scale should omit the overlapping 1000 label, saw ${tauTickLabels}`);
    const tauTickEdges = await page.locator("#integrationControls .slider-scale span").evaluateAll((spans) =>
      spans.map((span) => span.getAttribute("data-scale-edge") || "").join("|")
    );
    assertOk(tauTickEdges === "start|||||", `tau scale should only edge-anchor the first visible label, saw ${tauTickEdges}`);
    assertOk((await page.locator("#statusPill").count()) === 0, "status pill should be folded into model output");
    await page.waitForFunction(
      () => document.querySelector("#metrics")?.textContent?.includes("fixed-time complete"),
      null,
      { timeout: 15000 }
    );
    const initialMetrics = await page.locator("#metrics").textContent();
    assertOk(initialMetrics?.includes("stop") && initialMetrics.includes("fixed-time complete"), "metrics did not include the stop result");
    assertOk(initialMetrics?.includes("models"), "metrics did not render");
    assertOk(!initialMetrics?.includes("stop reason"), "metrics should not show the old stop reason label");
    assertOk(!initialMetrics?.includes("reference"), "metrics should not duplicate reference metadata");
    assertOk(!initialMetrics?.includes("driver"), "metrics should not duplicate driver controls");
    assertOk(!initialMetrics?.includes("solver"), "metrics should not duplicate solver controls");
    await page.waitForFunction(() => !document.body.innerText.includes("\\("), null, { timeout: 15000 });
    const dynamicChip = page.locator("#metrics [data-stability-kind='dynamic']");
    const secularChip = page.locator("#metrics [data-stability-kind='secular']");
    const pulsationalChip = page.locator("#metrics [data-stability-kind='pulsational']");
    const dynamicDetail = await dynamicChip.getAttribute("data-stability-detail");
    const secularDetail = await secularChip.getAttribute("data-stability-detail");
    const pulsationalDetail = await pulsationalChip.getAttribute("data-stability-detail");
    assertOk(dynamicDetail?.includes("Gamma1=1.1") && dynamicDetail.includes("4/10 = 0.4") && dynamicDetail.includes("dynamically stable"), "dynamic stability chip should plug in current values");
    assertOk(secularDetail?.includes("10*1") && secularDetail.includes("(10 - 4)*(3 + 4) = 56") && secularDetail.includes("secularly stable"), "secular stability chip should plug in current values");
    assertOk(pulsationalDetail?.includes("Gamma1=1.1") && pulsationalDetail.includes("= 7 \u226E 0 -> pulsationally unstable"), "pulsational stability chip should plug in current values with a slashed failed inequality");
    assertOk((await dynamicChip.getAttribute("title")) === null, "stability chips should not use a separate hover tooltip");
    assertOk((await dynamicChip.getAttribute("data-stability-expanded"))?.includes("\\ozChiZero{10}"), "dynamic chip should keep expanded values colored by variable macros");
    const dynamicBox = await dynamicChip.boundingBox();
    assertOk(Boolean(dynamicBox), "dynamic stability chip bounds should be available");
    const dynamicInitialText = await dynamicChip.textContent();
    assertOk(dynamicInitialText?.includes("χ0") && !dynamicInitialText.includes("4/10"), "dynamic stability chip should start with variable names");
    await dynamicChip.hover();
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "expanded");
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("4/10=0.4"));
    assertOk((await dynamicChip.textContent())?.includes("4/10=0.4"), "hovering a stability chip should replace variables inline with substituted values");
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "default");
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("χ0"));
    await dynamicChip.click();
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "expanded");
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("4/10=0.4"));
    assertOk((await dynamicChip.textContent())?.includes("4/10=0.4"), "clicking a stability chip should replace variables inline with substituted values");
    assertOk((await page.locator("#stabilityChipTooltip").count()) === 0, "stability chips should not create a separate tooltip box");
    await page.locator("#plotGrid").click({ position: { x: 12, y: 12 } });
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "default");
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("χ0"));
    assertOk((await dynamicChip.textContent())?.includes("χ0"), "outside click should restore the variable-name formula");
    await page.mouse.move(5, 5);
    await dynamicChip.evaluate((node) => {
      node.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 91,
        pointerType: "touch",
        clientX: 20,
        clientY: 20
      }));
    });
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "expanded", null, { timeout: 1500 });
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("4/10=0.4"), null, { timeout: 1500 });
    assertOk((await dynamicChip.textContent())?.includes("4/10=0.4"), "long-pressing a stability chip should replace variables inline");
    await dynamicChip.evaluate((node) => {
      node.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 91,
        pointerType: "touch",
        clientX: 20,
        clientY: 20
      }));
    });
    await page.locator("#plotGrid").click({ position: { x: 12, y: 12 } });
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.getAttribute("data-stability-view") === "default");
    await page.waitForFunction(() => document.querySelector("#metrics [data-stability-kind='dynamic']")?.textContent?.includes("χ0"));
    assertOk((await dynamicChip.textContent())?.includes("χ0"), "outside click should restore the stability chip formula");

    assertOk(await page.locator("[data-symbol='tau']").first().isVisible(), "tau symbol was not visible");
    const tauRowText = await page.locator("[data-symbol='tau']").first().locator("xpath=ancestor::tr").textContent();
    assertOk(tauRowText?.includes("Time"), "tau row should label the variable as Time");
    assertOk(tauRowText?.includes("dynamical time"), "tau row should describe the dynamical time scaling");
    assertOk(!tauRowText?.includes("free-fall"), "tau row should not use the old free-fall/dynamical phrasing");
    assertOk(!tauRowText?.includes("derivatives such as"), "tau row should not include the old derivative explanation");
    const tauColor = await page.locator("[data-symbol='tau']").first().evaluate((node) => getComputedStyle(node).color);
    assertOk(tauColor === "rgb(139, 148, 158)", `unexpected tau color: ${tauColor}`);
    assertOk(await page.getByRole("heading", { name: "Equations Solved" }).isVisible(), "equations panel was not visible");
    assertOk(await page.getByRole("heading", { name: "Variables" }).isVisible(), "variables panel was not visible");
    assertOk(await page.getByRole("heading", { name: "Parameters" }).isVisible(), "parameters panel was not visible");
    assertOk((await page.locator(".equation-label").count()) === 0, "closure relations label should be removed");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-geometry-mode")) === "radius-dependent", "luminosity equations should start radius-dependent");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-geometry-layout")) === "stacked", "geometry equation should keep eta on its own line");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.89", "eta should match the default chi0 value");
    const sourceText = await page.evaluate(async () => (await fetch("/src/main.ts")).text());
    const modelText = await page.evaluate(async () => (await fetch("/src/model.ts")).text());
    const htmlText = await page.evaluate(async () => (await fetch("/wizard_of_oz.html")).text());
    assertOk(
      sourceText.includes("\\\\ozChiZero{\\\\chi_0}") && sourceText.includes("\\\\ozChi{\\\\chi}") && sourceText.includes("\\\\ozEta{\\\\eta}") && sourceText.includes("\\\\ozNeutral{\\\\gamma_r}") && htmlText.includes("\\ozChi{\\chi}"),
      "web app source should use separate chi, chi0, and eta notation"
    );
    assertOk(modelText.includes("Thin shell form factor"), "chi0 should use Thin shell form factor terminology");
    assertOk(!modelText.includes("Reference shell form factor"), "chi0 should not use old Reference shell form factor terminology");
    assertOk(!sourceText.includes("free-fall/dynamical") && !htmlText.includes("free-fall/dynamical"), "web app should use dynamical time wording consistently");
    assertOk(sourceText.includes("\\\\ozChi{\\\\chi_0}") === false, "chi0 should not use the active chi color macro");
    assertOk(!sourceText.includes("\\\\mathrm{eff}") && !htmlText.includes("\\mathrm{eff}"), "web app source should not use chi_eff notation");
    assertOk(!sourceText.includes("\\\\ozMass") && !htmlText.includes("\\ozMass"), "web app source should not use the old mass macro");
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "h", "ODE driver should start with sqrt(H)");
    assertOk(await page.locator("#initialR").isVisible(), "initial R cell was not visible");
    assertOk(await page.locator("#initialLr").isVisible(), "computed initial Lr cell was not visible");
    assertOk(await page.locator("#initialL").isVisible(), "computed initial L cell was not visible");
    const referenceType = await page.evaluate(() => {
      const physicalText = document.querySelector(".notes-grid > .content-panel:not(.reference-panel) p");
      const variableMeaning = document.querySelector("[data-symbol='tau']")?.closest("tr")?.lastElementChild;
      const parameterMeaning = document.querySelector("#tunableParameterTable td:last-child");
      if (!(physicalText instanceof HTMLElement) || !(variableMeaning instanceof HTMLElement) || !(parameterMeaning instanceof HTMLElement)) {
        throw new Error("missing reference typography target");
      }
      const physicalStyle = getComputedStyle(physicalText);
      const variableStyle = getComputedStyle(variableMeaning);
      const parameterStyle = getComputedStyle(parameterMeaning);
      return {
        physicalFontSize: physicalStyle.fontSize,
        physicalLineHeight: physicalStyle.lineHeight,
        variableFontSize: variableStyle.fontSize,
        variableLineHeight: variableStyle.lineHeight,
        parameterFontSize: parameterStyle.fontSize,
        parameterLineHeight: parameterStyle.lineHeight
      };
    });
    assertOk(
      referenceType.variableFontSize === "13px"
        && referenceType.parameterFontSize === referenceType.variableFontSize
        && parseFloat(referenceType.variableFontSize) < parseFloat(referenceType.physicalFontSize),
      `meaning font size should be consistent and smaller than physical model text, saw ${JSON.stringify(referenceType)}`
    );
    assertOk(
      referenceType.parameterLineHeight === referenceType.variableLineHeight,
      `meaning line-height should be consistent across reference tables, saw ${JSON.stringify(referenceType)}`
    );
    await page.locator("#initialR mjx-container").waitFor({ state: "visible", timeout: 15000 });
    const initialMathSources = await page.evaluate(() =>
      ["initialTau", "initialR", "initialV", "initialH", "initialUc", "initialLr", "initialLc", "initialL"]
        .map((id) => document.getElementById(id)?.dataset.mathSource || "")
    );
    assertOk(
      initialMathSources.every((source) => /=-?\d+\.\d{2}\\\)$/.test(source)),
      `initial values should round to 0.01, saw ${initialMathSources.join(", ")}`
    );
    assertOk(initialMathSources.some((source) => source.includes("=1.10")), "initial radius should render as 1.10");
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
    assertOk(await page.getByRole("slider", { name: "κ-ρ exponent" }).isVisible(), "kappa-rho exponent slider label should use symbols");
    assertOk(await page.getByRole("slider", { name: "κ-T exponent" }).isVisible(), "kappa-temperature exponent slider label should use symbols");
    assertOk(await page.getByRole("slider", { name: "inner L exponent" }).isVisible(), "inner luminosity exponent slider label should be compact");
    assertOk(await page.getByText("opacity-density exponent", { exact: true }).count() === 0, "old opacity-density slider label should be removed");
    assertOk(await page.getByText("opacity-temperature exponent", { exact: true }).count() === 0, "old opacity-temperature slider label should be removed");
    assertOk(await page.getByText("inner luminosity exponent", { exact: true }).count() === 0, "old inner luminosity slider label should be removed");
    const convectiveFluxLabelFit = await page.getByRole("slider", { name: "convective flux fraction" })
      .locator("xpath=ancestor::*[contains(@class, 'slider-control')]")
      .locator(".slider-name")
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
    assertOk(convectiveFluxLabelFit, "convective flux fraction label should fit without ellipsis on desktop");
    assertOk((await page.getByRole("slider", { name: "convective flux fraction" }).inputValue()) === "0.5", "convective flux fraction should default to 0.5");
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

    await page.setViewportSize({ width: 1920, height: 1200 });
    assertOk(await page.getByRole("heading", { name: "Shell" }).isVisible(), "Shell heading was not visible");
    const modelSpeed = page.getByRole("slider", { name: "shell speed" });
    assertOk(await page.locator("[data-plot-panel='model'] .plot-title .model-speed-control").isVisible(), "Shell speed control should live in the title row");
    assertOk((await modelSpeed.inputValue()) === "1", "Shell speed should start at 1x");
    assertOk((await page.locator("#modelSpeedValue").textContent()) === "1x", "Shell speed readout should start at 1x");
    await modelSpeed.evaluate((input) => {
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#modelSpeedValue").textContent()) === "2x", "Shell speed readout should update");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-animation-speed")) === "2x", "Shell canvas should receive the animation speed");
    await modelSpeed.evaluate((input) => {
      input.value = "0.25";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#modelSpeedValue").textContent()) === "0.25x", "Shell speed readout should fit its longest value");
    const modelHeadingLines = await page.locator("[data-plot-panel='model'] h3").evaluate((heading) => {
      const range = document.createRange();
      range.selectNodeContents(heading);
      return Array.from(range.getClientRects()).filter((rect) => rect.width > 0).length;
    });
    assertOk(modelHeadingLines === 1, `Shell heading should stay on one line, saw ${modelHeadingLines}`);
    await modelSpeed.evaluate((input) => {
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk(await page.locator("#plotGrid .plot-panel canvas:visible").count() === 8, "expected eight visible plot canvases");
    const modelBox = await page.locator("#modelCanvas").boundingBox();
    const modelPanelBox = await page.locator("[data-plot-panel='model']").boundingBox();
    const lightBox = await page.locator("#lightCanvas").boundingBox();
    assertOk(Boolean(modelBox), "model canvas bounds were unavailable");
    assertOk(Boolean(modelPanelBox), "model panel bounds were unavailable");
    assertOk(Boolean(lightBox), "lightcurve canvas bounds were unavailable");
    assertOk(Math.abs(modelBox.width - modelBox.height) <= 1, "model canvas should be square");
    assertOk(Math.abs(modelBox.height - lightBox.height) <= 1, "model canvas should match the Lightcurve canvas height");
    assertOk(Math.abs(modelPanelBox.width - modelPanelBox.height) <= 2, "model panel should be square");
    const plotLayout = await page.locator("#plotGrid").evaluate((grid) => {
      const panels = [...grid.querySelectorAll("[data-plot-panel]")].map((panel) => {
        const rect = panel.getBoundingClientRect();
        return {
          id: panel.dataset.plotPanel || "",
          top: Math.round(rect.top),
          width: Math.round(rect.width)
        };
      });
      return {
        display: getComputedStyle(grid).display,
        flexWrap: getComputedStyle(grid).flexWrap,
        panels
      };
    });
    assertOk(plotLayout.display === "flex", "plot grid should use flex layout");
    assertOk(plotLayout.flexWrap === "wrap", "plot grid should wrap flex rows");
    const firstRow = plotLayout.panels.filter((panel) => panel.top === plotLayout.panels[0].top);
    const referencePanels = plotLayout.panels.filter((panel) => ["stability", "strip", "phasePortrait"].includes(panel.id));
    assertOk(plotLayout.panels.map((panel) => panel.id).join("|") === "model|light|velocity|time|lum|stability|strip|phasePortrait", `plot grid should include all removable panels, saw ${plotLayout.panels.map((panel) => panel.id).join("|")}`);
    const firstRowIds = firstRow.map((panel) => panel.id).join("|");
    assertOk(firstRowIds === "model|light|velocity" || firstRowIds === "model|light|velocity|time", `first plot row should start with model/light/velocity, saw ${firstRowIds}`);
    assertOk(firstRow.find((panel) => panel.id === "model")?.width < 360, "Shell should stay compact");
    assertOk(firstRow.find((panel) => panel.id === "light")?.width > 360, "Lightcurve should expand beside Shell");
    assertOk(firstRow.find((panel) => panel.id === "velocity")?.width > 360, "RV Curve should expand beside Shell");
    assertOk(plotLayout.panels.find((panel) => panel.id === "time")?.width > 360, "History should expand to fill its flex row");
    assertOk(referencePanels.every((panel) => panel.width >= 400), "reference panels should use the shared plot grid sizing");
    const hasModelPaint = await page.locator("#modelCanvas").evaluate((canvas) => {
      const node = canvas;
      const ctx = node.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
    });
    assertOk(hasModelPaint, "model canvas was blank");
    const phaseDelta = (a, b) => {
      const direct = Math.abs(a - b);
      return Math.min(direct, 2 - direct);
    };
    const lightPhaseBox = await page.locator("#lightCanvas").boundingBox();
    assertOk(Boolean(lightPhaseBox), "lightcurve bounds were unavailable for phase scrubbing");
    await page.mouse.move(lightPhaseBox.x + lightPhaseBox.width * 0.72, lightPhaseBox.y + lightPhaseBox.height * 0.44);
    await page.mouse.down();
    assertOk((await page.locator("#lightCanvas").getAttribute("data-phase-scrubbing")) === "true", "lightcurve should pause animation while phase scrubbing");
    const heldPhaseBefore = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
    await page.waitForTimeout(240);
    const heldPhaseAfter = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
    assertOk(phaseDelta(heldPhaseAfter, heldPhaseBefore) < 0.01, "phase should hold while the mouse is down");
    await page.mouse.move(lightPhaseBox.x + lightPhaseBox.width * 0.52, lightPhaseBox.y + lightPhaseBox.height * 0.44);
    const draggedPhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
    assertOk(phaseDelta(draggedPhase, heldPhaseAfter) > 0.1, "dragging the lightcurve should scrub to a new phase");
    await page.mouse.up();
    assertOk((await page.locator("#lightCanvas").getAttribute("data-phase-scrubbing")) !== "true", "lightcurve should stop scrubbing on mouse release");
    const releasePhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
    await page.waitForTimeout(260);
    const resumedPhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
    assertOk(phaseDelta(resumedPhase, releasePhase) > 0.04, "phase animation should resume from the released position");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-luminosity-arc-labels")) === "gamma_c L_c,L,gamma_r L_r", "model luminosity arc labels should be active");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-geometry-guides")) === "R=1,eta,minR,maxR", "model geometry guides should be active");
    assertOk((await page.locator("#plotGrid").getAttribute("data-plot-columns")) === null, "plot grid should not force a column mode");
    assertOk(!(await page.locator("#hiddenPlotControls").isVisible()), "hidden plot controls should start hidden");
    assertOk((await page.locator("#plotGrid").evaluate((node) => getComputedStyle(node).display)) === "flex", "plot grid should use flex display");
    assertOk((await page.locator("#plotGrid").evaluate((node) => getComputedStyle(node).flexWrap)) === "wrap", "plot grid should wrap");
    assertOk((await page.locator("#plotGrid").evaluate((node) => getComputedStyle(node).getPropertyValue("--plot-panel-min-width").trim())) === "400px", "plot panel minimum width should be 400px");
    await page.locator("[data-plot-toggle='model']").uncheck();
    assertOk(!(await page.locator("[data-plot-panel='model']").isVisible()), "Shell panel should hide when unchecked");
    assertOk(await page.locator("#hiddenPlotControls").isVisible(), "hidden plot controls should appear when a plot is hidden");
    assertOk((await page.locator("#hiddenPlotControls").textContent())?.includes("Shell"), "hidden plot controls should include Shell");
    assertOk((await page.locator("#plotGrid").getAttribute("data-visible-plots")) === "7", "seven visible plots should be tracked");
    assertOk((await page.locator("#plotGrid").getAttribute("data-plot-columns")) === null, "plot grid should not force a column mode after hiding a plot");
    assertOk(await page.locator("#plotGrid .plot-panel canvas:visible").count() === 7, "expected seven visible plot canvases after hiding Shell");
    await page.locator("#hiddenPlotControls [data-plot-toggle='model']").check();
    assertOk(await page.locator("[data-plot-panel='model']").isVisible(), "Shell panel should return when rechecked");
    assertOk(!(await page.locator("#hiddenPlotControls").isVisible()), "hidden plot controls should hide again when all plots are visible");
    assertOk((await page.locator("#plotGrid").getAttribute("data-visible-plots")) === "8", "eight visible plots should be tracked after restore");
    assertOk(!(await page.getByLabel("Enable grid mode").isChecked()), "grid mode should start off");
    assertOk(!(await page.locator("#fourierGridPanel").isVisible()), "Fourier grid panel should start hidden");
    await page.getByLabel("Enable grid mode").check();
    assertOk(((await page.locator("[data-control-key='gammac']").getAttribute("class")) || "").includes("is-grid-range"), "Grid checkbox should default to a gamma_c range");
    assertOk((await page.getByLabel("convective flux fraction grid lower bound").inputValue()) === "0", "default gamma_c grid should start at 0");
    assertOk((await page.getByLabel("convective flux fraction grid upper bound").inputValue()) === "0.5", "default gamma_c grid should end at 0.5");
    await page.getByLabel("Enable grid mode").uncheck();
    assertOk(!(await page.locator("#fourierGridPanel").isVisible()), "Fourier grid panel should hide after default grid check");
    const fluxControl = page.getByRole("slider", { name: "convective flux fraction" }).locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
    const fluxHeightBefore = await fluxControl.evaluate((node) => node.getBoundingClientRect().height);
    await fluxControl.dispatchEvent("contextmenu");
    assertOk(await page.getByLabel("Enable grid mode").isChecked(), "right clicking a slider should enable grid mode");
    assertOk(await page.locator("[data-plot-panel='model']").isHidden(), "Shell should be hidden in grid mode");
    assertOk(await page.locator("[data-plot-panel='time']").isHidden(), "History should be hidden in grid mode");
    assertOk(await page.locator("[data-plot-panel='lum']").isHidden(), "Luminosity Evolution should be hidden in grid mode");
    assertOk(await page.locator("[data-plot-panel='stability']").isVisible(), "Stability Map should remain visible in grid mode");
    assertOk(await page.locator("[data-plot-panel='strip']").isVisible(), "Instability Strip should remain visible in grid mode");
    assertOk(await page.locator("[data-plot-panel='phasePortrait']").isVisible(), "Thermal-Convection Loop should remain visible in grid mode");
    assertOk(await page.locator("#hiddenPlotControls [data-plot-toggle='model']").isDisabled(), "Shell toggle should be disabled in grid mode");
    assertOk(await page.locator("#hiddenPlotControls [data-plot-toggle='time']").isDisabled(), "History toggle should be disabled in grid mode");
    assertOk(await page.locator("#hiddenPlotControls [data-plot-toggle='lum']").isDisabled(), "Luminosity toggle should be disabled in grid mode");
    assertOk(await page.locator("#fourierGridPanel").isVisible(), "Fourier grid panel should show in grid mode");
    const loopSpeed = page.getByRole("slider", { name: "parameter loop speed" });
    assertOk((await loopSpeed.inputValue()) === "1", "parameter loop speed should start at 1x");
    assertOk((await page.locator("#gridLoopSpeedValue").textContent()) === "1x", "parameter loop speed readout should start at 1x");
    await loopSpeed.evaluate((input) => {
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#gridLoopSpeedValue").textContent()) === "2x", "parameter loop speed readout should update");
    assertOk((await fluxControl.getAttribute("class"))?.includes("is-grid-range"), "right click should convert a slider to grid range mode");
    const fluxHeightAfter = await fluxControl.evaluate((node) => node.getBoundingClientRect().height);
    assertOk(Math.abs(fluxHeightAfter - fluxHeightBefore) <= 1, "range mode should reuse the existing slider row height");
    const radiusControl = page.getByRole("slider", { name: "initial radius" }).locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
    await page.getByRole("slider", { name: "initial radius" }).click();
    assertOk(!((await radiusControl.getAttribute("class")) || "").includes("is-grid-range"), "left clicking should not convert a slider to grid range mode");
    await page.getByRole("slider", { name: "initial radius" }).evaluate((input) => {
      input.value = "1.1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await fluxControl.dispatchEvent("contextmenu");
    assertOk(!((await fluxControl.getAttribute("class")) || "").includes("is-grid-range"), "right click should toggle grid range mode off");
    await fluxControl.dispatchEvent("contextmenu");
    await radiusControl.dispatchEvent("contextmenu");
    await page.getByLabel("convective flux fraction grid lower bound").evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByLabel("convective flux fraction grid upper bound").evaluate((input) => {
      input.value = "0.02";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByLabel("initial radius grid lower bound").evaluate((input) => {
      input.value = "1.09";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByLabel("initial radius grid upper bound").evaluate((input) => {
      input.value = "1.11";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk(await page.locator("#gridLoopControls").isVisible(), "multi-parameter grid should show loop radio buttons");
    assertOk(await page.locator("#gridLoopControls input[type='radio']").count() === 2, "two varied parameters should produce two loop radios");
    await page.waitForFunction(() => document.querySelector("#gridStatusText")?.textContent?.includes("Grid complete"), null, { timeout: 15000 });
    assertOk(await page.locator("[data-control-key='gammac'] [data-grid-loop-marker]").isVisible(), "selected loop slider should show the animated value marker");
    assertOk(await page.locator("[data-control-key='r0'] [data-grid-loop-marker]").isHidden(), "non-selected range slider should hide the animated value marker");
    const fourierHasPaint = await page.locator("#fourierCanvas").evaluate((canvas) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0);
    });
    assertOk(fourierHasPaint, "Fourier canvas should paint in grid mode");
    await page.locator("#lightCanvas").scrollIntoViewIfNeeded();
    const lightCanvasBox = await page.locator("#lightCanvas").boundingBox();
    assertOk(Boolean(lightCanvasBox), "light canvas bounds were unavailable for colorbar scrub");
    await page.mouse.move(lightCanvasBox.x + lightCanvasBox.width - 48, lightCanvasBox.y + 34);
    await page.mouse.down();
    assertOk((await page.locator("#lightCanvas").getAttribute("data-grid-interaction")) === "colorbar", "phase colorbar should enter scrub mode on pointer down");
    await page.mouse.move(lightCanvasBox.x + lightCanvasBox.width - 150, lightCanvasBox.y + 34);
    await page.mouse.up();
    assertOk((await page.locator("#lightCanvas").getAttribute("data-grid-interaction")) !== "colorbar", "phase colorbar should leave scrub mode on release");
    await page.locator("#fourierCanvas").scrollIntoViewIfNeeded();
    const fourierHit = await page.locator("#fourierCanvas").getAttribute("data-first-fourier-hit");
    assertOk(Boolean(fourierHit), "Fourier canvas should expose a hit-test point");
    const [fourierHitX, fourierHitY] = fourierHit.split(",").map(Number);
    const fourierBox = await page.locator("#fourierCanvas").boundingBox();
    assertOk(Boolean(fourierBox), "Fourier canvas bounds were unavailable");
    await page.mouse.move(fourierBox.x + fourierHitX, fourierBox.y + fourierHitY);
    assertOk((await page.locator("#fourierCanvas").getAttribute("data-grid-hover")) === "true", "hovering a Fourier point should highlight its model");
    await page.mouse.down();
    assertOk((await page.locator("#fourierCanvas").getAttribute("data-grid-interaction")) === "fourier-hold", "pressing a Fourier point should hold that model");
    await page.mouse.up();
    assertOk((await page.locator("#fourierCanvas").getAttribute("data-grid-interaction")) !== "fourier-hold", "Fourier hold should release on pointer up");
    await page.getByLabel("Enable grid mode").uncheck();
    assertOk(!(await page.locator("#fourierGridPanel").isVisible()), "Fourier panel should hide when grid mode exits");
    assertOk(await page.locator("[data-plot-panel='model']").isVisible(), "Shell visibility should restore after grid mode exits");
    assertOk(await page.locator("[data-plot-panel='time']").isVisible(), "History visibility should restore after grid mode exits");
    assertOk(await page.locator("[data-plot-panel='lum']").isVisible(), "Luminosity Evolution visibility should restore after grid mode exits");
    assertOk(await page.locator("#adsrCanvas").count() === 1, "expected one ADSR canvas");
    assertOk(await page.getByRole("heading", { name: "Lightcurve" }).isVisible(), "Lightcurve heading was not visible");
    assertOk((await page.locator(".phase-anchor-control").textContent())?.includes("phase to"), "phase anchor control was not visible");
    assertOk((await page.getByRole("button", { name: "min light" }).getAttribute("aria-pressed")) === "true", "min-light phase anchor should start active");
    await page.getByRole("button", { name: "max light" }).click();
    assertOk((await page.getByRole("button", { name: "max light" }).getAttribute("aria-pressed")) === "true", "max-light phase anchor did not activate");
    await page.getByRole("button", { name: "min light" }).click();
    assertOk((await page.getByRole("button", { name: "min light" }).getAttribute("aria-pressed")) === "true", "min-light phase anchor did not reactivate");
    assertOk(await page.getByRole("heading", { name: "RV Curve" }).isVisible(), "RV Curve heading was not visible");
    assertOk(!(await page.locator("#pressurePhasePanel").isVisible()), "pressure panel should be hidden outside pressure sonification");
    assertOk(await page.getByRole("heading", { name: "History" }).isVisible(), "History heading was not visible");
    const bodyText = await page.locator("body").innerText();
    assertOk(!bodyText.includes("state variables"), "old History subtitle should be removed");
    assertOk(!bodyText.includes("total, radiative, convective"), "old Luminosity Evolution subtitle should be removed");
    assertOk(await page.locator("#lightLegend").count() === 0, "phase luminosity legend should be removed");
    assertOk(await page.locator("#velocityLegend").count() === 0, "phase velocity legend should be removed");
    assertOk(await page.locator("#phaseLegend").count() === 0, "combined phase legend should be removed");
    const hasPaint = await page.locator("#lightCanvas").evaluate((canvas) => {
      const node = canvas;
      const ctx = node.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
    });
    assertOk(hasPaint, "light curve canvas was blank");
    const hasVelocityPaint = await page.locator("#velocityCanvas").evaluate((canvas) => {
      const node = canvas;
      const ctx = node.getContext("2d");
      if (!ctx) return false;
      return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
    });
    assertOk(hasVelocityPaint, "radial velocity canvas was blank");

    await page.waitForFunction(() => document.querySelector("input[aria-label='convective response']")?.value === "1");
    await page.waitForFunction(() => document.querySelector("#timeLegend")?.textContent?.includes("convective velocity"), null, { timeout: 15000 });
    const timeLegend = await page.locator("#timeLegend").textContent();
    assertOk(
      timeLegend?.includes("radius") && timeLegend.includes("pressure factor"),
      "time legend did not render expected entries"
    );
    assertOk(!timeLegend?.includes("nonadiabatic pressure factor"), "history legend should use the shorter pressure factor label");
    assertOk(timeLegend?.includes("convective velocity"), "convective velocity should be visible by default");
    const lumLegend = await page.locator("#lumLegend").textContent();
    assertOk(lumLegend?.includes("total"), "luminosity legend should show total luminosity");
    assertOk(lumLegend?.includes("radiative") && lumLegend.includes("convective"), "luminosity legend should expose radiative and convective entries by default");
    assertOk((await page.locator("input[aria-label='convective response']").inputValue()) === "1", "convective response should still be one");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-convection-active")) === "true", "model arcs should start in convective mode");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-luminosity-arc-labels")) === "gamma_c L_c,L,gamma_r L_r", "model arcs should expose luminosity labels");
    await page.locator("input[aria-label='convective response']").evaluate((input) => {
      const slider = input;
      slider.value = "0";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => !document.querySelector("#timeLegend [data-plot-series='Uc']"));
    assertOk(!((await page.locator("#timeLegend").textContent())?.includes("convective velocity")), "convective velocity should hide when convective response is zero");
    const zeroLumLegend = await page.locator("#lumLegend").textContent();
    assertOk(!zeroLumLegend?.includes("radiative") && !zeroLumLegend?.includes("convective"), "luminosity legend should show only total luminosity when convective response is zero");
    await page.waitForFunction(() => document.querySelector("#modelCanvas")?.getAttribute("data-convection-active") === "false");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-luminosity-arc-labels")) === "", "model luminosity arc labels should hide when convection is off");
    await page.locator("input[aria-label='convective response']").evaluate((input) => {
      const slider = input;
      slider.value = "1";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#timeLegend [data-plot-series='Uc']").waitFor({ state: "attached", timeout: 15000 });
    await page.waitForFunction(() => document.querySelector("#modelCanvas")?.getAttribute("data-convection-active") === "true");
    assertOk((await page.locator("#modelCanvas").getAttribute("data-luminosity-arc-labels")) === "gamma_c L_c,L,gamma_r L_r", "model luminosity arc labels should return when convection is on");
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
    await page.locator("input[aria-label='shell thinness']").evaluate((input) => {
      const slider = input;
      slider.value = "15";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk(await page.locator("#luminosityEquations mjx-container").count() > 0, "rendered equations should remain visible while chi changes");
    assertOk(await page.locator("#metrics mjx-container").count() > 0, "rendered output metrics should remain visible while chi changes");
    assertOk((await page.locator("#timeLegend").innerHTML()) === timeLegendHtmlBeforeMSlider, "plot legend should not be rebuilt while chi changes");
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.93", "eta did not update when chi changed");
    await page.locator("input[aria-label='shell thinness']").evaluate((input) => {
      const slider = input;
      slider.value = "3";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.00", "eta should keep two decimal places at the Baker limit");
    await page.locator("[data-reset-key='m']").click();
    assertOk((await page.locator("#luminosityEquations").getAttribute("data-eta-value")) === "0.89", "eta did not reset with chi");
    await page.locator("[data-driver='abs-v']").click();
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "abs-v", "ODE driver did not switch to sqrt(abs(V))");
    await page.locator("[data-driver='h']").click();
    assertOk((await page.locator("#odeEquations").getAttribute("data-driver-mode")) === "h", "ODE driver did not switch back to sqrt(H)");

    const timeCanvas = page.locator("#timeCanvas");
    await timeCanvas.scrollIntoViewIfNeeded();
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
    await lumCanvas.scrollIntoViewIfNeeded();
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
    assertOk(pageErrors.length === 0, `page errors: ${pageErrors.join("; ")}`);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForFunction(() => document.querySelector("#luminosityEquations")?.getAttribute("data-geometry-layout") === "stacked");
    const mobilePhaseLayout = await page.locator("#plotGrid").evaluate((grid) => {
      const lightPanel = grid.querySelector("[data-plot-panel='light']");
      const velocityPanel = grid.querySelector("[data-plot-panel='velocity']");
      const lightCanvas = grid.querySelector("#lightCanvas");
      const velocityCanvas = grid.querySelector("#velocityCanvas");
      return {
        lightPanelHeight: lightPanel?.getBoundingClientRect().height ?? 0,
        velocityPanelHeight: velocityPanel?.getBoundingClientRect().height ?? 0,
        lightCanvasHeight: lightCanvas ? getComputedStyle(lightCanvas).height : "",
        velocityCanvasHeight: velocityCanvas ? getComputedStyle(velocityCanvas).height : ""
      };
    });
    assertOk(mobilePhaseLayout.lightCanvasHeight === "176px", `mobile Lightcurve canvas height should be 176px, saw ${mobilePhaseLayout.lightCanvasHeight}`);
    assertOk(mobilePhaseLayout.velocityCanvasHeight === "176px", `mobile RV canvas height should be 176px, saw ${mobilePhaseLayout.velocityCanvasHeight}`);
    assertOk(mobilePhaseLayout.lightPanelHeight < 245, `mobile Lightcurve panel should be compact, saw ${mobilePhaseLayout.lightPanelHeight}`);
    assertOk(mobilePhaseLayout.velocityPanelHeight < 245, `mobile RV panel should be compact, saw ${mobilePhaseLayout.velocityPanelHeight}`);
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
