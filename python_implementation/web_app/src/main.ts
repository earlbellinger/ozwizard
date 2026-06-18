import {
  COLORS,
  CONTROL_GROUPS,
  PARAMETER_DESCRIPTIONS,
  PRESETS,
  TEX,
  type ControlDef,
  type ModelParameters,
  type Row,
  compareRows,
  solveModel
} from "./model";
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

let state: ModelParameters = { ...PRESETS.Strip };
let selectedPreset = "Strip";
let activePreset = "Strip";
let latestRows: Row[] = [];
let comparisonRows: Row[] = [];
let latestResult = solveModel(state);
let comparisonResult: ReturnType<typeof solveModel> | null = null;
let debounceTimer = 0;
let mathTypesetTimer = 0;
let mathTypesetRunning = false;
let mathTypesetPending = false;

const controlElements = new Map<keyof ModelParameters, HTMLInputElement>();
const THEME = {
  axisGrid: "#26334E",
  axisText: "#A8B4C7",
  axisBorder: "#526489",
  comparison: "#8994A6",
  neutralSymbol: "#C0CAE8"
} as const;

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

  const compare = el<HTMLInputElement>("compareMidpoint");
  compare.checked = state.compareMidpoint;
  compare.addEventListener("change", (event) => {
    state.compareMidpoint = (event.target as HTMLInputElement).checked;
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

  document.querySelectorAll<HTMLButtonElement>("[data-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      state.driver = button.dataset.driver === "abs-v" ? "abs-v" : "p";
      updateDriverButtons();
      refreshActivePreset();
      scheduleSolve();
    });
  });

  el<HTMLButtonElement>("resetPreset").addEventListener("click", () => applyPreset(selectedPreset));
  el<HTMLButtonElement>("downloadCsv").addEventListener("click", downloadCsv);
  window.addEventListener("resize", drawAll);
  updateDriverButtons();
  updateSolverButtons();
  updateAllSliderLabels();
  updateResetButtons();
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
  const labels: Record<SolverName, string> = { rk45: "RK45", dop853: "DOP853", midpoint: "Midpoint" };
  SOLVER_NAMES.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.solver = name;
    button.textContent = labels[name];
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
      <div class="slider-head">
        <div class="slider-label"><span class="slider-symbol">${symbol}</span><span class="slider-name">${name}</span></div>
        <div class="slider-actions">
          <span class="slider-value" data-value-for="${key}"></span>
          <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">↺</button>
        </div>
      </div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${String(state[key])}">
    `;
    const input = wrapper.querySelector("input");
    if (!input) throw new Error("missing slider input");
    input.addEventListener("input", (event) => {
      state[key] = Number((event.target as HTMLInputElement).value) as never;
      updateSliderLabel(key);
      refreshActivePreset();
      scheduleSolve();
    });
    wrapper.querySelector<HTMLButtonElement>("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
    container.appendChild(wrapper);
    controlElements.set(key, input);
  });
}

function buildParameterTable(): void {
  const table = el<HTMLTableSectionElement>("parameterTable");
  const allControls = [...CONTROL_GROUPS.physical, ...CONTROL_GROUPS.initial, ...CONTROL_GROUPS.integration];
  table.innerHTML = allControls
    .map(([key, symbol, _name, _min, _max, _step, _defaultValue, color]) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${PARAMETER_DESCRIPTIONS[key] || ""}</td>
      </tr>
    `)
    .join("") + `
      <tr><td class="symbol-cell" data-symbol="tau" style="--color:${COLORS.tau}">\\(${TEX.tau}\\)</td><td>Dimensionless clock scaled by the model's free-fall/dynamical time; derivatives such as \\(dR/d\\tau\\) are per dynamical time unit.</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>Numerical method: RK45 default, DOP853 reference, or historical midpoint.</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">D</td><td>Convective driver: \\(\\sqrt{P}\\) or \\(\\sqrt{|V|}\\).</td></tr>
    `;
  queueMathTypeset();
}

