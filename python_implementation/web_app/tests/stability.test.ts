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
    expect(stability.physicsMode).toBe("convective");
    expect(stability.conditions.map((condition) => condition.kind)).toEqual(["convective", "secular", "dynamic", "pulsational"]);
    expect(stability.eCoefficient).toBeCloseTo(4, 12);
    expect(stability.terms.radiativeThermal).toBeCloseTo(5.6, 12);
    expect(stability.terms.restoring).toBeCloseTo(7, 12);
    expect(stability.terms.convectiveResponse).toBeCloseTo(45, 12);
    expect(stability.terms.secularCoupling).toBeCloseTo(43.2, 12);
    expect(stability.terms.dynamicCoupling).toBeCloseTo(12.9, 12);
    expect(stability.terms.thermalResponse).toBeCloseTo(6.6, 12);
    expect(stability.convective?.value).toBeCloseTo(45, 12);
    expect(stability.convective?.stable).toBe(true);
    expect(stability.secular.value).toBeCloseTo(50.2, 12);
    expect(stability.secular.stable).toBe(true);
    expect(stability.dynamic.value).toBeCloseTo(350.58, 12);
    expect(stability.dynamic.stable).toBe(true);
    expect(stability.pulsational.value).toBeCloseTo(-206.212, 12);
    expect(stability.pulsational.stable).toBe(false);
    expect(stability.kind).toBe("pulsational");
    expect(stability.allStable).toBe(false);
    expect(stability.conditions.map((condition) => condition.expression).join(" ")).not.toMatch(/\b[ABCD]\b/);
  });

  it("uses the reduced radiative stability criteria when convective response is zero", () => {
    const base = PRESETS["Baker radiative pulsator"];
    const stability = analyticStabilityConditions(base);

    expect(stability.physicsMode).toBe("radiative");
    expect(stability.convective).toBeUndefined();
    expect(stability.conditions.map((condition) => condition.kind)).toEqual(["secular", "dynamic", "pulsational"]);
    expect(stability.eCoefficient).toBeCloseTo(7, 12);
    expect(stability.terms.radiativeThermal).toBeCloseTo(7, 12);
    expect(stability.terms.restoring).toBeCloseTo(7, 12);
    expect(stability.secular.value).toBeCloseTo(56, 12);
    expect(stability.dynamic.value).toBeCloseTo(7, 12);
    expect(stability.pulsational.value).toBeCloseTo(-7, 12);
    expect(stability.kind).toBe("pulsational");
    expect(stability.allStable).toBe(false);
  });

  it("evaluates S72 criteria at the equilibrium thin shell form factor for radius-dependent geometry", () => {
    const base = PRESETS["Radius-dependent strip"];
    const stability = analyticStabilityConditions({ ...base, m: 15, n: 0, s: 8, gamma1: 1.5 });

    expect(stability.m).toBeCloseTo(15, 12);
    expect(stability.eCoefficient).toBeCloseTo(-71.4, 12);
    expect(stability.terms.convectiveResponse).toBeCloseTo(109.5, 12);
    expect(stability.secular.value).toBeCloseTo(124.7, 12);
    expect(stability.terms.dynamicCoupling).toBeCloseTo(28.4, 12);
    expect(stability.terms.thermalResponse).toBeCloseTo(10.6, 12);
    expect(stability.convective?.stable).toBe(true);
    expect(stability.dynamic.stable).toBe(true);
    expect(stability.secular.stable).toBe(true);
    expect(stability.pulsational.value).toBeCloseTo(9686.178, 9);
    expect(stability.pulsational.stable).toBe(true);
    expect(stability.kind).toBe("stable");
    expect(stability.allStable).toBe(true);
  });

  it("marks failed S72 convective and secular conditions independently", () => {
    const base = PRESETS["Instability-strip convection"];
    const stability = analyticStabilityConditions({ ...base, m: 3, n: 0, s: 8, gamma1: 1.1 });

    expect(stability.terms.convectiveResponse).toBeCloseTo(-6.9, 12);
    expect(stability.secular.value).toBeCloseTo(-7.3, 12);
    expect(stability.convective?.stable).toBe(false);
    expect(stability.secular.value).toBeCloseTo(-7.3, 12);
    expect(stability.secular.stable).toBe(false);
    expect(stability.dynamic.stable).toBe(true);
    expect(stability.pulsational.stable).toBe(true);
    expect(stability.kind).toBe("convective");
  });
});
