import { describe, expect, it } from "vitest";
import {
  buildTimeDisplayWindow,
  displayAnimationEnd,
  displayMarkerX,
  rowAtDisplayPosition,
  terminalTimeWindowRows
} from "../src/displayWindow";
import { type Row } from "../src/model";

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

  it("keeps the last oscillations before a runaway when extrema are available", () => {
    const rows = Array.from({ length: 401 }, (_value, index) => {
      const tau = index * 0.1;
      return row(tau, 1 + 0.3 * Math.sin((2 * Math.PI * tau) / 2.5));
    });
    const windowRows = terminalTimeWindowRows(rows, "runaway");
    expect(windowRows.length).toBeGreaterThan(6);
    expect(windowRows[0].tau).toBeGreaterThan(25);
    expect(windowRows.at(-1)?.tau).toBeCloseTo(40);
  });
});
