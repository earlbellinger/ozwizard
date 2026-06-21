import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET_NAME, PRESETS, solveModel, type ModelParameters, type Row } from "../src/model";
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
  return Array.from({ length: 601 }, (_value, index) => {
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

function offsetSyntheticRows(): Row[] {
  return Array.from({ length: 120 }, (_value, index) => {
    const tau = index * 0.047;
    const luminosity = 1 + Math.cos(2 * Math.PI * (tau - 0.123));
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

function rowsWithSpuriousMinimum(): Row[] {
  return Array.from({ length: 601 }, (_value, index) => {
    const tau = index / 100;
    const primary = 1 + Math.cos(2 * Math.PI * tau);
    const shoulderOffset = (tau % 1 - 0.22) / 0.035;
    const shoulder = 0.25 * Math.exp(-(shoulderOffset ** 2));
    const luminosity = primary - shoulder;
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
  it("anchors two-cycle phase at three consecutive luminosity minima", () => {
    const phase = buildTwoCyclePhase(syntheticRows(), { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5 });
    expect(phase.reason).toBe("ok");
    const reference = phase.reference!;
    expect(reference.period).toBeCloseTo(1, 12);
    expect(reference.startTau).toBeCloseTo(0.5, 12);
    expect(reference.anchor).toBe("min");
    reference.anchorRows.forEach((row, index) => {
      expect((row.tau - reference.startTau) / reference.period).toBeCloseTo(index, 12);
    });
    expect(phase.rows[0].tau).toBeCloseTo(0, 12);
    expect(phase.rows.at(-1)!.tau).toBeCloseTo(2, 12);
  });

  it("can anchor two-cycle phase at three consecutive luminosity maxima", () => {
    const phase = buildTwoCyclePhase(syntheticRows(), { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5, anchor: "max" });
    expect(phase.reason).toBe("ok");
    const reference = phase.reference!;
    expect(reference.anchor).toBe("max");
    expect(reference.period).toBeCloseTo(1, 12);
    expect(reference.startTau).toBeCloseTo(1, 12);
    reference.maximumRows?.forEach((row, index) => expect(row.tau).toBeCloseTo(index + 1, 12));
    reference.anchorRows.forEach((row, index) => {
      expect((row.tau - reference.startTau) / reference.period).toBeCloseTo(index, 12);
    });
    expect(phase.rows[0].tau).toBeCloseTo(0, 12);
    expect(phase.rows.at(-1)!.tau).toBeCloseTo(2, 12);
  });

  it("ignores spurious minima when selecting minimum-light anchors", () => {
    const phase = buildTwoCyclePhase(rowsWithSpuriousMinimum(), { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5 });
    expect(phase.reason).toBe("ok");
    expect(phase.reference?.minimumRows?.map((row) => row.tau)).toEqual([0.5, 1.5, 2.5]);
    expect(phase.rows[0].tau).toBeCloseTo(0, 12);
    expect(phase.rows.at(-1)!.tau).toBeCloseTo(2, 12);
  });

  it("refines luminosity extrema between stored samples", () => {
    const phase = buildTwoCyclePhase(offsetSyntheticRows(), { warmupTau: 0, minAmplitude: 0.1, minSeparation: 0.5 });
    expect(phase.reason).toBe("ok");
    expect(phase.period).toBeCloseTo(1, 3);
    expect(phase.reference?.startTau).toBeCloseTo(0.623, 3);
    expect(phase.reference?.minimumRows?.map((row) => Number(row.tau.toFixed(3)))).toEqual([0.623, 1.623, 2.623]);
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
    expect(referencePhase.reference?.startTau).toBeCloseTo(0.5, 12);
    expect(finalPhase.reference?.startTau).toBeCloseTo(3.5, 12);
    expect(finalPhase.period).toBeCloseTo(referencePhase.period ?? 0, 12);
  });

  it("uses the full cycle when alternating shallow and deep minima appear", () => {
    const p = { ...PRESETS[DEFAULT_PRESET_NAME], zeta: 0.4 };
    const rows = solveModel(p).rows;
    const phase = buildTwoCyclePhase(rows, {
      warmupTau: p.phaseWarmupTau,
      minAmplitude: p.phaseMinAmplitude,
      selection: p.phaseMode === "final" ? "last" : "first",
      anchor: "min"
    });
    const maxLightPhase = buildTwoCyclePhase(rows, {
      warmupTau: p.phaseWarmupTau,
      minAmplitude: p.phaseMinAmplitude,
      selection: p.phaseMode === "final" ? "last" : "first",
      anchor: "max"
    });
    const anchorLuminosities = phase.reference?.anchorRows.map((row) => row.L) ?? [];
    const maxAnchorLuminosities = maxLightPhase.reference?.anchorRows.map((row) => row.L) ?? [];

    expect(phase.reason).toBe("ok");
    expect(phase.period).toBeGreaterThan(2.3);
    expect(phase.period).toBeLessThan(2.6);
    expect(phase.rows.length).toBeGreaterThan(350);
    expect(phase.rows[0].tau).toBeLessThan(0.02);
    expect(phase.rows.at(-1)!.tau).toBeGreaterThan(1.98);
    expect(phase.reference!.anchorRows[1].tau - phase.reference!.anchorRows[0].tau).toBeGreaterThan(2.3);
    expect(Math.max(...anchorLuminosities)).toBeLessThan(0.93);
    expect(Math.max(...anchorLuminosities) - Math.min(...anchorLuminosities)).toBeLessThan(0.001);
    expect(maxLightPhase.reason).toBe("ok");
    expect(maxLightPhase.period).toBeCloseTo(phase.period ?? 0, 2);
    expect(maxLightPhase.reference!.anchorRows[1].tau - maxLightPhase.reference!.anchorRows[0].tau).toBeGreaterThan(2.3);
    expect(Math.min(...maxAnchorLuminosities)).toBeGreaterThan(1.05);
    expect(Math.max(...maxAnchorLuminosities) - Math.min(...maxAnchorLuminosities)).toBeLessThan(0.001);
  });
});
