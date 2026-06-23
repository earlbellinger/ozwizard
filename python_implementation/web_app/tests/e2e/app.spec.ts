import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function touchTapSlider(slider: Locator, pointerId: number): Promise<void> {
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  await slider.evaluate((node, eventInit) => {
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId: eventInit.pointerId,
      pointerType: "touch",
      clientX: eventInit.x,
      clientY: eventInit.y
    };
    node.dispatchEvent(new PointerEvent("pointerdown", init));
    node.dispatchEvent(new PointerEvent("pointerup", init));
  }, {
    pointerId,
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2
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

async function setSliderValue(page: Page, name: string, value: string): Promise<void> {
  await page.getByRole("slider", { name }).evaluate((input, nextValue) => {
    const slider = input as HTMLInputElement;
    slider.value = nextValue;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
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
  await expect(sonificationToggle).not.toBeDisabled();
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "true");
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  const startsBeforePiano = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:start").length;
  await page.locator(".piano-key[data-midi='48']").click();
  const pianoEvents = await audioEvents(page);
  const startsAfterPiano = pianoEvents.filter((eventName) => eventName === "oscillator:start").length;
  expect(startsAfterPiano).toBeGreaterThan(startsBeforePiano);
});

test("grid loop refreshes speaker and held piano waveforms", async ({ page }) => {
  await installPendingResumeAudioContext(page);
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  await page.getByLabel("Enable grid mode").check();
  await setSliderValue(page, "convective flux fraction grid lower bound", "0");
  await setSliderValue(page, "convective flux fraction grid upper bound", "0.02");
  await expect(page.locator("#gridStatusText")).toContainText("Grid complete", { timeout: 15000 });

  const sonificationToggle = page.locator("#sonificationToggle");
  await expect(sonificationToggle).not.toBeDisabled();
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "true");
  const speakerStartsBeforeLoop = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:start").length;
  const firstSpeakerSignature = await page.locator("#pianoPanel").getAttribute("data-sonification-signature");
  await expect.poll(async () => page.locator("#pianoPanel").getAttribute("data-sonification-signature"), { timeout: 5000 })
    .not.toBe(firstSpeakerSignature);
  const speakerStartsAfterLoop = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:start").length;
  expect(speakerStartsAfterLoop).toBeGreaterThan(speakerStartsBeforeLoop);
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");

  await page.locator("#pianoToggle").click();
  await expect(page.locator("#pianoPanel")).toBeVisible();
  await expect(sonificationToggle).not.toBeDisabled();
  await page.keyboard.down("z");
  await expect(page.locator(".piano-key[data-midi='48']")).toHaveClass(/active/);
  const pianoWavesBeforeLoop = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:wave").length;
  const firstPianoSignature = await page.locator("#pianoPanel").getAttribute("data-sonification-signature");
  await expect.poll(async () => page.locator("#pianoPanel").getAttribute("data-sonification-signature"), { timeout: 5000 })
    .not.toBe(firstPianoSignature);
  const pianoWavesAfterLoop = (await audioEvents(page)).filter((eventName) => eventName === "oscillator:wave").length;
  expect(pianoWavesAfterLoop).toBeGreaterThan(pianoWavesBeforeLoop);
  await page.keyboard.up("z");
  await expect(page.locator(".piano-key[data-midi='48']")).not.toHaveClass(/active/);
});

test("terminal runaway models use time windows instead of phase windows", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();

  await page.locator("#presetPanel summary").click();
  await page.getByRole("button", { name: "Instability-strip convection" }).click();
  await page.locator("#initialControlSection > summary").click();
  await setSliderValue(page, "max time", "2");
  await setSliderValue(page, "initial radius", "1.9");
  await setSliderValue(page, "initial radial velocity", "1.2");

  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-display-mode", "time", { timeout: 15000 });
  await expect(page.locator("#velocityCanvas")).toHaveAttribute("data-display-mode", "time");
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-current-time", /\d+\.\d+/);
  await expect(page.locator("#lightCanvas")).not.toHaveAttribute("data-current-phase");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-current-time", /\d+\.\d+/);
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-current-time", /\d+\.\d+/);
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-stellingwerf-labels", "R,H,U_c,current_time");
  await expect(page.locator(".phase-anchor-control")).toBeHidden();
  await expect(page.locator("#metrics")).toContainText("time window");
  expect(pageErrors).toEqual([]);
});

