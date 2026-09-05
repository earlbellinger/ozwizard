import {
  CHI_PARAMETER_BREAK,
  CHI_PARAMETER_MAX,
  CHI_PARAMETER_MIN,
  CHI_SLIDER_BREAK,
  CHI_SLIDER_MAX,
  CHI_SLIDER_MIN,
  CONTROL_GROUPS,
  RESPONSE_LOG_MIN,
  type ControlDef,
  type ControlParameterKey,
  type ModelParameters,
  type Row,
  type SolveResult
} from "./model";
import { type FourierParameters } from "./fourier";
import { type PhaseAnchor, type PhaseReference, type PhaseResult } from "./phase";

export interface GridRange {
  key: ControlParameterKey;
  lowerSliderValue: number;
  upperSliderValue: number;
  centerSliderValue: number;
  nativeStep: number;
}

export interface GridRangeSamples {
  key: ControlParameterKey;
  samples: number[];
  centerSliderValue: number;
}

export interface GridModelResult {
  id: number;
  parameters: ModelParameters;
  sliderValues: Partial<Record<ControlParameterKey, number>>;
  variedValues: Partial<Record<ControlParameterKey, number>>;
  phaseRows: Row[];
  period: number;
  fourier: FourierParameters | null;
  integrationProvenance?: {
    status: SolveResult["status"];
    message: string;
    statistics: SolveResult["stats"];
    actualEndTau: number | null;
    rowCount: number;
  };
  phaseProvenance?: {
    reason: PhaseResult["reason"];
    period: number;
    rowCount: number;
    archivedRowCount: number;
    reference: PhaseReference | null;
  };
}

export type GridBudget =
  | { mode: "timeout"; timeoutMs: number; modelMsEstimate?: number }
  | { mode: "models"; maxModels: number };

export interface GridComputeRequest {
  requestId: number;
  baseParameters: ModelParameters;
  ranges: GridRange[];
  loopKey: ControlParameterKey;
  budget: GridBudget;
  phase: {
    warmupTau?: number;
    minAmplitude: number;
    selection: "first" | "last";
    anchor: PhaseAnchor;
  };
}

export interface GridProgressMessage {
  type: "grid-progress";
  requestId: number;
  completed: number;
  total: number;
  elapsedMs: number;
}

export interface GridCanceledForCoarseningMessage {
  type: "grid-canceled-for-coarsening";
  requestId: number;
  completed: number;
  total: number;
  elapsedMs: number;
  stride: number;
  estimatedTotalMs: number | null;
}

export interface GridCompleteMessage {
  type: "grid-complete";
  requestId: number;
  results: GridModelResult[];
  pathResults: GridModelResult[];
  total: number;
  attempted: number;
  validPhase: number;
  validFourier: number;
  excludedNonPhase: number;
  phaseUnavailable: number;
  failed: number;
  elapsedMs: number;
  stride: number;
  coarsened: boolean;
  zeroCompletedFallback: boolean;
}

export interface GridCanceledMessage {
  type: "grid-canceled";
  requestId: number;
}

export type GridWorkerMessage =
  | GridProgressMessage
  | GridCanceledForCoarseningMessage
  | GridCompleteMessage
  | GridCanceledMessage;

export interface CoarsenessEstimate {
  stride: number;
  estimatedTotalMs: number | null;
  zeroCompletedFallback: boolean;
}

export interface GridModelCount {
  main: number;
  path: number;
  total: number;
}

export interface GridBudgetCoarsenessEstimate extends CoarsenessEstimate {
  fullModelCount: GridModelCount;
  coarsenedModelCount: GridModelCount;
  targetModelCount: number | null;
}

