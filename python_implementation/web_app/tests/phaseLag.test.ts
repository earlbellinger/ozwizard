import { describe, expect, it } from "vitest";
import {
  PHASE_LAG_PAIRS,
  phaseLagForPair,
  phaseLagQuantityValue,
  phaseLagSeriesPoints,
  refinedMaximumPhase,
  signedPhaseLag,
  thermodynamicTemperatureRatio,
  type PhaseLagPair
} from "../src/phaseLag";
import { mAt, PRESETS, type ModelParameters, type Row } from "../src/model";
import { type GridModelResult } from "../src/grid";

const parameters: ModelParameters = { ...PRESETS["Radius-dependent strip"] };

function syntheticRows(shifts: Partial<Record<"R" | "L" | "V" | "H" | "Uc", number>>, count = 720): Row[] {
  return Array.from({ length: count }, (_value, index) => {
    const phase = index / count;
    const wave = (key: "R" | "L" | "V" | "H" | "Uc", amplitude: number, center = 1) =>
      center + amplitude * Math.cos(2 * Math.PI * (phase - (shifts[key] ?? 0)));
    const radius = wave("R", 0.08);
    const pressure = wave("H", 0.16);
    const luminosity = wave("L", 0.22);
    const convectiveVelocity = wave("Uc", 0.12);
    return {
      tau: phase,
      R: radius,
      V: wave("V", 0.5, 0),
      H: pressure,
      Uc: convectiveVelocity,
      Lr: luminosity,
      Lc: 0,
      L: luminosity
    };
  });
}

function flatRows(count = 40): Row[] {
  return Array.from({ length: count }, (_value, index) => ({
    tau: index / count,
    R: 1,
    V: 0,
    H: 1,
    Uc: 1,
    Lr: 1,
    Lc: 0,
    L: 1
  }));
}

function gridResult(id: number, sliderValue: number, rows: Row[]): GridModelResult {
  return {
    id,
    parameters,
    sliderValues: { gammac: sliderValue },
    variedValues: { gammac: sliderValue },
    phaseRows: rows,
    period: 1,
    fourier: null
  };
}

describe("phase lag helpers", () => {
  it("wraps signed phase lags across the cycle seam", () => {
    expect(signedPhaseLag(0.92, 0.08)).toBeCloseTo(0.16);
    expect(signedPhaseLag(0.08, 0.92)).toBeCloseTo(-0.16);
    expect(signedPhaseLag(0.1, 0.61)).toBeCloseTo(-0.49);
  });

  it("detects refined maximum phases for synthetic rows", () => {
    const rows = syntheticRows({ R: 0.275, L: 0.445 });
    expect(refinedMaximumPhase(rows, "R", parameters)).toBeCloseTo(0.275, 3);
    expect(refinedMaximumPhase(rows, "L", parameters)).toBeCloseTo(0.445, 3);
    expect(phaseLagForPair(rows, { id: "R-L", reference: "R", target: "L" }, parameters)).toBeCloseTo(0.17, 3);
  });

  it("uses thermodynamic temperature T/T0 rather than effective temperature", () => {
    const row: Row = { tau: 0, R: 1.6, V: 0, H: 0.82, Uc: 1, Lr: 1.4, Lc: 0.2, L: 1.6 };
    const expected = row.R ** (-mAt(row.R, parameters) * (parameters.gamma1 - 1)) * row.H;
    expect(thermodynamicTemperatureRatio(row, parameters)).toBeCloseTo(expected);
    expect(phaseLagQuantityValue(row, "T", parameters)).toBeCloseTo(expected);
  });

  it("omits missing or flat data from pair-point generation", () => {
    const pair = PHASE_LAG_PAIRS.find((candidate) => candidate.id === "R-L") as PhaseLagPair;
    expect(phaseLagForPair(flatRows(), pair, parameters)).toBeNull();

    const points = phaseLagSeriesPoints([
      gridResult(1, 0.6, flatRows()),
      gridResult(2, 0.3, syntheticRows({ R: 0.1, L: 0.24 })),
      gridResult(3, 0.4, syntheticRows({ R: 0.1, L: 0.3 }))
    ], pair, "gammac");

    expect(points.map((point) => point.x)).toEqual([0.3, 0.4]);
    expect(points[0].lag).toBeCloseTo(0.14, 3);
    expect(points[1].lag).toBeCloseTo(0.2, 3);
  });
});
