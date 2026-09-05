import { expect, test } from "@playwright/test";

test("rendered geometry equations fit their boxes at desktop and mobile widths", async ({ page }) => {
  await page.goto("/wizard_of_oz.html");
  await expect(page.locator("#odeEquations mjx-container > svg")).toBeVisible();

  for (const width of [1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ["homogeneous-shell", "local-exponent", "constant"]) {
      await page.locator("#geometryMode").selectOption(mode, { force: true });
      for (const id of ["odeEquations", "luminosityEquations"]) {
        const block = page.locator(`#${id}`);
        await expect(block).toHaveAttribute("data-math-state", "ready");
        await expect(block.locator("mjx-container > svg")).toHaveCount(id === "odeEquations" ? 1 : 2);
        const bounds = await block.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
          return [...node.querySelectorAll("mjx-container > svg")].map((svg) => {
            const rect = svg.getBoundingClientRect();
            return { left: rect.left - left, right: right - rect.right };
          });
        });
        for (const svg of bounds) {
          expect(svg.left, `${width}px ${mode} ${id} left edge`).toBeGreaterThanOrEqual(-1);
          expect(svg.right, `${width}px ${mode} ${id} right edge`).toBeGreaterThanOrEqual(-1);
        }
        await expect(block.locator('[data-mml-node="merror"]')).toHaveCount(0);
      }
    }
  }
});
