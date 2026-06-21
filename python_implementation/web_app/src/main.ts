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
  mAt,
  sample,
  solveModel
} from "./model";
import {
  centerSliderSample,
  defaultGridRange,
  normalizeGridRange,
  parameterValueFromSlider,
  sliderMeta,
  sliderValueFromParameter,
  type GridCompleteMessage,
  type GridModelResult,
  type GridRange,
  type GridWorkerMessage
} from "./grid";
import { computeGridWithMessages } from "./gridCompute";
import { buildTwoCyclePhase, type PhaseAnchor, type PhaseResult } from "./phase";
import { SOLVER_NAMES, type SolverName } from "./solvers";
import {
  blackbodyRgbForTemperature,
  inferEffectiveTemperature,
  phaseRowAt,
  rgbCss,
  shellGeometryFor,
  shellGeometryFromModel,
  type RgbColor
} from "./visualization";

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
const PIANO_VISIBLE_OCTAVES = 2;
const PIANO_MIN_START_OCTAVE = 1;
const PIANO_MAX_START_OCTAVE = 6;
const PIANO_DEFAULT_START_OCTAVE = 3;
const PIANO_OUTPUT_GAIN = 0.45;
const SONIFICATION_ATTACK_SECONDS = 1;
const SONIFICATION_RELEASE_SECONDS = 0.14;
const SONIFICATION_OUTPUT_GAIN = 0.12;
const SONIFICATION_FREQUENCY_GLIDE_SECONDS = 0.035;
const SONIFICATION_WAVEFORM_CROSSFADE_SECONDS = 0.18;
const SONIFICATION_MAX_SAMPLES = 2400;
const SONIFICATION_WAVEFORM_SAMPLES = 512;
const SONIFICATION_WAVEFORM_SMOOTH_PASSES = 5;
const SONIFICATION_MAX_HARMONICS = 32;
const PIANO_DEFAULT_ENVELOPE: PianoEnvelope = { attack: 0.015, decay: 0.22, release: 0.36 };
const PIANO_DEFAULT_SUSTAIN_LEVEL = 0.38;
const MODEL_ANIMATION_BASE_DURATION_MS = 4000;
const MODEL_ANIMATION_MIN_SPEED = 0.25;
const MODEL_ANIMATION_MAX_SPEED = 4;
const GRID_LOOP_BASE_INTERVAL_MS = 90;
const GRID_LOOP_MIN_SPEED = 0.25;
const GRID_LOOP_MAX_SPEED = 4;
const PHASE_MARKER_COLOR = "#FFD166";
const PHASE_SCRUB_CANVAS_IDS = ["lightCanvas", "velocityCanvas", "pressureCanvas"] as const;
const SONIFICATION_SOURCE_LABELS: Record<SonificationSource, string> = {
  luminosity: "luminosity",
  velocity: "radial velocity",
  pressure: "pressure"
};
const controlElements = new Map<ControlParameterKey, HTMLInputElement>();
const gridRangeElements = new Map<ControlParameterKey, GridRangeElements>();
const gridState: GridModeState = {
  enabled: false,
  ranges: new Map(),
  savedRanges: new Map(),
  selectedLoopKey: null,
  status: "idle",
  statusText: "Grid off",
  requestId: 0,
  worker: null,
  workerDisabled: false,
  fallbackToken: 0,
  debounceTimer: 0,
  animationTimer: 0,
  animationIndex: 0,
  animationDirection: 1,
  results: [],
  pathResults: [],
  hoverResult: null,
  heldResult: null,
  lastComplete: null,
  restorePlotVisibility: null
};
let currentAnimationPhase = 0;
let modelAnimationSpeed = 1;
let gridLoopSpeed = 1;
let modelAnimationFrame = 0;
let modelAnimationStartTime: number | null = null;
let latestPhaseRows: Row[] = [];
let latestPhaseSample: Row[] = [];
let latestPhaseMessage: string | undefined;
let latestPhasePeriodLabel = "phase (period = n/a τ)";
let latestPhaseLuminosityRange: NumericRange = [0, 1];
let sonificationReferenceNote = MIDDLE_C_NOTE;
let sonificationReferenceHz = noteToFrequency(MIDDLE_C_NOTE);
let sonificationSamples: SonificationSample[] = [];
let sonificationWaveformSignature = "";
let sonificationSource: SonificationSource = "luminosity";
let sonificationContext: AudioContext | null = null;
let sonificationVoice: SonificationVoice | null = null;
let sonificationMasterGain: GainNode | null = null;
let sonificationStopTimer = 0;
const sonificationVoices = new Set<SonificationVoice>();
let sonificationActive = false;
let activePhaseScrub: PhaseScrubInteraction | null = null;
let pianoModeActive = false;
let pianoStartOctave = PIANO_DEFAULT_START_OCTAVE;
let pianoMasterGain: GainNode | null = null;
let pianoEnvelope: PianoEnvelope = { ...PIANO_DEFAULT_ENVELOPE };
let pianoSustainLevel = PIANO_DEFAULT_SUSTAIN_LEVEL;
const activePianoVoices = new Map<string, PianoVoice>();
const activePianoMidiCounts = new Map<number, number>();
const TAU_SCALE_MAX = 1000;
const TAU_TICKS = [1, 3, 10, 30, 100, 300];
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
type PlotSeriesKey = "R" | "V" | "H" | "Uc" | "L" | "Lr" | "Lc";
type UserPlotId = "model" | "light" | "velocity" | "time" | "lum";
type SonificationSource = "luminosity" | "velocity" | "pressure";

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

interface PhaseScrubInteraction {
  canvasId: string;
  pointerId: number;
}

interface StagedMathUpdate {
  html: string;
  version: number;
}

interface GridColorbarRegion {
  canvasId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  hitLeft: number;
  hitTop: number;
  hitRight: number;
  hitBottom: number;
}

interface FourierPointHit {
  result: GridModelResult;
  x: number;
  y: number;
  radius: number;
}

interface FourierAxisLabel {
  base: "r" | "phi";
  subscript: string;
}

interface GridCanvasInteraction {
  type: "colorbar" | "fourier-hold";
  canvasId: string;
  pointerId: number;
}

type GridStatusKind = "idle" | "queued" | "running" | "coarsening" | "complete" | "error";

interface GridModeState {
  enabled: boolean;
  ranges: Map<ControlParameterKey, GridRange>;
  savedRanges: Map<ControlParameterKey, GridRange>;
  selectedLoopKey: ControlParameterKey | null;
  status: GridStatusKind;
  statusText: string;
  requestId: number;
  worker: Worker | null;
  workerDisabled: boolean;
  fallbackToken: number;
  debounceTimer: number;
  animationTimer: number;
  animationIndex: number;
  animationDirection: 1 | -1;
  results: GridModelResult[];
  pathResults: GridModelResult[];
  hoverResult: GridModelResult | null;
  heldResult: GridModelResult | null;
  lastComplete: GridCompleteMessage | null;
  restorePlotVisibility: Pick<Record<UserPlotId, boolean>, "model" | "time" | "lum"> | null;
}

interface GridRangeElements {
  wrapper: HTMLElement;
  center: HTMLInputElement;
  lower: HTMLInputElement;
  upper: HTMLInputElement;
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

interface PianoEnvelope {
  attack: number;
  decay: number;
  release: number;
}

type PianoResetKey = keyof PianoEnvelope | "sustain";

interface PianoVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  midi: number;
  startedAt: number;
  attack: number;
  decay: number;
  sustain: number;
  released: boolean;
}

interface KeyboardBinding {
  code: string;
  label: string;
  offset: number;
}

const PIANO_KEYBOARD_BINDINGS: KeyboardBinding[] = [
  { code: "KeyZ", label: "Z", offset: 0 },
  { code: "KeyS", label: "S", offset: 1 },
  { code: "KeyX", label: "X", offset: 2 },
  { code: "KeyD", label: "D", offset: 3 },
  { code: "KeyC", label: "C", offset: 4 },
  { code: "KeyV", label: "V", offset: 5 },
  { code: "KeyG", label: "G", offset: 6 },
  { code: "KeyB", label: "B", offset: 7 },
  { code: "KeyH", label: "H", offset: 8 },
  { code: "KeyN", label: "N", offset: 9 },
  { code: "KeyJ", label: "J", offset: 10 },
  { code: "KeyM", label: "M", offset: 11 },
  { code: "KeyQ", label: "Q", offset: 12 },
  { code: "Digit2", label: "2", offset: 13 },
  { code: "KeyW", label: "W", offset: 14 },
  { code: "Digit3", label: "3", offset: 15 },
  { code: "KeyE", label: "E", offset: 16 },
  { code: "KeyR", label: "R", offset: 17 },
  { code: "Digit5", label: "5", offset: 18 },
  { code: "KeyT", label: "T", offset: 19 },
  { code: "Digit6", label: "6", offset: 20 },
  { code: "KeyY", label: "Y", offset: 21 },
  { code: "Digit7", label: "7", offset: 22 },
  { code: "KeyU", label: "U", offset: 23 }
];

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

const PLOT_PANEL_LABELS: Record<UserPlotId, string> = {
  model: "One-Zone Shell",
  light: "Lightcurve",
  velocity: "RV Curve",
  time: "History",
  lum: "Luminosity Evolution"
};

const plotPanelVisibility: Record<UserPlotId, boolean> = {
  model: true,
  light: true,
  velocity: true,
  time: true,
  lum: true
};

const plotRenderStates = new Map<string, PlotRenderState>();
const legendSignatures = new Map<string, string>();
let activeSelection: PlotSelection | null = null;
const gridColorbarRegions = new Map<string, GridColorbarRegion>();
let fourierPointHits: FourierPointHit[] = [];
let activeGridCanvasInteraction: GridCanvasInteraction | null = null;
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

