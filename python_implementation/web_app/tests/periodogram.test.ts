import { describe, expect, it } from "vitest";
import type { Row } from "../src/model";
import { computePeriodogram, periodogramQuantityValue, rowsAfterCut } from "../src/periodogram";

function sineRows(amplitude: number, frequency: number): Row[] {
  return Array.from({ length: 900 }, (_value, index) => {
    const tau = index * 0.035 + 0.004 * Math.sin(index * 0.37);
    const signal = amplitude * Math.cos(2 * Math.PI * frequency * tau);
    return {
      tau,
      R: 1,
      V: 0,
      H: 1,
      Uc: 1,
      Lr: 1 + signal,
      Lc: 0,
      L: 1 + signal
    };
  });
}

describe("periodogram helper", () => {
  it("uses fractional luminosity L-1", () => {
    const row = sineRows(0.2, 0.5)[0];
    expect(periodogramQuantityValue(row, "L")).toBeCloseTo(row.L - 1, 12);
  });

  it("cuts rows before the relaxation boundary", () => {
    const rows = sineRows(0.1, 0.4);
    const cut = rowsAfterCut(rows, 10);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((row) => row.tau >= 10)).toBe(true);
  });

  it("finds the injected frequency without variance normalization", () => {
    const frequency = 0.42;
    const small = computePeriodogram(sineRows(0.08, frequency), { periodHint: 1 / frequency });
    const large = computePeriodogram(sineRows(0.16, frequency), { periodHint: 1 / frequency });
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(small!.peak.frequency).toBeCloseTo(frequency, 2);
    expect(large!.peak.power / small!.peak.power).toBeCloseTo(4, 1);
  });
});
