import { type Row } from "./model";

export type PeriodogramQuantity = "L" | "R" | "V" | "H" | "Uc";

export interface PeriodogramPoint {
  frequency: number;
  period: number;
  power: number;
}

export interface PeriodogramResult {
  points: PeriodogramPoint[];
  quantity: PeriodogramQuantity;
  sampleCount: number;
  duration: number;
  minFrequency: number;
  maxFrequency: number;
  peak: PeriodogramPoint;
}

export interface PeriodogramOptions {
  quantity?: PeriodogramQuantity;
  periodHint?: number | null;
  frequencyCount?: number;
  minFrequency?: number;
  maxFrequency?: number;
  maxSamples?: number;
}

const DEFAULT_FREQUENCY_COUNT = 360;
const DEFAULT_MAX_SAMPLES = 1800;
const TWO_PI = 2 * Math.PI;

export function periodogramQuantityValue(row: Row, quantity: PeriodogramQuantity): number {
  if (quantity === "L") return row.L - 1;
  return row[quantity];
}

export function rowsAfterCut(rows: readonly Row[], cutTau: number): Row[] {
  return rows.filter((row) =>
    Number.isFinite(row.tau)
    && Number.isFinite(periodogramQuantityValue(row, "L"))
    && row.tau >= cutTau
  );
}

function finiteSortedSamples(
  rows: readonly Row[],
  quantity: PeriodogramQuantity,
  maxSamples: number
): Array<{ tau: number; value: number }> {
  const samples = rows
    .map((row) => ({ tau: row.tau, value: periodogramQuantityValue(row, quantity) }))
    .filter((sample) => Number.isFinite(sample.tau) && Number.isFinite(sample.value))
    .sort((a, b) => a.tau - b.tau);
  if (samples.length <= maxSamples) return samples;
  const stride = Math.ceil(samples.length / maxSamples);
  const downsampled = samples.filter((_sample, index) => index % stride === 0);
  const last = samples.at(-1);
  if (last && downsampled.at(-1) !== last) downsampled.push(last);
  return downsampled;
}

function medianPositiveSpacing(samples: readonly { tau: number }[]): number | null {
  const spacings: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const spacing = samples[index].tau - samples[index - 1].tau;
    if (Number.isFinite(spacing) && spacing > 0) spacings.push(spacing);
  }
  if (!spacings.length) return null;
  spacings.sort((a, b) => a - b);
  const middle = Math.floor(spacings.length / 2);
  return spacings.length % 2 ? spacings[middle] : 0.5 * (spacings[middle - 1] + spacings[middle]);
}

function frequencyBounds(
  samples: readonly { tau: number }[],
  periodHint: number | null | undefined,
  minFrequency?: number,
  maxFrequency?: number
): { minFrequency: number; maxFrequency: number; duration: number } | null {
  const firstTau = samples[0]?.tau;
  const finalTau = samples[samples.length - 1]?.tau;
  if (!Number.isFinite(firstTau) || !Number.isFinite(finalTau)) return null;
  const duration = finalTau - firstTau;
  if (!(duration > 0)) return null;

  const medianSpacing = medianPositiveSpacing(samples);
  const nyquist = medianSpacing ? 0.5 / medianSpacing : 24 / duration;
  const hintedFundamental = periodHint && periodHint > 0 ? 1 / periodHint : null;
  const fallbackMax = hintedFundamental
    ? Math.max(8 * hintedFundamental, 12 / duration)
    : 24 / duration;
  const lower = minFrequency ?? Math.max(1 / duration, hintedFundamental ? hintedFundamental / 8 : 1 / duration);
  const upper = maxFrequency ?? Math.min(nyquist, fallbackMax);
  if (!(upper > lower) || !Number.isFinite(lower + upper)) return null;
  return { minFrequency: lower, maxFrequency: upper, duration };
}

export function computePeriodogram(
  rows: readonly Row[],
  options: PeriodogramOptions = {}
): PeriodogramResult | null {
  const quantity = options.quantity ?? "L";
  const samples = finiteSortedSamples(rows, quantity, options.maxSamples ?? DEFAULT_MAX_SAMPLES);
  if (samples.length < 8) return null;
  const bounds = frequencyBounds(samples, options.periodHint, options.minFrequency, options.maxFrequency);
  if (!bounds) return null;

  const signalPower = samples.reduce((sum, sample) => sum + sample.value ** 2, 0);
  if (!(signalPower > 0)) return null;

  const frequencyCount = Math.max(16, Math.round(options.frequencyCount ?? DEFAULT_FREQUENCY_COUNT));
  const points: PeriodogramPoint[] = [];
  let peak: PeriodogramPoint | null = null;
  for (let index = 0; index < frequencyCount; index += 1) {
    const fraction = frequencyCount === 1 ? 0 : index / (frequencyCount - 1);
    const frequency = bounds.minFrequency + fraction * (bounds.maxFrequency - bounds.minFrequency);
    const omega = TWO_PI * frequency;
    let sin2 = 0;
    let cos2 = 0;
    samples.forEach((sample) => {
      sin2 += Math.sin(2 * omega * sample.tau);
      cos2 += Math.cos(2 * omega * sample.tau);
    });
    const tauShift = Math.atan2(sin2, cos2) / (2 * omega);
    let yc = 0;
    let ys = 0;
    let cc = 0;
    let ss = 0;
    samples.forEach((sample) => {
      const angle = omega * (sample.tau - tauShift);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      yc += sample.value * cosine;
      ys += sample.value * sine;
      cc += cosine ** 2;
      ss += sine ** 2;
    });
    if (cc <= 0 || ss <= 0) continue;
    const cosineAmplitude = yc / cc;
    const sineAmplitude = ys / ss;
    const power = 0.5 * (cosineAmplitude ** 2 + sineAmplitude ** 2);
    if (!Number.isFinite(power)) continue;
    const point = { frequency, period: 1 / frequency, power };
    points.push(point);
    if (!peak || point.power > peak.power) peak = point;
  }
  if (!points.length || !peak) return null;
  return {
    points,
    quantity,
    sampleCount: samples.length,
    duration: bounds.duration,
    minFrequency: bounds.minFrequency,
    maxFrequency: bounds.maxFrequency,
    peak
  };
}