function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function noteNameForMidi(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${midiToOctave(midi)}`;
}

function firstVisiblePianoMidi(): number {
  return 12 * (pianoStartOctave + 1);
}

function pianoOctaveLabel(): string {
  const first = firstVisiblePianoMidi();
  const last = first + PIANO_VISIBLE_OCTAVES * 12 - 1;
  return `${noteNameForMidi(first)}-${noteNameForMidi(last)}`;
}

function keyboardMidiForCode(code: string): number | null {
  const binding = PIANO_KEYBOARD_BINDINGS.find((item) => item.code === code);
  if (!binding) return null;
  return firstVisiblePianoMidi() + binding.offset;
}

function keyboardLabelForOffset(offset: number): string {
  return PIANO_KEYBOARD_BINDINGS.find((item) => item.offset === offset)?.label || "";
}

function setupSonificationControls(): void {
  const piano = el<HTMLButtonElement>("pianoToggle");
  const toggle = el<HTMLButtonElement>("sonificationToggle");
  const pitch = el<HTMLInputElement>("sonificationPitch");
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  pitch.addEventListener("input", handleSonificationSliderInput);
  document.querySelectorAll<HTMLButtonElement>("[data-sonify-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.dataset.sonifySource;
      if (!isSonificationSource(source) || source === sonificationSource) return;
      sonificationSource = source;
      drawAll();
    });
  });
  if (!AudioContextCtor) {
    piano.disabled = true;
    piano.title = "Audio is not supported in this browser";
    piano.setAttribute("aria-label", "Piano unavailable");
    toggle.disabled = true;
    toggle.title = "Audio is not supported in this browser";
    toggle.setAttribute("aria-label", "Lightcurve sonification unavailable");
  } else {
    piano.addEventListener("click", togglePianoMode);
    toggle.addEventListener("click", () => {
      void toggleSonification();
    });
  }
  setupPianoControls();
  updateSonificationSourceControls();
  updateHeaderAudioControls();
  updateSonificationToggleUi();
  updatePianoToggleUi();
  window.addEventListener("keydown", handlePianoKeyDown);
  window.addEventListener("keyup", handlePianoKeyUp);
  window.addEventListener("blur", releaseAllPianoNotes);
}

function isSonificationSource(value: string | undefined): value is SonificationSource {
  return value === "luminosity" || value === "velocity" || value === "pressure";
}

function updateSonificationSourceControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-sonify-source]").forEach((button) => {
    const source = button.dataset.sonifySource;
    const active = source === sonificationSource;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (isSonificationSource(source)) button.title = `Sonify ${SONIFICATION_SOURCE_LABELS[source]}`;
  });
  const pressureVisible = sonificationSource === "pressure";
  const pressurePanel = document.getElementById("pressurePhasePanel");
  if (pressurePanel instanceof HTMLElement) pressurePanel.hidden = !pressureVisible;
  const plotGrid = document.querySelector<HTMLElement>(".plot-grid");
  if (plotGrid) plotGrid.dataset.pressureVisible = String(pressureVisible);
  updatePlotGridColumns();
  if (pressureVisible) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(drawPhasePlots));
  }
}

function handleSonificationSliderInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (pianoModeActive) {
    pianoStartOctave = Number(input.value);
    updateHeaderAudioControls();
    buildPianoKeyboard();
    return;
  }
  sonificationReferenceNote = Number(input.value);
  sonificationReferenceHz = noteToFrequency(sonificationReferenceNote);
  updateHeaderAudioControls();
  updateSonificationFrequency();
  updateSonificationWaveform();
}

function updateHeaderAudioControls(): void {
  const slider = document.getElementById("sonificationPitch");
  if (slider instanceof HTMLInputElement) {
    if (pianoModeActive) {
      slider.min = String(PIANO_MIN_START_OCTAVE);
      slider.max = String(PIANO_MAX_START_OCTAVE);
      slider.step = "1";
      slider.value = String(pianoStartOctave);
      slider.setAttribute("aria-label", "shown piano octaves");
      slider.title = "Shown piano octaves";
    } else {
      slider.min = String(PIANO_MIN_NOTE);
      slider.max = String(PIANO_MAX_NOTE);
      slider.step = "1";
      slider.value = String(sonificationReferenceNote);
      slider.setAttribute("aria-label", "reference pitch");
      slider.title = "Reference pitch";
    }
  }
  const label = document.getElementById("sonificationHz");
  if (label) label.textContent = pianoModeActive ? pianoOctaveLabel() : `${formatHz(sonificationReferenceHz)} Hz`;
}

function updateSonificationToggleUi(): void {
  const toggle = document.getElementById("sonificationToggle");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (!(window.AudioContext || window.webkitAudioContext)) {
    toggle.disabled = true;
    toggle.classList.remove("active");
    toggle.setAttribute("aria-pressed", "false");
    return;
  }
  if (pianoModeActive) {
    toggle.classList.remove("active");
    toggle.disabled = true;
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Continuous sonification muted in piano mode");
    toggle.title = "Continuous sonification muted in piano mode";
    return;
  }
  toggle.disabled = false;
  const action = sonificationActive ? "Stop" : "Start";
  toggle.classList.toggle("active", sonificationActive);
  toggle.setAttribute("aria-pressed", String(sonificationActive));
  toggle.setAttribute("aria-label", `${action} lightcurve sonification`);
  toggle.title = `${action} lightcurve sonification`;
}

function updatePianoToggleUi(): void {
  const toggle = document.getElementById("pianoToggle");
  if (!(toggle instanceof HTMLButtonElement)) return;
  toggle.classList.toggle("active", pianoModeActive);
  toggle.setAttribute("aria-pressed", String(pianoModeActive));
  toggle.setAttribute("aria-label", `${pianoModeActive ? "Hide" : "Show"} lightcurve piano`);
  toggle.title = `${pianoModeActive ? "Hide" : "Show"} lightcurve piano`;
}

function togglePianoMode(): void {
  pianoModeActive = !pianoModeActive;
  if (pianoModeActive) {
    stopSonification();
    buildPianoKeyboard();
    setPianoPanelVisible(true);
  } else {
    releaseAllPianoNotes();
    setPianoPanelVisible(false);
  }
  updateHeaderAudioControls();
  updateSonificationToggleUi();
  updatePianoToggleUi();
  drawAdsrVisualization();
}

function setPianoPanelVisible(visible: boolean): void {
  const panel = document.getElementById("pianoPanel");
  if (!panel) return;
  panel.hidden = !visible;
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function setupPianoControls(): void {
  const bindEnvelopeSlider = (id: string, key: keyof PianoEnvelope) => {
    const input = document.getElementById(id);
    if (!(input instanceof HTMLInputElement)) return;
    input.value = String(pianoEnvelope[key]);
    input.addEventListener("input", () => {
      pianoEnvelope = { ...pianoEnvelope, [key]: Number(input.value) };
      updatePianoControlLabels();
      updatePianoResetButtons();
      drawAdsrVisualization();
    });
  };
  bindEnvelopeSlider("pianoAttack", "attack");
  bindEnvelopeSlider("pianoDecay", "decay");
  bindEnvelopeSlider("pianoRelease", "release");
  const sustain = document.getElementById("pianoSustain");
  if (sustain instanceof HTMLInputElement) {
    sustain.value = String(pianoSustainLevel);
    sustain.addEventListener("input", () => {
      pianoSustainLevel = Number(sustain.value);
      updatePianoControlLabels();
      updatePianoResetButtons();
      drawAdsrVisualization();
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-piano-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.pianoReset as PianoResetKey | undefined;
      if (key) resetPianoControl(key);
    });
  });
  buildPianoKeyboard();
  updatePianoControlLabels();
  updatePianoResetButtons();
  drawAdsrVisualization();
}

function resetPianoControl(key: PianoResetKey): void {
  if (key === "sustain") {
    pianoSustainLevel = PIANO_DEFAULT_SUSTAIN_LEVEL;
    const input = document.getElementById("pianoSustain");
    if (input instanceof HTMLInputElement) input.value = String(pianoSustainLevel);
  } else {
    pianoEnvelope = { ...pianoEnvelope, [key]: PIANO_DEFAULT_ENVELOPE[key] };
    const input = document.getElementById(`piano${capitalize(key)}`);
    if (input instanceof HTMLInputElement) input.value = String(pianoEnvelope[key]);
  }
  updatePianoControlLabels();
  updatePianoResetButtons();
  drawAdsrVisualization();
}

function updatePianoResetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-piano-reset]").forEach((button) => {
    const key = button.dataset.pianoReset as PianoResetKey | undefined;
    if (!key) return;
    const current = key === "sustain" ? pianoSustainLevel : pianoEnvelope[key];
    const defaultValue = key === "sustain" ? PIANO_DEFAULT_SUSTAIN_LEVEL : PIANO_DEFAULT_ENVELOPE[key];
    const label = capitalize(key);
    button.disabled = valuesMatch(current, defaultValue);
    button.title = `Reset ${label.toLowerCase()} to ${formatPianoControlValue(key, defaultValue)}`;
  });
}

function updatePianoControlLabels(): void {
  const labels: Record<string, string> = {
    pianoAttackValue: formatPianoControlValue("attack", pianoEnvelope.attack),
    pianoDecayValue: formatPianoControlValue("decay", pianoEnvelope.decay),
    pianoReleaseValue: formatPianoControlValue("release", pianoEnvelope.release),
    pianoSustainValue: formatPianoControlValue("sustain", pianoSustainLevel)
  };
  Object.entries(labels).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  });
}

function formatPianoControlValue(key: PianoResetKey, value: number): string {
  return key === "sustain" ? `${Math.round(value * 100)}%` : formatDuration(value);
}

function formatDuration(seconds: number): string {
  return seconds < 0.1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(2).replace(/\.?0+$/, "")} s`;
}

function buildPianoKeyboard(): void {
  const container = document.getElementById("pianoKeys");
  if (!container) return;
  const firstMidi = firstVisiblePianoMidi();
  const lastMidi = firstMidi + PIANO_VISIBLE_OCTAVES * 12 - 1;
  container.innerHTML = '<div class="white-keys"></div><div class="black-keys"></div>';
  const whiteKeys = container.querySelector<HTMLDivElement>(".white-keys");
  const blackKeys = container.querySelector<HTMLDivElement>(".black-keys");
  if (!whiteKeys || !blackKeys) return;
  const whiteCount = Array.from({ length: lastMidi - firstMidi + 1 }, (_unused, index) => firstMidi + index)
    .filter((midi) => !isBlackPianoKey(midi)).length;
  let whiteIndex = 0;
  for (let midi = firstMidi; midi <= lastMidi; midi += 1) {
    const isBlack = isBlackPianoKey(midi);
    const key = buildPianoKey(midi, isBlack);
    if (isBlack) {
      key.style.left = `calc(${((whiteIndex / whiteCount) * 100).toFixed(4)}% - var(--black-key-width) / 2)`;
      blackKeys.appendChild(key);
    } else {
      whiteKeys.appendChild(key);
      whiteIndex += 1;
    }
    updatePianoKeyState(midi);
  }
}

function buildPianoKey(midi: number, isBlack: boolean): HTMLButtonElement {
  const key = document.createElement("button");
  key.type = "button";
  key.className = `piano-key ${isBlack ? "black-key" : "white-key"}`;
  key.dataset.midi = String(midi);
  key.setAttribute("aria-label", `Play ${noteNameForMidi(midi)}`);
  const offset = midi - firstVisiblePianoMidi();
  const keyboardLabel = keyboardLabelForOffset(offset);
  key.innerHTML = `
    <span class="piano-note-label">${noteNameForMidi(midi)}</span>
    <span class="piano-key-label">${keyboardLabel}</span>
  `;
  key.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    key.setPointerCapture(event.pointerId);
    void startPianoNote(`pointer:${event.pointerId}`, midi);
  });
  key.addEventListener("pointerup", (event) => {
    releasePianoNote(`pointer:${event.pointerId}`);
    if (key.hasPointerCapture(event.pointerId)) key.releasePointerCapture(event.pointerId);
  });
  key.addEventListener("pointercancel", (event) => releasePianoNote(`pointer:${event.pointerId}`));
  return key;
}

function isBlackPianoKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