test("grid mode falls back when workers are blocked", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    class BlockedWorker {
      constructor() {
        throw new Error("Worker blocked for test");
      }
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: BlockedWorker });
  });
  await page.goto("/wizard_of_oz.html");
  await expect(page.getByRole("heading", { name: "OZwizard" })).toBeVisible();
  await page.getByLabel("Enable grid mode").check();
  await expect(page.locator("[data-control-key='gammac']")).toHaveClass(/is-grid-range/);
  await expect(page.getByLabel("convective flux fraction grid lower bound")).toHaveValue("0");
  await expect(page.getByLabel("convective flux fraction grid upper bound")).toHaveValue("0.5");
  await page.getByLabel("convective flux fraction grid lower bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByLabel("convective flux fraction grid upper bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0.02";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#gridStatusText")).toContainText("Grid complete", { timeout: 15000 });
  await expect(page.locator("#gridStatusText")).not.toContainText("unavailable");
  expect(pageErrors).toEqual([]);
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
  await expect(sonificationToggle).not.toBeDisabled();
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
      const actions = node.querySelector(".section-action-row, .grid-mode-control")?.getBoundingClientRect();
      const buttonHeights = [...node.querySelectorAll<HTMLElement>(".section-action-row button, .grid-mode-control input")]
        .map((control) => Math.round(control.getBoundingClientRect().height));
      if (!label || !actions) return null;
      return {
        label: node.querySelector("span")?.textContent?.trim() || "",
        labelCenterY: Math.round(label.top + label.height / 2),
        actionsCenterY: Math.round(actions.top + actions.height / 2),
        buttonHeights
      };
    }),
  );
  expect(sectionActionLayouts.map((layout) => layout?.label)).toEqual(["Physical Parameters", "Integration", "Convective Driver", "Phase Window"]);
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
  await expect(page.locator("input[aria-label='convective response']")).toHaveValue("0");
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
  await expect(page.locator("#runUntilStable")).toBeChecked();
  const integrationControl = (name: string) => page.locator(`#integrationControls .slider-control:visible input[aria-label="${name}"]`);
  await expect(integrationControl("relative tol")).toHaveCount(1);
  await expect(integrationControl("absolute tol")).toHaveCount(1);
  await expect(integrationControl("tolerance")).toHaveCount(0);
  await expect(integrationControl("stability tolerance")).toHaveCount(1);
  await expect(integrationControl("stable cycles required")).toHaveCount(1);
  await page.getByRole("button", { name: "Mid" }).click();
  await expect(integrationControl("tolerance")).toHaveCount(1);
  await expect(integrationControl("relative tol")).toHaveCount(0);
  await expect(integrationControl("absolute tol")).toHaveCount(0);
  await expect(integrationControl("stability tolerance")).toHaveCount(1);
  await expect(integrationControl("stable cycles required")).toHaveCount(1);
  await page.locator("#runUntilStable").uncheck();
  await expect(integrationControl("stability tolerance")).toHaveCount(0);
  await page.locator("#runUntilStable").check();
  await expect(integrationControl("stability tolerance")).toHaveCount(1);
  await page.getByRole("button", { name: "RK45" }).click();
  await expect(integrationControl("relative tol")).toHaveCount(1);
  await expect(integrationControl("tolerance")).toHaveCount(0);
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
    slider.value = String(Math.log10(300));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return label;
  });
  expect(maxTauLabel).toBe("1000");
  await page.locator("[data-reset-key='tEnd']").click();
  await expect(page.locator("[data-value-for='tEnd']")).toHaveText("300");
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
  await expect(page.getByRole("slider", { name: "convective flux fraction" })).toHaveValue("0.5");
  await expect(page.getByRole("slider", { name: "thermal response" })).toHaveValue("0");
  await expect(page.locator("[data-value-for='zeta']")).toHaveText("1");
  const thinnessSliderValue = await page.getByRole("slider", { name: "shell thinness" }).evaluate((input) => Number((input as HTMLInputElement).value));
  expect(thinnessSliderValue).toBeCloseTo(0.34, 6);
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
  await expect(page.locator("#metrics")).toContainText("stable limit cycle");
  await expect(page.locator("#metrics")).toContainText("models");
  await expect(page.locator("#metrics")).toContainText("P_lin");
  await expect(page.locator("#metrics")).toContainText("P_nonlin");
  await expect(page.locator("#metrics")).not.toContainText("stop reason");
  await expect(page.locator("#metrics")).not.toContainText("reference");
  await expect(page.locator("#metrics")).not.toContainText("driver");
  await expect(page.locator("#metrics")).not.toContainText("solver");
  const stoppedTimeXlim = (await page.locator("#timeCanvas").getAttribute("data-xlim"))?.split(",").map(Number);
  expect(stoppedTimeXlim).toBeDefined();
  expect(stoppedTimeXlim![0]).toBe(0);
  expect(stoppedTimeXlim![1]).toBeGreaterThan(0);
  expect(stoppedTimeXlim![1]).toBeLessThan(300);
  await expect(page.locator("#lumCanvas")).toHaveAttribute("data-xlim", stoppedTimeXlim!.map((value) => value.toFixed(3)).join(","));
  await expect(page.locator("#metrics")).toHaveAttribute("data-linear-period-formula", "2pi/sqrt(chi*Gamma1-4)");
  await expect(page.locator("#metrics")).toHaveAttribute("data-linear-period", /2\.37/);
  await expect(page.locator("#metrics")).toHaveAttribute("data-nonlinear-period", /[0-9]/);
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-physics-mode", "convective");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-convective", "stable");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-secular", "stable");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-dynamic", "stable");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-pulsational", "unstable");
  await expect(page.locator("#metrics [data-stability-kind='convective']")).toHaveClass(/status-ok/);
  await expect(page.locator("#metrics [data-stability-kind='secular']")).toHaveClass(/status-ok/);
  await expect(page.locator("#metrics [data-stability-kind='dynamic']")).toHaveClass(/status-ok/);
  await expect(page.locator("#metrics [data-stability-kind='pulsational']")).toHaveClass(/status-bad/);
  await expect.poll(async () => (await page.locator("body").innerText()).includes("\\(")).toBe(false);
  const convectiveChip = page.locator("#metrics [data-stability-kind='convective']");
  const dynamicChip = page.locator("#metrics [data-stability-kind='dynamic']");
  const secularChip = page.locator("#metrics [data-stability-kind='secular']");
  const pulsationalChip = page.locator("#metrics [data-stability-kind='pulsational']");
  await expect(convectiveChip).toHaveAttribute("data-stability-detail", /margin=30\.5.*convectively\/turbulently stable/);
  await expect(secularChip).toHaveAttribute("data-stability-detail", /margin=33.*secularly stable/);
  await expect(dynamicChip).toHaveAttribute("data-stability-detail", /margin=234.*dynamically stable/);
  await expect(pulsationalChip).toHaveAttribute("data-stability-detail", /margin=-36.*pulsationally unstable/);
  const stabilityDetails = await page.locator("#metrics [data-stability-kind]").evaluateAll((chips) =>
    chips.map((chip) => chip.getAttribute("data-stability-detail") || "").join(" ")
  );
  expect(stabilityDetails).toContain("E=");
  expect(stabilityDetails).not.toMatch(/\b[ABCD]\b/);
  await expect(convectiveChip).not.toHaveAttribute("title");
  await expect(convectiveChip).toHaveAttribute("data-stability-expanded", "");
  await expect(convectiveChip).toHaveAttribute("role", "button");
  await expect(convectiveChip).toHaveAttribute("aria-expanded", "false");
  await expect(convectiveChip).toHaveAttribute("data-stability-formula", /\\\(.*=30\.5 > 0\\\)/);
  await expect(pulsationalChip).toHaveAttribute("data-stability-formula", /\\not\\gt 0\\\)/);
  await expect(convectiveChip).not.toHaveAttribute("data-stability-view");
  await expect(convectiveChip.locator(".stability-summary")).toContainText("turb-response stable");
  await expect(convectiveChip.locator(".stability-summary")).toContainText("(30.5 > 0)");
  await expect(secularChip.locator(".stability-summary")).toContainText("secularly stable");
  await expect(dynamicChip.locator(".stability-summary")).toContainText("dynamically stable");
  await expect(pulsationalChip.locator(".stability-summary")).toContainText("pulsationally unstable");
  await expect(pulsationalChip.locator(".stability-summary")).toContainText("(-36 ≯ 0)");
  await expect(convectiveChip.locator(".stability-summary")).toBeVisible();
  await expect(convectiveChip.locator(".stability-formula")).toBeHidden();
  await convectiveChip.hover();
  await expect(convectiveChip.locator(".stability-summary")).toBeVisible();
  await expect(convectiveChip.locator(".stability-formula")).toBeHidden();
  await expect(convectiveChip).not.toHaveAttribute("data-stability-view");
  await page.mouse.move(1, 1);
  await expect(convectiveChip.locator(".stability-summary")).toBeVisible();
  await convectiveChip.click();
  await expect(convectiveChip).toHaveAttribute("aria-expanded", "true");
  await expect(convectiveChip).toHaveAttribute("data-stability-view", "formula");
  await expect(convectiveChip.locator(".stability-summary")).toBeVisible();
  await expect(convectiveChip.locator(".stability-formula")).toBeVisible();
  await expect(convectiveChip.locator(".stability-formula .stability-equation-chunk")).not.toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Extra \\left|missing \\right/i);
  await convectiveChip.click();
  await expect(convectiveChip).toHaveAttribute("aria-expanded", "false");
  await expect(convectiveChip.locator(".stability-formula")).toBeHidden();
  await secularChip.click();
  await expect(secularChip).toHaveAttribute("aria-expanded", "true");
  await expect(secularChip.locator(".stability-summary")).toBeVisible();
  await expect(secularChip.locator(".stability-formula")).toBeVisible();
  await expect(secularChip.locator(".stability-formula .stability-equation-chunk")).not.toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Extra \\left|missing \\right/i);
  await secularChip.click();
  await expect(secularChip).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#stabilityChipTooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await pulsationalChip.click();
  await expect(pulsationalChip).toHaveAttribute("aria-expanded", "true");
  await expect(pulsationalChip).toHaveAttribute("data-stability-view", "formula");
  await expect(pulsationalChip.locator(".stability-summary")).toContainText("pulsationally unstable");
  await expect(pulsationalChip.locator(".stability-formula")).toBeVisible();
  const expandedStabilityFitsMobile = await pulsationalChip.evaluate((chip) => {
    const page = document.documentElement;
    return {
      chipFits: chip.scrollWidth <= chip.clientWidth + 1,
      pageFits: page.scrollWidth <= page.clientWidth + 1
    };
  });
  expect(expandedStabilityFitsMobile).toEqual({ chipFits: true, pageFits: true });
  await pulsationalChip.click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("heading", { name: "Lightcurve" })).toBeVisible();
  await expect(page.locator("[data-plot-panel='light'] .plot-title #phaseAnnotationToggleLabel")).toContainText("Annotations");
  await expect(page.locator("[data-plot-panel='velocity'] .phase-anchor-control")).toContainText("phase to");
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

  await page.setViewportSize({ width: 1920, height: 1200 });
  const visibleCanvases = page.locator("#plotGrid .plot-panel canvas:visible");
  await expect(page.getByRole("heading", { name: "Shell", exact: true })).toBeVisible();
  const modelSpeed = page.getByRole("slider", { name: "shell speed" });
  await expect(page.locator("[data-plot-panel='model'] .plot-title .model-speed-control")).toBeVisible();
  await expect(modelSpeed).toHaveValue("1");
  await expect(page.locator("#modelSpeedValue")).toHaveText("1x");
  await modelSpeed.evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "2";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#modelSpeedValue")).toHaveText("2x");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-animation-speed", "2x");
  await modelSpeed.evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0.25";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#modelSpeedValue")).toHaveText("0.25x");
  const modelHeadingLines = await page.locator("[data-plot-panel='model'] h3").evaluate((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0).length;
  });
  expect(modelHeadingLines).toBe(1);
  await modelSpeed.evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(visibleCanvases).toHaveCount(11);
  const modelBox = await page.locator("#modelCanvas").boundingBox();
  const modelPanelBox = await page.locator("[data-plot-panel='model']").boundingBox();
  const lightBox = await page.locator("#lightCanvas").boundingBox();
  const lightPanelBox = await page.locator("[data-plot-panel='light']").boundingBox();
  expect(modelBox).not.toBeNull();
  expect(modelPanelBox).not.toBeNull();
  expect(lightBox).not.toBeNull();
  expect(lightPanelBox).not.toBeNull();
  expect(Math.abs(modelBox!.width - modelBox!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(modelBox!.height - lightBox!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(modelPanelBox!.height - lightPanelBox!.height)).toBeLessThanOrEqual(2);
  expect(modelPanelBox!.width).toBeLessThan(lightPanelBox!.width);
  const lightYlim = ((await page.locator("#lightCanvas").getAttribute("data-ylim")) || "").split(",").map(Number);
  const velocityYlim = ((await page.locator("#velocityCanvas").getAttribute("data-ylim")) || "").split(",").map(Number);
  expect(lightYlim[0]).toBeLessThanOrEqual(0.99);
  expect(lightYlim[1]).toBeGreaterThanOrEqual(1.01);
  expect(velocityYlim[0]).toBeLessThanOrEqual(-0.01);
  expect(velocityYlim[1]).toBeGreaterThanOrEqual(0.01);
  const lightHoverTarget = await page.locator("#lightCanvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const plotLeft = 84;
    const plotRight = 20;
    const plotTop = 18;
    const plotBottom = 72;
    return {
      x: rect.left + plotLeft + (rect.width - plotLeft - plotRight) * 0.35,
      y: rect.top + plotTop + (rect.height - plotTop - plotBottom) * 0.5
    };
  });
  await page.mouse.move(lightHoverTarget.x, lightHoverTarget.y);
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-phase-hovering", "true");
  const lightHoverPhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  expect(lightHoverPhase).toBeGreaterThan(0.64);
  expect(lightHoverPhase).toBeLessThan(0.76);
  const velocityHoverTarget = await page.locator("#velocityCanvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const plotLeft = 84;
    const plotRight = 20;
    const plotTop = 18;
    const plotBottom = 72;
    return {
      x: rect.left + plotLeft + (rect.width - plotLeft - plotRight) * 0.75,
      y: rect.top + plotTop + (rect.height - plotTop - plotBottom) * 0.5
    };
  });
  await page.mouse.move(velocityHoverTarget.x, velocityHoverTarget.y);
  await expect(page.locator("#velocityCanvas")).toHaveAttribute("data-phase-hovering", "true");
  const velocityHoverPhase = Number(await page.locator("#velocityCanvas").getAttribute("data-current-phase"));
  expect(velocityHoverPhase).toBeGreaterThan(1.44);
  expect(velocityHoverPhase).toBeLessThan(1.56);
  const plotLayout = await page.locator("#plotGrid").evaluate((grid) => {
    const panels = [...grid.querySelectorAll<HTMLElement>("[data-plot-panel]")].map((panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        id: panel.dataset.plotPanel || "",
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width)
      };
    });
    return {
      display: getComputedStyle(grid).display,
      flexWrap: getComputedStyle(grid).flexWrap,
      panels
    };
  });
  expect(plotLayout.display).toBe("flex");
  expect(plotLayout.flexWrap).toBe("wrap");
  const firstRow = plotLayout.panels.filter((panel) => panel.top === plotLayout.panels[0].top);
  const referencePanels = plotLayout.panels.filter((panel) => ["stability", "strip", "phasePortrait"].includes(panel.id));
  const heatPanel = plotLayout.panels.find((panel) => panel.id === "heatEngine")!;
  const workPanel = plotLayout.panels.find((panel) => panel.id === "work")!;
  expect(plotLayout.panels.map((panel) => panel.id)).toEqual(["model", "heatEngine", "work", "light", "velocity", "tpOpacity", "phasePortrait", "time", "lum", "stability", "strip"]);
  expect(plotLayout.panels.map((panel) => panel.id).slice(1, 6)).toEqual(["heatEngine", "work", "light", "velocity", "tpOpacity"]);
  expect(firstRow.map((panel) => panel.id)).toEqual(expect.arrayContaining(["model", "heatEngine", "work"]));
  expect(workPanel.top).toBe(heatPanel.top);
  expect(workPanel.left).toBeGreaterThan(heatPanel.left);
  expect(firstRow.find((panel) => panel.id === "model")!.width).toBeLessThan(360);
  expect(heatPanel.width).toBeLessThan(360);
  expect(workPanel.width).toBeLessThan(360);
  expect(plotLayout.panels.find((panel) => panel.id === "light")!.width).toBeGreaterThan(360);
  expect(plotLayout.panels.find((panel) => panel.id === "velocity")!.width).toBeGreaterThan(360);
  expect(plotLayout.panels.find((panel) => panel.id === "phasePortrait")!.width).toBeGreaterThan(360);
  expect(plotLayout.panels.find((panel) => panel.id === "tpOpacity")!.width).toBeGreaterThan(360);
  expect(plotLayout.panels.find((panel) => panel.id === "time")!.width).toBeGreaterThan(360);
  expect(referencePanels.every((panel) => panel.width >= 400)).toBe(true);
  expect(new Set(referencePanels.map((panel) => panel.top)).size).toBeLessThanOrEqual(2);
  const hasModelPaint = await page.locator("#modelCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(hasModelPaint).toBe(true);
  const phaseDelta = (a: number, b: number) => {
    const direct = Math.abs(a - b);
    return Math.min(direct, 2 - direct);
  };
  const phaseDeltaModOne = (a: number, b: number) => {
    const direct = Math.abs(((a % 1) + 1) % 1 - ((b % 1) + 1) % 1);
    return Math.min(direct, 1 - direct);
  };
  const lightPhaseBox = await page.locator("#lightCanvas").boundingBox();
  expect(lightPhaseBox).not.toBeNull();
  await page.mouse.move(lightPhaseBox!.x + lightPhaseBox!.width * 0.72, lightPhaseBox!.y + lightPhaseBox!.height * 0.44);
  await page.mouse.down();
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-phase-scrubbing", "true");
  const heldPhaseBefore = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  await page.waitForTimeout(240);
  const heldPhaseAfter = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  expect(phaseDelta(heldPhaseAfter, heldPhaseBefore)).toBeLessThan(0.01);
  await page.mouse.move(lightPhaseBox!.x + lightPhaseBox!.width * 0.52, lightPhaseBox!.y + lightPhaseBox!.height * 0.44);
  const draggedPhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  expect(phaseDelta(draggedPhase, heldPhaseAfter)).toBeGreaterThan(0.1);
  await page.mouse.up();
  await expect(page.locator("#lightCanvas")).not.toHaveAttribute("data-phase-scrubbing", "true");
  const releasePhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  await page.waitForTimeout(260);
  const resumedPhase = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  expect(phaseDelta(resumedPhase, releasePhase)).toBeGreaterThan(0.04);
  const portraitPhaseAfterResume = Number(await page.locator("#phasePortraitCanvas").getAttribute("data-current-phase"));
  expect(phaseDeltaModOne(portraitPhaseAfterResume, resumedPhase)).toBeLessThan(0.08);
  const stripPhaseAfterResume = Number(await page.locator("#cepheidGuideCanvas").getAttribute("data-current-phase"));
  expect(phaseDelta(stripPhaseAfterResume, resumedPhase)).toBeLessThan(0.08);
  await page.waitForTimeout(260);
  const portraitPhaseLater = Number(await page.locator("#phasePortraitCanvas").getAttribute("data-current-phase"));
  const stripPhaseLater = Number(await page.locator("#cepheidGuideCanvas").getAttribute("data-current-phase"));
  const lightPhaseLater = Number(await page.locator("#lightCanvas").getAttribute("data-current-phase"));
  expect(phaseDeltaModOne(portraitPhaseLater, portraitPhaseAfterResume)).toBeGreaterThan(0.04);
  expect(phaseDeltaModOne(portraitPhaseLater, lightPhaseLater)).toBeLessThan(0.08);
  expect(phaseDelta(stripPhaseLater, stripPhaseAfterResume)).toBeGreaterThan(0.04);
  expect(phaseDelta(stripPhaseLater, lightPhaseLater)).toBeLessThan(0.08);
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-luminosity-arc-labels", "L_c,L,L_r");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-geometry-guides", "R=1,eta,minR,maxR");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-boundary-luminosity-lines");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-velocity-arc-label");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-radius-label");
  await expect(page.locator("#plotGrid")).not.toHaveAttribute("data-plot-columns", /.+/);
  await expect(page.locator("#hiddenPlotControls")).toBeHidden();
  await expect(page.locator("#plotGrid")).toHaveCSS("display", "flex");
  await expect(page.locator("#plotGrid")).toHaveCSS("flex-wrap", "wrap");
  await expect(page.locator("#plotGrid")).toHaveCSS("--plot-panel-min-width", "400px");
  await expect(page.locator("#referencePlotGrid")).toHaveCount(0);
  await expect(page.locator("#plotGrid .reference-plot-panel")).toHaveCount(3);
  await expect(page.locator("#plotGrid")).toContainText("Stability Map");
  await expect(page.locator("#plotGrid")).toContainText("Instability Strip");
  await expect(page.locator("#plotGrid")).not.toContainText("Instability Strip Guide");
  await expect(page.locator("#plotGrid")).toContainText("Thermal-Convection Loop");
  await expect(page.locator("#plotGrid")).not.toContainText("Stellingwerf");
  await expect(page.locator("#plotGrid")).not.toContainText("Fig.");
  await expect(page.locator("#plotGrid")).not.toContainText("Cepheid");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-mode", "single");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-legend", "linear damping,convective/turbulent instability,secular instability,dynamic instability,pulsational instability");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stellingwerf-labels", "zeta,zeta_c,gamma_c");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-editable-parameters", "zetac,zeta");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-scale", "log10");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-range", "0.01,100");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-axis-labels", "log10 convective response zeta_c,log10 thermal response zeta");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-cepheid-mode", "single");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-mode", "single");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-labels", "linear damping,convective/turbulent instability,secular instability,dynamic instability,pulsational instability");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-legend", "linear damping,convective/turbulent instability,secular instability,dynamic instability,pulsational instability");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-counts", /stable:\d+,convective:\d+,secular:\d+,dynamic:\d+,pulsational:\d+,neutral:\d+/);
  const initialStripSignature = await page.locator("#cepheidGuideCanvas").getAttribute("data-instability-signature");
  expect(initialStripSignature).toBeTruthy();
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-x-axis-label", "log10(zetac/zeta) convective/thermal response");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-x-axis-direction", "redward-right");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-editable-parameters", "zetac,gammac");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-stellingwerf-labels", "gamma_c,log10_zeta_c_over_zeta");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-axis-labels", "log10(zeta_c/zeta) convective/thermal response,convective flux fraction gamma_c");
  await expect(page.locator("#cepheidGuideCanvas")).not.toHaveAttribute("data-teff-phase-track");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-current-phase", /\d+\.\d+/);
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-phase-portrait-mode", "single");
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-phase-portrait-rows", /[1-9]\d*/);
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-current-phase", /\d+\.\d+/);
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-stellingwerf-labels", "R,H,U_c,current_phase");
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-axis-labels", "radius R,thermal-pressure state H and convective velocity U_c");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-tp-opacity-mode", "single");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-axis-labels", "log10(T/T0),log10(P/P0)");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-color-variable", "log10(kappa/kappa0)");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-opacity-colorbar", "log10(kappa/kappa0)");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-opacity-palette", "blue-gold");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-opacity-contours", "log10(kappa/kappa0)");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-opacity-vector-field");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-opacity-colorbar-marker", "current-phase");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-current-opacity", /-?\d+\.\d+/);
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-current-phase", /\d+\.\d+/);
  const zetaSlider = page.getByRole("slider", { name: "thermal response" });
  const zetacSlider = page.getByRole("slider", { name: "convective response" });
  const gammacSlider = page.getByRole("slider", { name: "convective flux fraction" });
  const stabilityMapBox = await page.locator("#stabilityMapCanvas").boundingBox();
  expect(stabilityMapBox).not.toBeNull();
  await page.mouse.click(
    stabilityMapBox!.x + 58 + (stabilityMapBox!.width - 78) * 0.5,
    stabilityMapBox!.y + 34 + (stabilityMapBox!.height - 88) * 0.25
  );
  await expect(zetacSlider).toHaveValue("0");
  await expect(zetaSlider).toHaveValue("1");
  await expect(page.locator("[data-value-for='zetac']")).toHaveText("1");
  await expect(page.locator("[data-value-for='zeta']")).toHaveText("10");
  await expect.poll(async () => page.locator("#cepheidGuideCanvas").getAttribute("data-instability-signature"))
    .not.toBe(initialStripSignature);
  const stripBox = await page.locator("#cepheidGuideCanvas").boundingBox();
  expect(stripBox).not.toBeNull();
  await page.mouse.move(stripBox!.x + 64 + (stripBox!.width - 90) * 0.25, stripBox!.y + 28 + (stripBox!.height - 88) * 0.35);
  await page.mouse.down();
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-reference-interaction", "instability-strip");
  await page.mouse.move(stripBox!.x + 64 + (stripBox!.width - 90) * 0.5, stripBox!.y + 28 + (stripBox!.height - 88) * 0.8);
  await page.mouse.up();
  await expect(page.locator("#cepheidGuideCanvas")).not.toHaveAttribute("data-reference-interaction");
  await expect(zetacSlider).toHaveValue("1");
  await expect(page.locator("[data-value-for='zetac']")).toHaveText("10");
  await expect(gammacSlider).toHaveValue("0.2");
  await page.locator("[data-reset-key='zeta']").click();
  await page.locator("[data-reset-key='zetac']").click();
  await page.locator("[data-reset-key='gammac']").click();
  await expect(zetaSlider).toHaveValue("0");
  await expect(zetacSlider).toHaveValue("0");
  await expect(page.locator("[data-value-for='zeta']")).toHaveText("1");
  await expect(page.locator("[data-value-for='zetac']")).toHaveText("1");
  await expect(gammacSlider).toHaveValue("0.5");
  const stabilityHasPaint = await page.locator("#stabilityMapCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(stabilityHasPaint).toBe(true);
  const phasePortraitHasPaint = await page.locator("#phasePortraitCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(phasePortraitHasPaint).toBe(true);
  const tpOpacityHasPaint = await page.locator("#tpOpacityCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(tpOpacityHasPaint).toBe(true);
  await page.locator("[data-plot-toggle='model']").uncheck();
  await expect(page.locator("[data-plot-panel='model']")).toBeHidden();
  await expect(page.locator("#hiddenPlotControls")).toBeVisible();
  await expect(page.locator("#hiddenPlotControls")).toContainText("Shell");
  await expect(page.locator("#plotGrid")).toHaveAttribute("data-visible-plots", "10");
  await expect(page.locator("#plotGrid")).not.toHaveAttribute("data-plot-columns", /.+/);
  await expect(page.locator("#plotGrid .plot-panel canvas:visible")).toHaveCount(10);
  await page.locator("#hiddenPlotControls [data-plot-toggle='model']").check();
  await expect(page.locator("[data-plot-panel='model']")).toBeVisible();
  await expect(page.locator("#hiddenPlotControls")).toBeHidden();
  await expect(page.locator("#plotGrid")).toHaveAttribute("data-visible-plots", "11");
  await expect(page.locator("#plotGrid")).not.toHaveAttribute("data-plot-columns", /.+/);
  const doubleTapRadiusControl = page.locator("[data-control-key='r0']");
  const doubleTapRadiusSlider = doubleTapRadiusControl.locator(".single-slider");
  await touchTapSlider(doubleTapRadiusSlider, 701);
  await touchTapSlider(doubleTapRadiusSlider, 702);
  await expect(page.getByLabel("Enable grid mode")).toBeChecked();
  await expect(doubleTapRadiusControl).toHaveClass(/is-grid-range/);
  await touchTapSlider(doubleTapRadiusSlider, 703);
  await touchTapSlider(doubleTapRadiusSlider, 704);
  await expect(doubleTapRadiusControl).not.toHaveClass(/is-grid-range/);
  await page.getByLabel("Enable grid mode").uncheck();
  await expect(page.getByLabel("Enable grid mode")).not.toBeChecked();
  await expect(page.locator("#fourierGridPanel")).toBeHidden();
  const fluxControl = page.getByRole("slider", { name: "convective flux fraction" })
    .locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
  const fluxHeightBefore = await fluxControl.evaluate((node) => node.getBoundingClientRect().height);
  await fluxControl.dispatchEvent("contextmenu");
  await expect(page.getByLabel("Enable grid mode")).toBeChecked();
  await expect(page.locator("[data-plot-panel='model']")).toBeHidden();
  await expect(page.locator("[data-plot-panel='heatEngine']")).toBeHidden();
  await expect(page.locator("[data-plot-panel='work']")).toBeHidden();
  await expect(page.locator("[data-plot-panel='time']")).toBeHidden();
  await expect(page.locator("[data-plot-panel='lum']")).toBeHidden();
  await expect(page.locator("[data-plot-panel='tpOpacity']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='stability']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='strip']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='phasePortrait']")).toBeVisible();
  await expect(page.locator("#plotGrid")).toHaveAttribute("data-visible-plots", "6");
  await expect(page.locator("#hiddenPlotControls [data-plot-toggle='model']")).toBeDisabled();
  await expect(page.locator("#hiddenPlotControls [data-plot-toggle='heatEngine']")).toBeDisabled();
  await expect(page.locator("#hiddenPlotControls [data-plot-toggle='work']")).toBeDisabled();
  await expect(page.locator("#hiddenPlotControls [data-plot-toggle='time']")).toBeDisabled();
  await expect(page.locator("#hiddenPlotControls [data-plot-toggle='lum']")).toBeDisabled();
  await expect(page.locator("[data-plot-toggle='tpOpacity']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='stability']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='strip']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='phasePortrait']")).not.toBeDisabled();
  await expect(page.locator("#lightCanvas")).not.toHaveAttribute("data-current-phase");
  await expect(page.locator("#velocityCanvas")).not.toHaveAttribute("data-current-phase");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-current-phase");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-opacity-colorbar-marker");
  await expect(page.locator("#phasePortraitCanvas")).not.toHaveAttribute("data-current-phase");
  const gridPhaseBefore = Number(await page.locator("#cepheidGuideCanvas").getAttribute("data-current-phase"));
  await page.waitForTimeout(260);
  const gridPhaseAfter = Number(await page.locator("#cepheidGuideCanvas").getAttribute("data-current-phase"));
  expect(phaseDelta(gridPhaseAfter, gridPhaseBefore)).toBeLessThan(0.01);
  await expect(page.locator("#fourierGridPanel")).toBeVisible();
  const loopSpeed = page.getByRole("slider", { name: "parameter loop speed" });
  await expect(loopSpeed).toHaveValue("1");
  await expect(page.locator("#gridLoopSpeedValue")).toHaveText("1x");
  await loopSpeed.evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "2";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#gridLoopSpeedValue")).toHaveText("2x");
  await expect(fluxControl).toHaveClass(/is-grid-range/);
  const fluxHeightAfter = await fluxControl.evaluate((node) => node.getBoundingClientRect().height);
  expect(Math.abs(fluxHeightAfter - fluxHeightBefore)).toBeLessThanOrEqual(1);
  const radiusControl = page.getByRole("slider", { name: "initial radius" })
    .locator("xpath=ancestor::*[contains(@class, 'slider-control')]");
  await page.getByRole("slider", { name: "initial radius" }).click();
  await expect(radiusControl).not.toHaveClass(/is-grid-range/);
  await page.getByRole("slider", { name: "initial radius" }).evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1.1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await fluxControl.dispatchEvent("contextmenu");
  await expect(fluxControl).not.toHaveClass(/is-grid-range/);
  await fluxControl.dispatchEvent("contextmenu");
  await radiusControl.dispatchEvent("contextmenu");
  const ensureGridRange = async (control: Locator) => {
    if (!(await page.getByLabel("Enable grid mode").isChecked())) await page.getByLabel("Enable grid mode").check();
    if (!((await control.getAttribute("class")) || "").includes("is-grid-range")) await control.dispatchEvent("contextmenu");
  };
  await ensureGridRange(fluxControl);
  await ensureGridRange(radiusControl);
  await page.getByLabel("convective flux fraction grid lower bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByLabel("convective flux fraction grid upper bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0.02";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByLabel("initial radius grid lower bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1.09";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByLabel("initial radius grid upper bound").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1.11";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#gridLoopControls")).toBeVisible();
  await expect(page.locator("#gridLoopControls input[type='radio']")).toHaveCount(2);
  await expect(page.locator("#gridStatusText")).toContainText("Grid complete", { timeout: 15000 });
  await expect(page.locator("[data-control-key='gammac'] [data-grid-loop-marker]")).toBeVisible();
  await expect(page.locator("[data-control-key='r0'] [data-grid-loop-marker]")).toBeHidden();
  await page.locator("#gridLoopControls input[value='r0']").check();
  await velocitySource.evaluate((button) => (button as HTMLButtonElement).click());
  await pianoToggle.click();
  await expect(page.locator("#pianoPanel")).toBeVisible();
  await expect(sonificationToggle).not.toBeDisabled();
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "true");
  await sonificationToggle.click();
  await expect(sonificationToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#pianoPanel")).toHaveAttribute("data-sonification-signature", /.+/);
  const gridPianoSignature = await page.locator("#pianoPanel").getAttribute("data-sonification-signature");
  await expect.poll(async () => page.locator("#pianoPanel").getAttribute("data-sonification-signature"), { timeout: 5000 })
    .not.toBe(gridPianoSignature);
  await pianoToggle.click();
  await page.locator("#gridLoopControls input[value='gammac']").check();
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-grid-colorbar-key", "gammac", { timeout: 5000 });
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-mode", "grid");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-cepheid-mode", "grid");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-mode", "grid");
  await expect(page.locator("#phasePortraitCanvas")).toHaveAttribute("data-phase-portrait-mode", "grid");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-tp-opacity-mode", "grid");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-tp-opacity-tracks", /[2-9]\d*/);
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-color-variable", "grid parameter");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-opacity-contours", "log10(kappa/kappa0)");
  await expect(page.locator("#tpOpacityCanvas")).toHaveAttribute("data-grid-colorbar", "ready");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-opacity-colorbar");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-opacity-palette");
  await expect(page.locator("#tpOpacityCanvas")).not.toHaveAttribute("data-opacity-colorbar-marker");
  await expect(page.locator("#phasePortraitCanvas")).not.toHaveAttribute("data-current-phase");
  const fourierHasPaint = await page.locator("#fourierCanvas").evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement;
    const ctx = node.getContext("2d");
    if (!ctx) return false;
    return ctx.getImageData(0, 0, node.width, node.height).data.some((value) => value !== 0);
  });
  expect(fourierHasPaint).toBe(true);
  await expect(page.locator("#fourierCanvas")).toHaveAttribute("data-fourier-axis-labels", String.raw`r_{21},r_{31},\phi_{21},\phi_{31}`);
  await expect(page.locator("#fourierCanvas")).toHaveAttribute("data-fourier-phase-ticks", "pi-multiples");
  await expect(page.locator("#fourierCanvas")).not.toHaveAttribute("data-fourier-structural-panels");
  await expect(page.locator("#fourierCanvas")).not.toHaveAttribute("data-fourier-adiabatic-reference");
  await expect(page.locator("#fourierCanvas")).toHaveAttribute("data-fourier-path-count", /[2-9]\d*/);

  await page.locator("#lightCanvas").scrollIntoViewIfNeeded();
  const lightColorbarHitHandle = await page.waitForFunction(
    () => document.querySelector("#lightCanvas")?.getAttribute("data-grid-colorbar-hit") || "",
    null,
    { timeout: 5000 }
  );
  const lightColorbarHit = await lightColorbarHitHandle.jsonValue() as string;
  expect(lightColorbarHit).toBeTruthy();

  await page.locator("#fourierCanvas").scrollIntoViewIfNeeded();
  await expect.poll(async () => Number(await page.locator("#fourierCanvas").getAttribute("data-fourier-hit-count") || "0"), { timeout: 5000 })
    .toBeGreaterThan(0);
  const fourierHit = await page.locator("#fourierCanvas").getAttribute("data-first-fourier-hit");
  expect(fourierHit).toBeTruthy();
  const [fourierHitX, fourierHitY] = fourierHit!.split(",").map(Number);
  const fourierBox = await page.locator("#fourierCanvas").boundingBox();
  expect(fourierBox).not.toBeNull();
  await page.mouse.move(fourierBox!.x + fourierHitX, fourierBox!.y + fourierHitY);
  await expect(page.locator("#fourierCanvas")).toHaveAttribute("data-grid-hover", "true");
  await page.mouse.down();
  await expect(page.locator("#fourierCanvas")).toHaveAttribute("data-grid-interaction", "fourier-hold");
  await page.mouse.up();
  await expect(page.locator("#fourierCanvas")).not.toHaveAttribute("data-grid-interaction", "fourier-hold");

  await page.getByLabel("Enable grid mode").uncheck();
  await expect(page.locator("#fourierGridPanel")).toBeHidden();
  await expect(page.locator("[data-plot-panel='model']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='heatEngine']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='work']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='time']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='lum']")).toBeVisible();
  await expect(page.locator("[data-plot-panel='tpOpacity']")).toBeVisible();
  await expect(page.locator("[data-plot-toggle='model']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='heatEngine']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='work']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='time']")).not.toBeDisabled();
  await expect(page.locator("[data-plot-toggle='lum']")).not.toBeDisabled();
  await expect(page.locator("#adsrCanvas")).toHaveCount(1);
  await expect(page.locator("#lightLegend")).toHaveCount(0);
  await expect(page.locator("#velocityLegend")).toHaveCount(0);
  await expect(page.locator("#phaseLegend")).toHaveCount(0);
  await expect(page.getByLabel("Annotations")).not.toBeChecked();
  await expect(page.locator("#phaseAnnotationLegendItems")).toBeHidden();
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-annotations", "off");
  await page.getByLabel("Annotations").check();
  await expect(page.getByLabel("Annotations")).toBeChecked();
  await expect(page.locator("#phaseAnnotationLegendItems")).toBeVisible();
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-annotations", "on");
  await expect(page.locator("#phaseAnnotationLegendItems .annotation-symbol-item")).toHaveText([
    "max L",
    "min L",
    "max R",
    "min R",
    "×max V",
    "×min V",
    "↑max T",
    "↓min T"
  ]);
  const annotationLegendLayout = await page.locator("#phaseAnnotationLegendItems").evaluate((legend) => {
    const items = [...legend.querySelectorAll<HTMLElement>(".annotation-symbol-item")];
    const columnGap = parseFloat(getComputedStyle(legend).columnGap || "0") || 0;
    const rows = items.map((item) => Math.round(item.getBoundingClientRect().top));
    const totalTermWidth = items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0)
      + columnGap * Math.max(0, items.length - 1);
    return {
      rows,
      allTermsFit: totalTermWidth <= legend.getBoundingClientRect().width + 0.5
    };
  });
  if (annotationLegendLayout.allTermsFit) {
    expect(new Set(annotationLegendLayout.rows).size).toBe(1);
  } else {
    expect(annotationLegendLayout.rows.slice(0, 4).every((row) => row === annotationLegendLayout.rows[0])).toBe(true);
    expect(annotationLegendLayout.rows[4]).toBeGreaterThan(annotationLegendLayout.rows[3]);
    expect(annotationLegendLayout.rows.slice(4).every((row) => row === annotationLegendLayout.rows[4])).toBe(true);
  }
  await expect.poll(async () => Number(await page.locator("#lightCanvas").getAttribute("data-annotation-count") || "0"))
    .toBe(16);
  await expect.poll(async () => Number(await page.locator("#velocityCanvas").getAttribute("data-annotation-count") || "0"))
    .toBe(16);
  await page.getByLabel("Annotations").uncheck();
  await expect(page.locator("#phaseAnnotationLegendItems")).toBeHidden();
  await expect(page.locator("#lightCanvas")).toHaveAttribute("data-annotations", "off");
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
  await expect(page.locator("[data-value-for='tEnd']")).toHaveText("300");
  await expect(page.locator(".equation-label")).toHaveCount(0);
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-layout", "stacked");
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.89");
  await expect(page.locator("#derivationPanel")).toBeVisible();
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-physics-mode", "convective");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-driver-mode", "h");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-convection-mode", "time-dependent");
  await expect(page.locator("#derivationContent [data-derivation-block]")).toHaveCount(6);
  await expect(page.locator("[data-derivation-block='opacity']")).toBeVisible();
  await expect(page.locator("[data-derivation-block='equilibrium']")).toBeVisible();
  await expect(page.locator("[data-derivation-block='linear']")).toBeVisible();
  await expect(page.locator("#derivationContent [data-stability-kind='convective']")).toHaveCount(1);
  const [sourceText, modelText, htmlText] = await page.evaluate(async () =>
    Promise.all([
      fetch("/src/main.ts").then((response) => response.text()),
      fetch("/src/model.ts").then((response) => response.text()),
      fetch("/wizard_of_oz.html").then((response) => response.text()),
    ]),
  );
  expect(sourceText).toContain("\\\\ozChiZero{\\\\chi_0}");
  expect(sourceText).toContain("\\\\ozChi{\\\\chi}");
  expect(sourceText).toContain("\\\\ozEta{\\\\eta}");
  expect(sourceText).not.toContain("\\\\ozNeutral{\\\\gamma_r}");
  expect(sourceText).toContain("1-\\\\ozGammac{\\\\gamma_c}");
  expect(htmlText).not.toContain("\\ozNeutral{\\gamma_r}");
  expect(modelText).toContain("Thin shell form factor");
  expect(modelText).not.toContain("Reference shell form factor");
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
  await expect(page.locator("#timeLegend")).toContainText("convective velocity");
  await expect(page.locator("#lumLegend")).toContainText("total");
  await expect(page.locator("#lumLegend")).toContainText("radiative");
  await expect(page.locator("#lumLegend")).toContainText("convective");
  await expect(page.locator("#lumLegend")).toContainText("source");
  await expect(page.locator("#lumLegend")).not.toContainText("base");
  await expect(page.locator("#lumLegend [data-plot-series='Lb']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lumLegend [data-plot-series='Lb']")).toHaveAttribute("aria-label", "Toggle source luminosity visibility");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-convection-active", "true");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-luminosity-arc-labels", "L_c,L,L_r");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-boundary-luminosity-lines");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-velocity-arc-label");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-radius-label");
  await expect(page.locator("input[aria-label='convective response']")).toHaveValue("0");
  await page.locator("input[aria-label='convective response']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "-2";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#timeLegend [data-plot-series='Uc']")).toHaveCount(0);
  await expect(page.locator("#timeLegend")).not.toContainText("convective velocity");
  await expect(page.locator("#lumLegend")).not.toContainText("radiative");
  await expect(page.locator("#lumLegend")).not.toContainText("convective");
  await expect(page.locator("#lumLegend")).toContainText("source");
  await expect(page.locator("#lumLegend")).not.toContainText("base");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-physics-mode", "radiative");
  await expect(page.locator("#metrics")).not.toHaveAttribute("data-s72-convective");
  await expect(page.locator("#metrics [data-stability-kind='convective']")).toHaveCount(0);
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-physics", "radiative");
  await expect(page.locator("#stabilityMapCanvas")).toHaveAttribute("data-stability-legend", "linear damping,secular instability,dynamic instability,pulsational instability");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-physics", "radiative");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-legend", "linear damping,secular instability,dynamic instability,pulsational instability");
  await expect(page.locator("#cepheidGuideCanvas")).toHaveAttribute("data-instability-counts", /stable:\d+,secular:\d+,dynamic:\d+,pulsational:\d+,neutral:\d+/);
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-convection-active", "false");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-luminosity-arc-labels", "");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-boundary-luminosity-lines");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-velocity-arc-label");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-radius-label");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-physics-mode", "radiative");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-convection-mode", "frozen");
  await expect(page.locator("#derivationContent [data-stability-kind='convective']")).toHaveCount(0);
  await page.locator("input[aria-label='initial convective velocity']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#timeLegend [data-plot-series='Uc']")).toHaveCount(1);
  await expect(page.locator("#timeLegend")).toContainText("convective velocity");
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-convection-active", "true");
  await page.locator("input[aria-label='initial convective velocity']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("input[aria-label='convective response']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#timeLegend [data-plot-series='Uc']")).toHaveCount(1);
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-convection-active", "true");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-physics-mode", "convective");
  await expect(page.locator("#metrics")).toHaveAttribute("data-s72-convective", "stable");
  await expect(page.locator("#metrics [data-stability-kind='convective']")).toHaveCount(1);
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-physics-mode", "convective");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-convection-mode", "time-dependent");
  await expect(page.locator("#derivationContent [data-stability-kind='convective']")).toHaveCount(1);
  await expect(page.locator("#modelCanvas")).toHaveAttribute("data-luminosity-arc-labels", "L_c,L,L_r");
  await expect(page.locator("#modelCanvas")).not.toHaveAttribute("data-boundary-luminosity-lines");
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
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-geometry-mode", "fixed");
  await page.locator("#variableM").check();
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-geometry-mode", "radius-dependent");
  const timeLegendHtmlBeforeMSlider = await page.locator("#timeLegend").innerHTML();
  await page.locator("input[aria-label='shell thinness']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = String(((15 - 3) / (20 - 3)) * 0.82);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#luminosityEquations mjx-container")).not.toHaveCount(0);
  await expect(page.locator("#metrics mjx-container")).not.toHaveCount(0);
  expect(await page.locator("#timeLegend").innerHTML()).toBe(timeLegendHtmlBeforeMSlider);
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.93");
  await page.locator("input[aria-label='shell thinness']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.00");
  await page.locator("[data-reset-key='m']").click();
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-eta-value", "0.89");
  await page.locator("[data-driver='abs-v']").click();
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "abs-v");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-driver-mode", "abs-v");
  await page.locator("[data-driver='h']").click();
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-driver-mode", "h");
  await expect(page.locator("#derivationPanel")).toHaveAttribute("data-driver-mode", "h");

  await page.locator("input[aria-label='max time']").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("[data-value-for='tEnd']")).toHaveText("1000");
  const historyXmax = async () => Number((await page.locator("#timeCanvas").getAttribute("data-xlim"))?.split(",")[1] || NaN);
  await expect.poll(historyXmax, { timeout: 15000 }).toBeLessThan(1000);
  expect(await historyXmax()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "DOP853" }).click();
  await expect(page.getByRole("button", { name: "DOP853" })).toHaveClass(/active/);
  await expect.poll(historyXmax, { timeout: 15000 }).toBeLessThan(1000);
  await expect(page.locator("#metrics")).toContainText("stable limit cycle");
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

  if (!(await page.locator("#phaseAnnotationsToggle").isChecked())) {
    await page.locator("#phaseAnnotationsToggle").check();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#luminosityEquations")).toHaveAttribute("data-geometry-layout", "stacked");
  const mobilePhaseLayout = await page.locator("#plotGrid").evaluate((grid) => {
    const lightPanel = grid.querySelector<HTMLElement>("[data-plot-panel='light']");
    const velocityPanel = grid.querySelector<HTMLElement>("[data-plot-panel='velocity']");
    const lightCanvas = grid.querySelector<HTMLCanvasElement>("#lightCanvas");
    const velocityCanvas = grid.querySelector<HTMLCanvasElement>("#velocityCanvas");
    const annotationLegend = grid.querySelector<HTMLElement>("#phaseAnnotationLegendItems");
    return {
      lightPanelHeight: lightPanel?.getBoundingClientRect().height ?? 0,
      velocityPanelHeight: velocityPanel?.getBoundingClientRect().height ?? 0,
      lightCanvasHeight: lightCanvas ? getComputedStyle(lightCanvas).height : "",
      velocityCanvasHeight: velocityCanvas ? getComputedStyle(velocityCanvas).height : "",
      annotationLegendVisible: annotationLegend
        ? getComputedStyle(annotationLegend).display !== "none" && annotationLegend.getBoundingClientRect().height > 0
        : false
    };
  });
  expect(mobilePhaseLayout.lightCanvasHeight).toBe("176px");
  expect(mobilePhaseLayout.velocityCanvasHeight).toBe("176px");
  expect(mobilePhaseLayout.annotationLegendVisible).toBe(true);
  expect(mobilePhaseLayout.lightPanelHeight).toBeLessThan(330);
  expect(mobilePhaseLayout.velocityPanelHeight).toBeLessThan(245);
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
