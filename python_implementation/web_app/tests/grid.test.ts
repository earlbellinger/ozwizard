import { describe, expect, it } from "vitest";
import { computeFourierParameters, hasUsableFourierAmplitudes, wrapTwoPi } from "../src/fourier";
import {
  buildLoopPathSamples,
  defaultGridRange,
  estimateGridCoarseness,
  generateSliderSamples,
  parameterValueFromSlider,
  type GridRange
} from "../src/grid";
import { type Row } from "../src/model";

function syntheticFourierRows(phi1: number, phi2: number, phi3: number): Row[] {
  const amplitudes = [0.5, 0.15, 0.05];
  return Array.from({ length: 720 }, (_value, index) => {
    const phase = (2 * index) / 720;
    const folded = phase % 1;
    const luminosity = 1
      + amplitudes[0] * Math.cos(2 * Math.PI * folded + phi1)
      + amplitudes[1] * Math.cos(4 * Math.PI * folded + phi2)
      + amplitudes[2] * Math.cos(6 * Math.PI * folded + phi3);
    return { tau: phase, R: 1, V: 0, H: 1, Uc: 0, Lr: luminosity, Lc: 0, L: luminosity };
  });
}

describe("grid range helpers", () => {
  it("creates a default range halfway toward the farthest bound", () => {
    const low = defaultGridRange("r0", 0.8);
    expect(low.lowerSliderValue).toBeCloseTo(0.8);
    expect(low.upperSliderValue).toBeCloseTo(1.35);

    const high = defaultGridRange("r0", 1.8);
    expect(high.lowerSliderValue).toBeCloseTo(1.275);
    expect(high.upperSliderValue).toBeCloseTo(1.8);

    const middle = defaultGridRange("m", 11.5);
    expect(middle.lowerSliderValue).toBeCloseTo(11.5);
    expect(middle.upperSliderValue).toBeCloseTo(15.75);
  });

  it("samples native slider steps, including logarithmic tau max coordinates", () => {
    const tauRange: GridRange = {
      key: "tEnd",
      lowerSliderValue: 1,
      upperSliderValue: 1.03,
      centerSliderValue: 1.02,
      nativeStep: 0.01
    };
    expect(generateSliderSamples(tauRange)).toEqual([1, 1.01, 1.02, 1.03]);
    expect(parameterValueFromSlider("tEnd", 2)).toBeCloseTo(100);

    const linearRange: GridRange = {
      key: "gammac",
      lowerSliderValue: 0.58,
      upperSliderValue: 0.62,
      centerSliderValue: 0.6,
      nativeStep: 0.01
    };
    expect(generateSliderSamples(linearRange)).toEqual([0.58, 0.59, 0.6, 0.61, 0.62]);
  });

  it("builds a dense loop path through the selected parameter and midpoint samples elsewhere", () => {
    const ranges: GridRange[] = [
      {
        key: "gammac",
        lowerSliderValue: 0.58,
        upperSliderValue: 0.62,
        centerSliderValue: 0.6,
        nativeStep: 0.01
      },
      {
        key: "m",
        lowerSliderValue: 8,
        upperSliderValue: 12,
        centerSliderValue: 9,
        nativeStep: 0.1
      }
    ];
    const samples = buildLoopPathSamples(ranges, "gammac");
    expect(samples.find((item) => item.key === "gammac")?.samples).toEqual([0.58, 0.59, 0.6, 0.61, 0.62]);
    expect(samples.find((item) => item.key === "m")?.samples).toEqual([10]);
  });

  it("estimates uniform coarsening from partial completion and falls back for zero completions", () => {
    expect(estimateGridCoarseness(40, 40, 500, 1)).toMatchObject({ stride: 1, zeroCompletedFallback: false });

    const partial = estimateGridCoarseness(10000, 100, 2000, 2);
    expect(partial.estimatedTotalMs).toBeCloseTo(200000);
    expect(partial.stride).toBeGreaterThanOrEqual(15);
    expect(partial.zeroCompletedFallback).toBe(false);

    expect(estimateGridCoarseness(10000, 0, 2000, 3)).toMatchObject({
      stride: 1,
      estimatedTotalMs: null,
      zeroCompletedFallback: true
    });
  });
});

describe("Fourier helper", () => {
  it("recovers cosine-series amplitude ratios and phase combinations", () => {
    const phi1 = 0.4;
    const phi2 = 1.1;
    const phi3 = 2.2;
    const fourier = computeFourierParameters(syntheticFourierRows(phi1, phi2, phi3));
    expect(hasUsableFourierAmplitudes(fourier)).toBe(true);
    expect(fourier!.r21).toBeCloseTo(0.3, 8);
    expect(fourier!.r31).toBeCloseTo(0.1, 8);
    expect(fourier!.phi21).toBeCloseTo(wrapTwoPi(phi2 - 2 * phi1), 8);
    expect(fourier!.phi31).toBeCloseTo(wrapTwoPi(phi3 - 3 * phi1), 8);
  });
});
