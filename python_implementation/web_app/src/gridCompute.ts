import { computeFourierParameters, hasUsableFourierAmplitudes } from "./fourier";
import {
  buildLoopPathSamples,
  buildRangeSamples,
  estimateGridBudgetFromModelCount,
  estimateGridBudgetFromTiming,
  gridTotal,
  parameterValueFromSlider,
  type GridBudgetCoarsenessEstimate,
  type GridComputeRequest,
  type GridModelResult,
  type GridRangeSamples,
  type GridWorkerMessage
} from "./grid";
import { linearDynamicPeriod, type ControlParameterKey, type ModelParameters, type Row, solveModel } from "./model";
import { buildTwoCyclePhase, guidedMinSeparationFromPeriod } from "./phase";
import { isTimeWindowReason } from "./displayWindow";

interface GridRunStats {
  results: GridModelResult[];
  total: number;
  attempted: number;
  validPhase: number;
  validFourier: number;
  excludedNonPhase: number;
  phaseUnavailable: number;
  failed: number;
  elapsedMs: number;
  completed: boolean;
}

export interface GridComputeCallbacks {
  post: (message: GridWorkerMessage) => void;
  isCanceled: () => boolean;
}

export async function computeGridWithMessages(request: GridComputeRequest, callbacks: GridComputeCallbacks): Promise<void> {
  const budget = request.budget ?? { mode: "timeout" as const, timeoutMs: 2000 };
  const nativeSamples = buildRangeSamples(request.ranges, request.loopKey, { stride: 1 });
  if (budget.mode === "models") {
    const estimate = estimateGridBudgetFromModelCount(request.ranges, request.loopKey, budget.maxModels);
    if (estimate.stride === 1 && estimate.coarsenedModelCount.total === estimate.fullModelCount.total) {
      const native = await runGridPass(request, nativeSamples, callbacks);
      if (callbacks.isCanceled()) {
        callbacks.post({ type: "grid-canceled", requestId: request.requestId });
        return;
      }
      await postGridCompleteFromPass(request, native, 1, false, false, callbacks);
      return;
    }
    postCoarsening(request, 0, gridTotal(nativeSamples), 0, estimate, callbacks);
    await runCoarsenedGrid(request, estimate, callbacks);
    return;
  }

  const native = await runGridPass(request, nativeSamples, callbacks, budget.timeoutMs);
  if (callbacks.isCanceled()) {
    callbacks.post({ type: "grid-canceled", requestId: request.requestId });
    return;
  }
  const estimate = estimateGridBudgetFromTiming(request.ranges, request.loopKey, native.attempted, native.elapsedMs, budget.timeoutMs);

  if (native.completed && estimate.stride === 1 && !estimate.zeroCompletedFallback) {
    await postGridCompleteFromPass(request, native, 1, false, false, callbacks);
    return;
  }

  postCoarsening(request, native.attempted, native.total, native.elapsedMs, estimate, callbacks);
  await runCoarsenedGrid(request, estimate, callbacks);
}

function postCoarsening(
  request: GridComputeRequest,
  completed: number,
  total: number,
  elapsedMs: number,
  estimate: GridBudgetCoarsenessEstimate,
  callbacks: GridComputeCallbacks
): void {
  callbacks.post({
    type: "grid-canceled-for-coarsening",
    requestId: request.requestId,
    completed,
    total,
    elapsedMs,
    stride: estimate.stride,
    estimatedTotalMs: estimate.estimatedTotalMs
  });
}

async function runCoarsenedGrid(
  request: GridComputeRequest,
  estimate: GridBudgetCoarsenessEstimate,
  callbacks: GridComputeCallbacks
): Promise<void> {
  const coarsenedSamples = buildRangeSamples(request.ranges, request.loopKey, {
    stride: estimate.stride,
    zeroCompletedFallback: estimate.zeroCompletedFallback
  });
  const coarsened = await runGridPass(request, coarsenedSamples, callbacks);
  if (callbacks.isCanceled()) {
    callbacks.post({ type: "grid-canceled", requestId: request.requestId });
    return;
  }
  await postGridCompleteFromPass(request, coarsened, estimate.stride, true, estimate.zeroCompletedFallback, callbacks);
}

async function postGridCompleteFromPass(
  request: GridComputeRequest,
  stats: GridRunStats,
  stride: number,
  coarsened: boolean,
  zeroCompletedFallback: boolean,
  callbacks: GridComputeCallbacks
): Promise<void> {
  const path = request.ranges.length <= 1
    ? stats
    : await runLoopPathPass(request, callbacks, stride, zeroCompletedFallback);
  if (callbacks.isCanceled()) {
    callbacks.post({ type: "grid-canceled", requestId: request.requestId });
    return;
  }
  postComplete(request, stats, path.results, stride, coarsened, zeroCompletedFallback, callbacks);
}

async function runLoopPathPass(
  request: GridComputeRequest,
  callbacks: GridComputeCallbacks,
  stride = 1,
  zeroCompletedFallback = false
): Promise<GridRunStats> {
  const pathSamples = buildLoopPathSamples(request.ranges, request.loopKey, { stride, zeroCompletedFallback });
  return runGridPass(request, pathSamples, callbacks, undefined, false);
}

