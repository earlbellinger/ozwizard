import {
  CONTROL_GROUPS,
  DEFAULT_PRESET_NAME,
  HERTZSPRUNG_PROGRESSION_PRESET_NAME,
  PRESETS,
  geometryModeFor,
  type ControlParameterKey,
  type Driver,
  type GeometryMode,
  type ModelParameters,
  type PhaseMode,
  type ReferenceFamily
} from "./model";
import {
  normalizeGridRange,
  parameterValueFromSlider,
  sliderMeta,
  sliderValueFromNumericValue,
  type GridRange
} from "./grid";
import { SOLVER_NAMES, type SolverName } from "./solvers";

export const USER_PRESETS_STORAGE_KEY = "ozwizard-user-presets:v1";
export const LOCAL_PRESET_STORE_VERSION = 1;
export const PHASE_LAG_PROGRESSION_PRESET_NAME = "RR Lyrae thermal phase-lag progression";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PresetGridRangeSnapshot {
  key: ControlParameterKey;
  lower: number;
  upper: number;
  center?: number;
}

export interface PresetGridSnapshot {
  enabled: boolean;
  loopKey: ControlParameterKey | null;
  budgetMode: "timeout" | "models";
  timeoutSeconds: number;
  maxModels: number;
  ranges: PresetGridRangeSnapshot[];
}

export interface PresetSnapshot {
  name: string;
  parameters: ModelParameters;
  grid?: PresetGridSnapshot;
}

export interface LocalPresetStore {
  version: typeof LOCAL_PRESET_STORE_VERSION;
  presets: PresetSnapshot[];
}

export interface PresetRegistryEntry extends PresetSnapshot {
  source: "built-in" | "local";
  shadowsBuiltIn: boolean;
}

export interface PresetRegistry {
  entries: PresetRegistryEntry[];
  byName: Map<string, PresetRegistryEntry>;
}

export interface PresetStorageResult {
  store: LocalPresetStore;
  warnings: string[];
}

export interface InlistIssue {
  line: number;
  message: string;
}

export interface InlistParseResult {
  snapshots: PresetSnapshot[];
  errors: InlistIssue[];
  warnings: InlistIssue[];
}

interface ParsedAssignment {
  key: string;
  valueText: string;
  line: number;
}

interface ParsedSection {
  name: string;
  line: number;
  assignments: ParsedAssignment[];
  ignored: boolean;
}

interface PresetDraft {
  name: string;
  line: number;
  controls: Partial<ModelParameters>;
  grid?: PartialParsedGrid;
  hasContent: boolean;
}

interface PartialParsedGrid {
  enabled?: boolean;
  loopKey?: ControlParameterKey | null;
  budgetMode?: "timeout" | "models";
  timeoutSeconds?: number;
  maxModels?: number;
  ranges: PresetGridRangeSnapshot[];
}

export type BaseParametersForName = (name: string) => ModelParameters | undefined;

export interface InlistParseOptions {
  fallbackName?: string;
  baseParameters?: ModelParameters;
  baseParametersForName?: BaseParametersForName;
}

const CONTROL_PARAMETER_KEYS = Object.values(CONTROL_GROUPS)
  .flatMap((controls) => controls.map(([key]) => key));

export const MODEL_PARAMETER_KEYS: Array<keyof ModelParameters> = [
  ...CONTROL_PARAMETER_KEYS,
  "variableM",
  "geometryMode",
  "driver",
  "solver",
  "runUntilStable",
  "referenceFamily",
  "phaseWarmupTau",
  "phaseMinAmplitude",
  "phaseMode"
];

export const SOLVER_PARAMETER_KEYS: Array<keyof ModelParameters> = [
  "solver",
  "runUntilStable",
  ...CONTROL_GROUPS.integration.map(([key]) => key)
];

const SOLVER_PARAMETER_KEY_SET = new Set<keyof ModelParameters>(SOLVER_PARAMETER_KEYS);
const INLIST_CONTROL_PARAMETER_KEYS = MODEL_PARAMETER_KEYS.filter((key) => !SOLVER_PARAMETER_KEY_SET.has(key));

const MODEL_PARAMETER_KEY_BY_NORMALIZED_NAME = new Map<string, keyof ModelParameters>(
  MODEL_PARAMETER_KEYS.map((key) => [normalizeName(String(key)), key])
);

