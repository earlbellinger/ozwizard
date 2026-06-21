import type { Row } from "./model";

export type PhaseAnchor = "min" | "max";

export interface PhaseReference {
  startTau: number;
  midTau: number;
  endTau: number;
  period: number;
  warmupTau: number;
  minAmplitude: number;
  anchor: PhaseAnchor;
  anchorRows: [Row, Row, Row];
  minimumRows?: [Row, Row, Row];
  maximumRows?: [Row, Row, Row];
}

export interface PhaseOptions {
  warmupTau?: number;
  minAmplitude?: number;
  minSeparation?: number;
  selection?: "first" | "last";
  anchor?: PhaseAnchor;
  reference?: PhaseReference | null;
}

export interface PhaseResult {
  rows: Row[];
  reference: PhaseReference | null;
  period: number | null;
  reason: "ok" | "not_enough_rows" | "not_enough_minima" | "not_enough_maxima" | "amplitude_below_threshold" | "reference_out_of_range";
}

function defaultWarmupTau(rows: readonly Row[]): number {
  const finalTau = rows.at(-1)?.tau ?? 0;
  return Math.max(1, Math.min(4, 0.05 * finalTau));
}

export function phaseWarmupTau(rows: readonly Row[], requested?: number): number {
  return requested !== undefined && Number.isFinite(requested) ? requested : defaultWarmupTau(rows);
}

function refinedLuminosityExtremum(rows: readonly Row[], index: number, mode: "min" | "max"): Row {
  if (index <= 0 || index >= rows.length - 1) return rows[index];
  const previous = rows[index - 1];
  const current = rows[index];
  const next = rows[index + 1];
  const x0 = previous.tau - current.tau;
  const x2 = next.tau - current.tau;
  if (!(x0 < 0 && x2 > 0)) return current;

  const y0 = previous.L - current.L;
  const y2 = next.L - current.L;
  const slope0 = y0 / x0;
  const a = (slope0 - y2 / x2) / (x0 - x2);
  const b = slope0 - a * x0;
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) < 1e-14) return current;
  if ((mode === "min" && a <= 0) || (mode === "max" && a >= 0)) return current;

  const vertex = -b / (2 * a);
  if (!Number.isFinite(vertex) || vertex < x0 || vertex > x2) return current;
  const luminosity = current.L + a * vertex * vertex + b * vertex;
  if (!Number.isFinite(luminosity)) return current;
  return { ...current, tau: current.tau + vertex, L: luminosity };
}

export function findLuminosityMaxima(rows: readonly Row[], after: number, minSeparation = 0.75): Row[] {
  const maxima: Row[] = [];
  for (let i = 1; i < rows.length - 1; i += 1) {
    const row = rows[i];
    if (row.tau < after) continue;
    if (rows[i - 1].L < row.L && row.L >= rows[i + 1].L) {
      const maximum = refinedLuminosityExtremum(rows, i, "max");
      const last = maxima.at(-1);
      if (last && maximum.tau - last.tau < minSeparation) {
        if (maximum.L > last.L) maxima[maxima.length - 1] = maximum;
      } else {
        maxima.push(maximum);
      }
    }
  }
  return maxima;
}

export function findLuminosityMinima(rows: readonly Row[], after: number, minSeparation = 0.75): Row[] {
  const minima: Row[] = [];
  for (let i = 1; i < rows.length - 1; i += 1) {
    const row = rows[i];
    if (row.tau < after) continue;
    if (rows[i - 1].L > row.L && row.L <= rows[i + 1].L) {
      const minimum = refinedLuminosityExtremum(rows, i, "min");
      const last = minima.at(-1);
      if (last && minimum.tau - last.tau < minSeparation) {
        if (minimum.L < last.L) minima[minima.length - 1] = minimum;
      } else {
        minima.push(minimum);
      }
    }
  }
  return minima;
}

function cycleAmplitude(rows: readonly Row[], startTau: number, endTau: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    if (row.tau < startTau || row.tau > endTau) continue;
    min = Math.min(min, row.L);
    max = Math.max(max, row.L);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  const scale = Math.max(1, Math.abs(max), Math.abs(min));
  return (max - min) / scale;
}

function minimumBetween(rows: readonly Row[], startTau: number, endTau: number): Row | null {
  let minimumIndex = -1;
  let minimum: Row | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.tau <= startTau || row.tau >= endTau) continue;
    if (!minimum || row.L < minimum.L) {
      minimum = row;
      minimumIndex = i;
    }
  }
  if (minimumIndex < 0) return minimum;
  const refined = refinedLuminosityExtremum(rows, minimumIndex, "min");
  return refined.tau > startTau && refined.tau < endTau ? refined : minimum;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function minimumSeparationFromMaxima(maxima: readonly Row[], requested?: number): number {
  if (requested !== undefined) return requested;
  const gaps: number[] = [];
  for (let i = 0; i < maxima.length - 1; i += 1) gaps.push(maxima[i + 1].tau - maxima[i].tau);
  const period = median(gaps);
  return period ? Math.max(0.75, period * 0.55) : 0.75;
}

