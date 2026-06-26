import { describe, expect, it } from "vitest";
import {
  buildTimeDisplayWindow,
  displayAnimationEnd,
  displayMarkerX,
  rowAtDisplayPosition,
  shouldUseRunawayGrowthWindow,
  terminalTimeWindowRows
} from "../src/displayWindow";
import { type Row } from "../src/model";
import { type PhaseResult } from "../src/phase";

function row(tau: number, luminosity = 1 + 0.2 * Math.sin(tau)): Row {
  return {
    tau,
    R: 1 + 0.01 * tau,
    V: Math.cos(tau),
    H: 1,
    Uc: 0.5,
    Lr: luminosity,
    Lc: 0,
    L: luminosity
  };
}

function equilibriumRow(tau: number, luminosity = 1): Row {
  return {
    tau,
    R: 1,
    V: 0,
    H: 1,
    Uc: 1,
    Lr: luminosity,
    Lc: 0,
    L: luminosity
  };
}

function unavailablePhase(reason: PhaseResult["reason"] = "not_enough_minima"): PhaseResult {
  return {
    rows: [],
    reference: null,
    period: null,
    reason
  };
}

describe("display windows", () => {
  it("uses the final bounded time segment for stable equilibrium displays", () => {
    const rows = Array.from({ length: 101 }, (_value, index) => row(index));
    const display = buildTimeDisplayWindow(rows, "equilibrium", "stable");
    expect(display.mode).toBe("time");
    expect(display.reason).toBe("equilibrium");
    expect(display.period).toBeNull();
    expect(displayAnimationEnd(display)).toBe(1);
    expect(display.xlim[0]).toBeGreaterThan(70);
    expect(display.xlim[1]).toBe(100);
    expect(displayMarkerX(display, 0)).toBe(display.xlim[0]);
    expect(displayMarkerX(display, 1)).toBe(display.xlim[1]);
    expect(rowAtDisplayPosition(display, 0.5)?.tau).toBeCloseTo((display.xlim[0] + display.xlim[1]) / 2);
  });

  it("uses the latest luminosity damping decade for oscillatory stable equilibrium displays", () => {
    const period = 2.5;
    const dampingTime = 22;
    const rows = Array.from({ length: 1601 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = Math.exp(-tau / dampingTime);
      return row(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "equilibrium", "stable");

    expect(display.message).toBe("time window: last damping decade");
    expect(display.xlim[0]).toBeGreaterThanOrEqual(20);
    expect(display.xlim[0]).toBeLessThan(45);
    expect(display.xlim[1]).toBeCloseTo(80);
  });

  it("labels partial damping windows when a full decade is not available", () => {
    const period = 2.5;
    const dampingTime = 160;
    const rows = Array.from({ length: 1601 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = Math.exp(-tau / dampingTime);
      return equilibriumRow(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "equilibrium", "stable");

    expect(display.message).toBe("time window: partial damping window");
    expect(display.xlim[0]).toBeLessThan(5);
    expect(display.xlim[1]).toBeCloseTo(80);
  });

  it("ignores tiny damped luminosity wiggles near the noise floor", () => {
    const period = 2.5;
    const rows = Array.from({ length: 1601 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = 1e-7 * Math.exp(-tau / 22);
      return equilibriumRow(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "equilibrium", "stable");

    expect(display.message).toBe("stable");
    expect(display.xlim[0]).toBeGreaterThan(60);
    expect(display.xlim[1]).toBeCloseTo(80);
  });

  it("keeps the last oscillations before a runaway when extrema are available", () => {
    const rows = Array.from({ length: 401 }, (_value, index) => {
      const tau = index * 0.1;
      return equilibriumRow(tau, 1 + 0.3 * Math.sin((2 * Math.PI * tau) / 2.5));
    });
    const windowRows = terminalTimeWindowRows(rows, "runaway");
    expect(windowRows.length).toBeGreaterThan(6);
    expect(windowRows[0].tau).toBeGreaterThan(25);
    expect(windowRows.at(-1)?.tau).toBeCloseTo(40);
  });

  it("uses the latest luminosity growth decade for oscillatory runaway displays", () => {
    const period = 2.5;
    const growthTime = 22;
    const rows = Array.from({ length: 1601 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = 0.01 * Math.exp(tau / growthTime);
      return equilibriumRow(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "runaway", "runaway");

    expect(display.message).toBe("time window: runaway growth decade");
    expect(display.xlim[0]).toBeGreaterThan(20);
    expect(display.xlim[0]).toBeLessThan(45);
    expect(display.xlim[1]).toBeCloseTo(80);
  });

  it("labels partial runaway growth when a full growth decade is not available", () => {
    const period = 2.5;
    const growthTime = 160;
    const rows = Array.from({ length: 1601 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = 0.01 * Math.exp(tau / growthTime);
      return equilibriumRow(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "runaway", "runaway");

    expect(display.message).toBe("time window: partial runaway growth");
    expect(display.xlim[0]).toBeLessThan(5);
    expect(display.xlim[1]).toBeCloseTo(80);
  });

  it("ignores tiny growing runaway wiggles near the noise floor", () => {
    const period = 2.5;
    const rows = Array.from({ length: 801 }, (_value, index) => {
      const tau = index * 0.05;
      const amplitude = 1e-7 * Math.exp(tau / 22);
      return equilibriumRow(tau, 1 + amplitude * Math.sin((2 * Math.PI * tau) / period));
    });
    const display = buildTimeDisplayWindow(rows, "runaway", "runaway");

    expect(display.message).toBe("runaway");
    expect(display.xlim[0]).toBeGreaterThan(25);
    expect(display.xlim[1]).toBeCloseTo(40);
  });

  it("uses a state growth decade for non-oscillatory runaway trends", () => {
    const rows = Array.from({ length: 801 }, (_value, index) => {
      const tau = index * 0.05;
      const excess = 0.001 * Math.exp(tau / 4);
      return {
        ...equilibriumRow(tau, 1 + excess),
        R: 1 + excess,
        V: excess / 4,
        H: 1 + excess
      };
    });
    const display = buildTimeDisplayWindow(rows, "runaway_trend", "runaway trend");

    expect(display.message).toBe("time window: runaway growth decade");
    expect(display.xlim[0]).toBeGreaterThan(25);
    expect(display.xlim[0]).toBeLessThan(35);
    expect(display.xlim[1]).toBeCloseTo(40);
  });

  it("flags fixed-time non-periodic growth for a runaway time window", () => {
    const rows = Array.from({ length: 801 }, (_value, index) => {
      const tau = index * 0.05;
      const excess = 0.001 * Math.exp(tau / 4);
      return {
        ...equilibriumRow(tau, 1 + excess),
        R: 1 + excess,
        V: excess / 4,
        H: 1 + excess,
        Uc: 1 + excess
      };
    });

    expect(shouldUseRunawayGrowthWindow(rows, unavailablePhase())).toBe(true);
  });

  it("does not flag flat phase-unavailable rows as runaway growth", () => {
    const rows = Array.from({ length: 801 }, (_value, index) => equilibriumRow(index * 0.05));
    expect(shouldUseRunawayGrowthWindow(rows, unavailablePhase())).toBe(false);
  });

  it("keeps valid folded phases in phase mode even when the state grows", () => {
    const rows = Array.from({ length: 801 }, (_value, index) => {
      const tau = index * 0.05;
      const excess = 0.001 * Math.exp(tau / 4);
      return {
        ...equilibriumRow(tau, 1 + excess),
        R: 1 + excess,
        V: excess / 4,
        H: 1 + excess
      };
    });
    const phase: PhaseResult = {
      rows,
      reference: null,
      period: 2,
      reason: "ok"
    };

    expect(shouldUseRunawayGrowthWindow(rows, phase)).toBe(false);
  });
});
