import {
  COLORS,
  CHI_PARAMETER_BREAK,
  CHI_PARAMETER_MAX,
  CHI_PARAMETER_MIN,
  CONTROL_GROUPS,
  DEFAULT_PRESET_NAME,
  PARAMETER_DESCRIPTIONS,
  PRESETS,
  RESPONSE_LOG_MAX,
  RESPONSE_LOG_MIN,
  TEX,
  type ControlParameterKey,
  type ControlDef,
  type ModelParameters,
  type Row,
  derivedPowers,
  effectiveGammaC,
  linearDynamicPeriod,
  mAt,
  sample,
  solveModel
} from "./model";
import {
  centerSliderSample,
  defaultGridRange,
  normalizeGridRange,
  parameterValueFromSlider,
  roundToNativeStep,
  sliderMeta,
  sliderValueFromNumericValue,
  sliderValueFromParameter,
  type GridBudget,
  type GridCompleteMessage,
  type GridModelResult,
  type GridRange,
  type GridWorkerMessage
} from "./grid";
import { computeGridWithMessages } from "./gridCompute";
import { buildTwoCyclePhase, guidedMinSeparationFromPeriod, phaseWarmupTau, type PhaseAnchor, type PhaseResult } from "./phase";
import {
  buildPhaseDisplayWindow,
  buildTimeDisplayWindow,
  displayAnimationEnd,
  displayMarkerX,
  isTimeWindowReason,
  rowAtDisplayPosition,
  rowAtTime,
  shouldUseRunawayGrowthWindow,
  type DisplayWindow,
  type DisplayWindowMode
} from "./displayWindow";
import { computeFourierParameters } from "./fourier";
import { SOLVER_NAMES, type SolverName } from "./solvers";
import {
  blackbodyRgbForTemperature,
  inferEffectiveTemperature,
  rgbCss,
  shellGeometryFor,
  shellGeometryFromModel,
  type RgbColor
} from "./visualization";
import {
  PHASE_LAG_DEFAULT_PAIR_IDS,
  PHASE_LAG_PAIRS,
  phaseLagSeriesPoints,
  type PhaseLagPair,
  type PhaseLagPairId,
  type PhaseLagPoint,
  type PhaseLagQuantityKey
} from "./phaseLag";
import {
  computePeriodogram,
  rowsAfterCut,
  type PeriodogramResult
} from "./periodogram";
import {
  analyticStabilityConditions,
  cepheidStripCoordinate,
  type AnalyticStabilityCondition,
  type AnalyticStabilityKind,
  type AnalyticStabilityResult,
  type StabilityPhysicsMode,
  type StabilityKind
} from "./stability";
import {
  PAPER_PHASE_POINT_MAX,
  PAPER_PHASE_STORAGE_KEY,
  addPaperPhasePoint,
  centerGridPathIndex,
  extremaPaperPhaseSelection,
  isPaperPhaseEvent,
  nextThemeMode,
  normalizePaperPhaseSelection,
  paperPhaseEventLabel,
  parseThemeMode,
  quarterPaperPhaseSelection,
  removePaperPhasePoint,
  resolvePaperSnapshots,
  updateNumericPaperPhase,
  type PaperPhaseEvent,
  type PaperPhaseSelectionV1,
  type ResolvedPaperSnapshot,
  type ThemeMode
} from "./paperMode";
import {
  createPaperBundle,
  downloadPaperBundle,
  type PaperExportManifestV1,
  type PaperFigureSize,
  type PaperPanelRenderer,
  type PaperRenderResult
} from "./paperExport";
import { Context as SvgCanvasContext } from "svgcanvas";

declare const __OZWIZARD_VERSION__: string;
declare const __OZWIZARD_COMMIT__: string;

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
let lastDerivationSignature = "";
let statusMetricsExpanded = false;
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
const GRID_TIMEOUT_DEFAULT_SECONDS = 3;
const GRID_TIMEOUT_MIN_SECONDS = 0.25;
const GRID_TIMEOUT_MAX_SECONDS = 30;
const GRID_TIMEOUT_STEP_SECONDS = 0.25;
const GRID_MODEL_BUDGET_DEFAULT = 50;
const GRID_MODEL_BUDGET_MIN = 3;
const GRID_MODEL_BUDGET_MAX = 2000;
const GRID_MODEL_TIMING_SAFETY_FACTOR = 1.2;
const GRID_MODEL_TIMING_BLEND = 0.35;
const GRID_MODEL_TIMING_MIN_MS = 0.25;
const GRID_MODEL_TIMING_MAX_MS = 60000;
const GRID_PHASE_BACKGROUND_MAX_MODELS = 96;
const GRID_PHASE_BACKGROUND_MAX_POINTS = 160;
const GRID_PHASE_PATH_MAX_POINTS = 260;
const GRID_PHASE_CURRENT_MAX_POINTS = 900;
const TP_OPACITY_BACKGROUND_MAX_MODELS = 28;
const TP_OPACITY_BACKGROUND_MAX_POINTS = 220;
const TP_OPACITY_PATH_MAX_POINTS = 360;
const TP_OPACITY_CURRENT_MAX_POINTS = 900;
const PHASE_MARKER_COLOR = "#FFD166";
const POSITIVE_VELOCITY_COLOR = "#4DA3FF";
const NEGATIVE_VELOCITY_COLOR = "#FF5F6D";
const FOURIER_PHASE_HARMONICS = [2, 3, 4, 5, 6, 7] as const;
const FOURIER_PHASE_DIFF_HARMONICS = [2, 3, 4, 5] as const;
const FOURIER_HARMONIC_COLORS: Record<number, string> = {
  2: "#79C0FF",
  3: "#FF7B72",
  4: "#7EE787",
  5: "#FFD166",
  6: "#C297FF",
  7: "#39C5CF"
};
const PHASE_SCRUB_CANVAS_IDS = ["lightCanvas", "velocityCanvas", "pressureCanvas"] as const;
const PHASE_HOVER_CANVAS_IDS = ["lightCanvas", "velocityCanvas"] as const;
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
let gridBudgetMode: GridBudgetMode = "timeout";
let gridTimeoutSeconds = GRID_TIMEOUT_DEFAULT_SECONDS;
let gridModelBudget = GRID_MODEL_BUDGET_DEFAULT;
let gridModelMsEstimate: number | null = null;
let modelAnimationFrame = 0;
let modelAnimationStartTime: number | null = null;
let latestDisplayWindow: DisplayWindow = {
  mode: "phase",
  reason: "phase_unavailable",
  rows: [],
  xlim: [0, 2],
  period: null
};
let latestPhaseRows: Row[] = [];
let latestPhaseSample: Row[] = [];
let latestPhaseMessage: string | undefined;
let latestPhasePeriodLabel = "phase (period = n/a τ)";
let latestPhaseLuminosityRange: NumericRange = [0, 1];
let latestPhaseParameters: ModelParameters = state;
let paperPhaseSelection: PaperPhaseSelectionV1 = extremaPaperPhaseSelection();
let latestPeriodogramRows: Row[] = [];
let latestPeriodogramCutTau = 0;
let latestPeriodogramPeriod: number | null = null;
let latestPeriodogramWindow = "post-relaxation";
let phaseAnnotationsVisible = false;
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
let activePhaseHoverCanvasId: string | null = null;
let activeReferencePlotInteraction: ReferencePlotInteraction | null = null;
let pianoModeActive = false;
let pianoStartOctave = PIANO_DEFAULT_START_OCTAVE;
let pianoMasterGain: GainNode | null = null;
let pianoEnvelope: PianoEnvelope = { ...PIANO_DEFAULT_ENVELOPE };
let pianoSustainLevel = PIANO_DEFAULT_SUSTAIN_LEVEL;
const activePianoVoices = new Map<string, PianoVoice>();
const activePianoMidiCounts = new Map<number, number>();
const referencePlotRenderStates = new Map<string, ReferencePlotRenderState>();
let gridPathCache: { key: string; results: GridModelResult[] } | null = null;
const gridPhaseRowCache = new WeakMap<GridModelResult, Map<string, Row[]>>();
let thermodynamicGridBackdropCache: ThermodynamicGridBackdrop | null = null;
const TAU_SCALE_MAX = 1000;
const TAU_TICKS = [1, 3, 10, 30, 100, 300];
const TP_TEMPERATURE_DATA_LABEL = "log10(T/T_0)";
const TP_PRESSURE_DATA_LABEL = "log10(P/P_0)";
const TP_OPACITY_DATA_LABEL = "log10(kappa/kappa_0)";

function cssVariable(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function themeSurface(alpha: number): string {
  return colorWithAlpha(cssVariable("--paper-high", "#212830"), alpha);
}

function themeBorder(alpha: number): string {
  return colorWithAlpha(cssVariable("--line-strong", "#656C76"), alpha);
}

function themeRule(alpha: number): string {
  return colorWithAlpha(cssVariable("--muted", "#9198A1"), alpha);
}

function floatingCanvasPanelFill(alpha = 0.9): string {
  const variableName = lightThemeActive() ? "--paper" : "--paper-high";
  const fallback = lightThemeActive() ? "#FFFFFF" : "#212830";
  return colorWithAlpha(cssVariable(variableName, fallback), alpha);
}

function floatingCanvasPanelBorder(alpha = 0.72): string {
  return colorWithAlpha(cssVariable("--line", "#3D444D"), alpha);
}

function lightThemeActive(): boolean {
  return document.documentElement.dataset.theme === "light" || paperModeActive();
}

function paperModeActive(): boolean {
  return document.documentElement.dataset.theme === "paper";
}

function canvasTextHaloColor(alpha = 0.9): string {
  return colorWithAlpha(cssVariable("--canvas", "#0D1117"), alpha);
}

function canvasTextHaloWidth(width: number): number {
  return lightThemeActive() ? Math.min(width, 1.8) : width;
}

function canvasMarkerOutlineColor(alpha = 0.9): string {
  return lightThemeActive() ? colorWithAlpha(cssVariable("--line-strong", "#656C76"), alpha) : canvasTextHaloColor(alpha);
}

const THEME = {
  get axisGrid() { return cssVariable("--canvas-grid", "#30363D"); },
  get axisText() { return cssVariable("--muted", "#9198A1"); },
  get axisBorder() { return cssVariable("--line", "#3D444D"); },
  get plotBackground() { return cssVariable("--plot-canvas-bg", "#000000"); },
  get selectionFill() { return cssVariable("--selection-fill", "#388BFD1A"); },
  get selectionStroke() { return cssVariable("--focus", "#1F6FEB"); },
  get neutralSymbol() { return cssVariable("--neutral-symbol", "#F0F6FC"); }
} as const;

type PlotBox = { left: number; top: number; width: number; height: number };
type NumericRange = [number, number];
type InteractivePlotId = "time" | "lum";
type RowSeriesKey = "R" | "V" | "H" | "Uc" | "L" | "Lr" | "Lc";
type PlotSeriesKey = RowSeriesKey | "Lb";
type UserPlotId = "model" | "light" | "velocity" | "heatEngine" | "work" | "time" | "lum" | "tpOpacity" | "periodogram" | "phaseLag" | "stability" | "strip" | "phasePortrait";
type SonificationSource = "luminosity" | "velocity" | "pressure";
type GridBudgetMode = GridBudget["mode"];
const PHASE_LAG_YLIM: NumericRange = [-0.5, 0.5];
const PHASE_LAG_AXIS_LABEL = "phase lag \u0394\u03c6";

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

interface ReferencePlotRenderState {
  plot: PlotBox;
  xlim: NumericRange;
  ylim: NumericRange;
  width: number;
  height: number;
}

interface ReferencePlotInteraction {
  canvasId: "stabilityMapCanvas" | "cepheidGuideCanvas";
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
  base: "A" | "r" | "phi";
  subscript: string;
}

type FourierValueAccessor = (result: GridModelResult) => number;

interface FourierPanelSpec {
  latex: string;
  xLabel: string;
  yLabel: FourierAxisLabel;
  xValue: FourierValueAccessor;
  yValue?: FourierValueAccessor;
  harmonicValues?: (result: GridModelResult, harmonic: number) => number;
  harmonics?: number[];
  xPhase?: boolean;
  yPhase?: boolean;
  upperSkewnessAxis?: boolean;
  identityLine?: boolean;
  adiabaticReference?: boolean;
}

interface FourierSeriesPoint {
  x: number;
  y: number;
  result?: GridModelResult;
}

type PhasePortraitKey = "H" | "Uc";

interface CanvasMathFragment {
  text: string;
  subscript?: string;
  superscript?: string;
  color?: string;
  weight?: string | number;
}

interface CanvasMathOptions {
  align?: CanvasTextAlign;
  color?: string;
  fontSize?: number;
  rotate?: number;
  strokeColor?: string;
  strokeWidth?: number;
  subscriptSize?: number;
  weight?: string | number;
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
  restorePlotVisibility: Pick<Record<UserPlotId, boolean>, "model" | "heatEngine" | "work" | "time" | "lum"> | null;
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
  lum: { L: true, Lr: true, Lc: true, Lb: true }
};

const PLOT_PANEL_LABELS: Record<UserPlotId, string> = {
  model: "Shell",
  light: "Lightcurve",
  velocity: "RV Curve",
  heatEngine: "Piston",
  work: "Work",
  time: "History",
  lum: "Luminosity Evolution",
  tpOpacity: "T-P Loop",
  periodogram: "Periodogram",
  phaseLag: "Phase Lag",
  stability: "Stability Map",
  strip: "Instability Strip",
  phasePortrait: "Thermal-Convection Loop"
};

const plotPanelVisibility: Record<UserPlotId, boolean> = {
  model: true,
  light: true,
  velocity: true,
  heatEngine: true,
  work: true,
  time: true,
  lum: true,
  tpOpacity: true,
  periodogram: true,
  phaseLag: true,
  stability: true,
  strip: true,
  phasePortrait: true
};

const phaseLagPairVisibility = Object.fromEntries(
  PHASE_LAG_PAIRS.map((pair) => [pair.id, PHASE_LAG_DEFAULT_PAIR_IDS.has(pair.id)])
) as Record<PhaseLagPairId, boolean>;

const plotRenderStates = new Map<string, PlotRenderState>();
const legendSignatures = new Map<string, string>();
let activeSelection: PlotSelection | null = null;
const gridColorbarRegions = new Map<string, GridColorbarRegion>();
let fourierPointHits: FourierPointHit[] = [];
let activeGridCanvasInteraction: GridCanvasInteraction | null = null;
const activeGridSliderPointers = new Set<number>();
let pendingGridComputeAfterSliderRelease = false;
const SLIDER_RANGE_DOUBLE_TAP_MS = 360;
const SLIDER_RANGE_DOUBLE_TAP_DISTANCE = 22;
let activeSliderTapStart: { key: ControlParameterKey; pointerId: number; x: number; y: number } | null = null;
let lastSliderTap: { key: ControlParameterKey; time: number; x: number; y: number } | null = null;
const DENSE_ENVELOPE_POINTS_PER_PIXEL = 2.25;
const STABILITY_MAP_RESOLUTION = 54;
const INSTABILITY_STRIP_X_RESOLUTION = 72;
const INSTABILITY_STRIP_Y_RESOLUTION = 44;
const STRIP_LOG_RATIO_MIN = -2;
const STRIP_LOG_RATIO_MAX = 2;
const stabilityMapCache = new Map<string, StabilityKind[]>();
const instabilityStripCache = new Map<string, { kinds: StabilityKind[]; counts: Record<StabilityKind, number>; signature: string }>();
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
  if (Number(fixed) === 0) return "0";
  const decimal = digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
  const scientific = value.toExponential(2).replace(/\.?0+e/, "e");
  return scientific.length < decimal.length ? scientific : decimal;
}

interface StatusMetricItem {
  label: string;
  value: string | number;
  className?: string;
  stabilityKind?: AnalyticStabilityKind;
  detail?: string;
  formula?: string;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function s72State(stable: boolean): "stable" | "unstable" {
  return stable ? "stable" : "unstable";
}

function s72Verdict(kind: AnalyticStabilityKind, stable: boolean): string {
  const stateText = stable ? "stable" : "unstable";
  if (kind === "convective") return `convectively/turbulently ${stateText}`;
  if (kind === "dynamic") return `dynamically ${stateText}`;
  if (kind === "secular") return `secularly ${stateText}`;
  return `pulsationally ${stateText}`;
}

function s72MetricClass(stable: boolean): "status-ok" | "status-bad" {
  return stable ? "status-ok" : "status-bad";
}

function s72LatexInequality(satisfied: boolean, symbol: ">" | "<"): string {
  if (satisfied) return symbol;
  return symbol === ">" ? "\\not\\gt" : "\\not\\lt";
}

function s72TextInequality(satisfied: boolean, symbol: ">" | "<"): string {
  if (satisfied) return symbol;
  return symbol === ">" ? "\u226F" : "\u226E";
}

function s72ShortLabel(kind: AnalyticStabilityKind): string {
  if (kind === "convective") return "conv";
  if (kind === "dynamic") return "dyn";
  if (kind === "secular") return "sec";
  return "puls";
}

function s72E(): string {
  return "\\ozNeutral{E}";
}

const TEX_GAMMAC_EFF = "\\ozGammac{\\gamma_{c,\\rm eff}}";

function s72Restoring(): string {
  return `(${TEX.m}${TEX.gamma1}-4)`;
}

function s72RadiativeThermal(): string {
  return `(1-${TEX_GAMMAC_EFF})(${TEX.s}+4)`;
}

function s72SecularCoupling(): string {
  return `${s72E()}+${s72Restoring()}${s72RadiativeThermal()}`;
}

function s72ConvectiveCorrection(): string {
  return `\\frac{3}{2}${TEX_GAMMAC_EFF}(${TEX.m}-4)`;
}

function s72ConvectiveMargin(): string {
  return `${TEX.zeta}${TEX.zetac}\\left[${s72SecularCoupling()}+${s72ConvectiveCorrection()}\\right]`;
}

function s72SecularMargin(stability: AnalyticStabilityResult): string {
  if (stability.physicsMode === "radiative") return `${TEX.zeta}\\left[${s72SecularCoupling()}\\right]`;
  return `${TEX.zetac}${s72Restoring()}+${TEX.zeta}\\left[${s72SecularCoupling()}\\right]`;
}

function s72DynamicCoupling(): string {
  return `${TEX.zeta}${TEX.zetac}\\left[${s72RadiativeThermal()}+\\frac{3}{2}${TEX_GAMMAC_EFF}\\right]+${s72Restoring()}`;
}

function s72ThermalResponse(): string {
  return `${TEX.zetac}+${TEX.zeta}${s72RadiativeThermal()}`;
}

function s72DynamicMargin(stability: AnalyticStabilityResult): string {
  if (stability.physicsMode === "radiative") return s72Restoring();
  return `\\left[${s72SecularMargin(stability)}\\right]\\left[${s72DynamicCoupling()}\\right]-\\left[${s72ConvectiveMargin()}\\right]\\left[${s72ThermalResponse()}\\right]`;
}

function s72PulsationalMargin(stability: AnalyticStabilityResult): string {
  if (stability.physicsMode === "radiative") return `-${s72E()}`;
  return `\\left[${s72ThermalResponse()}\\right]\\ozNeutral{\\Delta_{\\rm dyn}}-\\left[${s72SecularMargin(stability)}\\right]^2`;
}

function s72ConditionMetric(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string {
  const symbol = s72LatexInequality(condition.stable, ">");
  const formula = s72ConditionFormula(stability, condition);
  return `\\(${formula}=${fmt(condition.value, 2)} ${symbol} 0\\)`;
}

function s72ConditionFormula(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string {
  return condition.kind === "convective"
    ? s72ConvectiveMargin()
    : condition.kind === "secular"
      ? s72SecularMargin(stability)
      : condition.kind === "dynamic"
        ? s72DynamicMargin(stability)
        : s72PulsationalMargin(stability);
}

function mathChunk(latex: string): string {
  return `<span class="stability-equation-chunk">\\(${latex}\\)</span>`;
}

function s72ConditionFormulaChunks(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string[] {
  if (condition.kind === "convective") {
    return [
      `${TEX.zeta}${TEX.zetac}\\bigl[`,
      s72E(),
      `+${s72Restoring()}${s72RadiativeThermal()}`,
      `+${s72ConvectiveCorrection()}\\bigr]`
    ];
  }
  if (condition.kind === "secular") {
    return stability.physicsMode === "radiative"
      ? [`${TEX.zeta}\\bigl[`, s72E(), `+${s72Restoring()}${s72RadiativeThermal()}\\bigr]`]
      : [`${TEX.zetac}${s72Restoring()}`, `+${TEX.zeta}\\bigl[`, s72E(), `+${s72Restoring()}${s72RadiativeThermal()}\\bigr]`];
  }
  if (condition.kind === "dynamic") {
    if (stability.physicsMode === "radiative") return [s72Restoring()];
    return [
      `\\left[${s72SecularMargin(stability)}\\right]`,
      `\\left[${s72DynamicCoupling()}\\right]`,
      `-\\left[${s72ConvectiveMargin()}\\right]`,
      `\\left[${s72ThermalResponse()}\\right]`
    ];
  }
  return stability.physicsMode === "radiative"
    ? [`-${s72E()}`]
    : [
        `\\left[${s72ThermalResponse()}\\right]`,
        `\\ozNeutral{\\Delta_{\\rm dyn}}`,
        `-\\left[${s72SecularMargin(stability)}\\right]^2`
      ];
}

function s72ConditionMetricHtml(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string {
  const symbol = s72LatexInequality(condition.stable, ">");
  const chunks = s72ConditionFormulaChunks(stability, condition)
    .map(mathChunk)
    .join("<wbr>");
  return `<span class="stability-equation">${chunks}<wbr>${mathChunk(`=${fmt(condition.value, 2)} ${symbol} 0`)}</span>`;
}

function s72ConciseVerdict(kind: AnalyticStabilityKind, stable: boolean): string {
  const stateText = stable ? "stable" : "unstable";
  if (kind === "convective") return `turb-response ${stateText}`;
  if (kind === "dynamic") return `dynamically ${stateText}`;
  if (kind === "secular") return `secularly ${stateText}`;
  return `pulsationally ${stateText}`;
}

function s72ConditionSummary(condition: AnalyticStabilityCondition): string {
  const symbol = s72TextInequality(condition.stable, ">");
  return `${s72ConciseVerdict(condition.kind, condition.stable)} <span class="stability-margin">(${fmt(condition.value, 2)} ${symbol} 0)</span>`;
}

function s72TermSummary(stability: AnalyticStabilityResult): string {
  const { radiativeThermal, restoring, secularCoupling, convectiveCorrection, thermalResponse, dynamicCoupling } = stability.terms;
  return `E=${fmt(stability.eCoefficient, 3)}, (chi0*Gamma1 - 4)=${fmt(restoring, 3)}, (1-gamma_c_eff)*(s+4)=${fmt(radiativeThermal, 3)}, E+(chi0*Gamma1 - 4)*(1-gamma_c_eff)*(s+4)=${fmt(secularCoupling, 3)}, 3*gamma_c_eff*(chi0 - 4)/2=${fmt(convectiveCorrection, 3)}, zeta_c+zeta*(1-gamma_c_eff)*(s+4)=${fmt(thermalResponse, 3)}, zeta*zeta_c*((1-gamma_c_eff)*(s+4)+3*gamma_c_eff/2)+chi0*Gamma1-4=${fmt(dynamicCoupling, 3)}`;
}

function s72ConditionTitle(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string {
  const symbol = s72TextInequality(condition.stable, ">");
  const prefix = condition.kind === "convective"
    ? "Convective/turbulent stability"
    : condition.kind === "dynamic"
      ? "Dynamic stability"
      : condition.kind === "secular"
        ? "Secular stability"
        : "Pulsational stability";
  return `${prefix}: ${s72TermSummary(stability)}; margin=${fmt(condition.value, 3)} ${symbol} 0 -> ${s72Verdict(condition.kind, condition.stable)}`;
}

function linearPeriodMetric(parameters: ModelParameters, period: number | null): string {
  const chi = mAt(1, parameters);
  const frequencySquared = chi * parameters.gamma1 - 4;
  const value = period ? fmt(period, 3) : "\\ozNeutral{n/a}";
  return `\\(2\\pi/\\sqrt{\\ozChi{\\chi}\\ozGamma{\\Gamma_1}-4}=${value}\\)`;
}

function linearPeriodTitle(parameters: ModelParameters, period: number | null): string {
  const chi = mAt(1, parameters);
  const frequencySquared = chi * parameters.gamma1 - 4;
  if (!period) {
    return `Linear dynamic period unavailable because chi*Gamma_1 - 4 = ${fmt(frequencySquared, 4)} is not positive.`;
  }
  return `Linear dynamic period from 2*pi/sqrt(chi*Gamma_1 - 4): chi=${fmt(chi, 4)}, Gamma_1=${fmt(parameters.gamma1, 4)}, P_lin=${fmt(period, 4)}.`;
}

function nonlinearPeriodTitle(period: number | null): string {
  return period
    ? `Nonlinear period measured from the selected luminosity extrema in the integration: P_nonlin=${fmt(period, 4)}.`
    : "Nonlinear period unavailable because the integration did not produce a usable phase window.";
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

  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.fillStyle = THEME.axisText;
  ctx.font = "700 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("amp", 0, plot.top - 2);
  ctx.font = "11px Inter, sans-serif";
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

function updateSonificationCurve(phaseRows: Row[], fallbackRows: Row[], parameters: ModelParameters): void {
  const firstCycleRows = phaseRows.filter((row) => row.tau >= 0 && row.tau <= 1);
  const nextSamples = firstCycleRows.length >= 3
    ? buildSonificationSamples(firstCycleRows, [0, 1], parameters)
    : buildSonificationSamples(fallbackRows, undefined, parameters);
  const nextSignature = sonificationSampleSignature(nextSamples);
  document.getElementById("pianoPanel")?.setAttribute("data-sonification-signature", nextSignature);
  if (nextSignature === sonificationWaveformSignature) return;
  sonificationSamples = nextSamples;
  sonificationWaveformSignature = nextSignature;
  updateSonificationWaveform();
  updateActivePianoWaveforms();
}

function syncSonificationCurve(displayWindow: DisplayWindow, gridResult: GridModelResult | null, fallbackRows: Row[]): void {
  const sonificationFallbackRows = displayWindow.mode === "time" || gridResult ? latestPhaseRows : fallbackRows;
  updateSonificationCurve(
    displayWindow.mode === "phase" ? latestPhaseRows : [],
    sonificationFallbackRows,
    latestPhaseParameters
  );
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

function acousticPressure(row: Row, parameters = state): number {
  const m = mAt(row.R, parameters);
  return row.H * row.R ** (-m * parameters.gamma1);
}

function acousticPressureSignal(row: Row, parameters = state): number {
  const pressure = acousticPressure(row, parameters);
  return pressure > 0 ? pressure : NaN;
}

function sonificationSignal(row: Row, parameters: ModelParameters): number {
  switch (sonificationSource) {
    case "luminosity":
      return row.L;
    case "velocity":
      return row.V;
    case "pressure":
      return acousticPressureSignal(row, parameters);
  }
}

function buildSonificationSamples(rows: Row[], domain: NumericRange | undefined, parameters: ModelParameters): SonificationSample[] {
  const finiteRows = rows
    .map((row) => ({ row, value: sonificationSignal(row, parameters) }))
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

function stabilityChipFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("#metrics [data-stability-expanded]");
}

function statusSummaryFromEvent(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLButtonElement>("#metrics [data-status-summary]");
}

function setStatusMetricsExpanded(expanded: boolean): void {
  statusMetricsExpanded = expanded;
  const metrics = el<HTMLDivElement>("metrics");
  const summary = metrics.querySelector<HTMLButtonElement>("[data-status-summary]");
  const details = metrics.querySelector<HTMLElement>("#statusMetricDetails");
  if (!summary || !details) return;
  summary.setAttribute("aria-expanded", String(expanded));
  summary.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} status details`);
  details.hidden = !expanded;
}

function setStabilityChipExpanded(chip: HTMLElement, expanded: boolean): void {
  chip.setAttribute("aria-expanded", expanded ? "true" : "false");
  if (expanded) chip.dataset.stabilityView = "formula";
  else delete chip.dataset.stabilityView;
}

function toggleStabilityChip(chip: HTMLElement): void {
  setStabilityChipExpanded(chip, chip.getAttribute("aria-expanded") !== "true");
}

function setupStabilityChipInteractions(): void {
  const metrics = el<HTMLDivElement>("metrics");
  metrics.addEventListener("click", (event) => {
    const summary = statusSummaryFromEvent(event);
    if (summary) {
      event.preventDefault();
      setStatusMetricsExpanded(summary.getAttribute("aria-expanded") !== "true");
      return;
    }
    const chip = stabilityChipFromEvent(event);
    if (!chip) return;
    event.preventDefault();
    toggleStabilityChip(chip);
  });
  metrics.addEventListener("keydown", (event) => {
    const summary = statusSummaryFromEvent(event);
    if (summary && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setStatusMetricsExpanded(summary.getAttribute("aria-expanded") !== "true");
      return;
    }
    const chip = stabilityChipFromEvent(event);
    if (!chip || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleStabilityChip(chip);
  });
}

function buildControls(): void {
  setupResponsiveSidebarControls();
  setupSonificationControls();
  setupStabilityChipInteractions();
  setupModelSpeedControl();
  setupPhaseAnnotationControls();
  setupGridSliderDeferral();
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
  setupReferencePlotInteractions();
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

function currentThemeMode(): ThemeMode {
  return parseThemeMode(document.documentElement.dataset.theme);
}

function setupThemeToggle(): void {
  const button = document.getElementById("themeToggle");
  if (!(button instanceof HTMLButtonElement)) return;
  syncThemeToggleButton();
  button.addEventListener("click", () => {
    setThemeMode(nextThemeMode(currentThemeMode()));
  });
}

function setThemeMode(mode: ThemeMode): void {
  const leavingPaper = paperModeActive() && mode !== "paper";
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
  try {
    window.localStorage.setItem("ozwizard-theme", mode);
  } catch (_error) {}
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = mode === "dark" ? "#161512" : "#ffffff";
  if (mode === "paper") {
    stopModelAnimationLoop();
    stopGridAnimation();
    stopSonification();
    releaseAllPianoNotes();
    pianoModeActive = false;
    setPianoPanelVisible(false);
    activePhaseScrub = null;
    activePhaseHoverCanvasId = null;
    selectPaperGridCenter();
  }
  syncThemeToggleButton();
  updatePianoToggleUi();
  updatePaperModeControls();
  thermodynamicGridBackdropCache = null;
  drawAdsrVisualization();
  drawAll();
  if (leavingPaper) {
    startModelAnimationLoop();
    if (gridState.enabled && gridPathResults().length > 1) startGridAnimation();
  }
}

function syncThemeToggleButton(): void {
  const button = document.getElementById("themeToggle");
  if (!(button instanceof HTMLButtonElement)) return;
  const mode = currentThemeMode();
  const nextMode = nextThemeMode(mode);
  const label = `Theme: ${mode}. Switch to ${nextMode} mode`;
  button.setAttribute("aria-label", label);
  button.dataset.themeMode = mode;
  button.title = label;
}

function loadPaperPhaseSelection(): PaperPhaseSelectionV1 {
  try {
    const stored = window.localStorage.getItem(PAPER_PHASE_STORAGE_KEY);
    return stored ? normalizePaperPhaseSelection(JSON.parse(stored)) : extremaPaperPhaseSelection();
  } catch {
    return extremaPaperPhaseSelection();
  }
}

function savePaperPhaseSelection(): void {
  try {
    window.localStorage.setItem(PAPER_PHASE_STORAGE_KEY, JSON.stringify(paperPhaseSelection));
  } catch (_error) {}
}

function applyPaperPhaseSelection(selection: PaperPhaseSelectionV1): void {
  paperPhaseSelection = normalizePaperPhaseSelection(selection);
  savePaperPhaseSelection();
  updatePaperModeControls();
  if (paperModeActive()) {
    drawModelVisualization();
    drawHeatEnginePanel();
  }
}

function nextAvailablePaperPhase(): number {
  const used = paperPhaseSelection.points.flatMap((point) => point.kind === "phase" ? [point.phase] : []);
  for (const candidate of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    if (!used.some((phase) => Math.abs(phase - candidate) < 1e-6)) return candidate;
  }
  return 0;
}

function setupPaperModeControls(): void {
  paperPhaseSelection = loadPaperPhaseSelection();
  document.getElementById("paperExtremaPreset")?.addEventListener("click", () => applyPaperPhaseSelection(extremaPaperPhaseSelection()));
  document.getElementById("paperQuarterPreset")?.addEventListener("click", () => applyPaperPhaseSelection(quarterPaperPhaseSelection()));
  document.getElementById("paperAddPhase")?.addEventListener("click", () => {
    applyPaperPhaseSelection(addPaperPhasePoint(paperPhaseSelection, { kind: "phase", phase: nextAvailablePaperPhase() }));
  });
  document.getElementById("paperAddEvent")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value as PaperPhaseEvent;
    if (isPaperPhaseEvent(value)) {
      applyPaperPhaseSelection(addPaperPhasePoint(paperPhaseSelection, { kind: "event", event: value }));
    }
    select.value = "";
  });
  document.getElementById("paperExportBundle")?.addEventListener("click", () => {
    void exportPaperBundle();
  });
  updatePaperModeControls();
}

function updatePaperModeControls(): void {
  const bar = document.getElementById("paperModeBar");
  if (bar instanceof HTMLElement) bar.dataset.active = String(paperModeActive());
  const extrema = document.getElementById("paperExtremaPreset");
  const quarters = document.getElementById("paperQuarterPreset");
  extrema?.classList.toggle("active", paperPhaseSelection.preset === "extrema");
  quarters?.classList.toggle("active", paperPhaseSelection.preset === "quarters");
  const addPhase = document.getElementById("paperAddPhase") as HTMLButtonElement | null;
  const addEvent = document.getElementById("paperAddEvent") as HTMLSelectElement | null;
  const atLimit = paperPhaseSelection.points.length >= PAPER_PHASE_POINT_MAX;
  if (addPhase) addPhase.disabled = atLimit;
  if (addEvent) addEvent.disabled = atLimit;
  const container = document.getElementById("paperPhasePoints");
  if (!(container instanceof HTMLElement)) return;
  container.replaceChildren();
  paperPhaseSelection.points.forEach((point, index) => {
    const chip = document.createElement("span");
    chip.className = "paper-phase-chip";
    chip.dataset.paperPhasePoint = point.id;
    const indexLabel = document.createElement("span");
    indexLabel.textContent = `${String.fromCharCode(97 + index)})`;
    chip.append(indexLabel);
    if (point.kind === "event") {
      const label = document.createElement("span");
      label.textContent = paperPhaseEventLabel(point.event);
      chip.append(label);
    } else {
      const label = document.createElement("label");
      label.textContent = "φ ";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "0.999";
      input.step = "0.01";
      input.value = point.phase.toFixed(2);
      input.setAttribute("aria-label", `Static phase ${index + 1}`);
      input.addEventListener("change", () => applyPaperPhaseSelection(updateNumericPaperPhase(paperPhaseSelection, point.id, Number(input.value))));
      label.append(input);
      chip.append(label);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.disabled = paperPhaseSelection.points.length <= 1;
    remove.setAttribute("aria-label", `Remove ${point.kind === "event" ? paperPhaseEventLabel(point.event) : `phase ${point.phase.toFixed(2)}`}`);
    remove.addEventListener("click", () => applyPaperPhaseSelection(removePaperPhasePoint(paperPhaseSelection, point.id)));
    chip.append(remove);
    container.append(chip);
  });
}

type PaperPanelId = UserPlotId | "fourier";

interface PaperPanelDefinition {
  id: PaperPanelId;
  title: string;
  canvasId: string;
  draw: () => void;
}

const PAPER_PANEL_DEFINITIONS: PaperPanelDefinition[] = [
  { id: "model", title: "Shell", canvasId: "modelCanvas", draw: drawModelVisualization },
  { id: "heatEngine", title: "Piston", canvasId: "heatEngineCanvas", draw: drawHeatEnginePanel },
  { id: "work", title: "Work", canvasId: "workCanvas", draw: drawWorkPanel },
  { id: "light", title: "Lightcurve", canvasId: "lightCanvas", draw: drawPhasePlots },
  { id: "velocity", title: "RV Curve", canvasId: "velocityCanvas", draw: drawPhasePlots },
  { id: "tpOpacity", title: "T-P Loop", canvasId: "tpOpacityCanvas", draw: drawThermodynamicPanel },
  { id: "periodogram", title: "Periodogram", canvasId: "periodogramCanvas", draw: drawPeriodogramPanel },
  { id: "phaseLag", title: "Phase Lag", canvasId: "phaseLagCanvas", draw: drawPhaseLagPanel },
  { id: "phasePortrait", title: "Thermal-Convection Loop", canvasId: "phasePortraitCanvas", draw: drawPhasePortraitPanel },
  { id: "time", title: "History", canvasId: "timeCanvas", draw: () => drawPaperHistoryCanvas("time") },
  { id: "lum", title: "Luminosity Evolution", canvasId: "lumCanvas", draw: () => drawPaperHistoryCanvas("lum") },
  { id: "stability", title: "Stability Map", canvasId: "stabilityMapCanvas", draw: drawStabilityMap },
  { id: "strip", title: "Instability Strip", canvasId: "cepheidGuideCanvas", draw: drawCepheidGuide },
  { id: "fourier", title: "Fourier Diagnostics", canvasId: "fourierCanvas", draw: drawFourierPanel }
];

const PAPER_SERIES_STYLES: Record<string, { color: string; dash: number[]; marker: string }> = {
  R: { color: "#0072B2", dash: [], marker: "circle" },
  V: { color: "#E69F00", dash: [8, 4], marker: "square" },
  H: { color: "#CC79A7", dash: [2, 3], marker: "diamond" },
  Uc: { color: "#009E73", dash: [10, 3, 2, 3], marker: "triangle" },
  L: { color: "#D55E00", dash: [], marker: "circle" },
  Lr: { color: "#56B4E9", dash: [8, 4], marker: "square" },
  Lc: { color: "#009E73", dash: [2, 3], marker: "triangle" },
  Lb: { color: "#000000", dash: [10, 3, 2, 3], marker: "diamond" },
  power: { color: "#D55E00", dash: [], marker: "circle" }
};

const PAPER_MARKERLESS_PANEL_IDS = new Set<PaperPanelId>(["light", "velocity", "time", "lum"]);
const PAPER_MARKERLESS_CANVAS_IDS = new Set(["lightCanvas", "velocityCanvas", "timeCanvas", "lumCanvas"]);

function paperStyle(series: string, index = 0): { color: string; dash: number[]; marker: string } {
  const known = PAPER_SERIES_STYLES[series];
  if (known) return known;
  const fallback = [PAPER_SERIES_STYLES.R, PAPER_SERIES_STYLES.V, PAPER_SERIES_STYLES.H, PAPER_SERIES_STYLES.Uc];
  return fallback[index % fallback.length];
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDocument(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
}

function paperGridColumns(result: GridModelResult): Record<string, unknown> {
  const ranges = activeGridRanges();
  return {
    model_id: result.id,
    varied_parameters: ranges.map((range) => range.key).join(";"),
    varied_values: ranges.map((range) => `${range.key}=${result.parameters[range.key]}`).join(";")
  };
}

function paperPhaseSeriesRows(quantity: "L" | "V"): Record<string, unknown>[] {
  if (gridState.enabled) {
    return gridState.results.flatMap((result) => result.phaseRows.map((row) => ({
      ...paperGridColumns(result),
      coordinate: row.tau,
      coordinate_unit: "phase",
      [quantity]: row[quantity],
      [`${quantity}_unit`]: "dimensionless"
    })));
  }
  return latestPhaseRows.map((row) => ({
    model_id: "current",
    varied_parameters: "",
    varied_values: "",
    coordinate: row.tau,
    coordinate_unit: latestDisplayWindow.mode === "phase" ? "phase" : "tau",
    [quantity]: row[quantity],
    [`${quantity}_unit`]: "dimensionless"
  }));
}

function paperSnapshotCsv(panel: "model" | "heatEngine"): string {
  const rows = resolvePaperSnapshots(paperPhaseSelection, latestDisplayWindow).map((snapshot, index) => {
    const terms = heatEngineTerms(snapshot.row, latestPhaseParameters);
    const thermo = thermodynamicPoint(snapshot.row, latestPhaseParameters);
    return {
      snapshot_index: index + 1,
      snapshot_label: snapshot.label,
      coordinate_label: snapshot.coordinateLabel,
      coordinate: snapshot.coordinate,
      coordinate_unit: latestDisplayWindow.mode === "phase" ? "phase" : "tau",
      tau: snapshot.row.tau,
      R: snapshot.row.R,
      V: snapshot.row.V,
      H: snapshot.row.H,
      Uc: snapshot.row.Uc,
      Lr: snapshot.row.Lr,
      Lc: snapshot.row.Lc,
      L: snapshot.row.L,
      pressure_force: panel === "heatEngine" ? terms?.pressureForce : "",
      gravity_force: panel === "heatEngine" ? terms?.gravityForce : "",
      damping_acceleration: panel === "heatEngine" ? terms?.dampingAcceleration : "",
      source_luminosity: panel === "heatEngine" ? terms?.source : "",
      log10_T_over_T0: thermo?.logT,
      log10_P_over_P0: thermo?.logP,
      log10_kappa_over_kappa0: thermo?.logOpacity
    };
  });
  return csvDocument([
    "snapshot_index", "snapshot_label", "coordinate_label", "coordinate", "coordinate_unit", "tau",
    "R", "V", "H", "Uc", "Lr", "Lc", "L", "pressure_force", "gravity_force",
    "damping_acceleration", "source_luminosity", "log10_T_over_T0", "log10_P_over_P0", "log10_kappa_over_kappa0"
  ], rows);
}

function paperPanelCsv(id: PaperPanelId): string {
  if (id === "model" || id === "heatEngine") return paperSnapshotCsv(id);
  if (id === "light" || id === "velocity") {
    const quantity = id === "light" ? "L" : "V";
    return csvDocument(
      ["model_id", "varied_parameters", "varied_values", "coordinate", "coordinate_unit", quantity, `${quantity}_unit`],
      paperPhaseSeriesRows(quantity)
    );
  }
  if (id === "work") {
    const { selectedRows } = heatEngineWorkRows(latestPhaseRows);
    return csvDocument(["tau", "R", "R_unit", "pressure_support", "pressure_support_unit", "V", "H"], selectedRows.map((row) => ({
      tau: row.tau, R: row.R, R_unit: "dimensionless", pressure_support: pressureSupport(row, latestPhaseParameters),
      pressure_support_unit: "dimensionless", V: row.V, H: row.H
    })));
  }
  if (id === "tpOpacity") {
    const sourceRows = gridState.enabled
      ? gridState.results.flatMap((result) => thermodynamicPointsForGridResult(result, TP_OPACITY_PATH_MAX_POINTS).map((point) => ({ point, grid: paperGridColumns(result) })))
      : thermodynamicPoints(closedLoopPanelRows(latestPhaseRows), latestPhaseParameters).map((point) => ({ point, grid: { model_id: "current", varied_parameters: "", varied_values: "" } }));
    return csvDocument(["model_id", "varied_parameters", "varied_values", "tau", "log10_T_over_T0", "log10_P_over_P0", "log10_kappa_over_kappa0"], sourceRows.map(({ point, grid }) => ({
      ...grid, tau: point.row.tau, log10_T_over_T0: point.logT, log10_P_over_P0: point.logP, log10_kappa_over_kappa0: point.logOpacity
    })));
  }
  if (id === "periodogram") {
    const result = computePeriodogram(latestPeriodogramRows, { quantity: "L", periodHint: latestPeriodogramPeriod });
    return csvDocument(["frequency", "frequency_unit", "period", "period_unit", "power", "power_unit"], (result?.points || []).map((point) => ({
      frequency: point.frequency, frequency_unit: "tau^-1", period: point.period, period_unit: "tau",
      power: point.power, power_unit: "(delta_L/L0)^2"
    })));
  }
  if (id === "phaseLag") {
    const loopRange = currentLoopRange();
    const rows = loopRange ? visiblePhaseLagPairs().flatMap((pair) => phaseLagSeriesPoints(gridPathResults(), pair, loopRange.key).map((point) => ({
      pair: phaseLagPairLabel(pair), grid_parameter: loopRange.key, slider_value: point.x,
      parameter_value: point.result.parameters[loopRange.key], phase_lag: point.lag, phase_lag_unit: "cycle"
    }))) : [];
    return csvDocument(["pair", "grid_parameter", "slider_value", "parameter_value", "phase_lag", "phase_lag_unit"], rows);
  }
  if (id === "phasePortrait") {
    return csvDocument(["tau", "R", "H", "Uc", "unit"], closedLoopPanelRows(latestPhaseRows).map((row) => ({ tau: row.tau, R: row.R, H: row.H, Uc: row.Uc, unit: "dimensionless" })));
  }
  if (id === "time") {
    return csvDocument(["tau", "tau_unit", "R", "V", "H", "Uc"], latestRows.map((row) => ({ tau: row.tau, tau_unit: "dynamical time", R: row.R, V: row.V, H: row.H, Uc: row.Uc })));
  }
  if (id === "lum") {
    return csvDocument(["tau", "tau_unit", "L", "Lr", "Lc", "L_source"], latestRows.map((row) => ({ tau: row.tau, tau_unit: "dynamical time", L: row.L, Lr: row.Lr, Lc: row.Lc, L_source: baseLuminosity(row, state) })));
  }
  if (id === "stability") {
    const kinds = stabilityKindsForMap(stabilityDisplayParameters());
    return csvDocument(["log10_zeta_c", "log10_zeta", "stability_kind"], kinds.map((kind, index) => ({
      log10_zeta_c: RESPONSE_LOG_MIN + ((index % STABILITY_MAP_RESOLUTION) + 0.5) * (RESPONSE_LOG_MAX - RESPONSE_LOG_MIN) / STABILITY_MAP_RESOLUTION,
      log10_zeta: RESPONSE_LOG_MIN + (Math.floor(index / STABILITY_MAP_RESOLUTION) + 0.5) * (RESPONSE_LOG_MAX - RESPONSE_LOG_MIN) / STABILITY_MAP_RESOLUTION,
      stability_kind: kind
    })));
  }
  if (id === "strip") {
    const strip = instabilityKindsForStrip(stabilityDisplayParameters());
    return csvDocument(["log10_zeta_c_over_zeta", "gamma_c", "stability_kind"], strip.kinds.map((kind, index) => ({
      log10_zeta_c_over_zeta: STRIP_LOG_RATIO_MIN + ((index % INSTABILITY_STRIP_X_RESOLUTION) + 0.5) * (STRIP_LOG_RATIO_MAX - STRIP_LOG_RATIO_MIN) / INSTABILITY_STRIP_X_RESOLUTION,
      gamma_c: (Math.floor(index / INSTABILITY_STRIP_X_RESOLUTION) + 0.5) / INSTABILITY_STRIP_Y_RESOLUTION,
      stability_kind: kind
    })));
  }
  const rows = gridState.results.filter((result) => result.fourier).flatMap((result) => [
    { ...paperGridColumns(result), period: result.period, diagnostic: "r21", value: result.fourier!.r21, unit: "dimensionless" },
    { ...paperGridColumns(result), period: result.period, diagnostic: "r31", value: result.fourier!.r31, unit: "dimensionless" },
    { ...paperGridColumns(result), period: result.period, diagnostic: "phi21", value: result.fourier!.phi21, unit: "radian" },
    { ...paperGridColumns(result), period: result.period, diagnostic: "phi31", value: result.fourier!.phi31, unit: "radian" }
  ]);
  return csvDocument(["model_id", "varied_parameters", "varied_values", "period", "diagnostic", "value", "unit"], rows);
}

function drawPaperHistoryCanvas(id: "time" | "lum"): void {
  const timeXlim = integrationTimeRange(latestRows);
  if (id === "time") {
    const showUc = convectiveVelocityHistoryAvailable(latestRows);
    const keys: PlotSeriesKey[] = showUc ? ["R", "V", "H", "Uc"] : ["R", "V", "H"];
    const rows = rowsForInteractivePlot("time", latestRows, keys);
    const series: Series[] = [
      { label: "R", color: COLORS.R, rows: visibleRows("time", "R", rows), x: (row) => row.tau, y: (row) => row.R },
      { label: "V", color: COLORS.V, rows: visibleRows("time", "V", rows), x: (row) => row.tau, y: (row) => row.V },
      { label: "H", color: COLORS.H, rows: visibleRows("time", "H", rows), x: (row) => row.tau, y: (row) => row.H }
    ];
    if (showUc) series.push({ label: "Uc", color: COLORS.Uc, rows: visibleRows("time", "Uc", rows), x: (row) => row.tau, y: (row) => row.Uc });
    drawSeries("timeCanvas", series, {
      xlabel: "time τ", ylabel: "state", xlabelColor: COLORS.tau, fallbackXlim: timeXlim,
      view: plotViews.time, interactivePlotId: "time", denseEnvelope: true, message: "all series hidden"
    });
    return;
  }
  const showSplit = convectiveLuminosityAvailable();
  const keys: PlotSeriesKey[] = showSplit ? ["L", "Lr", "Lc", "Lb"] : ["L", "Lb"];
  const rows = rowsForInteractivePlot("lum", latestRows, keys);
  const series: Series[] = [
    { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", rows), x: (row) => row.tau, y: (row) => row.L },
    { label: "Lb", color: sourceLuminosityColor(), rows: visibleRows("lum", "Lb", rows), x: (row) => row.tau, y: (row) => baseLuminosity(row, state), dash: [7, 5] }
  ];
  if (showSplit) series.push(
    { label: "Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", rows), x: (row) => row.tau, y: (row) => row.Lr },
    { label: "Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", rows), x: (row) => row.tau, y: (row) => row.Lc }
  );
  drawSeries("lumCanvas", series, {
    xlabel: "time τ", ylabel: "luminosity", xlabelColor: COLORS.tau, fallbackXlim: timeXlim,
    view: plotViews.lum, interactivePlotId: "lum", denseEnvelope: true, message: "all luminosity variables hidden"
  });
}

function paperPanelElement(definition: PaperPanelDefinition): HTMLElement | null {
  if (definition.id === "fourier") return document.getElementById("fourierGridPanel");
  return document.querySelector<HTMLElement>(`[data-plot-panel="${definition.id}"]`);
}

function paperPanelAvailable(id: PaperPanelId): boolean {
  if (id === "model" || id === "heatEngine") return resolvePaperSnapshots(paperPhaseSelection, latestDisplayWindow).length > 0;
  if (id === "work") return heatEngineWorkRows(latestPhaseRows).selectedRows.length > 2;
  if (id === "light" || id === "velocity" || id === "phasePortrait") return latestPhaseRows.length > 1;
  if (id === "time" || id === "lum") return latestRows.length > 1;
  if (id === "tpOpacity") return gridState.enabled ? gridState.results.length > 0 : latestPhaseRows.length > 1;
  if (id === "periodogram") return Boolean(computePeriodogram(latestPeriodogramRows, { quantity: "L", periodHint: latestPeriodogramPeriod }));
  if (id === "phaseLag") return gridState.enabled && Boolean(currentLoopRange()) && gridPathResults().length > 0;
  if (id === "fourier") return gridState.enabled && gridState.results.some((result) => Boolean(result.fourier));
  return true;
}

function numericDatasetRange(value: string | undefined): number[] | null {
  if (!value) return null;
  const values = value.split(",").map(Number);
  return values.length === 2 && values.every(Number.isFinite) ? values : null;
}

function paperPanelSeries(id: PaperPanelId): string[] {
  if (id === "time") return convectiveVelocityHistoryAvailable(latestRows) ? ["R", "V", "H", "Uc"] : ["R", "V", "H"];
  if (id === "lum") return convectiveLuminosityAvailable() ? ["L", "Lr", "Lc", "Lb"] : ["L", "Lb"];
  if (id === "light") return ["L"];
  if (id === "velocity") return ["V"];
  if (id === "phasePortrait") return ["H", "Uc"];
  if (id === "periodogram") return ["power"];
  if (id === "phaseLag") return visiblePhaseLagPairs().map(phaseLagPairLabel);
  return [id];
}

function paperPanelMetadata(definition: PaperPanelDefinition): PaperPanelRenderer["metadata"] {
  const canvas = document.getElementById(definition.canvasId) as HTMLCanvasElement | null;
  const series = paperPanelSeries(definition.id);
  return {
    axisLimits: {
      x: numericDatasetRange(canvas?.dataset.xlim),
      y: numericDatasetRange(canvas?.dataset.ylim)
    },
    units: {
      coordinate: latestDisplayWindow.mode === "phase" ? "phase" : "tau",
      state: "dimensionless",
      periodogramFrequency: "tau^-1",
      periodogramPower: "(delta_L/L0)^2"
    },
    seriesStyling: series.map((name, index) => {
      const style = paperStyle(name, index);
      return { series: name, ...style, marker: PAPER_MARKERLESS_PANEL_IDS.has(definition.id) ? "none" : style.marker };
    }),
    downsampling: definition.id === "model" || definition.id === "heatEngine" ? "selected static states" : "screen and vector artwork may use envelope/path downsampling; CSV retains archived source values"
  };
}

function paperRenderDimensions(definition: PaperPanelDefinition, size: PaperFigureSize): { cssWidth: number; cssHeight: number; widthInches: number; heightInches: number } {
  const widthInches = size === "single" ? 3.4 : 7.1;
  const cssWidth = size === "single" ? 520 : 920;
  const snapshotCount = Math.max(1, paperPhaseSelection.points.length);
  let cssHeight: number;
  if (definition.id === "model") cssHeight = paperSnapshotCanvasHeight(cssWidth, snapshotCount, 232);
  else if (definition.id === "heatEngine") cssHeight = paperSnapshotCanvasHeight(cssWidth, snapshotCount, 244);
  else if (definition.id === "fourier") {
    const columns = cssWidth >= 780 ? 2 : 1;
    cssHeight = Math.max(280, Math.ceil(4 / columns) * 238);
  } else {
    const canvas = document.getElementById(definition.canvasId) as HTMLCanvasElement | null;
    const rect = canvas?.getBoundingClientRect();
    const aspect = rect && rect.width > 0 && rect.height > 0 ? rect.height / rect.width : 0.58;
    cssHeight = Math.max(260, Math.round(cssWidth * clamp(aspect, 0.38, 1.1)));
  }
  return { cssWidth, cssHeight, widthInches, heightInches: widthInches * cssHeight / cssWidth };
}

async function renderPaperPanel(definition: PaperPanelDefinition, size: PaperFigureSize): Promise<PaperRenderResult> {
  const canvas = document.getElementById(definition.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`${definition.title}: canvas unavailable`);
  const dimensions = paperRenderDimensions(definition, size);
  const dpr = window.devicePixelRatio || 1;
  const vectorContext = new SvgCanvasContext({
    width: Math.floor(dimensions.cssWidth * dpr),
    height: Math.floor(dimensions.cssHeight * dpr),
    document
  });
  const getContextDescriptor = Object.getOwnPropertyDescriptor(canvas, "getContext");
  const rectDescriptor = Object.getOwnPropertyDescriptor(canvas, "getBoundingClientRect");
  const priorWidth = canvas.width;
  const priorHeight = canvas.height;
  const priorStyle = canvas.style.cssText;
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: (kind: string) => kind === "2d" ? vectorContext as unknown as CanvasRenderingContext2D : null
  });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, dimensions.cssWidth, dimensions.cssHeight)
  });
  try {
    definition.draw();
    return {
      svg: vectorContext.getSerializedSvg(true),
      widthInches: dimensions.widthInches,
      heightInches: dimensions.heightInches
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${definition.title}: ${message}`);
  } finally {
    if (getContextDescriptor) Object.defineProperty(canvas, "getContext", getContextDescriptor);
    else delete (canvas as unknown as { getContext?: unknown }).getContext;
    if (rectDescriptor) Object.defineProperty(canvas, "getBoundingClientRect", rectDescriptor);
    else delete (canvas as unknown as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    canvas.width = priorWidth;
    canvas.height = priorHeight;
    canvas.style.cssText = priorStyle;
  }
}

function paperExportState(): Omit<PaperExportManifestV1, "panels"> {
  const activeRanges = activeGridRanges();
  return {
    schemaVersion: 1,
    application: {
      name: "OZwizard",
      version: __OZWIZARD_VERSION__,
      sourceCommit: __OZWIZARD_COMMIT__,
      sourceUrl: window.location.href.split("#")[0]
    },
    createdAt: new Date().toISOString(),
    theme: "paper",
    model: {
      parameters: { ...state },
      displayParameters: { ...latestPhaseParameters },
      preset: activePreset,
      solver: state.solver,
      status: latestResult.status,
      message: latestResult.message,
      statistics: { ...latestResult.stats },
      rowCount: latestRows.length
    },
    display: {
      mode: latestDisplayWindow.mode,
      reason: latestDisplayWindow.reason,
      xlim: latestDisplayWindow.xlim,
      period: latestDisplayWindow.period,
      message: latestDisplayWindow.message,
      rowCount: latestDisplayWindow.rows.length
    },
    paper: {
      phaseSelection: paperPhaseSelection,
      resolvedSnapshots: resolvePaperSnapshots(paperPhaseSelection, latestDisplayWindow).map((snapshot) => ({
        label: snapshot.label,
        coordinateLabel: snapshot.coordinateLabel,
        coordinate: snapshot.coordinate,
        tau: snapshot.row.tau
      })),
      widthsInches: { single: 3.4, double: 7.1 },
      pngDpi: 600,
      palette: "paper-colorblind",
      animationMarkers: false
    },
    grid: {
      enabled: gridState.enabled,
      centerSelection: currentGridResult()?.id ?? null,
      selectedLoopKey: gridState.selectedLoopKey,
      ranges: activeRanges.map((range) => ({ ...range })),
      resultCount: gridState.results.length,
      modelIds: gridState.results.map((result) => result.id)
    },
    omittedPanels: []
  };
}

async function exportPaperBundle(): Promise<void> {
  const button = document.getElementById("paperExportBundle") as HTMLButtonElement | null;
  const status = document.getElementById("paperExportStatus");
  if (!paperModeActive()) return;
  if (button?.disabled) return;
  if (button) button.disabled = true;
  if (status) {
    status.textContent = "Preparing visible panels…";
    status.dataset.state = "running";
  }
  const manifest = paperExportState();
  const renderers: PaperPanelRenderer[] = [];
  PAPER_PANEL_DEFINITIONS.forEach((definition) => {
    const panel = paperPanelElement(definition);
    if (!panel || panel.hidden) return;
    if (!paperPanelAvailable(definition.id)) {
      manifest.omittedPanels.push({ id: definition.id, reason: "scientific data unavailable for the current solution" });
      return;
    }
    renderers.push({
      id: definition.id,
      title: definition.title,
      csv: paperPanelCsv(definition.id),
      metadata: paperPanelMetadata(definition),
      render: (size) => renderPaperPanel(definition, size)
    });
  });
  try {
    if (!renderers.length) throw new Error("No visible scientific panels are available");
    const bundle = await createPaperBundle({
      manifest: { ...manifest, panels: [] },
      panels: renderers,
      onProgress: (message) => { if (status) status.textContent = message; }
    });
    downloadPaperBundle(bundle.blob, bundle.filename);
    if (status) {
      status.textContent = `Downloaded ${renderers.length} panel${renderers.length === 1 ? "" : "s"}`;
      status.dataset.state = "complete";
    }
  } catch (error) {
    if (status) {
      status.textContent = error instanceof Error ? error.message : "Paper bundle export failed";
      status.dataset.state = "error";
    }
  } finally {
    if (button) button.disabled = false;
    drawAll();
  }
}

function setupPhaseAnnotationControls(): void {
  const toggle = document.getElementById("phaseAnnotationsToggle");
  if (!(toggle instanceof HTMLInputElement)) return;
  toggle.checked = phaseAnnotationsVisible;
  toggle.addEventListener("change", () => {
    phaseAnnotationsVisible = toggle.checked;
    updatePhaseAnnotationControls();
    drawPhasePlots();
  });
  updatePhaseAnnotationControls();
}

function updatePhaseAnnotationControls(): void {
  const toggle = document.getElementById("phaseAnnotationsToggle");
  const label = document.getElementById("phaseAnnotationToggleLabel");
  const legend = document.getElementById("phaseAnnotationLegendItems");
  if (toggle instanceof HTMLInputElement) toggle.checked = phaseAnnotationsVisible;
  if (label instanceof HTMLElement) {
    label.classList.toggle("is-hidden", !phaseAnnotationsVisible);
    label.setAttribute("aria-pressed", String(phaseAnnotationsVisible));
  }
  if (legend instanceof HTMLElement) {
    legend.hidden = !phaseAnnotationsVisible;
    legend.style.display = phaseAnnotationsVisible ? "" : "none";
  }
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

function setupGridSliderDeferral(): void {
  window.addEventListener("pointerup", finishGridSliderPointer, true);
  window.addEventListener("pointercancel", finishGridSliderPointer, true);
  window.addEventListener("blur", finishAllGridSliderPointers);
}

function attachGridSliderDeferral(input: HTMLInputElement): void {
  input.addEventListener("pointerdown", beginGridSliderPointer);
  input.addEventListener("change", flushDeferredGridCompute);
  input.addEventListener("blur", flushDeferredGridCompute);
}

function beginGridSliderPointer(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  activeGridSliderPointers.add(event.pointerId);
  if (!gridState.enabled) return;
  window.clearTimeout(gridState.debounceTimer);
  if (gridState.status === "running" || gridState.status === "coarsening" || gridState.status === "queued") {
    cancelGridCompute();
    pendingGridComputeAfterSliderRelease = true;
    gridState.status = "queued";
    gridState.statusText = "Grid queued until slider release";
    updateGridStatusUi();
  }
}

function finishGridSliderPointer(event: PointerEvent): void {
  if (!activeGridSliderPointers.delete(event.pointerId)) return;
  flushDeferredGridCompute();
}

function finishAllGridSliderPointers(): void {
  if (!activeGridSliderPointers.size) return;
  activeGridSliderPointers.clear();
  flushDeferredGridCompute();
}

function flushDeferredGridCompute(): void {
  if (activeGridSliderPointers.size || !pendingGridComputeAfterSliderRelease) return;
  pendingGridComputeAfterSliderRelease = false;
  scheduleGridCompute();
}

function ensureGridBudgetControls(): void {
  const container = el<HTMLDivElement>("integrationControls");
  if (document.getElementById("gridBudgetControl")) {
    updateGridBudgetControls();
    return;
  }
  const control = document.createElement("div");
  control.className = "grid-budget-controls";
  control.id = "gridBudgetControl";
  control.hidden = true;
  control.innerHTML = `
    <div id="gridTimeoutControl" class="slider-control grid-budget-slider" data-grid-budget-kind="timeout" style="--accent:${THEME.neutralSymbol}">
      <div class="slider-label" title="grid timeout">
        <span class="slider-name">grid timeout</span>
        <span class="slider-reading"><span class="slider-symbol">s</span><span class="slider-equals">=</span><span class="slider-value" data-grid-budget-value="timeout"></span></span>
      </div>
      <div class="slider-track">
        <input id="gridTimeoutSeconds" class="single-slider" type="range" min="${GRID_TIMEOUT_MIN_SECONDS}" max="${GRID_TIMEOUT_MAX_SECONDS}" step="${GRID_TIMEOUT_STEP_SECONDS}" value="${formatGridTimeoutSeconds(gridTimeoutSeconds)}" aria-label="grid timeout">
      </div>
      <label class="grid-budget-mode" title="Use grid timeout budget" aria-label="Use grid timeout budget">
        <input id="gridBudgetTimeoutMode" type="radio" name="gridBudgetMode" value="timeout">
      </label>
    </div>
    <div id="gridModelBudgetControl" class="slider-control grid-budget-slider" data-grid-budget-kind="models" style="--accent:${THEME.neutralSymbol}">
      <div class="slider-label" title="num grid models">
        <span class="slider-name">num grid models</span>
        <span class="slider-reading"><span class="slider-symbol">N</span><span class="slider-equals">=</span><span class="slider-value" data-grid-budget-value="models"></span></span>
      </div>
      <div class="slider-track">
        <input id="gridModelBudget" class="single-slider" type="range" min="${GRID_MODEL_BUDGET_MIN}" max="${GRID_MODEL_BUDGET_MAX}" step="1" value="${String(gridModelBudget)}" aria-label="num grid models">
      </div>
      <label class="grid-budget-mode" title="Use num grid models budget" aria-label="Use num grid models budget">
        <input id="gridBudgetModelsMode" type="radio" name="gridBudgetMode" value="models">
      </label>
    </div>
  `;
  container.appendChild(control);

  const timeoutMode = el<HTMLInputElement>("gridBudgetTimeoutMode");
  const modelsMode = el<HTMLInputElement>("gridBudgetModelsMode");
  const timeoutInput = el<HTMLInputElement>("gridTimeoutSeconds");
  const modelInput = el<HTMLInputElement>("gridModelBudget");
  attachGridSliderDeferral(timeoutInput);
  attachGridSliderDeferral(modelInput);
  timeoutMode.addEventListener("change", () => {
    if (!timeoutMode.checked) return;
    gridBudgetMode = "timeout";
    updateGridBudgetControls();
    scheduleGridCompute();
  });
  modelsMode.addEventListener("change", () => {
    if (!modelsMode.checked) return;
    gridBudgetMode = "models";
    updateGridBudgetControls();
    scheduleGridCompute();
  });
  timeoutInput.addEventListener("input", () => {
    const value = Number(timeoutInput.value);
    if (!Number.isFinite(value)) return;
    gridTimeoutSeconds = clampGridTimeoutSeconds(value);
    gridBudgetMode = "timeout";
    updateGridBudgetControls();
    scheduleGridCompute();
  });
  modelInput.addEventListener("input", () => {
    const value = Number(modelInput.value);
    if (!Number.isFinite(value)) return;
    gridModelBudget = clampGridModelBudget(value);
    gridBudgetMode = "models";
    updateGridBudgetControls();
    scheduleGridCompute();
  });
  updateGridBudgetControls();
}

function updateGridBudgetControls(): void {
  const control = document.getElementById("gridBudgetControl");
  if (!(control instanceof HTMLElement)) return;
  control.hidden = !gridState.enabled;
  control.dataset.gridBudgetMode = gridBudgetMode;
  const timeoutMode = document.getElementById("gridBudgetTimeoutMode");
  const modelsMode = document.getElementById("gridBudgetModelsMode");
  const timeoutInput = document.getElementById("gridTimeoutSeconds");
  const modelInput = document.getElementById("gridModelBudget");
  const timeoutValue = document.querySelector<HTMLElement>("[data-grid-budget-value='timeout']");
  const modelValue = document.querySelector<HTMLElement>("[data-grid-budget-value='models']");
  const timeoutControl = document.getElementById("gridTimeoutControl");
  const modelControl = document.getElementById("gridModelBudgetControl");
  if (timeoutMode instanceof HTMLInputElement) timeoutMode.checked = gridBudgetMode === "timeout";
  if (modelsMode instanceof HTMLInputElement) modelsMode.checked = gridBudgetMode === "models";
  if (timeoutInput instanceof HTMLInputElement) timeoutInput.value = formatGridTimeoutSeconds(gridTimeoutSeconds);
  if (modelInput instanceof HTMLInputElement) modelInput.value = String(gridModelBudget);
  if (timeoutValue) timeoutValue.textContent = formatGridTimeoutSeconds(gridTimeoutSeconds);
  if (modelValue) modelValue.textContent = String(gridModelBudget);
  if (timeoutControl instanceof HTMLElement) timeoutControl.classList.toggle("is-grid-budget-active", gridBudgetMode === "timeout");
  if (modelControl instanceof HTMLElement) modelControl.classList.toggle("is-grid-budget-active", gridBudgetMode === "models");
}

function gridBudgetRequest(): GridBudget {
  if (gridBudgetMode === "models") return { mode: "models", maxModels: gridModelBudget };
  const modelMsEstimate = currentGridModelMsEstimate();
  return modelMsEstimate === undefined
    ? { mode: "timeout", timeoutMs: gridTimeoutSeconds * 1000 }
    : { mode: "timeout", timeoutMs: gridTimeoutSeconds * 1000, modelMsEstimate };
}

function recordGridModelTiming(elapsedMs: number, attempted = 1): void {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(attempted) || attempted <= 0 || elapsedMs <= 0) return;
  const sample = clamp(
    (elapsedMs / attempted) * GRID_MODEL_TIMING_SAFETY_FACTOR,
    GRID_MODEL_TIMING_MIN_MS,
    GRID_MODEL_TIMING_MAX_MS
  );
  gridModelMsEstimate = gridModelMsEstimate === null
    ? sample
    : gridModelMsEstimate * (1 - GRID_MODEL_TIMING_BLEND) + sample * GRID_MODEL_TIMING_BLEND;
}

function currentGridModelMsEstimate(): number | undefined {
  return gridModelMsEstimate !== null && Number.isFinite(gridModelMsEstimate) && gridModelMsEstimate > 0
    ? gridModelMsEstimate
    : undefined;
}

function clampGridTimeoutSeconds(value: number): number {
  const clamped = clamp(value, GRID_TIMEOUT_MIN_SECONDS, GRID_TIMEOUT_MAX_SECONDS);
  return Number((Math.round(clamped / GRID_TIMEOUT_STEP_SECONDS) * GRID_TIMEOUT_STEP_SECONDS).toFixed(2));
}

function clampGridModelBudget(value: number): number {
  return Math.round(clamp(value, GRID_MODEL_BUDGET_MIN, GRID_MODEL_BUDGET_MAX));
}

function formatGridTimeoutSeconds(value: number): string {
  return String(Number(value.toFixed(2)));
}

function isUserPlotId(value: string | undefined): value is UserPlotId {
  return Boolean(value && value in PLOT_PANEL_LABELS);
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
    const gridOnlyUnavailable = !gridState.enabled && plotId === "phaseLag";
    const forcedHidden = gridState.enabled && (plotId === "model" || plotId === "heatEngine" || plotId === "work" || plotId === "time" || plotId === "lum");
    const visible = forcedHidden ? false : plotPanelVisibility[plotId];
    const panel = document.querySelector<HTMLElement>(`[data-plot-panel="${plotId}"]`);
    const control = document.querySelector<HTMLElement>(`[data-plot-control="${plotId}"]`);
    const home = document.querySelector<HTMLElement>(`[data-plot-control-home="${plotId}"]`);
    const input = control?.querySelector<HTMLInputElement>("[data-plot-toggle]");
    if (!panel || !control || !home || !input) return;

    if (gridOnlyUnavailable) {
      if (control.parentElement !== home) home.prepend(control);
      input.checked = false;
      input.disabled = true;
      input.setAttribute("aria-label", `Show ${PLOT_PANEL_LABELS[plotId]} plot`);
      panel.hidden = true;
      return;
    }

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
  updateGridBudgetControls();
  updateGridRangeUi();
  updateGridStatusUi();
}

function setGridModeEnabled(enabled: boolean, options: { defaultGammaRange?: boolean } = {}): void {
  if (gridState.enabled === enabled) return;
  gridState.enabled = enabled;
  activePhaseHoverCanvasId = null;
  activePhaseScrub = null;
  const toggle = document.getElementById("gridModeToggle");
  if (toggle instanceof HTMLInputElement) toggle.checked = enabled;

  if (enabled) {
    gridState.restorePlotVisibility = {
      model: plotPanelVisibility.model,
      heatEngine: plotPanelVisibility.heatEngine,
      work: plotPanelVisibility.work,
      time: plotPanelVisibility.time,
      lum: plotPanelVisibility.lum
    };
    plotPanelVisibility.model = false;
    plotPanelVisibility.heatEngine = false;
    plotPanelVisibility.work = false;
    plotPanelVisibility.time = false;
    plotPanelVisibility.lum = false;
    modelAnimationStartTime = null;
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
      plotPanelVisibility.heatEngine = gridState.restorePlotVisibility.heatEngine;
      plotPanelVisibility.work = gridState.restorePlotVisibility.work;
      plotPanelVisibility.time = gridState.restorePlotVisibility.time;
      plotPanelVisibility.lum = gridState.restorePlotVisibility.lum;
    }
    gridState.restorePlotVisibility = null;
    modelAnimationStartTime = null;
  }

  updatePlotPanelVisibility();
  updateGridRangeUi();
  updateGridBudgetControls();
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

function setOnlyGridRange(key: ControlParameterKey): void {
  gridState.ranges.forEach((range, rangeKey) => gridState.savedRanges.set(rangeKey, range));
  gridState.ranges.clear();
  enableGridRange(key);
  gridState.selectedLoopKey = key;
}

function toggleGridRange(key: ControlParameterKey): void {
  if (gridState.ranges.has(key)) {
    const current = gridState.ranges.get(key);
    if (current) gridState.savedRanges.set(key, current);
    gridState.ranges.delete(key);
    if (disableGridModeIfNoActiveRanges()) return;
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

function toggleGridRangeFromSliderGesture(key: ControlParameterKey): void {
  if (!gridState.enabled) {
    setOnlyGridRange(key);
    setGridModeEnabled(true);
    return;
  }
  toggleGridRange(key);
}

function sliderGestureTarget(event: PointerEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-reset-key]")) return false;
  return Boolean(target.closest(".slider-track") || target.closest("input[type='range']"));
}

function beginSliderTap(event: PointerEvent, key: ControlParameterKey): void {
  if (event.pointerType !== "touch" || !sliderGestureTarget(event)) return;
  activeSliderTapStart = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

function finishSliderTap(event: PointerEvent, key: ControlParameterKey): void {
  if (event.pointerType !== "touch" || !activeSliderTapStart || activeSliderTapStart.key !== key || activeSliderTapStart.pointerId !== event.pointerId) return;
  const start = activeSliderTapStart;
  activeSliderTapStart = null;
  const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (travel > SLIDER_RANGE_DOUBLE_TAP_DISTANCE) {
    lastSliderTap = null;
    return;
  }
  const now = window.performance.now();
  const previous = lastSliderTap;
  const doubleTap = Boolean(
    previous
    && previous.key === key
    && now - previous.time <= SLIDER_RANGE_DOUBLE_TAP_MS
    && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= SLIDER_RANGE_DOUBLE_TAP_DISTANCE
  );
  lastSliderTap = { key, time: now, x: event.clientX, y: event.clientY };
  if (!doubleTap) return;
  event.preventDefault();
  lastSliderTap = null;
  toggleGridRangeFromSliderGesture(key);
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

function disableGridModeIfNoActiveRanges(): boolean {
  if (!gridState.enabled || activeGridRangeKeys().length) return false;
  setGridModeEnabled(false);
  return true;
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
  const active = !paperModeActive()
    && gridState.enabled
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
  if (activeGridSliderPointers.size) {
    pendingGridComputeAfterSliderRelease = true;
    window.clearTimeout(gridState.debounceTimer);
    gridState.status = "queued";
    gridState.statusText = "Grid queued until slider release";
    updateGridStatusUi();
    return;
  }
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
    budget: gridBudgetRequest(),
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
  budget: GridBudget;
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
    recordGridModelTiming(message.elapsedMs, message.completed);
    gridState.status = "running";
    gridState.statusText = `Grid running: ${message.completed}/${message.total} models`;
    updateGridStatusUi();
    return;
  }
  if (message.type === "grid-canceled-for-coarsening") {
    recordGridModelTiming(message.elapsedMs, message.completed);
    gridState.status = "coarsening";
    gridState.statusText = `Grid coarsening: stride ${message.stride}`;
    updateGridStatusUi();
    return;
  }
  if (message.type === "grid-canceled") {
    return;
  }
  gridState.lastComplete = message;
  recordGridModelTiming(message.elapsedMs, message.attempted);
  gridState.results = message.results;
  gridState.pathResults = message.pathResults;
  gridState.status = "complete";
  const coarsenedSuffix = message.coarsened ? `, stride ${message.stride}` : "";
  const excludedSuffix = message.excludedNonPhase ? `, ${message.excludedNonPhase} non-periodic excluded` : "";
  gridState.statusText = `Grid complete: ${message.validPhase}/${message.total} phase models${coarsenedSuffix}${excludedSuffix}`;
  gridState.animationIndex = 0;
  gridState.animationDirection = 1;
  updateGridLoopControls();
  updateGridStatusUi();
  updateFourierPanelVisibility();
  if (paperModeActive()) selectPaperGridCenter();
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
  if (paperModeActive() || !gridState.enabled || path.length <= 1) return;
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
    drawGridAnimationFrame();
  }, GRID_LOOP_BASE_INTERVAL_MS / gridLoopSpeed);
}

function stopGridAnimation(): void {
  if (gridState.animationTimer) {
    window.clearInterval(gridState.animationTimer);
    gridState.animationTimer = 0;
  }
}

function gridPathResultsCacheKey(): string {
  const loopKey = gridState.selectedLoopKey ?? "none";
  const ranges = activeGridRanges()
    .map((range) => `${range.key}:${range.lowerSliderValue}:${range.upperSliderValue}:${range.centerSliderValue}`)
    .join(",");
  const pathEdgeIds = gridState.pathResults.length
    ? `${gridState.pathResults.length}:${gridState.pathResults[0]?.id ?? ""}:${gridState.pathResults.at(-1)?.id ?? ""}`
    : "no-path";
  return `${gridState.requestId}|${loopKey}|${gridState.results.length}|${pathEdgeIds}|${ranges}`;
}

function gridPathResults(): GridModelResult[] {
  const key = gridPathResultsCacheKey();
  if (gridPathCache?.key === key) return gridPathCache.results;
  const loopKey = gridState.selectedLoopKey;
  if (!loopKey) {
    gridPathCache = { key, results: [] };
    return gridPathCache.results;
  }
  if (gridState.pathResults.length) {
    const results = [...gridState.pathResults]
      .filter((result) => result.sliderValues[loopKey] !== undefined)
      .sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
    gridPathCache = { key, results };
    return results;
  }
  if (!gridState.results.length) {
    gridPathCache = { key, results: [] };
    return gridPathCache.results;
  }
  const ranges = activeGridRanges();
  const centerByKey = new Map<ControlParameterKey, number>();
  ranges.forEach((range) => {
    if (range.key !== loopKey) centerByKey.set(range.key, centerSliderSample(range));
  });
  const results = gridState.results
    .filter((result) => {
      for (const [key, center] of centerByKey) {
        const value = result.sliderValues[key];
        if (value === undefined || Math.abs(value - center) > sliderMeta(key).step / 2 + 1e-9) return false;
      }
      return result.sliderValues[loopKey] !== undefined;
    })
    .sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
  gridPathCache = { key, results };
  return results;
}

function currentGridResult(): GridModelResult | null {
  if (!paperModeActive() && gridState.heldResult) return gridState.heldResult;
  const path = gridPathResults();
  if (!path.length) return null;
  const index = Math.min(path.length - 1, Math.max(0, gridState.animationIndex));
  return path[index] || null;
}

function selectPaperGridCenter(): void {
  if (!gridState.enabled) return;
  const path = gridPathResults();
  const range = currentLoopRange();
  if (!path.length || !range) return;
  gridState.heldResult = null;
  gridState.hoverResult = null;
  gridState.animationDirection = 1;
  gridState.animationIndex = centerGridPathIndex(
    path.map((result) => result.sliderValues[range.key] ?? range.centerSliderValue),
    range.centerSliderValue
  );
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
    m: "χ₀",
    gamma1: "Γ₁",
    n: "n",
    s: "s",
    sourceExp: "U",
    cq: "Cq",
    r0: "R₀",
    v0: "V₀",
    h0: "H₀",
    uc0: "Uc₀",
    tEnd: "τmax",
    step: "Δτ₀",
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
  const sliderValue = sliderValueFromNumericValue(range.key, value);
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
    canvas.addEventListener("pointerleave", () => {
      canvas.classList.remove("phase-scrub-hover");
      clearPhaseHover(canvasId);
    });
  });
}

function setupReferencePlotInteractions(): void {
  (["stabilityMapCanvas", "cepheidGuideCanvas"] as const).forEach((canvasId) => {
    const canvas = el<HTMLCanvasElement>(canvasId);
    canvas.classList.add("reference-control-canvas");
    canvas.addEventListener("pointerdown", (event) => beginReferencePlotInteraction(event, canvasId));
    canvas.addEventListener("pointermove", (event) => updateReferencePlotInteraction(event, canvasId));
    canvas.addEventListener("pointerup", (event) => finishReferencePlotInteraction(event, canvasId));
    canvas.addEventListener("pointercancel", (event) => finishReferencePlotInteraction(event, canvasId));
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  });
}

function phaseFromCanvasPoint(canvasId: string, point: { x: number; y: number }, allowOutsideY = false): number | null {
  const render = plotRenderStates.get(canvasId);
  if (!render || !latestPhaseRows.length || gridState.enabled || latestDisplayWindow.mode !== "phase") return null;
  if (point.x < render.plot.left || point.x > render.plot.left + render.plot.width) return null;
  if (!allowOutsideY && (point.y < render.plot.top || point.y > render.plot.top + render.plot.height)) return null;
  const clamped = clampPointToPlot(point, render.plot);
  return clamp(xFromPixel(render, clamped.x), 0, 2);
}

function scrubPhaseToPointer(canvas: HTMLCanvasElement, canvasId: string, event: PointerEvent): void {
  const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event), true);
  if (phase === null) return;
  currentAnimationPhase = phase;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function canvasSupportsPhaseHover(canvasId: string): boolean {
  return (PHASE_HOVER_CANVAS_IDS as readonly string[]).includes(canvasId);
}

function beginPhaseScrub(event: PointerEvent, canvasId: string): void {
  if (paperModeActive() || event.button !== 0 || gridState.enabled || !latestPhaseRows.length || latestDisplayWindow.mode !== "phase") return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
  if (phase === null) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  activePhaseScrub = { canvasId, pointerId: event.pointerId };
  canvas.classList.add("phase-scrub-hover");
  activePhaseHoverCanvasId = null;
  currentAnimationPhase = phase;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function updatePhaseScrub(event: PointerEvent, canvasId: string): void {
  const canvas = event.currentTarget as HTMLCanvasElement;
  if (canvasSupportsPhaseHover(canvasId)) {
    canvas.classList.toggle("phase-scrub-hover", phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event)) !== null);
  }
  if (activePhaseScrub) {
    if (activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
    event.preventDefault();
    scrubPhaseToPointer(canvas, canvasId, event);
    return;
  }
  if (gridState.enabled) return;
  if (event.pointerType !== "mouse" || event.buttons !== 0 || !canvasSupportsPhaseHover(canvasId)) return;
  const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
  if (phase === null) {
    clearPhaseHover(canvasId);
    return;
  }
  activePhaseHoverCanvasId = canvasId;
  currentAnimationPhase = phase;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function finishPhaseScrub(event: PointerEvent, canvasId: string): void {
  if (!activePhaseScrub || activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  event.preventDefault();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePhaseScrub = null;
  if (canvasSupportsPhaseHover(canvasId)) {
    canvas.classList.toggle("phase-scrub-hover", phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event)) !== null);
  }
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function clearPhaseHover(canvasId: string): void {
  if (activePhaseHoverCanvasId !== canvasId) return;
  activePhaseHoverCanvasId = null;
  modelAnimationStartTime = null;
  drawAnimatedPhaseViews();
}

function referenceCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent, render: ReferencePlotRenderState): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = render.width / Math.max(1, rect.width);
  const scaleY = render.height / Math.max(1, rect.height);
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function snapParameterValue(key: ControlParameterKey, value: number): number {
  const meta = sliderMeta(key);
  const rawSliderValue = sliderValueFromNumericValue(key, value);
  const clampedSliderValue = clamp(rawSliderValue, meta.min, meta.max);
  const snappedSliderValue = roundToNativeStep(
    meta.min + Math.round((clampedSliderValue - meta.min) / meta.step) * meta.step,
    meta.step
  );
  return parameterValueFromSlider(key, clamp(snappedSliderValue, meta.min, meta.max));
}

function setReferencePlotParameter(key: ControlParameterKey, value: number): boolean {
  const snapped = snapParameterValue(key, value);
  if (!Number.isFinite(snapped) || valuesMatch(state[key], snapped)) return false;
  state[key] = snapped;
  syncGridRangeCenter(key);
  updateSliderLabel(key);
  return true;
}

function commitReferencePlotParameters(updates: Partial<Record<ControlParameterKey, number>>): boolean {
  let changed = false;
  Object.entries(updates).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    changed = setReferencePlotParameter(key as ControlParameterKey, value) || changed;
  });
  if (!changed) return false;
  gridState.hoverResult = null;
  gridState.heldResult = null;
  updateAllSliderLabels();
  refreshActivePreset();
  scheduleSolve();
  return true;
}

function referenceCoordinate(render: ReferencePlotRenderState, point: { x: number; y: number }): { x: number; y: number } {
  const clamped = clampPointToPlot(point, render.plot);
  const xFraction = (clamped.x - render.plot.left) / render.plot.width;
  const yFraction = 1 - (clamped.y - render.plot.top) / render.plot.height;
  return {
    x: render.xlim[0] + xFraction * (render.xlim[1] - render.xlim[0]),
    y: render.ylim[0] + yFraction * (render.ylim[1] - render.ylim[0])
  };
}

function updateStabilityMapParameters(canvas: HTMLCanvasElement, event: PointerEvent): boolean {
  const render = referencePlotRenderStates.get("stabilityMapCanvas");
  if (!render) return false;
  const point = referenceCanvasPoint(canvas, event, render);
  const coordinate = referenceCoordinate(render, point);
  return commitReferencePlotParameters({
    zetac: 10 ** coordinate.x,
    zeta: 10 ** coordinate.y
  });
}

function updateInstabilityStripParameters(canvas: HTMLCanvasElement, event: PointerEvent): boolean {
  const render = referencePlotRenderStates.get("cepheidGuideCanvas");
  if (!render) return false;
  const point = referenceCanvasPoint(canvas, event, render);
  const coordinate = referenceCoordinate(render, point);
  const stripCoordinate = clamp(coordinate.x, 0, 1);
  const gamma = clamp(coordinate.y, 0, 1);
  const zeta = Math.max(1e-6, state.zeta);
  const zetac = zeta * 10 ** (4 * stripCoordinate - 2);
  return commitReferencePlotParameters({
    zetac,
    gammac: gamma
  });
}

function applyReferencePlotPointer(canvas: HTMLCanvasElement, canvasId: ReferencePlotInteraction["canvasId"], event: PointerEvent): boolean {
  return canvasId === "stabilityMapCanvas"
    ? updateStabilityMapParameters(canvas, event)
    : updateInstabilityStripParameters(canvas, event);
}

function beginReferencePlotInteraction(event: PointerEvent, canvasId: ReferencePlotInteraction["canvasId"]): void {
  if (event.button !== 0) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const render = referencePlotRenderStates.get(canvasId);
  if (!render) return;
  const point = referenceCanvasPoint(canvas, event, render);
  if (!pointInPlot(point, render.plot)) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  activeReferencePlotInteraction = { canvasId, pointerId: event.pointerId };
  canvas.dataset.referenceInteraction = canvasId === "stabilityMapCanvas" ? "stability-map" : "instability-strip";
  applyReferencePlotPointer(canvas, canvasId, event);
}

function updateReferencePlotInteraction(event: PointerEvent, canvasId: ReferencePlotInteraction["canvasId"]): void {
  if (!activeReferencePlotInteraction || activeReferencePlotInteraction.canvasId !== canvasId || activeReferencePlotInteraction.pointerId !== event.pointerId) return;
  event.preventDefault();
  applyReferencePlotPointer(event.currentTarget as HTMLCanvasElement, canvasId, event);
}

function finishReferencePlotInteraction(event: PointerEvent, canvasId: ReferencePlotInteraction["canvasId"]): void {
  if (!activeReferencePlotInteraction || activeReferencePlotInteraction.canvasId !== canvasId || activeReferencePlotInteraction.pointerId !== event.pointerId) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  event.preventDefault();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  delete canvas.dataset.referenceInteraction;
  activeReferencePlotInteraction = null;
}

function setPointerCaptureIfAvailable(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events in tests may not create an active browser pointer.
  }
}

function beginGridCanvasInteraction(event: PointerEvent, canvasId: string): void {
  if (!gridState.enabled) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const point = canvasPoint(canvas, event);
  const colorbar = colorbarRegionAt(canvasId, point);
  if (colorbar) {
    event.preventDefault();
    setPointerCaptureIfAvailable(canvas, event.pointerId);
    activeGridCanvasInteraction = { type: "colorbar", canvasId, pointerId: event.pointerId };
    canvas.dataset.gridInteraction = "colorbar";
    gridState.heldResult = null;
    stopGridAnimation();
    scrubGridColorbar(colorbar, point);
    return;
  }

  if (canvasId === "fourierCanvas") {
    const hit = fourierPointHitAt(point);
    const result = hit?.result ?? gridState.hoverResult;
    if (!result) return;
    event.preventDefault();
    setPointerCaptureIfAvailable(canvas, event.pointerId);
    activeGridCanvasInteraction = { type: "fourier-hold", canvasId, pointerId: event.pointerId };
    canvas.dataset.gridInteraction = "fourier-hold";
    gridState.hoverResult = result;
    gridState.heldResult = result;
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
  ensureGridBudgetControls();
  updateIntegrationControlVisibility();
  updateResetButtons();
}

function updateIntegrationControlVisibility(): void {
  const visible = activeIntegrationControlKeys();
  document.querySelectorAll<HTMLElement>("#integrationControls [data-control-key]").forEach((wrapper) => {
    const key = wrapper.dataset.controlKey as ControlParameterKey | undefined;
    wrapper.hidden = !key || !visible.has(key);
  });
  if (disableGridModeIfNoActiveRanges()) return;
  updateGridBudgetControls();
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
        ${sliderScaleMarkup(key)}
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
      updateReferencePanelsForKey(key);
      refreshActivePreset();
      scheduleSolve();
    });
    const updateBounds = () => updateGridRangeBounds(key, Number(lower.value), Number(upper.value));
    attachGridSliderDeferral(input);
    attachGridSliderDeferral(lower);
    attachGridSliderDeferral(upper);
    lower.addEventListener("input", updateBounds);
    upper.addEventListener("input", updateBounds);
    wrapper.addEventListener("pointerdown", (event) => beginSliderTap(event, key));
    wrapper.addEventListener("pointerup", (event) => finishSliderTap(event, key));
    wrapper.addEventListener("pointercancel", (event) => {
      if (activeSliderTapStart?.key === key && activeSliderTapStart.pointerId === event.pointerId) activeSliderTapStart = null;
    });
    wrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleGridRangeFromSliderGesture(key);
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

function sliderScaleMarkup(key: ControlParameterKey): string {
  if (key === "tEnd") return tauScaleMarkup();
  if (key === "zeta") return keyedScaleMarkup(key, [0.01, 0.1, 1, 10, 100]);
  if (key === "zetac") return keyedScaleMarkup(key, [0, 0.1, 1, 10, 100]);
  if (key === "m") return keyedScaleMarkup(key, [CHI_PARAMETER_MIN, 10, CHI_PARAMETER_MAX]);
  return "";
}

function keyedScaleMarkup(key: ControlParameterKey, ticks: readonly number[]): string {
  const meta = sliderMeta(key);
  const span = meta.max - meta.min || 1;
  return `<div class="slider-scale">${ticks.map((tick) => {
    const sliderValue = sliderValueFromNumericValue(key, tick);
    const position = ((sliderValue - meta.min) / span) * 100;
    const edge = Math.abs(position) < 1e-8
      ? ` data-scale-edge="start"`
      : Math.abs(position - 100) < 1e-8 ? ` data-scale-edge="end"` : "";
    return `<span${edge} style="--tick-position:${position.toFixed(4)}%">${controlValueLabel(key, tick)}</span>`;
  }).join("")}</div>`;
}

function sliderInputValue(key: ControlParameterKey): number {
  return sliderValueFromParameter(key, state);
}

function valueFromSlider(key: ControlParameterKey, value: number): number {
  return parameterValueFromSlider(key, value);
}

function controlValueLabel(key: ControlParameterKey, value: number): string {
  if (key === "zeta" || key === "zetac") {
    if (Math.abs(value) < 1e-12) return "0";
    if (Math.abs(value) >= 10) return fmt(value, 1);
    if (Math.abs(value) >= 1) return fmt(value, 2);
    if (Math.abs(value) >= 0.1) return fmt(value, 3);
    return fmt(value, 4);
  }
  if (key === "m") return fmt(value, value >= 20 ? 1 : 2);
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

function derivationBlock(key: string, title: string, body: string): string {
  return `
    <section class="derivation-block" data-derivation-block="${key}">
      <h4>${title}</h4>
      ${body}
    </section>
  `;
}

function derivationEquation(lines: readonly string[]): string {
  return `
    <div class="equation-block derivation-equations">
      \\[
      \\begin{aligned}
      ${lines.join("\\\\[0.35em]\n")}
      \\end{aligned}
      \\]
    </div>
  `;
}

function derivationConditionFormula(stability: AnalyticStabilityResult, condition: AnalyticStabilityCondition): string {
  if (condition.kind === "convective") return s72ConvectiveMargin();
  if (condition.kind === "secular") return s72SecularMargin(stability);
  if (condition.kind === "dynamic") return s72DynamicMargin(stability);
  return s72PulsationalMargin(stability);
}

function derivationConditionRows(stability: AnalyticStabilityResult): string {
  return stability.conditions
    .map((condition) => {
      const symbol = s72LatexInequality(condition.stable, ">");
      const className = s72MetricClass(condition.stable);
      return `
        <tr data-stability-kind="${condition.kind}" class="${className}">
          <td>${s72Verdict(condition.kind, condition.stable)}</td>
          <td>\\(\\Delta_{\\rm ${s72ShortLabel(condition.kind)}}=${fmt(condition.value, 3)}\\ ${symbol}\\ 0\\)</td>
        </tr>
      `;
    })
    .join("");
}

function buildGeometryDerivation(parameters: ModelParameters): string {
  const eta = Math.cbrt(Math.max(0, 1 - 3 / parameters.m));
  const etaDisplay = fmtFixed(eta, 3);
  const chiDisplay = fmt(parameters.m, 3);
  const lines = parameters.variableM
    ? [
        `\\ozEta{\\eta} &= \\left(1-\\frac{3}{${TEX.m}}\\right)^{1/3}=\\ozEta{${etaDisplay}}`,
        `\\ozChi{\\chi}(${TEX.R}) &= \\frac{3}{1-(\\ozEta{\\eta}/${TEX.R})^3}`,
        `\\ozChi{\\chi}(1) &= ${TEX.m}=\\ozChiZero{${chiDisplay}}`,
        `\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0} &= ${TEX.R}^{-\\ozChi{\\chi}(${TEX.R})}`
      ]
    : [
        `\\ozChi{\\chi} &= ${TEX.m}=\\ozChiZero{${chiDisplay}}`,
        `\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0} &= ${TEX.R}^{-${TEX.m}}`
      ];
  return derivationBlock(
    "geometry",
    "Geometry and Shell Thinness",
    `<p>${parameters.variableM
      ? "Radius-dependent shell geometry is active, so the local thin shell factor changes with radius."
      : "Fixed shell geometry is active, so the thin shell factor stays at the slider value."}</p>${derivationEquation(lines)}`
  );
}

function buildOpacityDerivation(parameters: ModelParameters): string {
  const powers = derivedPowers(1, parameters);
  return derivationBlock(
    "opacity",
    "Opacity and Radiative Scaling",
    derivationEquation([
      `\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0} &= ${TEX.R}^{-\\ozChi{\\chi}(${TEX.gamma1}-1)}${TEX.H}`,
      `\\frac{\\ozNeutral{\\kappa}}{\\ozNeutral{\\kappa}_0} &= \\left(\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0}\\right)^{${TEX.n}}\\left(\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0}\\right)^{-${TEX.s}}`,
      `&= ${TEX.R}^{-\\ozChi{\\chi}${TEX.n}+\\ozChi{\\chi}${TEX.s}(${TEX.gamma1}-1)}${TEX.H}^{-${TEX.s}}`,
      `\\ozNeutral{b} &= 4+\\ozChi{\\chi}\\left[${TEX.n}-(${TEX.s}+4)(${TEX.gamma1}-1)\\right]=\\ozNeutral{${fmt(powers.b, 3)}}`
    ])
  );
}

function buildEquilibriumDerivation(parameters: ModelParameters): string {
  const powers = derivedPowers(1, parameters);
  const base = 1 ** parameters.sourceExp;
  const gammaC = effectiveGammaC(parameters);
  return derivationBlock(
    "equilibrium",
    "Equilibrium Quantities",
    derivationEquation([
      `${TEX.R}_0 &= 1,\\quad ${TEX.V}_0=0,\\quad ${TEX.H}_0=1,\\quad ${TEX.Uc}_0=1`,
      `\\left.\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0}\\right|_0 &= 1,\\quad \\left.\\frac{\\ozNeutral{P}}{\\ozNeutral{P}_0}\\right|_0 = 1,\\quad \\left.\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0}\\right|_0=1`,
      `\\left.\\frac{\\ozNeutral{\\kappa}}{\\ozNeutral{\\kappa}_0}\\right|_0 &= 1,\\quad \\ozNeutral{b}=\\ozNeutral{${fmt(powers.b, 3)}},\\quad \\ozNeutral{c}=\\ozChi{\\chi}-2=\\ozNeutral{${fmt(powers.c, 3)}}`,
      `${TEX_GAMMAC_EFF} &= \\ozGammac{${fmt(gammaC, 3)}}`,
      `\\ozRadiative{L_{r,0}} &= 1-${TEX_GAMMAC_EFF}=\\ozRadiative{${fmt(1 - gammaC, 3)}}`,
      `\\ozConvLum{L_{c,0}} &= ${TEX_GAMMAC_EFF}=\\ozConvLum{${fmt(gammaC, 3)}}`,
      `\\ozLuminosity{L_0} &= \\ozRadiative{L_{r,0}}+\\ozConvLum{L_{c,0}}=1,\\quad \\ozNeutral{L_{b,0}}=${fmt(base, 3)}`
    ])
  );
}

function buildLuminosityDerivation(parameters: ModelParameters): string {
  const convectionFrozen = parameters.zetac <= 0;
  const gammaC = effectiveGammaC(parameters);
  const convectionAbsent = convectionFrozen && Math.abs(parameters.uc0) <= 1e-9;
  const note = convectionAbsent
    ? "<p>With \\(\\zeta_c=0\\) and \\(U_{c,0}=0\\), convection is absent, so \\(\\gamma_{c,\\rm eff}=0\\) and radiation carries the full luminosity.</p>"
    : convectionFrozen
    ? "<p>With \\(\\zeta_c=0\\), the convective velocity is frozen. If \\(U_{c,0}\\neq0\\), the nonlinear luminosity can still include the weighted frozen convective channel.</p>"
    : "<p>Time-dependent convection is active, so radiative and convective luminosities both respond to the perturbation.</p>";
  return derivationBlock(
    "luminosity",
    "Luminosity and Source",
    `${note}${derivationEquation([
      `\\ozNeutral{L_b} &= ${TEX.R}^{${TEX.sourceExp}}`,
      `${TEX_GAMMAC_EFF} &= \\ozGammac{${fmt(gammaC, 3)}}`,
      `${TEX.Lr} &= (1-${TEX_GAMMAC_EFF})\\,${TEX.R}^{\\ozNeutral{b}}${TEX.H}^{${TEX.s}+4}`,
      `${TEX.Lc} &= ${TEX_GAMMAC_EFF}\\,${TEX.R}^{-(\\ozNeutral{c})}${TEX.Uc}^{3}`,
      `${TEX.L} &= ${TEX.Lr}+${TEX.Lc}`,
      `\\frac{d${TEX.H}}{d${TEX.tau}} &= ${TEX.zeta}\\,${TEX.R}^{\\ozChi{\\chi}(${TEX.gamma1}-1)}\\left(${TEX.R}^{${TEX.sourceExp}}-${TEX.L}\\right)`
    ])}`
  );
}

function buildConvectionDerivation(parameters: ModelParameters): string {
  const driver = parameters.driver === "abs-v" ? `\\sqrt{|${TEX.V}|}` : `\\sqrt{${TEX.H}}`;
  const powers = derivedPowers(1, parameters);
  const intro = parameters.zetac <= 0
    ? "<p>Time-dependent convection is off in the active physics because \\(\\zeta_c=0\\).</p>"
    : `<p>The active convective driver is \\(${driver}\\).</p>`;
  const evolution = parameters.zetac <= 0
    ? `\\frac{d${TEX.Uc}}{d${TEX.tau}} = 0`
    : `\\frac{d${TEX.Uc}}{d${TEX.tau}} = ${TEX.zetac}\\left[${TEX.R}^{-\\ozNeutral{d}}${driver}-${TEX.Uc}\\right]`;
  return derivationBlock(
    "convection",
    "Convection Assumption",
    `${intro}${derivationEquation([
      `\\ozNeutral{d} &= \\frac{\\ozChi{\\chi}(${TEX.gamma1}-1)}{2}=\\ozNeutral{${fmt(powers.d, 3)}}`,
      evolution,
      `\\ozNeutral{c} &= \\ozChi{\\chi}-2=\\ozNeutral{${fmt(powers.c, 3)}}`
    ])}`
  );
}

function buildLinearDerivation(parameters: ModelParameters, stability: AnalyticStabilityResult): string {
  const modeLabel = stability.physicsMode === "convective" ? "time-dependent convective" : "reduced frozen-convection/radiative";
  const definitions = derivationEquation([
    `\\ozNeutral{E} &= (1-${TEX_GAMMAC_EFF})\\ozNeutral{b}-${TEX_GAMMAC_EFF}\\ozNeutral{c}-${TEX.sourceExp}=\\ozNeutral{${fmt(stability.eCoefficient, 3)}}`,
    `\\ozNeutral{Q} &= (1-${TEX_GAMMAC_EFF})(${TEX.s}+4)=\\ozNeutral{${fmt(stability.terms.radiativeThermal, 3)}}`,
    `\\ozNeutral{S} &= ${TEX.m}${TEX.gamma1}-4=\\ozNeutral{${fmt(stability.terms.restoring, 3)}}`
  ]);
  const conditions = stability.conditions.map((condition) => {
    const formula = derivationConditionFormula(stability, condition);
    return `\\Delta_{\\rm ${s72ShortLabel(condition.kind)}} &= ${formula}`;
  });
  const reducedNote = stability.physicsMode === "radiative"
    ? "<p>The \\(u_c\\) perturbation is removed when \\(\\zeta_c=0\\), so the convective/turbulent criterion drops out and the remaining Hurwitz margins reduce.</p>"
    : "<p>The active four-variable linear system keeps the convective lag perturbation \\(u_c\\), producing the four Stellingwerf margins.</p>";
  return derivationBlock(
    "linear",
    "Linear Analysis and Stability Criteria",
    `
      <p>Linearized about \\(R=H=U_c=1\\) with active ${modeLabel} physics.</p>
      ${definitions}
      ${reducedNote}
      ${derivationEquation(conditions)}
      <table class="derivation-condition-table" aria-label="Current stability criteria">
        <tbody>${derivationConditionRows(stability)}</tbody>
      </table>
    `
  );
}

function buildDerivationHtml(parameters: ModelParameters, stability: AnalyticStabilityResult): string {
  return [
    buildGeometryDerivation(parameters),
    buildOpacityDerivation(parameters),
    buildEquilibriumDerivation(parameters),
    buildLuminosityDerivation(parameters),
    buildConvectionDerivation(parameters),
    buildLinearDerivation(parameters, stability)
  ].join("");
}

function derivationSignature(parameters: ModelParameters, stability: AnalyticStabilityResult): string {
  return [
    parameters.variableM ? "variable" : "fixed",
    parameters.driver,
    stability.physicsMode,
    parameters.zeta,
    parameters.zetac,
    parameters.gammac,
    parameters.m,
    parameters.gamma1,
    parameters.n,
    parameters.s,
    parameters.sourceExp,
    parameters.cq,
    ...stability.conditions.map((condition) => `${condition.kind}:${condition.value}`)
  ].map((value) => String(value)).join("|");
}

function updateDerivationPanel(parameters: ModelParameters = state, stability = analyticStabilityConditions(parameters)): void {
  const node = document.getElementById("derivationContent");
  if (!(node instanceof HTMLElement)) return;
  const signature = derivationSignature(parameters, stability);
  if (signature === lastDerivationSignature) return;
  lastDerivationSignature = signature;
  const details = document.getElementById("derivationPanel") as HTMLDetailsElement | null;
  if (details) {
    details.dataset.physicsMode = stability.physicsMode;
    details.dataset.geometryMode = parameters.variableM ? "radius-dependent" : "fixed";
    details.dataset.driverMode = parameters.driver;
    details.dataset.convectionMode = parameters.zetac <= 0 ? "frozen" : "time-dependent";
  }
  stageMathHtml(node, buildDerivationHtml(parameters, stability));
  queueMathTypeset([node]);
}

function referencePanelsDependOnKey(key: ControlParameterKey): boolean {
  return key === "m" || key === "gammac" || key === "zetac" || key === "uc0";
}

function updateReferencePanelsForKey(key: ControlParameterKey): void {
  if (referencePanelsDependOnKey(key)) updateEquationBlocks();
  else updateDerivationPanel();
}

function updateVariableReferencePanel(parameters: ModelParameters = state): HTMLElement[] {
  const panel = document.getElementById("variablesPanel");
  if (!(panel instanceof HTMLElement)) return [];
  const hasConvectiveLuminosity = convectiveLuminosityAvailable(parameters);
  const visibleRows = hasConvectiveLuminosity
    ? ["tau", "R", "V", "H", "Uc", "Lr", "Lc", "L"]
    : ["tau", "R", "V", "H", "Lr", "L"];
  panel.dataset.convectiveLuminosity = hasConvectiveLuminosity ? "available" : "absent";
  panel.dataset.variableRows = visibleRows.join(",");
  panel.querySelectorAll<HTMLElement>("[data-variable-row]").forEach((row) => {
    const key = row.dataset.variableRow;
    row.hidden = !key || !visibleRows.includes(key);
  });

  const meaningTargets: HTMLElement[] = [];
  const meanings = {
    meaningLr: hasConvectiveLuminosity
      ? `Radiative contribution, including its \\(1-\\ozGammac{\\gamma_c}\\) weight`
      : `Radiative luminosity; carries the full shell luminosity in this reduced case`,
    meaningL: hasConvectiveLuminosity
      ? `Sum \\(\\ozLuminosity{L}=\\ozRadiative{L_r}+\\ozConvLum{L_c}\\)`
      : `Equal to \\(\\ozRadiative{L_r}\\) because \\(\\ozConvLum{L_c}=0\\)`
  };
  Object.entries(meanings).forEach(([id, html]) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.mathSource === html || stagedMathUpdates.get(node)?.html === html) return;
    node.dataset.mathSource = html;
    stageMathHtml(node, html);
    meaningTargets.push(node);
  });
  return meaningTargets;
}

function updateEquationBlocks(): void {
  const eta = Math.cbrt(Math.max(0, 1 - 3 / state.m));
  const etaDisplay = fmtFixed(eta, 2);
  const hasConvectiveLuminosity = convectiveLuminosityAvailable();
  const geometry = state.variableM
    ? `\\ozChi{\\chi} &= \\frac{3}{1-(\\ozEta{\\eta}/\\ozRadius{R})^3}\\\\[0.2em]
       \\ozEta{\\eta} &= \\left(1-\\frac{3}{\\ozChiZero{\\chi_0}}\\right)^{1/3}=\\ozEta{${etaDisplay}}`
    : `\\ozChi{\\chi} &= \\ozChiZero{\\chi_0}`;
  const driver = state.driver === "abs-v" ? "\\sqrt{|\\ozVelocity{V}|}" : "\\sqrt{\\ozPressure{H}}";
  const odeNode = el<HTMLDivElement>("odeEquations");
  const luminosityNode = el<HTMLDivElement>("luminosityEquations");
  odeNode.dataset.driverMode = state.driver;
  odeNode.dataset.convectiveLuminosity = hasConvectiveLuminosity ? "available" : "absent";
  odeNode.dataset.equationVariables = hasConvectiveLuminosity ? "R,V,H,Uc" : "R,V,H";
  const odeLines = [
    `\\frac{d\\ozRadius{R}}{d\\ozTau{\\tau}} &= \\ozVelocity{V}`,
    `\\frac{d\\ozVelocity{V}}{d\\ozTau{\\tau}} &=
      \\frac{\\ozPressure{H}}{\\ozRadius{R}^{\\ozChi{\\chi}\\ozGamma{\\Gamma_1}-2}}
      - \\frac{1}{\\ozRadius{R}^{2}}
      - \\ozDamping{C_q}\\ozVelocity{V}^{3}`,
    `\\frac{d\\ozPressure{H}}{d\\ozTau{\\tau}} &=
      \\ozZeta{\\zeta}\\,
      \\ozRadius{R}^{\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)}
      \\left[
        \\ozRadius{R}^{\\ozSource{U}}
        - \\ozLuminosity{L}
      \\right]`
  ];
  if (hasConvectiveLuminosity) {
    odeLines.push(`\\frac{d\\ozConvective{U_c}}{d\\ozTau{\\tau}} &=
      \\ozZetac{\\zeta_c}
      \\left[
        \\ozRadius{R}^{-\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)/2}\\,${driver}
        - \\ozConvective{U_c}
      \\right]`);
  }
  const odeHtml = `
    \\[
    \\begin{aligned}
    ${odeLines.join("\\\\[0.35em]\n")}
    \\end{aligned}
    \\]
  `;
  luminosityNode.dataset.geometryMode = state.variableM ? "radius-dependent" : "fixed";
  luminosityNode.dataset.geometryLayout = "stacked";
  luminosityNode.dataset.etaValue = etaDisplay;
  luminosityNode.dataset.convectiveLuminosity = hasConvectiveLuminosity ? "available" : "absent";
  luminosityNode.dataset.luminosityTerms = hasConvectiveLuminosity ? "L_r,L_c,L" : "L_r,L";
  const luminosityLines = [
    geometry,
    hasConvectiveLuminosity
      ? `\\ozRadiative{L_r} &=
        (1-\\ozGammac{\\gamma_c})\\,
        \\ozRadius{R}^{4+\\ozChi{\\chi}
        \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
        \\ozPressure{H}^{\\ozPink{s}+4}`
      : `\\ozRadiative{L_r} &=
        \\ozRadius{R}^{4+\\ozChi{\\chi}
        \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
        \\ozPressure{H}^{\\ozPink{s}+4}`
  ];
  if (hasConvectiveLuminosity) {
    luminosityLines.push(
      `\\ozConvLum{L_c} &=
        \\ozGammac{\\gamma_c}\\,
        \\ozRadius{R}^{-(\\ozChi{\\chi}-2)}
        \\ozConvective{U_c}^{3}`,
      `\\ozLuminosity{L} &=
        \\ozRadiative{L_r}
        + \\ozConvLum{L_c}`
    );
  } else {
    luminosityLines.push(`\\ozLuminosity{L} &= \\ozRadiative{L_r}`);
  }
  const luminosityHtml = `
    \\[
    \\begin{aligned}
    ${luminosityLines.join("\\\\[0.35em]\n")}
    \\end{aligned}
    \\]
  `;
  const variableTargets = updateVariableReferencePanel();
  stageMathHtml(odeNode, odeHtml);
  stageMathHtml(luminosityNode, luminosityHtml);
  queueMathTypeset([odeNode, luminosityNode, ...variableTargets]);
  updateDerivationPanel();
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
  updateReferencePanelsForKey(key);
  refreshActivePreset();
  scheduleSolve();
}

function updateResetButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-reset-key]").forEach((button) => {
    const key = button.dataset.resetKey as ControlParameterKey;
    button.disabled = valuesMatch(state[key], PRESETS[selectedPreset][key]);
    button.title = `Restore to ${selectedPreset} preset value: ${controlValueLabel(key, Number(PRESETS[selectedPreset][key]))}`;
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
  const started = window.performance.now();
  latestResult = solveModel(state);
  recordGridModelTiming(window.performance.now() - started);
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

function rowSeriesKey(key: PlotSeriesKey): key is RowSeriesKey {
  return key !== "Lb";
}

function baseLuminosity(row: Row, parameters: ModelParameters = state): number {
  if (!Number.isFinite(row.R) || row.R <= 0) return NaN;
  const value = row.R ** parameters.sourceExp;
  return Number.isFinite(value) ? value : NaN;
}

function sourceLuminosityColor(): string {
  return COLORS.sourceExp;
}

function sourceLuminosityLegendLabel(): string {
  return `\\(${TEX.R}^{${TEX.sourceExp}}\\) source`;
}

interface ThermodynamicPoint {
  row: Row;
  logT: number;
  logP: number;
  logOpacity: number;
}

function log10Positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.log10(value) : NaN;
}

function temperatureRatio(row: Row, parameters: ModelParameters): number {
  if (!Number.isFinite(row.R) || row.R <= 0 || !Number.isFinite(row.H) || row.H <= 0) return NaN;
  const chi = mAt(row.R, parameters);
  const value = row.R ** (-chi * (parameters.gamma1 - 1)) * row.H;
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

function pressureRatio(row: Row, parameters: ModelParameters): number {
  if (!Number.isFinite(row.R) || row.R <= 0 || !Number.isFinite(row.H) || row.H <= 0) return NaN;
  const chi = mAt(row.R, parameters);
  const value = row.R ** (-chi * parameters.gamma1) * row.H;
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

function opacityLogFromLogTemperaturePressure(logT: number, logP: number, parameters: ModelParameters): number {
  if (!Number.isFinite(logT) || !Number.isFinite(logP)) return NaN;
  return parameters.n * logP - (parameters.n + parameters.s) * logT;
}

function thermodynamicPoint(row: Row, parameters: ModelParameters): ThermodynamicPoint | null {
  const logT = log10Positive(temperatureRatio(row, parameters));
  const logP = log10Positive(pressureRatio(row, parameters));
  const logOpacity = opacityLogFromLogTemperaturePressure(logT, logP, parameters);
  if (![logT, logP, logOpacity].every(Number.isFinite)) return null;
  return { row, logT, logP, logOpacity };
}

function thermodynamicPoints(rows: Row[], parameters: ModelParameters, maxPoints = 1400): ThermodynamicPoint[] {
  return downsample(rows, maxPoints, ["R", "H"])
    .map((row) => thermodynamicPoint(row, parameters))
    .filter((point): point is ThermodynamicPoint => Boolean(point));
}

const gridThermodynamicPointCache = new WeakMap<GridModelResult, Map<number, ThermodynamicPoint[]>>();

function thermodynamicPointsForGridResult(result: GridModelResult, maxPoints: number): ThermodynamicPoint[] {
  let pointsByDensity = gridThermodynamicPointCache.get(result);
  if (!pointsByDensity) {
    pointsByDensity = new Map();
    gridThermodynamicPointCache.set(result, pointsByDensity);
  }
  const cached = pointsByDensity.get(maxPoints);
  if (cached) return cached;
  const points = thermodynamicPoints(closedLoopPanelRows(result.phaseRows), result.parameters, maxPoints);
  pointsByDensity.set(maxPoints, points);
  return points;
}

function downsample(rows: Row[], maxPoints = 2200, keys: readonly PlotSeriesKey[] = []): Row[] {
  if (rows.length <= maxPoints) return rows;
  const uniqueKeys = [...new Set(keys.filter(rowSeriesKey))];
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

function convectiveResponseDisabled(parameters: ModelParameters = state): boolean {
  return parameters.zetac <= 0;
}

function convectiveLuminosityAvailable(parameters: ModelParameters = state): boolean {
  return effectiveGammaC(parameters) > 1e-9;
}

function convectiveVelocityHistoryAvailable(rows: readonly Row[] = latestRows, parameters: ModelParameters = state): boolean {
  return !convectiveResponseDisabled(parameters)
    || (convectiveLuminosityAvailable(parameters) && rows.some((row) => Math.abs(row.Uc) > 1e-9));
}

function plotSeriesIsAvailable(plotId: InteractivePlotId, key: PlotSeriesKey): boolean {
  if (plotId === "time" && key === "Uc") return convectiveVelocityHistoryAvailable();
  if (plotId === "lum" && (key === "Lr" || key === "Lc")) return convectiveLuminosityAvailable();
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

function anchoredVisualRange(
  values: readonly number[],
  anchor: number,
  minimumHalfSpan: number,
  padFraction = 0.08
): NumericRange {
  const base = range([...values, anchor], padFraction);
  if (!Number.isFinite(anchor) || !Number.isFinite(minimumHalfSpan) || minimumHalfSpan <= 0) return base;
  return [
    Math.min(base[0], anchor - minimumHalfSpan),
    Math.max(base[1], anchor + minimumHalfSpan)
  ];
}

function stableTimeEquilibriumDisplayActive(): boolean {
  return latestDisplayWindow.mode === "time" && latestDisplayWindow.reason === "equilibrium";
}

function stableTimeVisualReferenceRows(rows: readonly Row[]): readonly Row[] {
  return stableTimeEquilibriumDisplayActive() && latestRows.length ? latestRows : rows;
}

function expandRangeToInclude(base: NumericRange, included?: NumericRange): NumericRange {
  if (!included) return base;
  return [
    Math.min(base[0], included[0]),
    Math.max(base[1], included[1])
  ];
}

interface Series {
  label: string;
  color: string;
  rows: Row[];
  x: (row: Row) => number;
  y: (row: Row) => number;
  width?: number;
  colorAt?: (row: Row) => string;
  widthAt?: (row: Row) => number;
  dash?: number[];
}

interface ThermodynamicTrackSpec {
  points: ThermodynamicPoint[];
  width: number;
  alpha: number;
  color?: string;
}

interface ThermodynamicGridBackdrop {
  key: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  plot: PlotBox;
  xlim: NumericRange;
  ylim: NumericRange;
  opacityRange: NumericRange;
  staticTrackCount: number;
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

function fillPlotAreaBackground(ctx: CanvasRenderingContext2D, plot: PlotBox): void {
  ctx.save();
  ctx.fillStyle = THEME.plotBackground;
  ctx.fillRect(plot.left, plot.top, plot.width, plot.height);
  ctx.restore();
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
  ctx.font = "700 12px Inter, sans-serif";
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
    minimumYlim?: [number, number];
    fallbackXlim?: [number, number];
    view?: PlotView;
    interactivePlotId?: InteractivePlotId;
    xlabelColor?: string;
    ylabelColor?: string;
    message?: string;
    denseEnvelope?: boolean;
    phaseMarker?: { x: number; color: string };
    referenceLines?: Array<{ x?: number; y?: number }>;
    afterDraw?: (ctx: CanvasRenderingContext2D, plot: PlotBox, xlim: NumericRange, ylim: NumericRange, canvasId: string) => void;
  }
): void {
  const canvas = el<HTMLCanvasElement>(canvasId);
  const showPaperSeriesMarkers = paperModeActive() && !PAPER_MARKERLESS_CANVAS_IDS.has(canvasId);
  if (paperModeActive()) canvas.dataset.paperSeriesMarkers = showPaperSeriesMarkers ? "on" : "off";
  else delete canvas.dataset.paperSeriesMarkers;
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
  fillPlotAreaBackground(ctx, plot);
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
  const automaticYlim = options.ylim || range(yValues, 0.08);
  const ylim = options.view?.ylim || (options.ylim ? options.ylim : expandRangeToInclude(automaticYlim, options.minimumYlim));
  canvas.dataset.xlim = `${fmtFixed(xlim[0], 3)},${fmtFixed(xlim[1], 3)}`;
  canvas.dataset.ylim = `${fmtFixed(ylim[0], 4)},${fmtFixed(ylim[1], 4)}`;
  plotRenderStates.set(canvasId, { plotId: options.interactivePlotId, plot, xlim, ylim });
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  drawAxes(ctx, plot, xlim, ylim, options.xlabel, options.ylabel, options.xlabelColor, options.ylabelColor);
  if (options.referenceLines?.length) drawAxisReferenceLines(ctx, plot, xlim, ylim, options.referenceLines);
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
  series.forEach((item, seriesIndex) => {
    const printStyle = paperStyle(item.label, seriesIndex);
    const seriesColor = paperModeActive() && !gridState.enabled ? printStyle.color : item.color;
    const seriesDash = paperModeActive() && !item.dash?.length ? printStyle.dash : item.dash || [];
    if (!paperModeActive() && options.denseEnvelope && drawDenseEnvelope(ctx, item, plot, xlim, ylim)) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(seriesDash);
    if (!paperModeActive() && (item.colorAt || item.widthAt)) {
      let previous: { row: Row; x: number; y: number } | null = null;
      item.rows.forEach((row) => {
        const x = item.x(row);
        const y = item.y(row);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          previous = null;
          return;
        }
        const current = { row, x: sx(x), y: sy(y) };
        if (previous) {
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(current.x, current.y);
          ctx.strokeStyle = item.colorAt ? item.colorAt(row) : item.color;
          ctx.lineWidth = item.widthAt ? item.widthAt(row) : item.width || 2;
          ctx.stroke();
        }
        previous = current;
      });
    } else {
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
      ctx.strokeStyle = seriesColor;
      ctx.lineWidth = item.width || 2;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (showPaperSeriesMarkers && item.rows.length) {
      const stride = Math.max(1, Math.floor(item.rows.length / 12));
      item.rows.forEach((row, index) => {
        if (index % stride !== 0 && index !== item.rows.length - 1) return;
        const x = item.x(row);
        const y = item.y(row);
        if (!Number.isFinite(x + y) || x < xlim[0] || x > xlim[1] || y < ylim[0] || y > ylim[1]) return;
        drawPaperSeriesMarker(ctx, sx(x), sy(y), seriesColor, printStyle.marker);
      });
    }
  });
  ctx.restore();
  if (options.phaseMarker) drawPhaseMarker(ctx, plot, xlim, options.phaseMarker);
  options.afterDraw?.(ctx, plot, xlim, ylim, canvasId);
  drawSelectionOverlay(ctx, canvasId, plot);
}

function drawAxisReferenceLines(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  lines: Array<{ x?: number; y?: number }>
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  lines.forEach((line) => {
    if (line.x !== undefined && line.x >= xlim[0] && line.x <= xlim[1]) {
      const x = sx(line.x);
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
    }
    if (line.y !== undefined && line.y >= ylim[0] && line.y <= ylim[1]) {
      const y = sy(line.y);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
    }
  });
  ctx.restore();
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

function parseHexColor(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return [255, 255, 255];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function mixHexColors(a: string, b: string, fraction: number): string {
  const [ar, ag, ab] = parseHexColor(a);
  const [br, bg, bb] = parseHexColor(b);
  const f = clamp(fraction, 0, 1);
  const channel = (start: number, end: number) => Math.round(start + (end - start) * f);
  return `rgb(${channel(ar, br)}, ${channel(ag, bg)}, ${channel(ab, bb)})`;
}

function radialVelocityCurveColor(value: number, maxAbs: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(maxAbs) || maxAbs <= 0) return "#FFFFFF";
  const color = value >= 0 ? POSITIVE_VELOCITY_COLOR : NEGATIVE_VELOCITY_COLOR;
  return mixHexColors("#FFFFFF", color, Math.min(1, Math.abs(value) / maxAbs));
}

function gridPhaseRowsForResult(result: GridModelResult, quantity: "L" | "V", maxPoints: number): Row[] {
  let rowsByDensity = gridPhaseRowCache.get(result);
  if (!rowsByDensity) {
    rowsByDensity = new Map();
    gridPhaseRowCache.set(result, rowsByDensity);
  }
  const key = `${quantity}:${maxPoints}`;
  const cached = rowsByDensity.get(key);
  if (cached) return cached;
  const rows = downsample(result.phaseRows, maxPoints, [quantity]);
  rowsByDensity.set(key, rows);
  return rows;
}

function gridPhaseSeries(
  quantity: "L" | "V",
  color: string,
  fallbackRows: Row[]
): Series[] {
  const accessor = (row: Row) => row[quantity];
  if (!gridState.enabled || !gridState.results.length) {
    const singleSeries: Series = { label: quantity, color, rows: fallbackRows, x: (row) => row.tau, y: accessor };
    if (!gridState.enabled && quantity === "V") {
      const maxAbs = Math.max(1e-12, ...fallbackRows.map((row) => Math.abs(row.V)).filter(Number.isFinite));
      singleSeries.colorAt = (row) => radialVelocityCurveColor(row.V, maxAbs);
      singleSeries.width = 2.3;
    }
    return [singleSeries];
  }
  if (paperModeActive()) {
    return gridState.results.map((result) => ({
      label: `grid-${result.id}`,
      color: gridResultColor(result, 0.82),
      rows: gridPhaseRowsForResult(result, quantity, GRID_PHASE_PATH_MAX_POINTS),
      x: (row) => row.tau,
      y: accessor,
      width: 1.35
    }));
  }
  const path = gridPathResults();
  const current = currentGridResult();
  const backgroundStride = Math.max(1, Math.ceil(gridState.results.length / GRID_PHASE_BACKGROUND_MAX_MODELS));
  const series: Series[] = gridState.results
    .filter((_result, index) => index % backgroundStride === 0)
    .map((result) => ({
      label: `grid-${result.id}`,
      color: "rgba(190, 200, 216, 0.18)",
      rows: gridPhaseRowsForResult(result, quantity, GRID_PHASE_BACKGROUND_MAX_POINTS),
      x: (row) => row.tau,
      y: accessor,
      width: 0.8
    }));
  path.forEach((result) => {
    series.push({
      label: `path-${result.id}`,
      color: "rgba(190, 200, 216, 0.34)",
      rows: gridPhaseRowsForResult(result, quantity, GRID_PHASE_PATH_MAX_POINTS),
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
      rows: gridPhaseRowsForResult(highlighted, quantity, GRID_PHASE_CURRENT_MAX_POINTS),
      x: (row) => row.tau,
      y: accessor,
      width: 3.4
    });
  }
  if (current) {
    series.push({
      label: quantity,
      color: gridResultColor(current, 0.98),
      rows: gridPhaseRowsForResult(current, quantity, GRID_PHASE_CURRENT_MAX_POINTS),
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
  const clearRegion = () => {
    gridColorbarRegions.delete(canvasId);
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    delete canvas.dataset.gridColorbar;
    delete canvas.dataset.gridColorbarKey;
    delete canvas.dataset.gridColorbarHit;
  };
  if (!gridState.enabled) {
    clearRegion();
    return;
  }
  const range = currentLoopRange();
  const current = currentGridResult();
  if (!range || (!paperModeActive() && !current)) {
    clearRegion();
    return;
  }
  const value = current?.variedValues[range.key];
  const sliderValue = current?.sliderValues[range.key];
  if (!paperModeActive() && (value === undefined || sliderValue === undefined)) {
    clearRegion();
    return;
  }
  const width = Math.min(150, Math.max(112, plot.width * 0.24));
  const height = 9;
  const left = plot.left + plot.width - width - 12;
  const top = plot.top + 12;
  if (!paperModeActive()) {
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
  } else {
    gridColorbarRegions.delete(canvasId);
  }
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (canvas) {
    canvas.dataset.gridColorbar = "ready";
    canvas.dataset.gridColorbarKey = range.key;
    if (!paperModeActive()) {
      canvas.dataset.gridColorbarHit = [
        Math.round(left - 12),
        Math.round(top - 10),
        Math.round(left + width + 12),
        Math.round(top + 50)
      ].join(",");
    } else delete canvas.dataset.gridColorbarHit;
  }
  const lowerValue = parameterValueFromSlider(range.key, range.lowerSliderValue);
  const upperValue = parameterValueFromSlider(range.key, range.upperSliderValue);
  const gradient = ctx.createLinearGradient(left, top, left + width, top);
  gradient.addColorStop(0, "#6080D0");
  gradient.addColorStop(1, "#FFD166");
  ctx.save();
  roundedRectPath(ctx, left - 8, top - 8, width + 16, 58, 5);
  ctx.fillStyle = floatingCanvasPanelFill(0.92);
  ctx.fill();
  ctx.strokeStyle = floatingCanvasPanelBorder(0.68);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = floatingCanvasPanelBorder(0.78);
  ctx.strokeRect(left, top, width, height);
  if (!paperModeActive() && sliderValue !== undefined && value !== undefined) {
    const fraction = clamp((sliderValue - range.lowerSliderValue) / Math.max(1e-12, range.upperSliderValue - range.lowerSliderValue), 0, 1);
    const markerX = left + fraction * width;
    ctx.fillStyle = parameterColorAt(value, range);
    ctx.strokeStyle = canvasMarkerOutlineColor();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(markerX, top + height + 2);
    ctx.lineTo(markerX - 5, top + height + 10);
    ctx.lineTo(markerX + 5, top + height + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = THEME.axisText;
  ctx.font = "11px Inter, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(controlValueLabel(range.key, lowerValue), left, top + height + 13);
  ctx.textAlign = "right";
  ctx.fillText(controlValueLabel(range.key, upperValue), left + width, top + height + 13);
  const symbol = controlCanvasSymbol(range.key);
  const valueText = paperModeActive() || value === undefined ? "" : ` = ${controlValueLabel(range.key, value)}`;
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
  const gridPoints = gridState.results.filter((result) => result.fourier);
  const path = gridPathResults().filter((result) => result.fourier);
  const allPoints = [...gridPoints, ...path];
  const panels: FourierPanelSpec[] = [
    {
      latex: "r_{21}",
      xLabel: "period/τ",
      yLabel: { base: "r", subscript: "21" },
      xValue: (result) => result.period,
      yValue: (result) => result.fourier!.r21
    },
    {
      latex: "r_{31}",
      xLabel: "period/τ",
      yLabel: { base: "r", subscript: "31" },
      xValue: (result) => result.period,
      yValue: (result) => result.fourier!.r31
    },
    {
      latex: "\\phi_{21}",
      xLabel: "period/τ",
      yLabel: { base: "phi", subscript: "21" },
      xValue: (result) => result.period,
      yValue: (result) => result.fourier!.phi21,
      yPhase: true
    },
    {
      latex: "\\phi_{31}",
      xLabel: "period/τ",
      yLabel: { base: "phi", subscript: "31" },
      xValue: (result) => result.period,
      yValue: (result) => result.fourier!.phi31,
      yPhase: true
    }
  ];
  const columns = rect.width >= 1760 ? 5 : rect.width >= 1320 ? 4 : rect.width >= 780 ? 2 : 1;
  const rows = Math.ceil(panels.length / columns);
  const cssHeight = Math.max(280, rows * 238);
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
  const currentFourier = !paperModeActive() && current?.fourier ? current : null;
  canvas.dataset.fourierAxisLabels = panels.map((item) => item.latex).join(",");
  canvas.dataset.fourierPathCount = String(path.length);
  canvas.dataset.fourierPhaseTicks = "pi-multiples";
  delete canvas.dataset.fourierStructuralPanels;
  delete canvas.dataset.fourierAdiabaticReference;
  const adiabaticReference: FourierSeriesPoint[] = [];
  const gap = 16;
  const pad = { left: 78, right: 22, top: 42, bottom: 60 };
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
    const xValues = fourierPanelXValues(item, allPoints, item.adiabaticReference ? adiabaticReference : []);
    const yValues = fourierPanelYValues(item, allPoints, path, item.adiabaticReference ? adiabaticReference : []);
    const xlim = item.xPhase ? phaseRange(xValues, false) : range(xValues, 0.05);
    const ylim = item.yPhase ? phaseRange(yValues, true) : range(yValues, 0.08);
    const ylabelX = Math.max(8, box.left - 70);
    fillPlotAreaBackground(ctx, box);
    drawFourierAxes(ctx, box, xlim, ylim, item.xLabel, ylabelX, {
      xPhase: item.xPhase,
      yPhase: item.yPhase,
      upperSkewnessAxis: item.upperSkewnessAxis ? path : null
    });
    drawFourierAxisLabel(ctx, item.yLabel, ylabelX, box.top + box.height / 2);
    if (item.identityLine) drawFourierIdentityLine(ctx, box, xlim, ylim);
    if (item.adiabaticReference) drawAdiabaticFourierReference(ctx, box, xlim, ylim, adiabaticReference);

    if (item.harmonics?.length && item.harmonicValues) {
      drawFourierHarmonicLegend(ctx, box, item.harmonics);
      item.harmonics.forEach((harmonic) => {
        const color = FOURIER_HARMONIC_COLORS[harmonic] || THEME.axisText;
        const yValue = (result: GridModelResult) => item.harmonicValues!(result, harmonic);
        collectFourierPointHits(box, xlim, ylim, allPoints, item.xValue, yValue);
        drawFourierPoints(ctx, box, xlim, ylim, gridPoints, item.xValue, yValue, colorWithAlpha(color, 0.28), 1.8);
        drawFourierSeriesPath(
          ctx,
          box,
          xlim,
          ylim,
          buildFourierSeries(path, item.xValue, yValue, Boolean(item.yPhase)),
          1.45,
          colorWithAlpha(color, 0.72)
        );
        drawFourierPoints(ctx, box, xlim, ylim, path, item.xValue, yValue, colorWithAlpha(color, 0.76), 2.2);
        const highlighted = gridState.heldResult || gridState.hoverResult;
        if (highlighted?.fourier && highlighted !== currentFourier) {
          drawFourierPoints(ctx, box, xlim, ylim, [highlighted], item.xValue, yValue, colorWithAlpha(color, 0.96), 4.5);
        }
        if (currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [currentFourier], item.xValue, yValue, colorWithAlpha(color, 1), 5.2);
      });
      return;
    }

    if (!item.yValue) return;
    collectFourierPointHits(box, xlim, ylim, allPoints, item.xValue, item.yValue);
    drawFourierPoints(ctx, box, xlim, ylim, gridPoints, item.xValue, item.yValue, "rgba(190, 200, 216, 0.24)", 2.1);
    drawFourierSeriesPath(
      ctx,
      box,
      xlim,
      ylim,
      buildFourierSeries(path, item.xValue, item.yValue, Boolean(item.yPhase)),
      1.9,
      (point) => point.result ? gridResultColor(point.result, 0.62) : colorWithAlpha(PHASE_MARKER_COLOR, 0.58)
    );
    drawFourierPoints(ctx, box, xlim, ylim, path, item.xValue, item.yValue, (result) => gridResultColor(result, 0.78), 2.9);
    const highlighted = gridState.heldResult || gridState.hoverResult;
    if (highlighted?.fourier && highlighted !== currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [highlighted], item.xValue, item.yValue, (result) => gridResultColor(result, 0.98), 5.4);
    if (currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [currentFourier], item.xValue, item.yValue, (result) => gridResultColor(result, 0.98), 6.2);
  });

  canvas.dataset.fourierHitCount = String(fourierPointHits.length);
  drawGridColorbar(ctx, {
    left: rect.width - 184,
    top: 4,
    width: 170,
    height: 36
  });

  const firstHit = fourierPointHits.find((hit) => !colorbarRegionAt("fourierCanvas", hit)) ?? fourierPointHits[0];
  if (firstHit) canvas.dataset.firstFourierHit = `${firstHit.x.toFixed(1)},${firstHit.y.toFixed(1)}`;
}

function fourierPhiK1(result: GridModelResult, harmonic: number): number {
  return result.fourier?.phiK1[harmonic] ?? NaN;
}

function fourierPanelXValues(
  panel: FourierPanelSpec,
  points: GridModelResult[],
  reference: FourierSeriesPoint[]
): number[] {
  return [
    ...points.map(panel.xValue),
    ...reference.map((point) => point.x)
  ].filter(Number.isFinite);
}

function fourierPanelYValues(
  panel: FourierPanelSpec,
  points: GridModelResult[],
  path: GridModelResult[],
  reference: FourierSeriesPoint[]
): number[] {
  const values: number[] = [];
  if (panel.harmonics?.length && panel.harmonicValues) {
    panel.harmonics.forEach((harmonic) => {
      const yValue = (result: GridModelResult) => panel.harmonicValues!(result, harmonic);
      values.push(...points.map(yValue));
      if (panel.yPhase) values.push(...buildFourierSeries(path, panel.xValue, yValue, true).map((point) => point.y));
    });
  } else if (panel.yValue) {
    values.push(...points.map(panel.yValue));
    if (panel.yPhase) values.push(...buildFourierSeries(path, panel.xValue, panel.yValue, true).map((point) => point.y));
  }
  values.push(...reference.map((point) => point.y));
  return values.filter(Number.isFinite);
}

function phaseRange(values: number[], allowUnwrapped: boolean): NumericRange {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 2 * Math.PI];
  const min = allowUnwrapped ? Math.min(0, ...finite) : 0;
  const max = allowUnwrapped ? Math.max(2 * Math.PI, ...finite) : 2 * Math.PI;
  const step = Math.PI / 2;
  const lower = allowUnwrapped ? Math.floor(min / step) * step : 0;
  return [lower, Math.max(2 * Math.PI, Math.ceil(max / step) * step)];
}

function phaseTickLabel(value: number): string {
  const halfPi = Math.PI / 2;
  const rounded = Math.round(value / halfPi);
  const wrapped = ((rounded % 4) + 4) % 4;
  if (rounded === 0) return "0";
  if (wrapped === 0) return "2π";
  if (wrapped === 1) return "π/2";
  if (wrapped === 2) return "π";
  return "3π/2";
}

function axisTickValues(lim: NumericRange, phase = false): number[] {
  if (!phase) {
    return Array.from({ length: 5 }, (_value, index) => lim[0] + ((lim[1] - lim[0]) * index) / 4);
  }
  const step = Math.PI / 2;
  const first = Math.ceil(lim[0] / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= lim[1] + step * 0.1; value += step) ticks.push(value);
  return ticks;
}

function skewnessAtPeriod(points: GridModelResult[], period: number): number | null {
  const sorted = points
    .filter((point) => point.fourier && Number.isFinite(point.period) && Number.isFinite(point.fourier.skewness))
    .sort((a, b) => a.period - b.period);
  if (!sorted.length) return null;
  if (period <= sorted[0].period) return sorted[0].fourier!.skewness;
  const last = sorted[sorted.length - 1];
  if (period >= last.period) return last.fourier!.skewness;
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1];
    const right = sorted[index];
    if (period <= right.period) {
      const span = right.period - left.period || 1;
      const t = (period - left.period) / span;
      return left.fourier!.skewness + (right.fourier!.skewness - left.fourier!.skewness) * t;
    }
  }
  return null;
}

function drawFourierAxes(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  xlabel: string,
  ylabelX: number,
  options: { xPhase?: boolean; yPhase?: boolean; upperSkewnessAxis?: GridModelResult[] | null } = {}
): void {
  ctx.save();
  ctx.strokeStyle = THEME.axisGrid;
  ctx.lineWidth = 1;
  ctx.fillStyle = THEME.axisText;
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  axisTickValues(xlim, Boolean(options.xPhase)).forEach((value) => {
    const x = plot.left + ((value - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
    if (!Number.isFinite(x)) return;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.fillText(options.xPhase ? phaseTickLabel(value) : fmt(value, 2), x, plot.top + plot.height + 8);
  });

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  axisTickValues(ylim, Boolean(options.yPhase)).forEach((value) => {
    const y = plot.top + plot.height - ((value - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
    if (!Number.isFinite(y)) return;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.fillText(options.yPhase ? phaseTickLabel(value) : fmt(value, 2), plot.left - PLOT_LAYOUT.yTickGap, y);
  });

  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

  if (options.upperSkewnessAxis?.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = THEME.axisText;
    axisTickValues(xlim, false).forEach((period) => {
      const skewness = skewnessAtPeriod(options.upperSkewnessAxis || [], period);
      if (skewness === null) return;
      const x = plot.left + ((period - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
      ctx.fillText(fmt(skewness, 2), x, plot.top - 10);
    });
    ctx.font = "700 10px Inter, sans-serif";
    ctx.fillText("S_k", plot.left + plot.width / 2, plot.top - 26);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillStyle = THEME.axisText;
  ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
  ctx.restore();

  void ylabelX;
}

function buildFourierSeries(
  points: GridModelResult[],
  xValue: FourierValueAccessor,
  yValue: FourierValueAccessor,
  unwrapY: boolean
): FourierSeriesPoint[] {
  let previous: number | null = null;
  return points.map((result) => {
    const x = xValue(result);
    let y = yValue(result);
    if (unwrapY && Number.isFinite(y)) {
      if (previous !== null) {
        while (y - previous > Math.PI) y -= 2 * Math.PI;
        while (previous - y > Math.PI) y += 2 * Math.PI;
      }
      previous = y;
    }
    return { x, y, result };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function buildAdiabaticFourierReference(parameters: ModelParameters): FourierSeriesPoint[] {
  const reference: FourierSeriesPoint[] = [];
  const adiabaticParameters = { ...parameters, gammac: 0, zetac: 0, cq: 0 };
  for (let index = 0; index <= 28; index += 1) {
    const amplitude = 0.015 + (index / 28) * 0.42;
    const rows: Row[] = Array.from({ length: 360 }, (_value, sampleIndex) => {
      const phase = (2 * sampleIndex) / 360;
      const folded = phase % 1;
      const radius = Math.max(0.2, 1 + amplitude * Math.cos(2 * Math.PI * folded));
      const pressure = radius ** (-mAt(radius, parameters) * (parameters.gamma1 - 1));
      return sample(phase, [radius, 0, pressure, 0], adiabaticParameters);
    });
    const fourier = computeFourierParameters(rows);
    if (fourier && Number.isFinite(fourier.phi21) && Number.isFinite(fourier.phi31)) {
      reference.push({ x: fourier.phi21, y: fourier.phi31 });
    }
  }
  return reference;
}

function drawFourierIdentityLine(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange
): void {
  const start = Math.max(xlim[0], ylim[0]);
  const end = Math.min(xlim[1], ylim[1]);
  if (!(end > start)) return;
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.strokeStyle = "rgba(190, 200, 216, 0.46)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx(start), sy(start));
  ctx.lineTo(sx(end), sy(end));
  ctx.stroke();
  ctx.fillStyle = "rgba(190, 200, 216, 0.82)";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("φ31=φ21", plot.left + plot.width - 6, plot.top + 6);
  ctx.restore();
}

function drawAdiabaticFourierReference(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  reference: FourierSeriesPoint[]
): void {
  drawFourierSeriesPath(ctx, plot, xlim, ylim, reference, 1.4, "rgba(255, 255, 255, 0.58)", [5, 5]);
  const point = reference[Math.floor(reference.length * 0.68)];
  if (!point) return;
  const x = plot.left + ((point.x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const y = plot.top + plot.height - ((point.y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.76)";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("adiabatic", x + 6, y - 4);
  ctx.restore();
}

function drawFourierHarmonicLegend(ctx: CanvasRenderingContext2D, plot: PlotBox, harmonics: readonly number[]): void {
  ctx.save();
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const startX = plot.left + 8;
  const maxX = plot.left + plot.width - 8;
  let x = startX;
  let y = plot.top + 9;
  harmonics.forEach((harmonic) => {
    const color = FOURIER_HARMONIC_COLORS[harmonic] || THEME.axisText;
    if (x > startX && x + 40 > maxX) {
      x = startX;
      y += 13;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(`φ${harmonic}1`, x + 16, y);
    x += 44;
  });
  ctx.restore();
}

function collectFourierPointHits(
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  points: GridModelResult[],
  xValue: FourierValueAccessor,
  yValue: FourierValueAccessor
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  points.forEach((result) => {
    const x = sx(xValue(result));
    const y = sy(yValue(result));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    fourierPointHits.push({ result, x, y, radius: 5 });
  });
}

function canvasMathFont(size: number, weight?: string | number): string {
  return `${weight ? `${weight} ` : ""}${size}px Inter, sans-serif`;
}

function canvasMathWidth(
  ctx: CanvasRenderingContext2D,
  fragments: readonly CanvasMathFragment[],
  fontSize = 12,
  subscriptSize = 8,
  weight?: string | number
): number {
  return fragments.reduce((total, fragment) => {
    const fragmentWeight = weight ?? fragment.weight;
    ctx.font = canvasMathFont(fontSize, fragmentWeight);
    const baseWidth = ctx.measureText(fragment.text).width;
    if (!fragment.subscript && !fragment.superscript) return total + baseWidth;
    ctx.font = canvasMathFont(subscriptSize, fragmentWeight);
    const subscriptWidth = fragment.subscript ? ctx.measureText(fragment.subscript).width : 0;
    const superscriptWidth = fragment.superscript ? ctx.measureText(fragment.superscript).width : 0;
    return total + baseWidth + Math.max(subscriptWidth, superscriptWidth) + 1;
  }, 0);
}

function drawCanvasMathFragments(
  ctx: CanvasRenderingContext2D,
  fragments: readonly CanvasMathFragment[],
  x: number,
  y: number,
  options: CanvasMathOptions = {}
): number {
  const fontSize = options.fontSize ?? 12;
  const subscriptSize = options.subscriptSize ?? Math.max(8, Math.round(fontSize * 0.68));
  const align = options.align ?? "center";
  const totalWidth = canvasMathWidth(ctx, fragments, fontSize, subscriptSize, options.weight);
  const start = align === "right" ? -totalWidth : align === "center" ? -totalWidth / 2 : 0;
  ctx.save();
  ctx.translate(x, y);
  if (options.rotate) ctx.rotate(options.rotate);
  let cursor = start;
  const drawText = (text: string, textX: number, textY: number) => {
    if (options.strokeWidth && options.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = options.strokeColor || canvasTextHaloColor();
      ctx.lineWidth = canvasTextHaloWidth(options.strokeWidth);
      ctx.strokeText(text, textX, textY);
    }
    ctx.fillText(text, textX, textY);
  };
  fragments.forEach((fragment) => {
    const fragmentWeight = options.weight ?? fragment.weight;
    ctx.font = canvasMathFont(fontSize, fragmentWeight);
    ctx.fillStyle = fragment.color || options.color || THEME.axisText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    drawText(fragment.text, cursor, 0);
    const baseWidth = ctx.measureText(fragment.text).width;
    cursor += baseWidth;
    if (fragment.subscript || fragment.superscript) {
      ctx.font = canvasMathFont(subscriptSize, fragmentWeight);
      const scriptX = cursor + 1;
      const subscriptWidth = fragment.subscript ? ctx.measureText(fragment.subscript).width : 0;
      const superscriptWidth = fragment.superscript ? ctx.measureText(fragment.superscript).width : 0;
      if (fragment.superscript) {
        ctx.textBaseline = "alphabetic";
        drawText(fragment.superscript, scriptX, -fontSize * 0.28);
      }
      if (fragment.subscript) {
        ctx.textBaseline = "alphabetic";
        drawText(fragment.subscript, scriptX, fontSize * 0.42);
      }
      cursor += Math.max(subscriptWidth, superscriptWidth) + 1;
    }
  });
  ctx.restore();
  return totalWidth;
}

function drawFourierAxisLabel(
  ctx: CanvasRenderingContext2D,
  label: FourierAxisLabel,
  x: number,
  y: number
): void {
  const base = label.base === "phi" ? "φ" : label.base;
  drawCanvasMathFragments(ctx, [{ text: base, subscript: label.subscript }], x, y, { rotate: -Math.PI / 2, weight: 700 });
}

function drawStabilityLinearizedLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gammac: number
): void {
  ctx.save();
  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const prefix = "linearized at ";
  ctx.fillText(prefix, x, y);
  const prefixWidth = ctx.measureText(prefix).width;
  ctx.restore();
  drawCanvasMathFragments(
    ctx,
    [
      { text: "γ", subscript: "c", color: COLORS.gammac, weight: 600 },
      { text: ` = ${fmt(gammac, 2)}` }
    ],
    x + prefixWidth,
    y,
    { align: "left" }
  );
}

function updateStabilityLinearizedHeader(gammac: number): void {
  const note = document.getElementById("stabilityLinearizedHeader");
  if (!note) return;
  note.textContent = `linearized at \u03b3c = ${fmt(gammac, 2)}`;
}

function drawFourierSeriesPath(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  points: FourierSeriesPoint[],
  width: number,
  color: string | ((point: FourierSeriesPoint) => string),
  dash: number[] = []
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
  ctx.setLineDash(dash);
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const x0 = sx(previous.x);
    const y0 = sy(previous.y);
    const x1 = sx(current.x);
    const y1 = sy(current.y);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    ctx.strokeStyle = typeof color === "function" ? color(current) : color;
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
  xValue: FourierValueAccessor,
  yValue: FourierValueAccessor,
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
    const x = sx(xValue(point));
    const y = sy(yValue(point));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.fillStyle = typeof color === "function" ? color(point) : color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.restore();
}

function stabilityDisplayParameters(): ModelParameters {
  return currentGridResult()?.parameters || state;
}

function stabilityOverlayResults(): GridModelResult[] {
  if (!gridState.enabled) return [];
  return gridState.results.filter((result) =>
    Number.isFinite(result.parameters.zeta)
    && Number.isFinite(result.parameters.zetac)
    && Number.isFinite(result.parameters.gammac)
  );
}

function responseLogValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return RESPONSE_LOG_MIN;
  return clamp(Math.log10(value), RESPONSE_LOG_MIN, RESPONSE_LOG_MAX);
}

function stabilityCacheKey(parameters: ModelParameters): string {
  const physicsMode = analyticStabilityConditions(parameters).physicsMode;
  return [
    RESPONSE_LOG_MIN,
    RESPONSE_LOG_MAX,
    physicsMode,
    parameters.gammac.toFixed(3),
    parameters.n.toFixed(3),
    parameters.s.toFixed(3),
    parameters.m.toFixed(3),
    parameters.gamma1.toFixed(3),
    parameters.sourceExp.toFixed(3),
    parameters.cq.toFixed(3),
    String(parameters.variableM)
  ].join("|");
}

function stabilityKindsForMap(parameters: ModelParameters): StabilityKind[] {
  const key = stabilityCacheKey(parameters);
  const cached = stabilityMapCache.get(key);
  if (cached) return cached;
  const kinds: StabilityKind[] = [];
  const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
  const radiativeMode = analyticStabilityConditions(parameters).physicsMode === "radiative";
  for (let row = 0; row < STABILITY_MAP_RESOLUTION; row += 1) {
    const zeta = 10 ** (RESPONSE_LOG_MIN + ((row + 0.5) / STABILITY_MAP_RESOLUTION) * span);
    for (let column = 0; column < STABILITY_MAP_RESOLUTION; column += 1) {
      const zetac = radiativeMode ? 0 : 10 ** (RESPONSE_LOG_MIN + ((column + 0.5) / STABILITY_MAP_RESOLUTION) * span);
      kinds.push(analyticStabilityConditions({ ...parameters, zeta, zetac }).kind);
    }
  }
  if (stabilityMapCache.size > 24) stabilityMapCache.clear();
  stabilityMapCache.set(key, kinds);
  return kinds;
}

function instabilityStripCacheKey(parameters: ModelParameters): string {
  return [
    INSTABILITY_STRIP_X_RESOLUTION,
    INSTABILITY_STRIP_Y_RESOLUTION,
    parameters.zetac <= 0 ? "radiative" : "convective",
    parameters.zeta.toFixed(4),
    parameters.n.toFixed(3),
    parameters.s.toFixed(3),
    parameters.m.toFixed(3),
    parameters.gamma1.toFixed(3),
    parameters.sourceExp.toFixed(3),
    parameters.cq.toFixed(3),
    String(parameters.variableM)
  ].join("|");
}

function emptyStabilityCounts(): Record<StabilityKind, number> {
  return {
    stable: 0,
    convective: 0,
    secular: 0,
    pulsational: 0,
    dynamic: 0,
    neutral: 0
  };
}

function instabilityKindsForStrip(parameters: ModelParameters): { kinds: StabilityKind[]; counts: Record<StabilityKind, number>; signature: string } {
  const key = instabilityStripCacheKey(parameters);
  const cached = instabilityStripCache.get(key);
  if (cached) return cached;
  const kinds: StabilityKind[] = [];
  const counts = emptyStabilityCounts();
  const zeta = Math.max(1e-6, parameters.zeta);
  const radiativeMode = parameters.zetac <= 0;
  for (let row = 0; row < INSTABILITY_STRIP_Y_RESOLUTION; row += 1) {
    const gammac = (row + 0.5) / INSTABILITY_STRIP_Y_RESOLUTION;
    for (let column = 0; column < INSTABILITY_STRIP_X_RESOLUTION; column += 1) {
      const x = (column + 0.5) / INSTABILITY_STRIP_X_RESOLUTION;
      const logRatio = STRIP_LOG_RATIO_MIN + x * (STRIP_LOG_RATIO_MAX - STRIP_LOG_RATIO_MIN);
      const zetac = radiativeMode ? 0 : zeta * 10 ** logRatio;
      const kind = analyticStabilityConditions({ ...parameters, zeta, zetac, gammac }).kind;
      counts[kind] += 1;
      kinds.push(kind);
    }
  }
  const signature = [
    key,
    counts.stable,
    counts.convective,
    counts.secular,
    counts.dynamic,
    counts.pulsational,
    counts.neutral
  ].join("|");
  const result = { kinds, counts, signature };
  if (instabilityStripCache.size > 24) instabilityStripCache.clear();
  instabilityStripCache.set(key, result);
  return result;
}

function stabilityKindColor(kind: StabilityKind, alpha = 1): string {
  const colors: Record<StabilityKind, [number, number, number]> = {
    stable: [69, 137, 118],
    convective: [61, 147, 196],
    secular: [155, 113, 217],
    pulsational: [184, 82, 94],
    dynamic: [216, 155, 65],
    neutral: [132, 146, 170]
  };
  const [r, g, b] = colors[kind];
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function stabilityKindAlpha(kind: StabilityKind): number {
  if (kind === "stable") return 0.5;
  if (kind === "neutral") return 0.22;
  return 0.6;
}

function linearStabilityLegendItems(physicsMode: StabilityPhysicsMode): Array<{ label: string; color: string }> {
  const items = [
    { label: "damping", color: stabilityKindColor("stable", 0.75) },
    { label: "secular", color: stabilityKindColor("secular", 0.82) },
    { label: "dynamic", color: stabilityKindColor("dynamic", 0.82) },
    { label: "pulsational", color: stabilityKindColor("pulsational", 0.82) }
  ];
  if (physicsMode === "convective") {
    items.splice(1, 0, { label: "conv/turb", color: stabilityKindColor("convective", 0.82) });
  }
  return items;
}

function linearStabilityLegendLabel(physicsMode: StabilityPhysicsMode): string {
  const labels = ["linear damping"];
  if (physicsMode === "convective") labels.push("convective/turbulent instability");
  labels.push("secular instability", "dynamic instability", "pulsational instability");
  return labels.join(",");
}

function stabilityCountsLabel(counts: Record<StabilityKind, number>, physicsMode: StabilityPhysicsMode): string {
  const parts = [`stable:${counts.stable}`];
  if (physicsMode === "convective") parts.push(`convective:${counts.convective}`);
  parts.push(
    `secular:${counts.secular}`,
    `dynamic:${counts.dynamic}`,
    `pulsational:${counts.pulsational}`,
    `neutral:${counts.neutral}`
  );
  return parts.join(",");
}

function drawReferenceMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 4
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = canvasMarkerOutlineColor();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawStabilityOverlays(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  current: ModelParameters,
  overlays: readonly GridModelResult[]
): void {
  const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
  const sx = (zetac: number) => plot.left + ((responseLogValue(zetac) - RESPONSE_LOG_MIN) / span) * plot.width;
  const sy = (zeta: number) => plot.top + plot.height - ((responseLogValue(zeta) - RESPONSE_LOG_MIN) / span) * plot.height;
  const path = gridPathResults();
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  overlays.forEach((result) => {
    drawReferenceMarker(ctx, sx(result.parameters.zetac), sy(result.parameters.zeta), "rgba(220, 228, 244, 0.32)", 2.3);
  });
  if (path.length > 1) {
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < path.length; i += 1) {
      ctx.strokeStyle = gridResultColor(path[i], 0.74);
      ctx.beginPath();
      ctx.moveTo(sx(path[i - 1].parameters.zetac), sy(path[i - 1].parameters.zeta));
      ctx.lineTo(sx(path[i].parameters.zetac), sy(path[i].parameters.zeta));
      ctx.stroke();
    }
  }
  ctx.restore();
  if (paperModeActive() && gridState.enabled) return;
  const highlighted = gridState.heldResult || gridState.hoverResult || currentGridResult();
  if (highlighted) drawReferenceMarker(ctx, sx(highlighted.parameters.zetac), sy(highlighted.parameters.zeta), gridResultColor(highlighted, 1), 6);
  else drawReferenceMarker(ctx, sx(current.zetac), sy(current.zeta), COLORS.gammac, 6);
}

function responseTickLabel(logValue: number): string {
  return controlValueLabel("zeta", 10 ** logValue);
}

function drawLogResponseAxes(
  ctx: CanvasRenderingContext2D,
  plot: { left: number; top: number; width: number; height: number }
): void {
  const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
  const position = (logValue: number) => (logValue - RESPONSE_LOG_MIN) / span;
  ctx.strokeStyle = THEME.axisGrid;
  ctx.lineWidth = 1;
  ctx.fillStyle = THEME.axisText;
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let logValue = RESPONSE_LOG_MIN; logValue <= RESPONSE_LOG_MAX + 1e-9; logValue += 1) {
    const x = plot.left + position(logValue) * plot.width;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.fillText(responseTickLabel(logValue), x, plot.top + plot.height + 8);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let logValue = RESPONSE_LOG_MIN; logValue <= RESPONSE_LOG_MAX + 1e-9; logValue += 1) {
    const y = plot.top + plot.height - position(logValue) * plot.height;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.fillText(responseTickLabel(logValue), plot.left - PLOT_LAYOUT.yTickGap, y);
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
}

function drawReferenceLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  items: Array<{ label: string; color: string }>,
  options: { maxX?: number; lineHeight?: number; fontSize?: number; swatchSize?: number; labelGap?: number; itemGap?: number } = {}
): void {
  ctx.save();
  const fontSize = options.fontSize ?? 11;
  const swatchSize = options.swatchSize ?? 10;
  const labelGap = options.labelGap ?? 14;
  const itemGap = options.itemGap ?? 14;
  ctx.font = `${fontSize}px Inter, sans-serif`;
  ctx.textBaseline = "middle";
  let cursor = x;
  let rowY = y;
  const maxX = options.maxX ?? Infinity;
  const lineHeight = options.lineHeight ?? Math.max(12, fontSize + 3);
  items.forEach((item) => {
    const itemWidth = swatchSize + labelGap + ctx.measureText(item.label).width + itemGap;
    if (cursor > x && cursor + itemWidth > maxX) {
      cursor = x;
      rowY += lineHeight;
    }
    ctx.fillStyle = item.color;
    ctx.fillRect(cursor, rowY - swatchSize / 2, swatchSize, swatchSize);
    ctx.fillStyle = THEME.axisText;
    ctx.textAlign = "left";
    ctx.fillText(item.label, cursor + swatchSize + labelGap, rowY);
    cursor += itemWidth;
  });
  ctx.restore();
}

function drawStabilityMap(): void {
  const canvas = document.getElementById("stabilityMapCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) {
    referencePlotRenderStates.delete("stabilityMapCanvas");
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 540);
  const height = Math.max(290, rect.height || 310);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const parameters = stabilityDisplayParameters();
  const overlays = stabilityOverlayResults();
  const stabilityPhysics = analyticStabilityConditions(parameters).physicsMode;
  const kinds = stabilityKindsForMap(parameters);
  const plot = { left: 58, top: 34, width: width - 78, height: height - 88 };
  fillPlotAreaBackground(ctx, plot);
  const cellWidth = plot.width / STABILITY_MAP_RESOLUTION;
  const cellHeight = plot.height / STABILITY_MAP_RESOLUTION;
  referencePlotRenderStates.set("stabilityMapCanvas", {
    plot,
    xlim: [RESPONSE_LOG_MIN, RESPONSE_LOG_MAX],
    ylim: [RESPONSE_LOG_MIN, RESPONSE_LOG_MAX],
    width,
    height
  });

  canvas.dataset.stabilityMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.stabilityGamma = fmtFixed(parameters.gammac, 3);
  canvas.dataset.stabilityPhysics = stabilityPhysics;
  canvas.dataset.stabilityScale = "log10";
  canvas.dataset.stabilityRange = `${controlValueLabel("zeta", 10 ** RESPONSE_LOG_MIN)},${controlValueLabel("zeta", 10 ** RESPONSE_LOG_MAX)}`;
  canvas.dataset.stabilityLegend = linearStabilityLegendLabel(stabilityPhysics);
  canvas.dataset.editableParameters = "zetac,zeta";
  canvas.dataset.stellingwerfLabels = "zeta,zeta_c,gamma_c";
  canvas.dataset.axisLabels = "log10 convective response zeta_c,log10 thermal response zeta";

  kinds.forEach((kind, index) => {
    const row = Math.floor(index / STABILITY_MAP_RESOLUTION);
    const column = index % STABILITY_MAP_RESOLUTION;
    ctx.fillStyle = stabilityKindColor(kind, stabilityKindAlpha(kind));
    ctx.fillRect(plot.left + column * cellWidth, plot.top + plot.height - (row + 1) * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
  });

  drawLogResponseAxes(ctx, plot);
  drawCanvasMathFragments(
    ctx,
    [
      { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
      { text: " " },
      { text: "convective response ", color: COLORS.zetac, weight: 600 },
      { text: "ζ", subscript: "c", color: COLORS.zetac, weight: 600 }
    ],
    plot.left + plot.width / 2,
    plot.top + plot.height + 42,
    { weight: 700 }
  );
  drawCanvasMathFragments(
    ctx,
    [
      { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
      { text: " " },
      { text: "thermal response ", color: COLORS.zeta, weight: 600 },
      { text: "ζ", color: COLORS.zeta, weight: 600 }
    ],
    10,
    plot.top + plot.height / 2,
    { rotate: -Math.PI / 2, fontSize: 11, weight: 700 }
  );
  updateStabilityLinearizedHeader(parameters.gammac);
  drawReferenceLegend(ctx, plot.left + 4, 15, linearStabilityLegendItems(stabilityPhysics), { maxX: plot.left + plot.width - 4, fontSize: 10.5, swatchSize: 9, labelGap: 5, itemGap: 10, lineHeight: 12 });
  drawStabilityOverlays(ctx, plot, parameters, overlays);
}

function drawDashedCurve(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>
): void {
  ctx.save();
  ctx.setLineDash([8, 5]);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = "rgba(240, 246, 252, 0.82)";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

function effectiveTemperatureProxy(row: Row): number | null {
  if (!Number.isFinite(row.L) || !Number.isFinite(row.R) || row.L <= 0 || row.R <= 0) return null;
  const value = (row.L / (row.R * row.R)) ** 0.25;
  return Number.isFinite(value) ? value : null;
}

function drawCepheidGuide(): void {
  const canvas = document.getElementById("cepheidGuideCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) {
    referencePlotRenderStates.delete("cepheidGuideCanvas");
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 540);
  const height = Math.max(290, rect.height || 310);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  const plot = { left: 64, top: 28, width: width - 90, height: height - 88 };
  fillPlotAreaBackground(ctx, plot);
  const sx = (x: number) => plot.left + clamp(x, 0, 1) * plot.width;
  const sy = (gamma: number) => plot.top + plot.height - clamp(gamma, 0, 1) * plot.height;
  referencePlotRenderStates.set("cepheidGuideCanvas", { plot, xlim: [0, 1], ylim: [0, 1], width, height });

  canvas.dataset.cepheidMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.instabilityMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.xAxisLabel = "log10(zetac/zeta) convective/thermal response";
  canvas.dataset.xAxisDirection = "redward-right";
  canvas.dataset.editableParameters = "zetac,gammac";
  canvas.dataset.stellingwerfLabels = "gamma_c,log10_zeta_c_over_zeta";
  canvas.dataset.axisLabels = "log10(zeta_c/zeta) convective/thermal response,convective flux fraction gamma_c";

  const current = currentGridResult();
  const parameters = current?.parameters || state;
  const stripPhysics = analyticStabilityConditions(parameters).physicsMode;
  canvas.dataset.instabilityPhysics = stripPhysics;
  canvas.dataset.instabilityLabels = linearStabilityLegendLabel(stripPhysics);
  canvas.dataset.instabilityLegend = linearStabilityLegendLabel(stripPhysics);
  const stripStability = instabilityKindsForStrip(parameters);
  canvas.dataset.instabilitySignature = stripStability.signature;
  canvas.dataset.instabilityCounts = stabilityCountsLabel(stripStability.counts, stripPhysics);

  const stripCellWidth = plot.width / INSTABILITY_STRIP_X_RESOLUTION;
  const stripCellHeight = plot.height / INSTABILITY_STRIP_Y_RESOLUTION;
  stripStability.kinds.forEach((kind, index) => {
    const row = Math.floor(index / INSTABILITY_STRIP_X_RESOLUTION);
    const column = index % INSTABILITY_STRIP_X_RESOLUTION;
    ctx.fillStyle = stabilityKindColor(kind, stabilityKindAlpha(kind));
    ctx.fillRect(
      plot.left + column * stripCellWidth,
      plot.top + plot.height - (row + 1) * stripCellHeight,
      stripCellWidth + 0.5,
      stripCellHeight + 0.5
    );
  });

  drawAxes(ctx, plot, [STRIP_LOG_RATIO_MIN, STRIP_LOG_RATIO_MAX], [0, 1], "", "", THEME.axisText, THEME.axisText, 12);
  drawReferenceLegend(ctx, plot.left + 8, 15, linearStabilityLegendItems(stripPhysics), { maxX: plot.left + plot.width - 4, fontSize: 10.5, swatchSize: 9, labelGap: 5, itemGap: 10, lineHeight: 12 });
  drawCanvasMathFragments(
    ctx,
    [
      { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
      { text: "(" },
      { text: "ζ", subscript: "c", color: COLORS.zetac, weight: 600 },
      { text: "/" },
      { text: "ζ", color: COLORS.zeta, weight: 600 },
      { text: ") " },
      { text: "convective response", color: COLORS.zetac, weight: 600 },
      { text: "/" },
      { text: "thermal response", color: COLORS.zeta, weight: 600 }
    ],
    plot.left + plot.width / 2,
    plot.top + plot.height + 46,
    { fontSize: 10.5, subscriptSize: 7, weight: 700 }
  );
  ctx.fillStyle = THEME.axisText;
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("blue", sx(0.08), plot.top + plot.height + 25);
  ctx.fillText("red", sx(0.92), plot.top + plot.height + 25);
  drawCanvasMathFragments(
    ctx,
    [
      { text: "convective flux fraction ", color: COLORS.gammac, weight: 600 },
      { text: "γ", subscript: "c", color: COLORS.gammac, weight: 600 }
    ],
    12,
    plot.top + plot.height / 2,
    { rotate: -Math.PI / 2, fontSize: 11, weight: 700 }
  );
  ctx.fillStyle = THEME.axisText;
  ctx.font = "700 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.font = "12px Inter, sans-serif";

  const locus = Array.from({ length: 80 }, (_value, index) => {
    const x = index / 79;
    const gamma = clamp(0.02 + 0.92 * x ** 2.25, 0, 1);
    return { x: sx(x), y: sy(gamma) };
  });
  drawDashedCurve(ctx, locus);

  const overlays = stabilityOverlayResults();
  overlays.forEach((result) => {
    drawReferenceMarker(
      ctx,
      sx(cepheidStripCoordinate(result.parameters)),
      sy(result.parameters.gammac),
      "rgba(220, 228, 244, 0.32)",
      2.3
    );
  });
  const path = gridPathResults();
  if (path.length > 1) {
    ctx.lineWidth = 1.8;
    for (let i = 1; i < path.length; i += 1) {
      ctx.strokeStyle = gridResultColor(path[i], 0.74);
      ctx.beginPath();
      ctx.moveTo(sx(cepheidStripCoordinate(path[i - 1].parameters)), sy(path[i - 1].parameters.gammac));
      ctx.lineTo(sx(cepheidStripCoordinate(path[i].parameters)), sy(path[i].parameters.gammac));
      ctx.stroke();
    }
  }
  const currentMode: DisplayWindowMode = current ? "phase" : latestDisplayWindow.mode;
  delete canvas.dataset.teffPhaseTrack;
  if (paperModeActive()) {
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
  } else if (currentMode === "phase") {
    canvas.dataset.currentPhase = fmtFixed(currentAnimationPhase, 3);
    delete canvas.dataset.currentTime;
  } else {
    canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
    delete canvas.dataset.currentPhase;
  }
  if (!paperModeActive() || !gridState.enabled) {
    drawReferenceMarker(
      ctx,
      sx(cepheidStripCoordinate(parameters)),
      sy(parameters.gammac),
      current ? gridResultColor(current, 1) : COLORS.gammac,
      6
    );
  }
}

function drawPhasePortraitCurve(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  rows: readonly Row[],
  key: PhasePortraitKey,
  color: string,
  dash: number[] = []
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.strokeStyle = colorWithAlpha(color, 0.94);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  rows.forEach((row) => {
    const x = sx(row.R);
    const y = sy(phasePortraitValue(row, key));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPhasePortraitArrow(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  rows: readonly Row[],
  key: PhasePortraitKey,
  color: string,
  fraction: number
): void {
  if (rows.length < 3) return;
  const index = Math.min(rows.length - 2, Math.max(1, Math.floor(fraction * (rows.length - 1))));
  const a = rows[index - 1];
  const b = rows[index + 1];
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const x0 = sx(a.R);
  const y0 = sy(phasePortraitValue(a, key));
  const x1 = sx(b.R);
  const y1 = sy(phasePortraitValue(b, key));
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const x = sx(rows[index].R);
  const y = sy(phasePortraitValue(rows[index], key));
  if (![x, y, angle].every(Number.isFinite)) return;
  ctx.save();
  ctx.fillStyle = colorWithAlpha(color, 0.96);
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function phasePortraitValue(row: Row, key: PhasePortraitKey): number {
  return row[key];
}

function drawPhasePortraitLegend(ctx: CanvasRenderingContext2D, plot: PlotBox): void {
  ctx.save();
  const y = plot.top + plot.height - 14;
  let x = plot.left + 12;
  [
    { fragments: [{ text: "H", color: COLORS.H, weight: 600 }], color: COLORS.H, dash: [] },
    { fragments: [{ text: "U", subscript: "c", color: COLORS.Uc, weight: 600 }], color: COLORS.Uc, dash: [8, 5] }
  ].forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(item.dash);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const labelWidth = drawCanvasMathFragments(ctx, item.fragments, x + 34, y, { align: "left" });
    x += 52 + labelWidth;
  });
  ctx.restore();
}

function drawPhasePortraitCurrentMarkers(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  rows: readonly Row[] = latestPhaseRows
): Row | null {
  const row = rowAtCurrentClosedLoopPosition(rows);
  if (!row) return null;
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  drawReferenceMarker(ctx, sx(row.R), sy(row.H), COLORS.H, 5.6);
  drawReferenceMarker(ctx, sx(row.R), sy(row.Uc), COLORS.Uc, 5.6);
  return row;
}

function drawPhasePortraitPhaseLabel(ctx: CanvasRenderingContext2D, plot: PlotBox): void {
  const label = currentDisplayCoordinateLabel();
  ctx.save();
  ctx.font = "12px Inter, sans-serif";
  const width = ctx.measureText(label).width;
  const x = plot.left + plot.width - width - 30;
  const y = plot.top + 14;
  ctx.fillStyle = themeSurface(0.78);
  ctx.fillRect(x - 21, y - 11, width + 30, 22);
  ctx.fillStyle = PHASE_MARKER_COLOR;
  ctx.strokeStyle = canvasMarkerOutlineColor();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x - 10, y, 4.8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function opacityColor(logOpacity: number, opacityRange: NumericRange, alpha = 1): string {
  const stops = [
    { t: 0, r: 86, g: 105, b: 202 },
    { t: 0.28, r: 51, g: 145, b: 176 },
    { t: 0.54, r: 72, g: 173, b: 128 },
    { t: 0.78, r: 198, g: 171, b: 76 },
    { t: 1, r: 255, g: 220, b: 98 }
  ];
  const t = normalizedInRange(logOpacity, opacityRange);
  let start = stops[0];
  let end = stops[stops.length - 1];
  for (let index = 1; index < stops.length; index += 1) {
    if (t <= stops[index].t) {
      start = stops[index - 1];
      end = stops[index];
      break;
    }
  }
  const span = Math.max(1e-12, end.t - start.t);
  const local = clamp((t - start.t) / span, 0, 1);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * local);
  return `rgba(${channel(start.r, end.r)}, ${channel(start.g, end.g)}, ${channel(start.b, end.b)}, ${clamp(alpha, 0, 1)})`;
}

function opacityContourSegment(
  value: number,
  xlim: NumericRange,
  ylim: NumericRange,
  parameters: ModelParameters
): Array<{ x: number; y: number }> | null {
  const a = -(parameters.n + parameters.s);
  const b = parameters.n;
  const points: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number) => {
    if (!Number.isFinite(x + y)) return;
    if (x < xlim[0] - 1e-9 || x > xlim[1] + 1e-9 || y < ylim[0] - 1e-9 || y > ylim[1] + 1e-9) return;
    if (points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-7)) return;
    points.push({ x: clamp(x, xlim[0], xlim[1]), y: clamp(y, ylim[0], ylim[1]) });
  };
  if (Math.abs(b) > 1e-12) {
    xlim.forEach((x) => push(x, (value - a * x) / b));
  }
  if (Math.abs(a) > 1e-12) {
    ylim.forEach((y) => push((value - b * y) / a, y));
  }
  return points.length >= 2 ? points.slice(0, 2) : null;
}

function drawOpacityContours(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  parameters: ModelParameters,
  opacityRange: NumericRange,
  sx: (x: number) => number,
  sy: (y: number) => number
): void {
  if (!validRange(opacityRange)) return;
  const contourCount = 6;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 9]);
  for (let index = 1; index <= contourCount; index += 1) {
    const fraction = index / (contourCount + 1);
    const value = opacityRange[0] + fraction * (opacityRange[1] - opacityRange[0]);
    const segment = opacityContourSegment(value, xlim, ylim, parameters);
    if (!segment) continue;
    ctx.strokeStyle = opacityColor(value, opacityRange, 0.22);
    ctx.beginPath();
    ctx.moveTo(sx(segment[0].x), sy(segment[0].y));
    ctx.lineTo(sx(segment[1].x), sy(segment[1].y));
    ctx.stroke();
  }
  ctx.restore();
}

function setOpacityColorbarDataset(
  canvas: HTMLCanvasElement,
  opacityRange: NumericRange,
  currentLogOpacity?: number
): void {
  canvas.dataset.opacityColorbar = TP_OPACITY_DATA_LABEL;
  canvas.dataset.opacityPalette = "blue-gold";
  canvas.dataset.opacityRange = `${fmtFixed(opacityRange[0], 3)},${fmtFixed(opacityRange[1], 3)}`;
  if (Number.isFinite(currentLogOpacity)) {
    canvas.dataset.opacityColorbarMarker = "current-phase";
    canvas.dataset.currentOpacity = fmtFixed(currentLogOpacity as number, 3);
  } else {
    delete canvas.dataset.opacityColorbarMarker;
    delete canvas.dataset.currentOpacity;
  }
}

function clearOpacityColorbarDataset(canvas: HTMLCanvasElement): void {
  delete canvas.dataset.opacityColorbar;
  delete canvas.dataset.opacityPalette;
  delete canvas.dataset.opacityRange;
  delete canvas.dataset.opacityColorbarMarker;
  delete canvas.dataset.currentOpacity;
}

function clearThermodynamicGridColorbar(canvas: HTMLCanvasElement): void {
  gridColorbarRegions.delete("tpOpacityCanvas");
  delete canvas.dataset.gridColorbar;
  delete canvas.dataset.gridColorbarKey;
  delete canvas.dataset.gridColorbarHit;
}

function drawOpacityColorbar(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  opacityRange: NumericRange,
  canvas: HTMLCanvasElement,
  currentLogOpacity?: number
): void {
  const labelFragments: CanvasMathFragment[] = [
    { text: "log", subscript: "10", color: THEME.axisText },
    { text: " κ/κ", subscript: "0", color: THEME.axisText, weight: 600 }
  ];
  ctx.save();
  const labelWidth = canvasMathWidth(ctx, labelFragments, 10.5, 7.2);
  ctx.restore();
  const width = Math.min(Math.max(120, labelWidth + 20, plot.width * 0.24), Math.max(96, plot.width - 24));
  const height = 9;
  const left = plot.left + 12;
  const top = plot.top + 12;
  const panelPadX = 7;
  const panelPadTop = 7;
  const panelHeight = 52;
  const gradient = ctx.createLinearGradient(left, top, left + width, top);
  for (let index = 0; index <= 24; index += 1) {
    const fraction = index / 24;
    const value = opacityRange[0] + fraction * (opacityRange[1] - opacityRange[0]);
    gradient.addColorStop(fraction, opacityColor(value, opacityRange, 1));
  }
  ctx.save();
  roundedRectPath(ctx, left - panelPadX, top - panelPadTop, width + panelPadX * 2, panelHeight, 5);
  ctx.fillStyle = floatingCanvasPanelFill(0.92);
  ctx.fill();
  ctx.strokeStyle = floatingCanvasPanelBorder(0.68);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = floatingCanvasPanelBorder(0.78);
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, width, height);
  if (Number.isFinite(currentLogOpacity)) {
    const markerX = left + normalizedInRange(currentLogOpacity as number, opacityRange) * width;
    ctx.strokeStyle = canvasTextHaloColor();
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(markerX, top - 3);
    ctx.lineTo(markerX, top + height + 4);
    ctx.stroke();
    ctx.strokeStyle = PHASE_MARKER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(markerX, top - 3);
    ctx.lineTo(markerX, top + height + 4);
    ctx.stroke();
  }
  ctx.font = "10.5px Inter, sans-serif";
  ctx.fillStyle = THEME.axisText;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(fmt(opacityRange[0], 2), left, top + height + 8);
  ctx.textAlign = "right";
  ctx.fillText(fmt(opacityRange[1], 2), left + width, top + height + 8);
  drawCanvasMathFragments(ctx, labelFragments, left + width / 2, top + height + 27, {
    fontSize: 10.5,
    subscriptSize: 7.2,
    strokeWidth: 0
  });
  ctx.restore();
  setOpacityColorbarDataset(canvas, opacityRange, currentLogOpacity);
}

function drawPaperSeriesMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, marker: string): void {
  const size = 3.2;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  if (marker === "square") ctx.rect(x - size, y - size, size * 2, size * 2);
  else if (marker === "triangle") {
    ctx.moveTo(x, y - size - 0.7);
    ctx.lineTo(x + size + 0.5, y + size);
    ctx.lineTo(x - size - 0.5, y + size);
    ctx.closePath();
  } else if (marker === "diamond") {
    ctx.moveTo(x, y - size - 0.5);
    ctx.lineTo(x + size + 0.5, y);
    ctx.lineTo(x, y + size + 0.5);
    ctx.lineTo(x - size - 0.5, y);
    ctx.closePath();
  } else ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawThermodynamicTrack(
  ctx: CanvasRenderingContext2D,
  points: ThermodynamicPoint[],
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  opacityRange: NumericRange,
  width: number,
  alpha: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  color?: string
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const x0 = sx(previous.logT);
    const y0 = sy(previous.logP);
    const x1 = sx(current.logT);
    const y1 = sy(current.logP);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    if (width >= 2.2 && alpha > 0.7) {
      ctx.strokeStyle = "rgba(1, 4, 9, 0.72)";
      ctx.lineWidth = width + 2.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.strokeStyle = color || opacityColor((previous.logOpacity + current.logOpacity) / 2, opacityRange, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawThermodynamicCurrentMarker(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  opacityRange: NumericRange,
  parameters: ModelParameters,
  currentPoint?: ThermodynamicPoint | null
): void {
  const point = currentPoint === undefined ? currentThermodynamicPoint(parameters) : currentPoint;
  if (!point) return;
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const x = sx(point.logT);
  const y = sy(point.logP);
  if (![x, y].every(Number.isFinite)) return;
  ctx.save();
  ctx.shadowColor = opacityColor(point.logOpacity, opacityRange, 0.65);
  ctx.shadowBlur = paperModeActive() ? 0 : 9;
  ctx.fillStyle = opacityColor(point.logOpacity, opacityRange, 1);
  ctx.strokeStyle = PHASE_MARKER_COLOR;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, 5.8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function currentThermodynamicPoint(parameters: ModelParameters): ThermodynamicPoint | null {
  const row = rowAtCurrentDisplayPosition(latestPhaseRows);
  return row ? thermodynamicPoint(row, parameters) : null;
}

function thermodynamicPlotBox(width: number, height: number): PlotBox {
  return { left: 82, top: 24, width: width - 106, height: height - 88 };
}

function drawThermodynamicAxisLabels(ctx: CanvasRenderingContext2D, plot: PlotBox): void {
  drawCanvasMathFragments(
    ctx,
    [
      { text: "log", subscript: "10", color: THEME.axisText },
      { text: " T/T", subscript: "0", color: PHASE_MARKER_COLOR, weight: 600 }
    ],
    plot.left + plot.width / 2,
    plot.top + plot.height + 42,
    { weight: 700 }
  );
  drawCanvasMathFragments(
    ctx,
    [
      { text: "log", subscript: "10", color: THEME.axisText },
      { text: " P/P", subscript: "0", color: COLORS.H, weight: 600 }
    ],
    22,
    plot.top + plot.height / 2,
    { rotate: -Math.PI / 2, weight: 700 }
  );
}

function drawThermodynamicStaticLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  opacityRange: NumericRange,
  parameters: ModelParameters,
  tracks: readonly ThermodynamicTrackSpec[],
  options: { currentLogOpacity?: number; showOpacityColorbar?: boolean } = {}
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  fillPlotAreaBackground(ctx, plot);
  drawOpacityContours(ctx, plot, xlim, ylim, parameters, opacityRange, sx, sy);
  drawAxes(ctx, plot, xlim, ylim, "", "", THEME.axisText, THEME.axisText, 22);
  tracks.forEach((track) => drawThermodynamicTrack(ctx, track.points, plot, xlim, ylim, opacityRange, track.width, track.alpha, sx, sy, track.color));
  if (options.showOpacityColorbar ?? true) drawOpacityColorbar(ctx, plot, opacityRange, canvas, options.currentLogOpacity);
  canvas.dataset.opacityContours = TP_OPACITY_DATA_LABEL;
  delete canvas.dataset.opacityVectorField;
  drawThermodynamicAxisLabels(ctx, plot);
}

function thermodynamicGridStaticTracks(): ThermodynamicTrackSpec[] {
  if (paperModeActive()) {
    return gridState.results.flatMap((result) => {
      const points = thermodynamicPointsForGridResult(result, TP_OPACITY_PATH_MAX_POINTS);
      return points.length > 1 ? [{ points, width: 1.25, alpha: 0.76, color: gridResultColor(result, 0.76) }] : [];
    });
  }
  const tracks: ThermodynamicTrackSpec[] = [];
  const backgroundStride = Math.max(1, Math.ceil(gridState.results.length / TP_OPACITY_BACKGROUND_MAX_MODELS));
  gridState.results.forEach((result, index) => {
    if (index % backgroundStride !== 0) return;
    const points = thermodynamicPointsForGridResult(result, TP_OPACITY_BACKGROUND_MAX_POINTS);
    if (points.length > 1) tracks.push({ points, width: 0.75, alpha: 0.16, color: gridResultColor(result, 0.16) });
  });
  gridPathResults().forEach((result) => {
    const points = thermodynamicPointsForGridResult(result, TP_OPACITY_PATH_MAX_POINTS);
    if (points.length > 1) tracks.push({ points, width: 1.35, alpha: 0.44, color: gridResultColor(result, 0.44) });
  });
  return tracks;
}

function thermodynamicGridBackdropKey(width: number, height: number, dpr: number, parameters: ModelParameters): string {
  const highlighted = gridState.heldResult || gridState.hoverResult;
  return [
    gridPathResultsCacheKey(),
    width.toFixed(1),
    height.toFixed(1),
    dpr.toFixed(3),
    parameters.n.toFixed(4),
    parameters.s.toFixed(4),
    highlighted?.id ?? "no-highlight"
  ].join("|");
}

function thermodynamicGridBackdrop(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number
): ThermodynamicGridBackdrop | null {
  const key = thermodynamicGridBackdropKey(width, height, dpr, latestPhaseParameters);
  if (thermodynamicGridBackdropCache?.key === key) return thermodynamicGridBackdropCache;

  const plot = thermodynamicPlotBox(width, height);
  const tracks = thermodynamicGridStaticTracks();
  const highlighted = gridState.heldResult || gridState.hoverResult;
  const highlightedPoints = highlighted
    ? thermodynamicPointsForGridResult(highlighted, TP_OPACITY_CURRENT_MAX_POINTS)
    : [];
  const allPoints = [
    ...tracks.flatMap((track) => track.points),
    ...highlightedPoints
  ];
  if (!allPoints.length) {
    thermodynamicGridBackdropCache = null;
    return null;
  }

  const xlim = range([...allPoints.map((point) => point.logT), 0], 0.14);
  const ylim = range([...allPoints.map((point) => point.logP), 0], 0.14);
  const opacityRange = range([...allPoints.map((point) => point.logOpacity), 0], 0.12);
  const cacheCanvas = document.createElement("canvas");
  cacheCanvas.width = Math.floor(width * dpr);
  cacheCanvas.height = Math.floor(height * dpr);
  const cacheCtx = cacheCanvas.getContext("2d");
  if (!cacheCtx) return null;
  cacheCtx.scale(dpr, dpr);
  cacheCtx.clearRect(0, 0, width, height);
  drawThermodynamicStaticLayer(cacheCtx, canvas, plot, xlim, ylim, opacityRange, latestPhaseParameters, tracks, { showOpacityColorbar: false });
  thermodynamicGridBackdropCache = {
    key,
    canvas: cacheCanvas,
    width,
    height,
    dpr,
    plot,
    xlim,
    ylim,
    opacityRange,
    staticTrackCount: tracks.length
  };
  return thermodynamicGridBackdropCache;
}

function drawThermodynamicPanel(): void {
  const canvas = document.getElementById("tpOpacityCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 720);
  const height = Math.max(260, rect.height || 300);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  canvas.dataset.tpOpacityMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.axisLabels = `${TP_TEMPERATURE_DATA_LABEL},${TP_PRESSURE_DATA_LABEL}`;
  canvas.dataset.colorVariable = gridState.enabled ? "grid parameter" : TP_OPACITY_DATA_LABEL;
  if (paperModeActive() || gridState.enabled) {
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
  } else if (latestDisplayWindow.mode === "time") {
    canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
    delete canvas.dataset.currentPhase;
  } else {
    canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
    delete canvas.dataset.currentTime;
  }

  if (gridState.enabled) {
    if (!gridState.results.length) {
      clearOpacityColorbarDataset(canvas);
      clearThermodynamicGridColorbar(canvas);
      delete canvas.dataset.opacityContours;
      delete canvas.dataset.opacityVectorField;
      canvas.dataset.tpOpacityTracks = "0";
      canvas.dataset.tpOpacityRows = "0";
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || gridState.statusText || "phase unavailable");
      return;
    }
    if (paperModeActive()) {
      const tracks = thermodynamicGridStaticTracks();
      const allPoints = tracks.flatMap((track) => track.points);
      if (!allPoints.length) {
        clearOpacityColorbarDataset(canvas);
        clearThermodynamicGridColorbar(canvas);
        canvas.dataset.tpOpacityTracks = "0";
        canvas.dataset.tpOpacityRows = "0";
        drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
        return;
      }
      const plot = thermodynamicPlotBox(width, height);
      const xlim = range([...allPoints.map((point) => point.logT), 0], 0.14);
      const ylim = range([...allPoints.map((point) => point.logP), 0], 0.14);
      const opacityRange = range([...allPoints.map((point) => point.logOpacity), 0], 0.12);
      drawThermodynamicStaticLayer(ctx, canvas, plot, xlim, ylim, opacityRange, latestPhaseParameters, tracks, { showOpacityColorbar: false });
      clearOpacityColorbarDataset(canvas);
      drawGridColorbar(ctx, plot, xlim, ylim, "tpOpacityCanvas");
      canvas.dataset.tpOpacityTracks = String(tracks.length);
      canvas.dataset.tpOpacityRows = String(allPoints.length);
      return;
    }
    const backdrop = thermodynamicGridBackdrop(canvas, width, height, dpr);
    if (!backdrop) {
      clearOpacityColorbarDataset(canvas);
      clearThermodynamicGridColorbar(canvas);
      delete canvas.dataset.opacityContours;
      delete canvas.dataset.opacityVectorField;
      canvas.dataset.tpOpacityTracks = "0";
      canvas.dataset.tpOpacityRows = "0";
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
      return;
    }
    ctx.drawImage(backdrop.canvas, 0, 0, width, height);
    clearOpacityColorbarDataset(canvas);
    canvas.dataset.opacityContours = TP_OPACITY_DATA_LABEL;
    delete canvas.dataset.opacityVectorField;
    drawGridColorbar(ctx, backdrop.plot, backdrop.xlim, backdrop.ylim, "tpOpacityCanvas");
    const sx = (x: number) => backdrop.plot.left + ((x - backdrop.xlim[0]) / (backdrop.xlim[1] - backdrop.xlim[0])) * backdrop.plot.width;
    const sy = (y: number) => backdrop.plot.top + backdrop.plot.height - ((y - backdrop.ylim[0]) / (backdrop.ylim[1] - backdrop.ylim[0])) * backdrop.plot.height;
    let dynamicTrackCount = 0;
    const currentGrid = currentGridResult();
    const highlighted = paperModeActive() ? null : gridState.heldResult || gridState.hoverResult;
    if (highlighted && highlighted !== currentGrid) {
      const points = thermodynamicPointsForGridResult(highlighted, TP_OPACITY_CURRENT_MAX_POINTS);
      if (points.length > 1) {
        drawThermodynamicTrack(ctx, points, backdrop.plot, backdrop.xlim, backdrop.ylim, backdrop.opacityRange, 3.4, 0.92, sx, sy, gridResultColor(highlighted, 0.98));
        dynamicTrackCount += 1;
      }
    }
    const currentPoints = currentGrid ? thermodynamicPointsForGridResult(currentGrid, TP_OPACITY_CURRENT_MAX_POINTS) : [];
    if (!paperModeActive() && currentPoints.length > 1) {
      drawThermodynamicTrack(ctx, currentPoints, backdrop.plot, backdrop.xlim, backdrop.ylim, backdrop.opacityRange, 3.1, 0.98, sx, sy, gridResultColor(currentGrid as GridModelResult, 0.98));
      dynamicTrackCount += 1;
    }
    canvas.dataset.tpOpacityTracks = String(backdrop.staticTrackCount + dynamicTrackCount);
    canvas.dataset.tpOpacityRows = String(currentPoints.length);
    return;
  }

  const loopRows = closedLoopPanelRows(latestPhaseRows);
  clearThermodynamicGridColorbar(canvas);
  const currentPoints = thermodynamicPoints(loopRows, latestPhaseParameters, 1400);
  const tracks: ThermodynamicTrackSpec[] = [];
  if (currentPoints.length > 1) tracks.push({ points: currentPoints, width: 2.8, alpha: 0.98 });

  const allPoints = tracks.flatMap((track) => track.points);
  canvas.dataset.tpOpacityTracks = String(tracks.length);
  canvas.dataset.tpOpacityRows = String(currentPoints.length);
  if (!allPoints.length) {
    clearOpacityColorbarDataset(canvas);
    delete canvas.dataset.opacityContours;
    delete canvas.dataset.opacityVectorField;
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
    return;
  }

  const xlim = range([...allPoints.map((point) => point.logT), 0], 0.14);
  const ylim = range([...allPoints.map((point) => point.logP), 0], 0.14);
  const opacityRange = range([...allPoints.map((point) => point.logOpacity), 0], 0.12);
  const plot = thermodynamicPlotBox(width, height);
  const currentLoopRow = rowAtCurrentClosedLoopPosition(loopRows);
  const currentPoint = currentLoopRow ? thermodynamicPoint(currentLoopRow, latestPhaseParameters) : null;

  drawThermodynamicStaticLayer(ctx, canvas, plot, xlim, ylim, opacityRange, latestPhaseParameters, tracks, {
    currentLogOpacity: paperModeActive() ? undefined : currentPoint?.logOpacity,
    showOpacityColorbar: true
  });
  if (!paperModeActive()) drawThermodynamicCurrentMarker(ctx, plot, xlim, ylim, opacityRange, latestPhaseParameters, currentPoint);
}

function foldedRowsAsTimeRows(rows: readonly Row[], period: number): Row[] {
  return rows.map((row) => ({ ...row, tau: row.tau * period }));
}

function updateLatestPeriodogramData(
  rawRows: readonly Row[],
  displayWindow: DisplayWindow,
  phase: PhaseResult,
  gridResult: GridModelResult | null
): void {
  if (gridResult) {
    latestPeriodogramRows = foldedRowsAsTimeRows(gridResult.phaseRows, gridResult.period);
    latestPeriodogramCutTau = 0;
    latestPeriodogramPeriod = gridResult.period;
    latestPeriodogramWindow = "grid phase window";
    return;
  }

  if (displayWindow.mode === "time") {
    latestPeriodogramRows = [...displayWindow.rows];
    latestPeriodogramCutTau = latestPeriodogramRows[0]?.tau ?? 0;
    latestPeriodogramPeriod = null;
    latestPeriodogramWindow = displayWindow.message || "time window";
    return;
  }

  const cutTau = phase.reference?.startTau ?? phaseWarmupTau(rawRows, state.phaseWarmupTau);
  latestPeriodogramRows = rowsAfterCut(rawRows, cutTau);
  latestPeriodogramCutTau = cutTau;
  latestPeriodogramPeriod = phase.period;
  latestPeriodogramWindow = "post-relaxation";
}

function periodogramPowerLabel(value: number): string {
  if (!Number.isFinite(value)) return "";
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude < 0.01) return value.toExponential(1);
  if (magnitude >= 100) return value.toExponential(1);
  return fmt(value, magnitude < 0.1 ? 3 : 2);
}

const PERIODOGRAM_FREQUENCY_AXIS_LABEL = "frequency (τ⁻¹)";
const PERIODOGRAM_POWER_AXIS_LABEL = "power [(ΔL/L₀)²]";
const PERIODOGRAM_PLOT_LEFT = PLOT_LAYOUT.left + 24;

function drawPeriodogramAxes(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange
): void {
  ctx.save();
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1;
  ctx.fillStyle = THEME.axisText;
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let index = 0; index <= 4; index += 1) {
    const x = plot.left + (plot.width * index) / 4;
    const value = xlim[0] + ((xlim[1] - xlim[0]) * index) / 4;
    ctx.beginPath();
    ctx.moveTo(x, plot.top + plot.height);
    ctx.lineTo(x, plot.top + plot.height + 5);
    ctx.stroke();
    ctx.fillText(fmt(value, 2), x, plot.top + plot.height + 8);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const y = plot.top + (plot.height * index) / 4;
    const value = ylim[1] - ((ylim[1] - ylim[0]) * index) / 4;
    ctx.beginPath();
    ctx.moveTo(plot.left - 5, y);
    ctx.lineTo(plot.left, y);
    ctx.stroke();
    ctx.fillText(periodogramPowerLabel(value), plot.left - PLOT_LAYOUT.yTickGap, y);
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = THEME.axisText;
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText(PERIODOGRAM_FREQUENCY_AXIS_LABEL, plot.left + plot.width / 2, plot.top + plot.height + 42);
  ctx.save();
  ctx.translate(PLOT_LAYOUT.yLabelX, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(PERIODOGRAM_POWER_AXIS_LABEL, 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawPeriodogramHarmonics(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  fundamental: number | null
): number {
  if (!fundamental || !Number.isFinite(fundamental) || fundamental <= 0) return 0;
  const sx = (frequency: number) => plot.left + ((frequency - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  let count = 0;
  for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
    const frequency = harmonic * fundamental;
    if (frequency < xlim[0] || frequency > xlim[1]) continue;
    const x = sx(frequency);
    ctx.save();
    ctx.strokeStyle = harmonic === 1 ? colorWithAlpha(PHASE_MARKER_COLOR, 0.78) : colorWithAlpha(PHASE_MARKER_COLOR, 0.34);
    ctx.lineWidth = harmonic === 1 ? 1.4 : 1;
    ctx.setLineDash(harmonic === 1 ? [] : [3, 5]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.restore();
    if (harmonic === 1) {
      drawCanvasMathFragments(ctx, [{ text: "f", subscript: "0", color: PHASE_MARKER_COLOR, weight: 700 }], x + 5, plot.top + 10, {
        align: "left",
        fontSize: 10.5,
        strokeWidth: 2
      });
    }
    count += 1;
  }
  return count;
}

function drawPeriodogramCurve(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  result: PeriodogramResult,
  xlim: NumericRange,
  ylim: NumericRange
): void {
  const sx = (frequency: number) => plot.left + ((frequency - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (power: number) => plot.top + plot.height - ((power - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const points = result.points.filter((point) =>
    Number.isFinite(point.frequency + point.power)
    && point.frequency >= xlim[0]
    && point.frequency <= xlim[1]
  );
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = sx(point.frequency);
    const y = sy(point.power);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(sx(points.at(-1)!.frequency), sy(0));
  ctx.lineTo(sx(points[0].frequency), sy(0));
  ctx.closePath();
  ctx.fillStyle = colorWithAlpha(COLORS.L, 0.16);
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = sx(point.frequency);
    const y = sy(point.power);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = COLORS.L;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawPeriodogramPanel(): void {
  const canvas = document.getElementById("periodogramCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 720);
  const height = Math.max(260, rect.height || 300);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  canvas.dataset.periodogramQuantity = "delta_L_over_L0";
  canvas.dataset.periodogramWindow = latestPeriodogramWindow;
  canvas.dataset.periodogramCutTau = fmtFixed(latestPeriodogramCutTau, 3);
  canvas.dataset.periodogramNormalization = "amplitude_squared";
  canvas.dataset.periodogramVarianceNormalized = "false";
  canvas.dataset.periodogramMeanRemoved = "false";
  canvas.dataset.periodogramGrid = "none";
  canvas.dataset.periodogramFrequencyUnit = "tau^-1";
  canvas.dataset.periodogramPowerUnit = "(delta_L_over_L0)^2";
  if (latestPeriodogramPeriod) canvas.dataset.periodogramFundamental = fmtFixed(1 / latestPeriodogramPeriod, 6);
  else delete canvas.dataset.periodogramFundamental;

  const result = computePeriodogram(latestPeriodogramRows, {
    quantity: "L",
    periodHint: latestPeriodogramPeriod
  });
  canvas.dataset.periodogramSamples = String(result?.sampleCount ?? 0);
  canvas.dataset.periodogramPointCount = String(result?.points.length ?? 0);
  if (!result) {
    delete canvas.dataset.periodogramPeakFrequency;
    delete canvas.dataset.periodogramPeakPower;
    delete canvas.dataset.periodogramHarmonics;
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "periodogram unavailable");
    return;
  }

  const plot: PlotBox = {
    left: PERIODOGRAM_PLOT_LEFT,
    top: PLOT_LAYOUT.top,
    width: width - PERIODOGRAM_PLOT_LEFT - PLOT_LAYOUT.right,
    height: height - PLOT_LAYOUT.top - PLOT_LAYOUT.bottom
  };
  const maxPower = Math.max(...result.points.map((point) => point.power).filter(Number.isFinite), Number.EPSILON);
  const xlim: NumericRange = [result.minFrequency, result.maxFrequency];
  const ylim: NumericRange = [0, maxPower * 1.08];
  canvas.dataset.axisLabels = `${PERIODOGRAM_FREQUENCY_AXIS_LABEL},${PERIODOGRAM_POWER_AXIS_LABEL}`;
  canvas.dataset.xlim = `${fmtFixed(xlim[0], 4)},${fmtFixed(xlim[1], 4)}`;
  canvas.dataset.ylim = `${fmtFixed(ylim[0], 6)},${fmtFixed(ylim[1], 6)}`;
  canvas.dataset.periodogramPeakFrequency = fmtFixed(result.peak.frequency, 6);
  canvas.dataset.periodogramPeakPower = fmtFixed(result.peak.power, 8);

  fillPlotAreaBackground(ctx, plot);
  drawPeriodogramAxes(ctx, plot, xlim, ylim);
  const harmonicCount = drawPeriodogramHarmonics(ctx, plot, xlim, latestPeriodogramPeriod ? 1 / latestPeriodogramPeriod : null);
  canvas.dataset.periodogramHarmonics = String(harmonicCount);
  drawPeriodogramCurve(ctx, plot, result, xlim, ylim);
}

interface PhaseLagSeriesSpec {
  pair: PhaseLagPair;
  points: PhaseLagPoint[];
  color: string;
  dash: number[];
}

function phaseLagQuantityColor(key: PhaseLagQuantityKey): string {
  switch (key) {
    case "R":
      return COLORS.R;
    case "L":
      return COLORS.L;
    case "V":
      return COLORS.V;
    case "T":
      return PHASE_MARKER_COLOR;
    case "H":
      return COLORS.H;
    case "Uc":
      return COLORS.Uc;
  }
}

function phaseLagQuantityTex(key: PhaseLagQuantityKey): string {
  switch (key) {
    case "R":
      return TEX.R;
    case "L":
      return TEX.L;
    case "V":
      return TEX.V;
    case "T":
      return "\\ozNeutral{T}";
    case "H":
      return TEX.H;
    case "Uc":
      return TEX.Uc;
  }
}

function phaseLagPairLabel(pair: PhaseLagPair): string {
  return `${pair.reference}\u2192${pair.target}`;
}

function phaseLagPairHtmlLabel(pair: PhaseLagPair): string {
  return `\\(${phaseLagQuantityTex(pair.reference)}\\)&rarr;\\(${phaseLagQuantityTex(pair.target)}\\)`;
}

function visiblePhaseLagPairs(): PhaseLagPair[] {
  return PHASE_LAG_PAIRS.filter((pair) => phaseLagPairVisibility[pair.id] !== false);
}

function phaseLagPairDash(pair: PhaseLagPair): number[] {
  const siblingIndex = PHASE_LAG_PAIRS
    .filter((candidate) => candidate.target === pair.target)
    .findIndex((candidate) => candidate.id === pair.id);
  const dashes = [
    [],
    [7, 4],
    [2, 3],
    [9, 3, 2, 3],
    [1, 4]
  ];
  return dashes[Math.max(0, siblingIndex) % dashes.length];
}

function drawPhaseLagPanel(): void {
  const canvas = document.getElementById("phaseLagCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;
  drawPhaseLagLegend();

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 720);
  const height = Math.max(260, rect.height || 300);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const loopRange = currentLoopRange();
  const path = gridPathResults();
  const pairs = visiblePhaseLagPairs();
  canvas.dataset.phaseLagMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.phaseLagPairs = pairs.map(phaseLagPairLabel).join(",");
  canvas.dataset.phaseLagPathCount = String(path.length);
  canvas.dataset.axisLabels = `grid parameter,${PHASE_LAG_AXIS_LABEL}`;
  if (loopRange) canvas.dataset.phaseLagLoopKey = loopRange.key;
  else delete canvas.dataset.phaseLagLoopKey;

  if (!gridState.enabled) {
    drawCanvasMessage(ctx, width, height, "phase lag is available in grid mode");
    return;
  }
  if (!loopRange || !path.length) {
    drawCanvasMessage(ctx, width, height, gridState.statusText || "grid path unavailable");
    return;
  }
  if (!pairs.length) {
    drawCanvasMessage(ctx, width, height, "all phase lag pairs hidden");
    return;
  }

  const series: PhaseLagSeriesSpec[] = pairs
    .map((pair) => ({
      pair,
      points: phaseLagSeriesPoints(path, pair, loopRange.key),
      color: phaseLagQuantityColor(pair.target),
      dash: phaseLagPairDash(pair)
    }))
    .filter((item) => item.points.length > 0);

  if (!series.length) {
    drawCanvasMessage(ctx, width, height, "phase lags unavailable");
    return;
  }

  const plot: PlotBox = { left: 74, top: 24, width: width - 96, height: height - 92 };
  const pointXValues = series.flatMap((item) => item.points.map((point) => point.x));
  const xlim = validRange(sortedRange(loopRange.lowerSliderValue, loopRange.upperSliderValue), 1e-12)
    || range(pointXValues, 0.04);
  const ylim = PHASE_LAG_YLIM;
  fillPlotAreaBackground(ctx, plot);
  drawPhaseLagAxes(ctx, plot, xlim, ylim, loopRange);
  drawPhaseLagSeries(ctx, plot, xlim, ylim, series);
  if (!paperModeActive()) drawPhaseLagCurrentMarker(ctx, plot, xlim, loopRange);
}

function drawPhaseLagAxes(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  loopRange: GridRange
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.strokeStyle = THEME.axisGrid;
  ctx.lineWidth = 1;
  ctx.fillStyle = THEME.axisText;
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  axisTickValues(xlim, false).forEach((value) => {
    const x = sx(value);
    if (!Number.isFinite(x)) return;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.fillText(controlValueLabel(loopRange.key, parameterValueFromSlider(loopRange.key, value)), x, plot.top + plot.height + 8);
  });

  const yTicks = [-0.5, -0.25, 0, 0.25, 0.5];
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  yTicks.forEach((value) => {
    const y = sy(value);
    if (!Number.isFinite(y)) return;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.fillText(fmt(value, 2), plot.left - 16, y);
  });

  const zeroY = sy(0);
  if (Number.isFinite(zeroY)) {
    ctx.strokeStyle = "rgba(240, 246, 252, 0.48)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.left, zeroY);
    ctx.lineTo(plot.left + plot.width, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.restore();

  drawCanvasMathFragments(
    ctx,
    [
      { text: `${controlDefForKey(loopRange.key)?.[2] ?? controlShortLabel(loopRange.key)} `, color: THEME.axisText },
      { text: controlCanvasSymbol(loopRange.key), color: controlColor(loopRange.key), weight: 700 }
    ],
    plot.left + plot.width / 2,
    plot.top + plot.height + 48,
    { weight: 700 }
  );
  drawCanvasMathFragments(
    ctx,
    [
      { text: "phase lag ", color: THEME.axisText },
      { text: "\u0394\u03c6", color: THEME.axisText, weight: 700 }
    ],
    22,
    plot.top + plot.height / 2,
    { rotate: -Math.PI / 2, weight: 700 }
  );
}

function drawPhaseLagSeries(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  series: readonly PhaseLagSeriesSpec[]
): void {
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  series.forEach((item) => {
    ctx.strokeStyle = colorWithAlpha(item.color, 0.92);
    ctx.fillStyle = colorWithAlpha(item.color, 0.96);
    ctx.lineWidth = 2.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(item.dash);
    if (item.points.length > 1) {
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = sx(point.x);
        const y = sy(point.lag);
        if (!Number.isFinite(x + y)) return;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    item.points.forEach((point) => {
      const x = sx(point.x);
      const y = sy(point.lag);
      if (!Number.isFinite(x + y)) return;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.restore();
}

function drawPhaseLagCurrentMarker(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  loopRange: GridRange
): void {
  const current = currentGridResult();
  const xValue = current?.sliderValues[loopRange.key];
  if (!current || xValue === undefined || !Number.isFinite(xValue) || xValue < xlim[0] || xValue > xlim[1]) return;
  const x = plot.left + ((xValue - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.strokeStyle = gridResultColor(current, 0.98);
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, plot.top + plot.height);
  ctx.stroke();
  ctx.restore();
}

function drawPhasePortraitPanel(): void {
  const canvas = document.getElementById("phasePortraitCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(360, rect.width || 900);
  const height = Math.max(300, rect.height || 310);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const loopRows = closedLoopPanelRows(latestPhaseRows);
  canvas.dataset.phasePortraitMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.phasePortraitRows = String(loopRows.length);
  canvas.dataset.stellingwerfLabels = latestDisplayWindow.mode === "time" ? "R,H,U_c,current_time" : "R,H,U_c,current_phase";
  canvas.dataset.axisLabels = "radius R,thermal-pressure state H and convective velocity U_c";
  if (!loopRows.length) {
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
    return;
  }
  if (gridState.enabled) {
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
  } else if (latestDisplayWindow.mode === "time") {
    canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
    delete canvas.dataset.currentPhase;
  } else {
    canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
    delete canvas.dataset.currentTime;
  }

  const rows = downsample(loopRows, 1400, ["R", "H", "Uc"]);
  const scaleRows = stableTimeVisualReferenceRows(rows);
  const xlim = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(scaleRows.map((row) => row.R), 1, 0.045, 0.08)
    : range(rows.map((row) => row.R), 0.08);
  const ylim = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange([...scaleRows.map((row) => row.H), ...scaleRows.map((row) => row.Uc)], 1, 0.05, 0.1)
    : range([...rows.map((row) => row.H), ...rows.map((row) => row.Uc)], 0.1);
  const plot = { left: 78, top: 28, width: width - 102, height: height - 88 };
  fillPlotAreaBackground(ctx, plot);
  drawAxes(ctx, plot, xlim, ylim, "", "state", THEME.axisText, THEME.axisText, 22);
  drawAxisReferenceLines(ctx, plot, xlim, ylim, [{ x: 1 }, { y: 1 }]);
  drawCanvasMathFragments(
    ctx,
    [
      { text: "radius ", color: COLORS.R, weight: 600 },
      { text: "R", color: COLORS.R, weight: 600 }
    ],
    plot.left + plot.width / 2,
    plot.top + plot.height + 42,
    { weight: 700 }
  );
  drawPhasePortraitCurve(ctx, plot, xlim, ylim, rows, "H", COLORS.H);
  drawPhasePortraitCurve(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, [8, 5]);
  drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "H", COLORS.H, 0.18);
  drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "H", COLORS.H, 0.62);
  drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, 0.3);
  drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, 0.74);
  if (!paperModeActive() && !gridState.enabled) drawPhasePortraitCurrentMarkers(ctx, plot, xlim, ylim, rows);
  drawPhasePortraitLegend(ctx, plot);
  if (!paperModeActive() && !gridState.enabled) drawPhasePortraitPhaseLabel(ctx, plot);
}

function drawStellingwerfReferencePanel(): void {
  drawStabilityMap();
  drawCepheidGuide();
  drawPhasePortraitPanel();
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

function drawPhaseLagLegend(): void {
  const node = document.getElementById("phaseLagLegend");
  if (!(node instanceof HTMLElement)) return;
  const signature = JSON.stringify(PHASE_LAG_PAIRS.map((pair) => ({
    id: pair.id,
    visible: phaseLagPairVisibility[pair.id] !== false,
    color: phaseLagQuantityColor(pair.target)
  })));
  if (legendSignatures.get("phaseLagLegend") === signature) {
    updatePhaseLagLegendToggleState(node);
    return;
  }
  legendSignatures.set("phaseLagLegend", signature);
  node.innerHTML = PHASE_LAG_PAIRS
    .map((pair) => {
      const visible = phaseLagPairVisibility[pair.id] !== false;
      const label = phaseLagPairHtmlLabel(pair);
      return `
        <button class="legend-item legend-toggle${visible ? "" : " is-hidden"}" type="button" data-phase-lag-pair="${pair.id}" aria-pressed="${String(visible)}" title="Toggle ${escapeAttribute(phaseLagPairLabel(pair))}" aria-label="Toggle ${escapeAttribute(phaseLagPairLabel(pair))}">
          <span class="swatch" style="--color:${phaseLagQuantityColor(pair.target)}"></span>${label}
        </button>
      `;
    })
    .join("");
  node.querySelectorAll<HTMLButtonElement>("[data-phase-lag-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      const pairId = button.dataset.phaseLagPair as PhaseLagPairId | undefined;
      if (!pairId || !(pairId in phaseLagPairVisibility)) return;
      phaseLagPairVisibility[pairId] = !phaseLagPairVisibility[pairId];
      drawPhaseLagLegend();
      drawPhaseLagPanel();
    });
  });
  queueMathTypeset([node]);
}

function updatePhaseLagLegendToggleState(node: HTMLElement): void {
  node.querySelectorAll<HTMLButtonElement>("[data-phase-lag-pair]").forEach((button) => {
    const pairId = button.dataset.phaseLagPair as PhaseLagPairId | undefined;
    if (!pairId || !(pairId in phaseLagPairVisibility)) return;
    const visible = phaseLagPairVisibility[pairId] !== false;
    button.classList.toggle("is-hidden", !visible);
    button.setAttribute("aria-pressed", String(visible));
  });
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
    minSeparation: guidedMinSeparationFromPeriod(rows, linearDynamicPeriod(state)),
    selection: state.phaseMode === "final" ? "last" : "first",
    anchor: phaseAnchor
  });
}

function shouldUseStableDampingTimeWindow(phase: PhaseResult, stability: AnalyticStabilityResult): boolean {
  return state.phaseMode === "final"
    && stability.pulsational.stable
    && latestResult.message !== "limit_cycle"
    && phase.reason === "ok"
    && Boolean(phase.period)
    && latestResult.message !== "runaway"
    && latestResult.message !== "runaway_trend";
}

function buildCurrentDisplayWindow(
  rows: Row[],
  phase: PhaseResult,
  gridResult: GridModelResult | null,
  stability: AnalyticStabilityResult,
  phaseMessage?: string
): DisplayWindow {
  if (gridResult) {
    return {
      ...buildPhaseDisplayWindow({ ...phase, reason: "ok", rows: gridResult.phaseRows, period: gridResult.period }, phaseMessage),
      reason: "phase"
    };
  }
  if (gridState.enabled) return buildPhaseDisplayWindow(phase, phaseMessage);
  if (isTimeWindowReason(latestResult.message)) {
    return buildTimeDisplayWindow(rows, latestResult.message, timeWindowMessage(latestResult.message));
  }
  if (!gridState.enabled && phase.reason !== "ok") {
    if (stability.allStable) {
      return buildTimeDisplayWindow(rows, "equilibrium", phaseMessage ?? "time window: phase unavailable");
    }
    const message = shouldUseRunawayGrowthWindow(rows, phase)
      ? "time window: runaway growth"
      : "time window: unstable trend";
    return buildTimeDisplayWindow(rows, "runaway", message);
  }
  if (!gridState.enabled && shouldUseStableDampingTimeWindow(phase, stability)) {
    return buildTimeDisplayWindow(rows, "equilibrium", "time window: stable damping");
  }
  return buildPhaseDisplayWindow(phase, phaseMessage);
}

function timeWindowMessage(reason: string): string {
  switch (reason) {
    case "equilibrium":
      return "time window: stable equilibrium";
    case "runaway":
      return "time window: dynamic runaway";
    case "runaway_trend":
      return "time window: runaway trend";
    default:
      return "time window";
  }
}

function syncAnimationPositionToDisplayWindow(): void {
  const end = displayAnimationEnd(latestDisplayWindow);
  if (end <= 0) {
    currentAnimationPhase = 0;
    modelAnimationStartTime = null;
    return;
  }
  const clamped = clamp(currentAnimationPhase, 0, end);
  if (clamped !== currentAnimationPhase) modelAnimationStartTime = null;
  currentAnimationPhase = clamped === end ? 0 : clamped;
}

function displayWindowForRows(rows: readonly Row[]): DisplayWindow {
  return { ...latestDisplayWindow, rows };
}

function foldedPhaseWindowForRows(rows: readonly Row[]): DisplayWindow {
  return { mode: "phase", reason: "phase", rows, xlim: [0, 2], period: null };
}

function rowAtCurrentDisplayPosition(rows: readonly Row[] = latestPhaseRows): Row | null {
  return rowAtDisplayPosition(displayWindowForRows(rows), currentAnimationPhase);
}

function closedLoopPanelRows(rows: readonly Row[] = latestPhaseRows): Row[] {
  if (latestDisplayWindow.mode === "phase") {
    const cycle = phaseWindowRows(rows, 0, 1, true);
    if (cycle.length > 2) return cycle;
  }
  return [...rows];
}

function rowAtCurrentClosedLoopPosition(rows: readonly Row[]): Row | null {
  if (latestDisplayWindow.mode !== "phase") return rowAtCurrentDisplayPosition(rows);
  const cycleWindow: DisplayWindow = {
    mode: "phase",
    reason: "phase",
    rows,
    xlim: [0, 1],
    period: latestDisplayWindow.period
  };
  return rowAtDisplayPosition(cycleWindow, phaseModOne(currentAnimationPhase));
}

function currentDisplayCoordinateLabel(): string {
  if (latestDisplayWindow.mode === "time") {
    return `time τ = ${fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 2)}`;
  }
  return `phase = ${fmtFixed(phaseModOne(currentAnimationPhase), 2)}`;
}

function phaseModOne(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function updatePhaseAnchorControlAvailability(): void {
  const timeMode = latestDisplayWindow.mode === "time";
  document.querySelectorAll<HTMLElement>(".phase-anchor-control").forEach((control) => {
    control.hidden = timeMode;
    control.style.display = timeMode ? "none" : "";
    control.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = timeMode;
    });
  });
}

function timeDomain(rows: readonly Row[]): NumericRange {
  if (!rows.length) return [0, 1];
  const first = rows[0].tau;
  const last = rows[rows.length - 1].tau;
  return first === last ? range([first, last], 0.02) : [first, last];
}

function integrationTimeRange(rows: readonly Row[]): NumericRange {
  const finalTau = rows.at(-1)?.tau;
  const stoppedEarly = state.runUntilStable
    && Number.isFinite(finalTau)
    && finalTau! < state.tEnd - Math.max(1e-9, state.tEnd * 1e-9);
  return [0, Math.max(stoppedEarly ? finalTau! : state.tEnd, Number.EPSILON)];
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

function lightModeInvertedSurfaceRgb(color: RgbColor): RgbColor {
  if (!lightThemeActive()) return color;
  return {
    r: 255 - color.r,
    g: 255 - color.g,
    b: 255 - color.b
  };
}

function physicalSurfaceOutlineColor(alpha = 0.88): string {
  return lightThemeActive()
    ? colorWithAlpha(cssVariable("--line-strong", "#818B98"), alpha)
    : `rgba(240, 245, 255, ${alpha})`;
}

function phaseMarker(): { x: number; color: string } | undefined {
  if (paperModeActive() || gridState.enabled) return undefined;
  return latestPhaseRows.length ? { x: displayMarkerX(latestDisplayWindow, currentAnimationPhase), color: PHASE_MARKER_COLOR } : undefined;
}

function syncPhaseCanvasState(): void {
  PHASE_SCRUB_CANVAS_IDS.forEach((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const scrubEnabled = !paperModeActive() && latestDisplayWindow.mode === "phase" && latestPhaseRows.length > 0 && !gridState.enabled;
    canvas.classList.toggle("phase-scrub-enabled", scrubEnabled);
    if (!scrubEnabled) canvas.classList.remove("phase-scrub-hover");
    canvas.dataset.displayMode = latestDisplayWindow.mode;
    if (paperModeActive() || gridState.enabled) {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
    } else if (latestPhaseRows.length && latestDisplayWindow.mode === "phase") {
      canvas.dataset.currentPhase = fmtFixed(currentAnimationPhase, 3);
      delete canvas.dataset.currentTime;
    } else if (latestPhaseRows.length) {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    } else {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
    }
    if (activePhaseScrub?.canvasId === canvasId) canvas.dataset.phaseScrubbing = "true";
    else delete canvas.dataset.phaseScrubbing;
    if (!gridState.enabled && activePhaseHoverCanvasId === canvasId) canvas.dataset.phaseHovering = "true";
    else delete canvas.dataset.phaseHovering;
  });
  updatePhaseAnchorControlAvailability();
}

type PhaseAnnotationKind = "maxL" | "minL" | "maxR" | "minR" | "maxV" | "minV" | "maxTeff" | "minTeff";

interface PhasePlotAnnotation {
  kind: PhaseAnnotationKind;
  row: Row;
  color: string;
}

function extremaRow(rows: readonly Row[], value: (row: Row) => number | null, pick: "min" | "max"): Row | null {
  let selected: Row | null = null;
  let selectedValue = pick === "min" ? Infinity : -Infinity;
  rows.forEach((row) => {
    const current = value(row);
    if (current === null || !Number.isFinite(current)) return;
    if ((pick === "min" && current < selectedValue) || (pick === "max" && current > selectedValue)) {
      selected = row;
      selectedValue = current;
    }
  });
  return selected;
}

function phaseWindowRows(rows: readonly Row[], lower: number, upper: number, includeUpper: boolean): Row[] {
  return rows.filter((row) =>
    row.tau >= lower
    && (includeUpper ? row.tau <= upper : row.tau < upper)
  );
}

function phasePlotAnnotations(rows: readonly Row[]): PhasePlotAnnotation[] {
  const annotations: PhasePlotAnnotation[] = [];
  const add = (kind: PhaseAnnotationKind, row: Row | null, color: string) => {
    if (row) annotations.push({ kind, row, color });
  };
  [
    phaseWindowRows(rows, 0, 1, false),
    phaseWindowRows(rows, 1, 2, true)
  ].forEach((windowRows) => {
    add("maxL", extremaRow(windowRows, (row) => row.L, "max"), COLORS.L);
    add("minL", extremaRow(windowRows, (row) => row.L, "min"), COLORS.L);
    add("maxR", extremaRow(windowRows, (row) => row.R, "max"), COLORS.R);
    add("minR", extremaRow(windowRows, (row) => row.R, "min"), COLORS.R);
    add("maxV", extremaRow(windowRows, (row) => row.V, "max"), POSITIVE_VELOCITY_COLOR);
    add("minV", extremaRow(windowRows, (row) => row.V, "min"), NEGATIVE_VELOCITY_COLOR);
    add("maxTeff", extremaRow(windowRows, effectiveTemperatureProxy, "max"), PHASE_MARKER_COLOR);
    add("minTeff", extremaRow(windowRows, effectiveTemperatureProxy, "min"), PHASE_MARKER_COLOR);
  });
  return annotations;
}

function drawPhaseAnnotations(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  canvasId: string,
  quantity: "L" | "V"
): void {
  const canvas = document.getElementById(canvasId);
  if (canvas instanceof HTMLCanvasElement) {
    canvas.dataset.annotations = phaseAnnotationsVisible ? "on" : "off";
    canvas.dataset.annotationCount = "0";
  }
  if (!phaseAnnotationsVisible || !latestPhaseRows.length) return;
  const annotations = phasePlotAnnotations(latestPhaseRows);
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  let drawn = 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  annotations.forEach((annotation) => {
    const x = annotation.row.tau;
    const y = annotation.row[quantity];
    if (!Number.isFinite(x + y) || x < xlim[0] || x > xlim[1] || y < ylim[0] || y > ylim[1]) return;
    drawPhaseAnnotationSymbol(ctx, sx(x), sy(y), annotation);
    drawn += 1;
  });
  ctx.restore();
  if (canvas instanceof HTMLCanvasElement) canvas.dataset.annotationCount = String(drawn);
}

function drawPhaseAnnotationSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  annotation: PhasePlotAnnotation
): void {
  ctx.save();
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = canvasMarkerOutlineColor();
  ctx.fillStyle = annotation.color;
  if (annotation.kind === "maxTeff" || annotation.kind === "minTeff") {
    ctx.font = "700 18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const symbol = annotation.kind === "maxTeff" ? "↑" : "↓";
    ctx.strokeStyle = canvasTextHaloColor();
    ctx.lineWidth = canvasTextHaloWidth(2.8);
    ctx.strokeText(symbol, x, y);
    ctx.fillText(symbol, x, y);
  } else if (annotation.kind === "maxR" || annotation.kind === "minR") {
    const size = annotation.kind === "maxR" ? 4.6 : 3.1;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (annotation.kind === "maxV" || annotation.kind === "minV") {
    const size = annotation.kind === "maxV" ? 5.8 : 3.8;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const size = annotation.kind === "maxL" ? 5.8 : 3.4;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPhasePlotOverlays(
  ctx: CanvasRenderingContext2D,
  plot: PlotBox,
  xlim: NumericRange,
  ylim: NumericRange,
  canvasId: string
): void {
  if (canvasId === "lightCanvas") drawPhaseAnnotations(ctx, plot, xlim, ylim, canvasId, "L");
  if (canvasId === "velocityCanvas") drawPhaseAnnotations(ctx, plot, xlim, ylim, canvasId, "V");
  drawGridColorbar(ctx, plot, xlim, ylim, canvasId);
}

function drawPhasePlots(): void {
  updatePhaseAnnotationControls();
  const marker = phaseMarker();
  drawSeries("lightCanvas", gridPhaseSeries("L", COLORS.L, latestPhaseSample), {
    xlabel: latestPhasePeriodLabel,
    ylabel: "luminosity L",
    ylabelColor: COLORS.L,
    xlim: latestDisplayWindow.xlim,
    ylim: latestPhaseSample.length || gridState.results.length ? undefined : [0, 1],
    minimumYlim: [0.99, 1.01],
    message: latestPhaseMessage,
    phaseMarker: marker,
    referenceLines: [{ x: 1 }, { y: 1 }],
    afterDraw: drawPhasePlotOverlays
  });

  drawSeries("velocityCanvas", gridPhaseSeries("V", COLORS.V, latestPhaseSample), {
    xlabel: latestPhasePeriodLabel,
    ylabel: "radial velocity V",
    ylabelColor: COLORS.V,
    xlim: latestDisplayWindow.xlim,
    ylim: latestPhaseSample.length || gridState.results.length ? undefined : [0, 1],
    minimumYlim: [-0.01, 0.01],
    message: latestPhaseMessage,
    phaseMarker: marker,
    referenceLines: [{ x: 1 }, { y: 0 }],
    afterDraw: drawPhasePlotOverlays
  });

  if (sonificationSource === "pressure") {
    drawSeries("pressureCanvas", [
      { label: "P", color: COLORS.H, rows: latestPhaseSample, x: (row) => row.tau, y: (row) => acousticPressureSignal(row, latestPhaseParameters) }
    ], {
      xlabel: latestPhasePeriodLabel,
      ylabel: "pressure",
      ylabelColor: COLORS.H,
      xlim: latestDisplayWindow.xlim,
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

  drawGuideCircle(ctx, centerX, centerY, radiusScale, "rgba(101, 108, 118, 0.42)");

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
  ctx.strokeStyle = canvasTextHaloColor(0.92);
  ctx.lineWidth = canvasTextHaloWidth(4);
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

function drawModelPlainLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 13px Inter, sans-serif";
  ctx.lineJoin = "round";
  ctx.strokeStyle = canvasTextHaloColor(0.92);
  ctx.lineWidth = canvasTextHaloWidth(4);
  ctx.fillStyle = colorWithAlpha(color, 0.98);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
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
    luminositySubscript?: LuminosityLabelSubscript;
  }> = [
    { value: row.Lc, color: COLORS.Lc, luminositySubscript: "c" as const },
    { value: row.L, color: COLORS.L },
    { value: row.Lr, color: COLORS.Lr, luminositySubscript: "r" as const }
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
      undefined,
      arc.luminositySubscript
    );
  });
  ctx.restore();
}

interface HeatEngineTerms {
  q: number;
  pressureForce: number;
  gravityForce: number;
  dampingAcceleration: number;
  acceleration: number;
  pressurePower: number;
  gravityPower: number;
  dampingPower: number;
  mechanicalPower: number;
  source: number;
  radiativeLeak: number;
  convectiveLeak: number;
  heatNet: number;
  convectiveTarget: number;
  convectiveLag: number;
}

interface HeatEngineCycleWork {
  pressure: number;
  gravity: number;
  damping: number;
  net: number;
  mechanicalNet: number;
  pressureDampingRatio: number | null;
}

type HeatEngineWorkScope = "cycle" | "cycles" | "window";

interface HeatEngineEvent {
  kind: "rMin" | "fpMax" | "lMax" | "lrMax" | "lcMax" | "rMax";
  label: readonly CanvasMathFragment[];
  row: Row;
  color: string;
}

type HeatEngineCanvasLabel = string | readonly CanvasMathFragment[];

function pressureSupport(row: Row, parameters: ModelParameters): number {
  if (!Number.isFinite(row.R + row.H) || row.R <= 0) return NaN;
  const { q } = derivedPowers(row.R, parameters);
  const value = row.H / row.R ** q;
  return Number.isFinite(value) ? value : NaN;
}

function convectiveVelocityTarget(row: Row, parameters: ModelParameters): number {
  if (!Number.isFinite(row.R + row.H + row.V) || row.R <= 0) return NaN;
  const { d } = derivedPowers(row.R, parameters);
  const driver = parameters.driver === "h" ? Math.sqrt(Math.max(0, row.H)) : Math.sqrt(Math.abs(row.V));
  const value = row.R ** (-d) * driver;
  return Number.isFinite(value) ? value : NaN;
}

function heatEngineTerms(row: Row, parameters: ModelParameters): HeatEngineTerms | null {
  if (!Number.isFinite(row.R + row.V + row.H + row.Uc) || row.R <= 0 || row.H <= 0) return null;
  const powers = derivedPowers(row.R, parameters);
  const pressureForce = row.H / row.R ** powers.q;
  const gravityForce = 1 / row.R ** 2;
  const dampingAcceleration = -parameters.cq * row.V ** 3;
  const source = baseLuminosity(row, parameters);
  const heatScale = parameters.zeta * row.R ** (powers.m * (parameters.gamma1 - 1));
  const radiativeLeak = row.Lr;
  const convectiveLeak = row.Lc;
  const convectiveTarget = convectiveVelocityTarget(row, parameters);
  const terms = {
    q: powers.q,
    pressureForce,
    gravityForce,
    dampingAcceleration,
    acceleration: pressureForce - gravityForce + dampingAcceleration,
    pressurePower: row.V * pressureForce,
    gravityPower: -row.V * gravityForce,
    dampingPower: -parameters.cq * row.V ** 4,
    mechanicalPower: row.V * (pressureForce - gravityForce + dampingAcceleration),
    source,
    radiativeLeak,
    convectiveLeak,
    heatNet: heatScale * (source - radiativeLeak - convectiveLeak),
    convectiveTarget,
    convectiveLag: convectiveTarget - row.Uc
  };
  return Object.values(terms).every(Number.isFinite) ? terms : null;
}

function heatEngineCycleRows(rows: readonly Row[]): Row[] {
  return closedLoopPanelRows(rows);
}

function radiusExtremaForWork(rows: readonly Row[]): Array<{ index: number; kind: "min" | "max" }> {
  const extrema: Array<{ index: number; kind: "min" | "max" }> = [];
  for (let index = 1; index < rows.length - 1; index += 1) {
    const previous = rows[index - 1].R;
    const current = rows[index].R;
    const next = rows[index + 1].R;
    if (!Number.isFinite(previous + current + next)) continue;
    if (current >= previous && current > next) extrema.push({ index, kind: "max" });
    else if (current <= previous && current < next) extrema.push({ index, kind: "min" });
  }
  return extrema;
}

function radiusExtremaWithEndpointsForWork(rows: readonly Row[]): Array<{ index: number; kind: "min" | "max" }> {
  const extrema = radiusExtremaForWork(rows);
  if (rows.length < 2) return extrema;
  const firstKind = rows[0].R <= rows[1].R ? "min" : "max";
  const lastIndex = rows.length - 1;
  const lastKind = rows[lastIndex].R <= rows[lastIndex - 1].R ? "min" : "max";
  return [
    { index: 0, kind: firstKind },
    ...extrema,
    { index: lastIndex, kind: lastKind }
  ];
}

function completeRadiusCycleRowsForWork(rows: readonly Row[]): Row[] {
  const extrema = radiusExtremaForWork(rows);
  if (extrema.length < 3) return [];
  let best: { start: number; end: number; span: number } | null = null;
  for (let startOrder = 0; startOrder < extrema.length - 2; startOrder += 1) {
    for (let endOrder = extrema.length - 1; endOrder >= startOrder + 2; endOrder -= 1) {
      if (extrema[endOrder].kind !== extrema[startOrder].kind) continue;
      const start = extrema[startOrder].index;
      const end = extrema[endOrder].index;
      const span = end - start;
      if (span > 1 && (!best || span > best.span)) best = { start, end, span };
      break;
    }
  }
  return best ? rows.slice(best.start, best.end + 1) : [];
}

function samePhaseCycleSegmentsForWork(rows: readonly Row[]): Row[][] {
  const extrema = radiusExtremaWithEndpointsForWork(rows);
  const segments: Row[][] = [];
  for (let extremaIndex = 0; extremaIndex < extrema.length - 2; extremaIndex += 2) {
    const start = extrema[extremaIndex];
    const end = extrema[extremaIndex + 2];
    if (start.kind !== end.kind || end.index - start.index < 2) continue;
    segments.push(rows.slice(start.index, end.index + 1));
  }
  return segments;
}

function heatEngineWorkRows(rows: readonly Row[]): { selectedRows: Row[]; integrationRows: Row[]; scope: HeatEngineWorkScope } {
  const selectedRows = heatEngineCycleRows(rows);
  if (latestDisplayWindow.mode !== "time") {
    return { selectedRows, integrationRows: selectedRows, scope: "cycle" };
  }
  const completeCycleRows = completeRadiusCycleRowsForWork(selectedRows);
  if (completeCycleRows.length > 2) {
    return { selectedRows, integrationRows: completeCycleRows, scope: "cycles" };
  }
  return { selectedRows, integrationRows: selectedRows, scope: "window" };
}

function heatEngineWorkIntegral(rows: readonly Row[], parameters: ModelParameters): number {
  let work = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const left = rows[index - 1];
    const right = rows[index];
    const leftForce = pressureSupport(left, parameters);
    const rightForce = pressureSupport(right, parameters);
    const deltaR = right.R - left.R;
    if (!Number.isFinite(leftForce + rightForce + deltaR)) continue;
    work += 0.5 * (leftForce + rightForce) * deltaR;
  }
  return work;
}

function integrateHeatEngineWorkTerms(
  rows: readonly Row[],
  parameters: ModelParameters,
  closePressureLoop: boolean
): Pick<HeatEngineCycleWork, "pressure" | "gravity" | "damping"> {
  let pressure = 0;
  let gravity = 0;
  let damping = 0;
  const phaseTimeScale = latestDisplayWindow.mode === "phase" && latestDisplayWindow.period
    ? latestDisplayWindow.period
    : 1;

  for (let index = 1; index < rows.length; index += 1) {
    const left = rows[index - 1];
    const right = rows[index];
    const leftForce = pressureSupport(left, parameters);
    const rightForce = pressureSupport(right, parameters);
    const deltaR = right.R - left.R;
    if (Number.isFinite(leftForce + rightForce + deltaR)) {
      pressure += 0.5 * (leftForce + rightForce) * deltaR;
    }

    const dt = (right.tau - left.tau) * phaseTimeScale;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    const leftGravityPower = -left.V / left.R ** 2;
    const rightGravityPower = -right.V / right.R ** 2;
    const leftDampingPower = -parameters.cq * left.V ** 4;
    const rightDampingPower = -parameters.cq * right.V ** 4;
    if (Number.isFinite(leftGravityPower + rightGravityPower)) {
      gravity += 0.5 * (leftGravityPower + rightGravityPower) * dt;
    }
    if (Number.isFinite(leftDampingPower + rightDampingPower)) {
      damping += 0.5 * (leftDampingPower + rightDampingPower) * dt;
    }
  }
  if (closePressureLoop && rows.length > 1) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const firstForce = pressureSupport(first, parameters);
    const lastForce = pressureSupport(last, parameters);
    const closingDeltaR = first.R - last.R;
    if (Number.isFinite(firstForce + lastForce + closingDeltaR)) {
      pressure += 0.5 * (firstForce + lastForce) * closingDeltaR;
    }
  }
  return { pressure, gravity, damping };
}

function heatEngineCycleWork(rows: readonly Row[], parameters: ModelParameters): HeatEngineCycleWork {
  const segments = latestDisplayWindow.mode === "time" ? samePhaseCycleSegmentsForWork(rows) : [];
  const workSegments = segments.length ? segments : [rows];
  let pressure = 0;
  let gravity = 0;
  let damping = 0;
  workSegments.forEach((segment) => {
    const terms = integrateHeatEngineWorkTerms(segment, parameters, true);
    pressure += terms.pressure;
    gravity += terms.gravity;
    damping += terms.damping;
  });

  const net = pressure + damping;
  const mechanicalNet = net + gravity;
  return {
    pressure,
    gravity,
    damping,
    net,
    mechanicalNet,
    pressureDampingRatio: Math.abs(damping) > 1e-12 ? pressure / Math.abs(damping) : null
  };
}

function heatEngineWorkState(work: number): "driving" | "balanced" | "damping" {
  if (!Number.isFinite(work) || Math.abs(work) < 1e-4) return "balanced";
  return work > 0 ? "driving" : "damping";
}

function heatEngineRegime(work: HeatEngineCycleWork, rows: readonly Row[]): "driving" | "damped" | "limit cycle" | "runaway" | "equilibrium" {
  if (latestResult.message === "equilibrium") return "equilibrium";
  if (latestResult.message === "runaway" || latestResult.message === "runaway_trend") return "runaway";
  const radiusRange = rawRange(rows.map((row) => row.R));
  const velocityMax = Math.max(...rows.map((row) => Math.abs(row.V)).filter(Number.isFinite), 0);
  if (radiusRange[1] - radiusRange[0] < 1e-4 && velocityMax < 1e-4) return "equilibrium";
  const scale = Math.max(Math.abs(work.pressure), Math.abs(work.damping), 1e-8);
  if (Math.abs(work.net) <= scale * 0.08) return "limit cycle";
  return work.net > 0 ? "driving" : "damped";
}

function heatEngineEventRows(rows: readonly Row[], parameters: ModelParameters): HeatEngineEvent[] {
  const eventRows = latestDisplayWindow.mode === "phase"
    ? phaseWindowRows(rows, 0, 1, true)
    : [...rows];
  if (!eventRows.length) return [];
  const add = (
    kind: HeatEngineEvent["kind"],
    label: readonly CanvasMathFragment[],
    row: Row | null,
    color: string
  ): HeatEngineEvent | null => (
    row ? { kind, label, row, color } : null
  );
  return [
    add("rMin", [{ text: "R", subscript: "min", color: COLORS.R }], extremaRow(eventRows, (row) => row.R, "min"), COLORS.R),
    add("fpMax", [{ text: "F", subscript: "P,max", color: COLORS.H }], extremaRow(eventRows, (row) => pressureSupport(row, parameters), "max"), COLORS.H),
    add("lMax", [{ text: "L", subscript: "max", color: COLORS.L }], extremaRow(eventRows, (row) => row.L, "max"), COLORS.L),
    add("lrMax", [{ text: "L", subscript: "r,max", color: COLORS.Lr }], extremaRow(eventRows, (row) => row.Lr, "max"), COLORS.Lr),
    add("lcMax", [{ text: "L", subscript: "c,max", color: COLORS.Lc }], extremaRow(eventRows, (row) => row.Lc, "max"), COLORS.Lc),
    add("rMax", [{ text: "R", subscript: "max", color: COLORS.R }], extremaRow(eventRows, (row) => row.R, "max"), COLORS.R)
  ].filter((event): event is HeatEngineEvent => Boolean(event));
}

function heatEngineEventFraction(row: Row, rows: readonly Row[]): number {
  if (latestDisplayWindow.mode === "phase") return clamp(row.tau, 0, 1);
  const first = rows[0]?.tau ?? 0;
  const last = rows.at(-1)?.tau ?? first + 1;
  return normalizedInRange(row.tau, first === last ? [first, first + 1] : [first, last]);
}

function heatEngineCurrentFraction(rows: readonly Row[]): number {
  if (latestDisplayWindow.mode === "phase") return phaseModOne(currentAnimationPhase);
  const coordinate = displayMarkerX(latestDisplayWindow, currentAnimationPhase);
  const first = rows[0]?.tau ?? 0;
  const last = rows.at(-1)?.tau ?? first + 1;
  return normalizedInRange(coordinate, first === last ? [first, first + 1] : [first, last]);
}

function heatEngineConvectiveTurnoverPhase(rows: readonly Row[], fraction: number): number {
  if (rows.length < 2) return phaseModOne(fraction);
  const finiteUcValues = rows
    .map((row) => Math.max(0, row.Uc))
    .filter(Number.isFinite);
  const maxUc = Math.max(...finiteUcValues, 0);
  if (maxUc <= 1e-12) return 0;
  const rowFraction = (row: Row) => latestDisplayWindow.mode === "phase"
    ? clamp(row.tau, 0, 1)
    : heatEngineEventFraction(row, rows);
  const speedLevel = (row: Row) => clamp(Math.max(0, row.Uc) / maxUc, 0, 1);
  const currentFraction = phaseModOne(fraction);
  let totalAdvance = 0;
  let currentAdvance = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const left = rows[index - 1];
    const right = rows[index];
    const leftFraction = rowFraction(left);
    const rightFraction = rowFraction(right);
    const span = rightFraction - leftFraction;
    if (!Number.isFinite(span) || span <= 1e-9) continue;

    const leftSpeed = speedLevel(left);
    const rightSpeed = speedLevel(right);
    const segmentAdvance = 0.5 * (leftSpeed + rightSpeed) * span;
    totalAdvance += segmentAdvance;

    const covered = Math.min(Math.max(currentFraction - leftFraction, 0), span);
    if (covered > 0) {
      const localFraction = covered / span;
      const localSpeed = leftSpeed + (rightSpeed - leftSpeed) * localFraction;
      currentAdvance += 0.5 * (leftSpeed + localSpeed) * covered;
    }
  }

  return totalAdvance > 1e-12 ? currentAdvance / totalAdvance : currentFraction;
}

function phaseOffsetLabel(target: Row | undefined, reference: Row | undefined, rows: readonly Row[]): string {
  if (!target || !reference) return "n/a";
  const targetFraction = heatEngineEventFraction(target, rows);
  const referenceFraction = heatEngineEventFraction(reference, rows);
  let delta = targetFraction - referenceFraction;
  if (latestDisplayWindow.mode === "phase") {
    delta = ((delta + 0.5) % 1 + 1) % 1 - 0.5;
  }
  if (!Number.isFinite(delta)) return "n/a";
  return `${delta >= 0 ? "+" : ""}${fmt(delta, 2)}`;
}

function heatEnginePhaseLagItems(events: readonly HeatEngineEvent[], rows: readonly Row[]): Array<{
  label: readonly CanvasMathFragment[];
  color: string;
}> {
  const byKind = (kind: HeatEngineEvent["kind"]) => events.find((event) => event.kind === kind)?.row;
  return [
    {
      label: [
        { text: "Δφ(" },
        { text: "F", subscript: "P,max", color: COLORS.H },
        { text: "-R", subscript: "min", color: COLORS.R },
        { text: `) ${phaseOffsetLabel(byKind("fpMax"), byKind("rMin"), rows)}` }
      ],
      color: COLORS.H
    },
    {
      label: [
        { text: "Δφ(" },
        { text: "L", subscript: "c,max", color: COLORS.Lc },
        { text: "-L", subscript: "r,max", color: COLORS.Lr },
        { text: `) ${phaseOffsetLabel(byKind("lcMax"), byKind("lrMax"), rows)}` }
      ],
      color: COLORS.Lc
    },
    {
      label: [
        { text: "Δφ(" },
        { text: "L", subscript: "max", color: COLORS.L },
        { text: "-R", subscript: "min", color: COLORS.R },
        { text: `) ${phaseOffsetLabel(byKind("lMax"), byKind("rMin"), rows)}` }
      ],
      color: COLORS.L
    }
  ];
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHeatEngineLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = THEME.axisText,
  align: CanvasTextAlign = "center",
  size = 11,
  weight: string | number = 700
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px Inter, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = canvasTextHaloColor();
  ctx.lineWidth = canvasTextHaloWidth(4);
  ctx.fillStyle = color;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawHeatEngineMathLabel(
  ctx: CanvasRenderingContext2D,
  fragments: readonly CanvasMathFragment[],
  x: number,
  y: number,
  options: CanvasMathOptions = {}
): void {
  drawCanvasMathFragments(ctx, fragments, x, y, {
    fontSize: options.fontSize ?? 11,
    subscriptSize: options.subscriptSize,
    align: options.align,
    color: options.color,
    rotate: options.rotate,
    strokeColor: options.strokeColor || canvasTextHaloColor(),
    strokeWidth: options.strokeWidth ?? 4,
    weight: options.weight
  });
}

function drawHeatEngineCanvasLabel(
  ctx: CanvasRenderingContext2D,
  label: HeatEngineCanvasLabel,
  x: number,
  y: number,
  color: string = THEME.axisText,
  align: CanvasTextAlign = "center",
  size = 11,
  weight: string | number = 700
): void {
  if (typeof label === "string") {
    drawHeatEngineLabel(ctx, label, x, y, color, align, size, weight);
    return;
  }
  drawHeatEngineMathLabel(
    ctx,
    label.map((fragment) => ({
      ...fragment,
      color: fragment.color || color,
      weight: fragment.weight || weight
    })),
    x,
    y,
    { align, fontSize: size }
  );
}

function heatEngineSignedValue(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "n/a";
  const formatted = fmt(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

function heatEngineMaxMagnitude(values: readonly number[]): number {
  return Math.max(
    1e-9,
    ...values.map((item) => Math.abs(item)).filter(Number.isFinite)
  );
}

function heatEngineNormalizedMagnitude(value: number, maxMagnitude: number): number {
  return clamp(Math.abs(value) / maxMagnitude, 0, 1);
}

function heatEngineCompressibilityLevel(compressibility: number): number {
  const value = Math.max(0, compressibility);
  const low = Math.log1p(1);
  const high = Math.log1p(24);
  return clamp((Math.log1p(value) - low) / (high - low), 0, 1);
}

function heatEngineRegimeColor(regime: ReturnType<typeof heatEngineRegime>): string {
  if (regime === "driving") return COLORS.Lc;
  if (regime === "damped") return NEGATIVE_VELOCITY_COLOR;
  if (regime === "runaway") return sourceLuminosityColor();
  if (regime === "equilibrium") return THEME.axisText;
  return PHASE_MARKER_COLOR;
}

function drawHeatEngineArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 2.2,
  label?: HeatEngineCanvasLabel,
  labelOffset = 12,
  headSize = 8
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(headSize, Math.max(0.8, length * 0.42), length * 0.8);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - ux * head, y2 - uy * head);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * head - uy * head * 0.52, y2 - uy * head + ux * head * 0.52);
  ctx.lineTo(x2 - ux * head + uy * head * 0.52, y2 - uy * head - ux * head * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (label) {
    const lx = (x1 + x2) / 2 - uy * labelOffset;
    const ly = (y1 + y2) / 2 + ux * labelOffset;
    drawHeatEngineCanvasLabel(ctx, label, lx, ly, color);
  }
}

function drawHeatEngineArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  size = 8
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * size - uy * size * 0.55, y2 - uy * size + ux * size * 0.55);
  ctx.lineTo(x2 - ux * size + uy * size * 0.55, y2 - uy * size - ux * size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeatEnginePhaseRail(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  events: readonly HeatEngineEvent[],
  x: number,
  y: number,
  width: number
): void {
  const current = heatEngineCurrentFraction(rows);
  const displayEventKinds: Array<HeatEngineEvent["kind"]> = ["rMin", "fpMax", "lMax", "lcMax", "rMax"];
  const displayEvents = displayEventKinds
    .map((kind) => events.find((event) => event.kind === kind))
    .filter((event): event is HeatEngineEvent => Boolean(event));
  ctx.save();
  ctx.strokeStyle = "rgba(101, 108, 118, 0.78)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  const currentX = x + current * width;
  ctx.strokeStyle = PHASE_MARKER_COLOR;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(currentX, y - 12);
  ctx.lineTo(currentX, y + 34);
  ctx.stroke();
  drawHeatEngineLabel(ctx, currentDisplayCoordinateLabel(), currentX, y - 17, PHASE_MARKER_COLOR, "center", 10, 700);
  displayEvents.forEach((event, index) => {
    const ex = x + heatEngineEventFraction(event.row, rows) * width;
    ctx.fillStyle = event.color;
    ctx.beginPath();
    ctx.arc(ex, y, 4, 0, Math.PI * 2);
    ctx.fill();
    drawHeatEngineCanvasLabel(ctx, event.label, ex, y + 15 + (index % 2) * 12, event.color, "center", 9.3, 700);
  });
  const lags = heatEnginePhaseLagItems(events, rows);
  const lagWidth = width / Math.max(1, lags.length);
  lags.forEach((lag, index) => {
    drawHeatEngineCanvasLabel(
      ctx,
      lag.label,
      x + lagWidth * (index + 0.5),
      y + 50,
      lag.color,
      "center",
      9.2,
      700
    );
  });
  ctx.restore();
}

function drawHeatEngineCompressibilitySpring(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  bottomY: number,
  compressibility: number
): void {
  const span = bottomY - topY;
  if (!Number.isFinite(span + compressibility) || span <= 7) return;
  const stiffness = heatEngineCompressibilityLevel(compressibility);
  const lead = clamp(span * 0.08, 3, 8);
  const coilTop = topY + lead;
  const coilBottom = bottomY - lead;
  const coilSpan = Math.max(1, coilBottom - coilTop);
  const targetHalfWaves = Math.round(8 + stiffness * 18);
  const halfWaves = Math.max(4, Math.min(targetHalfWaves, Math.floor(coilSpan / 2.2)));
  const amplitude = 6.2 + stiffness * 2.4;
  const alpha = 0.2 + stiffness * 0.18;

  ctx.save();
  ctx.strokeStyle = `rgba(145, 152, 161, ${alpha})`;
  ctx.shadowColor = `rgba(145, 152, 161, ${alpha * 0.6})`;
  ctx.shadowBlur = paperModeActive() ? 0 : 2 + stiffness * 4;
  ctx.lineWidth = 1.05 + stiffness * 1.15;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, coilTop);
  for (let wave = 1; wave <= halfWaves; wave += 1) {
    const y = coilTop + (coilSpan * wave) / halfWaves;
    const side = wave % 2 === 0 ? -1 : 1;
    ctx.lineTo(x + amplitude * side, y);
  }
  ctx.lineTo(x, coilBottom);
  ctx.lineTo(x, bottomY);
  ctx.stroke();
  ctx.restore();
}

function drawHeatEnginePiston(
  ctx: CanvasRenderingContext2D,
  row: Row,
  rows: readonly Row[],
  terms: HeatEngineTerms,
  chamber: { left: number; top: number; width: number; height: number },
  parameters: ModelParameters
): void {
  const right = chamber.left + chamber.width;
  const bottom = chamber.top + chamber.height;
  const centerX = chamber.left + chamber.width / 2;
  const radiusRange = range(rows.map((item) => item.R), 0.08);
  const hRange = range(rows.map((item) => item.H), 0.08);
  const velocityRange = rawRange(rows.map((item) => Math.abs(item.V)));
  const pressureRange = rawRange(rows.map((item) => pressureSupport(item, parameters)));
  const gravityRange = rawRange(rows.map((item) => 1 / item.R ** 2));
  const dampingRange = rawRange(rows.map((item) => Math.abs(parameters.cq * item.V ** 3)));
  const travelTop = chamber.top + 18;
  const travelBottom = bottom - 102;
  const pistonY = travelBottom - normalizedInRange(row.R, radiusRange) * Math.max(1, travelBottom - travelTop);
  const pistonHeight = 6;
  const gasTop = pistonY + pistonHeight / 2;
  const hLevel = normalizedInRange(row.H, hRange);

  ctx.save();
  ctx.strokeStyle = "rgba(101, 108, 118, 0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chamber.left, chamber.top);
  ctx.lineTo(chamber.left, bottom);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right, chamber.top);
  ctx.stroke();

  const fillGradient = ctx.createLinearGradient(0, gasTop, 0, bottom);
  fillGradient.addColorStop(0, colorWithAlpha(COLORS.H, 0.18 + hLevel * 0.22));
  fillGradient.addColorStop(1, colorWithAlpha(COLORS.H, 0.42 + hLevel * 0.38));
  ctx.fillStyle = fillGradient;
  ctx.shadowColor = colorWithAlpha(COLORS.H, 0.78);
  ctx.shadowBlur = paperModeActive() ? 0 : 8 + hLevel * 18;
  ctx.fillRect(chamber.left + 3, gasTop, chamber.width - 6, bottom - gasTop - 3);
  ctx.shadowBlur = 0;

  roundedRectPath(ctx, chamber.left - 5, pistonY - pistonHeight / 2, chamber.width + 10, pistonHeight, 5);
  ctx.fillStyle = "#C6D2EA";
  ctx.fill();
  ctx.strokeStyle = "#F0F5FF";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  drawHeatEngineLabel(ctx, "piston", centerX, pistonY - 27, THEME.axisText, "center", 10, 800);

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = colorWithAlpha(COLORS.R, 0.5);
  ctx.beginPath();
  ctx.moveTo(chamber.left - 14, bottom);
  ctx.lineTo(chamber.left - 14, pistonY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeatEngineCanvasLabel(ctx, [{ text: "R", color: COLORS.R }, { text: `=${fmt(row.R, 2)}` }], Math.max(8, chamber.left - 46), (bottom + pistonY) / 2, COLORS.R, "left");

  const velocitySign = Math.abs(row.V) < 1e-6 ? 0 : Math.sign(row.V);
  const velocityLength = 18 + normalizedInRange(Math.abs(row.V), velocityRange) * 32;
  const velocityStartY = pistonY + (velocitySign >= 0 ? velocityLength / 2 : -velocityLength / 2);
  const velocityEndY = pistonY - (velocitySign >= 0 ? velocityLength / 2 : -velocityLength / 2);
  drawHeatEngineArrow(ctx, chamber.left - 36, velocityStartY, chamber.left - 36, velocityEndY, row.V >= 0 ? POSITIVE_VELOCITY_COLOR : NEGATIVE_VELOCITY_COLOR, 2.2, [{ text: "V" }, { text: `=${fmt(row.V, 2)}` }], 14);

  const pressureLength = 28 + normalizedInRange(terms.pressureForce, pressureRange) * 34;
  drawHeatEngineArrow(ctx, centerX - 30, gasTop + pressureLength, centerX - 30, gasTop + 8, COLORS.H, 3, [{ text: "H/R", superscript: "q" }], 18);
  const gravityLength = 26 + normalizedInRange(terms.gravityForce, gravityRange) * 28;
  drawHeatEngineArrow(ctx, centerX + 32, pistonY - gravityLength, centerX + 32, pistonY - 3, THEME.axisText, 2.6, [{ text: "1/R", superscript: "2" }], -20);
  const dampingDirection = row.V >= 0 ? 1 : -1;
  const dampingLength = 18 + normalizedInRange(Math.abs(terms.dampingAcceleration), dampingRange) * 32;
  drawHeatEngineArrow(ctx, right + 22, pistonY - dampingDirection * dampingLength / 2, right + 22, pistonY + dampingDirection * dampingLength / 2, COLORS.cq, 2.4, [{ text: "C", subscript: "q" }, { text: "V", superscript: "3" }], -26);

  drawHeatEngineArrow(ctx, chamber.left + 36, bottom + 28, chamber.left + 36, bottom - 12, sourceLuminosityColor(), 3, [{ text: "R", superscript: "U" }], 19);
  drawHeatEngineArrow(ctx, centerX, pistonY - 16, centerX, chamber.top - 24, COLORS.Lr, 2.4, [{ text: "L", subscript: "r" }], -18);

  const targetValues = rows.map((item) => convectiveVelocityTarget(item, parameters));
  const ucRange = range([...rows.map((item) => item.Uc), ...targetValues], 0.12);
  const slotWidth = 28;
  const slotHeight = 70;
  const slotX = right - slotWidth - 16;
  const slotBottom = bottom - 22;
  const slotTop = slotBottom - slotHeight;
  const currentAperture = normalizedInRange(row.Uc, ucRange);
  const targetAperture = normalizedInRange(terms.convectiveTarget, ucRange);
  const currentY = slotBottom - currentAperture * slotHeight;
  const targetY = slotBottom - targetAperture * slotHeight;
  ctx.strokeStyle = "rgba(145, 152, 161, 0.5)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(slotX, slotTop, slotWidth, slotHeight);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = colorWithAlpha(COLORS.Uc, 0.58);
  ctx.strokeRect(slotX - 4, targetY, slotWidth + 8, slotBottom - targetY);
  ctx.setLineDash([]);
  ctx.fillStyle = colorWithAlpha(COLORS.Uc, 0.48 + currentAperture * 0.32);
  ctx.fillRect(slotX + 3, currentY, slotWidth - 6, slotBottom - currentY);
  ctx.strokeStyle = COLORS.Uc;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(slotX, currentY);
  ctx.lineTo(slotX + slotWidth, currentY);
  ctx.stroke();
  drawHeatEngineCanvasLabel(ctx, [{ text: "U", subscript: "c" }], slotX + slotWidth / 2, slotBottom + 13, COLORS.Uc, "center", 10);
  drawHeatEngineCanvasLabel(ctx, [{ text: "U", subscript: "c,*" }], slotX + slotWidth + 16, targetY, colorWithAlpha(COLORS.Uc, 0.9), "left", 9.5);
  if (!convectiveResponseDisabled(parameters)) {
    drawHeatEngineCanvasLabel(ctx, [{ text: "ζ", subscript: "c" }, { text: ` lag ${fmt(terms.convectiveLag, 2)}` }], slotX + slotWidth + 14, slotTop + 12, COLORS.zetac, "left", 9.5);
  } else {
    drawHeatEngineCanvasLabel(ctx, [{ text: "ζ", subscript: "c" }, { text: " frozen" }], slotX + slotWidth + 14, slotTop + 12, COLORS.zetac, "left", 9.5);
  }
  drawHeatEngineArrow(ctx, slotX + slotWidth + 10, slotBottom - 8, slotX + slotWidth + 10, slotTop - 34, COLORS.Lc, 2.4);

  drawHeatEngineCanvasLabel(ctx, [{ text: "H" }, { text: `=${fmt(row.H, 2)}` }], centerX, gasTop + Math.max(26, (bottom - gasTop) * 0.42), COLORS.H, "center", 12, 800);
  ctx.restore();
}

function drawHeatEnginePistonCausal(
  ctx: CanvasRenderingContext2D,
  row: Row,
  rows: readonly Row[],
  terms: HeatEngineTerms,
  chamber: { left: number; top: number; width: number; height: number },
  parameters: ModelParameters,
  canvasHeight: number
): void {
  const right = chamber.left + chamber.width;
  const bottom = chamber.top + chamber.height;
  const centerX = chamber.left + chamber.width / 2;
  const scaleRows = stableTimeVisualReferenceRows(rows);
  const radiusRange = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(scaleRows.map((item) => item.R), 1, 0.045, 0.08)
    : range(rows.map((item) => item.R), 0.08);
  const hRange = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(scaleRows.map((item) => item.H), 1, 0.045, 0.08)
    : range(rows.map((item) => item.H), 0.08);
  const pressureValues = scaleRows.map((item) => pressureSupport(item, parameters));
  const gravityValues = scaleRows.map((item) => 1 / item.R ** 2);
  const dampingValues = scaleRows.map((item) => parameters.cq * item.V ** 3);
  const sourceValues = scaleRows.map((item) => baseLuminosity(item, parameters));
  const radiativeValues = scaleRows.map((item) => item.Lr);
  const convectiveValues = scaleRows.map((item) => item.Lc);
  const forceMagnitudeMax = heatEngineMaxMagnitude([
    ...pressureValues,
    ...gravityValues,
    ...dampingValues,
    terms.pressureForce,
    terms.gravityForce,
    terms.dampingAcceleration
  ]);
  const heatFlowMagnitudeMax = heatEngineMaxMagnitude([
    ...sourceValues,
    ...radiativeValues,
    ...convectiveValues,
    terms.source,
    terms.radiativeLeak,
    terms.convectiveLeak
  ]);
  const forceMagnitude = (value: number) => heatEngineNormalizedMagnitude(value, forceMagnitudeMax);
  const forceArrowLength = (value: number) => heatEngineNormalizedMagnitude(value, forceMagnitudeMax) * 61;
  const heatFlowMagnitude = (value: number) => heatEngineNormalizedMagnitude(value, heatFlowMagnitudeMax);
  const luminosityRange = rawRange([
    ...scaleRows.map((item) => item.L),
    ...radiativeValues,
    ...convectiveValues,
    row.L,
    terms.radiativeLeak,
    terms.convectiveLeak
  ]);
  const luminosityLevel = (value: number) => normalizedInRange(value, luminosityRange);
  const travelTop = chamber.top + 18;
  const travelBottom = bottom - 88;
  const pistonY = travelBottom - normalizedInRange(row.R, radiusRange) * Math.max(1, travelBottom - travelTop);
  const pistonHeight = 6;
  const gasTop = pistonY + pistonHeight / 2;
  const hLevel = normalizedInRange(row.H, hRange);

  ctx.save();
  ctx.strokeStyle = "rgba(101, 108, 118, 0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chamber.left, chamber.top);
  ctx.lineTo(chamber.left, bottom);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right, chamber.top);
  ctx.stroke();

  const fillGradient = ctx.createLinearGradient(0, gasTop, 0, bottom);
  fillGradient.addColorStop(0, colorWithAlpha(COLORS.H, 0.18 + hLevel * 0.22));
  fillGradient.addColorStop(1, colorWithAlpha(COLORS.H, 0.42 + hLevel * 0.38));
  ctx.fillStyle = fillGradient;
  ctx.shadowColor = colorWithAlpha(COLORS.H, 0.78);
  ctx.shadowBlur = paperModeActive() ? 0 : 8 + hLevel * 18;
  ctx.fillRect(chamber.left + 3, gasTop, chamber.width - 6, bottom - gasTop - 3);
  ctx.shadowBlur = 0;

  drawHeatEngineCompressibilitySpring(
    ctx,
    centerX + 9,
    pistonY + pistonHeight / 2,
    bottom - 3,
    terms.q
  );

  const pressureLength = forceArrowLength(terms.pressureForce);
  const pressureX = Math.max(chamber.left + 12, centerX - 62);

  const temperatureValues = scaleRows
    .map((item) => effectiveTemperatureProxy(item) ?? NaN)
    .filter(Number.isFinite);
  const currentTemperatureProxy = effectiveTemperatureProxy(row);
  const temperatureRange = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange([...temperatureValues, currentTemperatureProxy ?? NaN], 1, 0.02, 0.08)
    : range([...temperatureValues, currentTemperatureProxy ?? NaN], 0.08);
  const pistonTemperatureLevel = normalizedInRange(currentTemperatureProxy ?? 1, temperatureRange);
  const pistonTemperatureColor = blackbodyRgbForTemperature(inferEffectiveTemperature(row.L, row.R));
  const pistonDisplayColor = lightModeInvertedSurfaceRgb(pistonTemperatureColor);
  roundedRectPath(ctx, chamber.left - 5, pistonY - pistonHeight / 2, chamber.width + 10, pistonHeight, 3);
  ctx.shadowColor = rgbCss(pistonDisplayColor, 0.2 + pistonTemperatureLevel * 0.5);
  ctx.shadowBlur = paperModeActive() ? 0 : 4 + pistonTemperatureLevel * 13;
  ctx.fillStyle = rgbCss(pistonDisplayColor, 0.44 + pistonTemperatureLevel * 0.42);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = physicalSurfaceOutlineColor(0.88);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const pressureEndY = gasTop + 2;
  drawHeatEngineArrow(ctx, pressureX, Math.min(bottom - 10, pressureEndY + pressureLength), pressureX, pressureEndY, COLORS.H, 3.1);
  drawHeatEngineLabel(ctx, "pressure", pressureX + 7, gasTop + 27, COLORS.H, "left", 9.4, 760);

  const gravityLength = forceArrowLength(terms.gravityForce);
  const gravityX = chamber.left + chamber.width * 0.05;
  const gravityEndY = pistonY - pistonHeight / 2 - 2;
  const gravityStartY = Math.max(3, gravityEndY - gravityLength);
  const forceLabelY = pistonY - Math.max(12, pistonHeight * 0.9);
  drawHeatEngineArrow(
    ctx,
    gravityX,
    gravityStartY,
    gravityX,
    gravityEndY,
    THEME.axisText,
    2.6
  );
  drawHeatEngineLabel(ctx, "gravity", gravityX + 10, forceLabelY, THEME.axisText, "left", 9.4, 760);

  if (Math.abs(parameters.cq) > 1e-9) {
    const dampingLevel = Math.sqrt(forceMagnitude(terms.dampingAcceleration));
    const dampingLength = Math.max(9, forceArrowLength(terms.dampingAcceleration));
    const velocitySign = Math.abs(row.V) < 1e-6 ? 1 : Math.sign(row.V);
    const dampingDirection = velocitySign >= 0 ? 1 : -1;
    const dampingX = right - chamber.width * 0.05;
    const dampingIndicatorLength = Math.max(9, Math.min(dampingLength, 32));
    const dampingColor = colorWithAlpha(COLORS.cq, 0.56 + dampingLevel * 0.34);
    drawHeatEngineArrow(ctx, dampingX, forceLabelY - dampingDirection * dampingIndicatorLength / 2, dampingX, forceLabelY + dampingDirection * dampingIndicatorLength / 2, dampingColor, 2 + dampingLevel * 0.8, undefined, 12, 5);
    drawHeatEngineLabel(ctx, "drag", dampingX - 6, forceLabelY, COLORS.cq, "right", 9.4, 760);
  }

  const sourceNorm = heatFlowMagnitude(terms.source);
  const sourceX = centerX - chamber.width * 0.22;
  const sourceRoom = Math.max(14, canvasHeight - bottom - 8);
  const sourceLength = sourceNorm * Math.min(42, sourceRoom);
  const sourceTailY = Math.min(canvasHeight - 4, bottom + sourceLength + 3);
  drawHeatEngineArrow(ctx, sourceX, sourceTailY, sourceX, bottom + 3, sourceLuminosityColor(), 3);
  drawHeatEngineLabel(ctx, "source", sourceX + 10, bottom + 18, sourceLuminosityColor(), "left", 9.4, 760);
  drawHeatEngineLabel(ctx, "luminosity", sourceX + 10, bottom + 30, sourceLuminosityColor(), "left", 9.4, 760);

  const radiativeLeakLevel = luminosityLevel(terms.radiativeLeak);
  const currentOpacityPoint = thermodynamicPoint(row, parameters);
  const opacityValues = scaleRows
    .map((item) => thermodynamicPoint(item, parameters)?.logOpacity ?? NaN)
    .filter(Number.isFinite);
  const opacityRange = currentOpacityPoint
    ? stableTimeEquilibriumDisplayActive()
      ? anchoredVisualRange([...opacityValues, currentOpacityPoint.logOpacity], 0, 0.05, 0.12)
      : range([...opacityValues, currentOpacityPoint.logOpacity, 0], 0.12)
    : range([0, 1], 0.12);
  const opacityLevel = currentOpacityPoint ? normalizedInRange(currentOpacityPoint.logOpacity, opacityRange) : 0.5;
  const equilibriumOpacityLevel = normalizedInRange(0, opacityRange);
  const radiativeSlotWidth = 34;
  const radiativeSlotHeight = Math.min(84, Math.max(62, chamber.height * 0.32));
  const radiativeSlotRight = chamber.left - 14;
  const radiativeSlotX = radiativeSlotRight - radiativeSlotWidth;
  const radiativeSlotBottom = bottom - 34;
  const radiativeSlotTop = radiativeSlotBottom - radiativeSlotHeight;
  const radiativeDuctY = radiativeSlotTop + radiativeSlotHeight * 0.58;
  const radiativeDuctHeight = 6;
  const radiativeDuctWidth = Math.max(1, chamber.left - radiativeSlotRight);

  ctx.fillStyle = colorWithAlpha(COLORS.Lr, 0.18);
  ctx.fillRect(radiativeSlotRight, radiativeDuctY - radiativeDuctHeight / 2, radiativeDuctWidth, radiativeDuctHeight);
  ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.42);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(radiativeSlotRight, radiativeDuctY - radiativeDuctHeight / 2, radiativeDuctWidth, radiativeDuctHeight);
  const radiativeDuctArrowX = chamber.left - radiativeDuctWidth * 0.28;
  const radiativeDuctArrowLength = Math.min(8, Math.max(4, radiativeDuctWidth * 0.48));
  const radiativeDuctArrowHalfHeight = Math.max(3.5, radiativeDuctHeight * 0.65);
  ctx.fillStyle = colorWithAlpha(COLORS.Lr, 0.72);
  ctx.beginPath();
  ctx.moveTo(radiativeDuctArrowX - radiativeDuctArrowLength / 2, radiativeDuctY);
  ctx.lineTo(radiativeDuctArrowX + radiativeDuctArrowLength / 2, radiativeDuctY - radiativeDuctArrowHalfHeight);
  ctx.lineTo(radiativeDuctArrowX + radiativeDuctArrowLength / 2, radiativeDuctY + radiativeDuctArrowHalfHeight);
  ctx.closePath();
  ctx.fill();

  roundedRectPath(ctx, radiativeSlotX, radiativeSlotTop, radiativeSlotWidth, radiativeSlotHeight, 6);
  ctx.fillStyle = themeSurface(0.78);
  ctx.fill();
  ctx.strokeStyle = themeRule(0.5);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const equilibriumY = radiativeSlotBottom - equilibriumOpacityLevel * radiativeSlotHeight;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.58);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(radiativeSlotX - 4, equilibriumY);
  ctx.lineTo(radiativeSlotX + radiativeSlotWidth, equilibriumY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeatEngineMathLabel(ctx, [{ text: "κ", subscript: "0", color: colorWithAlpha(COLORS.Lr, 0.9), weight: 760 }], radiativeSlotX - 5, equilibriumY, {
    align: "right",
    fontSize: 8.8,
    subscriptSize: 6.6
  });

  const opacityShutterY = radiativeSlotBottom - opacityLevel * radiativeSlotHeight;
  const opacityShutterTop = Math.min(radiativeSlotBottom - 6, opacityShutterY + 2);
  const opacityShutterHeight = Math.max(2, radiativeSlotBottom - opacityShutterTop - 4);
  ctx.fillStyle = `rgba(160, 172, 190, ${0.2 + opacityLevel * 0.38})`;
  roundedRectPath(ctx, radiativeSlotX + 4, opacityShutterTop, radiativeSlotWidth - 8, opacityShutterHeight, 4);
  ctx.fill();
  ctx.strokeStyle = COLORS.Lr;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(radiativeSlotX, opacityShutterY);
  ctx.lineTo(radiativeSlotX + radiativeSlotWidth, opacityShutterY);
  ctx.stroke();
  drawHeatEngineLabel(ctx, "opacity", radiativeSlotX + radiativeSlotWidth / 2, radiativeSlotBottom + 12, colorWithAlpha(COLORS.Lr, 0.95), "center", 9.2, 760);

  const radiativeLeakX = radiativeSlotX + radiativeSlotWidth / 2;
  const radiativeLeakBaseY = radiativeSlotTop - 1;
  const radiativeLeakTipY = Math.max(chamber.top - 8, radiativeLeakBaseY - 28);
  const radiativeRayLength = 8 + radiativeLeakLevel * 10;
  const radiativeRaySpread = 7 + radiativeLeakLevel * 5;
  ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.26 + radiativeLeakLevel * 0.62);
  ctx.shadowColor = colorWithAlpha(COLORS.Lr, 0.2 + radiativeLeakLevel * 0.52);
  ctx.shadowBlur = paperModeActive() ? 0 : 2 + radiativeLeakLevel * 10;
  ctx.lineWidth = 4.4;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(radiativeLeakX, radiativeLeakBaseY);
  ctx.lineTo(radiativeLeakX, radiativeLeakTipY);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.32 + radiativeLeakLevel * 0.62);
  ctx.lineWidth = 1.1 + radiativeLeakLevel * 0.9;
  ctx.lineCap = "round";
  for (let ray = -1; ray <= 1; ray += 1) {
    ctx.beginPath();
    ctx.moveTo(radiativeLeakX + ray * 6, radiativeLeakTipY - 3);
    ctx.lineTo(radiativeLeakX + ray * radiativeRaySpread, radiativeLeakTipY - radiativeRayLength);
    ctx.stroke();
  }
  const radiativeLeakLabelY = (radiativeLeakBaseY + radiativeLeakTipY) / 2;
  drawHeatEngineMathLabel(ctx, [{ text: "L", subscript: "r", color: COLORS.Lr, weight: 800 }], radiativeLeakX - 10, radiativeLeakLabelY, {
    align: "right",
    fontSize: 11
  });

  const convectiveLeakLevel = luminosityLevel(terms.convectiveLeak);
  const hasConvectiveLeak = convectiveLuminosityAvailable(parameters);
  if (hasConvectiveLeak) {
    const convectionResponsive = !convectiveResponseDisabled(parameters);
    const slotWidth = 34;
    const slotHeight = Math.min(84, Math.max(62, chamber.height * 0.32));
    const slotX = right + 14;
    const slotBottom = bottom - 34;
    const slotTop = slotBottom - slotHeight;
    const slotCenterY = slotTop + slotHeight / 2;
    const ductY = slotCenterY;
    const ductHeight = 6;
    const ductWidth = Math.max(1, slotX - right);

    ctx.fillStyle = colorWithAlpha(COLORS.Lc, 0.18);
    ctx.fillRect(right, ductY - ductHeight / 2, ductWidth, ductHeight);
    ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.42);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(right, ductY - ductHeight / 2, ductWidth, ductHeight);
    const ductArrowX = right + ductWidth * 0.28;
    const ductArrowLength = Math.min(8, Math.max(4, ductWidth * 0.48));
    const ductArrowHalfHeight = Math.max(3.5, ductHeight * 0.65);
    ctx.fillStyle = colorWithAlpha(COLORS.Lc, 0.72);
    ctx.beginPath();
    ctx.moveTo(ductArrowX + ductArrowLength / 2, ductY);
    ctx.lineTo(ductArrowX - ductArrowLength / 2, ductY - ductArrowHalfHeight);
    ctx.lineTo(ductArrowX - ductArrowLength / 2, ductY + ductArrowHalfHeight);
    ctx.closePath();
    ctx.fill();

    const targetValues = convectionResponsive ? scaleRows.map((item) => convectiveVelocityTarget(item, parameters)) : [];
    const ucValues = convectionResponsive
      ? [...scaleRows.map((item) => item.Uc), row.Uc, terms.convectiveTarget, ...targetValues]
      : [...scaleRows.map((item) => item.Uc), row.Uc, 0];
    const ucRange = stableTimeEquilibriumDisplayActive()
      ? anchoredVisualRange(ucValues, 1, 0.05, 0.12)
      : range(ucValues, 0.12);
    const convectiveActivity = normalizedInRange(row.Uc, ucRange);
    const convectiveVisualHeight = (level: number) => Math.min(slotHeight, Math.max(0, level * slotHeight));

    roundedRectPath(ctx, slotX, slotTop, slotWidth, slotHeight, 6);
    ctx.fillStyle = themeSurface(0.78);
    ctx.fill();
    ctx.strokeStyle = themeRule(0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (convectionResponsive) {
      const targetAperture = normalizedInRange(terms.convectiveTarget, ucRange);
      const targetHeight = convectiveVisualHeight(targetAperture);
      const targetTop = slotCenterY - targetHeight / 2;
      const targetLabelY = slotCenterY;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colorWithAlpha(COLORS.Uc, 0.58);
      roundedRectPath(ctx, slotX - 4, targetTop, slotWidth + 8, targetHeight, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      drawHeatEngineMathLabel(ctx, [{ text: "U", subscript: "c,*", color: colorWithAlpha(COLORS.Uc, 0.9) }], slotX + slotWidth + 10, targetLabelY, {
        align: "left",
        fontSize: 9.4
      });
    }
    const plumeHeight = convectiveVisualHeight(convectiveActivity);
    const plumeTop = slotCenterY - plumeHeight / 2;
    const plumeBottom = slotCenterY + plumeHeight / 2;
    const plumeLeft = slotX + 5;
    const plumeRight = slotX + slotWidth - 5;
    const plumeWidth = plumeRight - plumeLeft;
    const plumeCenterX = slotX + slotWidth / 2;
    const turbulenceLoopPhase = heatEngineConvectiveTurnoverPhase(rows, heatEngineCurrentFraction(rows));
    const turbulencePhase = turbulenceLoopPhase * Math.PI * 2;
    const plumeSway = (
      Math.sin(turbulencePhase)
      + 0.34 * Math.sin(turbulencePhase * 2 + 0.72)
    ) * Math.min(1.8, slotWidth * 0.048) * convectiveActivity;
    const plumeGradient = ctx.createLinearGradient(0, plumeBottom, 0, plumeTop);
    plumeGradient.addColorStop(0, colorWithAlpha(COLORS.Uc, 0.16 + convectiveActivity * 0.2));
    plumeGradient.addColorStop(0.52, colorWithAlpha(COLORS.Uc, 0.42 + convectiveActivity * 0.28));
    plumeGradient.addColorStop(1, colorWithAlpha(COLORS.Lc, 0.26 + convectiveActivity * 0.22));
    ctx.fillStyle = plumeGradient;
    roundedRectPath(ctx, plumeLeft + plumeSway, plumeTop, plumeWidth, plumeHeight, 5.5);
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(COLORS.Uc, 0.42 + convectiveActivity * 0.3);
    ctx.lineWidth = 1.35;
    ctx.stroke();
    ctx.save();
    const plumeClipTop = Math.max(slotTop + 2, plumeTop - 2);
    const plumeClipBottom = Math.min(slotBottom - 2, plumeBottom + 2);
    roundedRectPath(ctx, slotX + 3, plumeClipTop, slotWidth - 6, Math.max(1, plumeClipBottom - plumeClipTop), 7);
    ctx.clip();
    ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.42 + convectiveActivity * 0.42);
    ctx.lineWidth = 1.35;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let ribbon = 0; ribbon < 2; ribbon += 1) {
      const ribbonPhase = turbulencePhase * (ribbon + 1) + ribbon * Math.PI;
      const offset = (ribbon - 0.5) * slotWidth * 0.14 + Math.sin(ribbonPhase) * slotWidth * 0.035;
      ctx.beginPath();
      ctx.moveTo(plumeCenterX + plumeSway + offset, plumeBottom + 4);
      const segments = 3;
      for (let segment = 0; segment < segments; segment += 1) {
        const y0 = plumeBottom - (plumeHeight * segment) / segments;
        const y1 = plumeBottom - (plumeHeight * (segment + 1)) / segments;
        const bend = (segment % 2 === 0 ? 1 : -1) * slotWidth * (0.2 + 0.035 * Math.sin(ribbonPhase + segment * 1.4));
        const endX = plumeCenterX + plumeSway - offset * 0.35 - bend * 0.34;
        ctx.bezierCurveTo(
          plumeCenterX + plumeSway + offset + bend,
          y0 - plumeHeight * 0.1,
          plumeCenterX + plumeSway - offset - bend,
          y1 + plumeHeight * 0.1,
          endX,
          y1
        );
      }
      ctx.stroke();
    }
    const eddyColor = colorWithAlpha(COLORS.Lc, 0.34 + convectiveActivity * 0.42);
    [
      { x: -3.2, base: 0.29, rx: 8.6, ry: 4.6, rotation: -0.62, direction: 1, harmonic: 1 },
      { x: 3.4, base: 0.55, rx: 8.4, ry: 4.8, rotation: 0.48, direction: -1, harmonic: 2 },
      { x: -1.4, base: 0.8, rx: 7.8, ry: 4.2, rotation: 0.15, direction: 1, harmonic: 3 }
    ].forEach((eddy, index) => {
      const drift = Math.sin(turbulencePhase * eddy.harmonic + index * 1.8) * 0.07;
      const centerX = plumeCenterX + plumeSway + eddy.x + Math.cos(turbulencePhase * eddy.harmonic + index) * 1.4;
      const centerY = plumeBottom - plumeHeight * clamp(eddy.base + drift, 0.14, 0.9);
      const spin = turbulencePhase * eddy.harmonic * eddy.direction + index * 0.6;
      const rotation = eddy.rotation + Math.sin(spin) * 0.25;
      const start = eddy.direction > 0 ? Math.PI * 0.18 + spin : Math.PI * 1.18 + spin;
      const end = eddy.direction > 0 ? Math.PI * 1.55 + spin : Math.PI * 2.55 + spin;
      const innerStart = eddy.direction > 0 ? Math.PI * 0.78 + spin : Math.PI * 1.78 + spin;
      const innerEnd = eddy.direction > 0 ? Math.PI * 1.9 + spin : Math.PI * 2.9 + spin;
      const eddyScale = clamp((plumeHeight - 8) / 48, 0.42, 1);
      const eddyMargin = Math.min(plumeHeight * 0.4, 3 + eddy.ry * eddyScale);
      const eddyMinY = plumeTop + eddyMargin;
      const eddyMaxY = Math.max(eddyMinY, plumeBottom - eddyMargin);
      const eddyY = clamp(centerY, eddyMinY, eddyMaxY);
      ctx.beginPath();
      ctx.ellipse(centerX, eddyY, eddy.rx * eddyScale, eddy.ry * eddyScale, rotation, start, end, eddy.direction < 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(centerX - eddy.direction * 2.2 * eddyScale, eddyY + 0.8 * eddyScale, eddy.rx * 0.42 * eddyScale, eddy.ry * 0.45 * eddyScale, rotation * 0.35, innerStart, innerEnd, eddy.direction < 0);
      ctx.stroke();
    });
    ctx.restore();
    drawHeatEngineMathLabel(ctx, [{ text: "U", subscript: "c", color: COLORS.Uc }], slotX + slotWidth / 2, slotBottom + 12, {
      align: "center",
      fontSize: 10
    });
    const leakX = slotX + slotWidth / 2;
    const leakBaseY = slotTop - 1;
    const leakTipY = Math.max(chamber.top - 8, leakBaseY - 28);
    const leakRayLength = 8 + convectiveLeakLevel * 10;
    const leakRaySpread = 7 + convectiveLeakLevel * 5;
    ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.26 + convectiveLeakLevel * 0.62);
    ctx.shadowColor = colorWithAlpha(COLORS.Lc, 0.2 + convectiveLeakLevel * 0.52);
    ctx.shadowBlur = paperModeActive() ? 0 : 2 + convectiveLeakLevel * 10;
    ctx.lineWidth = 4.4;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(leakX, leakBaseY);
    ctx.lineTo(leakX, leakTipY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.32 + convectiveLeakLevel * 0.62);
    ctx.lineWidth = 1.1 + convectiveLeakLevel * 0.9;
    ctx.lineCap = "round";
    for (let ray = -1; ray <= 1; ray += 1) {
      ctx.beginPath();
      ctx.moveTo(leakX + ray * 6, leakTipY - 3);
      ctx.lineTo(leakX + ray * leakRaySpread, leakTipY - leakRayLength);
      ctx.stroke();
    }
    const leakLabelY = (leakBaseY + leakTipY) / 2;
    drawHeatEngineMathLabel(ctx, [{ text: "L", subscript: "c", color: COLORS.Lc, weight: 800 }], leakX + 10, leakLabelY, {
      align: "left",
      fontSize: 11
    });
  }

  drawHeatEngineMathLabel(ctx, [{ text: "H", color: COLORS.H, weight: 800 }], right - 13, bottom - 17, {
    align: "right",
    fontSize: 13
  });
  ctx.restore();
}

function drawHeatEngineLoop(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  currentRow: Row,
  parameters: ModelParameters,
  plot: PlotBox,
  work: number
): void {
  const forces = rows.map((row) => pressureSupport(row, parameters));
  const xlim = range(rows.map((row) => row.R), 0.08);
  const ylim = range(forces, 0.1);
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const state = heatEngineWorkState(work);
  const loopColor = state === "driving" ? COLORS.Lc : state === "damping" ? NEGATIVE_VELOCITY_COLOR : PHASE_MARKER_COLOR;

  ctx.save();
  ctx.strokeStyle = colorWithAlpha(THEME.axisGrid, 0.9);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const x = plot.left + (plot.width * i) / 3;
    const y = plot.top + (plot.height * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  drawHeatEngineCanvasLabel(ctx, [{ text: "R" }], plot.left + plot.width / 2, plot.top + plot.height + 21, COLORS.R, "center", 11);
  drawHeatEngineCanvasLabel(
    ctx,
    [{ text: "F", subscript: "P" }, { text: "=" }, { text: "H/R", superscript: "q" }],
    plot.left - 24,
    plot.top + plot.height / 2,
    COLORS.H,
    "center",
    10
  );

  ctx.beginPath();
  let started = false;
  rows.forEach((row) => {
    const x = row.R;
    const y = pressureSupport(row, parameters);
    if (!Number.isFinite(x + y)) return;
    const px = sx(x);
    const py = sy(y);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  });
  if (started) {
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(loopColor, 0.16);
    ctx.strokeStyle = colorWithAlpha(loopColor, 0.94);
    ctx.lineWidth = 2.2;
    ctx.fill();
    ctx.stroke();
  }
  const currentForce = pressureSupport(currentRow, parameters);
  if (Number.isFinite(currentRow.R + currentForce)) {
    ctx.fillStyle = PHASE_MARKER_COLOR;
    ctx.strokeStyle = canvasMarkerOutlineColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx(currentRow.R), sy(currentForce), 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  drawHeatEngineCanvasLabel(ctx, [{ text: "W", subscript: "P" }, { text: ` ${state}` }], plot.left + plot.width - 4, plot.top + 13, loopColor, "right", 11, 800);
  drawHeatEngineLabel(ctx, `area ${fmt(work, 3)}`, plot.left + plot.width - 4, plot.top + 29, loopColor, "right", 10, 700);
  ctx.restore();
}

function drawHeatEngineWorkLoop(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  currentRow: Row,
  parameters: ModelParameters,
  plot: PlotBox,
  work: HeatEngineCycleWork,
  regime: ReturnType<typeof heatEngineRegime>
): void {
  const forces = rows.map((row) => pressureSupport(row, parameters));
  const xlim = range(rows.map((row) => row.R), 0.08);
  const ylim = range(forces, 0.1);
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const loopColor = heatEngineRegimeColor(regime);
  const plotted = rows
    .map((loopRow) => {
      const force = pressureSupport(loopRow, parameters);
      return Number.isFinite(loopRow.R + force) ? { x: sx(loopRow.R), y: sy(force) } : null;
    })
    .filter((point): point is { x: number; y: number } => Boolean(point));

  ctx.save();
  ctx.strokeStyle = colorWithAlpha(THEME.axisGrid, 0.9);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const x = plot.left + (plot.width * i) / 3;
    const y = plot.top + (plot.height * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  drawHeatEngineLabel(ctx, "work loop", plot.left + 4, plot.top - 18, THEME.axisText, "left", 10, 800);
  drawHeatEngineMathLabel(ctx, [{ text: "R", color: COLORS.R }], plot.left + plot.width / 2, plot.top + plot.height + 24, {
    align: "center",
    fontSize: 11
  });
  drawHeatEngineMathLabel(
    ctx,
    [{ text: "F", subscript: "P", color: COLORS.H }, { text: "=H/R", superscript: "q", color: COLORS.H }],
    plot.left - 35,
    plot.top + plot.height / 2,
    { align: "center", fontSize: 10, rotate: -Math.PI / 2 }
  );

  if (plotted.length > 2) {
    ctx.beginPath();
    plotted.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(loopColor, 0.16);
    ctx.strokeStyle = colorWithAlpha(loopColor, 0.95);
    ctx.lineWidth = 2.4;
    ctx.fill();
    ctx.stroke();
    [0.22, 0.48, 0.74].forEach((fraction) => {
      const index = Math.min(plotted.length - 2, Math.max(0, Math.round(fraction * (plotted.length - 2))));
      drawHeatEngineArrowHead(ctx, plotted[index].x, plotted[index].y, plotted[index + 1].x, plotted[index + 1].y, loopColor, 7);
    });
  }

  const currentForce = pressureSupport(currentRow, parameters);
  if (Number.isFinite(currentRow.R + currentForce)) {
    ctx.fillStyle = PHASE_MARKER_COLOR;
    ctx.strokeStyle = canvasMarkerOutlineColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx(currentRow.R), sy(currentForce), 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const labelX = plot.left + plot.width - 8;
  drawHeatEngineMathLabel(ctx, [{ text: "W", subscript: "P", color: loopColor }, { text: `=${heatEngineSignedValue(work.pressure, 3)}`, color: loopColor }], labelX, plot.top + 15, {
    align: "right",
    fontSize: 10.6
  });
  drawHeatEngineMathLabel(
    ctx,
    [{ text: "W", subscript: "P", color: loopColor }, { text: "=∮" }, { text: "F", subscript: "P", color: COLORS.H }, { text: "dR" }],
    labelX,
    plot.top + 32,
    { align: "right", fontSize: 9.7 }
  );
  drawHeatEngineMathLabel(
    ctx,
    [
      { text: "W", subscript: "P", color: loopColor },
      { text: "/|" },
      { text: "W", subscript: "damp", color: COLORS.cq },
      { text: `|=${work.pressureDampingRatio === null ? "n/a" : fmt(work.pressureDampingRatio, 2)}` }
    ],
    labelX,
    plot.top + 49,
    { align: "right", fontSize: 9.7 }
  );

  const regimeWidth = Math.max(68, ctx.measureText(regime).width + 22);
  roundedRectPath(ctx, plot.left + plot.width - regimeWidth - 8, plot.top + plot.height - 31, regimeWidth, 22, 6);
  ctx.fillStyle = colorWithAlpha(loopColor, 0.22);
  ctx.fill();
  ctx.strokeStyle = colorWithAlpha(loopColor, 0.58);
  ctx.stroke();
  drawHeatEngineLabel(ctx, regime, plot.left + plot.width - regimeWidth / 2 - 8, plot.top + plot.height - 20, loopColor, "center", 10, 800);
  ctx.restore();
}

function drawHeatEnginePowerStrip(
  ctx: CanvasRenderingContext2D,
  terms: HeatEngineTerms,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const components: Array<{ label: readonly CanvasMathFragment[]; value: number; color: string }> = [
    { label: [{ text: "V " }, { text: "H/R", superscript: "q" }], value: terms.pressurePower, color: COLORS.H },
    { label: [{ text: "-V/R", superscript: "2" }], value: terms.gravityPower, color: COLORS.R },
    { label: [{ text: "-C", subscript: "q" }, { text: "V", superscript: "4" }], value: terms.dampingPower, color: COLORS.cq }
  ];
  const maxAbs = Math.max(1e-6, Math.abs(terms.mechanicalPower), ...components.map((item) => Math.abs(item.value)));
  const center = x + width / 2;
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 5);
  ctx.fillStyle = themeSurface(0.72);
  ctx.fill();
  ctx.strokeStyle = themeBorder(0.72);
  ctx.stroke();
  ctx.strokeStyle = themeRule(0.48);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center, y + 6);
  ctx.lineTo(center, y + height - 6);
  ctx.stroke();

  const laneGap = (height - 10) / components.length;
  components.forEach((component, index) => {
    const laneY = y + 7 + laneGap * (index + 0.5);
    const bar = (component.value / maxAbs) * (width * 0.42);
    ctx.strokeStyle = colorWithAlpha(component.color, 0.92);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(center, laneY);
    ctx.lineTo(center + bar, laneY);
    ctx.stroke();
    drawHeatEngineCanvasLabel(ctx, component.label, x + 8, laneY, component.color, "left", 9.5, 700);
  });
  const totalX = center + (terms.mechanicalPower / maxAbs) * (width * 0.42);
  ctx.fillStyle = PHASE_MARKER_COLOR;
  ctx.beginPath();
  ctx.arc(totalX, y + height / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  drawHeatEngineCanvasLabel(ctx, [{ text: "V V̇" }, { text: `=${fmt(terms.mechanicalPower, 3)}` }], x + width - 8, y + height / 2, PHASE_MARKER_COLOR, "right", 10.5, 800);
  ctx.restore();
}

function drawHeatEngineCycleWorkLedger(
  ctx: CanvasRenderingContext2D,
  work: HeatEngineCycleWork,
  x: number,
  y: number,
  width: number,
  height: number,
  regime: ReturnType<typeof heatEngineRegime>
): void {
  const rows: Array<{ label: readonly CanvasMathFragment[]; value: number; color: string }> = [
    { label: [{ text: "W", subscript: "P", color: COLORS.H }], value: work.pressure, color: COLORS.H },
    { label: [{ text: "W", subscript: "damp", color: COLORS.cq }], value: work.damping, color: COLORS.cq },
    { label: [{ text: "W", subscript: "g", color: COLORS.R }, { text: "≈0" }], value: work.gravity, color: COLORS.R },
    { label: [{ text: "ΔE", subscript: "mech", color: heatEngineRegimeColor(regime) }], value: work.net, color: heatEngineRegimeColor(regime) }
  ];
  const maxAbs = Math.max(1e-8, ...rows.map((item) => Math.abs(item.value)));
  const center = x + width * 0.49;
  const barLimit = width * 0.31;

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 6);
  ctx.fillStyle = themeSurface(0.72);
  ctx.fill();
  ctx.strokeStyle = themeBorder(0.72);
  ctx.stroke();
  drawHeatEngineLabel(ctx, "cycle work", x + 12, y + 13, THEME.axisText, "left", 10.5, 800);
  drawHeatEngineLabel(ctx, "+ adds mechanical energy", x + width - 12, y + 13, colorWithAlpha(THEME.axisText, 0.72), "right", 9.3, 650);
  ctx.strokeStyle = themeRule(0.54);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center, y + 22);
  ctx.lineTo(center, y + height - 8);
  ctx.stroke();

  const laneGap = (height - 28) / rows.length;
  rows.forEach((rowItem, index) => {
    const laneY = y + 25 + laneGap * (index + 0.5);
    const bar = (rowItem.value / maxAbs) * barLimit;
    ctx.strokeStyle = colorWithAlpha(rowItem.color, 0.94);
    ctx.lineWidth = index === rows.length - 1 ? 5 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(center, laneY);
    ctx.lineTo(center + bar, laneY);
    ctx.stroke();
    drawHeatEngineCanvasLabel(ctx, rowItem.label, x + 12, laneY, rowItem.color, "left", 9.8, 760);
    drawHeatEngineLabel(ctx, heatEngineSignedValue(rowItem.value, 3), x + width - 12, laneY, rowItem.color, "right", 9.5, 700);
  });
  drawHeatEngineLabel(ctx, regime, center + barLimit + 12, y + height - 13, heatEngineRegimeColor(regime), "left", 10.5, 800);
  ctx.restore();
}

function drawWorkLoopPanel(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  currentRow: Row | null,
  parameters: ModelParameters,
  work: HeatEngineCycleWork,
  regime: ReturnType<typeof heatEngineRegime>,
  plot: PlotBox,
  scope: HeatEngineWorkScope
): void {
  const forces = rows.map((row) => pressureSupport(row, parameters));
  const scaleRows = stableTimeVisualReferenceRows(rows);
  const scaleForces = scaleRows.map((row) => pressureSupport(row, parameters));
  const xlim = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(scaleRows.map((row) => row.R), 1, 0.045, 0.08)
    : range(rows.map((row) => row.R), 0.08);
  const ylim = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(scaleForces, 1, 0.045, 0.1)
    : range(forces, 0.1);
  const sx = (x: number) => plot.left + ((x - xlim[0]) / (xlim[1] - xlim[0])) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - ylim[0]) / (ylim[1] - ylim[0])) * plot.height;
  const loopColor = COLORS.H;
  const ratio = work.pressureDampingRatio === null ? "n/a" : fmt(work.pressureDampingRatio, 2);
  const plotted = rows
    .map((loopRow) => {
      const force = pressureSupport(loopRow, parameters);
      return Number.isFinite(loopRow.R + force) ? { x: sx(loopRow.R), y: sy(force) } : null;
    })
    .filter((point): point is { x: number; y: number } => Boolean(point));

  ctx.save();
  drawHeatEngineMathLabel(
    ctx,
    [
      { text: "W", subscript: "P", color: loopColor },
      { text: "/|" },
      { text: "W", subscript: "damp", color: COLORS.cq },
      { text: `|=${ratio}` }
    ],
    plot.left,
    plot.top - 15,
    { align: "left", fontSize: 10.6, subscriptSize: 8.6, strokeWidth: 2.6 }
  );
  drawHeatEngineMathLabel(
    ctx,
    [{ text: scope }, { text: " " }, { text: "W", subscript: "P", color: loopColor }, { text: `=${heatEngineSignedValue(work.pressure, 3)}` }],
    plot.left + plot.width,
    plot.top - 15,
    { align: "right", fontSize: 10.8, subscriptSize: 8.8, strokeWidth: 2.6 }
  );

  ctx.strokeStyle = colorWithAlpha(THEME.axisGrid, 0.9);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const x = plot.left + (plot.width * i) / 3;
    const y = plot.top + (plot.height * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

  const workTickLabel = (value: number, limits: NumericRange): string => {
    const span = Math.abs(limits[1] - limits[0]);
    const digits = span < 0.02 ? 4 : span < 0.2 ? 3 : span < 2 ? 2 : 1;
    return fmt(value, digits);
  };
  ctx.fillStyle = THEME.axisText;
  ctx.strokeStyle = THEME.axisBorder;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.font = "8.8px Inter, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  for (let i = 0; i <= 3; i += 1) {
    const fraction = i / 3;
    const x = plot.left + plot.width * fraction;
    ctx.beginPath();
    ctx.moveTo(x, plot.top + plot.height);
    ctx.lineTo(x, plot.top + plot.height + 4);
    ctx.stroke();
    ctx.fillText(workTickLabel(xlim[0] + (xlim[1] - xlim[0]) * fraction, xlim), x, plot.top + plot.height + 6);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 3; i += 1) {
    const fraction = i / 3;
    const y = plot.top + plot.height * fraction;
    ctx.beginPath();
    ctx.moveTo(plot.left - 4, y);
    ctx.lineTo(plot.left, y);
    ctx.stroke();
    ctx.fillText(workTickLabel(ylim[1] - (ylim[1] - ylim[0]) * fraction, ylim), plot.left - 7, y);
  }

  if (plotted.length > 2) {
    ctx.beginPath();
    plotted.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(loopColor, 0.16);
    ctx.strokeStyle = colorWithAlpha(loopColor, 0.95);
    ctx.lineWidth = 2.4;
    ctx.fill();
    ctx.stroke();
    [0.2, 0.46, 0.72].forEach((fraction) => {
      const index = Math.min(plotted.length - 2, Math.max(0, Math.round(fraction * (plotted.length - 2))));
      drawHeatEngineArrowHead(ctx, plotted[index].x, plotted[index].y, plotted[index + 1].x, plotted[index + 1].y, loopColor, 6.5);
    });
  }

  const currentForce = currentRow ? pressureSupport(currentRow, parameters) : Number.NaN;
  if (currentRow && Number.isFinite(currentRow.R + currentForce)) {
    ctx.fillStyle = PHASE_MARKER_COLOR;
    ctx.strokeStyle = canvasMarkerOutlineColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx(currentRow.R), sy(currentForce), 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  drawHeatEngineMathLabel(ctx, [{ text: "radius ", color: COLORS.R }, { text: "R", color: COLORS.R }], plot.left + plot.width / 2, plot.top + plot.height + 25, {
    align: "center",
    fontSize: 10.7,
    weight: 700
  });
  drawWorkPressureSupportAxisLabel(ctx, plot.left - 45, plot.top + plot.height / 2, -Math.PI / 2);
  ctx.restore();
}

function drawWorkPressureSupportAxisLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotate = 0
): void {
  const baseSize = 9.8;
  const exponentSize = 7.4;
  const exponentY = -baseSize * 0.45;
  const parts = [
    { text: "pressure support ", color: THEME.axisText, size: baseSize, y: 0 },
    { text: "H", color: COLORS.H, size: baseSize, y: 0 },
    { text: "/", color: THEME.axisText, size: baseSize, y: 0 },
    { text: "R", color: COLORS.R, size: baseSize, y: 0 },
    { text: "χ", color: COLORS.m, size: exponentSize, y: exponentY },
    { text: "Γ₁", color: COLORS.gamma1, size: exponentSize, y: exponentY },
    { text: "-2", color: THEME.axisText, size: exponentSize, y: exponentY }
  ];

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const totalWidth = parts.reduce((total, part) => {
    ctx.font = canvasMathFont(part.size, 760);
    return total + ctx.measureText(part.text).width;
  }, 0);
  let cursor = -totalWidth / 2;
  parts.forEach((part) => {
    ctx.font = canvasMathFont(part.size, 760);
    ctx.strokeStyle = canvasTextHaloColor();
    ctx.lineWidth = canvasTextHaloWidth(part.size === exponentSize ? 2 : 2.4);
    ctx.fillStyle = part.color;
    ctx.strokeText(part.text, cursor, part.y);
    ctx.fillText(part.text, cursor, part.y);
    cursor += ctx.measureText(part.text).width;
  });
  ctx.restore();
}

function drawWorkSummaryBars(
  ctx: CanvasRenderingContext2D,
  work: HeatEngineCycleWork,
  regime: ReturnType<typeof heatEngineRegime>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const rows: Array<{ label: readonly CanvasMathFragment[]; value: number; color: string; width: number }> = [
    { label: [{ text: "W", subscript: "P", color: COLORS.H }], value: work.pressure, color: COLORS.H, width: 4.8 },
    { label: [{ text: "W", subscript: "damp", color: COLORS.cq }], value: work.damping, color: COLORS.cq, width: 4.8 },
    { label: [{ text: "ΔE", subscript: "mech", color: heatEngineRegimeColor(regime) }], value: work.net, color: heatEngineRegimeColor(regime), width: 5.4 }
  ];
  const maxAbs = Math.max(1e-8, ...rows.map((row) => Math.abs(row.value)).filter(Number.isFinite));
  const center = x + width * 0.51;
  const barLimit = width * 0.22;

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 5);
  ctx.fillStyle = themeSurface(0.7);
  ctx.fill();
  ctx.strokeStyle = themeBorder(0.58);
  ctx.stroke();
  ctx.strokeStyle = themeRule(0.42);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center, y + 6);
  ctx.lineTo(center, y + height - 6);
  ctx.stroke();

  const laneGap = height / rows.length;
  rows.forEach((row, index) => {
    const laneY = y + laneGap * (index + 0.5);
    const bar = clamp(row.value / maxAbs, -1, 1) * barLimit;
    ctx.strokeStyle = themeBorder(0.5);
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(center - barLimit, laneY);
    ctx.lineTo(center + barLimit, laneY);
    ctx.stroke();

    ctx.strokeStyle = colorWithAlpha(row.color, 0.95);
    ctx.shadowColor = colorWithAlpha(row.color, 0.22);
    ctx.shadowBlur = paperModeActive() ? 0 : 5;
    ctx.lineWidth = row.width;
    ctx.beginPath();
    ctx.moveTo(center, laneY);
    ctx.lineTo(center + bar, laneY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawHeatEngineMathLabel(
      ctx,
      row.label.map((fragment) => ({
        ...fragment,
        color: fragment.color || row.color,
        weight: fragment.weight || 760
      })),
      x + 8,
      laneY,
      { align: "left", fontSize: 9.6, subscriptSize: 8.2, strokeWidth: 2.5 }
    );
  });

  const regimeColor = heatEngineRegimeColor(regime);
  drawHeatEngineLabel(ctx, regime, center + barLimit + 8, y + height - 8, regimeColor, "left", 8.6, 800);
  ctx.restore();
}

function drawWorkPanel(): void {
  const canvas = document.getElementById("workCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 292);
  const height = Math.max(230, rect.height || 260);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const { selectedRows, integrationRows, scope } = heatEngineWorkRows(latestPhaseRows);
  const plotRows = downsample(integrationRows, 1100, ["R", "V", "H", "Uc", "L", "Lr", "Lc"]);
  const row = integrationRows.length ? rowAtCurrentClosedLoopPosition(integrationRows) : null;
  if (!row || integrationRows.length < 2 || plotRows.length < 2) {
    canvas.dataset.workMode = "unavailable";
    canvas.dataset.workWindowRows = String(selectedRows.length);
    canvas.dataset.workRows = String(integrationRows.length);
    canvas.dataset.workPlotRows = String(plotRows.length);
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "work unavailable");
    return;
  }

  const work = heatEngineCycleWork(integrationRows, latestPhaseParameters);
  const regime = heatEngineRegime(work, integrationRows);
  canvas.dataset.workMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.workScope = scope;
  canvas.dataset.workWindowRows = String(selectedRows.length);
  canvas.dataset.workRows = String(integrationRows.length);
  canvas.dataset.workPlotRows = String(plotRows.length);
  canvas.dataset.workVisualization = "pressure support H/R^(chi Gamma1-2)-R loop";
  canvas.dataset.workLoop = "pressure support H/R^(chi Gamma1-2) versus R";
  canvas.dataset.workTerms = "W_P,W_damp,DeltaE_mech";
  canvas.dataset.cycleWorkPressure = fmt(work.pressure, 6);
  canvas.dataset.cycleWorkDamping = fmt(work.damping, 6);
  canvas.dataset.cycleWorkNet = fmt(work.net, 6);
  canvas.dataset.cycleWorkRatio = work.pressureDampingRatio === null ? "n/a" : fmt(work.pressureDampingRatio, 6);
  canvas.dataset.regime = regime;
  if (paperModeActive()) {
    delete canvas.dataset.currentTime;
    delete canvas.dataset.currentPhase;
  } else if (latestDisplayWindow.mode === "time") {
    canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
    delete canvas.dataset.currentPhase;
  } else {
    canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
    delete canvas.dataset.currentTime;
  }
  const summaryHeight = height < 245 ? 46 : 50;
  const summaryY = height - summaryHeight - 10;
  const loopPlot = {
    left: 56,
    top: 34,
    width: Math.max(170, width - 70),
    height: Math.max(94, summaryY - 70)
  };
  fillPlotAreaBackground(ctx, loopPlot);
  drawWorkLoopPanel(ctx, plotRows, paperModeActive() ? null : row, latestPhaseParameters, work, regime, loopPlot, scope);
  drawWorkSummaryBars(ctx, work, regime, 10, summaryY, width - 20, summaryHeight);
}

function drawHeatEngineEquationTags(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number
): void {
  const tags = [
    {
      fragments: [{ text: "Ṙ", color: COLORS.R }, { text: " = " }, { text: "V", color: COLORS.V }],
      color: COLORS.V
    },
    {
      fragments: [
        { text: "V̇", color: COLORS.V },
        { text: " = " },
        { text: "H/R", superscript: "q", color: COLORS.H },
        { text: " - " },
        { text: "1/R", superscript: "2" },
        { text: " - " },
        { text: "C", subscript: "q", color: COLORS.cq },
        { text: "V", superscript: "3", color: COLORS.V }
      ],
      color: THEME.axisText
    },
    {
      fragments: [
        { text: "Ḣ", color: COLORS.H },
        { text: " ~ " },
        { text: "ζ", color: COLORS.zeta },
        { text: "R", superscript: "χ(Γ₁-1)", color: COLORS.R },
        { text: " [" },
        { text: "R", superscript: "U", color: sourceLuminosityColor() },
        { text: " - " },
        { text: "L", subscript: "r", color: COLORS.Lr },
        { text: " - " },
        { text: "L", subscript: "c", color: COLORS.Lc },
        { text: "]" }
      ],
      color: COLORS.H
    }
  ];
  const tagWidth = width / tags.length;
  tags.forEach((tag, index) => {
    const left = x + index * tagWidth + 4;
    const boxWidth = tagWidth - 8;
    roundedRectPath(ctx, left, y, boxWidth, 24, 5);
    ctx.fillStyle = "rgba(21, 27, 35, 0.72)";
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(tag.color, 0.36);
    ctx.stroke();
    drawHeatEngineCanvasLabel(ctx, tag.fragments, left + boxWidth / 2, y + 12, tag.color, "center", 9.2, 760);
  });
}

interface PaperSnapshotCell {
  left: number;
  top: number;
  width: number;
  height: number;
}

function paperSnapshotCanvasHeight(width: number, count: number, cellHeight: number): number {
  const columns = width >= 560 ? 2 : 1;
  return 8 + Math.ceil(Math.max(1, count) / columns) * (cellHeight + 10);
}

function paperSnapshotCells(width: number, height: number, count: number): PaperSnapshotCell[] {
  const columns = width >= 560 ? 2 : 1;
  const rows = Math.ceil(Math.max(1, count) / columns);
  const gap = 10;
  const pad = 8;
  const cellWidth = (width - pad * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (height - pad * 2 - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_value, index) => ({
    left: pad + (index % columns) * (cellWidth + gap),
    top: pad + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight
  }));
}

function drawPaperSnapshotFrame(
  ctx: CanvasRenderingContext2D,
  cell: PaperSnapshotCell,
  snapshot: ResolvedPaperSnapshot,
  index: number
): void {
  ctx.save();
  roundedRectPath(ctx, cell.left, cell.top, cell.width, cell.height, 5);
  ctx.fillStyle = cssVariable("--canvas", "#ffffff");
  ctx.fill();
  ctx.strokeStyle = themeBorder(0.72);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = cssVariable("--ink", "#1f2328");
  ctx.font = "600 11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${String.fromCharCode(97 + index)}) ${snapshot.label}`, cell.left + 8, cell.top + 7);
  ctx.fillStyle = THEME.axisText;
  ctx.font = "10px Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(snapshot.coordinateLabel, cell.left + cell.width - 8, cell.top + 7);
  ctx.restore();
}

function drawPaperPistonSnapshots(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshots: readonly ResolvedPaperSnapshot[],
  canvas: HTMLCanvasElement
): void {
  const cells = paperSnapshotCells(width, height, snapshots.length);
  const cycleRows = downsample(heatEngineCycleRows(latestPhaseRows), 1100, ["R", "V", "H", "Uc", "L", "Lr", "Lc"]);
  snapshots.forEach((snapshot, index) => {
    const cell = cells[index];
    drawPaperSnapshotFrame(ctx, cell, snapshot, index);
    const contentTop = cell.top + 26;
    const contentHeight = Math.max(185, cell.height - 30);
    const terms = heatEngineTerms(snapshot.row, latestPhaseParameters);
    if (!terms) {
      drawCanvasMessage(ctx, cell.width, contentHeight, "piston unavailable");
      return;
    }
    ctx.save();
    ctx.translate(cell.left, contentTop);
    const chamberLeft = Math.min(78, Math.max(56, cell.width * 0.24));
    const heatEngineShowsUc = convectiveLuminosityAvailable(latestPhaseParameters);
    const rightReserve = heatEngineShowsUc ? 78 : 22;
    const chamberWidth = Math.max(98, Math.min(160, cell.width - chamberLeft - rightReserve));
    drawHeatEnginePistonCausal(ctx, snapshot.row, cycleRows, terms, {
      left: chamberLeft,
      top: 34,
      width: chamberWidth,
      height: Math.max(120, contentHeight - 74)
    }, latestPhaseParameters, contentHeight);
    ctx.restore();
  });
  canvas.dataset.paperSnapshotCount = String(snapshots.length);
  canvas.dataset.paperSnapshotColumns = String(width >= 560 ? 2 : 1);
  canvas.dataset.paperSnapshotLabels = snapshots.map((snapshot) => `${snapshot.label}:${snapshot.coordinateLabel}`).join("|");
}

function drawPaperModelSnapshots(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshots: readonly ResolvedPaperSnapshot[],
  canvas: HTMLCanvasElement
): void {
  const cells = paperSnapshotCells(width, height, snapshots.length);
  const modelScaleRows = stableTimeVisualReferenceRows(latestPhaseRows);
  const maxRadius = maximumPhaseRadius(modelScaleRows);
  const convectionActive = convectiveLuminosityAvailable(latestPhaseParameters);
  snapshots.forEach((snapshot, index) => {
    const cell = cells[index];
    drawPaperSnapshotFrame(ctx, cell, snapshot, index);
    const contentTop = cell.top + 26;
    const contentHeight = Math.max(150, cell.height - 30);
    const size = Math.min(cell.width, contentHeight);
    const centerX = cell.left + cell.width / 2;
    const centerY = contentTop + contentHeight / 2;
    const radiusScale = (size * 0.35) / maxRadius;
    const row = snapshot.row;
    const geometry = shellGeometryFromModel(row, latestPhaseParameters);
    const luminosityLevel = normalizedInRange(row.L, latestPhaseLuminosityRange);
    const temperature = inferEffectiveTemperature(row.L, row.R);
    const blackbody = blackbodyRgbForTemperature(temperature);
    const shellColor = scaledRgb(blackbody, 0.58 + luminosityLevel * 0.52);
    const shellDisplayColor = lightModeInvertedSurfaceRgb(shellColor);
    const outerRadius = Math.max(2, geometry.outerRadius * radiusScale);
    const innerRadius = Math.max(0, geometry.innerRadius * radiusScale);
    ctx.save();
    drawModelReferenceGuides(ctx, modelScaleRows, centerX, centerY, radiusScale);
    drawAnnularSegment(
      ctx,
      centerX,
      centerY,
      outerRadius,
      innerRadius,
      convectionActive ? Math.PI / 2 : 0,
      Math.PI * 2,
      rgbCss(shellDisplayColor, 0.5 + luminosityLevel * 0.4)
    );
    if (convectionActive) drawConvectionArcs(ctx, row, centerX, centerY, radiusScale);
    ctx.restore();
  });
  canvas.dataset.paperSnapshotCount = String(snapshots.length);
  canvas.dataset.paperSnapshotColumns = String(width >= 560 ? 2 : 1);
  canvas.dataset.paperSnapshotLabels = snapshots.map((snapshot) => `${snapshot.label}:${snapshot.coordinateLabel}`).join("|");
}

function drawHeatEnginePanel(): void {
  const canvas = document.getElementById("heatEngineCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 292);
  const snapshots = paperModeActive() ? resolvePaperSnapshots(paperPhaseSelection, latestDisplayWindow) : [];
  const height = paperModeActive()
    ? paperSnapshotCanvasHeight(width, snapshots.length, 244)
    : Math.max(230, rect.height || 260);
  if (paperModeActive()) canvas.style.height = `${height}px`;
  else canvas.style.removeProperty("height");
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (paperModeActive()) {
    canvas.dataset.heatEngineMode = "paper";
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
    if (!snapshots.length) {
      canvas.dataset.paperSnapshotCount = "0";
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "static states unavailable");
      return;
    }
    drawPaperPistonSnapshots(ctx, width, height, snapshots, canvas);
    return;
  }
  delete canvas.dataset.paperSnapshotCount;
  delete canvas.dataset.paperSnapshotColumns;
  delete canvas.dataset.paperSnapshotLabels;

  const row = latestPhaseRows.length ? rowAtCurrentDisplayPosition(latestPhaseRows) : null;
  if (!row) {
    canvas.dataset.heatEngineMode = "unavailable";
    canvas.dataset.heatEngineRows = "0";
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
    return;
  }
  const terms = heatEngineTerms(row, latestPhaseParameters);
  if (!terms) {
    canvas.dataset.heatEngineMode = "domain-error";
    drawCanvasMessage(ctx, width, height, "piston visualization unavailable");
    return;
  }

  const cycleRows = downsample(heatEngineCycleRows(latestPhaseRows), 1100, ["R", "V", "H", "Uc", "L", "Lr", "Lc"]);
  canvas.dataset.heatEngineMode = gridState.enabled ? "grid" : "single";
  canvas.dataset.heatEngineRows = String(cycleRows.length);
  canvas.dataset.forceTerms = "pressure,gravity,damping";
  const heatEngineShowsUc = convectiveLuminosityAvailable(latestPhaseParameters);
  const heatEngineConvectionResponsive = heatEngineShowsUc && !convectiveResponseDisabled(latestPhaseParameters);
  canvas.dataset.heatFluxTerms = heatEngineShowsUc ? "source,L_r,L_c" : "source,L_r";
  canvas.dataset.radiativeValve = "opacity";
  canvas.dataset.radiativeValveQuantity = TP_OPACITY_DATA_LABEL;
  canvas.dataset.convectiveValve = heatEngineShowsUc ? (heatEngineConvectionResponsive ? "time-dependent" : "frozen") : "hidden";
  canvas.dataset.convectivePlumeClock = heatEngineShowsUc ? "Uc-integrated closed loop" : "hidden";
  if (heatEngineConvectionResponsive) {
    canvas.dataset.convectiveTarget = "U_c,*";
    canvas.dataset.convectiveLag = fmt(terms.convectiveLag, 6);
  } else {
    delete canvas.dataset.convectiveTarget;
    delete canvas.dataset.convectiveLag;
  }
  delete canvas.dataset.workLoop;
  delete canvas.dataset.workState;
  delete canvas.dataset.workIntegral;
  delete canvas.dataset.cycleWorkNet;
  delete canvas.dataset.cycleWorkRatio;
  delete canvas.dataset.regime;
  delete canvas.dataset.eventLabels;
  if (gridState.enabled) {
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
  } else if (latestDisplayWindow.mode === "time") {
    canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
    delete canvas.dataset.currentPhase;
  } else {
    canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
    delete canvas.dataset.currentTime;
  }

  const chamberLeft = Math.min(78, Math.max(64, width * 0.25));
  const rightReserve = heatEngineShowsUc ? 82 : 24;
  const chamberWidth = Math.max(104, Math.min(160, width - chamberLeft - rightReserve));
  const chamber = {
    left: chamberLeft,
    top: 44,
    width: chamberWidth,
    height: Math.max(142, height - 98)
  };
  drawHeatEnginePistonCausal(ctx, row, cycleRows, terms, chamber, latestPhaseParameters, height);
}

function drawModelVisualization(): void {
  const canvas = el<HTMLCanvasElement>("modelCanvas");
  const panel = canvas.closest<HTMLElement>(".plot-panel");
  if (panel?.hidden) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 320);
  const snapshots = paperModeActive() ? resolvePaperSnapshots(paperPhaseSelection, latestDisplayWindow) : [];
  const height = paperModeActive()
    ? paperSnapshotCanvasHeight(width, snapshots.length, 232)
    : Math.max(260, rect.height || width);
  if (paperModeActive()) canvas.style.height = `${height}px`;
  else canvas.style.removeProperty("height");
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  canvas.dataset.animationSpeed = modelSpeedLabel(modelAnimationSpeed);

  if (paperModeActive()) {
    canvas.dataset.modelMode = "paper";
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
    if (!snapshots.length) {
      canvas.dataset.paperSnapshotCount = "0";
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "static states unavailable");
      return;
    }
    drawPaperModelSnapshots(ctx, width, height, snapshots, canvas);
    return;
  }
  delete canvas.dataset.modelMode;
  delete canvas.dataset.paperSnapshotCount;
  delete canvas.dataset.paperSnapshotColumns;
  delete canvas.dataset.paperSnapshotLabels;

  const row = latestPhaseRows.length ? rowAtCurrentDisplayPosition(latestPhaseRows) : null;
  if (!row) {
    canvas.dataset.convectionActive = "false";
    canvas.dataset.luminosityArcLabels = "";
    canvas.dataset.geometryGuides = "";
    delete canvas.dataset.boundaryLuminosityLines;
    delete canvas.dataset.velocityArcLabel;
    delete canvas.dataset.radiusLabel;
    delete canvas.dataset.currentPhase;
    delete canvas.dataset.currentTime;
    drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
    return;
  }

  const size = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const modelScaleRows = stableTimeVisualReferenceRows(latestPhaseRows);
  const maxRadius = maximumPhaseRadius(modelScaleRows);
  const radiusScale = (size * 0.36) / maxRadius;
  const geometry = shellGeometryFromModel(row, state);
  const luminosityLevel = normalizedInRange(row.L, latestPhaseLuminosityRange);
  const temperature = inferEffectiveTemperature(row.L, row.R);
  const blackbody = blackbodyRgbForTemperature(temperature);
  const shellColor = scaledRgb(blackbody, 0.58 + luminosityLevel * 0.52);
  const shellDisplayColor = lightModeInvertedSurfaceRgb(shellColor);
  const shellShadowColor = lightModeInvertedSurfaceRgb(blackbody);
  const outerRadius = Math.max(2, geometry.outerRadius * radiusScale);
  const innerRadius = Math.max(0, geometry.innerRadius * radiusScale);
  const convectionActive = convectiveLuminosityAvailable();
  const shellAlpha = 0.5 + luminosityLevel * 0.4;

  canvas.dataset.convectionActive = String(convectionActive);
  if (latestDisplayWindow.mode === "time") {
    canvas.dataset.currentTime = fmtFixed(row.tau, 3);
    delete canvas.dataset.currentPhase;
  } else {
    canvas.dataset.currentPhase = fmtFixed(row.tau, 3);
    delete canvas.dataset.currentTime;
  }
  canvas.dataset.luminosityArcLabels = convectionActive ? "L_c,L,L_r" : "";
  canvas.dataset.geometryGuides = "R=1,eta,minR,maxR";
  delete canvas.dataset.boundaryLuminosityLines;
  delete canvas.dataset.velocityArcLabel;
  delete canvas.dataset.radiusLabel;

  ctx.save();
  drawModelReferenceGuides(ctx, modelScaleRows, centerX, centerY, radiusScale);

  ctx.shadowColor = rgbCss(shellShadowColor, 0.65);
  ctx.shadowBlur = paperModeActive() ? 0 : 12 + luminosityLevel * 22;
  drawAnnularSegment(
    ctx,
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    convectionActive ? Math.PI / 2 : 0,
    Math.PI * 2,
    rgbCss(shellDisplayColor, shellAlpha)
  );
  ctx.shadowBlur = 0;

  if (convectionActive) drawConvectionArcs(ctx, row, centerX, centerY, radiusScale);
  ctx.restore();
}

function drawAnimatedPhaseViews(): void {
  drawModelVisualization();
  drawPhasePlots();
  drawHeatEnginePanel();
  drawWorkPanel();
  drawThermodynamicPanel();
  drawPhaseLagPanel();
  drawCepheidGuide();
  drawPhasePortraitPanel();
}

function updateLatestPhaseDisplay(displayWindow: DisplayWindow, gridResult: GridModelResult | null): void {
  latestDisplayWindow = displayWindow;
  syncAnimationPositionToDisplayWindow();
  const phasePeriod = displayWindow.period;
  latestPhaseRows = [...displayWindow.rows];
  latestPhaseParameters = gridResult?.parameters ?? state;
  latestPhaseSample = latestPhaseRows.length ? downsample(latestPhaseRows, 1800, ["L", "V", "H"]) : [];
  latestPhaseMessage = displayWindow.message;
  latestPhasePeriodLabel = displayWindow.mode === "time" ? "time τ" : `phase (period = ${phasePeriod ? fmt(phasePeriod, 3) : "n/a"} τ)`;
  const luminosityRows = stableTimeVisualReferenceRows(latestPhaseRows);
  latestPhaseLuminosityRange = stableTimeEquilibriumDisplayActive()
    ? anchoredVisualRange(luminosityRows.map((row) => row.L), 1, 0.05)
    : rawRange(latestPhaseRows.map((row) => row.L));
}

function drawGridAnimationFrame(): void {
  if (!gridState.enabled) {
    drawAll();
    return;
  }
  const gridResult = currentGridResult();
  if (!gridResult) {
    drawAll();
    return;
  }
  const phaseMessage = gridState.enabled && activeGridRanges().length && !gridState.results.length
    ? gridState.statusText
    : undefined;
  const displayWindow = buildCurrentDisplayWindow(
    latestRows,
    { reason: "ok", reference: null, rows: gridResult.phaseRows, period: gridResult.period },
    gridResult,
    analyticStabilityConditions(gridResult.parameters),
    phaseMessage
  );
  updateGridLoopSliderMarkers();
  updateLatestPhaseDisplay(displayWindow, gridResult);
  updateLatestPeriodogramData(latestRows, displayWindow, { reason: "ok", reference: null, rows: gridResult.phaseRows, period: gridResult.period }, gridResult);
  syncSonificationCurve(displayWindow, gridResult, latestRows);
  drawPhasePlots();
  drawThermodynamicPanel();
  drawPeriodogramPanel();
  drawPhaseLagPanel();
  drawFourierPanel();
  drawStellingwerfReferencePanel();
}

function startModelAnimationLoop(): void {
  if (paperModeActive() || modelAnimationFrame) return;
  const tick = (timestamp: number) => {
    if (paperModeActive()) {
      modelAnimationFrame = 0;
      modelAnimationStartTime = null;
      return;
    }
    if (!document.hidden) {
      if (gridState.enabled) {
        modelAnimationStartTime = null;
      } else if (activePhaseScrub || activePhaseHoverCanvasId) {
        modelAnimationStartTime = null;
      } else {
        if (modelAnimationStartTime === null) {
          modelAnimationStartTime = timestamp - (currentAnimationPhase / displayAnimationEnd(latestDisplayWindow)) * modelAnimationDurationMs();
        }
        const duration = modelAnimationDurationMs();
        const elapsed = (timestamp - modelAnimationStartTime) % duration;
        currentAnimationPhase = (elapsed / duration) * displayAnimationEnd(latestDisplayWindow);
        drawAnimatedPhaseViews();
      }
    } else {
      modelAnimationStartTime = null;
    }
    modelAnimationFrame = window.requestAnimationFrame(tick);
  };
  modelAnimationFrame = window.requestAnimationFrame(tick);
}

function stopModelAnimationLoop(): void {
  if (modelAnimationFrame) {
    window.cancelAnimationFrame(modelAnimationFrame);
    modelAnimationFrame = 0;
  }
  modelAnimationStartTime = null;
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
  const gridResult = gridState.enabled ? currentGridResult() : null;
  const phaseMessage = gridState.enabled && activeGridRanges().length && !gridState.results.length
    ? gridState.statusText
    : phaseUnavailableLabel(phase);
  const stabilityParameters = stabilityDisplayParameters();
  const s72Stability = analyticStabilityConditions(stabilityParameters);
  const displayWindow = buildCurrentDisplayWindow(rows, phase, gridResult, s72Stability, phaseMessage);
  const linearPeriod = linearDynamicPeriod(stabilityParameters);
  const nonlinearPeriod = displayWindow.period;
  updateGridLoopSliderMarkers();
  updateSonificationSourceControls();
  updateDerivationPanel(stabilityParameters, s72Stability);
  const metricsNode = el<HTMLDivElement>("metrics");
  if (s72Stability.convective) metricsNode.dataset.s72Convective = s72State(s72Stability.convective.stable);
  else delete metricsNode.dataset.s72Convective;
  metricsNode.dataset.s72Dynamic = s72State(s72Stability.dynamic.stable);
  metricsNode.dataset.s72Secular = s72State(s72Stability.secular.stable);
  metricsNode.dataset.s72Pulsational = s72State(s72Stability.pulsational.stable);
  metricsNode.dataset.s72All = s72State(s72Stability.allStable);
  metricsNode.dataset.s72M = fmt(s72Stability.m, 6);
  metricsNode.dataset.s72B = fmt(s72Stability.b, 6);
  metricsNode.dataset.s72PhysicsMode = s72Stability.physicsMode;
  metricsNode.dataset.linearPeriodFormula = "2pi/sqrt(chi*Gamma1-4)";
  metricsNode.dataset.linearPeriod = linearPeriod ? fmt(linearPeriod, 6) : "unavailable";
  metricsNode.dataset.nonlinearPeriod = nonlinearPeriod ? fmt(nonlinearPeriod, 6) : "unavailable";
  const stabilityMetricItems: StatusMetricItem[] = s72Stability.conditions.map((condition) => {
    const formula = s72ConditionMetric(s72Stability, condition);
    return {
      label: "",
      value: `<span class="stability-summary">${s72ConditionSummary(condition)}</span><span class="stability-formula">${s72ConditionMetricHtml(s72Stability, condition)}</span>`,
      detail: s72ConditionTitle(s72Stability, condition),
      formula,
      className: s72MetricClass(condition.stable),
      stabilityKind: condition.kind
    };
  });
  const metricItems: StatusMetricItem[] = [
    { label: "stop", value: stopReason, className: okStatus ? "status-ok" : "status-warn" },
    { label: `final \\(${TEX.tau}\\)`, value: final ? fmt(final.tau || 0, 4) : "n/a" },
    { label: "models", value: rows.length },
    { label: "accepted", value: latestResult.stats.acceptedSteps },
    { label: "rejected", value: latestResult.stats.rejectedSteps },
    { label: "max err", value: fmt(latestResult.stats.maxNormalizedError, 3) },
    {
      label: "P_lin =",
      value: linearPeriodMetric(stabilityParameters, linearPeriod),
      detail: linearPeriodTitle(stabilityParameters, linearPeriod),
      className: linearPeriod ? "status-ok" : "status-warn"
    },
    {
      label: "P_nonlin =",
      value: nonlinearPeriod ? fmt(nonlinearPeriod, 3) : "n/a",
      detail: nonlinearPeriodTitle(nonlinearPeriod),
      className: nonlinearPeriod ? "status-ok" : "status-warn"
    },
    { label: "phase", value: displayWindow.mode === "time" ? "time window" : phase.reason === "ok" ? "available" : "unavailable" },
    ...stabilityMetricItems
  ];
  const renderMetric = ({ label, value, className, stabilityKind, detail, formula }: StatusMetricItem) => {
    const stabilityAttribute = stabilityKind
      ? ` data-stability-kind="${stabilityKind}" data-stability-expanded role="button" tabindex="0" aria-expanded="false"${formula ? ` data-stability-formula="${escapeAttribute(formula)}"` : ""}`
      : "";
    const ariaLabelPrefix = label || (stabilityKind ? s72ShortLabel(stabilityKind) : "");
    const detailAttribute = detail
      ? ` data-stability-detail="${escapeAttribute(detail)}" aria-label="${escapeAttribute(`${ariaLabelPrefix}: ${detail}`)}"`
      : "";
    return `<span class="metric${className ? ` ${className}` : ""}"${stabilityAttribute}${detailAttribute}>${label}<b>${value}</b></span>`;
  };
  const [statusSummary, ...statusItems] = metricItems;
  const collapsibleStatusItems = statusItems.slice(0, statusItems.length - stabilityMetricItems.length);
  const alwaysVisibleStatusItems = statusItems.slice(statusItems.length - stabilityMetricItems.length);
  const metricsHtml = statusSummary
    ? `<button type="button" class="metric status-summary-card${statusSummary.className ? ` ${statusSummary.className}` : ""}" data-status-summary aria-expanded="${String(statusMetricsExpanded)}" aria-controls="statusMetricDetails" aria-label="${statusMetricsExpanded ? "Hide" : "Show"} status details"><strong class="status-summary-label">${statusSummary.label}</strong><b>${statusSummary.value}</b><span class="status-disclosure-icon" aria-hidden="true"></span></button><div class="status-metric-details" id="statusMetricDetails"${statusMetricsExpanded ? "" : " hidden"}>${collapsibleStatusItems
      .map(renderMetric)
      .join("")}</div>${alwaysVisibleStatusItems.map(renderMetric).join("")}`
    : "";
  stageMathHtml(metricsNode, metricsHtml);
  queueMathTypeset([metricsNode]);

  updateLatestPhaseDisplay(displayWindow, gridResult);
  updateLatestPeriodogramData(rows, displayWindow, phase, gridResult);
  syncSonificationCurve(displayWindow, gridResult, rows);
  drawModelVisualization();
  drawPhasePlots();
  drawHeatEnginePanel();
  drawWorkPanel();
  drawThermodynamicPanel();
  drawPeriodogramPanel();
  drawPhaseLagPanel();

  const timeXlim = integrationTimeRange(rows);
  const showUcSeries = convectiveVelocityHistoryAvailable(rows);
  const showLuminositySplit = convectiveLuminosityAvailable();
  const timeKeys: PlotSeriesKey[] = showUcSeries ? ["R", "V", "H", "Uc"] : ["R", "V", "H"];
  const lumKeys: PlotSeriesKey[] = showLuminositySplit ? ["L", "Lr", "Lc", "Lb"] : ["L", "Lb"];
  const sampledTimeRows = rowsForInteractivePlot("time", rows, timeKeys);
  const sampledLumRows = rowsForInteractivePlot("lum", rows, lumKeys);
  const timeSeries: Series[] = [
    { label: "R", color: COLORS.R, rows: visibleRows("time", "R", sampledTimeRows), x: (row) => row.tau, y: (row) => row.R },
    { label: "V", color: COLORS.V, rows: visibleRows("time", "V", sampledTimeRows), x: (row) => row.tau, y: (row) => row.V },
    { label: "H", color: COLORS.H, rows: visibleRows("time", "H", sampledTimeRows), x: (row) => row.tau, y: (row) => row.H }
  ];
  if (showUcSeries) {
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
  if (showUcSeries) {
    timeLegendItems.push({ key: "Uc", label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc, toggleLabel: "convective velocity" });
  }
  drawLegend("timeLegend", timeLegendItems, { plotId: "time" });

  const lumSeries: Series[] = [
    { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", sampledLumRows), x: (row) => row.tau, y: (row) => row.L },
    { label: "Lb", color: sourceLuminosityColor(), rows: visibleRows("lum", "Lb", sampledLumRows), x: (row) => row.tau, y: (row) => baseLuminosity(row, state), dash: [7, 5] }
  ];
  if (showLuminositySplit) {
    lumSeries.push(
      { label: "Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lr },
      { label: "Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lc }
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
  const lumLegendItems: LegendItem[] = showLuminositySplit
    ? [
        { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
        { key: "Lr", label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr, toggleLabel: "radiative luminosity" },
        { key: "Lc", label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc, toggleLabel: "convective luminosity" },
        { key: "Lb", label: sourceLuminosityLegendLabel(), color: sourceLuminosityColor(), toggleLabel: "source luminosity" }
      ]
    : [
        { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
        { key: "Lb", label: sourceLuminosityLegendLabel(), color: sourceLuminosityColor(), toggleLabel: "source luminosity" }
      ];
  drawLegend("lumLegend", lumLegendItems, { plotId: "lum" });
  drawFourierPanel();
  drawStellingwerfReferencePanel();
}

function startApp(): void {
  setupThemeToggle();
  setupPaperModeControls();
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