async function runGridPass(
  request: GridComputeRequest,
  samples: readonly GridRangeSamples[],
  callbacks: GridComputeCallbacks,
  deadlineMs?: number,
  reportProgress = true
): Promise<GridRunStats> {
  const started = performance.now();
  const total = gridTotal(samples);
  const stats: GridRunStats = {
    results: [],
    total,
    attempted: 0,
    validPhase: 0,
    validFourier: 0,
    excludedNonPhase: 0,
    phaseUnavailable: 0,
    failed: 0,
    elapsedMs: 0,
    completed: true
  };

  if (!samples.length || total <= 0) {
    stats.elapsedMs = performance.now() - started;
    return stats;
  }

  for (const sliderValues of sliderCombinations(samples)) {
    if (callbacks.isCanceled()) {
      stats.completed = false;
      break;
    }
    const elapsed = performance.now() - started;
    if (deadlineMs !== undefined && elapsed > deadlineMs && stats.attempted < total) {
      stats.completed = false;
      break;
    }
    addGridModel(request, samples, sliderValues, stats);
    stats.attempted += 1;

    if (stats.attempted % 4 === 0 || stats.attempted === total) {
      stats.elapsedMs = performance.now() - started;
      if (reportProgress) {
        callbacks.post({
          type: "grid-progress",
          requestId: request.requestId,
          completed: stats.attempted,
          total,
          elapsedMs: stats.elapsedMs
        });
      }
      await yieldToBrowser();
    }
  }

  stats.elapsedMs = performance.now() - started;
  return stats;
}

function addGridModel(
  request: GridComputeRequest,
  samples: readonly GridRangeSamples[],
  sliderValues: Partial<Record<ControlParameterKey, number>>,
  stats: GridRunStats
): void {
  const parameters = { ...request.baseParameters } as ModelParameters;
  const variedValues: Partial<Record<ControlParameterKey, number>> = {};
  for (const item of samples) {
    const sliderValue = sliderValues[item.key];
    if (sliderValue === undefined) continue;
    const parameterValue = parameterValueFromSlider(item.key, sliderValue);
    setNumericParameter(parameters, item.key, parameterValue);
    variedValues[item.key] = parameterValue;
  }

  try {
    const solved = solveModel(parameters);
    if (isTimeWindowReason(solved.message) || isTimeWindowReason(solved.status)) {
      stats.excludedNonPhase += 1;
      return;
    }
    const phase = buildTwoCyclePhase(solved.rows, {
      ...request.phase,
      minSeparation: guidedMinSeparationFromPeriod(solved.rows, linearDynamicPeriod(parameters))
    });
    if (phase.reason !== "ok" || !phase.period || phase.rows.length < 8) {
      stats.phaseUnavailable += 1;
      return;
    }
    const phaseRows = strideDownsample(phase.rows, 420);
    const rawFourier = computeFourierParameters(phase.rows);
    const fourier = hasUsableFourierAmplitudes(rawFourier) ? rawFourier : null;
    if (fourier) stats.validFourier += 1;
    stats.validPhase += 1;
    stats.results.push({
      id: stats.results.length,
      parameters,
      sliderValues: { ...sliderValues },
      variedValues,
      phaseRows,
      period: phase.period,
      fourier
    });
  } catch (_error) {
    stats.failed += 1;
  }
}

function setNumericParameter(parameters: ModelParameters, key: ControlParameterKey, value: number): void {
  (parameters as unknown as Record<ControlParameterKey, number>)[key] = value;
}

function* sliderCombinations(samples: readonly GridRangeSamples[]): Generator<Partial<Record<ControlParameterKey, number>>> {
  function* visit(index: number, current: Partial<Record<ControlParameterKey, number>>): Generator<Partial<Record<ControlParameterKey, number>>> {
    if (index >= samples.length) {
      yield { ...current };
      return;
    }
    const item = samples[index];
    for (const sample of item.samples) {
      current[item.key] = sample;
      yield* visit(index + 1, current);
    }
    delete current[item.key];
  }
  yield* visit(0, {});
}

function strideDownsample<T>(rows: readonly T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return [...rows];
  const stride = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_row, index) => index % stride === 0);
  const last = rows.at(-1);
  if (last && sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function postComplete(
  request: GridComputeRequest,
  stats: GridRunStats,
  pathResults: GridModelResult[],
  stride: number,
  coarsened: boolean,
  zeroCompletedFallback: boolean,
  callbacks: GridComputeCallbacks
): void {
  callbacks.post({
    type: "grid-complete",
    requestId: request.requestId,
    results: stats.results,
    pathResults,
    total: stats.total,
    attempted: stats.attempted,
    validPhase: stats.validPhase,
    validFourier: stats.validFourier,
    excludedNonPhase: stats.excludedNonPhase,
    phaseUnavailable: stats.phaseUnavailable,
    failed: stats.failed,
    elapsedMs: stats.elapsedMs,
    stride,
    coarsened,
    zeroCompletedFallback
  });
}
