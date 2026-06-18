import { describe, expect, it } from "vitest";
import { PRESETS, compareRows, derivatives, solveModel } from "../src/model";
import { integrate } from "../src/solvers";

describe("one-zone model", () => {
  it("matches the Python derivative fixture for the Strip initial state", () => {
    const p = PRESETS.Strip;
    const actual = derivatives(0, [p.r0, p.v0, p.h0, p.uc0], p);
    const expected = [0, -0.4618038233856023, -10.425285349232817, -0.15484574527148354];
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
  });

  it("runs stable presets with RK45 and DOP853 to the requested final time", () => {
    for (const preset of [PRESETS.Strip, PRESETS.Blue, PRESETS.Red, PRESETS.Thick]) {
      const p = { ...preset, tEnd: 8, solver: "rk45" as const, runUntilStable: false };
      const rk45 = solveModel(p);
      const dop853 = solveModel({ ...p, solver: "dop853" });
      expect(rk45.status).toBe("complete");
      expect(dop853.status).toBe("complete");
      expect(rk45.rows.at(-1)?.tau).toBeCloseTo(p.tEnd, 12);
      expect(dop853.rows.at(-1)?.tau).toBeCloseTo(p.tEnd, 12);
    }
  });

  it("returns finite comparison metrics on common times", () => {
    const p = { ...PRESETS.Strip, tEnd: 4, runUntilStable: false };
    const selected = solveModel({ ...p, solver: "rk45" }).rows;
    const midpoint = solveModel({ ...p, solver: "midpoint" }).rows;
    const metrics = compareRows(selected, midpoint, p);
    expect(metrics.commonPoints).toBeGreaterThan(5);
    expect(Number.isFinite(metrics.maxStateDelta)).toBe(true);
    expect(Number.isFinite(metrics.maxLuminosityDelta)).toBe(true);
  });

  it("auto-stop mode reports a stability classification or the maximum-time cap", () => {
    const result = solveModel({ ...PRESETS.Strip, tEnd: 8, runUntilStable: true });
    expect(["equilibrium", "limit_cycle", "max_time"]).toContain(result.message);
  });

  it("classifies long outward drifts before exhausting stored rows", () => {
    const result = solveModel({ ...PRESETS.Strip, tEnd: 240, runUntilStable: true });
    expect(result.message).toBe("runaway_trend");
    expect(result.rows.at(-1)?.R).toBeGreaterThan(20);
    expect(result.rows.length).toBeLessThan(14000);
  });
});

describe("adaptive solvers", () => {
  it("integrates exponential decay accurately with RK45 and DOP853", () => {
    const exact = Math.exp(-1);
    for (const solver of ["rk45", "dop853"] as const) {
      const result = integrate((_t, y) => [-0.5 * y[0]], [1], 2, {
        solver,
        initialStep: 0.1,
        maxStep: 0.2,
        rtol: 1e-8,
        atol: 1e-10
      });
      expect(result.status).toBe("complete");
      expect(result.points.at(-1)?.y[0]).toBeCloseTo(exact, 8);
      expect(result.stats.acceptedSteps).toBeGreaterThan(0);
    }
  });

  it("reports domain errors without throwing out of integrate", () => {
    const result = integrate((_t, _y) => {
      throw new Error("domain");
    }, [1], 1, { solver: "rk45", initialStep: 0.1, minStep: 1e-6 });
    expect(["domain_error", "step_limit"]).toContain(result.status);
  });

  it("can sample stored output without skipping accepted integration steps", () => {
    const result = integrate((_t, y) => [-0.5 * y[0]], [1], 2, {
      solver: "rk45",
      initialStep: 0.01,
      maxStep: 0.02,
      outputInterval: 0.25,
      rtol: 1e-8,
      atol: 1e-10
    });
    expect(result.status).toBe("complete");
    expect(result.stats.acceptedSteps).toBeGreaterThan(result.points.length);
    expect(result.points.at(-1)?.t).toBeCloseTo(2, 12);
  });
});