const SOLVER_PARAMETER_KEY_BY_NORMALIZED_NAME = new Map<string, keyof ModelParameters>(
  SOLVER_PARAMETER_KEYS.map((key) => [normalizeName(String(key)), key])
);

const CONTROL_PARAMETER_KEY_BY_NORMALIZED_NAME = new Map<string, ControlParameterKey>(
  CONTROL_PARAMETER_KEYS.map((key) => [normalizeName(String(key)), key])
);

const BOOLEAN_PARAMETER_KEYS = new Set<keyof ModelParameters>(["variableM", "runUntilStable"]);
const OPTIONAL_NUMERIC_PARAMETER_KEYS = new Set<keyof ModelParameters>(["phaseWarmupTau"]);
const NUMERIC_PARAMETER_KEYS = new Set<keyof ModelParameters>([
  ...CONTROL_PARAMETER_KEYS,
  "phaseWarmupTau",
  "phaseMinAmplitude"
]);

const DRIVER_VALUES = new Set<Driver>(["h", "abs-v"]);
const GEOMETRY_VALUES = new Set<GeometryMode>(["constant", "local-exponent", "homogeneous-shell"]);
const SOLVER_VALUES = new Set<SolverName>(SOLVER_NAMES);
const REFERENCE_FAMILY_VALUES = new Set<ReferenceFamily>(["baker", "stellingwerf-1986", "stellingwerf-1987", "local-s-tran", "diagnostic"]);
const PHASE_MODE_VALUES = new Set<PhaseMode>(["reference", "final"]);
const GRID_BUDGET_VALUES = new Set<PresetGridSnapshot["budgetMode"]>(["timeout", "models"]);

const DEFAULT_GRID_SNAPSHOT: PresetGridSnapshot = {
  enabled: false,
  loopKey: null,
  budgetMode: "timeout",
  timeoutSeconds: 3,
  maxModels: 50,
  ranges: []
};

export const BUILT_IN_PRESET_GRIDS: Partial<Record<string, PresetGridSnapshot>> = {
  [HERTZSPRUNG_PROGRESSION_PRESET_NAME]: {
    enabled: true,
    loopKey: "gammac",
    budgetMode: "models",
    timeoutSeconds: DEFAULT_GRID_SNAPSHOT.timeoutSeconds,
    maxModels: 57,
    ranges: [
      {
        key: "gammac",
        lower: 0.01,
        upper: 0.57,
        center: 0.5
      }
    ]
  },
  [PHASE_LAG_PROGRESSION_PRESET_NAME]: {
    enabled: true,
    loopKey: "zeta",
    budgetMode: "models",
    timeoutSeconds: DEFAULT_GRID_SNAPSHOT.timeoutSeconds,
    maxModels: 151,
    ranges: [
      {
        key: "zeta",
        lower: 0.01,
        upper: 10,
        center: 1
      }
    ]
  }
};

export const BUILT_IN_PRESETS: Record<string, ModelParameters> = {
  ...PRESETS,
  [PHASE_LAG_PROGRESSION_PRESET_NAME]: {
    ...PRESETS[DEFAULT_PRESET_NAME],
    gammac: 0.2
  }
};

export function emptyLocalPresetStore(): LocalPresetStore {
  return { version: LOCAL_PRESET_STORE_VERSION, presets: [] };
}

export function cloneModelParameters(parameters: ModelParameters): ModelParameters {
  const geometryMode = geometryModeFor(parameters);
  return { ...parameters, geometryMode, variableM: geometryMode !== "constant" };
}

function mergeImportedParameters(base: ModelParameters, controls: Partial<ModelParameters>): ModelParameters {
  // A legacy file's boolean must be resolved before an exact-shell default is merged.
  const geometryMode = controls.geometryMode
    ?? (controls.variableM === undefined ? geometryModeFor(base) : controls.variableM ? "local-exponent" : "constant");
  return cloneModelParameters({ ...base, ...controls, geometryMode });
}

export function snapshotFromParameters(name: string, parameters: ModelParameters, grid?: PresetGridSnapshot): PresetSnapshot {
  return {
    name: normalizePresetName(name),
    parameters: cloneModelParameters(parameters),
    grid: grid ? cloneGridSnapshot(grid) : undefined
  };
}