function updatePianoKeyState(midi: number): void {
  document.querySelectorAll<HTMLButtonElement>(`.piano-key[data-midi="${midi}"]`).forEach((key) => {
    key.classList.toggle("active", (activePianoMidiCounts.get(midi) || 0) > 0);
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function handlePianoKeyDown(event: KeyboardEvent): void {
  if (!pianoModeActive || event.repeat || isTypingTarget(event.target)) return;
  const midi = keyboardMidiForCode(event.code);
  if (midi === null) return;
  event.preventDefault();
  void startPianoNote(`key:${event.code}`, midi);
}

function handlePianoKeyUp(event: KeyboardEvent): void {
  if (!pianoModeActive) return;
  if (!PIANO_KEYBOARD_BINDINGS.some((binding) => binding.code === event.code)) return;
  event.preventDefault();
  releasePianoNote(`key:${event.code}`);
}

function drawAdsrVisualization(): void {
  const canvas = document.getElementById("adsrCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, Math.floor(rect.width || 360));
  const height = Math.max(120, Math.floor(rect.height || 130));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  const pad = { left: 22, top: 14, right: 12, bottom: 20 };
  const plot = {
    left: pad.left,
    top: pad.top,
    width: width - pad.left - pad.right,
    height: height - pad.top - pad.bottom
  };
  const hold = 0.45;
  const total = Math.max(0.2, pianoEnvelope.attack + pianoEnvelope.decay + hold + pianoEnvelope.release);
  const x = (seconds: number) => plot.left + (seconds / total) * plot.width;
  const y = (amplitude: number) => plot.top + plot.height - amplitude * plot.height;
  const attackEnd = pianoEnvelope.attack;
  const decayEnd = attackEnd + pianoEnvelope.decay;
  const releaseStart = decayEnd + hold;
  const releaseEnd = releaseStart + pianoEnvelope.release;

  ctx.strokeStyle = THEME.axisGrid;
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.fillStyle = THEME.axisText;
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("amp", 0, plot.top - 2);
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${formatDuration(total)}`, width - 2, height - 2);

  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.lineTo(x(attackEnd), y(1));
  ctx.lineTo(x(decayEnd), y(pianoSustainLevel));
  ctx.lineTo(x(releaseStart), y(pianoSustainLevel));
  ctx.lineTo(x(releaseEnd), y(0));
  ctx.strokeStyle = "#FFD166";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 209, 102, 0.12)";
  ctx.lineTo(x(0), y(0));
  ctx.closePath();
  ctx.fill();
}

function toggleSonification(): void {
  if (pianoModeActive) return;
  if (sonificationActive) {
    stopSonification();
    return;
  }
  startSonification();
}

function ensureAudioContext(): AudioContext | null {
  if (sonificationContext) return sonificationContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  sonificationContext = new AudioContextCtor();
  return sonificationContext;
}

function resumeAudioContext(context: AudioContext): void {
  if (context.state === "closed") return;
  void context.resume().catch(() => undefined);
}

function unlockAudioContext(context: AudioContext): void {
  if (context.state === "closed") return;
  try {
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, Math.max(1, context.sampleRate || 44100));
    source.connect(context.destination);
    source.addEventListener("ended", () => source.disconnect(), { once: true });
    source.start();
    source.stop(context.currentTime + 0.001);
  } catch {
    // Some WebKit builds are fussy about unlock sources; the calling voice still starts synchronously.
  }
}

function startSonification(): void {
  const context = ensureAudioContext();
  if (!context) return;
  unlockAudioContext(context);
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
  resumeAudioContext(context);
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

function ensurePianoMasterGain(context: AudioContext): GainNode {
  if (pianoMasterGain) return pianoMasterGain;
  pianoMasterGain = context.createGain();
  pianoMasterGain.gain.setValueAtTime(PIANO_OUTPUT_GAIN, context.currentTime);
  pianoMasterGain.connect(context.destination);
  return pianoMasterGain;
}

function startPianoNote(sourceId: string, midi: number): void {
  if (!pianoModeActive || activePianoVoices.has(sourceId)) return;
  const note = clamp(Math.round(midi), PIANO_MIN_NOTE, PIANO_MAX_NOTE);
  const context = ensureAudioContext();
  if (!context) return;
  unlockAudioContext(context);
  const output = ensurePianoMasterGain(context);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const attack = Math.max(0.001, pianoEnvelope.attack);
  const decay = Math.max(0.001, pianoEnvelope.decay);
  const sustain = clamp(pianoSustainLevel, 0, 1);
  oscillator.frequency.setValueAtTime(noteToFrequency(note), now);
  const wave = createSonificationPeriodicWave(context);
  if (wave) oscillator.setPeriodicWave(wave);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + attack);
  gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
  oscillator.connect(gain);
  gain.connect(output);
  const voice: PianoVoice = {
    oscillator,
    gain,
    midi: note,
    startedAt: now,
    attack,
    decay,
    sustain,
    released: false
  };
  oscillator.addEventListener("ended", () => disconnectPianoVoice(sourceId, voice), { once: true });
  activePianoVoices.set(sourceId, voice);
  activePianoMidiCounts.set(note, (activePianoMidiCounts.get(note) || 0) + 1);
  updatePianoKeyState(note);
  oscillator.start(now);
  resumeAudioContext(context);
}

function releasePianoNote(sourceId: string): void {
  const voice = activePianoVoices.get(sourceId);
  const context = sonificationContext;
  if (!voice || !context || voice.released) return;
  voice.released = true;
  activePianoVoices.delete(sourceId);
  const count = (activePianoMidiCounts.get(voice.midi) || 1) - 1;
  if (count > 0) activePianoMidiCounts.set(voice.midi, count);
  else activePianoMidiCounts.delete(voice.midi);
  updatePianoKeyState(voice.midi);
  const now = context.currentTime;
  const release = Math.max(0.01, pianoEnvelope.release);
  const amplitude = estimatePianoVoiceAmplitude(voice, now);
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(amplitude, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + release);
  voice.oscillator.stop(now + release + 0.03);
}

function estimatePianoVoiceAmplitude(voice: PianoVoice, now: number): number {
  const elapsed = Math.max(0, now - voice.startedAt);
  if (elapsed <= voice.attack) return clamp(elapsed / voice.attack, 0, 1);
  if (elapsed <= voice.attack + voice.decay) {
    const decayProgress = (elapsed - voice.attack) / voice.decay;
    return 1 - (1 - voice.sustain) * clamp(decayProgress, 0, 1);
  }
  return voice.sustain;
}

function releaseAllPianoNotes(): void {
  Array.from(activePianoVoices.keys()).forEach(releasePianoNote);
}

function disconnectPianoVoice(sourceId: string, voice: PianoVoice): void {
  voice.oscillator.disconnect();
  voice.gain.disconnect();
  if (activePianoVoices.get(sourceId) === voice) activePianoVoices.delete(sourceId);
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

function updateActivePianoWaveforms(): void {
  const context = sonificationContext;
  if (!context || !activePianoVoices.size) return;
  const wave = createSonificationPeriodicWave(context);
  if (!wave) return;
  activePianoVoices.forEach((voice) => {
    try {
      voice.oscillator.setPeriodicWave(wave);
    } catch {
      // A note may be ending while a parameter redraw updates the waveform.
    }
  });
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
  updateActivePianoWaveforms();
}

function sonificationSampleSignature(samples: SonificationSample[]): string {
  if (!samples.length) return `${sonificationSource}|empty`;
  const step = Math.max(1, Math.floor(samples.length / 48));
  const values: string[] = [sonificationSource, String(samples.length)];
  for (let index = 0; index < samples.length; index += step) {
    const sample = samples[index];
    values.push(`${sample.phase.toFixed(4)}:${sample.value.toFixed(4)}`);
  }
  const last = samples[samples.length - 1];
  values.push(`${last.phase.toFixed(4)}:${last.value.toFixed(4)}`);
  return values.join("|");
}

function acousticPressure(row: Row): number {
  const m = mAt(row.R, state);
  return row.H * row.R ** (-m * state.gamma1);
}

function acousticPressureSignal(row: Row): number {
  const pressure = acousticPressure(row);
  return pressure > 0 ? pressure : NaN;
}

function sonificationSignal(row: Row): number {
  switch (sonificationSource) {
    case "luminosity":
      return row.L;
    case "velocity":
      return row.V;
    case "pressure":
      return acousticPressureSignal(row);
  }
}

function buildSonificationSamples(rows: Row[], domain?: NumericRange): SonificationSample[] {
  const finiteRows = rows
    .map((row) => ({ row, value: sonificationSignal(row) }))
    .filter((sample) => Number.isFinite(sample.row.tau) && Number.isFinite(sample.value));
  if (!finiteRows.length) return [];
  const start = domain?.[0] ?? finiteRows[0].row.tau;
  const end = domain?.[1] ?? finiteRows[finiteRows.length - 1].row.tau;
  if (end <= start) return [{ phase: 0, value: 0 }];
  const inDomain = finiteRows.filter((sample) => sample.row.tau >= start && sample.row.tau <= end);
  if (!inDomain.length) return [];
  const sourceValues = inDomain.map((sample) => sample.value);
  const minValue = Math.min(...sourceValues);
  const maxValue = Math.max(...sourceValues);
  const span = maxValue - minValue;
  const samples = strideDownsample(inDomain, SONIFICATION_MAX_SAMPLES)
    .map((sample) => ({
      phase: clamp((sample.row.tau - start) / (end - start), 0, 1),
      value: span > 1e-12 ? clamp(2 * ((sample.value - minValue) / span) - 1, -1, 1) : 0
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
  setupModelSpeedControl();
  buildPresetButtons();
  buildSolverButtons();
  buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
  buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
  rebuildIntegrationControls();
  buildParameterTable();
  setupGridControls();

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
      scheduleGridCompute();
      drawAll();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-phase-anchor]").forEach((button) => {
    button.addEventListener("click", () => {
      phaseAnchor = button.dataset.phaseAnchor === "max" ? "max" : "min";
      updatePhaseAnchorButtons();
      scheduleGridCompute();
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
  setupPlotPanelToggles();
  setupInteractivePlots();
  setupPhaseScrubbing();
  setupGridCanvasInteractions();
  window.addEventListener("resize", drawAll);
  window.addEventListener("resize", drawAdsrVisualization);
  updateDriverButtons();
  updatePhaseModeButtons();
  updatePhaseAnchorButtons();
  updateSolverButtons();
  updateEquationBlocks();
  updateAllSliderLabels();
  updateResetButtons();
}

function modelAnimationDurationMs(): number {
  return MODEL_ANIMATION_BASE_DURATION_MS / modelAnimationSpeed;
}

function modelSpeedLabel(speed: number): string {
  return `${fmt(speed, 2)}x`;
}

function setupModelSpeedControl(): void {
  const input = el<HTMLInputElement>("modelSpeed");
  const output = el<HTMLOutputElement>("modelSpeedValue");
  const sync = () => {
    modelAnimationSpeed = clamp(Number(input.value), MODEL_ANIMATION_MIN_SPEED, MODEL_ANIMATION_MAX_SPEED);
    input.value = String(modelAnimationSpeed);
    output.value = modelSpeedLabel(modelAnimationSpeed);
    output.textContent = output.value;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  };
  input.addEventListener("input", sync);
  sync();
}

function setupGridLoopSpeedControl(): void {
  const input = document.getElementById("gridLoopSpeed");
  const output = document.getElementById("gridLoopSpeedValue");
  if (!(input instanceof HTMLInputElement) || !(output instanceof HTMLOutputElement)) return;
  const sync = () => {
    gridLoopSpeed = clamp(Number(input.value), GRID_LOOP_MIN_SPEED, GRID_LOOP_MAX_SPEED);
    input.value = String(gridLoopSpeed);
    output.value = modelSpeedLabel(gridLoopSpeed);
    output.textContent = output.value;
    if (gridState.enabled && gridPathResults().length > 1) startGridAnimation();
  };
  input.addEventListener("input", sync);
  sync();
}

function isUserPlotId(value: string | undefined): value is UserPlotId {
  return value === "model" || value === "light" || value === "velocity" || value === "time" || value === "lum";
}

function setupPlotPanelToggles(): void {
  document.querySelectorAll<HTMLInputElement>("[data-plot-toggle]").forEach((input) => {
    const plotId = input.dataset.plotToggle;
    if (!isUserPlotId(plotId)) return;
    input.addEventListener("change", () => {
      plotPanelVisibility[plotId] = input.checked;
      updatePlotPanelVisibility();
      drawAll();
    });
  });
  updatePlotPanelVisibility();
}

function updatePlotPanelVisibility(): void {
  const hiddenControls = el<HTMLDivElement>("hiddenPlotControls");
  let hiddenCount = 0;
  (Object.keys(plotPanelVisibility) as UserPlotId[]).forEach((plotId) => {
    const forcedHidden = gridState.enabled && (plotId === "model" || plotId === "time" || plotId === "lum");
    const visible = forcedHidden ? false : plotPanelVisibility[plotId];
    const panel = document.querySelector<HTMLElement>(`[data-plot-panel="${plotId}"]`);
    const control = document.querySelector<HTMLElement>(`[data-plot-control="${plotId}"]`);
    const home = document.querySelector<HTMLElement>(`[data-plot-control-home="${plotId}"]`);
    const input = control?.querySelector<HTMLInputElement>("[data-plot-toggle]");
    if (!panel || !control || !home || !input) return;

    input.checked = visible;
    input.disabled = forcedHidden;
    input.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${PLOT_PANEL_LABELS[plotId]} plot`);
    if (visible) {
      if (control.parentElement !== home) home.prepend(control);
      panel.hidden = false;
    } else {
      panel.hidden = true;
      hiddenControls.append(control);
      hiddenCount += 1;
    }
  });
  hiddenControls.hidden = hiddenCount === 0;
  updatePlotGridColumns();
}

function updatePlotGridColumns(): void {
  const plotGrid = document.getElementById("plotGrid");
  if (!(plotGrid instanceof HTMLElement)) return;
  const visibleCount = Array.from(plotGrid.querySelectorAll<HTMLElement>(".plot-panel"))
    .filter((panel) => !panel.hidden)
    .length;
  plotGrid.dataset.visiblePlots = String(visibleCount);
  plotGrid.hidden = visibleCount === 0;
}

function setupGridControls(): void {
  const toggle = document.getElementById("gridModeToggle");
  if (toggle instanceof HTMLInputElement) {
    toggle.checked = gridState.enabled;
      toggle.addEventListener("change", () => setGridModeEnabled(toggle.checked, { defaultGammaRange: toggle.checked }));
  }
  setupGridLoopSpeedControl();
  updateGridRangeUi();
  updateGridStatusUi();
}

function setGridModeEnabled(enabled: boolean, options: { defaultGammaRange?: boolean } = {}): void {
  if (gridState.enabled === enabled) return;
  gridState.enabled = enabled;
  const toggle = document.getElementById("gridModeToggle");
  if (toggle instanceof HTMLInputElement) toggle.checked = enabled;

  if (enabled) {
    gridState.restorePlotVisibility = {
      model: plotPanelVisibility.model,
      time: plotPanelVisibility.time,
      lum: plotPanelVisibility.lum
    };
    plotPanelVisibility.model = false;
    plotPanelVisibility.time = false;
    plotPanelVisibility.lum = false;
    gridState.status = "idle";
    gridState.statusText = "Click a slider to define a grid range";
    if (options.defaultGammaRange) setDefaultGammaGridRange();
  } else {
    cancelGridCompute();
    stopGridAnimation();
    gridState.results = [];
    gridState.pathResults = [];
    gridState.hoverResult = null;
    gridState.heldResult = null;
    gridState.lastComplete = null;
    gridState.status = "idle";
    gridState.statusText = "Grid off";
    if (gridState.restorePlotVisibility) {
      plotPanelVisibility.model = gridState.restorePlotVisibility.model;
      plotPanelVisibility.time = gridState.restorePlotVisibility.time;
      plotPanelVisibility.lum = gridState.restorePlotVisibility.lum;
    }
    gridState.restorePlotVisibility = null;
  }

  updatePlotPanelVisibility();
  updateGridRangeUi();
  updateGridStatusUi();
  updateFourierPanelVisibility();
  if (enabled) scheduleGridCompute();
  drawAll();
}

function setDefaultGammaGridRange(): void {
  const key: ControlParameterKey = "gammac";
  const range = normalizeGridRange({
    key,
    lowerSliderValue: 0,
    upperSliderValue: 0.5,
    centerSliderValue: sliderInputValue(key),
    nativeStep: sliderMeta(key).step
  });
  gridState.ranges.clear();
  gridState.ranges.set(key, range);
  gridState.savedRanges.set(key, range);
  gridState.selectedLoopKey = key;
}

function toggleGridRange(key: ControlParameterKey): void {
  if (gridState.ranges.has(key)) {
    const current = gridState.ranges.get(key);
    if (current) gridState.savedRanges.set(key, current);
    gridState.ranges.delete(key);
  } else {
    enableGridRange(key);
    return;
  }
  updateGridRangeUi();
  scheduleGridCompute();
  drawAll();
}

function enableGridRange(key: ControlParameterKey): void {
  const existing = gridState.ranges.get(key);
  const currentSliderValue = sliderInputValue(key);
  const saved = gridState.savedRanges.get(key);
  const range = normalizeGridRange(existing || saved || defaultGridRange(key, currentSliderValue));
  gridState.ranges.set(key, { ...range, centerSliderValue: currentSliderValue });
  if (!gridState.selectedLoopKey || !activeGridRangeKeys().includes(gridState.selectedLoopKey)) gridState.selectedLoopKey = key;
  updateGridRangeUi();
  scheduleGridCompute();
}

function syncGridRangeCenter(key: ControlParameterKey): void {
  const range = gridState.ranges.get(key);
  if (!range) return;
  gridState.ranges.set(key, normalizeGridRange({ ...range, centerSliderValue: sliderInputValue(key) }));
  refreshGridRangeUi(key);
}

function syncAllGridRangeCenters(): void {
  Array.from(gridState.ranges.keys()).forEach(syncGridRangeCenter);
}

function updateGridRangeBounds(key: ControlParameterKey, lower: number, upper: number): void {
  const current = gridState.ranges.get(key) || defaultGridRange(key, sliderInputValue(key));
  const range = normalizeGridRange({
    ...current,
    lowerSliderValue: lower,
    upperSliderValue: upper,
    centerSliderValue: sliderInputValue(key),
    nativeStep: sliderMeta(key).step
  });
  gridState.ranges.set(key, range);
  gridState.savedRanges.set(key, range);
  refreshGridRangeUi(key);
  scheduleGridCompute();
}

function activeGridRangeKeys(): ControlParameterKey[] {
  if (!gridState.enabled) return [];
  return Array.from(gridState.ranges.keys()).filter((key) => {
    const elements = gridRangeElements.get(key);
    return Boolean(elements && !elements.wrapper.hidden);
  });
}

function activeGridRanges(): GridRange[] {
  return activeGridRangeKeys()
    .map((key) => gridState.ranges.get(key))
    .filter((range): range is GridRange => Boolean(range))
    .map(normalizeGridRange);
}

function updateGridRangeUi(): void {
  gridRangeElements.forEach((_elements, key) => refreshGridRangeUi(key));
  updateGridLoopControls();
}

function refreshGridRangeUi(key: ControlParameterKey): void {
  const elements = gridRangeElements.get(key);
  if (!elements) return;
  const active = gridState.enabled && gridState.ranges.has(key);
  const range = gridState.ranges.get(key);
  elements.wrapper.classList.toggle("is-grid-enabled", gridState.enabled);
  elements.wrapper.classList.toggle("is-grid-range", active);
  const controls = elements.wrapper.querySelector<HTMLElement>("[data-grid-range-controls]");
  if (controls) controls.hidden = !active;
  if (!range) return;
  const normalized = normalizeGridRange(range);
  elements.lower.value = String(normalized.lowerSliderValue);
  elements.upper.value = String(normalized.upperSliderValue);
  const meta = sliderMeta(key);
  const span = Math.max(1e-12, meta.max - meta.min);
  const left = ((normalized.lowerSliderValue - meta.min) / span) * 100;
  const right = ((normalized.upperSliderValue - meta.min) / span) * 100;
  controls?.style.setProperty("--grid-range-left", `${left.toFixed(4)}%`);
  controls?.style.setProperty("--grid-range-right", `${right.toFixed(4)}%`);
  elements.lower.title = `Lower bound: ${controlValueLabel(key, parameterValueFromSlider(key, normalized.lowerSliderValue))}`;
  elements.upper.title = `Upper bound: ${controlValueLabel(key, parameterValueFromSlider(key, normalized.upperSliderValue))}`;
  updateGridLoopSliderMarker(key);
}

function updateGridLoopSliderMarkers(): void {
  gridRangeElements.forEach((_elements, key) => updateGridLoopSliderMarker(key));
  gridRangeElements.forEach((_elements, key) => updateSliderLabel(key));
}

function updateGridLoopSliderMarker(key: ControlParameterKey): void {
  const elements = gridRangeElements.get(key);
  const marker = elements?.wrapper.querySelector<HTMLElement>("[data-grid-loop-marker]");
  const controls = elements?.wrapper.querySelector<HTMLElement>("[data-grid-range-controls]");
  if (!elements || !marker || !controls) return;
  const current = currentGridResult();
  const range = currentLoopRange();
  const sliderValue = current?.sliderValues[key];
  const active = gridState.enabled
    && gridState.ranges.has(key)
    && key === gridState.selectedLoopKey
    && range?.key === key
    && sliderValue !== undefined;
  marker.hidden = !active;
  elements.wrapper.classList.toggle("is-grid-looping", active);
  if (!active || sliderValue === undefined || !range || !current) return;
  const meta = sliderMeta(key);
  const span = Math.max(1e-12, meta.max - meta.min);
  const position = clamp(((sliderValue - meta.min) / span) * 100, 0, 100);
  const value = current.variedValues[key] ?? parameterValueFromSlider(key, sliderValue);
  controls.style.setProperty("--grid-loop-position", `${position.toFixed(4)}%`);
  controls.style.setProperty("--grid-loop-color", parameterColorAt(value, range, 1));
}

function createGridWorker(): Worker | null {
  try {
    if (gridState.workerDisabled) return null;
    const path = window.location.pathname.replace(/\\/g, "/");
    const src = window.location.protocol === "file:"
      ? (path.includes("/dist/") ? "./assets/grid-worker-file.js" : "./dist/assets/grid-worker-file.js")
      : (path.includes("/dist/") ? "./assets/grid-worker-file.js" : "/src/gridWorker.ts");
    return new Worker(src, { type: "module" });
  } catch (error) {
    gridState.workerDisabled = true;
    console.warn("Grid worker blocked; falling back to in-tab grid computation", error);
    return null;
  }
}

function scheduleGridCompute(): void {
  if (!gridState.enabled) return;
  window.clearTimeout(gridState.debounceTimer);
  const ranges = activeGridRanges();
  if (!ranges.length) {
    cancelGridCompute();
    gridState.results = [];
    gridState.pathResults = [];
    gridState.hoverResult = null;
    gridState.heldResult = null;
    gridState.lastComplete = null;
    gridState.status = "idle";
    gridState.statusText = "Click a slider to define a grid range";
    updateGridStatusUi();
    updateFourierPanelVisibility();
    return;
  }
  gridState.status = "queued";
  gridState.statusText = "Grid queued";
  updateGridStatusUi();
  gridState.debounceTimer = window.setTimeout(startGridCompute, 140);
}

function startGridCompute(): void {
  const ranges = activeGridRanges();
  if (!gridState.enabled || !ranges.length) return;
  const loopKey = gridState.selectedLoopKey && ranges.some((range) => range.key === gridState.selectedLoopKey)
    ? gridState.selectedLoopKey
    : ranges[0].key;
  gridState.selectedLoopKey = loopKey;
  gridState.requestId += 1;
  gridState.results = [];
  gridState.pathResults = [];
  gridState.hoverResult = null;
  gridState.heldResult = null;
  gridState.lastComplete = null;
  gridState.animationIndex = 0;
  gridState.animationDirection = 1;
  stopGridAnimation();
  updateGridLoopControls();
  const request = {
    requestId: gridState.requestId,
    baseParameters: { ...state },
    ranges,
    loopKey,
    phase: {
      warmupTau: state.phaseWarmupTau,
      minAmplitude: state.phaseMinAmplitude,
      selection: state.phaseMode === "final" ? "last" as const : "first" as const,
      anchor: phaseAnchor
    }
  };

  if (!gridState.worker && !gridState.workerDisabled) {
    gridState.worker = createGridWorker();
    if (gridState.worker) {
      gridState.worker.addEventListener("message", (event: MessageEvent<GridWorkerMessage>) => handleGridWorkerMessage(event.data));
      gridState.worker.addEventListener("error", () => {
        gridState.worker?.terminate();
        gridState.worker = null;
        gridState.workerDisabled = true;
        if (gridState.enabled && request.requestId === gridState.requestId) {
          startGridFallbackCompute(request, "Using browser-tab grid compute");
        }
      });
    }
  }
  if (!gridState.worker) {
    startGridFallbackCompute(request, "Using browser-tab grid compute");
    return;
  }

  gridState.status = "running";
  gridState.statusText = `Grid running: 0 models`;
  updateGridStatusUi();
  gridState.worker.postMessage({
    type: "compute-grid",
    request
  });
}

function cancelGridCompute(): void {
  window.clearTimeout(gridState.debounceTimer);
  gridState.requestId += 1;
  gridState.fallbackToken += 1;
  gridState.worker?.postMessage({ type: "cancel-grid", requestId: gridState.requestId });
}

function startGridFallbackCompute(request: {
  requestId: number;
  baseParameters: ModelParameters;
  ranges: GridRange[];
  loopKey: ControlParameterKey;
  phase: {
    warmupTau?: number;
    minAmplitude: number;
    selection: "first" | "last";
    anchor: PhaseAnchor;
  };
}, statusText: string): void {
  const token = gridState.fallbackToken + 1;
  gridState.fallbackToken = token;
  gridState.status = "running";
  gridState.statusText = statusText;
  updateGridStatusUi();
  void computeGridWithMessages(request, {
    post: (message) => {
      if (token !== gridState.fallbackToken) return;
      handleGridWorkerMessage(message);
    },
    isCanceled: () => token !== gridState.fallbackToken || request.requestId !== gridState.requestId || !gridState.enabled
  }).catch((error) => {
    if (token !== gridState.fallbackToken) return;
    console.warn("Grid fallback failed", error);
    gridState.status = "error";
    gridState.statusText = "Grid computation failed";
    updateGridStatusUi();
  });
}

function handleGridWorkerMessage(message: GridWorkerMessage): void {
  if (message.requestId !== gridState.requestId) return;
  if (message.type === "grid-progress") {
    gridState.status = "running";
    gridState.statusText = `Grid running: ${message.completed}/${message.total} models`;
    updateGridStatusUi();
    return;
  }
  if (message.type === "grid-canceled-for-coarsening") {
    gridState.status = "coarsening";
    gridState.statusText = `Grid coarsening: stride ${message.stride}`;
    updateGridStatusUi();
    return;
  }
  if (message.type === "grid-canceled") {
    return;
  }
  gridState.lastComplete = message;
  gridState.results = message.results;
  gridState.pathResults = message.pathResults;
  gridState.status = "complete";
  const suffix = message.coarsened ? `, stride ${message.stride}` : "";
  gridState.statusText = `Grid complete: ${message.validPhase}/${message.total} phase models${suffix}`;
  gridState.animationIndex = 0;
  gridState.animationDirection = 1;
  updateGridLoopControls();
  updateGridStatusUi();
  updateFourierPanelVisibility();
  startGridAnimation();
  drawAll();
}

function updateGridStatusUi(): void {
  const bar = document.getElementById("gridStatusBar");
  const text = document.getElementById("gridStatusText");
  if (bar instanceof HTMLElement) bar.hidden = !gridState.enabled;
  if (text instanceof HTMLElement) text.textContent = gridState.statusText;
}

function updateGridLoopControls(): void {
  const container = document.getElementById("gridLoopControls");
  if (!(container instanceof HTMLElement)) return;
  const ranges = activeGridRanges();
  if (!gridState.enabled || ranges.length <= 1) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  const signature = ranges.map((range) => `${range.key}:${range.lowerSliderValue}:${range.upperSliderValue}`).join("|");
  if (container.dataset.signature === signature && container.childElementCount) {
    container.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach((input) => {
      input.checked = input.value === gridState.selectedLoopKey;
    });
    return;
  }
  container.dataset.signature = signature;
  container.innerHTML = `<span>loop</span>${ranges.map((range) => {
    const name = controlDefForKey(range.key)?.[2] ?? controlShortLabel(range.key);
    const symbol = controlSymbolHtml(range.key);
    const color = controlColor(range.key);
    return `
      <label style="--color:${color}" aria-label="Loop by ${name}">
        <input type="radio" name="gridLoopKey" value="${range.key}"${range.key === gridState.selectedLoopKey ? " checked" : ""}>
        <span class="grid-loop-symbol">${symbol}</span>
      </label>
    `;
  }).join("")}`;
  queueMathTypeset([container]);
  container.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      gridState.selectedLoopKey = input.value as ControlParameterKey;
      gridState.animationIndex = 0;
      gridState.animationDirection = 1;
      gridState.pathResults = [];
      updateGridLoopControls();
      scheduleGridCompute();
      drawAll();
    });
  });
}