export interface SliderMeta {
  key: ControlParameterKey;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

const CONTROL_META = new Map<ControlParameterKey, SliderMeta>();

Object.values(CONTROL_GROUPS).forEach((controls: ControlDef[]) => {
  controls.forEach(([key, _symbol, _name, min, max, step, defaultValue]) => {
    CONTROL_META.set(key, { key, min, max, step, defaultValue });
  });
});

export function sliderMeta(key: ControlParameterKey): SliderMeta {
  const meta = CONTROL_META.get(key);
  if (!meta) throw new Error(`Missing control metadata for ${String(key)}`);
  return meta;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  const decimal = text.split(".")[1];
  return decimal ? decimal.length : 0;
}

export function roundToNativeStep(value: number, step: number): number {
  const digits = Math.min(12, Math.max(0, decimalPlaces(step) + 2));
  return Number(value.toFixed(digits));
}

export function sliderValueFromParameter(key: ControlParameterKey, parameters: ModelParameters): number {
  return sliderValueFromNumericValue(key, Number(parameters[key] ?? (key === "alphaP" ? 0 : undefined)));
}

export function parameterValueFromSlider(key: ControlParameterKey, sliderValue: number): number {
  const meta = sliderMeta(key);
  const value = clampToMeta(sliderValue, meta);
  if (key === "tEnd") return Math.min(1000, Math.max(1, 10 ** value));
  if (key === "zeta") return 10 ** value;
  if (key === "zetac") return value <= RESPONSE_LOG_MIN + 1e-12 ? 0 : 10 ** value;
  if (key === "m") return chiFromSliderValue(value);
  return value;
}

export function sliderValueFromNumericValue(key: ControlParameterKey, value: number): number {
  const meta = sliderMeta(key);
  if (key === "tEnd") return clampToMeta(Math.log10(Math.max(1, value)), meta);
  if (key === "zeta") return clampToMeta(Math.log10(Math.max(10 ** RESPONSE_LOG_MIN, value)), meta);
  if (key === "zetac") {
    if (value <= 0 || !Number.isFinite(value)) return RESPONSE_LOG_MIN;
    return clampToMeta(Math.log10(value), meta);
  }
  if (key === "m") return clampToMeta(sliderValueFromChi(value), meta);
  return clampToMeta(value, meta);
}

export function normalizeGridRange(range: GridRange): GridRange {
  const meta = sliderMeta(range.key);
  const low = Math.min(range.lowerSliderValue, range.upperSliderValue);
  const high = Math.max(range.lowerSliderValue, range.upperSliderValue);
  return {
    ...range,
    lowerSliderValue: clampToMeta(low, meta),
    upperSliderValue: clampToMeta(high, meta),
    centerSliderValue: clampToMeta(range.centerSliderValue, meta),
    nativeStep: meta.step
  };
}

export function defaultGridRange(key: ControlParameterKey, currentSliderValue: number): GridRange {
  const meta = sliderMeta(key);
  const current = clampToMeta(currentSliderValue, meta);
  const distanceToMin = Math.abs(current - meta.min);
  const distanceToMax = Math.abs(meta.max - current);
  const target = distanceToMax >= distanceToMin ? meta.max : meta.min;
  const edge = current + (target - current) / 2;
  return normalizeGridRange({
    key,
    lowerSliderValue: Math.min(current, edge),
    upperSliderValue: Math.max(current, edge),
    centerSliderValue: current,
    nativeStep: meta.step
  });
}

export function generateSliderSamples(rangeInput: GridRange, stride = 1): number[] {
  const range = normalizeGridRange(rangeInput);
  const meta = sliderMeta(range.key);
  const step = meta.step;
  const firstIndex = Math.ceil((range.lowerSliderValue - meta.min) / step - 1e-9);
  const lastIndex = Math.floor((range.upperSliderValue - meta.min) / step + 1e-9);
  const effectiveStride = Math.max(1, Math.floor(stride));
  const samples: number[] = [];
  for (let index = firstIndex; index <= lastIndex; index += effectiveStride) {
    samples.push(roundToNativeStep(meta.min + index * step, step));
  }
  const upper = roundToNativeStep(meta.min + lastIndex * step, step);
  if (Number.isFinite(upper) && samples.at(-1) !== upper) samples.push(upper);
  return [...new Set(samples.filter((sample) => sample >= meta.min - 1e-9 && sample <= meta.max + 1e-9))];
}

export function centerSliderSample(rangeInput: GridRange): number {
  const range = normalizeGridRange(rangeInput);
  const samples = generateSliderSamples(range, 1);
  if (!samples.length) return roundToNativeStep(range.centerSliderValue, range.nativeStep);
  return samples.reduce((best, sample) =>
    Math.abs(sample - range.centerSliderValue) < Math.abs(best - range.centerSliderValue) ? sample : best
  , samples[0]);
}

export function meanSliderSample(rangeInput: GridRange): number {
  const range = normalizeGridRange(rangeInput);
  return Number(((range.lowerSliderValue + range.upperSliderValue) / 2).toFixed(12));
}

export function fallbackSliderSamples(rangeInput: GridRange, selected: boolean): number[] {
  const range = normalizeGridRange(rangeInput);
  if (!selected) return [centerSliderSample(range)];
  const low = roundToNativeStep(range.lowerSliderValue, range.nativeStep);
  const center = centerSliderSample(range);
  const high = roundToNativeStep(range.upperSliderValue, range.nativeStep);
  return [...new Set([low, center, high])].sort((a, b) => a - b);
}

export function estimateGridCoarseness(
  total: number,
  completed: number,
  elapsedMs: number,
  dimensionCount: number,
  targetMs = 1000
): CoarsenessEstimate {
  if (completed <= 0 || elapsedMs <= 0 || total <= 0) {
    return { stride: 1, estimatedTotalMs: null, zeroCompletedFallback: true };
  }
  const estimatedTotalMs = (elapsedMs * total) / completed;
  const reduction = Math.max(1, estimatedTotalMs / targetMs);
  const exponent = 1 / Math.max(1, dimensionCount);
  return {
    stride: Math.max(1, Math.ceil(reduction ** exponent)),
    estimatedTotalMs,
    zeroCompletedFallback: false
  };
}

export function gridModelCountForStride(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  options: { stride?: number; zeroCompletedFallback?: boolean } = {}
): GridModelCount {
  const main = gridTotal(buildRangeSamples(ranges, loopKey, options));
  const path = ranges.length <= 1 ? 0 : gridTotal(buildLoopPathSamples(ranges, loopKey, options));
  return { main, path, total: main + path };
}

export function estimateGridBudgetFromModelCount(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  maxModels: number
): GridBudgetCoarsenessEstimate {
  return estimateGridBudgetForTargetModelCount(ranges, loopKey, Math.max(1, Math.floor(maxModels)));
}

export function estimateGridBudgetFromTiming(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  completed: number,
  elapsedMs: number,
  timeoutMs: number
): GridBudgetCoarsenessEstimate {
  const fullModelCount = gridModelCountForStride(ranges, loopKey);
  if (completed <= 0 || elapsedMs <= 0 || timeoutMs <= 0) {
    return {
      stride: 1,
      estimatedTotalMs: null,
      zeroCompletedFallback: true,
      fullModelCount,
      coarsenedModelCount: gridModelCountForStride(ranges, loopKey, { zeroCompletedFallback: true }),
      targetModelCount: null
    };
  }
  const modelMs = elapsedMs / completed;
  const targetModelCount = Math.max(1, Math.floor(timeoutMs / Math.max(modelMs, 1e-9)));
  return {
    ...estimateGridBudgetForTargetModelCount(ranges, loopKey, targetModelCount),
    estimatedTotalMs: modelMs * fullModelCount.total
  };
}

function estimateGridBudgetForTargetModelCount(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  targetModelCount: number
): GridBudgetCoarsenessEstimate {
  const fullModelCount = gridModelCountForStride(ranges, loopKey);
  if (fullModelCount.total <= targetModelCount) {
    return {
      stride: 1,
      estimatedTotalMs: null,
      zeroCompletedFallback: false,
      fullModelCount,
      coarsenedModelCount: fullModelCount,
      targetModelCount
    };
  }
  let bestStride = 1;
  let bestCount = fullModelCount;
  const maxStride = maxUsefulGridStride(ranges);
  for (let stride = 2; stride <= maxStride; stride += 1) {
    const count = gridModelCountForStride(ranges, loopKey, { stride });
    if (count.total < bestCount.total) {
      bestStride = stride;
      bestCount = count;
    }
    if (count.total <= targetModelCount) {
      return {
        stride,
        estimatedTotalMs: null,
        zeroCompletedFallback: false,
        fullModelCount,
        coarsenedModelCount: count,
        targetModelCount
      };
    }
  }
  return {
    stride: bestStride,
    estimatedTotalMs: null,
    zeroCompletedFallback: false,
    fullModelCount,
    coarsenedModelCount: bestCount,
    targetModelCount
  };
}

function maxUsefulGridStride(ranges: readonly GridRange[]): number {
  return Math.max(1, ...ranges.map((range) => generateSliderSamples(range, 1).length));
}

export function buildRangeSamples(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  options: { stride?: number; zeroCompletedFallback?: boolean } = {}
): GridRangeSamples[] {
  return ranges.map((range) => ({
    key: range.key,
    centerSliderValue: normalizeGridRange(range).centerSliderValue,
    samples: addCenterSample(
      options.zeroCompletedFallback
        ? fallbackSliderSamples(range, range.key === loopKey)
        : generateSliderSamples(range, options.stride ?? 1),
      range
    )
  }));
}

export function buildLoopPathSamples(
  ranges: readonly GridRange[],
  loopKey: ControlParameterKey,
  options: { stride?: number; zeroCompletedFallback?: boolean } = {}
): GridRangeSamples[] {
  return ranges.map((rangeInput) => {
    const range = normalizeGridRange(rangeInput);
    const mean = meanSliderSample(range);
    const samples = options.zeroCompletedFallback
      ? fallbackSliderSamples(range, true)
      : generateSliderSamples(range, options.stride ?? 1);
    return {
      key: range.key,
      centerSliderValue: mean,
      samples: range.key === loopKey ? samples : [mean]
    };
  });
}

export function gridTotal(samples: readonly GridRangeSamples[]): number {
  return samples.reduce((total, item) => total * Math.max(1, item.samples.length), 1);
}

function clampToMeta(value: number, meta: SliderMeta): number {
  return Math.min(meta.max, Math.max(meta.min, value));
}

function sliderValueFromChi(value: number): number {
  const chi = Math.min(CHI_PARAMETER_MAX, Math.max(CHI_PARAMETER_MIN, value));
  if (chi <= CHI_PARAMETER_BREAK) {
    const fraction = (chi - CHI_PARAMETER_MIN) / (CHI_PARAMETER_BREAK - CHI_PARAMETER_MIN);
    return CHI_SLIDER_MIN + fraction * (CHI_SLIDER_BREAK - CHI_SLIDER_MIN);
  }
  const logMin = Math.log(CHI_PARAMETER_BREAK);
  const logMax = Math.log(CHI_PARAMETER_MAX);
  const fraction = (Math.log(chi) - logMin) / (logMax - logMin);
  return CHI_SLIDER_BREAK + fraction * (CHI_SLIDER_MAX - CHI_SLIDER_BREAK);
}

function chiFromSliderValue(value: number): number {
  const slider = Math.min(CHI_SLIDER_MAX, Math.max(CHI_SLIDER_MIN, value));
  if (slider <= CHI_SLIDER_BREAK) {
    const fraction = (slider - CHI_SLIDER_MIN) / (CHI_SLIDER_BREAK - CHI_SLIDER_MIN);
    return CHI_PARAMETER_MIN + fraction * (CHI_PARAMETER_BREAK - CHI_PARAMETER_MIN);
  }
  const fraction = (slider - CHI_SLIDER_BREAK) / (CHI_SLIDER_MAX - CHI_SLIDER_BREAK);
  return CHI_PARAMETER_BREAK * (CHI_PARAMETER_MAX / CHI_PARAMETER_BREAK) ** fraction;
}

function addCenterSample(samples: number[], range: GridRange): number[] {
  const center = centerSliderSample(range);
  return [...new Set([...samples, center])].sort((a, b) => a - b);
}