export function cloneGridSnapshot(grid: PresetGridSnapshot): PresetGridSnapshot {
  return {
    enabled: grid.enabled,
    loopKey: grid.loopKey,
    budgetMode: grid.budgetMode,
    timeoutSeconds: grid.timeoutSeconds,
    maxModels: grid.maxModels,
    ranges: grid.ranges.map((range) => ({ ...range }))
  };
}

export function mergePresetRegistry(
  builtIns: Record<string, ModelParameters> = BUILT_IN_PRESETS,
  localPresets: readonly PresetSnapshot[] = []
): PresetRegistry {
  const localByName = new Map(localPresets.map((preset) => [preset.name, preset]));
  const entries: PresetRegistryEntry[] = [];
  const used = new Set<string>();

  Object.entries(builtIns).forEach(([name, parameters]) => {
    const local = localByName.get(name);
    const builtInGrid = BUILT_IN_PRESET_GRIDS[name];
    entries.push({
      name,
      parameters: cloneModelParameters(local?.parameters ?? parameters),
      grid: local
        ? local.grid ? cloneGridSnapshot(local.grid) : undefined
        : builtInGrid ? cloneGridSnapshot(builtInGrid) : undefined,
      source: local ? "local" : "built-in",
      shadowsBuiltIn: Boolean(local)
    });
    used.add(name);
  });

  localPresets.forEach((preset) => {
    if (used.has(preset.name)) return;
    entries.push({
      name: preset.name,
      parameters: cloneModelParameters(preset.parameters),
      grid: preset.grid ? cloneGridSnapshot(preset.grid) : undefined,
      source: "local",
      shadowsBuiltIn: false
    });
    used.add(preset.name);
  });

  return {
    entries,
    byName: new Map(entries.map((entry) => [entry.name, entry]))
  };
}

export function upsertLocalPreset(store: LocalPresetStore, snapshot: PresetSnapshot): LocalPresetStore {
  const normalized = {
    ...snapshot,
    name: normalizePresetName(snapshot.name),
    parameters: cloneModelParameters(snapshot.parameters),
    grid: snapshot.grid ? cloneGridSnapshot(snapshot.grid) : undefined
  };
  const presets = store.presets.filter((preset) => preset.name !== normalized.name);
  presets.push(normalized);
  return { version: LOCAL_PRESET_STORE_VERSION, presets };
}

export function removeLocalPreset(store: LocalPresetStore, name: string): LocalPresetStore {
  return {
    version: LOCAL_PRESET_STORE_VERSION,
    presets: store.presets.filter((preset) => preset.name !== name)
  };
}

export function loadLocalPresetStore(storage: StorageLike, key = USER_PRESETS_STORAGE_KEY): PresetStorageResult {
  const warnings: string[] = [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    warnings.push(`Could not read local presets: ${messageFromError(error)}`);
    return { store: emptyLocalPresetStore(), warnings };
  }
  if (!raw) return { store: emptyLocalPresetStore(), warnings };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== LOCAL_PRESET_STORE_VERSION || !Array.isArray(parsed.presets)) {
      warnings.push("Ignored local presets saved by an unsupported version.");
      return { store: emptyLocalPresetStore(), warnings };
    }
    const presets: PresetSnapshot[] = [];
    parsed.presets.forEach((candidate, index) => {
      const normalized = storedPresetSnapshot(candidate);
      if (normalized) presets.push(normalized);
      else warnings.push(`Ignored invalid local preset at index ${index}.`);
    });
    return { store: { version: LOCAL_PRESET_STORE_VERSION, presets }, warnings };
  } catch (error) {
    warnings.push(`Could not parse local presets: ${messageFromError(error)}`);
    return { store: emptyLocalPresetStore(), warnings };
  }
}

export function saveLocalPresetStore(storage: StorageLike, store: LocalPresetStore, key = USER_PRESETS_STORAGE_KEY): void {
  if (!store.presets.length) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(store));
}

export function gridRangeSnapshotFromGridRange(range: GridRange): PresetGridRangeSnapshot {
  const normalized = normalizeGridRange(range);
  return {
    key: normalized.key,
    lower: parameterValueFromSlider(normalized.key, normalized.lowerSliderValue),
    upper: parameterValueFromSlider(normalized.key, normalized.upperSliderValue),
    center: parameterValueFromSlider(normalized.key, normalized.centerSliderValue)
  };
}