function updateFourierPanelVisibility(): void {
  const panel = document.getElementById("fourierGridPanel");
  if (panel instanceof HTMLElement) panel.hidden = !gridState.enabled;
}

function startGridAnimation(): void {
  stopGridAnimation();
  const path = gridPathResults();
  if (!gridState.enabled || path.length <= 1) return;
  gridState.animationTimer = window.setInterval(() => {
    const currentPath = gridPathResults();
    if (currentPath.length <= 1) return;
    const next = gridState.animationIndex + gridState.animationDirection;
    if (next >= currentPath.length) {
      gridState.animationDirection = -1;
      gridState.animationIndex = Math.max(0, currentPath.length - 2);
    } else if (next < 0) {
      gridState.animationDirection = 1;
      gridState.animationIndex = Math.min(1, currentPath.length - 1);
    } else {
      gridState.animationIndex = next;
    }
    drawAll();
  }, GRID_LOOP_BASE_INTERVAL_MS / gridLoopSpeed);
}

function stopGridAnimation(): void {
  if (gridState.animationTimer) {
    window.clearInterval(gridState.animationTimer);
    gridState.animationTimer = 0;
  }
}

function gridPathResults(): GridModelResult[] {
  const loopKey = gridState.selectedLoopKey;
  if (!loopKey) return [];
  if (gridState.pathResults.length) {
    return [...gridState.pathResults]
      .filter((result) => result.sliderValues[loopKey] !== undefined)
      .sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
  }
  if (!gridState.results.length) return [];
  const ranges = activeGridRanges();
  const centerByKey = new Map<ControlParameterKey, number>();
  ranges.forEach((range) => {
    if (range.key !== loopKey) centerByKey.set(range.key, centerSliderSample(range));
  });
  return gridState.results
    .filter((result) => {
      for (const [key, center] of centerByKey) {
        const value = result.sliderValues[key];
        if (value === undefined || Math.abs(value - center) > sliderMeta(key).step / 2 + 1e-9) return false;
      }
      return result.sliderValues[loopKey] !== undefined;
    })
    .sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
}

