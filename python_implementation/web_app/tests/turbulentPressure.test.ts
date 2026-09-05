import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_NAME, PRESETS, densityLogSlope, densityRatio, derivatives,
  gasPressureSupport, logDensityRatio, sample, solveModel,
  totalPressureSupport, turbulentPressureHeating, turbulentPressureSupport,
  type GeometryMode, type ModelParameters
} from "../src/model";

const base = PRESETS[DEFAULT_PRESET_NAME];
const modes: GeometryMode[] = ["constant", "local-exponent", "homogeneous-shell"];

// Independently transcribed power-law form of Munteanu et al. (2005),
// equations (6), (A7), and (A12), with Gamma3 = Gamma1. Appendix A gives
// d=m(Gamma1-1)/2; the definition printed in section 2 contains a typo.
function publishedRhs(y: number[], p: ModelParameters): number[] {
  const [x, v, h, uc] = y;
  const alpha = p.alphaP ?? 0;
  const q = p.m * p.gamma1 - 2;
  const c = p.m - 2;
  const d = p.m * (p.gamma1 - 1) / 2;
  const b = 4 + p.m * (p.n - (p.s + 4) * (p.gamma1 - 1));
  return [v,
    (1 - alpha) * x ** -q * h + alpha * x ** -c * uc ** 2 - x ** -2,
    -p.m * alpha * (p.gamma1 - 1) / (1 - alpha) * x ** (2 * d - 1) * v * uc ** 2
      + p.zeta * x ** (2 * d) * (1 - (1 - p.gammac) * x ** b * h ** (p.s + 4) - p.gammac * x ** -c * uc ** 3),
    p.zetac * (x ** -d * Math.sqrt(h) - uc)
  ];
}