export function gridRangeFromSnapshot(snapshot: PresetGridRangeSnapshot, parameters: ModelParameters): GridRange {
  const fallbackCenter = typeof parameters[snapshot.key] === "number"
    ? Number(parameters[snapshot.key])
    : (snapshot.lower + snapshot.upper) / 2;
  const center = snapshot.center ?? fallbackCenter;
  return normalizeGridRange({
    key: snapshot.key,
    lowerSliderValue: sliderValueFromNumericValue(snapshot.key, snapshot.lower),
    upperSliderValue: sliderValueFromNumericValue(snapshot.key, snapshot.upper),
    centerSliderValue: sliderValueFromNumericValue(snapshot.key, center),
    nativeStep: sliderMeta(snapshot.key).step
  });
}

export function parsePresetInlistBundle(text: string, options: InlistParseOptions = {}): InlistParseResult {
  const errors: InlistIssue[] = [];
  const warnings: InlistIssue[] = [];
  const sections = parseSections(text, errors, warnings);
  const fallbackName = normalizePresetName(options.fallbackName ?? "Imported preset");
  const snapshots: PresetSnapshot[] = [];
  let current: PresetDraft | null = null;

  const ensureCurrent = (line: number): PresetDraft => {
    current ??= { name: fallbackName, line, controls: {}, hasContent: false };
    return current;
  };
  const finalizeCurrent = () => {
    if (!current || !current.hasContent) return;
    const name = normalizePresetName(current.name || fallbackName);
    const base = options.baseParametersForName?.(name)
      ?? options.baseParameters
      ?? PRESETS[name]
      ?? PRESETS[DEFAULT_PRESET_NAME];
    snapshots.push({
      name,
      parameters: mergeImportedParameters(base, current.controls),
      grid: normalizeParsedGrid(current.grid)
    });
  };

  sections.forEach((section) => {
    if (section.ignored) return;
    if (section.name === "preset") {
      if (current?.hasContent) {
        finalizeCurrent();
        current = null;
      }
      const draft = ensureCurrent(section.line);
      draft.hasContent = true;
      section.assignments.forEach((assignment) => {
        const key = normalizeName(assignment.key);
        if (key !== "name") {
          warnings.push({ line: assignment.line, message: `Unknown &preset key "${assignment.key}" ignored.` });
          return;
        }
        const value = parseScalar(assignment.valueText);
        if (typeof value === "string" && value.trim()) {
          draft.name = normalizePresetName(value);
        } else {
          errors.push({ line: assignment.line, message: "Preset name must be a non-empty string." });
        }
      });
      return;
    }

    const draft = ensureCurrent(section.line);
    draft.hasContent = true;
    if (section.name === "controls") {
      applyControlsSection(draft, section, errors, warnings);
      return;
    }
    if (section.name === "solver" || section.name === "solvercontrols") {
      applySolverSection(draft, section, errors, warnings);
      return;
    }
    if (section.name === "grid") {
      applyGridSection(draft, section, errors, warnings);
      return;
    }
    if (section.name === "gridrange") {
      applyGridRangeSection(draft, section, errors, warnings);
    }
  });

  finalizeCurrent();
  if (!snapshots.length && !errors.length) errors.push({ line: 1, message: "No preset inlist sections were found." });
  return { snapshots, errors, warnings };
}

export function serializePresetInlistBundle(snapshots: readonly PresetSnapshot[]): string {
  return snapshots.map(serializePresetInlist).join("\n\n");
}

