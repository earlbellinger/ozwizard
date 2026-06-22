import { type Row } from "./model";

const TWO_PI = 2 * Math.PI;
export const FOURIER_HARMONICS = 7;

export const MIN_FOURIER_AMPLITUDE = 1e-4;

export interface FourierParameters {
  luminosityAmplitude: number;
  phi1: number;
  phi2: number;
  phi3: number;
  phi4: number;
  phi5: number;
  phi6: number;
  phi7: number;
  phi21: number;
  phi31: number;
  phi41: number;
  phi51: number;
  phi61: number;
  phi71: number;
  r21: number;
  r31: number;
  r41: number;
  r51: number;
  r61: number;
  r71: number;
  amplitude1: number;
  amplitude2: number;
  amplitude3: number;
  amplitude4: number;
  amplitude5: number;
  amplitude6: number;
  amplitude7: number;
  phases: number[];
  phiK1: number[];
  amplitudes: number[];
  amplitudeRatios: number[];
  skewness: number;
  acuteness: number;
  coefficients: number[];
}

interface FoldedLightPoint {
  phase: number;
  luminosity: number;
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    if (pivot !== column) [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];

    const scale = augmented[column][column];
    for (let j = column; j <= n; j += 1) augmented[column][j] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }

  return augmented.map((row) => row[n]);
}

function fourierBasis(phase: number): number[] {
  const wrappedPhase = phase >= 2 ? 0 : ((phase % 1) + 1) % 1;
  const basis = [1];
  for (let harmonic = 1; harmonic <= FOURIER_HARMONICS; harmonic += 1) {
    const angle = TWO_PI * harmonic * wrappedPhase;
    basis.push(Math.cos(angle), Math.sin(angle));
  }
  return basis;
}

function foldedPhase(phase: number): number {
  const wrapped = ((phase % 1) + 1) % 1;
  return wrapped >= 1 ? 0 : wrapped;
}

function foldedLightCurvePoints(rows: readonly Row[]): FoldedLightPoint[] {
  const sorted = rows
    .filter((row) => Number.isFinite(row.tau) && Number.isFinite(row.L))
    .map((row) => ({ phase: foldedPhase(row.tau), luminosity: row.L }))
    .sort((a, b) => a.phase - b.phase);
  const merged: FoldedLightPoint[] = [];
  for (const point of sorted) {
    const previous = merged.at(-1);
    if (previous && Math.abs(point.phase - previous.phase) < 1e-6) {
      previous.luminosity = 0.5 * (previous.luminosity + point.luminosity);
    } else {
      merged.push({ ...point });
    }
  }
  return merged;
}

function interpolatedFoldedLuminosity(points: readonly FoldedLightPoint[], phase: number): number {
  if (!points.length) return NaN;
  if (points.length === 1) return points[0].luminosity;
  const targetPhase = foldedPhase(phase);
  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1];
    const right = points[i];
    if (targetPhase <= right.phase) {
      const span = right.phase - left.phase || 1;
      const t = (targetPhase - left.phase) / span;
      return left.luminosity + (right.luminosity - left.luminosity) * t;
    }
  }
  const left = points[points.length - 1];
  const right = points[0];
  const shiftedTarget = targetPhase < right.phase ? targetPhase + 1 : targetPhase;
  const span = right.phase + 1 - left.phase || 1;
  const t = (shiftedTarget - left.phase) / span;
  return left.luminosity + (right.luminosity - left.luminosity) * t;
}

export function lightCurveMorphology(rows: readonly Row[]): { skewness: number; acuteness: number } {
  const points = foldedLightCurvePoints(rows);
  const sampleCount = 720;
  if (points.length < 3) return { skewness: 1, acuteness: 1 };
  const samples = Array.from({ length: sampleCount }, (_value, index) => {
    const phase = index / sampleCount;
    return { phase, luminosity: interpolatedFoldedLuminosity(points, phase) };
  }).filter((point) => Number.isFinite(point.luminosity));
  if (samples.length < 3) return { skewness: 1, acuteness: 1 };

  let maxPoint = samples[0];
  let minPoint = samples[0];
  for (const point of samples) {
    if (point.luminosity > maxPoint.luminosity) maxPoint = point;
    if (point.luminosity < minPoint.luminosity) minPoint = point;
  }
  const amplitude = maxPoint.luminosity - minPoint.luminosity;
  if (!(amplitude > 0)) return { skewness: 1, acuteness: 1 };

  const riseFraction = (maxPoint.phase - minPoint.phase + 1) % 1 || 1;
  const midpoint = 0.5 * (maxPoint.luminosity + minPoint.luminosity);
  let brightFraction = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const left = samples[index];
    const right = samples[(index + 1) % samples.length];
    const rightPhase = index === samples.length - 1 ? 1 : right.phase;
    const span = rightPhase - left.phase;
    const leftOffset = left.luminosity - midpoint;
    const rightOffset = right.luminosity - midpoint;
    if (leftOffset >= 0 && rightOffset >= 0) {
      brightFraction += span;
    } else if (leftOffset > 0 || rightOffset > 0) {
      const crossing = span * (Math.abs(leftOffset) / (Math.abs(leftOffset) + Math.abs(rightOffset) || 1));
      brightFraction += leftOffset > 0 ? crossing : span - crossing;
    }
  }
  const boundedRise = Math.min(1, Math.max(1 / samples.length, riseFraction));
  const boundedBright = Math.min(1, Math.max(1 / samples.length, brightFraction));

  return {
    skewness: 1 / boundedRise - 1,
    acuteness: 1 / boundedBright - 1
  };
}