function updateSliderLabel(key: keyof ModelParameters): void {
  const label = document.querySelector(`[data-value-for="${String(key)}"]`);
  if (!label) return;
  const value = state[key];
  label.textContent = typeof value === "number" ? fmt(value, 5) : String(value);
  const input = controlElements.get(key);
  if (input && typeof value === "number") input.value = String(value);
}

function updateAllSliderLabels(): void {
  controlElements.forEach((_input, key) => updateSliderLabel(key));
  updateResetButtons();
}

function restoreParameterDefault(key: keyof ModelParameters): void {
  state[key] = PRESETS[selectedPreset][key] as never;
  updateSliderLabel(key);
  refreshActivePreset();
  scheduleSolve();
}

function updateResetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-reset-key]").forEach((button) => {
    const key = button.dataset.resetKey as keyof ModelParameters;
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
  updateSolverButtons();
  el<HTMLInputElement>("variableM").checked = state.variableM;
  el<HTMLInputElement>("compareMidpoint").checked = state.compareMidpoint;
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
  if (state.compareMidpoint && state.solver !== "midpoint") {
    comparisonResult = solveModel(state, "midpoint");
    comparisonRows = comparisonResult.rows;
  } else {
    comparisonResult = null;
    comparisonRows = [];
  }
  drawAll();
}

function downsample<T>(rows: T[], maxPoints = 2200): T[] {
  if (rows.length <= maxPoints) return rows;
  const stride = Math.ceil(rows.length / maxPoints);
  return rows.filter((_row, index) => index % stride === 0);
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

function drawAxes(
  ctx: CanvasRenderingContext2D,
  plot: { left: number; top: number; width: number; height: number },
  xlim: [number, number],
  ylim: [number, number],
  xlabel: string,
  ylabel: string,
  xlabelColor = THEME.axisText,
  ylabelColor = THEME.axisText
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
    xlabelColor?: string;
    ylabelColor?: string;
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
      yValues.push(item.y(row));
    });
  });
  const xlim = options.xlim || range(xValues, 0.02);
  const ylim = options.ylim || range(yValues, 0.08);
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  drawAxes(ctx, plot, xlim, ylim, options.xlabel, options.ylabel, options.xlabelColor, options.ylabelColor);
  series.forEach((item) => {
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
}

function drawLegend(id: string, items: { label: string; color: string }[]): void {
  const node = el<HTMLDivElement>(id);
  node.innerHTML = items.map((item) => `<span class="legend-item"><span class="swatch" style="--color:${item.color}"></span>${item.label}</span>`).join("");
  queueMathTypeset();
}

function findMaxima(rows: Row[], key: keyof Row, after: number, minSeparation: number): Row[] {
  const maxima: Row[] = [];
  for (let i = 1; i < rows.length - 1; i += 1) {
    if (rows[i].tau < after) continue;
    if (rows[i - 1][key] < rows[i][key] && rows[i][key] >= rows[i + 1][key]) {
      const last = maxima[maxima.length - 1];
      if (last && rows[i].tau - last.tau < minSeparation) {
        if (rows[i][key] > last[key]) maxima[maxima.length - 1] = rows[i];
      } else {
        maxima.push(rows[i]);
      }
    }
  }
  return maxima;
}

function zeroCrossingTimes(rows: Row[], key: keyof Row, direction: "up" | "down", after: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].tau < after) continue;
    const prev = rows[i - 1][key];
    const next = rows[i][key];
    const crossedUp = direction === "up" && prev <= 0 && next > 0;
    const crossedDown = direction === "down" && prev >= 0 && next < 0;
    if (!crossedUp && !crossedDown) continue;
    const fraction = (0 - prev) / (next - prev);
    out.push(rows[i - 1].tau + fraction * (rows[i].tau - rows[i - 1].tau));
  }
  return out;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function periodCandidate(times: number[], finalTime: number, priority: number): { period: number; priority: number } | null {
  if (times.length < 3) return null;
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const interval = times[i] - times[i - 1];
    if (interval > 0 && Number.isFinite(interval)) intervals.push(interval);
  }
  const recent = intervals.slice(priority === 2 ? -4 : -2);
  const period = priority === 2 ? median(recent) : recent[recent.length - 1];
  if (!period || period <= 0 || finalTime - times[times.length - 1] > period * 2.5) return null;
  return { period, priority };
}