export function serializePresetInlist(snapshot: PresetSnapshot): string {
  const parameters = cloneModelParameters(snapshot.parameters);
  const lines: string[] = [
    "&preset",
    `  name = ${formatInlistValue(snapshot.name)}`,
    "/",
    "",
    "&controls"
  ];
  INLIST_CONTROL_PARAMETER_KEYS.forEach((key) => {
    const value = parameters[key];
    lines.push(`  ${String(key)} = ${formatInlistValue(value)}`);
  });
  lines.push(
    "/",
    "",
    "&solver"
  );
  SOLVER_PARAMETER_KEYS.forEach((key) => {
    const value = parameters[key];
    lines.push(`  ${String(key)} = ${formatInlistValue(value)}`);
  });
  lines.push("/");

  if (snapshot.grid) {
    lines.push(
      "",
      "&grid",
      `  enabled = ${formatInlistValue(snapshot.grid.enabled)}`,
      `  loop_key = ${formatInlistValue(snapshot.grid.loopKey ?? "none")}`,
      `  budget_mode = ${formatInlistValue(snapshot.grid.budgetMode)}`,
      `  timeout_seconds = ${formatInlistValue(snapshot.grid.timeoutSeconds)}`,
      `  max_models = ${formatInlistValue(snapshot.grid.maxModels)}`,
      "/"
    );
    snapshot.grid.ranges.forEach((range) => {
      lines.push(
        "",
        "&grid_range",
        `  key = ${formatInlistValue(range.key)}`,
        `  lower = ${formatInlistValue(range.lower)}`,
        `  upper = ${formatInlistValue(range.upper)}`,
        `  center = ${formatInlistValue(range.center)}`,
        "/"
      );
    });
  }

  return `${lines.join("\n")}\n`;
}

function parseSections(text: string, errors: InlistIssue[], warnings: InlistIssue[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const knownSections = new Set(["preset", "controls", "solver", "solvercontrols", "grid", "gridrange"]);

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const stripped = stripComment(rawLine).trim();
    if (!stripped) return;
    if (stripped.startsWith("&")) {
      const name = normalizeName(stripped.slice(1).trim());
      if (!name) {
        errors.push({ line, message: "Section name is missing after &." });
        return;
      }
      if (current) {
        errors.push({ line, message: `Section &${current.name} is missing a / terminator.` });
      }
      const ignored = !knownSections.has(name);
      if (ignored) warnings.push({ line, message: `Unknown section &${name} ignored.` });
      current = { name, line, assignments: [], ignored };
      sections.push(current);
      return;
    }
    if (stripped === "/") {
      if (!current) errors.push({ line, message: "Found / without an open section." });
      current = null;
      return;
    }
    if (!current) {
      warnings.push({ line, message: "Ignored assignment outside a section." });
      return;
    }
    if (current.ignored) return;
    const assignment = parseAssignment(stripped, line, errors);
    if (assignment) current.assignments.push(assignment);
  });

  const unclosedSection = current as ParsedSection | null;
  if (unclosedSection) errors.push({ line: unclosedSection.line, message: `Section &${unclosedSection.name} is missing a / terminator.` });
  return sections;
}

function parseAssignment(text: string, line: number, errors: InlistIssue[]): ParsedAssignment | null {
  const index = findEqualsOutsideQuotes(text);
  if (index < 0) {
    errors.push({ line, message: "Expected key = value assignment." });
    return null;
  }
  const key = text.slice(0, index).trim();
  const valueText = text.slice(index + 1).trim();
  if (!key || !valueText) {
    errors.push({ line, message: "Assignment key and value are required." });
    return null;
  }
  return { key, valueText, line };
}

function applyControlsSection(
  draft: PresetDraft,
  section: ParsedSection,
  errors: InlistIssue[],
  warnings: InlistIssue[]
): void {
  section.assignments.forEach((assignment) => {
    const key = MODEL_PARAMETER_KEY_BY_NORMALIZED_NAME.get(normalizeName(assignment.key));
    if (!key) {
      warnings.push({ line: assignment.line, message: `Unknown control "${assignment.key}" ignored.` });
      return;
    }
    const parsed = parseModelParameterValue(key, assignment.valueText, assignment.line, errors);
    if (!parsed.ok) return;
    (draft.controls as Record<keyof ModelParameters, ModelParameters[keyof ModelParameters]>)[key] = parsed.value;
  });
}

function applySolverSection(
  draft: PresetDraft,
  section: ParsedSection,
  errors: InlistIssue[],
  warnings: InlistIssue[]
): void {
  section.assignments.forEach((assignment) => {
    const key = SOLVER_PARAMETER_KEY_BY_NORMALIZED_NAME.get(normalizeName(assignment.key));
    if (!key) {
      warnings.push({ line: assignment.line, message: `Unknown solver control "${assignment.key}" ignored.` });
      return;
    }
    const parsed = parseModelParameterValue(key, assignment.valueText, assignment.line, errors);
    if (!parsed.ok) return;
    (draft.controls as Record<keyof ModelParameters, ModelParameters[keyof ModelParameters]>)[key] = parsed.value;
  });
}

