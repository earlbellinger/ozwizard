import {
  COLORS,
  CONTROL_GROUPS,
  DEFAULT_PRESET_NAME,
  DERIVED_DESCRIPTIONS,
  PARAMETER_DESCRIPTIONS,
  PRESETS,
  TEX,
  type ControlParameterKey,
  type ControlDef,
  type ModelParameters,
  type PhaseMode,
  type Row,
  sample,
  solveModel
} from "./model";
import { buildTwoCyclePhase, type PhaseResult } from "./phase";
import { SOLVER_NAMES, type SolverName } from "./solvers";

declare global {
  interface Window {
    MathJax?: {
      startup?: { promise?: Promise<void> };
      typesetClear?: (elements?: Element[]) => void;
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

let state: ModelParameters = { ...PRESETS[DEFAULT_PRESET_NAME] };
let selectedPreset = DEFAULT_PRESET_NAME;
let activePreset = DEFAULT_PRESET_NAME;
let latestRows: Row[] = [];
let latestResult = solveModel(state);
let debounceTimer = 0;
let mathTypesetTimer = 0;
let mathTypesetRunning = false;
let mathTypesetPending = false;

const controlElements = new Map<ControlParameterKey, HTMLInputElement>();
const TAU_TICKS = [1, 3, 10, 30, 100, 300, 1000];
const THEME = {
  axisGrid: "#26334E",
  axisText: "#A8B4C7",
  axisBorder: "#526489",
  selectionFill: "rgba(158, 167, 255, 0.16)",
  selectionStroke: "#9EA7FF",
  neutralSymbol: "#C0CAE8"
} as const;

type PlotBox = { left: number; top: number; width: number; height: number };
type NumericRange = [number, number];
type InteractivePlotId = "time" | "lum";
type ToggleSeriesKey = "R" | "V" | "H" | "Uc" | "L" | "Lr" | "Lc";

interface PlotView {
  xlim?: NumericRange;
  ylim?: NumericRange;
}

interface PlotRenderState {
  plotId?: InteractivePlotId;
  plot: PlotBox;
  xlim: NumericRange;
  ylim: NumericRange;
}

interface PlotSelection {
  plotId: InteractivePlotId;
  canvasId: string;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const INTERACTIVE_CANVASES: Record<string, InteractivePlotId> = {
  timeCanvas: "time",
  lumCanvas: "lum"
};

const plotViews: Record<InteractivePlotId, PlotView> = {
  time: {},
  lum: {}
};

const plotVisibility: Record<InteractivePlotId, Record<string, boolean>> = {
  time: { R: true, V: true, H: true, Uc: true },
  lum: { L: true, Lr: true, Lc: true }
};

const plotRenderStates = new Map<string, PlotRenderState>();
let activeSelection: PlotSelection | null = null;
const DENSE_ENVELOPE_POINTS_PER_PIXEL = 2.25;

function fmt(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function queueMathTypeset(): void {
  window.clearTimeout(mathTypesetTimer);
  mathTypesetTimer = window.setTimeout(() => {
    void runMathTypeset();
  }, 80);
}

async function runMathTypeset(): Promise<void> {
  if (mathTypesetRunning) {
    mathTypesetPending = true;
    return;
  }
  const root = document.querySelector<HTMLElement>(".app-shell");
  const mathJax = window.MathJax;
  if (!root || !mathJax?.typesetPromise) return;
  mathTypesetRunning = true;
  try {
    await mathJax.startup?.promise;
    mathJax.typesetClear?.([root]);
    await mathJax.typesetPromise([root]);
  } catch (error) {
    console.warn("MathJax typeset failed", error);
  } finally {
    mathTypesetRunning = false;
    if (mathTypesetPending) {
      mathTypesetPending = false;
      queueMathTypeset();
    }
  }
}

function valuesMatch(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-12;
  return a === b;
}

function stateMatchesPreset(name: string): boolean {
  const preset = PRESETS[name];
  return (Object.keys(preset) as Array<keyof ModelParameters>).every((key) => valuesMatch(state[key], preset[key]));
}

function refreshActivePreset(): void {
  activePreset = Object.keys(PRESETS).find((name) => stateMatchesPreset(name)) || "Custom";
  updatePresetButtons();
  updateResetButtons();
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function buildControls(): void {
  buildPresetButtons();
  buildSolverButtons();
  buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
  buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
  buildSliderGroup("integrationControls", CONTROL_GROUPS.integration);
  buildParameterTable();

  const variableM = el<HTMLInputElement>("variableM");
  variableM.checked = state.variableM;
  variableM.addEventListener("change", (event) => {
    state.variableM = (event.target as HTMLInputElement).checked;
    refreshActivePreset();
    scheduleSolve();
  });

  const runUntilStable = el<HTMLInputElement>("runUntilStable");
  runUntilStable.checked = state.runUntilStable;
  runUntilStable.addEventListener("change", (event) => {
    state.runUntilStable = (event.target as HTMLInputElement).checked;
    refreshActivePreset();
    scheduleSolve();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-phase-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.phaseMode = button.dataset.phaseMode === "final" ? "final" : "reference";
      updatePhaseModeButtons();
      refreshActivePreset();
      drawAll();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      state.driver = button.dataset.driver === "abs-v" ? "abs-v" : "h";
      updateDriverButtons();
      refreshActivePreset();
      scheduleSolve();
    });
  });

  el<HTMLButtonElement>("resetPreset").addEventListener("click", () => applyPreset(selectedPreset));
  el<HTMLButtonElement>("downloadCsv").addEventListener("click", downloadCsv);
  setupInteractivePlots();
  window.addEventListener("resize", drawAll);
  updateDriverButtons();
  updatePhaseModeButtons();
  updateSolverButtons();
  updateAllSliderLabels();
  updateResetButtons();
}

function setupInteractivePlots(): void {
  Object.entries(INTERACTIVE_CANVASES).forEach(([canvasId, plotId]) => {
    const canvas = el<HTMLCanvasElement>(canvasId);
    canvas.classList.add("interactive-canvas");
    canvas.addEventListener("pointerdown", (event) => beginPlotSelection(event, canvasId, plotId));
    canvas.addEventListener("pointermove", (event) => updatePlotSelection(event, canvasId));
    canvas.addEventListener("pointerup", (event) => finishPlotSelection(event, canvasId));
    canvas.addEventListener("pointercancel", (event) => cancelPlotSelection(event, canvasId));
    canvas.addEventListener("dblclick", () => resetPlotView(plotId));
    canvas.addEventListener("wheel", (event) => zoomPlotWithWheel(event, canvasId, plotId), { passive: false });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-plot-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      const plotId = button.dataset.plotReset as InteractivePlotId | undefined;
      if (plotId) resetPlotView(plotId);
    });
  });
  updatePlotResetButtons();
}

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPointToPlot(point: { x: number; y: number }, plot: PlotBox): { x: number; y: number } {
  return {
    x: clamp(point.x, plot.left, plot.left + plot.width),
    y: clamp(point.y, plot.top, plot.top + plot.height)
  };
}

function pointInPlot(point: { x: number; y: number }, plot: PlotBox): boolean {
  return point.x >= plot.left && point.x <= plot.left + plot.width && point.y >= plot.top && point.y <= plot.top + plot.height;
}

function xFromPixel(render: PlotRenderState, x: number): number {
  const f = (x - render.plot.left) / render.plot.width;
  return render.xlim[0] + f * (render.xlim[1] - render.xlim[0]);
}

function yFromPixel(render: PlotRenderState, y: number): number {
  const f = 1 - (y - render.plot.top) / render.plot.height;
  return render.ylim[0] + f * (render.ylim[1] - render.ylim[0]);
}

function sortedRange(a: number, b: number): NumericRange {
  return a <= b ? [a, b] : [b, a];
}

function validRange(rangeValue: NumericRange, minimumSpan = 1e-9): NumericRange | undefined {
  const [min, max] = rangeValue;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < minimumSpan) return undefined;
  return rangeValue;
}

function beginPlotSelection(event: PointerEvent, canvasId: string, plotId: InteractivePlotId): void {
  if (event.button !== 0) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  if (!render) return;
  const point = canvasPoint(canvas, event);
  if (!pointInPlot(point, render.plot)) return;
  const clamped = clampPointToPlot(point, render.plot);
  activeSelection = {
    plotId,
    canvasId,
    pointerId: event.pointerId,
    startX: clamped.x,
    startY: clamped.y,
    currentX: clamped.x,
    currentY: clamped.y
  };
  canvas.setPointerCapture(event.pointerId);
  drawAll();
}

function updatePlotSelection(event: PointerEvent, canvasId: string): void {
  if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  if (!render) return;
  const point = clampPointToPlot(canvasPoint(canvas, event), render.plot);
  activeSelection.currentX = point.x;
  activeSelection.currentY = point.y;
  drawAll();
}

function finishPlotSelection(event: PointerEvent, canvasId: string): void {
  if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  const selection = activeSelection;
  activeSelection = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!render) {
    drawAll();
    return;
  }

  const dx = Math.abs(selection.currentX - selection.startX);
  const dy = Math.abs(selection.currentY - selection.startY);
  const nextView: PlotView = { ...plotViews[selection.plotId] };
  if (dx > 8) nextView.xlim = validRange(sortedRange(xFromPixel(render, selection.startX), xFromPixel(render, selection.currentX)));
  if (dy > 8) nextView.ylim = validRange(sortedRange(yFromPixel(render, selection.startY), yFromPixel(render, selection.currentY)));
  if (dx > 8 || dy > 8) {
    plotViews[selection.plotId] = nextView;
    updatePlotResetButtons();
  }
  drawAll();
}

