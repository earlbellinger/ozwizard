import { type Row } from "./model";
import { type PhaseResult } from "./phase";

export type DisplayWindowMode = "phase" | "time";
export type TimeWindowReason = "equilibrium" | "runaway" | "runaway_trend";
export type DisplayWindowReason = "phase" | "phase_unavailable" | TimeWindowReason;
export type NumericRange = [number, number];
type TerminalWindowKind = "terminal" | "recent_extrema" | "damping_decade" | "partial_damping" | "growth_decade" | "partial_growth";

const AMPLITUDE_NOISE_FLOOR = 1e-5;
const PARTIAL_CHANGE_FACTOR = 1.25;

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
  const selection = terminalTimeWindowSelection(rows, reason);
  return {
    mode: "time",
    reason,
    rows: selection.rows,
    xlim: timeDomain(selection.rows),
    period: null,
    message: selection.kind === "damping_decade"
      ? "time window: last damping decade"
      : selection.kind === "partial_damping"
        ? "time window: partial damping window"
      : selection.kind === "growth_decade"
        ? "time window: runaway growth decade"
        : selection.kind === "partial_growth"
          ? "time window: partial runaway growth"
        : message
  };
}

export function terminalTimeWindowRows(rows: readonly Row[], reason: TimeWindowReason): Row[] {
  return terminalTimeWindowSelection(rows, reason).rows;
}

function terminalTimeWindowSelection(
  rows: readonly Row[],
  reason: TimeWindowReason
): { rows: Row[]; kind: TerminalWindowKind } {
  const finiteRows = rows.filter((row) => Number.isFinite(row.tau));
  if (finiteRows.length <= 2) return { rows: [...finiteRows], kind: "terminal" };
  const firstTau = finiteRows[0].tau;
  const finalTau = finiteRows[finiteRows.length - 1].tau;
  const span = finalTau - firstTau;
  if (span <= 0) return { rows: [...finiteRows], kind: "terminal" };

  let startTau: number | null = null;
  let kind: TerminalWindowKind = "terminal";
  if (reason === "equilibrium") {
    const dampingWindow = dampingWindowStart(finiteRows);
    if (dampingWindow) {
      startTau = dampingWindow.startTau;
      kind = dampingWindow.kind;
    }
  }

  if (reason === "runaway" || reason === "runaway_trend") {
    const growthWindow = growthWindowStart(finiteRows);
    if (growthWindow) {
      startTau = growthWindow.startTau;
      kind = growthWindow.kind;
    } else {
      const extrema = luminosityExtremaIndices(finiteRows);
      if (extrema.length >= 6) {
        startTau = finiteRows[extrema[extrema.length - 6]].tau;
        kind = "recent_extrema";
      } else if (extrema.length >= 3) {
        startTau = finiteRows[extrema[0]].tau;
        kind = "recent_extrema";
      }
    }
  }

  if (startTau === null) {
    const fraction = reason === "equilibrium" ? 0.22 : 0.28;
    const minimumDuration = reason === "equilibrium" ? 4 : 3;
    const maximumDuration = reason === "equilibrium" ? 18 : 24;
    const duration = Math.min(maximumDuration, Math.max(minimumDuration, span * fraction));
    startTau = Math.max(firstTau, finalTau - duration);
  }

  const selected = finiteRows.filter((row) => row.tau >= startTau && row.tau <= finalTau);
  return {
    rows: selected.length >= 2 ? selected : finiteRows.slice(-Math.min(finiteRows.length, 64)),
    kind
  };
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

interface AmplitudeSample {
  startTau: number;
  amplitude: number;
}

interface WindowStart {
  startTau: number;
  kind: TerminalWindowKind;
}

function dampingWindowStart(rows: readonly Row[]): WindowStart | null {
  const extrema = luminosityExtremaIndices(rows);
  if (extrema.length < 5) return null;
  const samples = luminosityAmplitudeSamples(rows, extrema);
  if (samples.length < 4) return null;

  const amplitudes = samples.map((sample) => sample.amplitude);
  const maxAmplitude = Math.max(...amplitudes);
  if (!Number.isFinite(maxAmplitude) || maxAmplitude <= 0) return null;

  const amplitudeFloor = amplitudeNoiseFloor(maxAmplitude);
  let lastIndex = -1;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].amplitude >= amplitudeFloor) {
      lastIndex = index;
      break;
    }
  }
  if (lastIndex < 2) return null;

  const targetAmplitude = samples[lastIndex].amplitude * 10;
  if (targetAmplitude <= maxAmplitude * 1.02) {
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      if (samples[index].amplitude >= targetAmplitude) {
        return {
          startTau: paddedOscillationStartTau(rows, extrema, samples[index].startTau),
          kind: "damping_decade"
        };
      }
    }
  }

  const earlier = samples
    .slice(0, lastIndex)
    .map((sample, index) => ({ ...sample, index }))
    .filter((sample) => sample.amplitude >= amplitudeFloor)
    .sort((a, b) => b.amplitude - a.amplitude)[0];
  if (!earlier || earlier.amplitude < samples[lastIndex].amplitude * PARTIAL_CHANGE_FACTOR) return null;
  return {
    startTau: paddedOscillationStartTau(rows, extrema, earlier.startTau),
    kind: "partial_damping"
  };
}

function growthWindowStart(rows: readonly Row[]): WindowStart | null {
  return oscillatoryGrowthWindowStart(rows) ?? runawayMagnitudeGrowthWindowStart(rows);
}