function applyGridSection(
  draft: PresetDraft,
  section: ParsedSection,
  errors: InlistIssue[],
  warnings: InlistIssue[]
): void {
  const grid = ensureDraftGrid(draft);
  section.assignments.forEach((assignment) => {
    const key = normalizeName(assignment.key);
    if (key === "enabled") {
      const value = parseBooleanValue(assignment.valueText, assignment.line, errors);
      if (value !== null) grid.enabled = value;
      return;
    }
    if (key === "loopkey") {
      const value = parseScalar(assignment.valueText);
      if (typeof value !== "string") {
        errors.push({ line: assignment.line, message: "grid loop_key must be a parameter name or 'none'." });
        return;
      }
      grid.loopKey = normalizeName(value) === "none" ? null : controlKeyFromText(value, assignment.line, errors);
      return;
    }
    if (key === "budgetmode") {
      const value = parseScalar(assignment.valueText);
      if (typeof value !== "string" || !GRID_BUDGET_VALUES.has(value as PresetGridSnapshot["budgetMode"])) {
        errors.push({ line: assignment.line, message: "grid budget_mode must be 'timeout' or 'models'." });
        return;
      }
      grid.budgetMode = value as PresetGridSnapshot["budgetMode"];
      return;
    }
    if (key === "timeoutseconds") {
      const value = parseNumberValue(assignment.valueText, assignment.line, "grid timeout_seconds", errors);
      if (value !== null) grid.timeoutSeconds = value;
      return;
    }
    if (key === "maxmodels") {
      const value = parseNumberValue(assignment.valueText, assignment.line, "grid max_models", errors);
      if (value !== null) grid.maxModels = value;
      return;
    }
    warnings.push({ line: assignment.line, message: `Unknown &grid key "${assignment.key}" ignored.` });
  });
}

function applyGridRangeSection(
  draft: PresetDraft,
  section: ParsedSection,
  errors: InlistIssue[],
  warnings: InlistIssue[]
): void {
  const grid = ensureDraftGrid(draft);
  grid.enabled ??= true;
  const values = new Map(section.assignments.map((assignment) => [normalizeName(assignment.key), assignment]));
  const keyAssignment = values.get("key");
  const lowerAssignment = values.get("lower");
  const upperAssignment = values.get("upper");
  const centerAssignment = values.get("center");

  section.assignments.forEach((assignment) => {
    const key = normalizeName(assignment.key);
    if (key !== "key" && key !== "lower" && key !== "upper" && key !== "center") {
      warnings.push({ line: assignment.line, message: `Unknown &grid_range key "${assignment.key}" ignored.` });
    }
  });

  if (!keyAssignment || !lowerAssignment || !upperAssignment) {
    errors.push({ line: section.line, message: "&grid_range requires key, lower, and upper." });
    return;
  }

  const rawKey = parseScalar(keyAssignment.valueText);
  if (typeof rawKey !== "string") {
    errors.push({ line: keyAssignment.line, message: "grid_range key must be a parameter name." });
    return;
  }
  const key = controlKeyFromText(rawKey, keyAssignment.line, errors);
  const lower = parseNumberValue(lowerAssignment.valueText, lowerAssignment.line, "grid lower", errors);
  const upper = parseNumberValue(upperAssignment.valueText, upperAssignment.line, "grid upper", errors);
  const center = centerAssignment
    ? parseNumberValue(centerAssignment.valueText, centerAssignment.line, "grid center", errors)
    : null;
  if (!key || lower === null || upper === null || (centerAssignment && center === null)) return;
  grid.ranges.push({
    key,
    lower,
    upper,
    center: center ?? undefined
  });
  if (!grid.loopKey) grid.loopKey = key;
}

