import { type Row } from "./model";
import { type PhaseResult } from "./phase";

export type DisplayWindowMode = "phase" | "time";
export type TimeWindowReason = "equilibrium" | "runaway" | "runaway_trend";
export type DisplayWindowReason = "phase" | "phase_unavailable" | TimeWindowReason;
export type NumericRange = [number, number];

export interface DisplayWindow {
  mode: DisplayWindowMode;
  reason: DisplayWindowReason;
  rows: readonly Row[];
  xlim: NumericRange;
  period: number | null;
  message?: string;
}

export function isTimeWindowReason(message: string): message is TimeWindowReason {
  return message === "equilibrium" || message === "runaway" || message === "runaway_trend";
}

export function buildPhaseDisplayWindow(phase: PhaseResult, message?: string): DisplayWindow {
  return {
    mode: "phase",
    reason: phase.reason === "ok" ? "phase" : "phase_unavailable",
    rows: phase.rows,
    xlim: [0, 2],
    period: phase.period,
    message
  };
}

export function buildTimeDisplayWindow(rows: readonly Row[], reason: TimeWindowReason, message?: string): DisplayWindow {
  const windowRows = terminalTimeWindowRows(rows, reason);
  return {
    mode: "time",
    reason,
    rows: windowRows,
    xlim: timeDomain(windowRows),
    period: null,
    message
  };
}

export function terminalTimeWindowRows(rows: readonly Row[], reason: TimeWindowReason): Row[] {
  const finiteRows = rows.filter((row) => Number.isFinite(row.tau));
  if (finiteRows.length <= 2) return [...finiteRows];
  const firstTau = finiteRows[0].tau;
  const finalTau = finiteRows[finiteRows.length - 1].tau;
  const span = finalTau - firstTau;
  if (span <= 0) return [...finiteRows];

  let startTau: number | null = null;
  if (reason === "runaway" || reason === "runaway_trend") {
    const extrema = luminosityExtremaIndices(finiteRows);
    if (extrema.length >= 6) startTau = finiteRows[extrema[extrema.length - 6]].tau;
    else if (extrema.length >= 3) startTau = finiteRows[extrema[0]].tau;
  }

  if (startTau === null) {
    const fraction = reason === "equilibrium" ? 0.22 : 0.28;
    const minimumDuration = reason === "equilibrium" ? 4 : 3;
    const maximumDuration = reason === "equilibrium" ? 18 : 24;
    const duration = Math.min(maximumDuration, Math.max(minimumDuration, span * fraction));
    startTau = Math.max(firstTau, finalTau - duration);
  }

  const selected = finiteRows.filter((row) => row.tau >= startTau && row.tau <= finalTau);
  return selected.length >= 2 ? selected : finiteRows.slice(-Math.min(finiteRows.length, 64));
}

export function rowAtDisplayPosition(display: DisplayWindow, position: number): Row | null {
  if (display.mode === "time") return rowAtTime(display.rows, displayTimeAtPosition(display, position));
  return rowAtFoldedPhase(display.rows, position);
}

export function displayMarkerX(display: DisplayWindow, position: number): number {
  if (display.mode === "time") return displayTimeAtPosition(display, position);
  return normalizeFoldedPhase(position);
}

export function displayAnimationEnd(display: DisplayWindow): number {
  return display.mode === "time" ? 1 : 2;
}

export function rowAtTime(rows: readonly Row[], time: number): Row | null {
  if (!rows.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const target = clamp(time, first.tau, last.tau);
  if (target <= first.tau) return first;
  if (target >= last.tau) return last;

  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].tau <= target) lo = mid;
    else hi = mid;
  }
  return interpolateRows(rows[lo], rows[hi], target);
}

function rowAtFoldedPhase(rows: readonly Row[], phase: number): Row | null {
  if (!rows.length) return null;
  const target = normalizeFoldedPhase(phase);
  if (target <= rows[0].tau) return rows[0];
  const last = rows[rows.length - 1];
  if (target >= last.tau) return last;

  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].tau <= target) lo = mid;
    else hi = mid;
  }
  return interpolateRows(rows[lo], rows[hi], target);
}

function interpolateRows(a: Row, b: Row, tau: number): Row {
  if (a.tau === b.tau) return a;
  const fraction = (tau - a.tau) / (b.tau - a.tau);
  const blend = (key: keyof Row) => a[key] + (b[key] - a[key]) * fraction;
  return {
    tau,
    R: blend("R"),
    V: blend("V"),
    H: blend("H"),
    Uc: blend("Uc"),
    Lr: blend("Lr"),
    Lc: blend("Lc"),
    L: blend("L")
  };
}

function displayTimeAtPosition(display: DisplayWindow, position: number): number {
  const fraction = clamp(position, 0, 1);
  return display.xlim[0] + fraction * (display.xlim[1] - display.xlim[0]);
}

function timeDomain(rows: readonly Row[]): NumericRange {
  if (!rows.length) return [0, 1];
  const first = rows[0].tau;
  const last = rows[rows.length - 1].tau;
  if (first === last) return [first - 0.5, last + 0.5];
  return [first, last];
}

function luminosityExtremaIndices(rows: readonly Row[]): number[] {
  const extrema: number[] = [];
  for (let index = 1; index < rows.length - 1; index += 1) {
    const previous = rows[index - 1].L;
    const current = rows[index].L;
    const next = rows[index + 1].L;
    if (!Number.isFinite(previous + current + next)) continue;
    if ((current >= previous && current > next) || (current <= previous && current < next)) {
      extrema.push(index);
    }
  }
  return extrema;
}

function normalizeFoldedPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  if (phase === 2) return 2;
  return ((phase % 2) + 2) % 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
