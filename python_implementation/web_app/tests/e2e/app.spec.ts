import { expect, test, type Page } from "@playwright/test";

async function referencePanelMetrics(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".reference-grid");
    if (!grid) throw new Error("missing reference grid");
    const gridRect = grid.getBoundingClientRect();
    const panels = [...document.querySelectorAll<HTMLElement>(".reference-grid > .reference-panel")];
    return {
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      gridWidth: Math.round(gridRect.width),
      panels: panels.map((node) => ({
        heading: node.querySelector("h3")?.textContent || "",
        height: Math.round(node.getBoundingClientRect().height),
        width: Math.round(node.getBoundingClientRect().width),
        top: Math.round(node.getBoundingClientRect().top),
        hasHorizontalOverflow: [node, ...node.querySelectorAll<HTMLElement>(".equation-block, table")]
          .some((item) => item.scrollWidth > item.clientWidth + 1),
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight
      }))
    };
  });
}

async function installPendingResumeAudioContext(page: Page): Promise<void> {
  await page.addInitScript({
    content: `
      (() => {
        const events = [];
        window.__audioEvents = events;

        class FakeAudioParam {
          constructor() {
            this.value = 0;
          }

          setValueAtTime(value) {
            this.value = value;
          }

          linearRampToValueAtTime(value) {
            this.value = value;
          }

          setTargetAtTime(value) {
            this.value = value;
          }

          cancelScheduledValues() {}
        }

        class FakeAudioNode {
          connect() {
            return this;
          }

          disconnect() {}

          addEventListener(type, callback) {
            if (type === "ended") this.ended = callback;
          }

          end() {
            if (!this.ended) return;
            const callback = this.ended;
            this.ended = null;
            callback();
          }
        }

        class FakeGainNode extends FakeAudioNode {
          constructor() {
            super();
            this.gain = new FakeAudioParam();
          }
        }

        class FakeOscillatorNode extends FakeAudioNode {
          constructor() {
            super();
            this.frequency = new FakeAudioParam();
          }

          setPeriodicWave() {
            events.push("oscillator:wave");
          }

          start() {
            events.push("oscillator:start");
          }

          stop() {
            events.push("oscillator:stop");
            this.end();
          }
        }

        class FakeBufferSourceNode extends FakeAudioNode {
          start() {
            events.push("buffer:start");
          }

          stop() {
            events.push("buffer:stop");
            this.end();
          }
        }

        class FakeAudioContext {
          constructor() {
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.state = "suspended";
            this.destination = new FakeAudioNode();
          }

          resume() {
            events.push("context:resume");
            return new Promise(() => {});
          }

          createBuffer() {
            return {};
          }

          createBufferSource() {
            return new FakeBufferSourceNode();
          }

          createGain() {
            return new FakeGainNode();
          }

          createOscillator() {
            return new FakeOscillatorNode();
          }

          createPeriodicWave() {
            return {};
          }
        }

        Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
        Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: FakeAudioContext });
      })();
    `
  });
}

async function audioEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as typeof window & { __audioEvents: string[] }).__audioEvents || []);
}

test("audio voices start from the tap even when mobile WebKit keeps resume pending", async ({ page }) => {
  await installPendingResumeAudioContext(page);
  await page.goto("/wizard_of_oz.html");
  const sonificationToggle = page.locator("#sonificationToggle");
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "true");

  const continuousEvents = await audioEvents(page);
  expect(continuousEvents).toContain("buffer:start");
  expect(continuousEvents).toContain("oscillator:start");
  expect(continuousEvents.indexOf("oscillator:start")).toBeLessThan(continuousEvents.indexOf("context:resume"));

  await sonificationToggle.click();
  await page.locator("#pianoToggle").click();
  await expect(page.locator("#pianoPanel")).toBeVisible();
  const startsBeforePiano = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:start").length;
  await page.locator(".piano-key[data-midi='48']").click();
  const pianoEvents = await audioEvents(page);
  const startsAfterPiano = pianoEvents.filter((eventName) => eventName === "oscillator:start").length;
  expect(startsAfterPiano).toBeGreaterThan(startsBeforePiano);
});