function normalizeParsedGrid(grid: PartialParsedGrid | undefined): PresetGridSnapshot | undefined {
  if (!grid) return undefined;
  const ranges = grid.ranges.map((range) => ({ ...range }));
  return {
    enabled: grid.enabled ?? ranges.length > 0,
    loopKey: grid.loopKey ?? ranges[0]?.key ?? null,
    budgetMode: grid.budgetMode ?? DEFAULT_GRID_SNAPSHOT.budgetMode,
    timeoutSeconds: grid.timeoutSeconds ?? DEFAULT_GRID_SNAPSHOT.timeoutSeconds,
    maxModels: grid.maxModels ?? DEFAULT_GRID_SNAPSHOT.maxModels,
    ranges
  };
}

function ensureDraftGrid(draft: PresetDraft): PartialParsedGrid {
  draft.grid ??= { ranges: [] };
  return draft.grid;
}

function parseModelParameterValue(
  key: keyof ModelParameters,
  valueText: string,
  line: number,
  errors: InlistIssue[]
): { ok: true; value: ModelParameters[keyof ModelParameters] } | { ok: false } {
  if (NUMERIC_PARAMETER_KEYS.has(key)) {
    const value = parseScalar(valueText);
    if (value === null && OPTIONAL_NUMERIC_PARAMETER_KEYS.has(key)) return { ok: true, value: undefined };
    if (typeof value === "number") return { ok: true, value };
    errors.push({ line, message: `${String(key)} must be a finite number${OPTIONAL_NUMERIC_PARAMETER_KEYS.has(key) ? " or unset" : ""}.` });
    return { ok: false };
  }
  if (BOOLEAN_PARAMETER_KEYS.has(key)) {
    const value = parseBooleanValue(valueText, line, String(key), errors);
    return value === null ? { ok: false } : { ok: true, value };
  }
  const value = parseScalar(valueText);
  if (typeof value !== "string") {
    errors.push({ line, message: `${String(key)} must be a string value.` });
    return { ok: false };
  }
  if (key === "driver" && DRIVER_VALUES.has(value as Driver)) return { ok: true, value: value as Driver };
  if (key === "geometryMode" && GEOMETRY_VALUES.has(value as GeometryMode)) return { ok: true, value: value as GeometryMode };
  if (key === "solver" && SOLVER_VALUES.has(value as SolverName)) return { ok: true, value: value as SolverName };
  if (key === "referenceFamily" && REFERENCE_FAMILY_VALUES.has(value as ReferenceFamily)) return { ok: true, value: value as ReferenceFamily };
  if (key === "phaseMode" && PHASE_MODE_VALUES.has(value as PhaseMode)) return { ok: true, value: value as PhaseMode };
  errors.push({ line, message: `${String(key)} has unsupported value "${value}".` });
  return { ok: false };
}

function parseBooleanValue(valueText: string, line: number, labelOrErrors: string | InlistIssue[], maybeErrors?: InlistIssue[]): boolean | null {
  const errors = Array.isArray(labelOrErrors) ? labelOrErrors : maybeErrors!;
  const label = Array.isArray(labelOrErrors) ? "value" : labelOrErrors;
  const value = parseScalar(valueText);
  if (typeof value === "boolean") return value;
  errors.push({ line, message: `${label} must be .true. or .false.` });
  return null;
}

function parseNumberValue(valueText: string, line: number, label: string, errors: InlistIssue[]): number | null {
  const value = parseScalar(valueText);
  if (typeof value === "number") return value;
  errors.push({ line, message: `${label} must be a finite number.` });
  return null;
}

function parseScalar(valueText: string): string | number | boolean | null {
  const trimmed = valueText.trim();
  const quote = trimmed[0];
  if ((quote === "'" || quote === "\"") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1).replace(new RegExp(`${escapeRegExp(quote)}${escapeRegExp(quote)}`, "g"), quote);
  }
  const lower = trimmed.toLowerCase();
  if (lower === ".true." || lower === "true") return true;
  if (lower === ".false." || lower === "false") return false;
  if (lower === "unset" || lower === "none" || lower === "null") return null;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[de][+-]?\d+)?$/i.test(trimmed)) {
    const value = Number(trimmed.replace(/[dD]/, "e"));
    if (Number.isFinite(value)) return value;
  }
  return trimmed;
}