describe("Munteanu turbulent pressure and compression work", () => {
  it("agrees with the published constant-exponent equations away from equilibrium", () => {
    const p: ModelParameters = { ...base, geometryMode: "constant", variableM: false,
      alphaP: 0.4, m: 10, gamma1: 1.1, zeta: 4, zetac: 1, gammac: 0.4,
      sourceExp: 0, cq: 0, driver: "h" };
    for (const y of [[1.4, 0, 1, 0.7], [0.94, -0.3, 0.87, 1.15], [1.2, 0.25, 1.12, 0.8]]) {
      derivatives(0, y, p).forEach((value, i) => expect(value).toBeCloseTo(publishedRhs(y, p)[i], 11));
    }
  });

  it("preserves the normalized equilibrium for every density geometry and pressure fraction", () => {
    for (const geometryMode of modes) for (const alphaP of [0, 0.1, 0.4, 0.8]) {
      const p = { ...base, geometryMode, alphaP };
      expect(gasPressureSupport(1, 1, p)).toBeCloseTo(1 - alphaP, 14);
      expect(turbulentPressureSupport(1, 1, p)).toBeCloseTo(alphaP, 14);
      expect(totalPressureSupport(1, 1, 1, p)).toBeCloseTo(1, 14);
      derivatives(0, [1, 0, 1, 1], p).forEach((value) => expect(value).toBeCloseTo(0, 13));
    }
  });

  it("recovers legacy derivatives when alphaP is omitted or explicitly zero", () => {
    const { alphaP: _alpha, ...legacy } = base;
    for (const geometryMode of modes) {
      const p = { ...legacy, geometryMode };
      const y = [1.12, -0.19, 0.91, 0.72];
      expect(derivatives(0, y, p)).toEqual(derivatives(0, y, { ...p, alphaP: 0 }));
      const [R, V, H, Uc] = y;
      const f = densityRatio(R, p), L = sample(0, y, p).L;
      const expected = [V, R ** 2 * f ** p.gamma1 * H - R ** -2 - p.cq * V ** 3,
        p.zeta * f ** (1 - p.gamma1) * (R ** p.sourceExp - L),
        p.zetac * (Math.sqrt(H * f ** (p.gamma1 - 1)) - Uc)];
      derivatives(0, y, p).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
    }
  });

  it("uses the derivative of the selected density law in compression work", () => {
    for (const geometryMode of modes) for (const R of [0.94, 1, 1.2, 1.7]) {
      const p = { ...base, geometryMode, alphaP: 0.4 };
      const dx = 1e-6;
      const independentSlope = -(logDensityRatio(R * Math.exp(dx), p) - logDensityRatio(R * Math.exp(-dx), p)) / (2 * dx);
      expect(densityLogSlope(R, p)).toBeCloseTo(independentSlope, 6);
      const f = densityRatio(R, p), V = 0.23, Uc = 0.84;
      const expected = -independentSlope * (p.gamma1 - 1) * p.alphaP / (1 - p.alphaP)
        * f ** (1 - p.gamma1) * V / R * Uc ** 2;
      expect(turbulentPressureHeating(R, V, Uc, p)).toBeCloseTo(expected, 7);
      expect(turbulentPressureHeating(R, V, Uc, p)).toBeLessThan(0);
      expect(turbulentPressureHeating(R, -V, Uc, p)).toBeGreaterThan(0);
      expect(turbulentPressureHeating(R, 0, Uc, p)).toBeCloseTo(0, 15);
    }
  });

  it("satisfies the mechanical energy identity including both pressure forces", () => {
    for (const geometryMode of modes) {
      const p = { ...base, geometryMode, alphaP: 0.4 };
      const y = [1.11, -0.23, 0.91, 0.79];
      const [R, V, H, Uc] = y, dy = derivatives(0, y, p);
      // E_mech = V^2/2 - 1/R. Gravity cancels from its time derivative.
      const mechanicalDerivative = V * dy[1] + dy[0] / R ** 2;
      const pressurePower = V * ((1 - p.alphaP) * R ** 2 * densityRatio(R, p) ** p.gamma1 * H
        + p.alphaP * R ** 2 * densityRatio(R, p) * Uc ** 2);
      expect(mechanicalDerivative).toBeCloseTo(pressurePower - p.cq * V ** 4, 13);
    }
  });

  it("balances thermal and mechanical energy for a homogeneous shell with Et neglected", () => {
    const p = { ...base, geometryMode: "homogeneous-shell" as const, alphaP: 0.4 };
    const y = [1.11, -0.23, 0.91, 0.79];
    const dy = derivatives(0, y, p);
    const internalScale = (1 - p.alphaP) / (p.m * (p.gamma1 - 1));
    const energy = ([R, V, H]: number[]) => {
      const f = (3 / p.m) / (R ** 3 - (1 - 3 / p.m));
      return V ** 2 / 2 - 1 / R + internalScale * f ** (p.gamma1 - 1) * H;
    };
    const dt = 1e-6;
    const numericalDerivative = (energy(y.map((v, i) => v + dt * dy[i])) - energy(y.map((v, i) => v - dt * dy[i]))) / (2 * dt);
    const suppliedPower = internalScale * p.zeta * (y[0] ** p.sourceExp - sample(0, y, p).L);
    expect(numericalDerivative).toBeCloseTo(suppliedPower - p.cq * y[1] ** 4, 8);
  });

  it("reproduces a bounded published turbulent-pressure case with independent adaptive solvers", () => {
    const p: ModelParameters = { ...base, geometryMode: "constant", variableM: false,
      alphaP: 0.4, m: 10, gamma1: 1.1, zeta: 4, zetac: 1, gammac: 0.4,
      sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 0.7,
      tEnd: 250, runUntilStable: false, maxStep: 0.025 };
    const runs = ["rk45", "dop853"].map((solver) => solveModel({ ...p, solver: solver as "rk45" | "dop853" }));
    for (const run of runs) {
      expect(run.status).toBe("complete");
      const tail = run.rows.filter((row) => row.tau > 200);
      const radii = tail.map((row) => row.R);
      expect(Math.max(...radii)).toBeLessThan(1.4);
      expect(Math.min(...radii)).toBeGreaterThan(0.8);
      expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.05);
    }
    for (const key of ["R", "V", "H", "Uc", "L"] as const) {
      expect(runs[0].rows.at(-1)![key]).toBeCloseTo(runs[1].rows.at(-1)![key], 6);
    }
  }, 30000);
});
