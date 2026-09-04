import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_NAME, PRESETS, StabilityDetector, linearDynamicPeriod, solveModel,
  type ModelParameters, type Row
} from "../src/model";
import { buildTwoCyclePhase, findLuminosityMaxima, guidedMinSeparationFromPeriod } from "../src/phase";
import { phaseLagForPair } from "../src/phaseLag";

const PERIOD = 2.4;

function syntheticRows(luminosity: (tau: number) => number, state?: (tau: number) => Partial<Row>): Row[] {
  const rows: Row[] = [];
  for (let tau = 0; tau <= 32; tau += 0.017 + 0.009 * (1 + Math.sin(tau))) {
    const phase = 2 * Math.PI * tau / PERIOD;
    const L = luminosity(tau);
    rows.push({
      tau, R: 1 + 0.1 * Math.cos(phase), V: -0.1 * Math.sin(phase),
      H: 1 + 0.1 * Math.sin(phase), Uc: 1, Lr: L, Lc: 0, L,
      ...state?.(tau)
    });
  }
  return rows;
}

function detect(rows: readonly Row[], tolerance = 0.002): { status: string | null; tau: number } {
  const detector = new StabilityDetector(tolerance, 5, 2, 1.5, PERIOD);
  for (const row of rows) {
    const status = detector.observe(row);
    if (status) return { status, tau: row.tau };
  }
  return { status: null, tau: rows.at(-1)!.tau };
}

function phaseOf(rows: Row[], parameters: ModelParameters) {
  return buildTwoCyclePhase(rows, {
    warmupTau: parameters.phaseWarmupTau,
    minAmplitude: parameters.phaseMinAmplitude,
    selection: "last",
    minSeparation: guidedMinSeparationFromPeriod(rows, linearDynamicPeriod(parameters))
  });
}

function amplitude(rows: readonly Row[]): number {
  const values = rows.filter((row) => row.tau >= 0 && row.tau < 1).map((row) => row.L);
  return Math.max(...values) - Math.min(...values);
}

describe("limit-cycle detection", () => {
  it("refines nonuniformly sampled peaks before comparing cycle periods", () => {
    const rows = syntheticRows((tau) => 1 + 0.2 * Math.cos(2 * Math.PI * tau / PERIOD));
    const result = detect(rows);
    expect(result.status).toBe("limit_cycle");
    expect(result.tau).toBeGreaterThan(2 + 5 * PERIOD);
  });

  it("groups nearby secondary maxima without counting shoulders as cycles", () => {
    const wrapped = (tau: number, center: number) => ((tau - center + PERIOD / 2) % PERIOD + PERIOD) % PERIOD - PERIOD / 2;
    const rows = syntheticRows((tau) => 1
      + 0.12 * Math.cos(2 * Math.PI * (tau - 0.4) / PERIOD)
      + 0.10 * Math.exp(-((wrapped(tau, 0.86) / 0.08) ** 2)));
    expect(findLuminosityMaxima(rows, 2, 0.05).length).toBeGreaterThan(20);
    const result = detect(rows);
    expect(result.status).toBe("limit_cycle");
    expect(result.tau).toBeGreaterThan(2 + 5 * PERIOD);
  });

  it("does not classify a steadily changing luminosity amplitude as stable", () => {
    const rows = syntheticRows((tau) => 1 + (0.15 + 0.004 * tau) * Math.cos(2 * Math.PI * tau / PERIOD));
    expect(detect(rows).status).toBeNull();
  });

  it("does not certify alternating luminosity cycles at their half-period", () => {
    const rows = syntheticRows((tau) => 1
      + 0.15 * Math.cos(2 * Math.PI * tau / PERIOD)
      + 0.04 * Math.cos(Math.PI * tau / PERIOD));
    expect(detect(rows).status).toBeNull();
  });

  it("requires the state to recur even when luminosity peaks are identical", () => {
    const luminosity = (tau: number) => 1 + 0.2 * Math.cos(2 * Math.PI * tau / PERIOD);
    expect(detect(syntheticRows(luminosity, (tau) => ({ Uc: 1 + 0.004 * tau }))).status).toBeNull();
    expect(detect(syntheticRows(luminosity, (tau) => ({ Uc: 1 + 0.04 * Math.cos(Math.PI * tau / PERIOD) }))).status).toBeNull();
  });

  it.each([0.25, 0.33, 0.45, 0.5])("certifies gamma_c=%s without changing its final-cycle behavior", (gammac) => {
    const parameters = { ...PRESETS[DEFAULT_PRESET_NAME], gammac };
    const stopped = solveModel(parameters);
    const fixed = solveModel({ ...parameters, runUntilStable: false });
    const stoppedPhase = phaseOf(stopped.rows, parameters);
    const fixedPhase = phaseOf(fixed.rows, parameters);
    expect(stopped.status).toBe("limit_cycle");
    expect(stopped.rows.at(-1)!.tau).toBeLessThan(parameters.tEnd);
    expect(stoppedPhase.reason).toBe("ok");
    expect(fixedPhase.reason).toBe("ok");
    expect(Math.abs(stoppedPhase.period! / fixedPhase.period! - 1)).toBeLessThan(0.0003);
    expect(Math.abs(amplitude(stoppedPhase.rows) / amplitude(fixedPhase.rows) - 1)).toBeLessThan(0.006);
    for (const pair of [
      { id: "R-L", reference: "R", target: "L" },
      { id: "L-T", reference: "L", target: "T" }
    ] as const) {
      const stoppedLag = phaseLagForPair(stoppedPhase.rows, pair, parameters)!;
      const fixedLag = phaseLagForPair(fixedPhase.rows, pair, parameters)!;
      expect(Math.abs(stoppedLag - fixedLag)).toBeLessThan(0.0001);
    }
  });

  it.each([0.01, 10])("retains the integration cap for the slowly settling zeta=%s endpoint", (zeta) => {
    const parameters = { ...PRESETS[DEFAULT_PRESET_NAME], zeta, gammac: 0.2 };
    const result = solveModel(parameters);
    const phase = phaseOf(result.rows, parameters);
    expect(result.message).toBe("max_time");
    expect(result.rows.at(-1)!.tau).toBe(300);
    expect(phase.reason).toBe("ok");
    const [first, middle, last] = phase.reference!.anchorRows;
    expect(Math.abs((last.tau - 2 * middle.tau + first.tau) / phase.period!)).toBeLessThan(0.0001);
    const firstAmplitude = amplitude(phase.rows);
    const secondAmplitude = amplitude(phase.rows.map((row) => ({ ...row, tau: row.tau - 1 })));
    expect(Math.abs(firstAmplitude / secondAmplitude - 1)).toBeLessThan(0.002);
  });
});
