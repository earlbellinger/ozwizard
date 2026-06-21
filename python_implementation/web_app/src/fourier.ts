import { type Row } from "./model";

const TWO_PI = 2 * Math.PI;
const HARMONICS = 3;

export const MIN_FOURIER_AMPLITUDE = 1e-4;

export interface FourierParameters {
  luminosityAmplitude: number;
  phi1: number;
  phi2: number;
  phi3: number;
  phi21: number;
  phi31: number;
  r21: number;
  r31: number;
  amplitude1: number;
  amplitude2: number;
  amplitude3: number;
  coefficients: number[];
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
  for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
    const angle = TWO_PI * harmonic * wrappedPhase;
    basis.push(Math.cos(angle), Math.sin(angle));
  }
  return basis;
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
  const parameterCount = 1 + 2 * HARMONICS;
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
  for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
    const cosine = coefficients[2 * harmonic - 1];
    const sine = coefficients[2 * harmonic];
    const amplitude = Math.hypot(cosine, sine);
    const phase = Math.atan2(-sine, cosine);
    harmonics.push({ amplitude, phase });
  }
  const [h1, h2, h3] = harmonics;
  if (!h1 || !h2 || !h3 || h1.amplitude <= 0) return null;

  return {
    luminosityAmplitude: luminosityAmplitude(finiteRows),
    phi1: wrapTwoPi(h1.phase),
    phi2: wrapTwoPi(h2.phase),
    phi3: wrapTwoPi(h3.phase),
    phi21: wrapTwoPi(h2.phase - 2 * h1.phase),
    phi31: wrapTwoPi(h3.phase - 3 * h1.phase),
    r21: h2.amplitude / h1.amplitude,
    r31: h3.amplitude / h1.amplitude,
    amplitude1: h1.amplitude,
    amplitude2: h2.amplitude,
    amplitude3: h3.amplitude,
    coefficients
  };
}

export function hasUsableFourierAmplitudes(fourier: FourierParameters | null, minimum = MIN_FOURIER_AMPLITUDE): fourier is FourierParameters {
  return Boolean(fourier
    && fourier.amplitude1 >= minimum
    && fourier.amplitude2 >= minimum
    && fourier.amplitude3 >= minimum);
}
