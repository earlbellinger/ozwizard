import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_NAME, HERTZSPRUNG_PROGRESSION_PRESET_NAME, PRESETS,
  convectiveTarget, densityRatio, derivatives, geometryModeFor, logDensityRatio,
  mAt, pressureRatio, pressureSupport, sample, solveModel, temperatureRatio,
  thermalPrefactor, type GeometryMode, type ModelParameters
} from "../src/model";
import { analyticStabilityConditions, linearStability } from "../src/stability";
import { thermodynamicTemperatureRatio } from "../src/phaseLag";
import { shellGeometryFromModel } from "../src/visualization";
import {
  loadLocalPresetStore, parsePresetInlistBundle, serializePresetInlistBundle,
  snapshotFromParameters
} from "../src/presets";

const exact = PRESETS[DEFAULT_PRESET_NAME];
const modes: GeometryMode[] = ["constant", "local-exponent", "homogeneous-shell"];

describe("finite-displacement geometry closures", () => {
  it("uses exact density for new principal presets and preserves historical families", () => {
    expect(geometryModeFor(exact)).toBe("homogeneous-shell");
    expect(geometryModeFor(PRESETS[HERTZSPRUNG_PROGRESSION_PRESET_NAME])).toBe("homogeneous-shell");
    expect(geometryModeFor(PRESETS["Radius-dependent strip"])).toBe("local-exponent");
    expect(geometryModeFor(PRESETS["RR Lyrae fundamental"])).toBe("local-exponent");
    expect(geometryModeFor(PRESETS["Baker radiative pulsator"])).toBe("constant");
  });

  it("conserves homogeneous shell mass through compression and expansion", () => {
    for (const m of [3, 10, 20, 100]) {
      const p = { ...exact, m };
      const eta3 = 1 - 3 / m;
      const eta = Math.cbrt(eta3);
      for (const radius of [eta + 0.001, (eta + 1) / 2, 1, 1.1, 2]) {
        expect(densityRatio(radius, p) * (radius ** 3 - eta3)).toBeCloseTo(1 - eta3, 11);
      }
    }
    expect(densityRatio(1.1, exact)).toBeCloseTo(0.3 / 0.631, 14);
    const historical = { ...exact, geometryMode: "local-exponent" as const };
    expect(densityRatio(1.1, historical) / densityRatio(1.1, exact) - 1).toBeCloseTo(0.151, 3);
  });

  it("is regular at equilibrium and has the same local density slope", () => {
    for (const geometryMode of modes) {
      const p = { ...exact, geometryMode };
      expect(logDensityRatio(1, p)).toBeCloseTo(0, 15);
      expect(densityRatio(1, p)).toBe(1);
      const dx = 1e-7;
      const slope = -(logDensityRatio(Math.exp(dx), p) - logDensityRatio(Math.exp(-dx), p)) / (2 * dx);
      expect(slope).toBeCloseTo(p.m, 6);
      const equilibrium = derivatives(0, [1, 0, 1, 1], p);
      equilibrium.forEach((value) => expect(value).toBeCloseTo(0, 13));
      expect(analyticStabilityConditions(p)).toEqual(analyticStabilityConditions(exact));
      expect(linearStability(p).maxReal).toBeCloseTo(linearStability(exact).maxReal, 6);
    }
  });

  it("has identical equilibrium Jacobians for all three closures", () => {
    const state = [1, 0, 1, 1];
    const jacobian = (p: ModelParameters) => state.flatMap((_value, column) => {
      const h = 1e-6;
      const high = [...state]; high[column] += h;
      const low = [...state]; low[column] -= h;
      const upper = derivatives(0, high, p);
      const lower = derivatives(0, low, p);
      return upper.map((value, row) => (value - lower[row]) / (2 * h));
    });
    const reference = jacobian(exact);
    for (const geometryMode of modes) {
      jacobian({ ...exact, geometryMode }).forEach((value, index) => expect(value).toBeCloseTo(reference[index], 6));
    }
  });

  it("recovers the same sphere and historical power laws", () => {
    for (const radius of [0.5, 1, 1.1, 2]) {
      for (const geometryMode of modes) {
        expect(densityRatio(radius, { ...exact, m: 3, geometryMode })).toBeCloseTo(radius ** -3, 12);
      }
    }
    for (const geometryMode of ["constant", "local-exponent"] as const) {
      const p = { ...exact, geometryMode };
      const R = 1.1, H = 0.9, V = -0.2, Uc = 0.7;
      const chi = mAt(R, p);
      const Lr = (1 - p.gammac) * R ** (4 + chi * (p.n - (p.s + 4) * (p.gamma1 - 1))) * H ** (p.s + 4);
      const Lc = p.gammac * R ** (2 - chi) * Uc ** 3;
      expect(sample(0, [R, V, H, Uc], p)).toMatchObject({ Lr: expect.closeTo(Lr, 13), Lc: expect.closeTo(Lc, 13) });
      const expected = [V, H / R ** (chi * p.gamma1 - 2) - R ** -2 - p.cq * V ** 3,
        p.zeta * R ** (chi * (p.gamma1 - 1)) * (R ** p.sourceExp - Lr - Lc),
        p.zetac * (R ** (-chi * (p.gamma1 - 1) / 2) * Math.sqrt(H) - Uc)];
      derivatives(0, [R, V, H, Uc], p).forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    }
  });

  it("uses one density closure for thermodynamics, work, convection, and the fixed core", () => {
    for (const R of [0.92, 1, 1.1, 1.5]) {
      const H = 0.9;
      const f = 0.3 / (R ** 3 - 0.7);
      const row = sample(0, [R, 0.4, H, 0.7], exact);
      expect(pressureRatio(R, H, exact)).toBeCloseTo(H * f ** exact.gamma1, 12);
      expect(temperatureRatio(R, H, exact)).toBeCloseTo(H * f ** (exact.gamma1 - 1), 12);
      expect(thermodynamicTemperatureRatio(row, exact)).toBeCloseTo(temperatureRatio(R, H, exact), 13);
      expect(pressureSupport(R, H, exact)).toBeCloseTo(R ** 2 * pressureRatio(R, H, exact), 13);
      expect(thermalPrefactor(R, exact)).toBeCloseTo(exact.zeta * f ** (1 - exact.gamma1), 12);
      expect(convectiveTarget(R, H, exact)).toBeCloseTo(Math.sqrt(temperatureRatio(R, H, exact)), 12);
      expect(convectiveTarget(R, H, { ...exact, driver: "abs-v" }, -0.4)).toBeCloseTo(f ** ((exact.gamma1 - 1) / 2) * Math.sqrt(0.4), 12);
      expect(shellGeometryFromModel(row, exact).innerRadius).toBeCloseTo(Math.cbrt(0.7), 13);
    }
  });

  it("rejects impossible initial shells without throwing from the interactive solver", () => {
    for (const r0 of [0, 0.8, Math.cbrt(0.7)]) {
      expect(() => densityRatio(r0, exact)).toThrow();
      const result = solveModel({ ...exact, r0 });
      expect(result.status).toBe("domain_error");
      expect(result.rows).toEqual([]);
      expect(result.message).toMatch(/radius|boundary/);
    }
    expect(solveModel({ ...exact, m: 2 }).message).toContain("chi_0 >= 3");
  });
});