function estimatePulsationPeriod(rows: Row[]): number | null {
  const finalTime = rows[rows.length - 1]?.tau;
  if (!finalTime || rows.length < 8) return null;
  const after = finalTime * 0.15;
  const minPeakSeparation = Math.max(0.2, finalTime / 200);
  const candidates = [
    periodCandidate(findMaxima(rows, "L", after, minPeakSeparation).map((row) => row.tau), finalTime, 2),
    periodCandidate(findMaxima(rows, "R", after, minPeakSeparation).map((row) => row.tau), finalTime, 1),
    periodCandidate(zeroCrossingTimes(rows, "V", "up", after), finalTime, 0)
  ].filter((candidate): candidate is { period: number; priority: number } => Boolean(candidate));
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0]?.period || null;
}

function phasedRows(rows: Row[]): { rows: Row[]; period: number | null } {
  const finalTime = rows[rows.length - 1]?.tau;
  const period = estimatePulsationPeriod(rows);
  if (!finalTime || !period) return { rows: [], period };
  const startTime = finalTime - 2 * period;
  const out: Row[] = [];
  rows.forEach((row) => {
    const phase = (row.tau - startTime) / period;
    if (phase >= 0 && phase <= 2) out.push({ ...row, tau: phase });
  });
  return { rows: out, period };
}

function stopReasonLabel(message: string, runUntilStable: boolean): string {
  switch (message) {
    case "limit_cycle":
      return "stable limit cycle";
    case "equilibrium":
      return "stable equilibrium";
    case "max_time":
      return "tau max reached";
    case "complete":
      return runUntilStable ? "tau max reached" : "fixed-time complete";
    case "domain_error":
      return "domain error";
    case "row_limit":
      return "row limit";
    case "step_limit":
      return "step limit";
    default:
      return message.replaceAll("_", " ");
  }
}