function currentGridResult(): GridModelResult | null {
  if (gridState.heldResult) return gridState.heldResult;
  const path = gridPathResults();
  if (!path.length) return null;
  const index = Math.min(path.length - 1, Math.max(0, gridState.animationIndex));
  return path[index] || null;
}

function currentLoopRange(): GridRange | null {
  const loopKey = gridState.selectedLoopKey;
  if (!loopKey) return null;
  return activeGridRanges().find((range) => range.key === loopKey) || null;
}

function controlDefForKey(key: ControlParameterKey): ControlDef | undefined {
  return [...CONTROL_GROUPS.physical, ...CONTROL_GROUPS.initial, ...CONTROL_GROUPS.integration]
    .find(([controlKey]) => controlKey === key);
}

function controlSymbolHtml(key: ControlParameterKey): string {
  return controlDefForKey(key)?.[1] ?? controlShortLabel(key);
}

function controlColor(key: ControlParameterKey): string {
  return controlDefForKey(key)?.[7] ?? THEME.neutralSymbol;
}

function controlCanvasSymbol(key: ControlParameterKey): string {
  const symbols: Partial<Record<ControlParameterKey, string>> = {
    zeta: "ζ",
    zetac: "ζc",
    gammac: "γc",
    m: "χ0",
    gamma1: "Γ1",
    n: "n",
    s: "s",
    sourceExp: "U",
    cq: "Cq",
    r0: "R0",
    v0: "V0",
    h0: "H0",
    uc0: "Uc0",
    tEnd: "τmax",
    step: "Δτ0",
    maxStep: "Δτmax",
    logRtol: "log10 rtol",
    logAtol: "log10 atol",
    logErrTol: "log10 ε",
    logStabilityTol: "log10 εs",
    stableCycles: "Ns"
  };
  return symbols[key] ?? controlShortLabel(key);
}

