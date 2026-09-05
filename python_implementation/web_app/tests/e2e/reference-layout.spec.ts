import { expect, test, type Page } from "@playwright/test";

type Geometry = "constant" | "local-exponent" | "homogeneous-shell";
type ReferenceState = { name: string; alpha: number; geometry: Geometry; convection: boolean };

const states: ReferenceState[] = [
  { name: "baseline", alpha: 0, geometry: "homogeneous-shell", convection: true },
  { name: "pressure", alpha: 0.4, geometry: "homogeneous-shell", convection: true },
  { name: "constant-pressure", alpha: 0.4, geometry: "constant", convection: true },
  { name: "local-pressure", alpha: 0.4, geometry: "local-exponent", convection: true },
  { name: "radiative", alpha: 0, geometry: "constant", convection: false },
  { name: "pressure-without-convective-flux", alpha: 0.4, geometry: "local-exponent", convection: false },
  { name: "baseline-restored", alpha: 0, geometry: "homogeneous-shell", convection: true }
];

async function renderedReferenceMath(page: Page) {
  await page.waitForFunction(() => ["odeEquations", "luminosityEquations"].every((id) => {
    const node = document.getElementById(id);
    if (!node || node.dataset.mathState === "rendering") return false;
    if (node.dataset.mathVersion && node.dataset.mathRendered !== node.dataset.mathVersion) return false;
    return Boolean(node.querySelector("mjx-container > svg"));
  }));
  // Layout measurements are scheduled after the new MathJax nodes enter the document.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function setReferenceState(page: Page, state: ReferenceState) {
  for (const [label, value] of [
    ["turbulent pressure fraction", state.alpha],
    ["convective flux fraction", state.convection ? 0.5 : 0]
  ] as const) {
    await page.getByRole("slider", { name: label, exact: true }).evaluate((node, nextValue) => {
      (node as HTMLInputElement).value = String(nextValue);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  await page.getByRole("combobox", { name: "Density geometry" }).selectOption(state.geometry);
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-geometry-mode", state.geometry);
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-alpha-p", String(state.alpha));
  await expect(page.locator("#odeEquations")).toHaveAttribute("data-convective-luminosity", state.convection ? "available" : "absent");
  await renderedReferenceMath(page);
}

async function referenceMeasurements(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".reference-grid")!;
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    const panels = [...grid.querySelectorAll<HTMLElement>(":scope > .reference-panel")].map((node) => {
      const css = getComputedStyle(node), rect = box(node);
      const children = [...node.children].filter((child) => child.getBoundingClientRect().height > 0);
      const contentBottom = Math.max(...children.map((child) => box(child).bottom + pixels(getComputedStyle(child).marginBottom)));
      return { heading: node.querySelector("h3")?.textContent ?? "", ...rect,
        naturalBottomGap: rect.bottom - contentBottom - pixels(css.paddingBottom) - pixels(css.borderBottomWidth),
        horizontalOverflow: node.scrollWidth - node.clientWidth,
        verticalOverflow: node.scrollHeight - node.clientHeight,
        horizontalInsets: pixels(css.paddingLeft) + pixels(css.paddingRight) + pixels(css.borderLeftWidth) + pixels(css.borderRightWidth)
      };
    });
    const equations = [...grid.querySelectorAll<HTMLElement>(".equation-block")].map((node) => {
      const css = getComputedStyle(node);
      const svgs = [...node.querySelectorAll<SVGSVGElement>("mjx-container > svg")].map((svg) => {
        // Inspect the actual SVG ink as well as its CSS box, so overflow:hidden cannot hide a failure.
        const bounds = svg.getBBox(), matrix = svg.getScreenCTM();
        if (!matrix) throw new Error("MathJax SVG has no screen transform");
        const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
          [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
          .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
        return { ...box(svg), ink: {
          left: Math.min(...corners.map((point) => point.x)), right: Math.max(...corners.map((point) => point.x)),
          top: Math.min(...corners.map((point) => point.y)), bottom: Math.max(...corners.map((point) => point.y))
        } };
      });
      return { id: node.id, ...box(node), horizontalOverflow: node.scrollWidth - node.clientWidth,
        horizontalInsets: pixels(css.paddingLeft) + pixels(css.paddingRight) + pixels(css.borderLeftWidth) + pixels(css.borderRightWidth), svgs };
    });
    return { columns: Number(grid.dataset.columns), grid: box(grid), panels, equations,
      viewportWidth: window.innerWidth, pageHorizontalOverflow: document.documentElement.scrollWidth - window.innerWidth };
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  const screenshot = testInfo.outputPath("reference-layout-failure.png");
  await page.locator(".reference-grid").screenshot({ path: screenshot });
  await testInfo.attach("reference-layout-failure", { path: screenshot, contentType: "image/png" });
  await testInfo.attach("reference-failure-metrics", {
    body: Buffer.from(JSON.stringify(await referenceMeasurements(page), null, 2)), contentType: "application/json"
  });
});

for (const { width, columns } of [
  { width: 390, columns: 1 }, { width: 1000, columns: 1 },
  { width: 1500, columns: 2 }, { width: 1800, columns: 3 }
]) {
  test(`reference equations fit naturally at ${width}px with ${columns} columns`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/wizard_of_oz.html");
    await page.locator("#sidebarControls").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
    const snapshots: Array<{ name: string; measurements: Awaited<ReturnType<typeof referenceMeasurements>> }> = [];
    for (const state of states) {
      await setReferenceState(page, state);
      await expect(page.locator(".reference-grid")).toHaveAttribute("data-columns", String(columns));
      const m = await referenceMeasurements(page);
      snapshots.push({ name: state.name, measurements: m });
      const [equations, variables, parameters] = m.panels;
      expect(m.columns, state.name).toBe(columns);
      expect(m.pageHorizontalOverflow, state.name).toBeLessThanOrEqual(1);
      expect(m.grid.right, state.name).toBeLessThanOrEqual(m.viewportWidth + 1);
      expect(Math.abs(equations.naturalBottomGap), `${state.name}: equations use their content height`).toBeLessThanOrEqual(3);
      expect(equations.verticalOverflow, `${state.name}: equations have no vertical clipping`).toBeLessThanOrEqual(1);
      for (const panel of m.panels) expect(panel.horizontalOverflow, `${state.name}: ${panel.heading}`).toBeLessThanOrEqual(1);
      for (const block of m.equations) {
        expect(block.horizontalOverflow, `${state.name}: ${block.id}`).toBeLessThanOrEqual(1);
        expect(block.svgs.length).toBeGreaterThan(0);
        for (const svg of block.svgs) for (const bounds of [svg, svg.ink]) {
          expect(bounds.left, `${state.name}: ${block.id} left`).toBeGreaterThanOrEqual(block.left - 1);
          expect(bounds.right, `${state.name}: ${block.id} right`).toBeLessThanOrEqual(block.right + 1);
          expect(bounds.top, `${state.name}: ${block.id} top`).toBeGreaterThanOrEqual(block.top - 1);
          expect(bounds.bottom, `${state.name}: ${block.id} bottom`).toBeLessThanOrEqual(block.bottom + 1);
        }
      }
      const mathWidth = Math.max(...m.equations.flatMap((block) => block.svgs.map((svg) => svg.width + block.horizontalInsets)));
      expect(equations.width - equations.horizontalInsets - mathWidth, `${state.name}: measured minimal width`).toBeLessThanOrEqual(3);
      if (columns === 1) {
        expect(variables.top).toBeGreaterThanOrEqual(equations.bottom);
        expect(parameters.top).toBeGreaterThanOrEqual(variables.bottom);
        expect(Math.abs(variables.naturalBottomGap), `${state.name}: stacked variables use content height`).toBeLessThanOrEqual(3);
        expect(Math.abs(parameters.naturalBottomGap), `${state.name}: stacked parameters use content height`).toBeLessThanOrEqual(3);
      } else {
        expect(Math.abs(variables.top - equations.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(variables.height - equations.height), `${state.name}: paired height`).toBeLessThanOrEqual(1);
        expect(variables.width).toBeGreaterThan(equations.width);
        if (columns === 3) {
          expect(Math.abs(parameters.top - equations.top)).toBeLessThanOrEqual(1);
          expect(Math.abs(parameters.height - equations.height), `${state.name}: three paired heights`).toBeLessThanOrEqual(1);
          expect(parameters.width).toBeGreaterThan(equations.width);
        } else {
          expect(parameters.top).toBeGreaterThanOrEqual(equations.bottom);
          expect(Math.abs(parameters.width - m.grid.width)).toBeLessThanOrEqual(1);
        }
      }
    }
    const baseline = snapshots.find((s) => s.name === "baseline")!.measurements.panels[0];
    const pressure = snapshots.find((s) => s.name === "pressure")!.measurements.panels[0];
    const radiative = snapshots.find((s) => s.name === "radiative")!.measurements.panels[0];
    const restored = snapshots.find((s) => s.name === "baseline-restored")!.measurements.panels[0];
    expect(pressure.height, "additional pressure equations increase natural height").toBeGreaterThan(baseline.height + 1);
    expect(radiative.height, "reduced equations shrink naturally").toBeLessThan(pressure.height - 1);
    expect(Math.abs(restored.height - baseline.height), "turning pressure back off restores natural height").toBeLessThanOrEqual(1);
    await setReferenceState(page, states[1]);
    const screenshot = testInfo.outputPath(`reference-layout-${width}.png`);
    await page.locator(".reference-grid").screenshot({ path: screenshot });
    await testInfo.attach(`reference-layout-${width}`, { path: screenshot, contentType: "image/png" });
    await testInfo.attach(`reference-metrics-${width}`, { body: Buffer.from(JSON.stringify(snapshots, null, 2)), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
}
