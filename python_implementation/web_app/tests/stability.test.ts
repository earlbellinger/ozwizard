import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/model";
import { cepheidStripCoordinate, linearStability, polynomialRoots } from "../src/stability";

describe("linear stability helpers", () => {
  it("finds polynomial roots for real and complex pairs", () => {
    const roots = polynomialRoots([0, 0, 0, -1]);
    const sorted = roots.sort((a, b) => a.re - b.re || a.im - b.im);
    expect(sorted.some((root) => Math.abs(root.re + 1) < 1e-6 && Math.abs(root.im) < 1e-6)).toBe(true);
    expect(sorted.some((root) => Math.abs(root.re - 1) < 1e-6 && Math.abs(root.im) < 1e-6)).toBe(true);
    expect(sorted.some((root) => Math.abs(root.re) < 1e-6 && Math.abs(root.im - 1) < 1e-6)).toBe(true);
    expect(sorted.some((root) => Math.abs(root.re) < 1e-6 && Math.abs(root.im + 1) < 1e-6)).toBe(true);
  });

  it("classifies standard convective models across Stellingwerf-like regimes", () => {
    const base = PRESETS["Instability-strip convection"];
    const stable = linearStability({ ...base, zeta: 1, zetac: 1, gammac: 0.45 });
    const dynamic = linearStability({ ...base, zeta: 3, zetac: 0.3, gammac: 1 });
    expect(stable.kind).toBe("stable");
    expect(dynamic.kind).toBe("dynamic");
    expect(dynamic.maxReal).toBeGreaterThan(0);
  });

  it("places blue, strip, and red presets along the schematic coordinate", () => {
    const blue = cepheidStripCoordinate(PRESETS["Blue-edge convection"]);
    const strip = cepheidStripCoordinate(PRESETS["Instability-strip convection"]);
    const red = cepheidStripCoordinate(PRESETS["Red-edge convection"]);
    expect(blue).toBeLessThan(strip);
    expect(strip).toBeCloseTo(0.5, 12);
    expect(red).toBeGreaterThan(strip);
  });
});