export function luminosityAmplitude(rows: readonly Row[]): number {
  const values = rows
    .map((row) => row.L)
    .filter(Number.isFinite);
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function wrapTwoPi(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

export function computeFourierParameters(phaseRows: readonly Row[]): FourierParameters | null {
  const finiteRows = phaseRows.filter((row) =>
    Number.isFinite(row.tau) && Number.isFinite(row.L)
  );
  const parameterCount = 1 + 2 * FOURIER_HARMONICS;
  if (finiteRows.length < parameterCount) return null;

  const normal = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0));
  const rhs = Array(parameterCount).fill(0);

  for (const row of finiteRows) {
    const basis = fourierBasis(row.tau);
    for (let i = 0; i < parameterCount; i += 1) {
      rhs[i] += basis[i] * row.L;
      for (let j = 0; j < parameterCount; j += 1) normal[i][j] += basis[i] * basis[j];
    }
  }

  const coefficients = solveLinearSystem(normal, rhs);
  if (!coefficients) return null;
  const harmonics = [];
  for (let harmonic = 1; harmonic <= FOURIER_HARMONICS; harmonic += 1) {
    const cosine = coefficients[2 * harmonic - 1];
    const sine = coefficients[2 * harmonic];
    const amplitude = Math.hypot(cosine, sine);
    const phase = Math.atan2(-sine, cosine);
    harmonics.push({ amplitude, phase });
  }
  const [h1, h2, h3, h4, h5, h6, h7] = harmonics;
  if (!h1 || !h2 || !h3 || h1.amplitude <= 0) return null;
  const phases = [NaN, ...harmonics.map((harmonic) => wrapTwoPi(harmonic.phase))];
  const amplitudes = [NaN, ...harmonics.map((harmonic) => harmonic.amplitude)];
  const phiK1 = [NaN, 0, ...harmonics.slice(1).map((harmonic, index) =>
    wrapTwoPi(harmonic.phase - (index + 2) * h1.phase)
  )];
  const amplitudeRatios = [NaN, 1, ...harmonics.slice(1).map((harmonic) => harmonic.amplitude / h1.amplitude)];
  const morphology = lightCurveMorphology(finiteRows);

  return {
    luminosityAmplitude: luminosityAmplitude(finiteRows),
    phi1: phases[1],
    phi2: phases[2],
    phi3: phases[3],
    phi4: phases[4],
    phi5: phases[5],
    phi6: phases[6],
    phi7: phases[7],
    phi21: phiK1[2],
    phi31: phiK1[3],
    phi41: phiK1[4],
    phi51: phiK1[5],
    phi61: phiK1[6],
    phi71: phiK1[7],
    r21: amplitudeRatios[2],
    r31: amplitudeRatios[3],
    r41: amplitudeRatios[4],
    r51: amplitudeRatios[5],
    r61: amplitudeRatios[6],
    r71: amplitudeRatios[7],
    amplitude1: h1.amplitude,
    amplitude2: h2.amplitude,
    amplitude3: h3.amplitude,
    amplitude4: h4?.amplitude ?? 0,
    amplitude5: h5?.amplitude ?? 0,
    amplitude6: h6?.amplitude ?? 0,
    amplitude7: h7?.amplitude ?? 0,
    phases,
    phiK1,
    amplitudes,
    amplitudeRatios,
    skewness: morphology.skewness,
    acuteness: morphology.acuteness,
    coefficients
  };
}

export function hasUsableFourierAmplitudes(fourier: FourierParameters | null, minimum = MIN_FOURIER_AMPLITUDE): fourier is FourierParameters {
  return Boolean(fourier
    && fourier.amplitude1 >= minimum
    && fourier.amplitude2 >= minimum
    && fourier.amplitude3 >= minimum);
}