function drawAll(): void {
  const rows = latestRows;
  const sampled = downsample(rows);
  const statusPill = el<HTMLDivElement>("statusPill");
  const stopReason = stopReasonLabel(latestResult.message, state.runUntilStable);
  statusPill.textContent = `stop: ${stopReason}`;
  const okStatus = latestResult.message === "equilibrium"
    || latestResult.message === "limit_cycle"
    || (!state.runUntilStable && latestResult.status === "complete");
  statusPill.className = `status-pill ${okStatus ? "status-ok" : "status-warn"}`;
  const final = rows[rows.length - 1];
  const phase = phasedRows(rows);
  const comparison = comparisonResult && comparisonRows.length ? compareRows(rows, comparisonRows, state) : null;
  const comparisonText = comparison
    ? `<span class="metric">midpoint Δy<b>${fmt(comparison.maxStateDelta, 3)}</b></span><span class="metric">midpoint ΔL<b>${fmt(comparison.maxLuminosityDelta, 3)}</b></span>`
    : "";
  el<HTMLDivElement>("metrics").innerHTML = [
    ["solver", state.solver.toUpperCase()],
    ["stop reason", stopReason],
    ["driver", state.driver === "p" ? "sqrt(P)" : "sqrt(|V|)"],
    ["gamma_c", fmt(state.gammac, 3)],
    ["zeta", fmt(state.zeta, 3)],
    ["zeta_c", fmt(state.zetac, 3)],
    [`final \\(${TEX.tau}\\)`, final ? fmt(final.tau || 0, 4) : "n/a"],
    [`\\(${TEX.tau}_{max}\\)`, fmt(state.tEnd, 4)],
    ["rows", rows.length],
    ["accepted", latestResult.stats.acceptedSteps],
    ["rejected", latestResult.stats.rejectedSteps],
    ["max err", fmt(latestResult.stats.maxNormalizedError, 3)],
    ["period", phase.period ? fmt(phase.period, 3) : "n/a"],
    ["final R", final ? fmt(final.R, 3) : "n/a"],
    ["final L", final ? fmt(final.L, 3) : "n/a"]
  ].map(([label, value]) => `<span class="metric">${label}<b>${value}</b></span>`).join("") + comparisonText;

  el<HTMLParagraphElement>("modelSubtitle").textContent = "";

  const phaseSample = phase.rows.length ? downsample(phase.rows, 1800) : [];
  const phaseComparison = comparisonRows.length ? downsample(phasedRows(comparisonRows).rows, 1800) : [];
  drawSeries("lightCanvas", [
    { label: "L", color: COLORS.L, rows: phaseSample, x: (row) => row.tau, y: (row) => row.L },
    { label: "midpoint L", color: THEME.comparison, rows: phaseComparison, x: (row) => row.tau, y: (row) => row.L, dash: [5, 4], width: 1.5 }
  ], { xlabel: "phase", ylabel: "luminosity", xlim: [0, 2], ylim: phaseSample.length ? undefined : [0, 1] });
  drawLegend("lightLegend", [
    { label: `\\(${TEX.L}\\) selected solver`, color: COLORS.L },
    ...(phaseComparison.length ? [{ label: `\\(${TEX.L}\\) midpoint comparison`, color: THEME.comparison }] : [])
  ]);

  drawSeries("velocityCanvas", [
    { label: "V", color: COLORS.V, rows: phaseSample, x: (row) => row.tau, y: (row) => row.V },
    { label: "midpoint V", color: THEME.comparison, rows: phaseComparison, x: (row) => row.tau, y: (row) => row.V, dash: [5, 4], width: 1.5 }
  ], { xlabel: "phase", ylabel: "radial velocity", xlim: [0, 2], ylim: phaseSample.length ? undefined : [0, 1] });
  drawLegend("velocityLegend", [
    { label: `\\(${TEX.V}\\) selected solver`, color: COLORS.V },
    ...(phaseComparison.length ? [{ label: `\\(${TEX.V}\\) midpoint comparison`, color: THEME.comparison }] : [])
  ]);

  drawSeries("timeCanvas", [
    { label: "R", color: COLORS.R, rows: sampled, x: (row) => row.tau, y: (row) => row.R },
    { label: "V", color: COLORS.V, rows: sampled, x: (row) => row.tau, y: (row) => row.V },
    { label: "P", color: COLORS.P, rows: sampled, x: (row) => row.tau, y: (row) => row.P },
    { label: "Uc", color: COLORS.Uc, rows: sampled, x: (row) => row.tau, y: (row) => row.Uc }
  ], { xlabel: "time τ", ylabel: "state", xlabelColor: COLORS.tau });
  drawLegend("timeLegend", [
    { label: `\\(${TEX.R}\\) radius`, color: COLORS.R },
    { label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V },
    { label: `\\(${TEX.P}\\) pressure`, color: COLORS.P },
    { label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc }
  ]);

  drawSeries("lumCanvas", [
    { label: "L", color: COLORS.L, rows: sampled, x: (row) => row.tau, y: (row) => row.L },
    { label: "Lr", color: COLORS.Lr, rows: sampled, x: (row) => row.tau, y: (row) => row.Lr },
    { label: "Lc", color: COLORS.Lc, rows: sampled, x: (row) => row.tau, y: (row) => row.Lc }
  ], { xlabel: "time τ", ylabel: "luminosity", xlabelColor: COLORS.tau });
  drawLegend("lumLegend", [
    { label: `\\(${TEX.L}\\) total`, color: COLORS.L },
    { label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr },
    { label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc }
  ]);
  queueMathTypeset();
}

function downloadCsv(): void {
  if (!latestRows.length) return;
  const headers: Array<keyof Row> = ["tau", "R", "V", "P", "Uc", "Lr", "Lc", "L"];
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
