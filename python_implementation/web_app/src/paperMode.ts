import { displayMarkerX, rowAtDisplayPosition, type DisplayWindow } from "./displayWindow";
import type { Row } from "./model";

export type ThemeMode = "dark" | "light" | "paper";
export const PAPER_PHASE_EVENTS = [
  "minL",
  "minV",
  "maxL",
  "maxV",
  "minLr",
  "maxLr",
  "minLc",
  "maxLc",
  "minR",
  "maxR",
  "minTeff",
  "maxTeff"
] as const;

export type PaperPhaseEvent = (typeof PAPER_PHASE_EVENTS)[number];
export type PaperPhasePreset = "extrema" | "quarters" | "custom";

export type PaperPhasePoint =
  | { id: string; kind: "event"; event: PaperPhaseEvent }
  | { id: string; kind: "phase"; phase: number };

export type PaperPhasePointInput =
  | { kind: "event"; event: PaperPhaseEvent }
  | { kind: "phase"; phase: number };

export interface PaperPhaseSelectionV1 {
  schemaVersion: 1;
  preset: PaperPhasePreset;
  points: PaperPhasePoint[];
}

export interface ResolvedPaperSnapshot {
  point: PaperPhasePoint;
  row: Row;
  label: string;
  coordinateLabel: string;
  coordinate: number;
}

export const PAPER_PHASE_STORAGE_KEY = "ozwizard-paper-phases-v1";
export const PAPER_PHASE_POINT_MIN = 1;
export const PAPER_PHASE_POINT_MAX = 8;

const EVENT_LABELS: Record<PaperPhaseEvent, string> = {
  minL: "min light",
  minV: "min V",
  maxL: "max light",
  maxV: "max V",
  minR: "min R",
  maxR: "max R",
  minTeff: "min T",
  maxTeff: "max T",
  minLr: "min Lr",
  maxLr: "max Lr",
  minLc: "min Lc",
  maxLc: "max Lc"
};

const PAPER_PHASE_EVENT_SET = new Set<string>(PAPER_PHASE_EVENTS);

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "paper" ? value : "dark";
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "dark") return "light";
  if (mode === "light") return "paper";
  return "dark";
}

export function paperPhaseEventLabel(event: PaperPhaseEvent): string {
  return EVENT_LABELS[event];
}

export function isPaperPhaseEvent(value: unknown): value is PaperPhaseEvent {
  return typeof value === "string" && PAPER_PHASE_EVENT_SET.has(value);
}

export function extremaPaperPhaseSelection(): PaperPhaseSelectionV1 {
  return {
    schemaVersion: 1,
    preset: "extrema",
    points: [
      { id: "event-minL", kind: "event", event: "minL" },
      { id: "event-minV", kind: "event", event: "minV" },
      { id: "event-maxL", kind: "event", event: "maxL" },
      { id: "event-maxV", kind: "event", event: "maxV" }
    ]
  };
}

export function quarterPaperPhaseSelection(): PaperPhaseSelectionV1 {
  return {
    schemaVersion: 1,
    preset: "quarters",
    points: [0, 0.25, 0.5, 0.75].map((phase, index) => ({
      id: `phase-quarter-${index}`,
      kind: "phase" as const,
      phase
    }))
  };
}

export function normalizePaperPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  const normalized = phase % 1;
  return normalized < 0 ? normalized + 1 : normalized;
}

export function normalizePaperPhaseSelection(value: unknown): PaperPhaseSelectionV1 {
  if (!value || typeof value !== "object") return extremaPaperPhaseSelection();
  const candidate = value as Partial<PaperPhaseSelectionV1>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.points)) return extremaPaperPhaseSelection();
  const points: PaperPhasePoint[] = [];
  const seenIds = new Set<string>();
  for (const item of candidate.points) {
    if (!item || typeof item !== "object" || points.length >= PAPER_PHASE_POINT_MAX) continue;
    const point = item as Partial<PaperPhasePoint> & { event?: unknown; phase?: unknown };
    const id = typeof point.id === "string" && point.id.trim() ? point.id : `paper-point-${points.length + 1}`;
    if (seenIds.has(id)) continue;
    if (point.kind === "event" && isPaperPhaseEvent(point.event)) {
      points.push({ id, kind: "event", event: point.event });
      seenIds.add(id);
    } else if (point.kind === "phase" && typeof point.phase === "number" && Number.isFinite(point.phase)) {
      points.push({ id, kind: "phase", phase: normalizePaperPhase(point.phase) });
      seenIds.add(id);
    }
  }
  if (points.length < PAPER_PHASE_POINT_MIN) return extremaPaperPhaseSelection();
  const preset: PaperPhasePreset = candidate.preset === "extrema" || candidate.preset === "quarters" ? candidate.preset : "custom";
  return { schemaVersion: 1, preset, points };
}

