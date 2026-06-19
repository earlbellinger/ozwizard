import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESETS, solveModel, type ModelParameters, type Row } from "../src/model";
import { buildTwoCyclePhase } from "../src/phase";

const STRIP_PRESET = "Instability-strip convection";

function phaseOptions(p: ModelParameters) {
  return { warmupTau: p.phaseWarmupTau, minAmplitude: p.phaseMinAmplitude };
}

function referenceCsvPeriod(path: string): number {
  const lines = readFileSync(new URL(path, import.meta.url), "utf8").trim().split(/\r?\n/).slice(1);
  const firstTau = Number(lines[0].split(",")[1]);
  const finalTau = Number(lines.at(-1)!.split(",")[1]);
  return (finalTau - firstTau) / 2;
}

function syntheticRows(): Row[] {
  return Array.from({ length: 451 }, (_value, index) => {
    const tau = index / 100;
    const luminosity = 1 + Math.cos(2 * Math.PI * tau);
    return {
      tau,
      R: 1,
      V: Math.sin(2 * Math.PI * tau),
      H: 1,
      Uc: 1,
      Lr: luminosity,
      Lc: 0,
      L: luminosity
    };
  });
}

describe("phase folding", () => {
  it("anchors two-cycle phase at three consecutive luminosity maxima", () => {
    const phase = buildTwoCyclePhase(syntheticRows(), { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5 });
    expect(phase.reason).toBe("ok");
    const reference = phase.reference!;
    expect(reference.period).toBeCloseTo(1, 12);
    reference.peakRows.forEach((row, index) => {
      expect((row.tau - reference.startTau) / reference.period).toBeCloseTo(index, 12);
    });
    expect(phase.rows[0].tau).toBeCloseTo(0, 12);
    expect(phase.rows.at(-1)!.tau).toBeCloseTo(2, 12);
  });

  it("matches the Python instability-strip two-phase reference period", () => {
    const p = { ...PRESETS[STRIP_PRESET], tEnd: 15, runUntilStable: false };
    const phase = buildTwoCyclePhase(solveModel(p).rows, phaseOptions(p));
    const expected = referenceCsvPeriod("../../outputs/two_phase/python_paper_strip_two_phase_lightcurve.csv");
    expect(phase.reason).toBe("ok");
    expect(Math.abs((phase.period ?? 0) - expected)).toBeLessThan(0.05);
  });

  it("matches the Python OZ1 two-phase reference period", () => {
    const p = { ...PRESETS["Local radiative OZ1"], tEnd: 9, runUntilStable: false };
    const phase = buildTwoCyclePhase(solveModel(p).rows, phaseOptions(p));
    const expected = referenceCsvPeriod("../../outputs/two_phase/stellingwerf_oz1_two_phase_lightcurve.csv");
    expect(phase.reason).toBe("ok");
    expect(Math.abs((phase.period ?? 0) - expected)).toBeLessThan(0.05);
  });

  it("can fold midpoint comparison rows with the selected solver reference", () => {
    const p = { ...PRESETS[STRIP_PRESET], tEnd: 15, runUntilStable: false };
    const selectedPhase = buildTwoCyclePhase(solveModel({ ...p, solver: "rk45" }).rows, phaseOptions(p));
    expect(selectedPhase.reason).toBe("ok");
    const midpointPhase = buildTwoCyclePhase(solveModel({ ...p, solver: "midpoint" }).rows, {
      reference: selectedPhase.reference
    });
    expect(midpointPhase.reference).toBe(selectedPhase.reference);
    expect(midpointPhase.reason).toBe("ok");
    expect(midpointPhase.rows[0].tau).toBeGreaterThanOrEqual(0);
    expect(midpointPhase.rows.at(-1)!.tau).toBeLessThanOrEqual(2);
  });

  it("can select final cycles separately from the reference cycles", () => {
    const rows = syntheticRows();
    const referencePhase = buildTwoCyclePhase(rows, { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5 });
    const finalPhase = buildTwoCyclePhase(rows, { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5, selection: "last" });
    expect(referencePhase.reference?.startTau).toBeCloseTo(1, 12);
    expect(finalPhase.reference?.startTau).toBeCloseTo(2, 12);
    expect(finalPhase.period).toBeCloseTo(referencePhase.period ?? 0, 12);
  });
});
