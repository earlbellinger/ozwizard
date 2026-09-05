import { describe, expect, it } from "vitest";
import { derivatives, PRESETS, type ModelParameters } from "../src/model";
import {
  analyticStabilityConditions, equilibriumCharacteristicCoefficients, equilibriumJacobian,
  linearStability, polynomialRoots
} from "../src/stability";

const base = PRESETS["Instability-strip convection"];

function finiteDifferenceJacobian(parameters: ModelParameters): number[][] {
  const equilibrium = [1, 0, 1, 1];
  const h = 1e-6;
  const columns = equilibrium.map((_value, column) => {
    const high = [...equilibrium]; high[column] += h;
    const low = [...equilibrium]; low[column] -= h;
    const upper = derivatives(0, high, parameters);
    const lower = derivatives(0, low, parameters);
    return upper.map((value, row) => (value - lower[row]) / (2 * h));
  });
  return equilibrium.map((_value, row) => columns.map((column) => column[row]));
}

function determinant(matrix: number[][]): number {
  if (matrix.length === 1) return matrix[0][0];
  return matrix[0].reduce((sum, value, column) => sum + (-1) ** column * value
    * determinant(matrix.slice(1).map((row) => row.filter((_entry, index) => index !== column))), 0);
}

describe("turbulent-pressure linear stability", () => {
  it("matches the force and thermal-work Jacobian against independent finite differences for every geometry", () => {
    for (const geometryMode of ["constant", "local-exponent", "homogeneous-shell"] as const) {
      for (const alphaP of [0, 0.2, 0.8]) {
        const parameters = { ...base, geometryMode, alphaP, gamma1: 1.4, m: 5, sourceExp: -1.3 };
        const numerical = finiteDifferenceJacobian(parameters);
        equilibriumJacobian(parameters).forEach((row, i) => row.forEach((value, j) => {
          expect(Math.abs(value - numerical[i][j])).toBeLessThan(2e-7 * Math.max(1, Math.abs(value)));
        }));
      }
    }
  });

  it("reproduces the numerical Jacobian determinant with the analytic characteristic polynomial", () => {
    for (const alphaP of [0, 0.2, 0.8]) {
      for (const gammac of [0, 0.4, 1]) {
        for (const zetac of [0, 0.3, 3]) {
          const parameters = { ...base, alphaP, gammac, zetac, uc0: 1, zeta: 0.7, gamma1: 1.3 };
          const coefficients = equilibriumCharacteristicCoefficients(parameters);
          const numerical = finiteDifferenceJacobian(parameters)
            .slice(0, coefficients.length).map((row) => row.slice(0, coefficients.length));
          for (const lambda of [-3.1, -0.4, 0.7, 2.3]) {
            const polynomial = coefficients.reduce((value, coefficient) => value * lambda + coefficient, 1);
            const expected = determinant(numerical.map((row, i) => row.map((value, j) =>
              (i === j ? lambda : 0) - value)));
            expect(Math.abs(polynomial - expected)).toBeLessThan(2e-6 * Math.max(1, Math.abs(expected)));
          }
        }
      }
    }
  });

  it("agrees with numerical eigenvalues about asymptotic stability across convective and radiative flux fractions", () => {
    let stableCases = 0;
    let unstableCases = 0;
    for (const alphaP of [0.1, 0.5]) {
      for (const m of [5, 10]) {
        for (const gammac of [0, 0.4, 1]) {
          for (const zeta of [0.1, 1, 3]) {
            for (const zetac of [0.1, 1, 3]) {
              const parameters = { ...base, alphaP, m, gammac, zeta, zetac, uc0: 1 };
              const analytic = analyticStabilityConditions(parameters);
              const numerical = linearStability(parameters);
              expect(Math.abs(numerical.maxReal)).toBeGreaterThan(1e-7);
              expect(analytic.allStable).toBe(numerical.maxReal < 0);
              const roots = polynomialRoots(equilibriumCharacteristicCoefficients(parameters));
              expect(Math.max(...roots.map((root) => root.re))).toBeCloseTo(numerical.maxReal, 5);
              if (analytic.allStable) stableCases += 1;
              else unstableCases += 1;
            }
          }
        }
      }
    }
    expect(stableCases).toBeGreaterThan(0);
    expect(unstableCases).toBeGreaterThan(0);
  });

  it("keeps velocity feedback when convective luminosity vanishes but turbulent pressure is active", () => {
    const slow = { ...base, alphaP: 0.5, gammac: 0, zetac: 0.1 };
    const fast = { ...slow, zetac: 10 };
    expect(analyticStabilityConditions(slow).physicsMode).toBe("convective");
    expect(equilibriumCharacteristicCoefficients(slow)).toHaveLength(4);
    expect(linearStability(slow).roots).toHaveLength(4);
    expect(linearStability(slow).maxReal).not.toBeCloseTo(linearStability(fast).maxReal, 3);
  });

  it("does not hide a growing mode behind a simultaneous zero Hurwitz margin", () => {
    const parameters = { ...base, alphaP: 0.3, gammac: 1, m: 8, zeta: 3, zetac: 1 };
    const analytic = analyticStabilityConditions(parameters);
    expect(analytic.coefficients.a4).toBe(0);
    expect(analytic.allStable).toBe(false);
    expect(analytic.kind).not.toBe("neutral");
    expect(linearStability(parameters).maxReal).toBeGreaterThan(0);
  });

  it("uses the active cubic for frozen convection and rejects an inaccessible normalized equilibrium", () => {
    const frozen = { ...base, alphaP: 0.3, zetac: 0, uc0: 1 };
    const analytic = analyticStabilityConditions(frozen);
    const numerical = linearStability(frozen);
    expect(analytic.equilibriumValid).toBe(true);
    expect(equilibriumCharacteristicCoefficients(frozen)).toHaveLength(3);
    expect(numerical.roots).toHaveLength(3);
    expect(analytic.allStable).toBe(numerical.maxReal < 0);

    const unavailable = { ...frozen, uc0: 0 };
    expect(analyticStabilityConditions(unavailable).kind).toBe("unavailable");
    expect(analyticStabilityConditions(unavailable).allStable).toBe(false);
    expect(linearStability(unavailable).equilibriumValid).toBe(false);
    expect(linearStability(unavailable).roots).toEqual([]);
    expect(linearStability(unavailable).equilibriumNote).toContain("Frozen Uc");
  });
});
