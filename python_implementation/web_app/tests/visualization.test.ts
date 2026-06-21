import { describe, expect, it } from "vitest";
import { PRESETS, type Row } from "../src/model";
import {
  blackbodyRgbForTemperature,
  inferEffectiveTemperature,
  phaseRowAt,
  shellGeometryFor,
  shellGeometryFromModel
} from "../src/visualization";

function row(tau: number, value: number): Row {
  return {
    tau,
    R: value,
    V: value * 2,
    H: value * 3,
    Uc: value * 4,
    Lr: value * 5,
    Lc: value * 6,
    L: value * 7
  };
}

describe("shell visualization helpers", () => {
  it("infers an effective temperature from dimensionless luminosity and radius", () => {
    expect(inferEffectiveTemperature(1, 1)).toBeCloseTo(6500, 12);
    expect(inferEffectiveTemperature(16, 1)).toBeCloseTo(13000, 12);
    expect(inferEffectiveTemperature(1, 2)).toBeCloseTo(6500 / Math.sqrt(2), 11);
  });

  it("clamps and interpolates the Charity/Vendian 10-degree blackbody colors", () => {
    expect(blackbodyRgbForTemperature(500)).toEqual({ r: 255, g: 56, b: 0 });
    expect(blackbodyRgbForTemperature(6500)).toEqual({ r: 255, g: 249, b: 253 });
    expect(blackbodyRgbForTemperature(6750)).toEqual({ r: 250, g: 246, b: 254 });
    expect(blackbodyRgbForTemperature(20000)).toEqual({ r: 186, g: 208, b: 255 });
  });

  it("interpolates rows across the folded two-cycle phase", () => {
    const rows = [row(0, 1), row(1, 3), row(2, 5)];
    expect(phaseRowAt(rows, 0.5)?.R).toBeCloseTo(2, 12);
    expect(phaseRowAt(rows, 1.25)?.V).toBeCloseTo(7, 12);
    expect(phaseRowAt(rows, 2)?.R).toBeCloseTo(5, 12);
    expect(phaseRowAt(rows, 2.25)?.R).toBeCloseTo(1.5, 12);
  });

  it("derives shell thickness from the form factor", () => {
    expect(shellGeometryFor(1, 3)).toMatchObject({
      eta: 0,
      outerRadius: 1,
      innerRadius: 0,
      thickness: 1,
      thicknessFraction: 1
    });

    const geometry = shellGeometryFor(1, 10);
    const eta = Math.cbrt(0.7);
    expect(geometry.eta).toBeCloseTo(eta, 12);
    expect(geometry.innerRadius).toBeCloseTo(eta, 12);
    expect(geometry.thickness).toBeCloseTo(1 - eta, 12);
  });

  it("keeps the inner boundary fixed for radius-dependent geometry", () => {
    const parameters = { ...PRESETS["Radius-dependent strip"], m: 10, variableM: true };
    const geometry = shellGeometryFromModel({ ...row(0, 1), R: 1.4 }, parameters);
    expect(geometry.outerRadius).toBeCloseTo(1.4, 12);
    expect(geometry.innerRadius).toBeCloseTo(Math.cbrt(0.7), 12);
    expect(geometry.thickness).toBeCloseTo(1.4 - Math.cbrt(0.7), 12);
  });
});