function cancelPlotSelection(event: PointerEvent, canvasId: string): void {
  if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
  activeSelection = null;
  drawAll();
}

function zoomRangeAround(rangeValue: NumericRange, center: number, factor: number): NumericRange {
  const [min, max] = rangeValue;
  return [
    center - (center - min) * factor,
    center + (max - center) * factor
  ];
}

function zoomPlotWithWheel(event: WheelEvent, canvasId: string, plotId: InteractivePlotId): void {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  if (!render) return;
  const point = canvasPoint(canvas, event);
  if (!pointInPlot(point, render.plot)) return;
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1.16 : 1 / 1.16;
  const nextView: PlotView = {
    xlim: validRange(zoomRangeAround(render.xlim, xFromPixel(render, point.x), factor)) || render.xlim,
    ylim: validRange(zoomRangeAround(render.ylim, yFromPixel(render, point.y), factor)) || render.ylim
  };
  plotViews[plotId] = nextView;
  updatePlotResetButtons();
  drawAll();
}

function resetPlotView(plotId: InteractivePlotId): void {
  plotViews[plotId] = {};
  if (activeSelection?.plotId === plotId) activeSelection = null;
  updatePlotResetButtons();
  drawAll();
}

function plotViewIsActive(plotId: InteractivePlotId): boolean {
  return Boolean(plotViews[plotId].xlim || plotViews[plotId].ylim);
}

function updatePlotResetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-plot-reset]").forEach((button) => {
    const plotId = button.dataset.plotReset as InteractivePlotId | undefined;
    button.disabled = !plotId || !plotViewIsActive(plotId);
  });
}

function buildPresetButtons(): void {
  const container = el<HTMLDivElement>("presetButtons");
  container.innerHTML = "";
  Object.keys(PRESETS).forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => applyPreset(name));
    container.appendChild(button);
  });
  updatePresetButtons();
}

function buildSolverButtons(): void {
  const container = el<HTMLDivElement>("solverButtons");
  container.innerHTML = "";
  const labels: Record<SolverName, string> = { rk45: "RK45", dop853: "DOP853", midpoint: "Mid" };
  const titles: Record<SolverName, string> = { rk45: "RK45 adaptive solver", dop853: "DOP853 reference solver", midpoint: "Historical midpoint solver" };
  SOLVER_NAMES.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.solver = name;
    button.textContent = labels[name];
    button.title = titles[name];
    button.addEventListener("click", () => {
      state.solver = name;
      updateSolverButtons();
      refreshActivePreset();
      scheduleSolve();
    });
    container.appendChild(button);
  });
}

function buildSliderGroup(containerId: string, controls: ControlDef[]): void {
  const container = el<HTMLDivElement>(containerId);
  container.innerHTML = "";
  controls.forEach(([key, symbol, name, min, max, step, _defaultValue, color]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "slider-control";
    wrapper.style.setProperty("--accent", color);
    wrapper.innerHTML = `
      <div class="slider-name" title="${name}">${name}</div>
      <div class="slider-symbol">${symbol}</div>
      <div class="slider-track">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${String(sliderInputValue(key))}" aria-label="${name}">
        <span class="slider-value" data-value-for="${key}"></span>
        ${key === "tEnd" ? tauScaleMarkup() : ""}
        </div>
      <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">↺</button>
    `;
    const input = wrapper.querySelector("input");
    if (!input) throw new Error("missing slider input");
    input.addEventListener("input", (event) => {
      state[key] = valueFromSlider(key, Number((event.target as HTMLInputElement).value));
      updateSliderLabel(key);
      refreshActivePreset();
      scheduleSolve();
    });
    wrapper.querySelector<HTMLButtonElement>("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
    container.appendChild(wrapper);
    controlElements.set(key, input);
  });
}

function tauScaleMarkup(): string {
  return `<div class="slider-scale">${TAU_TICKS.map((tick) => `<span>${tick}</span>`).join("")}</div>`;
}

function sliderInputValue(key: ControlParameterKey): number {
  return key === "tEnd" ? Math.log10(state.tEnd) : state[key];
}

function valueFromSlider(key: ControlParameterKey, value: number): number {
  if (key !== "tEnd") return value;
  return Math.min(1000, Math.max(1, 10 ** value));
}

function controlValueLabel(key: ControlParameterKey, value: number): string {
  if (key !== "tEnd") return fmt(value, 5);
  return fmt(value, value >= 100 ? 0 : 1);
}

function buildParameterTable(): void {
  const tunableTable = el<HTMLTableSectionElement>("tunableParameterTable");
  const derivedTable = el<HTMLTableSectionElement>("derivedParameterTable");
  const numericalTable = el<HTMLTableSectionElement>("numericalParameterTable");
  const controlRows = (controls: ControlDef[]) => controls
    .map(([key, symbol, _name, _min, _max, _step, _defaultValue, color]) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${PARAMETER_DESCRIPTIONS[key] || ""}</td>
      </tr>
    `)
    .join("");

  tunableTable.innerHTML = controlRows(CONTROL_GROUPS.physical) + `
      <tr><td class="symbol-cell" style="--color:${COLORS.H}">driver</td><td>Convective driving choice: the standard Stellingwerf pressure form is \\(\\sqrt{${TEX.H}}\\); \\(\\sqrt{|${TEX.V}|}\\) is retained as a diagnostic variant.</td></tr>
      <tr><td class="symbol-cell" style="--color:${COLORS.m}">geometry</td><td>Switch between fixed paper-model \\(${TEX.m}\\) and radius-dependent local geometry \\(${TEX.m}_{\\mathrm{eff}}(${TEX.R})\\).</td></tr>
    `;
  derivedTable.innerHTML = DERIVED_DESCRIPTIONS
    .map(({ symbol, description, color }) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${description}</td>
      </tr>
    `)
    .join("");
  numericalTable.innerHTML = controlRows(CONTROL_GROUPS.integration) + `
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>Numerical method: RK45 default, DOP853 reference, or historical midpoint.</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">phase window</td><td>Reference cycles use the first valid Stellingwerf-style max-to-max luminosity window; final cycles use the latest valid window.</td></tr>
    `;
  queueMathTypeset();
}

function updateVariableInitials(): void {
  const initial = sample(0, [state.r0, state.v0, state.h0, state.uc0], state);
  const values: Record<string, string> = {
    initialTau: `\\(${TEX.tau}_{0}=0\\)`,
    initialR: `\\(${TEX.R}_{0}=${fmt(initial.R, 4)}\\)`,
    initialV: `\\(${TEX.V}_{0}=${fmt(initial.V, 4)}\\)`,
    initialH: `\\(${TEX.H}_{0}=${fmt(initial.H, 4)}\\)`,
    initialUc: `\\(${TEX.Uc}_{0}=${fmt(initial.Uc, 4)}\\)`,
    initialLr: `\\(${TEX.Lr}_{0}=${fmt(initial.Lr, 4)}\\)`,
    initialLc: `\\(${TEX.Lc}_{0}=${fmt(initial.Lc, 4)}\\)`,
    initialL: `\\(${TEX.L}_{0}=${fmt(initial.L, 4)}\\)`
  };
  Object.entries(values).forEach(([id, value]) => {
    el<HTMLElement>(id).innerHTML = value;
  });
}

function updateSliderLabel(key: ControlParameterKey): void {
  const label = document.querySelector(`[data-value-for="${String(key)}"]`);
  if (!label) return;
  const value = state[key];
  label.textContent = controlValueLabel(key, value);
  const input = controlElements.get(key);
  if (input) input.value = String(sliderInputValue(key));
}

function updateAllSliderLabels(): void {
  controlElements.forEach((_input, key) => updateSliderLabel(key));
  updateResetButtons();
}

function restoreParameterDefault(key: ControlParameterKey): void {
  state[key] = PRESETS[selectedPreset][key];
  updateSliderLabel(key);
  refreshActivePreset();
  scheduleSolve();
}

function updateResetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-reset-key]").forEach((button) => {
    const key = button.dataset.resetKey as ControlParameterKey;
    button.disabled = valuesMatch(state[key], PRESETS[selectedPreset][key]);
    button.title = `Restore to ${selectedPreset} preset value: ${fmt(Number(PRESETS[selectedPreset][key]), 5)}`;
  });
}

function updatePresetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("#presetButtons button").forEach((button) => {
    button.classList.toggle("active", button.textContent === activePreset);
  });
}

function updateDriverButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-driver]").forEach((button) => {
    button.classList.toggle("active", button.dataset.driver === state.driver);
  });
}

function updatePhaseModeButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-phase-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.phaseMode === state.phaseMode);
  });
}

function updateSolverButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-solver]").forEach((button) => {
    button.classList.toggle("active", button.dataset.solver === state.solver);
  });
}

function applyPreset(name: string): void {
  state = { ...PRESETS[name] };
  selectedPreset = name;
  activePreset = name;
  updatePresetButtons();
  updateDriverButtons();
  updatePhaseModeButtons();
  updateSolverButtons();
  el<HTMLInputElement>("variableM").checked = state.variableM;
  el<HTMLInputElement>("runUntilStable").checked = state.runUntilStable;
  updateAllSliderLabels();
  updateResetButtons();
  scheduleSolve();
}

function scheduleSolve(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(solveAndDraw, 80);
}

function solveAndDraw(): void {
  latestResult = solveModel(state);
  latestRows = latestResult.rows;
  drawAll();
}

function strideDownsample(rows: Row[], maxPoints: number): Row[] {
  if (rows.length <= maxPoints) return rows;
  const stride = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_row, index) => index % stride === 0);
  const last = rows.at(-1);
  if (last && sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

function downsample(rows: Row[], maxPoints = 2200, keys: readonly ToggleSeriesKey[] = []): Row[] {
  if (rows.length <= maxPoints) return rows;
  const uniqueKeys = [...new Set(keys)];
  if (!uniqueKeys.length) return strideDownsample(rows, maxPoints);

  const maxPointsPerBucket = 2 + uniqueKeys.length * 2;
  const bucketCount = Math.max(1, Math.floor(maxPoints / maxPointsPerBucket));
  const bucketSize = Math.ceil(rows.length / bucketCount);
  const selectedIndices = new Set<number>();

  for (let start = 0; start < rows.length; start += bucketSize) {
    const end = Math.min(rows.length - 1, start + bucketSize - 1);
    selectedIndices.add(start);
    selectedIndices.add(end);

    uniqueKeys.forEach((key) => {
      let min = Infinity;
      let max = -Infinity;
      let minIndex = start;
      let maxIndex = start;
      for (let index = start; index <= end; index += 1) {
        const value = rows[index][key];
        if (!Number.isFinite(value)) continue;
        if (value < min) {
          min = value;
          minIndex = index;
        }
        if (value > max) {
          max = value;
          maxIndex = index;
        }
      }
      selectedIndices.add(minIndex);
      selectedIndices.add(maxIndex);
    });
  }

  return [...selectedIndices]
    .sort((a, b) => a - b)
    .map((index) => rows[index]);
}

function rowsInTauRange(rows: Row[], xlim: NumericRange | undefined): Row[] {
  if (!xlim || !validRange(xlim)) return rows;
  const [minTau, maxTau] = xlim;
  const firstVisible = rows.findIndex((row) => row.tau >= minTau);
  if (firstVisible === -1) return [];
  let endExclusive = firstVisible;
  while (endExclusive < rows.length && rows[endExclusive].tau <= maxTau) endExclusive += 1;
  return rows.slice(Math.max(0, firstVisible - 1), Math.min(rows.length, endExclusive + 1));
}

function activeSeriesKeys(plotId: InteractivePlotId, keys: readonly ToggleSeriesKey[]): ToggleSeriesKey[] {
  return keys.filter((key) => seriesIsVisible(plotId, key));
}

function rowsForInteractivePlot(plotId: InteractivePlotId, rows: Row[], keys: readonly ToggleSeriesKey[], maxPoints = 60000): Row[] {
  const windowedRows = rowsInTauRange(rows, plotViews[plotId].xlim);
  return downsample(windowedRows, maxPoints, activeSeriesKeys(plotId, keys));
}

function range(values: number[], padFraction = 0.08): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  values.forEach((value) => {
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * padFraction || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * padFraction;
  return [min - pad, max + pad];
}

interface Series {
  label: string;
  color: string;
  rows: Row[];
  x: (row: Row) => number;
  y: (row: Row) => number;
  width?: number;
  dash?: number[];
}

interface EnvelopeBin {
  min: number;
  max: number;
  sum: number;
  count: number;
}

function colorWithAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const [, r, g, b] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}

function drawDenseEnvelope(
  ctx: CanvasRenderingContext2D,
  item: Series,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange
): boolean {
  const xSpan = xlim[1] - xlim[0];
  const ySpan = ylim[1] - ylim[0];
  if (xSpan <= 0 || ySpan <= 0) return false;

  const columnCount = Math.max(1, Math.ceil(plot.width));
  const bins: EnvelopeBin[] = Array.from({ length: columnCount }, (): EnvelopeBin => ({
    min: Infinity,
    max: -Infinity,
    sum: 0,
    count: 0
  }));
  let visibleCount = 0;

  item.rows.forEach((row) => {
    const x = item.x(row);
    const y = item.y(row);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < xlim[0] || x > xlim[1]) return;
    const column = clamp(Math.floor(((x - xlim[0]) / xSpan) * columnCount), 0, columnCount - 1);
    const bin = bins[column];
    bin.min = Math.min(bin.min, y);
    bin.max = Math.max(bin.max, y);
    bin.sum += y;
    bin.count += 1;
    visibleCount += 1;
  });

  if (visibleCount <= plot.width * DENSE_ENVELOPE_POINTS_PER_PIXEL) return false;

  const sx = (column: number) => plot.left + ((column + 0.5) / columnCount) * plot.width;
  const sy = (value: number) => plot.top + plot.height - ((value - ylim[0]) / ySpan) * plot.height;
  const drawSegment = (start: number, end: number) => {
    ctx.beginPath();
    for (let column = start; column <= end; column += 1) {
      const bin = bins[column];
      const x = sx(column);
      const y = sy(bin.max);
      if (column === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let column = end; column >= start; column -= 1) {
      const bin = bins[column];
      ctx.lineTo(sx(column), sy(bin.min));
    }
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    for (let column = start; column <= end; column += 1) {
      const bin = bins[column];
      const x = sx(column);
      const y = sy(bin.sum / bin.count);
      if (column === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  ctx.fillStyle = colorWithAlpha(item.color, 0.22);
  ctx.strokeStyle = colorWithAlpha(item.color, 0.88);
  ctx.lineWidth = item.width ? Math.max(1, item.width * 0.65) : 1.3;
  ctx.setLineDash([]);

  let start: number | null = null;
  bins.forEach((bin, column) => {
    if (bin.count > 0 && start === null) {
      start = column;
    } else if (bin.count === 0 && start !== null) {
      drawSegment(start, column - 1);
      start = null;
    }
  });
  if (start !== null) drawSegment(start, bins.length - 1);
  return true;
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  plot: { left: number; top: number; width: number; height: number },
  xlim: [number, number],
  ylim: [number, number],
  xlabel: string,
  ylabel: string,
  xlabelColor: string = THEME.axisText,
  ylabelColor: string = THEME.axisText
): void {
  ctx.strokeStyle = THEME.axisGrid;
  ctx.lineWidth = 1;
  ctx.fillStyle = THEME.axisText;
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 4; i += 1) {
    const x = plot.left + (plot.width * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.fillText(fmt(xlim[0] + ((xlim[1] - xlim[0]) * i) / 4, 2), x, plot.top + plot.height + 8);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const y = plot.top + (plot.height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.fillText(fmt(ylim[1] - ((ylim[1] - ylim[0]) * i) / 4, 2), plot.left - 9, y);
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = xlabelColor;
  ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
  ctx.save();
  ctx.translate(16, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = ylabelColor;
  ctx.fillText(ylabel, 0, 0);
  ctx.restore();
}

function drawSeries(
  canvasId: string,
  series: Series[],
  options: {
    xlabel: string;
    ylabel: string;
    xlim?: [number, number];
    ylim?: [number, number];
    fallbackXlim?: [number, number];
    view?: PlotView;
    interactivePlotId?: InteractivePlotId;
    xlabelColor?: string;
    ylabelColor?: string;
    message?: string;
    denseEnvelope?: boolean;
  }
): void {
  const canvas = el<HTMLCanvasElement>(canvasId);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(260, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const plot = { left: 58, top: 18, width: rect.width - 78, height: rect.height - 72 };
  const xValues: number[] = [];
  const yValues: number[] = [];
  series.forEach((item) => {
    item.rows.forEach((row) => {
      xValues.push(item.x(row));
    });
  });
  const xlim = options.view?.xlim || options.xlim || options.fallbackXlim || range(xValues, 0.02);
  series.forEach((item) => {
    item.rows.forEach((row) => {
      const x = item.x(row);
      const y = item.y(row);
      if (Number.isFinite(x) && x >= xlim[0] && x <= xlim[1]) yValues.push(y);
    });
  });
  const ylim = options.view?.ylim || options.ylim || range(yValues, 0.08);
  plotRenderStates.set(canvasId, { plotId: options.interactivePlotId, plot, xlim, ylim });
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  drawAxes(ctx, plot, xlim, ylim, options.xlabel, options.ylabel, options.xlabelColor, options.ylabelColor);
  if (options.message && !series.some((item) => item.rows.length)) {
    ctx.fillStyle = THEME.axisText;
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(options.message, plot.left + plot.width / 2, plot.top + plot.height / 2);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  series.forEach((item) => {
    if (options.denseEnvelope && drawDenseEnvelope(ctx, item, plot, xlim, ylim)) return;
    ctx.beginPath();
    let started = false;
    item.rows.forEach((row) => {
      const x = item.x(row);
      const y = item.y(row);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const px = sx(x);
      const py = sy(y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width || 2;
    ctx.setLineDash(item.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
  drawSelectionOverlay(ctx, canvasId, plot);
}

function drawSelectionOverlay(ctx: CanvasRenderingContext2D, canvasId: string, plot: PlotBox): void {
  if (!activeSelection || activeSelection.canvasId !== canvasId) return;
  const left = Math.min(activeSelection.startX, activeSelection.currentX);
  const top = Math.min(activeSelection.startY, activeSelection.currentY);
  const width = Math.abs(activeSelection.currentX - activeSelection.startX);
  const height = Math.abs(activeSelection.currentY - activeSelection.startY);
  if (width < 2 && height < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.fillStyle = THEME.selectionFill;
  ctx.strokeStyle = THEME.selectionStroke;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left, top, width, height);
  ctx.restore();
}

interface LegendItem {
  label: string;
  color: string;
  key?: ToggleSeriesKey;
  toggleLabel?: string;
}

function drawLegend(id: string, items: LegendItem[], options: { plotId?: InteractivePlotId } = {}): void {
  const node = el<HTMLDivElement>(id);
  node.innerHTML = items
    .map((item) => {
      if (!options.plotId || !item.key) {
        return `<span class="legend-item"><span class="swatch" style="--color:${item.color}"></span>${item.label}</span>`;
      }
      const visible = seriesIsVisible(options.plotId, item.key);
      const toggleLabel = item.toggleLabel || item.key;
      return `
        <button class="legend-item legend-toggle${visible ? "" : " is-hidden"}" type="button" data-plot-series="${item.key}" aria-pressed="${String(visible)}" title="Toggle ${toggleLabel} visibility" aria-label="Toggle ${toggleLabel} visibility">
          <span class="swatch" style="--color:${item.color}"></span>${item.label}
        </button>
      `;
    })
    .join("");
  if (options.plotId) {
    node.querySelectorAll<HTMLButtonElement>("[data-plot-series]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.plotSeries as ToggleSeriesKey | undefined;
        if (!key) return;
        plotVisibility[options.plotId!][key] = !seriesIsVisible(options.plotId!, key);
        drawAll();
      });
    });
  }
  queueMathTypeset();
}

function seriesIsVisible(plotId: InteractivePlotId, key: ToggleSeriesKey): boolean {
  return plotVisibility[plotId][key] !== false;
}

function stopReasonLabel(message: string, runUntilStable: boolean): string {
  switch (message) {
    case "limit_cycle":
      return "stable limit cycle";
    case "equilibrium":
      return "stable equilibrium";
    case "max_time":
      return "tau max reached";
    case "runaway_trend":
      return "runaway trend";
    case "complete":
      return runUntilStable ? "tau max reached" : "fixed-time complete";
    case "domain_error":
      return "domain error";
    case "row_limit":
      return "row limit";
    case "step_limit":
      return "step limit";
    case "step_count_limit":
      return "step count limit";
    default:
      return message.replaceAll("_", " ");
  }
}

function phaseUnavailableLabel(phase: PhaseResult): string | undefined {
  switch (phase.reason) {
    case "ok":
      return undefined;
    case "not_enough_rows":
      return "phase unavailable: not enough samples";
    case "not_enough_maxima":
      return "phase unavailable: fewer than three luminosity maxima";
    case "amplitude_below_threshold":
      return "phase unavailable: luminosity cycles are below threshold";
    case "reference_out_of_range":
      return "phase unavailable: comparison does not cover the reference window";
  }
}

function referenceFamilyLabel(value: ModelParameters["referenceFamily"]): string {
  return value.replaceAll("-", " ");
}

function phaseModeLabel(value: PhaseMode): string {
  return value === "final" ? "final cycles" : "reference cycles";
}

function phaseForRows(rows: Row[]): PhaseResult {
  return buildTwoCyclePhase(rows, {
    warmupTau: state.phaseWarmupTau,
    minAmplitude: state.phaseMinAmplitude,
    selection: state.phaseMode === "final" ? "last" : "first"
  });
}

function timeDomain(rows: readonly Row[]): NumericRange {
  if (!rows.length) return [0, 1];
  const first = rows[0].tau;
  const last = rows[rows.length - 1].tau;
  return first === last ? range([first, last], 0.02) : [first, last];
}

function paddedTimeRange(rows: readonly Row[]): NumericRange {
  return range(rows.map((row) => row.tau), 0.02);
}

function clearStalePlotView(plotId: InteractivePlotId, rows: readonly Row[]): void {
  const view = plotViews[plotId];
  const domain = timeDomain(rows);
  if (view.xlim && (view.xlim[1] < domain[0] || view.xlim[0] > domain[1])) view.xlim = undefined;
  if (view.xlim && !validRange(view.xlim)) view.xlim = undefined;
  if (view.ylim && !validRange(view.ylim)) view.ylim = undefined;
}

function visibleRows(plotId: InteractivePlotId, key: ToggleSeriesKey, rows: Row[]): Row[] {
  return seriesIsVisible(plotId, key) ? rows : [];
}

function drawAll(): void {
  const rows = latestRows;
  updateVariableInitials();
  clearStalePlotView("time", rows);
  clearStalePlotView("lum", rows);
  updatePlotResetButtons();
  const statusPill = el<HTMLDivElement>("statusPill");
  const stopReason = stopReasonLabel(latestResult.message, state.runUntilStable);
  statusPill.textContent = `stop: ${stopReason}`;
  const okStatus = latestResult.message === "equilibrium"
    || latestResult.message === "limit_cycle"
    || (!state.runUntilStable && latestResult.status === "complete");
  statusPill.className = `status-pill ${okStatus ? "status-ok" : "status-warn"}`;
  const final = rows[rows.length - 1];
  const phase = phaseForRows(rows);
  el<HTMLDivElement>("metrics").innerHTML = [
    ["solver", state.solver.toUpperCase()],
    ["stop reason", stopReason],
    ["reference", referenceFamilyLabel(state.referenceFamily)],
    ["phase mode", phaseModeLabel(state.phaseMode)],
    ["driver", state.driver === "h" ? `\\(\\sqrt{${TEX.H}}\\)` : `\\(\\sqrt{|${TEX.V}|}\\)`],
    [`\\(${TEX.gammac}\\)`, fmt(state.gammac, 3)],
    [`\\(${TEX.zeta}\\)`, fmt(state.zeta, 3)],
    [`\\(${TEX.zetac}\\)`, fmt(state.zetac, 3)],
    [`final \\(${TEX.tau}\\)`, final ? fmt(final.tau || 0, 4) : "n/a"],
    [`\\(${TEX.tau}_{max}\\)`, fmt(state.tEnd, 4)],
    ["rows", rows.length],
    ["accepted", latestResult.stats.acceptedSteps],
    ["rejected", latestResult.stats.rejectedSteps],
    ["max err", fmt(latestResult.stats.maxNormalizedError, 3)],
    ["period", phase.period ? fmt(phase.period, 3) : "n/a"],
    ["phase", phase.reason === "ok" ? phaseModeLabel(state.phaseMode) : "unavailable"],
    [`final \\(${TEX.R}\\)`, final ? fmt(final.R, 3) : "n/a"],
    [`final \\(${TEX.L}\\)`, final ? fmt(final.L, 3) : "n/a"]
  ].map(([label, value]) => `<span class="metric">${label}<b>${value}</b></span>`).join("");

  el<HTMLParagraphElement>("modelSubtitle").textContent = "";

  const phaseSample = phase.rows.length ? downsample(phase.rows, 1800, ["L", "V"]) : [];
  const phaseMessage = phaseUnavailableLabel(phase);
  drawSeries("lightCanvas", [
    { label: "L", color: COLORS.L, rows: phaseSample, x: (row) => row.tau, y: (row) => row.L }
  ], { xlabel: "phase", ylabel: "luminosity", xlim: [0, 2], ylim: phaseSample.length ? undefined : [0, 1], message: phaseMessage });
  drawLegend("lightLegend", [
    { label: `\\(${TEX.L}\\)`, color: COLORS.L }
  ]);

  drawSeries("velocityCanvas", [
    { label: "V", color: COLORS.V, rows: phaseSample, x: (row) => row.tau, y: (row) => row.V }
  ], { xlabel: "phase", ylabel: "radial velocity", xlim: [0, 2], ylim: phaseSample.length ? undefined : [0, 1], message: phaseMessage });
  drawLegend("velocityLegend", [
    { label: `\\(${TEX.V}\\)`, color: COLORS.V }
  ]);

  const timeXlim = paddedTimeRange(rows);
  const sampledTimeRows = rowsForInteractivePlot("time", rows, ["R", "V", "H", "Uc"]);
  const sampledLumRows = rowsForInteractivePlot("lum", rows, ["L", "Lr", "Lc"]);
  drawSeries("timeCanvas", [
    { label: "R", color: COLORS.R, rows: visibleRows("time", "R", sampledTimeRows), x: (row) => row.tau, y: (row) => row.R },
    { label: "V", color: COLORS.V, rows: visibleRows("time", "V", sampledTimeRows), x: (row) => row.tau, y: (row) => row.V },
    { label: "H", color: COLORS.H, rows: visibleRows("time", "H", sampledTimeRows), x: (row) => row.tau, y: (row) => row.H },
    { label: "Uc", color: COLORS.Uc, rows: visibleRows("time", "Uc", sampledTimeRows), x: (row) => row.tau, y: (row) => row.Uc }
  ], {
    xlabel: "time τ",
    ylabel: "state",
    xlabelColor: COLORS.tau,
    fallbackXlim: timeXlim,
    view: plotViews.time,
    interactivePlotId: "time",
    denseEnvelope: true,
    message: "all state variables hidden"
  });
  drawLegend("timeLegend", [
    { key: "R", label: `\\(${TEX.R}\\) radius`, color: COLORS.R, toggleLabel: "radius" },
    { key: "V", label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V, toggleLabel: "radial velocity" },
    { key: "H", label: `\\(${TEX.H}\\) nonadiabatic pressure factor`, color: COLORS.H, toggleLabel: "nonadiabatic pressure factor" },
    { key: "Uc", label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc, toggleLabel: "convective velocity" }
  ], { plotId: "time" });

  drawSeries("lumCanvas", [
    { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", sampledLumRows), x: (row) => row.tau, y: (row) => row.L },
    { label: "Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lr },
    { label: "Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lc }
  ], {
    xlabel: "time τ",
    ylabel: "luminosity",
    xlabelColor: COLORS.tau,
    fallbackXlim: timeXlim,
    view: plotViews.lum,
    interactivePlotId: "lum",
    denseEnvelope: true,
    message: "all luminosity variables hidden"
  });
  drawLegend("lumLegend", [
    { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
    { key: "Lr", label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr, toggleLabel: "radiative luminosity" },
    { key: "Lc", label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc, toggleLabel: "convective luminosity" }
  ], { plotId: "lum" });
  queueMathTypeset();
}

function downloadCsv(): void {
  if (!latestRows.length) return;
  const headers: Array<keyof Row> = ["tau", "R", "V", "H", "Uc", "Lr", "Lc", "L"];
  const body = latestRows.map((row) => headers.map((key) => row[key]).join(",")).join("\n");
  const blob = new Blob([`${headers.join(",")}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ozwizard-${state.solver}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function startApp(): void {
  buildControls();
  solveAndDraw();
  window.addEventListener("load", queueMathTypeset);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
