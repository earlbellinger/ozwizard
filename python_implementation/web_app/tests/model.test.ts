import { describe, expect, it } from "vitest";
import { CONTROL_GROUPS, DEFAULT_PRESET_NAME, PRESETS, compareRows, derivatives, solveModel, solverOptionsFromParameters, type Row } from "../src/model";
import { buildTwoCyclePhase, findLuminosityMaxima } from "../src/phase";
import { integrate } from "../src/solvers";

const STRIP_PRESET = "Instability-strip convection";
const RUNAWAY_PRESET = "Fully convective runaway";

function relativeAmplitude(rows: readonly Row[], key: "R" | "L"): number {
  const values = rows.map((row) => row[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (max - min) / Math.max(1, Math.abs(min), Math.abs(max));
}

function cycleAmplitudes(rows: readonly Row[], peaks: readonly Row[], key: "R" | "L"): number[] {
  const amplitudes: number[] = [];
  for (let i = 0; i < peaks.length - 1; i += 1) {
    const cycle = rows.filter((row) => row.tau >= peaks[i].tau && row.tau <= peaks[i + 1].tau);
    if (cycle.length > 1) amplitudes.push(relativeAmplitude(cycle, key));
  }
  return amplitudes;
}

describe("one-zone model", () => {
  it("uses tau max 100 for the default preset and integration slider", () => {
    const tEndControl = CONTROL_GROUPS.integration.find(([key]) => key === "tEnd");
    expect(PRESETS[DEFAULT_PRESET_NAME].tEnd).toBe(100);
    expect(tEndControl?.[6]).toBe(100);
  });

  it("matches the Python derivative fixture for the instability-strip initial state", () => {
    const p = PRESETS[STRIP_PRESET];
    const actual = derivatives(0, [p.r0, p.v0, p.h0, p.uc0], p);
    const expected = [0, -0.4618038233856023, -10.425285349232817, -0.15484574527148354];
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
  });

  it("runs stable presets with RK45 and DOP853 to the requested final time", () => {
    for (const preset of [
      PRESETS[STRIP_PRESET],
      PRESETS["Blue-edge convection"],
      PRESETS["Red-edge convection"],
      PRESETS["Thick convective shell"]
    ]) {
      const p = { ...preset, tEnd: 8, solver: "rk45" as const, runUntilStable: false };
      const rk45 = solveModel(p);
      const dop853 = solveModel({ ...p, solver: "dop853" });
      expect(rk45.status).toBe("complete");
      expect(dop853.status).toBe("complete");
      expect(rk45.rows.at(-1)?.tau).toBeCloseTo(p.tEnd, 12);
      expect(dop853.rows.at(-1)?.tau).toBeCloseTo(p.tEnd, 12);
    }
  });

  it("returns finite comparison metrics on common times", () => {
    const p = { ...PRESETS[STRIP_PRESET], tEnd: 4, runUntilStable: false };
    const selected = solveModel({ ...p, solver: "rk45" }).rows;
    const midpoint = solveModel({ ...p, solver: "midpoint" }).rows;
    const metrics = compareRows(selected, midpoint, p);
    expect(metrics.commonPoints).toBeGreaterThan(5);
    expect(Number.isFinite(metrics.maxStateDelta)).toBe(true);
    expect(Number.isFinite(metrics.maxLuminosityDelta)).toBe(true);
  });

  it("auto-stop mode reports a stability classification or the maximum-time cap", () => {
    const result = solveModel({ ...PRESETS[STRIP_PRESET], tEnd: 8, runUntilStable: true });
    expect(["equilibrium", "limit_cycle", "max_time"]).toContain(result.message);
  });

  it("classifies long outward drifts before exhausting stored rows", () => {
    const result = solveModel({ ...PRESETS[STRIP_PRESET], tEnd: 240, runUntilStable: true });
    expect(result.message).toBe("runaway_trend");
    expect(result.rows.at(-1)?.R).toBeGreaterThan(20);
    expect(result.rows.length).toBeLessThan(14000);
  });

  it("integrates every preset for a short bounded smoke run", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const tEnd = Math.min(preset.tEnd, 4);
      const result = solveModel({ ...preset, tEnd, runUntilStable: false });
      expect(result.status, name).toBe("complete");
      expect(result.rows.at(-1)?.tau, name).toBeCloseTo(tEnd, 12);
      for (const row of result.rows) {
        for (const value of Object.values(row)) {
          expect(Number.isFinite(value), name).toBe(true);
        }
      }
    }
  });

  it("keeps the strict Baker m=3 limit reachable and finite", () => {
    const p = { ...PRESETS["Baker radiative pulsator"], m: 3 };
    expect(p.referenceFamily).toBe("baker");
    expect(p.m).toBe(3);
    expect(p.gammac).toBe(0);
    expect(p.variableM).toBe(false);
    expect(p.sourceExp).toBe(0);
    const initialDerivative = derivatives(0, [p.r0, p.v0, p.h0, p.uc0], p);
    initialDerivative.forEach((value) => expect(Number.isFinite(value)).toBe(true));
    const result = solveModel({ ...p, tEnd: 4, runUntilStable: false });
    expect(result.status).toBe("complete");
    expect(result.rows.every((row) => Object.values(row).every(Number.isFinite))).toBe(true);
  });

  it("uses a Baker radiative pulsator default with usable phase behavior", () => {
    const p = PRESETS["Baker radiative pulsator"];
    const rows = solveModel(p).rows;
    const phase = buildTwoCyclePhase(rows, { warmupTau: p.phaseWarmupTau, minAmplitude: p.phaseMinAmplitude });
    const warmupTau = p.phaseWarmupTau ?? 0;
    expect(p.m).toBe(10);
    expect(p.gammac).toBe(0);
    expect(phase.reason).toBe("ok");
    expect(findLuminosityMaxima(rows, warmupTau).length).toBeGreaterThanOrEqual(3);
  });

  it("gives every default preset the intended phase availability", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const result = solveModel(preset);
      const phase = buildTwoCyclePhase(result.rows, {
        warmupTau: preset.phaseWarmupTau,
        minAmplitude: preset.phaseMinAmplitude
      });
      if (name === RUNAWAY_PRESET) {
        expect(result.status, name).toBe("complete");
        expect(phase.reason, name).not.toBe("ok");
      } else {
        expect(phase.reason, name).toBe("ok");
      }
    }
  });

  it("freezes the convective luminosity channel for no-convection presets", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (preset.gammac !== 0) continue;
      expect(preset.zetac, name).toBe(0);
      expect(preset.uc0, name).toBe(0);
      const result = solveModel(preset);
      expect(result.rows.every((row) => row.Lc === 0), name).toBe(true);
    }
  });

  it("keeps damped RR Lyrae variants bounded over long integrations", () => {
    for (const name of [
      "RR Lyrae low-amplitude fundamental, damped",
      "RR Lyrae first overtone, damped"
    ]) {
      const preset = PRESETS[name];
      const result = solveModel({ ...preset, tEnd: 160, maxStep: 0.05, runUntilStable: false });
      const peaks = findLuminosityMaxima(result.rows, preset.phaseWarmupTau ?? 0);
      const radialAmplitudes = cycleAmplitudes(result.rows, peaks, "R");
      const firstAmplitude = radialAmplitudes[0];
      const lastAmplitude = radialAmplitudes.at(-1);
      expect(result.status, name).toBe("complete");
      expect(radialAmplitudes.length, name).toBeGreaterThan(5);
      expect(lastAmplitude! / firstAmplitude!, name).toBeLessThan(1.25);
      expect(Math.max(...result.rows.map((row) => row.R)), name).toBeLessThan(1.25);
    }
  });

  it("keeps a dense stored cadence for long interactive integrations", () => {
    const options = solverOptionsFromParameters({
      ...PRESETS["RR Lyrae low-amplitude fundamental, damped"],
      tEnd: 1000
    });
    expect(options.outputInterval).toBeLessThanOrEqual(0.02);
    expect(options.maxRows).toBeGreaterThanOrEqual(Math.ceil(1000 / options.outputInterval!) + 2);
  });

  it("runs the default long integration to tau max with every solver when auto-stop is off", () => {
    for (const solver of ["rk45", "dop853", "midpoint"] as const) {
      const result = solveModel({
        ...PRESETS["RR Lyrae low-amplitude fundamental, damped"],
        solver,
        tEnd: 1000,
        runUntilStable: false
      });
      expect(result.status, solver).toBe("complete");
      expect(result.rows.at(-1)?.tau, solver).toBeCloseTo(1000, 12);
    }
  });

  it("does not classify stability before the preset phase warmup window", () => {
    const preset = PRESETS["RR Lyrae low-amplitude fundamental, damped"];
    const result = solveModel({
      ...preset,
      solver: "midpoint",
      tEnd: preset.phaseWarmupTau! - 5,
      runUntilStable: true
    });
    expect(result.message).toBe("max_time");
    expect(result.rows.at(-1)?.tau).toBeCloseTo(preset.phaseWarmupTau! - 5, 12);
  });
});

