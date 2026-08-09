import { describe, expect, it } from "vitest";
import type { DisplayWindow } from "../src/displayWindow";
import type { Row } from "../src/model";
import {
  PAPER_PHASE_EVENTS,
  PAPER_PHASE_POINT_MAX,
  addPaperPhasePoint,
  centerGridPathIndex,
  extremaPaperPhaseSelection,
  nextThemeMode,
  normalizePaperPhaseSelection,
  parseThemeMode,
  quarterPaperPhaseSelection,
  removePaperPhasePoint,
  resolvePaperSnapshots,
  updateNumericPaperPhase
} from "../src/paperMode";

function row(tau: number, L: number, V: number, R = 1 + tau * 0.01, Lr = L, Lc = 0): Row {
  return { tau, R, V, H: 1, Uc: 0.5, Lr, Lc, L };
}

describe("paper theme", () => {
  it("parses and cycles dark, light, paper, dark", () => {
    expect(parseThemeMode(null)).toBe("dark");
    expect(parseThemeMode("invalid")).toBe("dark");
    expect(parseThemeMode("paper")).toBe("paper");
    expect(nextThemeMode("dark")).toBe("light");
    expect(nextThemeMode("light")).toBe("paper");
    expect(nextThemeMode("paper")).toBe("dark");
  });
});

describe("paper phase selection", () => {
  it("uses ordered physical extrema and quarter-phase presets", () => {
    expect(extremaPaperPhaseSelection().points.map((point) => point.kind === "event" ? point.event : "phase"))
      .toEqual(["minL", "minV", "maxL", "maxV"]);
    expect(quarterPaperPhaseSelection().points.map((point) => point.kind === "phase" ? point.phase : NaN))
      .toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("normalizes stored selections and enforces one-to-eight points", () => {
    const normalized = normalizePaperPhaseSelection({
      schemaVersion: 1,
      preset: "custom",
      points: [{ id: "phase", kind: "phase", phase: 1.25 }]
    });
    expect(normalized.points).toEqual([{ id: "phase", kind: "phase", phase: 0.25 }]);
    let selection = normalized;
    for (let index = 0; index < 12; index += 1) {
      selection = addPaperPhasePoint(selection, { kind: "phase", phase: index / 13 }, `p-${index}`);
    }
    expect(selection.points).toHaveLength(PAPER_PHASE_POINT_MAX);
    while (selection.points.length > 1) selection = removePaperPhasePoint(selection, selection.points[0].id);
    expect(removePaperPhasePoint(selection, selection.points[0].id)).toEqual(selection);
  });

  it("keeps semantic events attached to first-cycle extrema", () => {
    const display: DisplayWindow = {
      mode: "phase",
      reason: "phase",
      period: 2,
      xlim: [0, 2],
      rows: [
        row(0, 1.0, 0), row(0.25, 0.5, -2), row(0.5, 1.5, 0), row(0.75, 1.0, 2),
        row(1, -100, -100), row(1.25, 100, 100), row(1.5, -200, -200), row(1.75, 200, 200), row(2, -300, -300)
      ]
    };
    const snapshots = resolvePaperSnapshots(extremaPaperPhaseSelection(), display);
    expect(snapshots.map((snapshot) => snapshot.coordinate)).toEqual([0.25, 0.25, 0.5, 0.75]);
    expect(snapshots.every((snapshot) => snapshot.coordinateLabel.startsWith("φ ="))).toBe(true);
  });

  it("resolves every Lightcurve annotation as a semantic event", () => {
    const display: DisplayWindow = {
      mode: "phase",
      reason: "phase",
      period: 2,
      xlim: [0, 2],
      rows: [
        row(0, 1, 0, 1, 1, 4),
        row(0.25, 0.25, -2, 0.5, 0.1, 3),
        row(0.5, 16, 0, 2, 5, 0.2),
        row(0.75, 0.0625, 2, 1, 2, 8),
        row(1, 100, 100, 10)
      ]
    };
    const snapshots = PAPER_PHASE_EVENTS.map((event) => resolvePaperSnapshots(normalizePaperPhaseSelection({
      schemaVersion: 1,
      preset: "custom",
      points: [{ id: `event-${event}`, kind: "event", event }]
    }), display)[0]);
    expect(snapshots.map((snapshot) => snapshot.coordinate))
      .toEqual([0.75, 0.25, 0.5, 0.75, 0.25, 0.5, 0.5, 0.75, 0.25, 0.5, 0.75, 0.5]);
    expect(snapshots.map((snapshot) => snapshot.label))
      .toEqual([
        "min light", "min V", "max light", "max V", "min Lr", "max Lr", "min Lc", "max Lc",
        "min R", "max R", "min T", "max T"
      ]);
  });

  it("maps numeric phases fractionally across non-periodic time windows and labels tau", () => {
    const display: DisplayWindow = {
      mode: "time",
      reason: "equilibrium",
      period: null,
      xlim: [10, 20],
      rows: [row(10, 1, 0), row(12.5, 0.5, -2), row(15, 1.5, 0), row(17.5, 1, 2), row(20, 1, 0)]
    };
    const snapshots = resolvePaperSnapshots(quarterPaperPhaseSelection(), display);
    expect(snapshots.map((snapshot) => snapshot.coordinate)).toEqual([10, 12.5, 15, 17.5]);
    expect(snapshots.every((snapshot) => snapshot.coordinateLabel.startsWith("τ ="))).toBe(true);
  });

  it("updates fixed numeric phases without changing semantic events", () => {
    const selection = addPaperPhasePoint(extremaPaperPhaseSelection(), { kind: "phase", phase: 0.2 }, "numeric");
    const updated = updateNumericPaperPhase(selection, "numeric", -0.1);
    expect(updated.points.at(-1)).toEqual({ id: "numeric", kind: "phase", phase: 0.9 });
    expect(updated.points.slice(0, 4)).toEqual(selection.points.slice(0, 4));
  });
});

describe("paper grid selection", () => {
  it("chooses the nearest center deterministically and breaks ties by path order", () => {
    expect(centerGridPathIndex([0, 0.4, 0.6, 1], 0.5)).toBe(1);
    expect(centerGridPathIndex([0.1, 0.2, 0.3], 0.29)).toBe(2);
    expect(centerGridPathIndex([], 0.5)).toBe(0);
  });
});
