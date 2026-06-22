import type { Row } from "./model";
import { findLuminosityMaxima, findLuminosityMinima } from "./phase";

export type BlazhkoKind = "none" | "single" | "double";

export interface BlazhkoCycle {
  index: number;
  startTau: number;
  endTau: number;
  centerTau: number;
  amplitude: number;
  minLuminosity: number;
  maxLuminosity: number;
}

export interface BlazhkoPeriod {
  period: number;
  cyclesPerPeriod: number;
  powerShare: number;
  modulationDepth: number;
  phaseZeroTau: number;
  frequencyIndex: number;
}

export interface BlazhkoAnalysis {
  kind: BlazhkoKind;
  primaryPeriod: number | null;
  modulationDepth: number;
  cycles: BlazhkoCycle[];
  periods: BlazhkoPeriod[];
  reason: "ok" | "no_primary_period" | "not_enough_cycles" | "low_modulation" | "aperiodic";
}

export interface BlazhkoOptions {
  warmupTau?: number;
  minCycles?: number;
  minModulationDepth?: number;
}

const DEFAULT_MIN_CYCLES = 8;
const DEFAULT_MIN_MODULATION_DEPTH = 0.035;

function finitePrimaryPeriod(primaryPeriod: number | null | undefined): number | null {
  return primaryPeriod !== null
    && primaryPeriod !== undefined
    && Number.isFinite(primaryPeriod)
    && primaryPeriod > 0
    ? primaryPeriod
    : null;
}

function rowRange(rows: readonly Row[], startTau: number, endTau: number): readonly Row[] {
  return rows.filter((row) => row.tau >= startTau && row.tau <= endTau);
}

function cycleFromWindow(rows: readonly Row[], startTau: number, endTau: number, index: number): BlazhkoCycle | null {
  const windowRows = rowRange(rows, startTau, endTau);
  if (windowRows.length < 4) return null;
  let minLuminosity = Infinity;
  let maxLuminosity = -Infinity;
  windowRows.forEach((row) => {
    if (!Number.isFinite(row.L)) return;
    minLuminosity = Math.min(minLuminosity, row.L);
    maxLuminosity = Math.max(maxLuminosity, row.L);
  });
  if (!Number.isFinite(minLuminosity) || !Number.isFinite(maxLuminosity)) return null;
  return {
    index,
    startTau,
    endTau,
    centerTau: (startTau + endTau) / 2,
    amplitude: maxLuminosity - minLuminosity,
    minLuminosity,
    maxLuminosity
  };
}

function cyclesFromExtrema(rows: readonly Row[], extrema: readonly Row[]): BlazhkoCycle[] {
  const cycles: BlazhkoCycle[] = [];
  for (let i = 0; i < extrema.length - 1; i += 1) {
    const cycle = cycleFromWindow(rows, extrema[i].tau, extrema[i + 1].tau, cycles.length);
    if (cycle && cycle.amplitude > 0) cycles.push(cycle);
  }
  return cycles;
}

export function blazhkoCycles(rows: readonly Row[], primaryPeriod: number, warmupTau?: number): BlazhkoCycle[] {
  const after = warmupTau ?? rows[0]?.tau ?? 0;
  const minSeparation = Math.max(0.1, primaryPeriod * 0.5);
  const minima = findLuminosityMinima(rows, after, minSeparation);
  const minimumCycles = cyclesFromExtrema(rows, minima);
  if (minimumCycles.length >= 3) return minimumCycles;
  const maxima = findLuminosityMaxima(rows, after, minSeparation);
  return cyclesFromExtrema(rows, maxima);
}

function detrend(values: readonly number[]): number[] {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let variance = 0;
  values.forEach((value, index) => {
    const x = index - meanX;
    covariance += x * (value - meanY);
    variance += x * x;
  });
  const slope = variance > 0 ? covariance / variance : 0;
  return values.map((value, index) => value - (meanY + slope * (index - meanX)));
}

function envelopeTurnCount(values: readonly number[]): number {
  let previousSign = 0;
  let turns = 0;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const sign = Math.abs(delta) < 1e-12 ? 0 : Math.sign(delta);
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) turns += 1;
    if (sign !== 0) previousSign = sign;
  }
  return turns;
}

interface FrequencyCandidate {
  k: number;
  power: number;
  cyclesPerPeriod: number;
}