function buildReferenceFromAnchors(
  rows: readonly Row[],
  anchorRows: [Row, Row, Row],
  anchor: PhaseAnchor,
  warmupTau: number,
  minAmplitude: number
): PhaseResult | null {
  const [first, second, third] = anchorRows;
  const firstCycleAmplitude = cycleAmplitude(rows, first.tau, second.tau);
  const secondCycleAmplitude = cycleAmplitude(rows, second.tau, third.tau);
  if (firstCycleAmplitude < minAmplitude || secondCycleAmplitude < minAmplitude) return null;

  const period = (third.tau - first.tau) / 2;
  if (period <= 0 || !Number.isFinite(period)) return null;
  const reference: PhaseReference = {
    startTau: first.tau,
    midTau: second.tau,
    endTau: third.tau,
    period,
    warmupTau,
    minAmplitude,
    anchor,
    anchorRows,
    minimumRows: anchor === "min" ? anchorRows : undefined,
    maximumRows: anchor === "max" ? anchorRows : undefined
  };
  return foldRowsToReference(rows, reference);
}

function buildReferenceFromMinima(
  rows: readonly Row[],
  minimumRows: [Row, Row, Row],
  warmupTau: number,
  minAmplitude: number
): PhaseResult | null {
  return buildReferenceFromAnchors(rows, minimumRows, "min", warmupTau, minAmplitude);
}

function buildMaxLightReference(rows: readonly Row[], maxima: readonly Row[], warmupTau: number, minAmplitude: number, selection?: "first" | "last"): PhaseResult {
  if (maxima.length < 3) {
    return { rows: [], reference: null, period: null, reason: "not_enough_maxima" };
  }

  const start = selection === "last" ? maxima.length - 3 : 0;
  const end = selection === "last" ? -1 : maxima.length - 3;
  const direction = selection === "last" ? -1 : 1;
  for (let i = start; selection === "last" ? i > end : i <= end; i += direction) {
    const result = buildReferenceFromAnchors(rows, [maxima[i], maxima[i + 1], maxima[i + 2]], "max", warmupTau, minAmplitude);
    if (result) return result;
  }

  return { rows: [], reference: null, period: null, reason: "amplitude_below_threshold" };
}

function buildReference(rows: readonly Row[], options: PhaseOptions): PhaseResult {
  if (rows.length < 3) {
    return { rows: [], reference: null, period: null, reason: "not_enough_rows" };
  }

  const warmupTau = phaseWarmupTau(rows, options.warmupTau);
  const minAmplitude = options.minAmplitude ?? 1e-4;
  const maxima = findLuminosityMaxima(rows, warmupTau, options.minSeparation);
  if (options.anchor === "max") {
    return buildMaxLightReference(rows, maxima, warmupTau, minAmplitude, options.selection);
  }

  if (maxima.length >= 4) {
    const start = options.selection === "last" ? maxima.length - 4 : 0;
    const end = options.selection === "last" ? -1 : maxima.length - 4;
    const direction = options.selection === "last" ? -1 : 1;
    for (let i = start; options.selection === "last" ? i > end : i <= end; i += direction) {
      const firstMinimum = minimumBetween(rows, maxima[i].tau, maxima[i + 1].tau);
      const secondMinimum = minimumBetween(rows, maxima[i + 1].tau, maxima[i + 2].tau);
      const thirdMinimum = minimumBetween(rows, maxima[i + 2].tau, maxima[i + 3].tau);
      if (!firstMinimum || !secondMinimum || !thirdMinimum) continue;
      const result = buildReferenceFromMinima(rows, [firstMinimum, secondMinimum, thirdMinimum], warmupTau, minAmplitude);
      if (result) return result;
    }
  }

  const minima = findLuminosityMinima(rows, warmupTau, minimumSeparationFromMaxima(maxima, options.minSeparation));
  if (minima.length < 3) {
    return { rows: [], reference: null, period: null, reason: "not_enough_minima" };
  }

  const start = options.selection === "last" ? minima.length - 3 : 0;
  const end = options.selection === "last" ? -1 : minima.length - 3;
  const direction = options.selection === "last" ? -1 : 1;
  for (let i = start; options.selection === "last" ? i > end : i <= end; i += direction) {
    const result = buildReferenceFromMinima(rows, [minima[i], minima[i + 1], minima[i + 2]], warmupTau, minAmplitude);
    if (result) return result;
  }

  return { rows: [], reference: null, period: null, reason: "amplitude_below_threshold" };
}

export function foldRowsToReference(rows: readonly Row[], reference: PhaseReference): PhaseResult {
  const folded: Row[] = [];
  for (const row of rows) {
    if (row.tau < reference.startTau || row.tau > reference.endTau) continue;
    const phase = (row.tau - reference.startTau) / reference.period;
    if (phase >= 0 && phase <= 2) folded.push({ ...row, tau: phase });
  }
  return {
    rows: folded,
    reference,
    period: reference.period,
    reason: folded.length ? "ok" : "reference_out_of_range"
  };
}

export function buildTwoCyclePhase(rows: readonly Row[], options: PhaseOptions = {}): PhaseResult {
  if (options.reference) return foldRowsToReference(rows, options.reference);
  return buildReference(rows, options);
}