test("app renders solver controls, canvases, and output metrics", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  const metadata = await page.evaluate(() => {
    const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content") || "";
    const link = (selector: string) => document.querySelector(selector)?.getAttribute("href") || "";
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
  expect(metadata).toEqual({
    title: "OZwizard | Interactive Stellar Pulsation Explorer",
    description: "Interactive one-zone convection and pulsation explorer for Stellingwerf-style stellar-envelope models.",
    canonical: "https://earlbellinger.com/apps/ozwizard/",
    icon32: "./assets/favicon-32x32.png",
    appleTouchIcon: "./assets/apple-touch-icon.png",
    manifest: "./site.webmanifest",
    ogImage: "https://earlbellinger.com/apps/ozwizard/assets/ozwizard-social-card.png",
    twitterCard: "summary_large_image"
  });
  const pianoToggle = page.locator("#pianoToggle");
  const sonificationToggle = page.locator("#sonificationToggle");
  await expect(pianoToggle).not.toBeDisabled();
  await expect(pianoToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#pianoPanel")).toBeHidden();
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
  await pianoToggle.click();
  await expect(pianoToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pianoPanel")).toBeVisible();
  await expect(sonificationToggle).toBeDisabled();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("shown piano octaves")).toHaveValue("3");
  await expect(page.locator("#sonificationHz")).toHaveText("C3-B4");
  await expect(page.locator(".piano-key")).toHaveCount(24);
  await expect(page.locator(".white-key")).toHaveCount(14);
  await expect(page.locator(".black-key")).toHaveCount(10);
  await expect(page.locator(".sonify-source-control")).toContainText("sonify:");
  const luminositySource = page.locator("[data-sonify-source='luminosity']");
  const velocitySource = page.locator("[data-sonify-source='velocity']");
  const pressureSource = page.locator("[data-sonify-source='pressure']");
  await expect(luminositySource).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pressurePhasePanel")).toBeHidden();
  await velocitySource.click();
  await expect(velocitySource).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pressurePhasePanel")).toBeHidden();
  await pressureSource.click();
  await expect(pressureSource).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pressurePhasePanel")).toBeVisible();
  const hasPressurePaint = await page.locator("#pressureCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasPressurePaint).toBe(true);
  await luminositySource.click();
  await expect(luminositySource).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pressurePhasePanel")).toBeHidden();
  await expect(page.locator("#pianoAttackValue")).toHaveText("15 ms");
  await expect(page.locator("#pianoDecayValue")).toHaveText("0.22 s");
  await expect(page.locator("#pianoReleaseValue")).toHaveText("0.36 s");
  await expect(page.locator("#pianoSustainValue")).toHaveText("38%");
  await expect(page.locator("[data-piano-reset]")).toHaveCount(4);
  const attackReset = page.getByRole("button", { name: "Reset attack" });
  await expect(attackReset).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset decay" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset release" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset sustain" })).toBeDisabled();
  await page.locator("#pianoAttack").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0.08";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#pianoAttackValue")).toHaveText("80 ms");
  await expect(attackReset).toBeEnabled();
  await attackReset.click();
  await expect(page.locator("#pianoAttackValue")).toHaveText("15 ms");
  await expect(attackReset).toBeDisabled();
  const hasAdsrPaint = await page.locator("#adsrCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasAdsrPaint).toBe(true);
  await page.locator("#sonificationPitch").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "4";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#sonificationHz")).toHaveText("C4-B5");
  await expect(page.locator(".piano-key[data-midi='60']")).toHaveCount(1);
  await page.getByLabel("shown piano octaves").focus();
  await page.keyboard.down("z");
  await expect(page.locator(".piano-key[data-midi='60']")).toHaveClass(/active/);
  await page.keyboard.up("z");
  await expect(page.locator(".piano-key[data-midi='60']")).not.toHaveClass(/active/);
  await pianoToggle.click();
  await expect(page.locator("#pianoPanel")).toBeHidden();
  await expect(sonificationToggle).not.toBeDisabled();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("reference pitch")).toHaveValue("69");
  await expect(page.locator("#sonificationHz")).toHaveText("440 Hz");
  await expect(page.getByAltText("OZwizard logo")).toBeVisible();
  await expect(page.getByAltText("OZwizard logo")).toHaveJSProperty("naturalWidth", 498);
  await expect(page.locator("#sidebarControls")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "RK45" })).toHaveClass(/active/);
  await expect(page.locator("#solverButtons button")).toHaveCount(3);
  const sectionActionLayouts = await page.locator(".section-title-with-actions").evaluateAll((nodes) =>
    nodes.map((node) => {
      const label = node.querySelector("span")?.getBoundingClientRect();
      const actions = node.querySelector(".section-action-row")?.getBoundingClientRect();
      const buttonHeights = [...node.querySelectorAll<HTMLButtonElement>(".section-action-row button")]
        .map((button) => Math.round(button.getBoundingClientRect().height));
      if (!label || !actions) return null;
      return {
        label: node.querySelector("span")?.textContent?.trim() || "",
        labelCenterY: Math.round(label.top + label.height / 2),
        actionsCenterY: Math.round(actions.top + actions.height / 2),
        buttonHeights
      };
    }),
  );
  expect(sectionActionLayouts.map((layout) => layout?.label)).toEqual(["Integration", "Convective Driver", "Phase Window"]);
  for (const layout of sectionActionLayouts) {
    expect(layout).not.toBeNull();
    expect(layout!.actionsCenterY).toBe(layout!.labelCenterY);
    expect(Math.max(...layout!.buttonHeights)).toBeLessThanOrEqual(30);
  }
  await expect(page.locator("#physicalControlSection")).toHaveAttribute("open", "");
  await expect(page.locator("#integrationControlSection")).toHaveAttribute("open", "");
  await expect(page.locator("#initialControlSection")).not.toHaveAttribute("open", "");
  await expect(page.locator("#initialControls")).toBeHidden();
  await expect(page.locator("#presetButtons")).not.toBeVisible();
  await expect(page.locator("#presetSummaryLabel")).toContainText("RR Lyrae low-amplitude fundamental, damped");
  await page.locator("#presetPanel summary").click();
  await expect(page.locator("#presetButtons")).toBeVisible();
  await expect(page.locator("#presetPanel #resetPreset")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "RR Lyrae low-amplitude fundamental, damped" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Baker radiative pulsator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae first overtone", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae first overtone, damped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae high-amplitude first overtone" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RR Lyrae low-amplitude fundamental, damped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Local radiative OZ1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /corrected/i })).toHaveCount(0);
  await expect(page.getByLabel("Compare selected solver to midpoint")).toHaveCount(0);
  await page.locator("#initialControlSection > summary").click();
  await expect(page.locator("#initialControlSection")).toHaveAttribute("open", "");
  await expect(page.locator("#initialControls")).toBeVisible();
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
  await expect(page.locator("#integrationControls .slider-scale span")).toHaveText(["1", "3", "10", "30", "100", "300"]);
  await expect(page.locator("#integrationControls .slider-scale span").first()).toHaveAttribute("data-scale-edge", "start");
  await expect(page.locator("#integrationControls .slider-scale span").last()).not.toHaveAttribute("data-scale-edge", "end");
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
  await expect(page.getByRole("slider", { name: "κ-ρ exponent" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "κ-T exponent" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "inner L exponent" })).toBeVisible();
  await expect(page.getByText("opacity-density exponent", { exact: true })).toHaveCount(0);
  await expect(page.getByText("opacity-temperature exponent", { exact: true })).toHaveCount(0);
  await expect(page.getByText("inner luminosity exponent", { exact: true })).toHaveCount(0);
  const convectiveFluxLabelFit = await page.getByRole("slider", { name: "convective flux fraction" })
    .locator("xpath=ancestor::*[contains(@class, 'slider-control')]")
    .locator(".slider-name")
    .evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
  expect(convectiveFluxLabelFit).toBe(true);
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
  await expect(page.locator("#pressurePhasePanel")).toBeHidden();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("state variables");
  await expect(page.locator("body")).not.toContainText("total, radiative, convective");
  await expect.poll(async () => (await page.locator("body").innerText()).includes("\\(")).toBe(false);

  const visibleCanvases = page.locator(".plot-panel canvas:visible");
  await expect(visibleCanvases).toHaveCount(4);
  await expect(page.locator("#adsrCanvas")).toHaveCount(1);
  await expect(page.locator("#lightLegend")).toHaveCount(0);
  await expect(page.locator("#velocityLegend")).toHaveCount(0);
  await expect(page.locator("#phaseLegend")).toHaveCount(0);
  const tauCell = page.locator("[data-symbol='tau']").first();
  const tauRow = tauCell.locator("xpath=ancestor::tr");
  await expect(tauCell).toBeVisible();
  await expect(tauRow).toContainText("Time");
  await expect(tauRow).toContainText("dynamical time");
  await expect(tauRow).not.toContainText("free-fall");
  await expect(tauRow).not.toContainText("derivatives such as");
  await expect(tauCell).toHaveCSS("color", "rgb(139, 148, 158)");
  await expect(page.locator("#initialR")).toBeVisible();
  await expect(page.locator("#initialLr")).toBeVisible();
  await expect(page.locator("#initialL")).toBeVisible();
  const initialMathSources = await page.evaluate(() =>
    ["initialTau", "initialR", "initialV", "initialH", "initialUc", "initialLr", "initialLc", "initialL"]
      .map((id) => document.getElementById(id)?.dataset.mathSource || "")
  );
  expect(initialMathSources).toEqual(expect.arrayContaining([
    expect.stringContaining("=0.00"),
    expect.stringContaining("=1.10")
  ]));
  initialMathSources.forEach((source) => expect(source).toMatch(/=-?\d+\.\d{2}\\\)$/));
  const referenceType = await page.evaluate(() => {
    const physicalText = document.querySelector<HTMLElement>(".notes-grid > .content-panel:not(.reference-panel) p");
    const variableMeaning = document.querySelector<HTMLElement>("[data-symbol='tau']")?.closest("tr")?.lastElementChild;
    const parameterMeaning = document.querySelector<HTMLElement>("#tunableParameterTable td:last-child");
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
  expect(referenceType.variableFontSize).toBe("13px");
  expect(referenceType.parameterFontSize).toBe(referenceType.variableFontSize);
  expect(referenceType.parameterLineHeight).toBe(referenceType.variableLineHeight);
  expect(parseFloat(referenceType.variableFontSize)).toBeLessThan(parseFloat(referenceType.physicalFontSize));
  const initialRadiusControl = page.locator("input[aria-label='initial radius']").locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
  await expect(initialRadiusControl).toContainText("initial radius");
  await expect(initialRadiusControl).toContainText("1.1");
  await expect(page.locator("[data-value-for='tEnd']")).toHaveText("100");
  await expect(page.locator(".equation-label")).toHaveCount(0);
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-layout", "stacked");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.89");
  const [sourceText, htmlText] = await page.evaluate(async () =>
    Promise.all([
      fetch("/src/main.ts").then((response) => response.text()),
      fetch("/wizard_of_oz.html").then((response) => response.text()),
    ]),
  );
  expect(sourceText).toContain("\\\\ozChiZero{\\\\chi_0}");
  expect(sourceText).toContain("\\\\ozChi{\\\\chi}");
  expect(sourceText).toContain("\\\\ozEta{\\\\eta}");
  expect(sourceText).not.toContain("User-tunable reference shell form factor");
  expect(sourceText).not.toContain("free-fall/dynamical");
  expect(htmlText).toContain("ozChiZero");
  expect(htmlText).toContain("ozEta");
  expect(htmlText).toContain("\\ozChi{\\chi}");
  expect(htmlText).not.toContain("free-fall/dynamical");
  expect(sourceText).not.toContain("\\\\ozChi{\\\\chi_0}");
  expect(sourceText).not.toContain("\\\\mathrm{eff}");
  expect(htmlText).not.toContain("\\mathrm{eff}");
  expect(sourceText).not.toContain("\\\\ozMass");
  expect(htmlText).not.toContain("\\ozMass");
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "h");
  await expect(page.getByRole("heading", { name: "Derived" })).toHaveCount(0);
  await expect(page.locator("#timeLegend")).toContainText("radius");
  await expect(page.locator("#timeLegend")).toContainText("pressure factor");
  await expect(page.locator("#timeLegend")).not.toContainText("nonadiabatic pressure factor");
  await expect(page.locator("#timeLegend")).not.toContainText("convective velocity");
  await expect(page.locator("#lumLegend")).toContainText("total");
  await expect(page.locator("#lumLegend")).not.toContainText("radiative");
  await expect(page.locator("#lumLegend")).not.toContainText("convective");
  await expect(page.locator("#lumLegend [data-plot-series]")).toHaveCount(0);
  await page.locator("input[aria-label='convective response']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#timeLegend [data-plot-series='Uc']")).toHaveCount(1);
  await expect(page.locator("#timeLegend")).toContainText("convective velocity");
  await expect(page.locator("#lumLegend")).toContainText("radiative");
  await expect(page.locator("#lumLegend")).toContainText("convective");
  await page.locator("input[aria-label='convective response']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#timeLegend [data-plot-series='Uc']")).toHaveCount(0);
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
  const hasVelocityPaint = await page.locator("#velocityCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasVelocityPaint).toBe(true);
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
  await page.getByRole("button", { name: "Final" }).click();
  await expect(page.getByRole("button", { name: "Final" })).toHaveClass(/active/);
  await expect(page.locator("#metrics")).not.toContainText("final cycles");
  await expect(page.locator("#metrics")).not.toContainText("unavailable");

  await page.setViewportSize({ width: 1100, height: 1200 });
  const mediumReferenceLayout = await referencePanelMetrics(page);
  expect(mediumReferenceLayout.gridColumns.split(" ")).toHaveLength(1);

  await page.setViewportSize({ width: 1500, height: 1200 });
  const pairedReferenceLayout = await referencePanelMetrics(page);
  expect(pairedReferenceLayout.gridColumns.split(" ")).toHaveLength(2);
  expect(pairedReferenceLayout.panels[0].width).toBeGreaterThanOrEqual(324);
  expect(pairedReferenceLayout.panels[1].width).toBeGreaterThanOrEqual(434);
  expect(pairedReferenceLayout.panels[1].width).toBeGreaterThan(pairedReferenceLayout.panels[0].width);
  expect(pairedReferenceLayout.panels[0].top).toBe(pairedReferenceLayout.panels[1].top);
  expect(pairedReferenceLayout.panels[0].height).toBe(pairedReferenceLayout.panels[1].height);
  expect(pairedReferenceLayout.panels[0].height).toBeLessThan(829);
  expect(pairedReferenceLayout.panels[2].top).toBeGreaterThan(pairedReferenceLayout.panels[0].top);
  expect(pairedReferenceLayout.panels[2].width).toBeGreaterThanOrEqual(pairedReferenceLayout.gridWidth - 1);
  expect(pairedReferenceLayout.panels.map((panel) => panel.hasHorizontalOverflow)).toEqual([false, false, false]);

  await page.setViewportSize({ width: 1920, height: 1200 });
  const wideReferenceLayout = await referencePanelMetrics(page);
  expect(wideReferenceLayout.gridColumns.split(" ")).toHaveLength(3);
  expect(wideReferenceLayout.panels.map((panel) => panel.height)).toEqual([535, 535, 535]);
  expect(wideReferenceLayout.panels[1].width).toBeGreaterThan(wideReferenceLayout.panels[0].width);
  expect(wideReferenceLayout.panels[2].width).toBeGreaterThan(wideReferenceLayout.panels[0].width);
  const wideVariables = wideReferenceLayout.panels.find((panel) => panel.heading === "Variables");
  const wideParameters = wideReferenceLayout.panels.find((panel) => panel.heading === "Parameters");
  expect(wideVariables?.scrollHeight).toBeGreaterThanOrEqual(wideVariables?.clientHeight || 0);
  expect(wideParameters?.scrollHeight).toBeGreaterThan(wideParameters?.clientHeight || 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-layout", "stacked");
  await expect(page.locator("#sidebarControls")).not.toHaveAttribute("open", "");
  await expect(page.locator("#sidebarControls > summary")).toBeVisible();
  await page.locator("#sidebarControls > summary").click();
  await expect(page.locator("#physicalControls")).toBeVisible();
  const mobileMeaningType = await page.locator(".variable-table tbody td:last-child").evaluateAll((cells) => {
    const sizes = new Set<string>();
    const textAdjustments = new Set<string>();
    cells.forEach((cell) => {
      const cellStyle = getComputedStyle(cell);
      sizes.add(cellStyle.fontSize);
      textAdjustments.add(cellStyle.webkitTextSizeAdjust);
      cell.querySelectorAll("mjx-container").forEach((math) => sizes.add(getComputedStyle(math).fontSize));
    });
    return { sizes: [...sizes], textAdjustments: [...textAdjustments] };
  });
  expect(mobileMeaningType.sizes).toEqual(["13px"]);
  expect(mobileMeaningType.textAdjustments).toEqual(["100%"]);
  expect(pageErrors).toEqual([]);
});
