import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET_NAME, PRESETS, solveModel } from "../src/model";
import { integrate } from "../src/solvers";

describe("midpoint endpoint domain validation", () => {
  it.each([
    { m: 10, r0: 0.89, v0: -1.2 },
    { m: 100, r0: 1, v0: -0.5 }
  ])("reports an inner-boundary crossing for $m shell thinness", (initial) => {
    const parameters = {
      ...PRESETS[DEFAULT_PRESET_NAME], ...initial,
      geometryMode: "homogeneous-shell" as const,
      h0: 0.9, solver: "midpoint" as const,
      tEnd: 1, step: 0.001, logErrTol: -5, runUntilStable: false
    };
    const eta = Math.cbrt(1 - 3 / parameters.m);
    const result = solveModel(parameters);
    expect(result.status).toBe("domain_error");
    expect(result.message).toContain("shell boundary");
    expect(result.stats.acceptedSteps).toBeGreaterThan(0);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.R > eta)).toBe(true);
  });

  it.each([NaN, Infinity])("rejects a non-finite endpoint (%s) before invoking the stop callback", (value) => {
    let stopCalls = 0;
    const result = integrate(() => [value], [1], 0.1,
      { solver: "midpoint", initialStep: 0.1, maxStep: 0.1 },
      () => { stopCalls += 1; return null; });
    expect(result.status).toBe("domain_error");
    expect(result.message).toBe("non-finite state");
    expect(result.points).toEqual([{ t: 0, y: [1] }]);
    expect(result.stats.acceptedSteps).toBe(0);
    expect(stopCalls).toBe(0);
  });

  it("rejects a finite endpoint whose derivative is non-finite", () => {
    let stopCalls = 0;
    const result = integrate((t) => [t < 0.075 ? -1 : Infinity], [1], 0.1,
      { solver: "midpoint", initialStep: 0.1, maxStep: 0.1 },
      () => { stopCalls += 1; return null; });
    expect(result.status).toBe("domain_error");
    expect(result.message).toBe("non-finite derivative");
    expect(result.points).toEqual([{ t: 0, y: [1] }]);
    expect(result.stats.acceptedSteps).toBe(0);
    expect(stopCalls).toBe(0);
  });
});