describe("geometry preset provenance", () => {
  it("migrates legacy inlists before merging the new default", () => {
    for (const variableM of [true, false]) {
      const text = `&controls\n variableM = .${variableM}.\n/`;
      const parsed = parsePresetInlistBundle(text, { baseParameters: exact });
      expect(parsed.errors).toEqual([]);
      expect(geometryModeFor(parsed.snapshots[0].parameters)).toBe(variableM ? "local-exponent" : "constant");
    }
  });

  it("migrates legacy JSON defaults and round-trips explicit geometry", () => {
    for (const variableM of [true, false]) {
      const { geometryMode: _mode, ...oldParameters } = exact;
      const raw = JSON.stringify({ version: 1, presets: [{ name: DEFAULT_PRESET_NAME, parameters: { ...oldParameters, variableM } }] });
      const loaded = loadLocalPresetStore({ getItem: () => raw, setItem() {}, removeItem() {} });
      expect(loaded.warnings).toEqual([]);
      expect(geometryModeFor(loaded.store.presets[0].parameters)).toBe(variableM ? "local-exponent" : "constant");
    }
    for (const geometryMode of modes) {
      const snapshot = snapshotFromParameters("geometry", { ...exact, geometryMode });
      const serialized = serializePresetInlistBundle([snapshot]);
      expect(serialized).toContain(`geometryMode = '${geometryMode}'`);
      const parsed = parsePresetInlistBundle(serialized);
      expect(parsed.errors).toEqual([]);
      expect(parsed.snapshots[0].parameters).toEqual(snapshot.parameters);
    }
  });
});
