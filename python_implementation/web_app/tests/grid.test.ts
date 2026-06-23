import { describe, expect, it } from "vitest";
import { computeFourierParameters, hasUsableFourierAmplitudes, luminosityAmplitude, wrapTwoPi } from "../src/fourier";
import {
  buildLoopPathSamples,
  defaultGridRange,
  estimateGridCoarseness,
  generateSliderSamples,
  parameterValueFromSlider,
  sliderValueFromNumericValue,
  type GridRange,
  type GridWorkerMessage
} from "../src/grid";
import { computeGridWithMessages } from "../src/gridCompute";
import { PRESETS, type Row } from "../src/model";

function syntheticFourierRows(phi1: number, phi2: number, phi3: number, phi4 = 0): Row[] {
  const amplitudes = [0.5, 0.15, 0.05, 0.025];
  return Array.from({ length: 720 }, (_value, index) => {
    const phase = (2 * index) / 720;
    const folded = phase % 1;
    const luminosity = 1
      + amplitudes[0] * Math.cos(2 * Math.PI * folded + phi1)
      + amplitudes[1] * Math.cos(4 * Math.PI * folded + phi2)
      + amplitudes[2] * Math.cos(6 * Math.PI * folded + phi3)
      + amplitudes[3] * Math.cos(8 * Math.PI * folded + phi4);
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

    const middle = defaultGridRange("m", sliderValueFromNumericValue("m", 11.5));
    expect(parameterValueFromSlider("m", middle.lowerSliderValue)).toBeCloseTo(11.5);
    expect(parameterValueFromSlider("m", middle.upperSliderValue)).toBeGreaterThan(15);
    expect(parameterValueFromSlider("m", middle.upperSliderValue)).toBeLessThan(20);
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
    expect(parameterValueFromSlider("zeta", 0)).toBeCloseTo(1);
    expect(parameterValueFromSlider("zeta", 2)).toBeCloseTo(100);
    expect(sliderValueFromNumericValue("zeta", 0.1)).toBeCloseTo(-1);
    expect(parameterValueFromSlider("zetac", -2)).toBe(0);
    expect(parameterValueFromSlider("zetac", -1)).toBeCloseTo(0.1);
    expect(sliderValueFromNumericValue("zetac", 0)).toBeCloseTo(-2);
    expect(parameterValueFromSlider("m", 0)).toBeCloseTo(3);
    expect(parameterValueFromSlider("m", 0.82)).toBeCloseTo(20);
    expect(parameterValueFromSlider("m", 1)).toBeCloseTo(100);
    expect(sliderValueFromNumericValue("m", 10)).toBeLessThan(0.5);

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
        lowerSliderValue: sliderValueFromNumericValue("m", 8),
        upperSliderValue: sliderValueFromNumericValue("m", 12),
        centerSliderValue: sliderValueFromNumericValue("m", 9),
        nativeStep: 0.005
      }
    ];
    const samples = buildLoopPathSamples(ranges, "gammac");
    expect(samples.find((item) => item.key === "gammac")?.samples).toEqual([0.58, 0.59, 0.6, 0.61, 0.62]);
    const shellSamples = samples.find((item) => item.key === "m")?.samples ?? [];
    expect(shellSamples).toHaveLength(1);
    expect(parameterValueFromSlider("m", shellSamples[0])).toBeCloseTo(10);
  });

  it("coarsens loop path samples when the grid was coarsened", () => {
    const ranges: GridRange[] = [
      {
        key: "gammac",
        lowerSliderValue: 0,
        upperSliderValue: 0.5,
        centerSliderValue: 0.5,
        nativeStep: 0.01
      },
      {
        key: "r0",
        lowerSliderValue: 1.09,
        upperSliderValue: 1.11,
        centerSliderValue: 1.1,
        nativeStep: 0.01
      }
    ];
    const samples = buildLoopPathSamples(ranges, "gammac", { stride: 25 });
    expect(samples.find((item) => item.key === "gammac")?.samples).toEqual([0, 0.25, 0.5]);
    expect(samples.find((item) => item.key === "r0")?.samples).toEqual([1.1]);

    const fallback = buildLoopPathSamples(ranges, "gammac", { zeroCompletedFallback: true });
    expect(fallback.find((item) => item.key === "gammac")?.samples).toEqual([0, 0.5]);
    expect(fallback.find((item) => item.key === "r0")?.samples).toEqual([1.1]);
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

describe("grid computation", () => {
  it("excludes dynamically runaway models from phase and Fourier diagnostics", async () => {
    const messages: GridWorkerMessage[] = [];
    await computeGridWithMessages({
      requestId: 1,
      baseParameters: {
        ...PRESETS["Instability-strip convection"],
        r0: 2,
        v0: 20,
        tEnd: 20,
        runUntilStable: false
      },
      ranges: [{
        key: "gammac",
        lowerSliderValue: 0.2,
        upperSliderValue: 0.2,
        centerSliderValue: 0.2,
        nativeStep: 0.01
      }],
      loopKey: "gammac",
      phase: {
        warmupTau: 1,
        minAmplitude: 1e-4,
        selection: "last",
        anchor: "min"
      }
    }, {
      post: (message) => messages.push(message),
      isCanceled: () => false
    });

    const complete = messages.find((message) => message.type === "grid-complete");
    expect(complete).toMatchObject({
      validPhase: 0,
      validFourier: 0,
      excludedNonPhase: 1,
      phaseUnavailable: 0,
      failed: 0
    });
  });
});

describe("Fourier helper", () => {
  it("recovers cosine-series amplitude ratios and phase combinations", () => {
    const phi1 = 0.4;
    const phi2 = 1.1;
    const phi3 = 2.2;
    const phi4 = 2.7;
    const fourier = computeFourierParameters(syntheticFourierRows(phi1, phi2, phi3, phi4));
    const expectedLuminosityAmplitude = luminosityAmplitude(syntheticFourierRows(phi1, phi2, phi3, phi4));
    expect(hasUsableFourierAmplitudes(fourier)).toBe(true);
    expect(fourier!.luminosityAmplitude).toBeCloseTo(expectedLuminosityAmplitude, 12);
    expect(fourier!.r21).toBeCloseTo(0.3, 8);
    expect(fourier!.r31).toBeCloseTo(0.1, 8);
    expect(fourier!.r41).toBeCloseTo(0.05, 8);
    expect(fourier!.phi21).toBeCloseTo(wrapTwoPi(phi2 - 2 * phi1), 8);
    expect(fourier!.phi31).toBeCloseTo(wrapTwoPi(phi3 - 3 * phi1), 8);
    expect(fourier!.phi41).toBeCloseTo(wrapTwoPi(phi4 - 4 * phi1), 8);
    expect(fourier!.phiK1[4]).toBeCloseTo(fourier!.phi41, 12);
    expect(fourier!.amplitudes[4]).toBeCloseTo(fourier!.amplitude4, 12);
    expect(fourier!.skewness).toBeGreaterThan(0);
    expect(fourier!.acuteness).toBeGreaterThan(0);
  });

  it("reports symmetric morphology ratios for a pure sinusoid", () => {
    const rows = Array.from({ length: 720 }, (_value, index): Row => {
      const phase = (2 * index) / 720;
      const luminosity = 1 + 0.25 * Math.cos(2 * Math.PI * (phase % 1));
      return { tau: phase, R: 1, V: 0, H: 1, Uc: 0, Lr: luminosity, Lc: 0, L: luminosity };
    });
    const fourier = computeFourierParameters(rows);
    expect(fourier!.skewness).toBeCloseTo(1, 2);
    expect(fourier!.acuteness).toBeCloseTo(1, 2);
  });
});
