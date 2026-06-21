import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/model";
import { analyticStabilityConditions, cepheidStripCoordinate, linearStability, polynomialRoots } from "../src/stability";

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

  it("translates the S72 analytic stability criteria into app parameters", () => {
    const base = PRESETS["Instability-strip convection"];
    const stability = analyticStabilityConditions(base);

    expect(stability.m).toBeCloseTo(10, 12);
    expect(stability.dynamic.value).toBeCloseTo(base.gamma1, 12);
    expect(stability.dynamic.threshold).toBeCloseTo(4 / base.m, 12);
    expect(stability.dynamic.stable).toBe(true);
    expect(stability.secular.value).toBeCloseTo(4 + base.m * base.n + (base.m - 4) * (base.s + 4), 12);
    expect(stability.secular.stable).toBe(true);
    expect(stability.pulsational.value).toBeCloseTo(4 + base.m * (base.n - (base.s + 4) * (base.gamma1 - 1)), 12);
    expect(stability.pulsational.stable).toBe(false);
    expect(stability.allStable).toBe(false);
  });

  it("evaluates S72 criteria at the equilibrium thin shell form factor for radius-dependent geometry", () => {
    const base = PRESETS["Radius-dependent strip"];
    const stability = analyticStabilityConditions({ ...base, m: 15, n: 0, s: 8, gamma1: 1.5 });

    expect(stability.m).toBeCloseTo(15, 12);
    expect(stability.dynamic.stable).toBe(true);
    expect(stability.secular.stable).toBe(true);
    expect(stability.pulsational.value).toBeCloseTo(4 + 15 * (0 - 12 * 0.5), 12);
    expect(stability.pulsational.stable).toBe(true);
    expect(stability.allStable).toBe(true);
  });

  it("marks failed S72 dynamic and secular conditions independently", () => {
    const base = PRESETS["Instability-strip convection"];
    const stability = analyticStabilityConditions({ ...base, m: 3, n: 0, s: 8, gamma1: 1.1 });

    expect(stability.dynamic.threshold).toBeCloseTo(4 / 3, 12);
    expect(stability.dynamic.stable).toBe(false);
    expect(stability.secular.value).toBeCloseTo(4 + 3 * 0 + (3 - 4) * (8 + 4), 12);
    expect(stability.secular.stable).toBe(false);
  });
});