export function addPaperPhasePoint(
  selection: PaperPhaseSelectionV1,
  point: PaperPhasePointInput,
  id = `paper-point-${Date.now().toString(36)}`
): PaperPhaseSelectionV1 {
  if (selection.points.length >= PAPER_PHASE_POINT_MAX) return selection;
  if (point.kind === "event" && selection.points.some((item) => item.kind === "event" && item.event === point.event)) return selection;
  const normalized: PaperPhasePoint = point.kind === "phase"
    ? { id, kind: "phase", phase: normalizePaperPhase(point.phase) }
    : { id, kind: "event", event: point.event };
  return { schemaVersion: 1, preset: "custom", points: [...selection.points, normalized] };
}

export function removePaperPhasePoint(selection: PaperPhaseSelectionV1, id: string): PaperPhaseSelectionV1 {
  if (selection.points.length <= PAPER_PHASE_POINT_MIN) return selection;
  return { schemaVersion: 1, preset: "custom", points: selection.points.filter((point) => point.id !== id) };
}

export function updateNumericPaperPhase(
  selection: PaperPhaseSelectionV1,
  id: string,
  phase: number
): PaperPhaseSelectionV1 {
  return {
    schemaVersion: 1,
    preset: "custom",
    points: selection.points.map((point) => point.id === id && point.kind === "phase"
      ? { ...point, phase: normalizePaperPhase(phase) }
      : point)
  };
}

function eventRow(rows: readonly Row[], event: PaperPhaseEvent): Row | null {
  const valueFor = (row: Row): number | null => {
    if (event.endsWith("Lr")) return row.Lr;
    if (event.endsWith("Lc")) return row.Lc;
    if (event.endsWith("L")) return row.L;
    if (event.endsWith("V")) return row.V;
    if (event.endsWith("R")) return row.R;
    if (!Number.isFinite(row.L) || !Number.isFinite(row.R) || row.L <= 0 || row.R <= 0) return null;
    const temperature = (row.L / (row.R * row.R)) ** 0.25;
    return Number.isFinite(temperature) ? temperature : null;
  };
  const pickMin = event.startsWith("min");
  let selected: Row | null = null;
  let selectedValue = pickMin ? Infinity : -Infinity;
  rows.forEach((row) => {
    const value = valueFor(row);
    if (value === null || !Number.isFinite(value)) return;
    if (!selected || (pickMin ? value < selectedValue : value > selectedValue)) {
      selected = row;
      selectedValue = value;
    }
  });
  return selected;
}

function resolutionRows(display: DisplayWindow): Row[] {
  if (display.mode === "time") return [...display.rows];
  const firstCycle = display.rows.filter((row) => row.tau >= 0 && row.tau < 1);
  return firstCycle.length ? firstCycle : display.rows.filter((row) => row.tau >= 0 && row.tau <= 1);
}

export function resolvePaperSnapshots(
  selection: PaperPhaseSelectionV1,
  display: DisplayWindow
): ResolvedPaperSnapshot[] {
  const rows = resolutionRows(display);
  if (!rows.length) return [];
  return selection.points.flatMap((point) => {
    let row: Row | null;
    if (point.kind === "event") row = eventRow(rows, point.event);
    else row = rowAtDisplayPosition(display, point.phase);
    if (!row) return [];
    const coordinate = display.mode === "time"
      ? (point.kind === "phase" ? displayMarkerX(display, point.phase) : row.tau)
      : normalizePaperPhase(row.tau);
    return [{
      point,
      row,
      label: point.kind === "event" ? paperPhaseEventLabel(point.event) : `phase ${point.phase.toFixed(2)}`,
      coordinateLabel: display.mode === "time" ? `τ = ${coordinate.toFixed(2)}` : `φ = ${coordinate.toFixed(2)}`,
      coordinate
    }];
  });
}

export function centerGridPathIndex(sliderValues: readonly number[], center: number): number {
  if (!sliderValues.length) return 0;
  let bestIndex = 0;
  let bestDistance = Math.abs(sliderValues[0] - center);
  for (let index = 1; index < sliderValues.length; index += 1) {
    const distance = Math.abs(sliderValues[index] - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