describe("adaptive solvers", () => {
  it("integrates exponential decay accurately with RK45 and DOP853", () => {
    const exact = Math.exp(-1);
    for (const solver of ["rk45", "dop853"] as const) {
      const result = integrate((_t, y) => [-0.5 * y[0]], [1], 2, {
        solver,
        initialStep: 0.1,
        maxStep: 0.2,
        rtol: 1e-8,
        atol: 1e-10
      });
      expect(result.status).toBe("complete");
      expect(result.points.at(-1)?.y[0]).toBeCloseTo(exact, 8);
      expect(result.stats.acceptedSteps).toBeGreaterThan(0);
    }
  });

  it("reports domain errors without throwing out of integrate", () => {
    const result = integrate((_t, _y) => {
      throw new Error("domain");
    }, [1], 1, { solver: "rk45", initialStep: 0.1, minStep: 1e-6 });
    expect(["domain_error", "step_limit"]).toContain(result.status);
  });

  it("can sample stored output without skipping accepted integration steps", () => {
    const result = integrate((_t, y) => [-0.5 * y[0]], [1], 2, {
      solver: "rk45",
      initialStep: 0.01,
      maxStep: 0.02,
      outputInterval: 0.25,
      rtol: 1e-8,
      atol: 1e-10
    });
    expect(result.status).toBe("complete");
    expect(result.stats.acceptedSteps).toBeGreaterThan(result.points.length);
    expect(result.points.at(-1)?.t).toBeCloseTo(2, 12);
  });
});