function modulationCandidates(values: readonly number[], primaryPeriod: number): FrequencyCandidate[] {
  const n = values.length;
  const detrended = detrend(values);
  const candidates: FrequencyCandidate[] = [];
  for (let k = 1; k <= Math.floor(n / 2); k += 1) {
    const cyclesPerPeriod = n / k;
    if (cyclesPerPeriod < 2.5) continue;
    let re = 0;
    let im = 0;
    for (let index = 0; index < n; index += 1) {
      const angle = (2 * Math.PI * k * index) / n;
      re += detrended[index] * Math.cos(angle);
      im -= detrended[index] * Math.sin(angle);
    }
    const period = cyclesPerPeriod * primaryPeriod;
    if (Number.isFinite(period) && period > primaryPeriod * 2.5) {
      candidates.push({ k, power: re * re + im * im, cyclesPerPeriod });
    }
  }
  return candidates.sort((a, b) => b.power - a.power);
}

function independentCandidate(candidate: FrequencyCandidate, selected: readonly FrequencyCandidate[]): boolean {
  return selected.every((other) => {
    const periodRatio = candidate.cyclesPerPeriod / other.cyclesPerPeriod;
    return Math.abs(candidate.k - other.k) > 1
      && Math.abs(periodRatio - 1) > 0.22
      && Math.abs(periodRatio - 0.5) > 0.06
      && Math.abs(periodRatio - 2) > 0.22;
  });
}

function selectedCandidates(values: readonly number[], primaryPeriod: number): Array<FrequencyCandidate & { powerShare: number }> {
  const candidates = modulationCandidates(values, primaryPeriod);
  const totalPower = candidates.reduce((sum, candidate) => sum + candidate.power, 0);
  if (totalPower <= 0) return [];
  const selected: FrequencyCandidate[] = [];
  for (const candidate of candidates) {
    const powerShare = candidate.power / totalPower;
    const minimumShare = selected.length ? 0.16 : 0.24;
    const minimumRelativePower = selected.length ? 0.32 * selected[0].power : 0;
    if (powerShare < minimumShare || candidate.power < minimumRelativePower) continue;
    if (!independentCandidate(candidate, selected)) continue;
    selected.push(candidate);
    if (selected.length >= 2) break;
  }
  return selected.map((candidate) => ({ ...candidate, powerShare: candidate.power / totalPower }));
}

function modulationDepth(values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!finite.length) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  return mean > 0 ? (max - min) / mean : 0;
}

function phaseZeroTauForCycles(cycles: readonly BlazhkoCycle[]): number {
  const strongest = [...cycles].sort((a, b) => b.amplitude - a.amplitude)[0];
  return strongest?.centerTau ?? cycles[0]?.centerTau ?? 0;
}

export function detectBlazhkoPeriods(
  rows: readonly Row[],
  primaryPeriod: number | null | undefined,
  options: BlazhkoOptions = {}
): BlazhkoAnalysis {
  const period = finitePrimaryPeriod(primaryPeriod);
  if (!period) {
    return { kind: "none", primaryPeriod: null, modulationDepth: 0, cycles: [], periods: [], reason: "no_primary_period" };
  }
  const cycles = blazhkoCycles(rows, period, options.warmupTau);
  const minCycles = options.minCycles ?? DEFAULT_MIN_CYCLES;
  if (cycles.length < minCycles) {
    return { kind: "none", primaryPeriod: period, modulationDepth: 0, cycles, periods: [], reason: "not_enough_cycles" };
  }
  const amplitudes = cycles.map((cycle) => cycle.amplitude);
  const depth = modulationDepth(amplitudes);
  if (depth < (options.minModulationDepth ?? DEFAULT_MIN_MODULATION_DEPTH)) {
    return { kind: "none", primaryPeriod: period, modulationDepth: depth, cycles, periods: [], reason: "low_modulation" };
  }
  if (envelopeTurnCount(amplitudes) < 2) {
    return { kind: "none", primaryPeriod: period, modulationDepth: depth, cycles, periods: [], reason: "aperiodic" };
  }
  const phaseZeroTau = phaseZeroTauForCycles(cycles);
  const periods = selectedCandidates(amplitudes, period).map((candidate) => ({
    period: candidate.cyclesPerPeriod * period,
    cyclesPerPeriod: candidate.cyclesPerPeriod,
    powerShare: candidate.powerShare,
    modulationDepth: depth,
    phaseZeroTau,
    frequencyIndex: candidate.k
  }));
  if (!periods.length) {
    return { kind: "none", primaryPeriod: period, modulationDepth: depth, cycles, periods: [], reason: "aperiodic" };
  }
  return {
    kind: periods.length > 1 ? "double" : "single",
    primaryPeriod: period,
    modulationDepth: depth,
    cycles,
    periods,
    reason: "ok"
  };
}

export function blazhkoPhaseAt(tau: number, period: BlazhkoPeriod): number {
  if (!Number.isFinite(tau) || !Number.isFinite(period.period) || period.period <= 0) return 0;
  return ((tau - period.phaseZeroTau) / period.period % 1 + 1) % 1;
}
