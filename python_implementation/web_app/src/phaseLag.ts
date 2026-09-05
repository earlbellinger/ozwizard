import { temperatureRatio, type ControlParameterKey, type ModelParameters, type Row } from "./model";
import { type GridModelResult } from "./grid";

export type PhaseLagQuantityKey = "R" | "L" | "V" | "T" | "H" | "Uc";
export type PhaseLagPairId =
  | "R-L"
  | "R-V"
  | "R-T"
  | "R-H"
  | "R-Uc"
  | "L-V"
  | "L-T"
  | "H-L"
  | "L-Uc"
  | "V-T"
  | "V-H"
  | "V-Uc"
  | "T-H"
  | "T-Uc"
  | "H-Uc";

export interface PhaseLagPair {
  id: PhaseLagPairId;
  reference: PhaseLagQuantityKey;
  target: PhaseLagQuantityKey;
}

export interface PhaseLagPoint {
  x: number;
  lag: number;
  result: GridModelResult;
}

export const PHASE_LAG_QUANTITIES = ["R", "L", "V", "T", "H", "Uc"] as const satisfies readonly PhaseLagQuantityKey[];

export const PHASE_LAG_PAIRS: readonly PhaseLagPair[] = [
  { id: "R-L", reference: "R", target: "L" },
  { id: "R-V", reference: "R", target: "V" },
  { id: "R-T", reference: "R", target: "T" },
  { id: "R-H", reference: "R", target: "H" },
  { id: "R-Uc", reference: "R", target: "Uc" },
  { id: "L-V", reference: "L", target: "V" },
  { id: "L-T", reference: "L", target: "T" },
  { id: "H-L", reference: "H", target: "L" },
  { id: "L-Uc", reference: "L", target: "Uc" },
  { id: "V-T", reference: "V", target: "T" },
  { id: "V-H", reference: "V", target: "H" },
  { id: "V-Uc", reference: "V", target: "Uc" },
  { id: "T-H", reference: "T", target: "H" },
  { id: "T-Uc", reference: "T", target: "Uc" },
  { id: "H-Uc", reference: "H", target: "Uc" }
];

export const PHASE_LAG_DEFAULT_PAIR_IDS = new Set<PhaseLagPairId>(["R-L", "R-V", "R-H", "H-L", "H-Uc"]);

interface PhaseLagSample {
  phase: number;
  value: number;
}

export function phaseLagQuantityValue(row: Row, key: PhaseLagQuantityKey, parameters: ModelParameters): number {
  if (key === "T") return thermodynamicTemperatureRatio(row, parameters);
  const value = row[key];
  return Number.isFinite(value) ? value : NaN;
}

export function thermodynamicTemperatureRatio(row: Row, parameters: ModelParameters): number {
  if (!Number.isFinite(row.R + row.H) || row.R <= 0 || row.H <= 0) return NaN;
  let value: number;
  try {
    value = temperatureRatio(row.R, row.H, parameters);
  } catch {
    return NaN;
  }
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

export function signedPhaseLag(referencePhase: number, targetPhase: number): number {
  if (!Number.isFinite(referencePhase + targetPhase)) return NaN;
  let lag = targetPhase - referencePhase;
  while (lag > 0.5) lag -= 1;
  while (lag < -0.5) lag += 1;
  return lag;
}

export function refinedMaximumPhase(
  rows: readonly Row[],
  key: PhaseLagQuantityKey,
  parameters: ModelParameters
): number | null {
  const samples = rows
    .filter((row) => row.tau >= 0 && row.tau < 1)
    .map((row) => ({ phase: row.tau, value: phaseLagQuantityValue(row, key, parameters) }))
    .filter((sample): sample is PhaseLagSample => Number.isFinite(sample.phase + sample.value))
    .sort((a, b) => a.phase - b.phase);
  if (samples.length < 3) return null;

  const min = Math.min(...samples.map((sample) => sample.value));
  const max = Math.max(...samples.map((sample) => sample.value));
  const scale = Math.max(1, Math.abs(min), Math.abs(max));
  if (!Number.isFinite(max - min) || (max - min) / scale < 1e-9) return null;

  let bestIndex = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].value > samples[bestIndex].value) bestIndex = index;
  }

  const previousIndex = bestIndex === 0 ? samples.length - 1 : bestIndex - 1;
  const nextIndex = bestIndex === samples.length - 1 ? 0 : bestIndex + 1;
  const center = samples[bestIndex];
  const previous = samples[previousIndex];
  const next = samples[nextIndex];
  const x0 = previous.phase < center.phase ? previous.phase - center.phase : previous.phase - center.phase - 1;
  const x2 = next.phase > center.phase ? next.phase - center.phase : next.phase - center.phase + 1;
  const y0 = previous.value - center.value;
  const y2 = next.value - center.value;
  if (!(x0 < 0 && x2 > 0)) return phaseModOne(center.phase);

  const slope0 = y0 / x0;
  const a = (slope0 - y2 / x2) / (x0 - x2);
  const b = slope0 - a * x0;
  if (!Number.isFinite(a + b) || a >= 0 || Math.abs(a) < 1e-14) return phaseModOne(center.phase);

  const vertex = -b / (2 * a);
  if (!Number.isFinite(vertex) || vertex < x0 || vertex > x2) return phaseModOne(center.phase);
  return phaseModOne(center.phase + vertex);
}

export function phaseLagForPair(rows: readonly Row[], pair: PhaseLagPair, parameters: ModelParameters): number | null {
  const referencePhase = refinedMaximumPhase(rows, pair.reference, parameters);
  const targetPhase = refinedMaximumPhase(rows, pair.target, parameters);
  if (referencePhase === null || targetPhase === null) return null;
  const lag = signedPhaseLag(referencePhase, targetPhase);
  return Number.isFinite(lag) ? lag : null;
}

export function phaseLagSeriesPoints(
  results: readonly GridModelResult[],
  pair: PhaseLagPair,
  loopKey: ControlParameterKey
): PhaseLagPoint[] {
  return results
    .map((result) => {
      const x = result.sliderValues[loopKey];
      if (x === undefined || !Number.isFinite(x)) return null;
      const lag = phaseLagForPair(result.phaseRows, pair, result.parameters);
      return lag === null ? null : { x, lag, result };
    })
    .filter((point): point is PhaseLagPoint => Boolean(point))
    .sort((a, b) => a.x - b.x);
}

function phaseModOne(value: number): number {
  return ((value % 1) + 1) % 1;
}
