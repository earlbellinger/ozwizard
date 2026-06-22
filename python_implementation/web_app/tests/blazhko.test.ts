import { describe, expect, it } from "vitest";
import { blazhkoPhaseAt, detectBlazhkoPeriods } from "../src/blazhko";
import type { Row } from "../src/model";

function modulatedRows(options: {
  cycles: number;
  primaryPeriod?: number;
  blazhkoCycles?: number[];
  modulationAmplitudes?: number[];
  pointsPerCycle?: number;
}): Row[] {
  const primaryPeriod = options.primaryPeriod ?? 1;
  const pointsPerCycle = options.pointsPerCycle ?? 32;
  const rows: Row[] = [];
  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    for (let point = 0; point < pointsPerCycle; point += 1) {
      const phase = point / pointsPerCycle;
      const tau = (cycle + phase) * primaryPeriod;
      const envelope = (options.blazhkoCycles ?? []).reduce((value, periodCycles, index) => {
        const modulationAmplitude = options.modulationAmplitudes?.[index] ?? 0.18;
        return value + modulationAmplitude * Math.cos((2 * Math.PI * cycle) / periodCycles);
      }, 0.45);
      const luminosity = 1 + envelope * Math.cos(2 * Math.PI * phase);
      rows.push({
        tau,
        R: 1 + 0.1 * Math.sin(2 * Math.PI * phase),
        V: Math.cos(2 * Math.PI * phase),
        H: 1,
        Uc: 1,
        Lr: luminosity,
        Lc: 0,
        L: luminosity
      });
    }
  }
  return rows;
}

describe("Blazhko detection", () => {
  it("does not classify a fixed-amplitude limit cycle as Blazhko", () => {
    const analysis = detectBlazhkoPeriods(modulatedRows({ cycles: 48 }), 1, { warmupTau: 0 });
    expect(analysis.kind).toBe("none");
    expect(analysis.reason).toBe("low_modulation");
  });

  it("detects a single periodic luminosity-envelope modulation", () => {
    const analysis = detectBlazhkoPeriods(
      modulatedRows({ cycles: 80, blazhkoCycles: [10], modulationAmplitudes: [0.16] }),
      1,
      { warmupTau: 0 }
    );
    expect(analysis.kind).toBe("single");
    expect(analysis.periods).toHaveLength(1);
    expect(analysis.periods[0].period).toBeCloseTo(10, 0);
    expect(analysis.modulationDepth).toBeGreaterThan(0.3);
    expect(blazhkoPhaseAt(analysis.periods[0].phaseZeroTau, analysis.periods[0])).toBeCloseTo(0, 12);
  });

  it("detects two independent Blazhko envelope periods", () => {
    const analysis = detectBlazhkoPeriods(
      modulatedRows({ cycles: 84, blazhkoCycles: [12, 7], modulationAmplitudes: [0.16, 0.11] }),
      1,
      { warmupTau: 0 }
    );
    expect(analysis.kind).toBe("double");
    expect(analysis.periods).toHaveLength(2);
    const periods = analysis.periods.map((period) => period.period).sort((a, b) => a - b);
    expect(periods[0]).toBeCloseTo(7, 0);
    expect(periods[1]).toBeCloseTo(12, 0);
  });
});