function oscillatoryGrowthWindowStart(rows: readonly Row[]): WindowStart | null {
  const extrema = luminosityExtremaIndices(rows);
  if (extrema.length < 5) return null;
  const samples = luminosityAmplitudeSamples(rows, extrema);
  if (samples.length < 4) return null;
  const amplitudes = samples.map((sample) => sample.amplitude);
  const maxAmplitude = Math.max(...amplitudes);
  if (!Number.isFinite(maxAmplitude) || maxAmplitude <= 0) return null;
  const amplitudeFloor = amplitudeNoiseFloor(maxAmplitude);

  let lastIndex = -1;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].amplitude >= amplitudeFloor) {
      lastIndex = index;
      break;
    }
  }
  if (lastIndex < 2) return null;

  const finalAmplitude = samples[lastIndex].amplitude;
  const previousMax = Math.max(...samples.slice(0, lastIndex).map((sample) => sample.amplitude));
  if (!Number.isFinite(finalAmplitude + previousMax) || finalAmplitude <= 0 || finalAmplitude < previousMax * 0.8) return null;

  const targetAmplitude = finalAmplitude / 10;
  for (let index = lastIndex - 1; index >= 0; index -= 1) {
    if (samples[index].amplitude >= amplitudeFloor && samples[index].amplitude <= targetAmplitude) {
      return {
        startTau: paddedOscillationStartTau(rows, extrema, samples[index].startTau),
        kind: "growth_decade"
      };
    }
  }

  const earlier = samples
    .slice(0, lastIndex)
    .map((sample, index) => ({ ...sample, index }))
    .filter((sample) => sample.amplitude >= amplitudeFloor)
    .sort((a, b) => a.amplitude - b.amplitude)[0];
  if (!earlier || finalAmplitude < earlier.amplitude * PARTIAL_CHANGE_FACTOR) return null;
  return {
    startTau: paddedOscillationStartTau(rows, extrema, earlier.startTau),
    kind: "partial_growth"
  };
}

function paddedOscillationStartTau(rows: readonly Row[], extrema: readonly number[], startTau: number): number {
  const firstTau = rows[0].tau;
  const finalTau = rows[rows.length - 1].tau;
  const period = luminosityExtremaPeriod(rows, extrema);
  let paddedStartTau = startTau;
  if (period !== null) {
    paddedStartTau = Math.max(firstTau, paddedStartTau - 0.25 * period);
    const minimumDuration = Math.max(3, 2.5 * period);
    if (finalTau - paddedStartTau < minimumDuration) paddedStartTau = Math.max(firstTau, finalTau - minimumDuration);
  }
  return paddedStartTau;
}

function runawayMagnitudeGrowthWindowStart(rows: readonly Row[]): WindowStart | null {
  if (rows.length < 4) return null;
  const values = rows.map(runawayMagnitude);
  const finalValue = values.at(-1) ?? 0;
  const maxValue = Math.max(...values);
  const floor = amplitudeNoiseFloor(maxValue);
  if (!Number.isFinite(finalValue + maxValue) || finalValue <= floor || finalValue < maxValue * 0.8) return null;

  const target = finalValue / 10;
  for (let index = values.length - 2; index >= 0; index -= 1) {
    if (values[index] >= floor && values[index] <= target) {
      return {
        startTau: paddedTrendStartTau(rows, rows[index].tau),
        kind: "growth_decade"
      };
    }
  }

  let startIndex = -1;
  let minValue = Infinity;
  for (let index = 0; index < values.length - 1; index += 1) {
    if (values[index] >= floor && values[index] < minValue) {
      minValue = values[index];
      startIndex = index;
    }
  }
  if (startIndex < 0 || finalValue < minValue * PARTIAL_CHANGE_FACTOR) return null;
  return {
    startTau: paddedTrendStartTau(rows, rows[startIndex].tau),
    kind: "partial_growth"
  };
}

function paddedTrendStartTau(rows: readonly Row[], startTau: number): number {
  const firstTau = rows[0].tau;
  const finalTau = rows[rows.length - 1].tau;
  const minimumDuration = Math.max(2, (finalTau - firstTau) * 0.06);
  let paddedStartTau = startTau;
  if (finalTau - paddedStartTau < minimumDuration) paddedStartTau = Math.max(firstTau, finalTau - minimumDuration);
  return paddedStartTau;
}

function runawayMagnitude(row: Row): number {
  const values = [
    Math.abs(row.R - 1),
    Math.abs(row.H - 1),
    Math.abs(row.Uc - 1),
    Math.abs(row.L - 1),
    Math.abs(row.V)
  ].filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function amplitudeNoiseFloor(maxAmplitude: number): number {
  return Math.max(AMPLITUDE_NOISE_FLOOR, maxAmplitude * 1e-4);
}

function luminosityAmplitudeSamples(rows: readonly Row[], extrema: readonly number[]): AmplitudeSample[] {
  const samples: AmplitudeSample[] = [];
  for (let index = 0; index < extrema.length - 1; index += 1) {
    const left = rows[extrema[index]];
    const right = rows[extrema[index + 1]];
    const duration = right.tau - left.tau;
    const scale = Math.max(1, Math.abs(left.L), Math.abs(right.L));
    const amplitude = Math.abs(right.L - left.L) / scale;
    if (duration > 0 && Number.isFinite(amplitude) && amplitude > 0) {
      samples.push({ startTau: left.tau, amplitude });
    }
  }
  return samples;
}

function luminosityExtremaPeriod(rows: readonly Row[], extrema: readonly number[]): number | null {
  const gaps: number[] = [];
  for (let index = 0; index < extrema.length - 1; index += 1) {
    const gap = rows[extrema[index + 1]].tau - rows[extrema[index]].tau;
    if (gap > 0 && Number.isFinite(gap)) gaps.push(gap);
  }
  const halfPeriod = median(gaps);
  return halfPeriod !== null ? 2 * halfPeriod : null;
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeFoldedPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  if (phase === 2) return 2;
  return ((phase % 2) + 2) % 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