function parameterColorAt(value: number, range: GridRange | null, alpha = 1): string {
  if (!range) return colorWithAlpha("#FFD166", alpha);
  const span = range.upperSliderValue - range.lowerSliderValue || 1;
  const sliderValue = range.key === "tEnd" ? Math.log10(value) : value;
  const t = clamp((sliderValue - range.lowerSliderValue) / span, 0, 1);
  const a = { r: 96, g: 128, b: 208 };
  const b = { r: 255, g: 209, b: 102 };
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const blue = Math.round(a.b + (b.b - a.b) * t);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${blue})` : `rgba(${r}, ${g}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function gridResultColor(result: GridModelResult, alpha = 1): string {
  const loopKey = gridState.selectedLoopKey;
  if (!loopKey) return parameterColorAt(0, null, alpha);
  return parameterColorAt(result.variedValues[loopKey] ?? 0, currentLoopRange(), alpha);
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

function setupGridCanvasInteractions(): void {
  ["lightCanvas", "velocityCanvas", "fourierCanvas"].forEach((canvasId) => {
    const canvas = el<HTMLCanvasElement>(canvasId);
    canvas.classList.add("grid-interaction-canvas");
    canvas.addEventListener("pointerdown", (event) => beginGridCanvasInteraction(event, canvasId));
    canvas.addEventListener("pointermove", (event) => updateGridCanvasInteraction(event, canvasId));
    canvas.addEventListener("pointerup", (event) => finishGridCanvasInteraction(event, canvasId));
    canvas.addEventListener("pointercancel", (event) => finishGridCanvasInteraction(event, canvasId));
    canvas.addEventListener("pointerleave", () => clearFourierHover(canvasId));
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  });
}

function setupPhaseScrubbing(): void {
  PHASE_SCRUB_CANVAS_IDS.forEach((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    canvas.classList.add("phase-scrub-canvas");
    canvas.addEventListener("pointerdown", (event) => beginPhaseScrub(event, canvasId));
    canvas.addEventListener("pointermove", (event) => updatePhaseScrub(event, canvasId));
    canvas.addEventListener("pointerup", (event) => finishPhaseScrub(event, canvasId));
    canvas.addEventListener("pointercancel", (event) => finishPhaseScrub(event, canvasId));
  });
}

function phaseFromCanvasPoint(canvasId: string, point: { x: number; y: number }): number | null {
  const render = plotRenderStates.get(canvasId);
  if (!render || !latestPhaseRows.length || gridState.enabled) return null;
  if (point.x < render.plot.left || point.x > render.plot.left + render.plot.width) return null;
  const clamped = clampPointToPlot(point, render.plot);
  return clamp(xFromPixel(render, clamped.x), 0, 2);
}

function scrubPhaseToPointer(canvas: HTMLCanvasElement, canvasId: string, event: PointerEvent): void {
  const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
  if (phase === null) return;
  currentAnimationPhase = phase;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function beginPhaseScrub(event: PointerEvent, canvasId: string): void {
  if (event.button !== 0 || gridState.enabled || !latestPhaseRows.length) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
  if (phase === null) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  activePhaseScrub = { canvasId, pointerId: event.pointerId };
  currentAnimationPhase = phase;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function updatePhaseScrub(event: PointerEvent, canvasId: string): void {
  if (!activePhaseScrub || activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
  event.preventDefault();
  scrubPhaseToPointer(event.currentTarget as HTMLCanvasElement, canvasId, event);
}

function finishPhaseScrub(event: PointerEvent, canvasId: string): void {
  if (!activePhaseScrub || activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  event.preventDefault();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePhaseScrub = null;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function beginGridCanvasInteraction(event: PointerEvent, canvasId: string): void {
  if (!gridState.enabled) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const point = canvasPoint(canvas, event);
  const colorbar = colorbarRegionAt(canvasId, point);
  if (colorbar) {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeGridCanvasInteraction = { type: "colorbar", canvasId, pointerId: event.pointerId };
    canvas.dataset.gridInteraction = "colorbar";
    gridState.heldResult = null;
    stopGridAnimation();
    scrubGridColorbar(colorbar, point);
    return;
  }

  if (canvasId === "fourierCanvas") {
    const hit = fourierPointHitAt(point);
    if (!hit) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeGridCanvasInteraction = { type: "fourier-hold", canvasId, pointerId: event.pointerId };
    canvas.dataset.gridInteraction = "fourier-hold";
    gridState.hoverResult = hit.result;
    gridState.heldResult = hit.result;
    stopGridAnimation();
    drawAll();
  }
}

function updateGridCanvasInteraction(event: PointerEvent, canvasId: string): void {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const point = canvasPoint(canvas, event);
  if (activeGridCanvasInteraction?.canvasId === canvasId && activeGridCanvasInteraction.pointerId === event.pointerId) {
    event.preventDefault();
    if (activeGridCanvasInteraction.type === "colorbar") {
      const region = gridColorbarRegions.get(canvasId);
      if (region) scrubGridColorbar(region, point);
      return;
    }
    if (activeGridCanvasInteraction.type === "fourier-hold") {
      const hit = fourierPointHitAt(point);
      if (hit && hit.result !== gridState.heldResult) {
        gridState.hoverResult = hit.result;
        gridState.heldResult = hit.result;
        drawAll();
      }
      return;
    }
  }

  const overColorbar = Boolean(colorbarRegionAt(canvasId, point));
  const overFourier = canvasId === "fourierCanvas" ? fourierPointHitAt(point) : null;
  canvas.style.cursor = overColorbar ? "ew-resize" : overFourier ? "pointer" : "";
  if (canvasId === "fourierCanvas") updateFourierHover(overFourier?.result ?? null, canvas);
}

function finishGridCanvasInteraction(event: PointerEvent, canvasId: string): void {
  if (!activeGridCanvasInteraction || activeGridCanvasInteraction.canvasId !== canvasId || activeGridCanvasInteraction.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  event.preventDefault();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  delete canvas.dataset.gridInteraction;
  activeGridCanvasInteraction = null;
  gridState.heldResult = null;
  startGridAnimation();
  drawAll();
}

function clearFourierHover(canvasId: string): void {
  if (canvasId !== "fourierCanvas" || activeGridCanvasInteraction) return;
  const canvas = document.getElementById("fourierCanvas") as HTMLCanvasElement | null;
  if (canvas) {
    delete canvas.dataset.gridHover;
    canvas.style.cursor = "";
  }
  if (!gridState.hoverResult) return;
  gridState.hoverResult = null;
  drawAll();
}

function colorbarRegionAt(canvasId: string, point: { x: number; y: number }): GridColorbarRegion | null {
  const region = gridColorbarRegions.get(canvasId);
  if (!region) return null;
  return point.x >= region.hitLeft && point.x <= region.hitRight && point.y >= region.hitTop && point.y <= region.hitBottom
    ? region
    : null;
}

function scrubGridColorbar(region: GridColorbarRegion, point: { x: number; y: number }): void {
  const loopKey = gridState.selectedLoopKey;
  const range = currentLoopRange();
  const path = gridPathResults();
  if (!loopKey || !range || !path.length) return;
  const fraction = clamp((point.x - region.left) / Math.max(1e-12, region.width), 0, 1);
  const targetSliderValue = range.lowerSliderValue + fraction * (range.upperSliderValue - range.lowerSliderValue);
  let bestIndex = 0;
  let bestDistance = Infinity;
  path.forEach((result, index) => {
    const sliderValue = result.sliderValues[loopKey];
    if (sliderValue === undefined) return;
    const distance = Math.abs(sliderValue - targetSliderValue);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  gridState.animationIndex = bestIndex;
  gridState.hoverResult = null;
  gridState.heldResult = null;
  const canvas = document.getElementById(region.canvasId) as HTMLCanvasElement | null;
  if (canvas) canvas.dataset.gridScrubIndex = String(bestIndex);
  drawAll();
}

function fourierPointHitAt(point: { x: number; y: number }): FourierPointHit | null {
  let best: FourierPointHit | null = null;
  let bestDistance = Infinity;
  fourierPointHits.forEach((hit) => {
    const distance = Math.hypot(point.x - hit.x, point.y - hit.y);
    const threshold = Math.max(9, hit.radius + 6);
    if (distance <= threshold && distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  });
  return best;
}

function updateFourierHover(result: GridModelResult | null, canvas: HTMLCanvasElement): void {
  if (result === gridState.hoverResult) return;
  gridState.hoverResult = result;
  if (result) canvas.dataset.gridHover = "true";
  else delete canvas.dataset.gridHover;
  drawAll();
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
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
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
  updateGridLoopControls();
}

function buildSliderGroup(containerId: string, controls: ControlDef[]): void {
  const container = el<HTMLDivElement>(containerId);
  container.querySelectorAll<HTMLButtonElement>("[data-reset-key]").forEach((button) => {
    const key = button.dataset.resetKey as ControlParameterKey | undefined;
    if (key) {
      controlElements.delete(key);
      gridRangeElements.delete(key);
    }
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
        <input class="single-slider" type="range" min="${min}" max="${max}" step="${step}" value="${String(sliderInputValue(key))}" aria-label="${name}">
        <div class="grid-range-controls" data-grid-range-controls hidden>
          <div class="grid-range-fill" aria-hidden="true"></div>
          <div class="grid-loop-marker" data-grid-loop-marker hidden aria-hidden="true"></div>
          <div class="grid-range-inputs">
            <input class="grid-bound grid-bound-low" data-grid-bound="lower" type="range" min="${min}" max="${max}" step="${step}" value="${String(sliderInputValue(key))}" aria-label="${name} grid lower bound">
            <input class="grid-bound grid-bound-high" data-grid-bound="upper" type="range" min="${min}" max="${max}" step="${step}" value="${String(sliderInputValue(key))}" aria-label="${name} grid upper bound">
          </div>
        </div>
        ${key === "tEnd" ? tauScaleMarkup() : ""}
        </div>
      <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">↺</button>
    `;
    const input = wrapper.querySelector<HTMLInputElement>(".single-slider");
    const lower = wrapper.querySelector<HTMLInputElement>("[data-grid-bound='lower']");
    const upper = wrapper.querySelector<HTMLInputElement>("[data-grid-bound='upper']");
    if (!input || !lower || !upper) throw new Error("missing slider input");
    input.addEventListener("input", (event) => {
      state[key] = valueFromSlider(key, Number((event.target as HTMLInputElement).value));
      syncGridRangeCenter(key);
      updateSliderLabel(key);
      if (key === "m") updateEquationBlocks();
      refreshActivePreset();
      scheduleSolve();
    });
    const updateBounds = () => updateGridRangeBounds(key, Number(lower.value), Number(upper.value));
    lower.addEventListener("input", updateBounds);
    upper.addEventListener("input", updateBounds);
    wrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!gridState.enabled) {
        setGridModeEnabled(true);
        enableGridRange(key);
        return;
      }
      toggleGridRange(key);
    });
    wrapper.querySelector<HTMLButtonElement>("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
    container.appendChild(wrapper);
    controlElements.set(key, input);
    gridRangeElements.set(key, { wrapper, center: input, lower, upper });
    refreshGridRangeUi(key);
    updateSliderLabel(key);
  });
  queueMathTypeset([container]);
}

function tauScaleMarkup(): string {
  const maxLog = Math.log10(TAU_SCALE_MAX);
  return `<div class="slider-scale">${TAU_TICKS.map((tick) => {
    const position = (Math.log10(tick) / maxLog) * 100;
    const edge = tick === 1 ? ` data-scale-edge="start"` : tick === TAU_SCALE_MAX ? ` data-scale-edge="end"` : "";
    return `<span${edge} style="--tick-position:${position.toFixed(4)}%">${tick}</span>`;
  }).join("")}</div>`;
}

function sliderInputValue(key: ControlParameterKey): number {
  return sliderValueFromParameter(key, state);
}

function valueFromSlider(key: ControlParameterKey, value: number): number {
  return parameterValueFromSlider(key, value);
}

function controlValueLabel(key: ControlParameterKey, value: number): string {
  if (key !== "tEnd") return fmt(value, 5);
  return fmt(value, value >= 100 ? 0 : 1);
}

function controlShortLabel(key: ControlParameterKey): string {
  if (key === "tEnd") return "tau_max";
  if (key === "logRtol") return "log rtol";
  if (key === "logAtol") return "log atol";
  if (key === "logErrTol") return "log eps";
  if (key === "logStabilityTol") return "log eps_s";
  return String(key);
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
      <tr><td class="symbol-cell" style="--color:${COLORS.m}">geometry</td><td>${meaning(`Switch between fixed geometry \\(\\ozChi{\\chi}=${TEX.m}\\) and radius-dependent local geometry \\(\\ozChi{\\chi}(${TEX.R})\\).`)}</td></tr>
      <tr><td class="symbol-cell" style="--color:${COLORS.H}">driver</td><td>${meaning(`Convective driving choice: the standard Stellingwerf pressure form is \\(\\sqrt{${TEX.H}}\\); \\(\\sqrt{|${TEX.V}|}\\) is retained as a diagnostic variant.`)}</td></tr>
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
    ? `\\ozChi{\\chi} &= \\frac{3}{1-(\\ozEta{\\eta}/\\ozRadius{R})^3}\\\\[0.2em]
       \\ozEta{\\eta} &= \\left(1-\\frac{3}{\\ozChiZero{\\chi_0}}\\right)^{1/3}=\\ozEta{${etaDisplay}}`
    : `\\ozChi{\\chi} &= \\ozChiZero{\\chi_0}`;
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
      \\frac{\\ozPressure{H}}{\\ozRadius{R}^{\\ozChi{\\chi}\\ozGamma{\\Gamma_1}-2}}
      - \\frac{1}{\\ozRadius{R}^{2}}
      - \\ozDamping{C_q}\\ozVelocity{V}^{3}\\\\[0.35em]
    \\frac{d\\ozPressure{H}}{d\\ozTau{\\tau}} &=
      \\ozZeta{\\zeta}\\,
      \\ozRadius{R}^{\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)}
      \\left[
        \\ozRadius{R}^{\\ozSource{U}}
        - \\ozLuminosity{L}
      \\right]\\\\[0.35em]
    \\frac{d\\ozConvective{U_c}}{d\\ozTau{\\tau}} &=
      \\ozZetac{\\zeta_c}
      \\left[
        \\ozRadius{R}^{-\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)/2}\\,${driver}
        - \\ozConvective{U_c}
      \\right]
    \\end{aligned}
    \\]
  `;
  luminosityNode.dataset.geometryMode = state.variableM ? "radius-dependent" : "fixed";
  luminosityNode.dataset.geometryLayout = "stacked";
  luminosityNode.dataset.etaValue = etaDisplay;
  const luminosityHtml = `
    \\[
    \\begin{aligned}
    ${geometry}\\\\[0.35em]
    \\ozRadiative{L_r} &=
      \\ozRadius{R}^{4+\\ozChi{\\chi}
      \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
      \\ozPressure{H}^{\\ozPink{s}+4}\\\\[0.35em]
    \\ozConvLum{L_c} &=
      \\ozRadius{R}^{-(\\ozChi{\\chi}-2)}
      \\ozConvective{U_c}^{3}\\\\[0.35em]
    \\ozLuminosity{L} &=
      \\ozNeutral{\\gamma_r}\\ozRadiative{L_r}
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
    initialTau: `\\(${TEX.tau}_{0}=0.00\\)`,
    initialR: `\\(${TEX.R}_{0}=${fmtFixed(initial.R, 2)}\\)`,
    initialV: `\\(${TEX.V}_{0}=${fmtFixed(initial.V, 2)}\\)`,
    initialH: `\\(${TEX.H}_{0}=${fmtFixed(initial.H, 2)}\\)`,
    initialUc: `\\(${TEX.Uc}_{0}=${fmtFixed(initial.Uc, 2)}\\)`,
    initialLr: `\\(${TEX.Lr}_{0}=${fmtFixed(initial.Lr, 2)}\\)`,
    initialLc: `\\(${TEX.Lc}_{0}=${fmtFixed(initial.Lc, 2)}\\)`,
    initialL: `\\(${TEX.L}_{0}=${fmtFixed(initial.L, 2)}\\)`
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
  const current = currentGridResult();
  const dynamicValue = gridState.enabled && key === gridState.selectedLoopKey
    ? current?.variedValues[key]
    : undefined;
  const value = dynamicValue ?? state[key];
  label.textContent = controlValueLabel(key, value);
  const input = controlElements.get(key);
  if (input) input.value = String(sliderInputValue(key));
}

function updateAllSliderLabels(): void {
  syncAllGridRangeCenters();
  controlElements.forEach((_input, key) => updateSliderLabel(key));
  updateResetButtons();
}

function restoreParameterDefault(key: ControlParameterKey): void {
  state[key] = PRESETS[selectedPreset][key];
  syncGridRangeCenter(key);
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
  scheduleGridCompute();
}

function solveAndDraw(): void {
  latestResult = solveModel(state);
  latestRows = latestResult.rows;
  drawAll();
}

function strideDownsample<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return rows;
  const stride = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_row, index) => index % stride === 0);
  const last = rows.at(-1);
  if (last && sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

function downsample(rows: Row[], maxPoints = 2200, keys: readonly PlotSeriesKey[] = []): Row[] {
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

function activeSeriesKeys(plotId: InteractivePlotId, keys: readonly PlotSeriesKey[]): PlotSeriesKey[] {
  return keys.filter((key) => seriesIsVisible(plotId, key));
}

function convectiveResponseDisabled(): boolean {
  return state.zetac <= 0;
}

function plotSeriesIsAvailable(plotId: InteractivePlotId, key: PlotSeriesKey): boolean {
  if (!convectiveResponseDisabled()) return true;
  if (plotId === "time" && key === "Uc") return false;
  if (plotId === "lum" && key !== "L") return false;
  return true;
}

function rowsForInteractivePlot(plotId: InteractivePlotId, rows: Row[], keys: readonly PlotSeriesKey[], maxPoints = 60000): Row[] {
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
  ylabelColor: string = THEME.axisText,
  ylabelX: number = PLOT_LAYOUT.yLabelX
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
  ctx.translate(ylabelX, plot.top + plot.height / 2);
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
    phaseMarker?: { x: number; color: string };
    afterDraw?: (ctx: CanvasRenderingContext2D, plot: PlotBox, xlim: NumericRange, ylim: NumericRange, canvasId: string) => void;
  }
): void {
  const canvas = el<HTMLCanvasElement>(canvasId);
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) {
    plotRenderStates.delete(canvasId);
    return;
  }
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
  if (options.phaseMarker) drawPhaseMarker(ctx, plot, xlim, options.phaseMarker);
  options.afterDraw?.(ctx, plot, xlim, ylim, canvasId);
  drawSelectionOverlay(ctx, canvasId, plot);
}

function drawPhaseMarker(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  marker: { x: number; color: string }
): void {
  if (!Number.isFinite(marker.x) || marker.x < xlim[0] || marker.x > xlim[1]) return;
  const x = plot.left + ((marker.x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.strokeStyle = marker.color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, plot.top + plot.height);
  ctx.stroke();
  ctx.restore();
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

function gridPhaseSeries(
  quantity: "L" | "V",
  color: string,
  fallbackRows: Row[]
): Series[] {
  const accessor = (row: Row) => row[quantity];
  if (!gridState.enabled || !gridState.results.length) {
    return [{ label: quantity, color, rows: fallbackRows, x: (row) => row.tau, y: accessor }];
  }
  const path = gridPathResults();
  const current = currentGridResult();
  const series: Series[] = gridState.results.map((result) => ({
    label: `grid-${result.id}`,
    color: "rgba(190, 200, 216, 0.18)",
    rows: result.phaseRows,
    x: (row) => row.tau,
    y: accessor,
    width: 0.8
  }));
  path.forEach((result) => {
    series.push({
      label: `path-${result.id}`,
      color: "rgba(190, 200, 216, 0.34)",
      rows: result.phaseRows,
      x: (row) => row.tau,
      y: accessor,
      width: 1.15
    });
  });
  const highlighted = gridState.heldResult || gridState.hoverResult;
  if (highlighted && highlighted !== current) {
    series.push({
      label: `highlight-${highlighted.id}`,
      color: gridResultColor(highlighted, 0.98),
      rows: highlighted.phaseRows,
      x: (row) => row.tau,
      y: accessor,
      width: 3.4
    });
  }
  if (current) {
    series.push({
      label: quantity,
      color: gridResultColor(current, 0.98),
      rows: current.phaseRows,
      x: (row) => row.tau,
      y: accessor,
      width: 2.8
    });
  }
  return series;
}

function drawGridColorbar(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  _xlim?: NumericRange,
  _ylim?: NumericRange,
  canvasId = "fourierCanvas"
): void {
  if (!gridState.enabled) {
    gridColorbarRegions.delete(canvasId);
    return;
  }
  const range = currentLoopRange();
  const current = currentGridResult();
  if (!range || !current) {
    gridColorbarRegions.delete(canvasId);
    return;
  }
  const value = current.variedValues[range.key];
  const sliderValue = current.sliderValues[range.key];
  if (value === undefined || sliderValue === undefined) {
    gridColorbarRegions.delete(canvasId);
    return;
  }
  const width = Math.min(150, Math.max(112, plot.width * 0.24));
  const height = 9;
  const left = plot.left + plot.width - width - 12;
  const top = plot.top + 12;
  gridColorbarRegions.set(canvasId, {
    canvasId,
    left,
    top,
    width,
    height,
    hitLeft: left - 12,
    hitTop: top - 10,
    hitRight: left + width + 12,
    hitBottom: top + 50
  });
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (canvas) {
    canvas.dataset.gridColorbar = "ready";
    canvas.dataset.gridColorbarKey = range.key;
  }
  const lowerValue = parameterValueFromSlider(range.key, range.lowerSliderValue);
  const upperValue = parameterValueFromSlider(range.key, range.upperSliderValue);
  const gradient = ctx.createLinearGradient(left, top, left + width, top);
  gradient.addColorStop(0, "#6080D0");
  gradient.addColorStop(1, "#FFD166");
  ctx.save();
  ctx.fillStyle = "rgba(5, 8, 20, 0.68)";
  ctx.fillRect(left - 8, top - 8, width + 16, 58);
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = "rgba(238, 245, 255, 0.62)";
  ctx.strokeRect(left, top, width, height);
  const fraction = clamp((sliderValue - range.lowerSliderValue) / Math.max(1e-12, range.upperSliderValue - range.lowerSliderValue), 0, 1);
  const markerX = left + fraction * width;
  ctx.fillStyle = parameterColorAt(value, range);
  ctx.strokeStyle = "#050814";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(markerX, top + height + 2);
  ctx.lineTo(markerX - 5, top + height + 10);
  ctx.lineTo(markerX + 5, top + height + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = THEME.axisText;
  ctx.font = "11px Inter, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(controlValueLabel(range.key, lowerValue), left, top + height + 13);
  ctx.textAlign = "right";
  ctx.fillText(controlValueLabel(range.key, upperValue), left + width, top + height + 13);
  const symbol = controlCanvasSymbol(range.key);
  const valueText = ` = ${controlValueLabel(range.key, value)}`;
  ctx.font = "600 11px Inter, sans-serif";
  const symbolWidth = ctx.measureText(symbol).width;
  ctx.font = "11px Inter, sans-serif";
  const valueWidth = ctx.measureText(valueText).width;
  const labelLeft = left + width / 2 - (symbolWidth + valueWidth) / 2;
  ctx.textAlign = "left";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.fillStyle = controlColor(range.key);
  ctx.fillText(symbol, labelLeft, top + height + 28);
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = THEME.axisText;
  ctx.fillText(valueText, labelLeft + symbolWidth, top + height + 28);
  ctx.restore();
}

function drawFourierPanel(): void {
  const panel = document.getElementById("fourierGridPanel");
  const canvas = document.getElementById("fourierCanvas");
  if (!(panel instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return;
  panel.hidden = !gridState.enabled;
  if (panel.hidden) {
    fourierPointHits = [];
    gridColorbarRegions.delete("fourierCanvas");
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const columns = rect.width >= 1320 ? 4 : rect.width >= 780 ? 2 : 1;
  const rows = Math.ceil(4 / columns);
  const cssHeight = Math.max(260, rows * 214);
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, cssHeight);
  fourierPointHits = [];
  delete canvas.dataset.firstFourierHit;
  canvas.dataset.fourierHitCount = "0";

  const gridPoints = gridState.results.filter((result) => result.fourier);
  const path = gridPathResults().filter((result) => result.fourier);
  const allPoints = [...gridPoints, ...path];
  if (!allPoints.length) {
    gridColorbarRegions.delete("fourierCanvas");
    ctx.fillStyle = THEME.axisText;
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(gridState.status === "complete" ? "No Fourier diagnostics passed the amplitude filter" : gridState.statusText, rect.width / 2, cssHeight / 2);
    return;
  }

  const current = currentGridResult();
  const currentFourier = current?.fourier ? current : null;
  const xlim = range(allPoints.map((point) => point.period), 0.05);
  const panels: Array<{ latex: string; label: FourierAxisLabel; value: (result: GridModelResult) => number }> = [
    { latex: "r_{21}", label: { base: "r", subscript: "21" }, value: (result: GridModelResult) => result.fourier!.r21 },
    { latex: "\\phi_{21}", label: { base: "phi", subscript: "21" }, value: (result: GridModelResult) => result.fourier!.phi21 },
    { latex: "r_{31}", label: { base: "r", subscript: "31" }, value: (result: GridModelResult) => result.fourier!.r31 },
    { latex: "\\phi_{31}", label: { base: "phi", subscript: "31" }, value: (result: GridModelResult) => result.fourier!.phi31 }
  ];
  canvas.dataset.fourierAxisLabels = panels.map((item) => item.latex).join(",");
  canvas.dataset.fourierPathCount = String(path.length);
  const gap = 16;
  const pad = { left: 78, right: 18, top: 24, bottom: 58 };
  const panelWidth = (rect.width - gap * (columns - 1)) / columns;
  const panelHeight = (cssHeight - gap * (rows - 1)) / rows;

  panels.forEach((item, index) => {
    const column = index % columns;
    const rowIndex = Math.floor(index / columns);
    const box = {
      left: column * (panelWidth + gap) + pad.left,
      top: rowIndex * (panelHeight + gap) + pad.top,
      width: panelWidth - pad.left - pad.right,
      height: panelHeight - pad.top - pad.bottom
    };
    const values = allPoints.map(item.value);
    const ylim = range(values, 0.08);
    const ylabelX = Math.max(8, box.left - 70);
    drawAxes(ctx, box, xlim, ylim, "period/τ", "", THEME.axisText, THEME.axisText, ylabelX);
    drawFourierAxisLabel(ctx, item.label, ylabelX, box.top + box.height / 2);
    collectFourierPointHits(box, xlim, ylim, allPoints, item.value);
    drawFourierPoints(ctx, box, xlim, ylim, gridPoints, item.value, "rgba(190, 200, 216, 0.24)", 2.1);
    drawFourierPath(ctx, box, xlim, ylim, path, item.value, 1.9);
    drawFourierPoints(ctx, box, xlim, ylim, path, item.value, (result) => gridResultColor(result, 0.78), 2.9);
    const highlighted = gridState.heldResult || gridState.hoverResult;
    if (highlighted?.fourier && highlighted !== currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [highlighted], item.value, (result) => gridResultColor(result, 0.98), 5.4);
    if (currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [currentFourier], item.value, (result) => gridResultColor(result, 0.98), 6.2);
  });

  canvas.dataset.fourierHitCount = String(fourierPointHits.length);
  const firstHit = fourierPointHits[0];
  if (firstHit) canvas.dataset.firstFourierHit = `${firstHit.x.toFixed(1)},${firstHit.y.toFixed(1)}`;

  drawGridColorbar(ctx, {
    left: rect.width - 184,
    top: 4,
    width: 170,
    height: 36
  });
}

function collectFourierPointHits(
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  points: GridModelResult[],
  value: (result: GridModelResult) => number
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  points.forEach((result) => {
    const x = sx(result.period);
    const y = sy(value(result));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    fourierPointHits.push({ result, x, y, radius: 5 });
  });
}

function drawFourierAxisLabel(
  ctx: CanvasRenderingContext2D,
  label: FourierAxisLabel,
  x: number,
  y: number
): void {
  const base = label.base === "phi" ? "φ" : label.base;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = THEME.axisText;
  ctx.font = "12px Inter, sans-serif";
  const baseWidth = ctx.measureText(base).width;
  ctx.font = "8px Inter, sans-serif";
  const subscriptWidth = ctx.measureText(label.subscript).width;
  const start = -(baseWidth + subscriptWidth + 1) / 2;
  ctx.font = "12px Inter, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(base, start, 0);
  ctx.font = "8px Inter, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label.subscript, start + baseWidth + 1, 5);
  ctx.restore();
}

function drawFourierPath(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  points: GridModelResult[],
  value: (result: GridModelResult) => number,
  width: number
): void {
  if (points.length < 2) return;
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const x0 = sx(previous.period);
    const y0 = sy(value(previous));
    const x1 = sx(current.period);
    const y1 = sy(value(current));
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    ctx.strokeStyle = gridResultColor(current, 0.62);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFourierPoints(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  points: GridModelResult[],
  value: (result: GridModelResult) => number,
  color: string | ((result: GridModelResult) => string),
  radius: number
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  points.forEach((point) => {
    const x = sx(point.period);
    const y = sy(value(point));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.fillStyle = typeof color === "function" ? color(point) : color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.restore();
}

interface LegendItem {
  label: string;
  color: string;
  key?: PlotSeriesKey;
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
        const key = button.dataset.plotSeries as PlotSeriesKey | undefined;
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
    const key = button.dataset.plotSeries as PlotSeriesKey | undefined;
    if (!key) return;
    const visible = seriesIsVisible(plotId, key);
    button.classList.toggle("is-hidden", !visible);
    button.setAttribute("aria-pressed", String(visible));
  });
}

function seriesIsVisible(plotId: InteractivePlotId, key: PlotSeriesKey): boolean {
  if (!plotSeriesIsAvailable(plotId, key)) return false;
  if (convectiveResponseDisabled() && plotId === "lum" && key === "L") return true;
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

function visibleRows(plotId: InteractivePlotId, key: PlotSeriesKey, rows: Row[]): Row[] {
  return seriesIsVisible(plotId, key) ? rows : [];
}

function rawRange(values: number[]): NumericRange {
  let min = Infinity;
  let max = -Infinity;
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [0, 1];
}

function normalizedInRange(value: number, valueRange: NumericRange): number {
  const span = valueRange[1] - valueRange[0];
  if (!Number.isFinite(value) || span <= 1e-12) return clamp(value, 0, 1);
  return clamp((value - valueRange[0]) / span, 0, 1);
}

function scaledRgb(color: RgbColor, scale: number): RgbColor {
  return {
    r: clamp(Math.round(color.r * scale), 0, 255),
    g: clamp(Math.round(color.g * scale), 0, 255),
    b: clamp(Math.round(color.b * scale), 0, 255)
  };
}

function gammaR(): number {
  return 1 - state.gammac;
}

function weightedRadiativeLuminosity(row: Row): number {
  return gammaR() * row.Lr;
}

function weightedConvectiveLuminosity(row: Row): number {
  return state.gammac * row.Lc;
}

function phaseMarker(): { x: number; color: string } | undefined {
  if (gridState.enabled) return undefined;
  return latestPhaseRows.length ? { x: currentAnimationPhase, color: PHASE_MARKER_COLOR } : undefined;
}

function syncPhaseCanvasState(): void {
  PHASE_SCRUB_CANVAS_IDS.forEach((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    canvas.classList.toggle("phase-scrub-enabled", latestPhaseRows.length > 0 && !gridState.enabled);
    if (latestPhaseRows.length) canvas.dataset.currentPhase = fmtFixed(currentAnimationPhase, 3);
    else delete canvas.dataset.currentPhase;
    if (activePhaseScrub?.canvasId === canvasId) canvas.dataset.phaseScrubbing = "true";
    else delete canvas.dataset.phaseScrubbing;
  });
}

function drawPhasePlots(): void {
  const marker = phaseMarker();
  drawSeries("lightCanvas", gridPhaseSeries("L", COLORS.L, latestPhaseSample), {
    xlabel: latestPhasePeriodLabel,
    ylabel: "luminosity L",
    ylabelColor: COLORS.L,
    xlim: [0, 2],
    ylim: latestPhaseSample.length || gridState.results.length ? undefined : [0, 1],
    message: latestPhaseMessage,
    phaseMarker: marker,
    afterDraw: drawGridColorbar
  });

  drawSeries("velocityCanvas", gridPhaseSeries("V", COLORS.V, latestPhaseSample), {
    xlabel: latestPhasePeriodLabel,
    ylabel: "radial velocity V",
    ylabelColor: COLORS.V,
    xlim: [0, 2],
    ylim: latestPhaseSample.length || gridState.results.length ? undefined : [0, 1],
    message: latestPhaseMessage,
    phaseMarker: marker,
    afterDraw: drawGridColorbar
  });

  if (sonificationSource === "pressure") {
    drawSeries("pressureCanvas", [
      { label: "P", color: COLORS.H, rows: latestPhaseSample, x: (row) => row.tau, y: acousticPressureSignal }
    ], {
      xlabel: latestPhasePeriodLabel,
      ylabel: "pressure",
      ylabelColor: COLORS.H,
      xlim: [0, 2],
      ylim: latestPhaseSample.length ? undefined : [0, 1],
      message: latestPhaseMessage,
      phaseMarker: marker
    });
  }
  syncPhaseCanvasState();
}

function drawCanvasMessage(ctx: CanvasRenderingContext2D, width: number, height: number, message: string): void {
  ctx.fillStyle = THEME.axisText;
  ctx.font = "13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

function drawAnnularSegment(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
  fillStyle: string
): void {
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
  if (innerRadius > 0) {
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
  } else {
    ctx.lineTo(centerX, centerY);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function maximumPhaseRadius(rows: readonly Row[]): number {
  return Math.max(1.2, ...rows.map((row) => row.R).filter((value) => Number.isFinite(value) && value > 0));
}

function drawGuideCircle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  strokeStyle: string,
  lineDash: number[] = []
): void {
  if (radius <= 0) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.setLineDash(lineDash);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawModelReferenceGuides(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  centerX: number,
  centerY: number,
  radiusScale: number
): void {
  const equilibriumGeometry = shellGeometryFor(1, mAt(1, state));
  const [minRadius, maxRadius] = rawRange(rows.map((row) => row.R));
  const hasRadiusRange = rows.length > 1 && maxRadius - minRadius > 1e-4;

  if (hasRadiusRange) {
    drawGuideCircle(ctx, centerX, centerY, minRadius * radiusScale, colorWithAlpha(COLORS.R, 0.18), [3, 5]);
    drawGuideCircle(ctx, centerX, centerY, maxRadius * radiusScale, colorWithAlpha(COLORS.R, 0.24), [7, 5]);
  }

  drawGuideCircle(ctx, centerX, centerY, radiusScale, "rgba(82, 100, 137, 0.42)");

  const innerReferenceRadius = equilibriumGeometry.innerRadius * radiusScale;
  if (innerReferenceRadius > 1) {
    drawGuideCircle(ctx, centerX, centerY, innerReferenceRadius, "rgba(255, 184, 108, 0.34)", [4, 4]);
  } else {
    ctx.save();
    ctx.fillStyle = "rgba(255, 184, 108, 0.36)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

type LuminosityLabelSubscript = "c" | "r";

interface LuminosityLabelSymbol {
  base: string;
  subscript?: LuminosityLabelSubscript;
}

function measureLuminosityLabelSymbol(ctx: CanvasRenderingContext2D, symbol: LuminosityLabelSymbol): number {
  ctx.font = "700 13px Inter, sans-serif";
  const baseWidth = ctx.measureText(symbol.base).width;
  if (!symbol.subscript) return baseWidth;
  ctx.font = "700 9px Inter, sans-serif";
  return baseWidth + 1 + ctx.measureText(symbol.subscript).width;
}

function drawLuminosityLabelSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: LuminosityLabelSymbol,
  x: number,
  y: number
): number {
  ctx.textAlign = "left";
  ctx.font = "700 13px Inter, sans-serif";
  ctx.strokeText(symbol.base, x, y + 4);
  ctx.fillText(symbol.base, x, y + 4);
  const baseWidth = ctx.measureText(symbol.base).width;
  if (!symbol.subscript) return baseWidth;

  ctx.font = "700 9px Inter, sans-serif";
  ctx.strokeText(symbol.subscript, x + baseWidth + 1, y + 8);
  ctx.fillText(symbol.subscript, x + baseWidth + 1, y + 8);
  return baseWidth + 1 + ctx.measureText(symbol.subscript).width;
}

function drawLuminosityArcLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  gammaSubscript?: LuminosityLabelSubscript,
  luminositySubscript?: LuminosityLabelSubscript
): void {
  const symbols: LuminosityLabelSymbol[] = gammaSubscript
    ? [
        { base: "γ", subscript: gammaSubscript },
        { base: "L", subscript: luminositySubscript }
      ]
    : [{ base: "L", subscript: luminositySubscript }];
  const gap = gammaSubscript ? 3 : 0;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(6, 11, 24, 0.92)";
  ctx.lineWidth = 4;
  ctx.fillStyle = colorWithAlpha(color, 0.98);
  const widths = symbols.map((symbol) => measureLuminosityLabelSymbol(ctx, symbol));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (symbols.length - 1);
  let cursor = x - totalWidth / 2;
  symbols.forEach((symbol, index) => {
    cursor += drawLuminosityLabelSymbol(ctx, symbol, cursor, y);
    if (index < symbols.length - 1) cursor += gap;
  });
  ctx.restore();
}

function drawConvectionArcs(
  ctx: CanvasRenderingContext2D,
  row: Row,
  centerX: number,
  centerY: number,
  radiusScale: number
): void {
  const equilibriumGeometry = shellGeometryFor(1, mAt(1, state));
  const equilibriumThickness = Math.max(3, equilibriumGeometry.thickness * radiusScale);
  const radius = radiusScale;
  const segment = (Math.PI / 2) / 3;
  const gap = 0.018;
  const arcs: Array<{
    value: number;
    color: string;
    gammaSubscript?: LuminosityLabelSubscript;
    luminositySubscript?: LuminosityLabelSubscript;
  }> = [
    { value: weightedConvectiveLuminosity(row), color: COLORS.Lc, gammaSubscript: "c" as const, luminositySubscript: "c" as const },
    { value: row.L, color: COLORS.L },
    { value: weightedRadiativeLuminosity(row), color: COLORS.Lr, gammaSubscript: "r" as const, luminositySubscript: "r" as const }
  ];
  const arcWidths = arcs.map((arc) => clamp(equilibriumThickness * Math.max(0, arc.value), 2, equilibriumThickness * 3));
  const fixedLabelOffset = Math.max(18, equilibriumThickness * 0.75 + 10);
  const labelRadius = Math.min(
    radius + fixedLabelOffset,
    Math.max(0, Math.min(centerX, centerY) - 28)
  );

  ctx.save();
  ctx.lineCap = "butt";
  arcs.forEach((arc, index) => {
    const startAngle = index * segment + gap;
    const endAngle = (index + 1) * segment - gap;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = colorWithAlpha(arc.color, 0.96);
    ctx.lineWidth = arcWidths[index];
    ctx.stroke();
  });

  arcs.forEach((arc, index) => {
    const angle = (index + 0.5) * segment;
    drawLuminosityArcLabel(
      ctx,
      centerX + Math.cos(angle) * labelRadius,
      centerY + Math.sin(angle) * labelRadius,
      arc.color,
      arc.gammaSubscript,
      arc.luminositySubscript
    );
  });
  ctx.restore();
}

function drawModelVisualization(): void {
  const canvas = el<HTMLCanvasElement>("modelCanvas");
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 320);
  const height = Math.max(260, rect.height || width);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  canvas.dataset.animationSpeed = modelSpeedLabel(modelAnimationSpeed);

  const row = latestPhaseRows.length ? phaseRowAt(latestPhaseRows, currentAnimationPhase) : null;
  if (!row) {
    canvas.dataset.convectionActive = "false";
    canvas.dataset.luminosityArcLabels = "";
    canvas.dataset.geometryGuides = "";
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
    return;
  }

  const size = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = maximumPhaseRadius(latestPhaseRows);
  const radiusScale = (size * 0.36) / maxRadius;
  const geometry = shellGeometryFromModel(row, state);
  const luminosityLevel = normalizedInRange(row.L, latestPhaseLuminosityRange);
  const temperature = inferEffectiveTemperature(row.L, row.R);
  const blackbody = blackbodyRgbForTemperature(temperature);
  const shellColor = scaledRgb(blackbody, 0.58 + luminosityLevel * 0.52);
  const outerRadius = Math.max(2, geometry.outerRadius * radiusScale);
  const innerRadius = Math.max(0, geometry.innerRadius * radiusScale);
  const convectionActive = !convectiveResponseDisabled();
  const shellAlpha = 0.5 + luminosityLevel * 0.4;

  canvas.dataset.convectionActive = String(convectionActive);
  canvas.dataset.currentPhase = fmtFixed(row.tau, 3);
  canvas.dataset.luminosityArcLabels = convectionActive ? "gamma_c L_c,L,gamma_r L_r" : "";
  canvas.dataset.geometryGuides = "R=1,eta,minR,maxR";

  ctx.save();
  drawModelReferenceGuides(ctx, latestPhaseRows, centerX, centerY, radiusScale);

  ctx.shadowColor = rgbCss(blackbody, 0.65);
  ctx.shadowBlur = 12 + luminosityLevel * 22;
  drawAnnularSegment(
    ctx,
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    convectionActive ? Math.PI / 2 : 0,
    Math.PI * 2,
    rgbCss(shellColor, shellAlpha)
  );
  ctx.shadowBlur = 0;

  ctx.strokeStyle = rgbCss(blackbody, 0.84);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadius, convectionActive ? Math.PI / 2 : 0, Math.PI * 2);
  ctx.stroke();
  if (innerRadius > 1) {
    ctx.strokeStyle = rgbCss(blackbody, 0.34);
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, convectionActive ? Math.PI / 2 : 0, Math.PI * 2);
    ctx.stroke();
  }

  if (convectionActive) drawConvectionArcs(ctx, row, centerX, centerY, radiusScale);
  ctx.restore();
}

function drawAnimatedPhaseViews(): void {
  drawModelVisualization();
  drawPhasePlots();
}

function startModelAnimationLoop(): void {
  if (modelAnimationFrame) return;
  const tick = (timestamp: number) => {
    if (!document.hidden) {
      if (activePhaseScrub) {
        modelAnimationStartTime = null;
      } else {
        if (modelAnimationStartTime === null) {
          modelAnimationStartTime = timestamp - (currentAnimationPhase / 2) * modelAnimationDurationMs();
        }
        const duration = modelAnimationDurationMs();
        const elapsed = (timestamp - modelAnimationStartTime) % duration;
        currentAnimationPhase = (elapsed / duration) * 2;
      }
      drawAnimatedPhaseViews();
    } else {
      modelAnimationStartTime = null;
    }
    modelAnimationFrame = window.requestAnimationFrame(tick);
  };
  modelAnimationFrame = window.requestAnimationFrame(tick);
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
  updateGridLoopSliderMarkers();
  updateSonificationSourceControls();
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
    { label: "phase", value: phase.reason === "ok" ? "available" : "unavailable" }
  ];
  const metricsHtml = metricItems
    .map(({ label, value, className }) => `<span class="metric${className ? ` ${className}` : ""}">${label}<b>${value}</b></span>`)
    .join("");
  stageMathHtml(metricsNode, metricsHtml);
  queueMathTypeset([metricsNode]);

  const phaseMessage = gridState.enabled && activeGridRanges().length && !gridState.results.length
    ? gridState.statusText
    : phaseUnavailableLabel(phase);
  const phasePeriod = gridState.enabled ? currentGridResult()?.period ?? phase.period : phase.period;
  latestPhaseRows = gridState.enabled ? currentGridResult()?.phaseRows ?? phase.rows : phase.rows;
  latestPhaseSample = latestPhaseRows.length ? downsample(latestPhaseRows, 1800, ["L", "V", "H"]) : [];
  latestPhaseMessage = phaseMessage;
  latestPhasePeriodLabel = `phase (period = ${phasePeriod ? fmt(phasePeriod, 3) : "n/a"} τ)`;
  latestPhaseLuminosityRange = rawRange(latestPhaseRows.map((row) => row.L));
  drawModelVisualization();
  drawPhasePlots();

  const timeXlim = integrationTimeRange();
  const convectionOff = convectiveResponseDisabled();
  const timeKeys: PlotSeriesKey[] = convectionOff ? ["R", "V", "H"] : ["R", "V", "H", "Uc"];
  const lumKeys: PlotSeriesKey[] = convectionOff ? ["L"] : ["L", "Lr", "Lc"];
  const sampledTimeRows = rowsForInteractivePlot("time", rows, timeKeys);
  const sampledLumRows = rowsForInteractivePlot("lum", rows, lumKeys);
  const timeSeries: Series[] = [
    { label: "R", color: COLORS.R, rows: visibleRows("time", "R", sampledTimeRows), x: (row) => row.tau, y: (row) => row.R },
    { label: "V", color: COLORS.V, rows: visibleRows("time", "V", sampledTimeRows), x: (row) => row.tau, y: (row) => row.V },
    { label: "H", color: COLORS.H, rows: visibleRows("time", "H", sampledTimeRows), x: (row) => row.tau, y: (row) => row.H }
  ];
  if (!convectionOff) {
    timeSeries.push({ label: "Uc", color: COLORS.Uc, rows: visibleRows("time", "Uc", sampledTimeRows), x: (row) => row.tau, y: (row) => row.Uc });
  }
  drawSeries("timeCanvas", timeSeries, {
    xlabel: "time τ",
    ylabel: "state",
    xlabelColor: COLORS.tau,
    fallbackXlim: timeXlim,
    view: plotViews.time,
    interactivePlotId: "time",
    denseEnvelope: true,
    message: "all series hidden"
  });
  const timeLegendItems: LegendItem[] = [
    { key: "R", label: `\\(${TEX.R}\\) radius`, color: COLORS.R, toggleLabel: "radius" },
    { key: "V", label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V, toggleLabel: "radial velocity" },
    { key: "H", label: `\\(${TEX.H}\\) pressure factor`, color: COLORS.H, toggleLabel: "pressure factor" }
  ];
  if (!convectionOff) {
    timeLegendItems.push({ key: "Uc", label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc, toggleLabel: "convective velocity" });
  }
  drawLegend("timeLegend", timeLegendItems, { plotId: "time" });

  const lumSeries: Series[] = [
    { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", sampledLumRows), x: (row) => row.tau, y: (row) => row.L }
  ];
  if (!convectionOff) {
    lumSeries.push(
      { label: "gamma_r Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", sampledLumRows), x: (row) => row.tau, y: (row) => weightedRadiativeLuminosity(row) },
      { label: "gamma_c Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", sampledLumRows), x: (row) => row.tau, y: (row) => weightedConvectiveLuminosity(row) }
    );
  }
  drawSeries("lumCanvas", lumSeries, {
    xlabel: "time τ",
    ylabel: "luminosity",
    xlabelColor: COLORS.tau,
    fallbackXlim: timeXlim,
    view: plotViews.lum,
    interactivePlotId: "lum",
    denseEnvelope: true,
    message: "all luminosity variables hidden"
  });
  const lumLegendItems: LegendItem[] = convectionOff
    ? [{ label: `\\(${TEX.L}\\) total`, color: COLORS.L }]
    : [
        { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
        { key: "Lr", label: `\\(\\ozNeutral{\\gamma_r}\\,${TEX.Lr}\\) radiative`, color: COLORS.Lr, toggleLabel: "radiative luminosity" },
        { key: "Lc", label: `\\(${TEX.gammac}\\,${TEX.Lc}\\) convective`, color: COLORS.Lc, toggleLabel: "convective luminosity" }
      ];
  drawLegend("lumLegend", lumLegendItems, convectionOff ? {} : { plotId: "lum" });
  drawFourierPanel();
}

function startApp(): void {
  buildControls();
  solveAndDraw();
  startModelAnimationLoop();
  window.addEventListener("load", () => queueMathTypeset());
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