function formatInlistValue(value: unknown): string {
  if (value === undefined || value === null) return "unset";
  if (typeof value === "boolean") return value ? ".true." : ".false.";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toPrecision(12).replace(/\.?0+(e|$)/, "$1");
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stripComment(line: string): string {
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) {
        if (line[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "!") return line.slice(0, index);
  }
  return line;
}

function findEqualsOutsideQuotes(text: string): number {
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "=") return index;
  }
  return -1;
}

function controlKeyFromText(value: string, line: number, errors: InlistIssue[]): ControlParameterKey | null {
  const key = CONTROL_PARAMETER_KEY_BY_NORMALIZED_NAME.get(normalizeName(value));
  if (key) return key;
  errors.push({ line, message: `"${value}" is not a grid-capable parameter.` });
  return null;
}

function storedPresetSnapshot(candidate: unknown): PresetSnapshot | null {
  if (!isRecord(candidate) || typeof candidate.name !== "string" || !isRecord(candidate.parameters)) return null;
  const base = PRESETS[candidate.name] ?? PRESETS[DEFAULT_PRESET_NAME];
  const controls: Partial<ModelParameters> = {};
  for (const key of MODEL_PARAMETER_KEYS) {
    if (!(key in candidate.parameters)) continue;
    const value = candidate.parameters[key];
    if (!storedParameterValueIsValid(key, value)) return null;
    (controls as Record<keyof ModelParameters, ModelParameters[keyof ModelParameters]>)[key] = value as ModelParameters[keyof ModelParameters];
  }
  const grid = storedGridSnapshot(candidate.grid);
  return {
    name: normalizePresetName(candidate.name),
    parameters: mergeImportedParameters(base, controls),
    grid
  };
}

function storedGridSnapshot(candidate: unknown): PresetGridSnapshot | undefined {
  if (candidate === undefined) return undefined;
  if (!isRecord(candidate) || !Array.isArray(candidate.ranges)) return undefined;
  const ranges = candidate.ranges
    .map(storedGridRangeSnapshot)
    .filter((range): range is PresetGridRangeSnapshot => Boolean(range));
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : ranges.length > 0,
    loopKey: typeof candidate.loopKey === "string" && CONTROL_PARAMETER_KEYS.includes(candidate.loopKey as ControlParameterKey)
      ? candidate.loopKey as ControlParameterKey
      : ranges[0]?.key ?? null,
    budgetMode: candidate.budgetMode === "models" ? "models" : "timeout",
    timeoutSeconds: finiteNumberOr(candidate.timeoutSeconds, DEFAULT_GRID_SNAPSHOT.timeoutSeconds),
    maxModels: finiteNumberOr(candidate.maxModels, DEFAULT_GRID_SNAPSHOT.maxModels),
    ranges
  };
}

function storedGridRangeSnapshot(candidate: unknown): PresetGridRangeSnapshot | null {
  if (!isRecord(candidate) || typeof candidate.key !== "string" || !CONTROL_PARAMETER_KEYS.includes(candidate.key as ControlParameterKey)) return null;
  if (!Number.isFinite(candidate.lower) || !Number.isFinite(candidate.upper)) return null;
  return {
    key: candidate.key as ControlParameterKey,
    lower: Number(candidate.lower),
    upper: Number(candidate.upper),
    center: Number.isFinite(candidate.center) ? Number(candidate.center) : undefined
  };
}

function storedParameterValueIsValid(key: keyof ModelParameters, value: unknown): boolean {
  if (NUMERIC_PARAMETER_KEYS.has(key)) return (value === undefined && OPTIONAL_NUMERIC_PARAMETER_KEYS.has(key)) || Number.isFinite(value);
  if (BOOLEAN_PARAMETER_KEYS.has(key)) return typeof value === "boolean";
  if (key === "driver") return typeof value === "string" && DRIVER_VALUES.has(value as Driver);
  if (key === "geometryMode") return typeof value === "string" && GEOMETRY_VALUES.has(value as GeometryMode);
  if (key === "solver") return typeof value === "string" && SOLVER_VALUES.has(value as SolverName);
  if (key === "referenceFamily") return typeof value === "string" && REFERENCE_FAMILY_VALUES.has(value as ReferenceFamily);
  if (key === "phaseMode") return typeof value === "string" && PHASE_MODE_VALUES.has(value as PhaseMode);
  return false;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizePresetName(name: string): string {
  return name.trim().replace(/\s+/g, " ") || "Untitled preset";
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
