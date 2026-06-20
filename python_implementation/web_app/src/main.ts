import {
  COLORS,
  CONTROL_GROUPS,
  DEFAULT_PRESET_NAME,
  PARAMETER_DESCRIPTIONS,
  PRESETS,
  TEX,
  type ControlParameterKey,
  type ControlDef,
  type ModelParameters,
  type Row,
  sample,
  solveModel
} from "./model";
import { buildTwoCyclePhase, type PhaseAnchor, type PhaseResult } from "./phase";
import { SOLVER_NAMES, type SolverName } from "./solvers";

declare global {
  interface Window {
    MathJax?: {
      startup?: { promise?: Promise<void> };
      typesetClear?: (elements?: Element[]) => void;
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

let state: ModelParameters = { ...PRESETS[DEFAULT_PRESET_NAME] };
let selectedPreset = DEFAULT_PRESET_NAME;
let activePreset = DEFAULT_PRESET_NAME;
let latestRows: Row[] = [];
let latestResult = solveModel(state);
let phaseAnchor: PhaseAnchor = "min";
let debounceTimer = 0;
let mathTypesetTimer = 0;
let mathTypesetRunning = false;
let mathTypesetPending = false;
let mathTypesetWholeRoot = false;
let mathRenderVersion = 0;
const mathTypesetTargets = new Set<HTMLElement>();
const stagedMathUpdates = new Map<HTMLElement, StagedMathUpdate>();

const PIANO_MIN_NOTE = 21;
const PIANO_MAX_NOTE = 108;
const MIDDLE_C_NOTE = 60;
const SONIFICATION_ATTACK_SECONDS = 1;
const SONIFICATION_RELEASE_SECONDS = 0.14;
const SONIFICATION_OUTPUT_GAIN = 0.12;
const SONIFICATION_FREQUENCY_GLIDE_SECONDS = 0.035;
const SONIFICATION_WAVEFORM_CROSSFADE_SECONDS = 0.18;
const SONIFICATION_MAX_SAMPLES = 2400;
const SONIFICATION_WAVEFORM_SAMPLES = 512;
const SONIFICATION_WAVEFORM_SMOOTH_PASSES = 5;
const SONIFICATION_MAX_HARMONICS = 32;
const controlElements = new Map<ControlParameterKey, HTMLInputElement>();
let sonificationReferenceNote = MIDDLE_C_NOTE;
let sonificationReferenceHz = noteToFrequency(MIDDLE_C_NOTE);
let sonificationSamples: SonificationSample[] = [];
let sonificationWaveformSignature = "";
let sonificationContext: AudioContext | null = null;
let sonificationVoice: SonificationVoice | null = null;
let sonificationMasterGain: GainNode | null = null;
let sonificationStopTimer = 0;
const sonificationVoices = new Set<SonificationVoice>();
let sonificationActive = false;
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
  mode: "zoom" | "pan";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startXlim: NumericRange;
  startYlim: NumericRange;
}

interface StagedMathUpdate {
  html: string;
  version: number;
}

interface SonificationSample {
  phase: number;
  value: number;
}

interface SonificationVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  stopped: boolean;
}

const INTERACTIVE_CANVASES: Record<string, InteractivePlotId> = {
  timeCanvas: "time",
  lumCanvas: "lum"
};

const SIDEBAR_COLLAPSE_QUERY = "(max-width: 780px)";

const plotViews: Record<InteractivePlotId, PlotView> = {
  time: {},
  lum: {}
};

const plotVisibility: Record<InteractivePlotId, Record<string, boolean>> = {
  time: { R: true, V: true, H: true, Uc: true },
  lum: { L: true, Lr: true, Lc: true }
};

const plotRenderStates = new Map<string, PlotRenderState>();
const legendSignatures = new Map<string, string>();
let activeSelection: PlotSelection | null = null;
const DENSE_ENVELOPE_POINTS_PER_PIXEL = 2.25;
const PLOT_LAYOUT = {
  left: 84,
  top: 18,
  right: 20,
  bottom: 72,
  yTickGap: 18,
  yLabelX: 22
} as const;

function fmt(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "n/a";
  const fixed = Number(value).toFixed(digits);
  const decimal = digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
  const scientific = value.toExponential(2).replace(/\.?0+e/, "e");
  return scientific.length < decimal.length ? scientific : decimal;
}

function fmtFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function stageMathHtml(element: HTMLElement, html: string): void {
  const version = ++mathRenderVersion;
  stagedMathUpdates.set(element, { html, version });
  element.dataset.mathState = "rendering";
  element.dataset.mathVersion = String(version);
}

function markStagedMathReady(element: HTMLElement, update: StagedMathUpdate): boolean {
  const current = stagedMathUpdates.get(element);
  if (!current || current.version !== update.version) return false;
  stagedMathUpdates.delete(element);
  element.dataset.mathState = "ready";
  delete element.dataset.mathVersion;
  return true;
}

function applyRawStagedMathFallback(entries: Array<[HTMLElement, StagedMathUpdate]>): void {
  entries.forEach(([element, update]) => {
    if (!markStagedMathReady(element, update)) return;
    element.innerHTML = update.html;
  });
}

function queueMathTypeset(elements?: HTMLElement[]): void {
  if (elements?.length) {
    elements.forEach((element) => mathTypesetTargets.add(element));
  } else {
    mathTypesetWholeRoot = true;
  }
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
  if (!root) return;
  const elements = mathTypesetWholeRoot || mathTypesetTargets.size === 0
    ? [root]
    : Array.from(mathTypesetTargets);
  const stagedEntries = mathTypesetWholeRoot
    ? Array.from(stagedMathUpdates.entries())
    : elements.flatMap((element): Array<[HTMLElement, StagedMathUpdate]> => {
        const update = stagedMathUpdates.get(element);
        return update ? [[element, update]] : [];
      });
  const directElements = elements.filter((element) => !stagedMathUpdates.has(element));
  mathTypesetTargets.clear();
  mathTypesetWholeRoot = false;
  const typesetPromise = mathJax?.typesetPromise?.bind(mathJax);
  const typesetClear = mathJax?.typesetClear?.bind(mathJax);
  if (!mathJax || !typesetPromise) {
    applyRawStagedMathFallback(stagedEntries);
    return;
  }
  mathTypesetRunning = true;
  try {
    await mathJax.startup?.promise;
    if (directElements.length) {
      typesetClear?.(directElements);
      await typesetPromise(directElements);
    }
    if (stagedEntries.length) {
      await renderStagedMath(stagedEntries, { typesetClear, typesetPromise });
    }
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

async function renderStagedMath(
  entries: Array<[HTMLElement, StagedMathUpdate]>,
  mathJax: { typesetClear?: (elements?: Element[]) => void; typesetPromise: (elements?: Element[]) => Promise<void> }
): Promise<void> {
  const host = document.createElement("div");
  host.className = "math-typeset-staging";
  const staged = entries.map(([target, update]) => {
    const node = document.createElement("div");
    node.className = target.className;
    node.style.width = `${Math.max(1, target.clientWidth)}px`;
    node.innerHTML = update.html;
    host.appendChild(node);
    return { target, update, node };
  });
  document.body.appendChild(host);
  try {
    const stagedNodes = staged.map(({ node }) => node);
    mathJax.typesetClear?.(stagedNodes);
    await mathJax.typesetPromise(stagedNodes);
    staged.forEach(({ target, update, node }) => {
      if (!markStagedMathReady(target, update)) return;
      mathJax.typesetClear?.([target]);
      target.innerHTML = node.innerHTML;
    });
  } finally {
    host.remove();
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

function noteToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function formatHz(value: number): string {
  return String(Math.round(value));
}

function setupSonificationControls(): void {
  const toggle = el<HTMLButtonElement>("sonificationToggle");
  const pitch = el<HTMLInputElement>("sonificationPitch");
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  pitch.min = String(PIANO_MIN_NOTE);
  pitch.max = String(PIANO_MAX_NOTE);
  pitch.step = "1";
  pitch.value = String(sonificationReferenceNote);
  pitch.addEventListener("input", (event) => {
    sonificationReferenceNote = Number((event.target as HTMLInputElement).value);
    sonificationReferenceHz = noteToFrequency(sonificationReferenceNote);
    updateSonificationPitchLabel();
    updateSonificationFrequency();
    updateSonificationWaveform();
  });
  if (!AudioContextCtor) {
    toggle.disabled = true;
    toggle.title = "Audio is not supported in this browser";
    toggle.setAttribute("aria-label", "Lightcurve sonification unavailable");
  } else {
    toggle.addEventListener("click", () => {
      void toggleSonification();
    });
  }
  updateSonificationPitchLabel();
  updateSonificationToggleUi();
}

function updateSonificationPitchLabel(): void {
  const label = document.getElementById("sonificationHz");
  if (label) label.textContent = `${formatHz(sonificationReferenceHz)} Hz`;
}

function updateSonificationToggleUi(): void {
  const toggle = document.getElementById("sonificationToggle");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (toggle.disabled) {
    toggle.classList.remove("active");
    toggle.setAttribute("aria-pressed", "false");
    return;
  }
  const action = sonificationActive ? "Stop" : "Start";
  toggle.classList.toggle("active", sonificationActive);
  toggle.setAttribute("aria-pressed", String(sonificationActive));
  toggle.setAttribute("aria-label", `${action} lightcurve sonification`);
  toggle.title = `${action} lightcurve sonification`;
}

async function toggleSonification(): Promise<void> {
  if (sonificationActive) {
    stopSonification();
    return;
  }
  await startSonification();
}

function ensureAudioContext(): AudioContext | null {
  if (sonificationContext) return sonificationContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  sonificationContext = new AudioContextCtor();
  return sonificationContext;
}

async function startSonification(): Promise<void> {
  const context = ensureAudioContext();
  if (!context) return;
  await context.resume();
  if (sonificationStopTimer) {
    window.clearTimeout(sonificationStopTimer);
    sonificationStopTimer = 0;
  }
  stopSonificationGraph();
  const masterGain = context.createGain();
  const now = context.currentTime;
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(SONIFICATION_OUTPUT_GAIN, now + SONIFICATION_ATTACK_SECONDS);
  masterGain.connect(context.destination);
  sonificationMasterGain = masterGain;
  sonificationVoice = createSonificationVoice(context, masterGain, 1);
  sonificationActive = true;
  updateSonificationToggleUi();
}

function stopSonification(): void {
  if (!sonificationActive && !sonificationMasterGain && !sonificationVoices.size) return;
  const context = sonificationContext;
  const masterGain = sonificationMasterGain;
  sonificationActive = false;
  updateSonificationToggleUi();
  if (!context || !masterGain) {
    stopSonificationGraph();
    return;
  }
  const now = context.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setTargetAtTime(0, now, SONIFICATION_RELEASE_SECONDS / 3);
  const stopAt = now + SONIFICATION_RELEASE_SECONDS;
  sonificationVoices.forEach((voice) => stopSonificationVoice(voice, stopAt));
  sonificationStopTimer = window.setTimeout(() => {
    sonificationStopTimer = 0;
    if (!sonificationActive) stopSonificationGraph();
  }, (SONIFICATION_RELEASE_SECONDS + 0.03) * 1000);
}

function stopSonificationGraph(): void {
  if (sonificationStopTimer) {
    window.clearTimeout(sonificationStopTimer);
    sonificationStopTimer = 0;
  }
  sonificationVoices.forEach((voice) => {
    stopSonificationVoice(voice, sonificationContext?.currentTime ?? 0);
    disconnectSonificationVoice(voice);
  });
  sonificationMasterGain?.disconnect();
  sonificationVoice = null;
  sonificationMasterGain = null;
}

function updateSonificationFrequency(): void {
  const context = sonificationContext;
  if (!context || !sonificationActive) return;
  const now = context.currentTime;
  sonificationVoices.forEach((voice) => {
    voice.oscillator.frequency.setTargetAtTime(sonificationReferenceHz, now, SONIFICATION_FREQUENCY_GLIDE_SECONDS);
  });
}

function updateSonificationWaveform(): void {
  const context = sonificationContext;
  const masterGain = sonificationMasterGain;
  if (!context || !masterGain || !sonificationActive) return;
  const previousVoice = sonificationVoice;
  const nextVoice = createSonificationVoice(context, masterGain, 0);
  sonificationVoice = nextVoice;
  const now = context.currentTime;
  const fadeEnd = now + SONIFICATION_WAVEFORM_CROSSFADE_SECONDS;
  nextVoice.gain.gain.cancelScheduledValues(now);
  nextVoice.gain.gain.setValueAtTime(0, now);
  nextVoice.gain.gain.linearRampToValueAtTime(1, fadeEnd);
  if (previousVoice) {
    previousVoice.gain.gain.cancelScheduledValues(now);
    previousVoice.gain.gain.setValueAtTime(previousVoice.gain.gain.value, now);
    previousVoice.gain.gain.linearRampToValueAtTime(0, fadeEnd);
    stopSonificationVoice(previousVoice, fadeEnd + 0.02);
  }
}

function createSonificationVoice(context: AudioContext, output: AudioNode, initialGain: number): SonificationVoice {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(sonificationReferenceHz, now);
  const wave = createSonificationPeriodicWave(context);
  if (wave) oscillator.setPeriodicWave(wave);
  gain.gain.setValueAtTime(initialGain, now);
  oscillator.connect(gain);
  gain.connect(output);
  const voice: SonificationVoice = { oscillator, gain, stopped: false };
  oscillator.addEventListener("ended", () => disconnectSonificationVoice(voice), { once: true });
  sonificationVoices.add(voice);
  oscillator.start(now);
  return voice;
}

function stopSonificationVoice(voice: SonificationVoice, when: number): void {
  if (voice.stopped) return;
  voice.stopped = true;
  try {
    voice.oscillator.stop(Math.max(when, sonificationContext?.currentTime ?? 0));
  } catch {
    disconnectSonificationVoice(voice);
  }
}

function disconnectSonificationVoice(voice: SonificationVoice): void {
  voice.oscillator.disconnect();
  voice.gain.disconnect();
  sonificationVoices.delete(voice);
  if (sonificationVoice === voice) sonificationVoice = null;
}

function createSonificationPeriodicWave(context: AudioContext): PeriodicWave | null {
  const harmonicCount = Math.max(
    1,
    Math.min(SONIFICATION_MAX_HARMONICS, Math.floor((context.sampleRate / 2) / Math.max(sonificationReferenceHz, 1)))
  );
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  const waveformValues = circularSmooth(
    Array.from({ length: SONIFICATION_WAVEFORM_SAMPLES }, (_unused, index) =>
      sonificationValueAtPhase(index / SONIFICATION_WAVEFORM_SAMPLES)
    ),
    SONIFICATION_WAVEFORM_SMOOTH_PASSES
  );
  const mean = waveformValues.reduce((sum, value) => sum + value, 0) / waveformValues.length;
  const centered = waveformValues.map((value) => value - mean);
  const scale = Math.max(...centered.map((value) => Math.abs(value)), 1e-6);
  const normalized = centered.map((value) => value / scale);
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    let realSum = 0;
    let imagSum = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      const angle = (2 * Math.PI * harmonic * index) / normalized.length;
      realSum += normalized[index] * Math.cos(angle);
      imagSum += normalized[index] * Math.sin(angle);
    }
    const cutoffPosition = harmonic / (harmonicCount + 1);
    const lanczos = Math.sin(Math.PI * cutoffPosition) / (Math.PI * cutoffPosition);
    const hann = 0.5 * (1 + Math.cos(Math.PI * cutoffPosition));
    const taper = lanczos * lanczos * hann;
    real[harmonic] = ((2 * realSum) / normalized.length) * taper;
    imag[harmonic] = ((2 * imagSum) / normalized.length) * taper;
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function circularSmooth(values: number[], passes: number): number[] {
  let smoothed = [...values];
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((value, index) => {
      const previous = smoothed[(index - 1 + smoothed.length) % smoothed.length];
      const next = smoothed[(index + 1) % smoothed.length];
      return previous * 0.25 + value * 0.5 + next * 0.25;
    });
  }
  return smoothed;
}

function sonificationValueAtPhase(phase: number): number {
  if (!sonificationSamples.length) return Math.sin(2 * Math.PI * phase);
  if (sonificationSamples.length === 1) return sonificationSamples[0].value;
  if (phase <= sonificationSamples[0].phase) return sonificationSamples[0].value;
  const last = sonificationSamples[sonificationSamples.length - 1];
  if (phase >= last.phase) return last.value;
  let lo = 0;
  let hi = sonificationSamples.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (sonificationSamples[mid].phase <= phase) lo = mid;
    else hi = mid;
  }
  const a = sonificationSamples[lo];
  const b = sonificationSamples[hi];
  const span = b.phase - a.phase;
  if (span <= 0) return a.value;
  const mix = (phase - a.phase) / span;
  return a.value + (b.value - a.value) * mix;
}

function updateSonificationCurve(phase: PhaseResult): void {
  const firstCycleRows = phase.rows.filter((row) => row.tau >= 0 && row.tau <= 1);
  const nextSamples = firstCycleRows.length >= 3
    ? buildSonificationSamples(firstCycleRows, [0, 1])
    : buildSonificationSamples(latestRows);
  const nextSignature = sonificationSampleSignature(nextSamples);
  if (nextSignature === sonificationWaveformSignature) return;
  sonificationSamples = nextSamples;
  sonificationWaveformSignature = nextSignature;
  updateSonificationWaveform();
}

function sonificationSampleSignature(samples: SonificationSample[]): string {
  if (!samples.length) return "empty";
  const step = Math.max(1, Math.floor(samples.length / 48));
  const values: string[] = [String(samples.length)];
  for (let index = 0; index < samples.length; index += step) {
    const sample = samples[index];
    values.push(`${sample.phase.toFixed(4)}:${sample.value.toFixed(4)}`);
  }
  const last = samples[samples.length - 1];
  values.push(`${last.phase.toFixed(4)}:${last.value.toFixed(4)}`);
  return values.join("|");
}

function buildSonificationSamples(rows: Row[], domain?: NumericRange): SonificationSample[] {
  const finiteRows = rows.filter((row) => Number.isFinite(row.tau) && Number.isFinite(row.L));
  if (!finiteRows.length) return [];
  const start = domain?.[0] ?? finiteRows[0].tau;
  const end = domain?.[1] ?? finiteRows[finiteRows.length - 1].tau;
  if (end <= start) return [{ phase: 0, value: 0 }];
  const inDomain = finiteRows.filter((row) => row.tau >= start && row.tau <= end);
  if (!inDomain.length) return [];
  const luminosities = inDomain.map((row) => row.L);
  const minLuminosity = Math.min(...luminosities);
  const maxLuminosity = Math.max(...luminosities);
  const span = maxLuminosity - minLuminosity;
  const samples = strideDownsample(inDomain, SONIFICATION_MAX_SAMPLES)
    .map((row) => ({
      phase: clamp((row.tau - start) / (end - start), 0, 1),
      value: span > 1e-12 ? clamp(2 * ((row.L - minLuminosity) / span) - 1, -1, 1) : 0
    }))
    .sort((a, b) => a.phase - b.phase);
  if (!samples.length) return [];
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first.phase > 0) samples.unshift({ phase: 0, value: first.value });
  if (last.phase >= 1 - 1e-6) last.value = first.value;
  else samples.push({ phase: 1, value: first.value });
  return samples;
}

function buildControls(): void {
  setupResponsiveSidebarControls();
  setupSonificationControls();
  buildPresetButtons();
  buildSolverButtons();
  buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
  buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
  rebuildIntegrationControls();
  buildParameterTable();

  const variableM = el<HTMLInputElement>("variableM");
  variableM.checked = state.variableM;
  variableM.addEventListener("change", (event) => {
    state.variableM = (event.target as HTMLInputElement).checked;
    updateEquationBlocks();
    refreshActivePreset();
    scheduleSolve();
  });

  const runUntilStable = el<HTMLInputElement>("runUntilStable");
  runUntilStable.checked = state.runUntilStable;
  runUntilStable.addEventListener("change", (event) => {
    state.runUntilStable = (event.target as HTMLInputElement).checked;
    rebuildIntegrationControls();
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

  document.querySelectorAll<HTMLButtonElement>("[data-phase-anchor]").forEach((button) => {
    button.addEventListener("click", () => {
      phaseAnchor = button.dataset.phaseAnchor === "max" ? "max" : "min";
      updatePhaseAnchorButtons();
      drawAll();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      state.driver = button.dataset.driver === "abs-v" ? "abs-v" : "h";
      updateDriverButtons();
      updateEquationBlocks();
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
  updatePhaseAnchorButtons();
  updateSolverButtons();
  updateEquationBlocks();
  updateAllSliderLabels();
  updateResetButtons();
}

function setupResponsiveSidebarControls(): void {
  const details = document.getElementById("sidebarControls") as HTMLDetailsElement | null;
  if (!details) return;
  const media = window.matchMedia(SIDEBAR_COLLAPSE_QUERY);
  const sync = () => {
    details.open = !media.matches;
  };
  sync();
  media.addEventListener("change", sync);
}

function setupInteractivePlots(): void {
  Object.entries(INTERACTIVE_CANVASES).forEach(([canvasId, plotId]) => {
    const canvas = el<HTMLCanvasElement>(canvasId);
    canvas.classList.add("interactive-canvas");
    canvas.addEventListener("pointerdown", (event) => beginPlotSelection(event, canvasId, plotId));
    canvas.addEventListener("pointermove", (event) => updatePlotSelection(event, canvasId));
    canvas.addEventListener("pointerup", (event) => finishPlotSelection(event, canvasId));
    canvas.addEventListener("pointercancel", (event) => cancelPlotSelection(event, canvasId));
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
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
  if (event.button !== 0 && event.button !== 2) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  if (!render) return;
  const point = canvasPoint(canvas, event);
  if (!pointInPlot(point, render.plot)) return;
  event.preventDefault();
  const clamped = clampPointToPlot(point, render.plot);
  activeSelection = {
    plotId,
    canvasId,
    pointerId: event.pointerId,
    mode: event.button === 2 ? "pan" : "zoom",
    startX: clamped.x,
    startY: clamped.y,
    currentX: clamped.x,
    currentY: clamped.y,
    startXlim: render.xlim,
    startYlim: render.ylim
  };
  canvas.setPointerCapture(event.pointerId);
  drawAll();
}

function updatePlotSelection(event: PointerEvent, canvasId: string): void {
  if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = plotRenderStates.get(canvasId);
  if (!render) return;
  const point = activeSelection.mode === "pan" ? canvasPoint(canvas, event) : clampPointToPlot(canvasPoint(canvas, event), render.plot);
  activeSelection.currentX = point.x;
  activeSelection.currentY = point.y;
  if (activeSelection.mode === "pan") {
    const xDelta = ((point.x - activeSelection.startX) / render.plot.width) * (activeSelection.startXlim[1] - activeSelection.startXlim[0]);
    const yDelta = (-(point.y - activeSelection.startY) / render.plot.height) * (activeSelection.startYlim[1] - activeSelection.startYlim[0]);
    plotViews[activeSelection.plotId] = {
      xlim: validRange([activeSelection.startXlim[0] - xDelta, activeSelection.startXlim[1] - xDelta]) || activeSelection.startXlim,
      ylim: validRange([activeSelection.startYlim[0] - yDelta, activeSelection.startYlim[1] - yDelta]) || activeSelection.startYlim
    };
    updatePlotResetButtons();
  }
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
  if (selection.mode === "pan") {
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
      rebuildIntegrationControls();
      refreshActivePreset();
      scheduleSolve();
    });
    container.appendChild(button);
  });
}

function activeIntegrationControlKeys(): Set<ControlParameterKey> {
  const visible = new Set<ControlParameterKey>(["tEnd", "step", "maxStep"]);
  if (state.solver === "midpoint") {
    visible.add("logErrTol");
  } else {
    visible.add("logRtol");
    visible.add("logAtol");
  }
  if (state.runUntilStable) {
    visible.add("logStabilityTol");
    visible.add("stableCycles");
  }
  return visible;
}

function rebuildIntegrationControls(): void {
  const container = el<HTMLDivElement>("integrationControls");
  if (!container.querySelector("[data-control-key]")) {
    buildSliderGroup("integrationControls", CONTROL_GROUPS.integration);
  }
  updateIntegrationControlVisibility();
  updateResetButtons();
}

function updateIntegrationControlVisibility(): void {
  const visible = activeIntegrationControlKeys();
  document.querySelectorAll<HTMLElement>("#integrationControls [data-control-key]").forEach((wrapper) => {
    const key = wrapper.dataset.controlKey as ControlParameterKey | undefined;
    wrapper.hidden = !key || !visible.has(key);
  });
}

function buildSliderGroup(containerId: string, controls: ControlDef[]): void {
  const container = el<HTMLDivElement>(containerId);
  container.querySelectorAll<HTMLButtonElement>("[data-reset-key]").forEach((button) => {
    const key = button.dataset.resetKey as ControlParameterKey | undefined;
    if (key) controlElements.delete(key);
  });
  container.innerHTML = "";
  controls.forEach(([key, symbol, name, min, max, step, _defaultValue, color]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "slider-control";
    wrapper.dataset.controlKey = key;
    wrapper.style.setProperty("--accent", color);
    wrapper.innerHTML = `
      <div class="slider-label" title="${name}">
        <span class="slider-name">${name}</span>
        <span class="slider-reading"><span class="slider-symbol">${symbol}</span><span class="slider-equals">=</span><span class="slider-value" data-value-for="${key}"></span></span>
      </div>
      <div class="slider-track">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${String(sliderInputValue(key))}" aria-label="${name}">
        ${key === "tEnd" ? tauScaleMarkup() : ""}
        </div>
      <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">↺</button>
    `;
    const input = wrapper.querySelector("input");
    if (!input) throw new Error("missing slider input");
    input.addEventListener("input", (event) => {
      state[key] = valueFromSlider(key, Number((event.target as HTMLInputElement).value));
      updateSliderLabel(key);
      if (key === "m") updateEquationBlocks();
      refreshActivePreset();
      scheduleSolve();
    });
    wrapper.querySelector<HTMLButtonElement>("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
    container.appendChild(wrapper);
    controlElements.set(key, input);
    updateSliderLabel(key);
  });
  queueMathTypeset([container]);
}

function tauScaleMarkup(): string {
  const maxLog = Math.log10(Math.max(...TAU_TICKS));
  return `<div class="slider-scale">${TAU_TICKS.map((tick) => {
    const position = (Math.log10(tick) / maxLog) * 100;
    return `<span style="--tick-position:${position.toFixed(4)}%">${tick}</span>`;
  }).join("")}</div>`;
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
  const numericalTable = el<HTMLTableSectionElement>("numericalParameterTable");
  const meaning = (text: string): string => text.trim().replace(/\.$/, "");
  const controlRows = (controls: ControlDef[]) => controls
    .map(([key, symbol, _name, _min, _max, _step, _defaultValue, color]) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${meaning(PARAMETER_DESCRIPTIONS[key] || "")}</td>
      </tr>
    `)
    .join("");

  tunableTable.innerHTML = controlRows(CONTROL_GROUPS.physical) + `
      <tr><td class="symbol-cell" style="--color:${COLORS.H}">driver</td><td>${meaning(`Convective driving choice: the standard Stellingwerf pressure form is \\(\\sqrt{${TEX.H}}\\); \\(\\sqrt{|${TEX.V}|}\\) is retained as a diagnostic variant.`)}</td></tr>
      <tr><td class="symbol-cell" style="--color:${COLORS.m}">geometry</td><td>${meaning(`Switch between fixed paper-model \\(${TEX.m}\\) and radius-dependent local geometry \\(${TEX.m}_{\\mathrm{eff}}(${TEX.R})\\).`)}</td></tr>
    `;
  numericalTable.innerHTML = controlRows(CONTROL_GROUPS.integration) + `
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>${meaning("Numerical method: RK45 default, DOP853 reference, or historical midpoint.")}</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">phase window</td><td>${meaning("Reference cycles use the first valid luminosity window; final cycles use the latest valid window; the lightcurve control chooses min- or max-light phase zero.")}</td></tr>
    `;
  queueMathTypeset();
}

function updateEquationBlocks(): void {
  const eta = Math.cbrt(Math.max(0, 1 - 3 / state.m));
  const etaDisplay = fmtFixed(eta, 2);
  const geometry = state.variableM
    ? `\\ozMass{m}_{\\mathrm{eff}} &= \\frac{3}{1-(\\ozNeutral{\\eta}/\\ozRadius{R})^3}
       \\qquad \\ozNeutral{\\eta}=\\left(1-\\frac{3}{\\ozMass{m}}\\right)^{1/3}=\\ozNeutral{${etaDisplay}}`
    : `\\ozMass{m}_{\\mathrm{eff}} &= \\ozMass{m}`;
  const driver = state.driver === "abs-v" ? "\\sqrt{|\\ozVelocity{V}|}" : "\\sqrt{\\ozPressure{H}}";
  const odeNode = el<HTMLDivElement>("odeEquations");
  const luminosityNode = el<HTMLDivElement>("luminosityEquations");
  odeNode.dataset.driverMode = state.driver;
  const odeHtml = `
    \\[
    \\begin{aligned}
    \\frac{d\\ozRadius{R}}{d\\ozTau{\\tau}} &=
      \\ozVelocity{V}\\\\[0.35em]
    \\frac{d\\ozVelocity{V}}{d\\ozTau{\\tau}} &=
      \\frac{\\ozPressure{H}}{\\ozRadius{R}^{\\ozMass{m}_{\\mathrm{eff}}\\ozGamma{\\Gamma_1}-2}}
      - \\frac{1}{\\ozRadius{R}^{2}}
      - \\ozDamping{C_q}\\ozVelocity{V}^{3}\\\\[0.35em]
    \\frac{d\\ozPressure{H}}{d\\ozTau{\\tau}} &=
      \\ozZeta{\\zeta}\\,
      \\ozRadius{R}^{\\ozMass{m}_{\\mathrm{eff}}(\\ozGamma{\\Gamma_1}-1)}
      \\left[
        \\ozRadius{R}^{\\ozSource{U}}
        - \\ozLuminosity{L}
      \\right]\\\\[0.35em]
    \\frac{d\\ozConvective{U_c}}{d\\ozTau{\\tau}} &=
      \\ozZetac{\\zeta_c}
      \\left[
        \\ozRadius{R}^{-\\ozMass{m}_{\\mathrm{eff}}(\\ozGamma{\\Gamma_1}-1)/2}\\,${driver}
        - \\ozConvective{U_c}
      \\right]
    \\end{aligned}
    \\]
  `;
  luminosityNode.dataset.geometryMode = state.variableM ? "radius-dependent" : "fixed";
  luminosityNode.dataset.etaValue = etaDisplay;
  const luminosityHtml = `
    \\[
    \\begin{aligned}
    ${geometry}\\\\[0.35em]
    \\ozRadiative{L_r} &=
      \\ozRadius{R}^{4+\\ozMass{m}_{\\mathrm{eff}}
      \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
      \\ozPressure{H}^{\\ozPink{s}+4}\\\\[0.35em]
    \\ozConvLum{L_c} &=
      \\ozRadius{R}^{-(\\ozMass{m}_{\\mathrm{eff}}-2)}
      \\ozConvective{U_c}^{3}\\\\[0.35em]
    \\ozLuminosity{L} &=
      (1-\\ozGammac{\\gamma_c})\\ozRadiative{L_r}
      + \\ozGammac{\\gamma_c}\\ozConvLum{L_c}
    \\end{aligned}
    \\]
  `;
  stageMathHtml(odeNode, odeHtml);
  stageMathHtml(luminosityNode, luminosityHtml);
  queueMathTypeset([odeNode, luminosityNode]);
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
  const targets: HTMLElement[] = [];
  Object.entries(values).forEach(([id, value]) => {
    const node = el<HTMLElement>(id);
    if (node.dataset.mathSource === value || stagedMathUpdates.get(node)?.html === value) return;
    node.dataset.mathSource = value;
    stageMathHtml(node, value);
    targets.push(node);
  });
  if (targets.length) queueMathTypeset(targets);
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
  if (key === "m") updateEquationBlocks();
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
  el<HTMLSpanElement>("presetSummaryLabel").textContent = activePreset;
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

function updatePhaseAnchorButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-phase-anchor]").forEach((button) => {
    const active = button.dataset.phaseAnchor === phaseAnchor;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
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
  rebuildIntegrationControls();
  updateEquationBlocks();
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
    ctx.fillText(fmt(ylim[1] - ((ylim[1] - ylim[0]) * i) / 4, 2), plot.left - PLOT_LAYOUT.yTickGap, y);
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = xlabelColor;
  ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
  ctx.save();
  ctx.translate(PLOT_LAYOUT.yLabelX, plot.top + plot.height / 2);
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
  const plot = {
    left: PLOT_LAYOUT.left,
    top: PLOT_LAYOUT.top,
    width: rect.width - PLOT_LAYOUT.left - PLOT_LAYOUT.right,
    height: rect.height - PLOT_LAYOUT.top - PLOT_LAYOUT.bottom
  };
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
  if (activeSelection.mode !== "zoom") return;
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
  const signature = JSON.stringify({
    plotId: options.plotId || "",
    items: items.map(({ label, color, key, toggleLabel }) => ({ label, color, key: key || "", toggleLabel: toggleLabel || "" }))
  });
  if (legendSignatures.get(id) === signature) {
    updateLegendToggleState(node, options.plotId);
    return;
  }
  legendSignatures.set(id, signature);
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
        updateLegendToggleState(node, options.plotId);
        drawAll();
      });
    });
  }
  queueMathTypeset([node]);
}

function updateLegendToggleState(node: HTMLElement, plotId?: InteractivePlotId): void {
  if (!plotId) return;
  node.querySelectorAll<HTMLButtonElement>("[data-plot-series]").forEach((button) => {
    const key = button.dataset.plotSeries as ToggleSeriesKey | undefined;
    if (!key) return;
    const visible = seriesIsVisible(plotId, key);
    button.classList.toggle("is-hidden", !visible);
    button.setAttribute("aria-pressed", String(visible));
  });
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
    case "not_enough_minima":
      return "phase unavailable: fewer than three luminosity minima";
    case "not_enough_maxima":
      return "phase unavailable: fewer than three luminosity maxima";
    case "amplitude_below_threshold":
      return "phase unavailable: luminosity cycles are below threshold";
    case "reference_out_of_range":
      return "phase unavailable: comparison does not cover the reference window";
  }
}

function phaseForRows(rows: Row[]): PhaseResult {
  return buildTwoCyclePhase(rows, {
    warmupTau: state.phaseWarmupTau,
    minAmplitude: state.phaseMinAmplitude,
    selection: state.phaseMode === "final" ? "last" : "first",
    anchor: phaseAnchor
  });
}

function timeDomain(rows: readonly Row[]): NumericRange {
  if (!rows.length) return [0, 1];
  const first = rows[0].tau;
  const last = rows[rows.length - 1].tau;
  return first === last ? range([first, last], 0.02) : [first, last];
}

function integrationTimeRange(): NumericRange {
  return [0, Math.max(state.tEnd, Number.EPSILON)];
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
  const stopReason = stopReasonLabel(latestResult.message, state.runUntilStable);
  const okStatus = latestResult.message === "equilibrium"
    || latestResult.message === "limit_cycle"
    || (!state.runUntilStable && latestResult.status === "complete");
  const final = rows[rows.length - 1];
  const phase = phaseForRows(rows);
  updateSonificationCurve(phase);
  const metricsNode = el<HTMLDivElement>("metrics");
  const metricItems = [
    { label: "stop", value: stopReason, className: okStatus ? "status-ok" : "status-warn" },
    { label: `final \\(${TEX.tau}\\)`, value: final ? fmt(final.tau || 0, 4) : "n/a" },
    { label: "models", value: rows.length },
    { label: "accepted", value: latestResult.stats.acceptedSteps },
    { label: "rejected", value: latestResult.stats.rejectedSteps },
    { label: "max err", value: fmt(latestResult.stats.maxNormalizedError, 3) },
    { label: "period", value: phase.period ? fmt(phase.period, 3) : "n/a" },
    { label: "phase", value: phase.reason === "ok" ? "available" : "unavailable" },
    { label: `final \\(${TEX.R}\\)`, value: final ? fmt(final.R, 3) : "n/a" },
    { label: `final \\(${TEX.L}\\)`, value: final ? fmt(final.L, 3) : "n/a" }
  ];
  const metricsHtml = metricItems
    .map(({ label, value, className }) => `<span class="metric${className ? ` ${className}` : ""}">${label}<b>${value}</b></span>`)
    .join("");
  stageMathHtml(metricsNode, metricsHtml);
  queueMathTypeset([metricsNode]);

  const phaseSample = phase.rows.length ? downsample(phase.rows, 1800, ["L", "V"]) : [];
  const phaseMessage = phaseUnavailableLabel(phase);
  const phasePeriodLabel = `phase (period = ${phase.period ? fmt(phase.period, 3) : "n/a"} τ)`;
  drawSeries("lightCanvas", [
    { label: "L", color: COLORS.L, rows: phaseSample, x: (row) => row.tau, y: (row) => row.L }
  ], {
    xlabel: phasePeriodLabel,
    ylabel: "luminosity L",
    ylabelColor: COLORS.L,
    xlim: [0, 2],
    ylim: phaseSample.length ? undefined : [0, 1],
    message: phaseMessage
  });

  drawSeries("velocityCanvas", [
    { label: "V", color: COLORS.V, rows: phaseSample, x: (row) => row.tau, y: (row) => row.V }
  ], {
    xlabel: phasePeriodLabel,
    ylabel: "radial velocity V",
    ylabelColor: COLORS.V,
    xlim: [0, 2],
    ylim: phaseSample.length ? undefined : [0, 1],
    message: phaseMessage
  });

  const timeXlim = integrationTimeRange();
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
    message: "all series hidden"
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
  window.addEventListener("load", () => queueMathTypeset());
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
