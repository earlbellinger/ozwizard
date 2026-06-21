import { mAt, type ModelParameters, type Row } from "./model";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface BlackbodySample extends RgbColor {
  temperature: number;
}

export const BLACKBODY_REFERENCE_TEMPERATURE = 6500;

// Charity/Vendian blackbody table, CIE 1964 10-degree observer, 0-255 sRGB "rgb" values.
export const BLACKBODY_RGB_10DEG_TABLE: readonly BlackbodySample[] = [
  { temperature: 1000, r: 255, g: 56, b: 0 },
  { temperature: 1500, r: 255, g: 109, b: 0 },
  { temperature: 2000, r: 255, g: 137, b: 18 },
  { temperature: 2500, r: 255, g: 161, b: 72 },
  { temperature: 3000, r: 255, g: 180, b: 107 },
  { temperature: 3500, r: 255, g: 196, b: 137 },
  { temperature: 4000, r: 255, g: 209, b: 163 },
  { temperature: 4500, r: 255, g: 219, b: 186 },
  { temperature: 5000, r: 255, g: 228, b: 206 },
  { temperature: 5500, r: 255, g: 236, b: 224 },
  { temperature: 6000, r: 255, g: 243, b: 239 },
  { temperature: 6500, r: 255, g: 249, b: 253 },
  { temperature: 7000, r: 245, g: 243, b: 255 },
  { temperature: 7500, r: 235, g: 238, b: 255 },
  { temperature: 8000, r: 227, g: 233, b: 255 },
  { temperature: 8500, r: 220, g: 229, b: 255 },
  { temperature: 9000, r: 214, g: 225, b: 255 },
  { temperature: 9500, r: 208, g: 222, b: 255 },
  { temperature: 10000, r: 204, g: 219, b: 255 },
  { temperature: 10500, r: 200, g: 217, b: 255 },
  { temperature: 11000, r: 196, g: 215, b: 255 },
  { temperature: 11500, r: 193, g: 213, b: 255 },
  { temperature: 12000, r: 191, g: 211, b: 255 },
  { temperature: 12500, r: 188, g: 210, b: 255 },
  { temperature: 13000, r: 186, g: 208, b: 255 }
];

export interface ShellGeometry {
  eta: number;
  outerRadius: number;
  innerRadius: number;
  thickness: number;
  thicknessFraction: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpolateNumber(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

export function normalizeFoldedPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  if (phase === 2) return 2;
  return ((phase % 2) + 2) % 2;
}

export function phaseRowAt(rows: readonly Row[], phase: number): Row | null {
  if (!rows.length) return null;
  const target = normalizeFoldedPhase(phase);
  if (target <= rows[0].tau) return rows[0];
  const last = rows[rows.length - 1];
  if (target >= last.tau) return last;

  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].tau <= target) lo = mid;
    else hi = mid;
  }

  const a = rows[lo];
  const b = rows[hi];
  if (a.tau === b.tau) return a;
  const fraction = (target - a.tau) / (b.tau - a.tau);
  const blend = (key: keyof Row) => interpolateNumber(a[key], b[key], fraction);
  return {
    tau: target,
    R: blend("R"),
    V: blend("V"),
    H: blend("H"),
    Uc: blend("Uc"),
    Lr: blend("Lr"),
    Lc: blend("Lc"),
    L: blend("L")
  };
}

export function inferEffectiveTemperature(
  luminosity: number,
  radius: number,
  referenceTemperature = BLACKBODY_REFERENCE_TEMPERATURE
): number {
  if (luminosity <= 0 || radius <= 0 || !Number.isFinite(luminosity + radius + referenceTemperature)) {
    return referenceTemperature;
  }
  return referenceTemperature * (luminosity / radius ** 2) ** 0.25;
}

export function clampBlackbodyTemperature(temperature: number): number {
  const first = BLACKBODY_RGB_10DEG_TABLE[0].temperature;
  const last = BLACKBODY_RGB_10DEG_TABLE[BLACKBODY_RGB_10DEG_TABLE.length - 1].temperature;
  return clamp(Number.isFinite(temperature) ? temperature : BLACKBODY_REFERENCE_TEMPERATURE, first, last);
}

export function blackbodyRgbForTemperature(temperature: number): RgbColor {
  const clamped = clampBlackbodyTemperature(temperature);
  const first = BLACKBODY_RGB_10DEG_TABLE[0];
  if (clamped <= first.temperature) return { r: first.r, g: first.g, b: first.b };

  for (let index = 1; index < BLACKBODY_RGB_10DEG_TABLE.length; index += 1) {
    const next = BLACKBODY_RGB_10DEG_TABLE[index];
    if (clamped > next.temperature) continue;
    const prev = BLACKBODY_RGB_10DEG_TABLE[index - 1];
    const fraction = (clamped - prev.temperature) / (next.temperature - prev.temperature);
    return {
      r: Math.round(interpolateNumber(prev.r, next.r, fraction)),
      g: Math.round(interpolateNumber(prev.g, next.g, fraction)),
      b: Math.round(interpolateNumber(prev.b, next.b, fraction))
    };
  }

  const last = BLACKBODY_RGB_10DEG_TABLE[BLACKBODY_RGB_10DEG_TABLE.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

export function rgbCss(color: RgbColor, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${color.r}, ${color.g}, ${color.b})`
    : `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

export function shellGeometryFor(radius: number, formFactor: number): ShellGeometry {
  const outerRadius = Number.isFinite(radius) ? Math.max(0, radius) : 1;
  const safeFormFactor = Number.isFinite(formFactor) && formFactor > 0 ? formFactor : 3;
  const eta = Math.cbrt(Math.max(0, 1 - 3 / safeFormFactor));
  const innerRadius = outerRadius * eta;
  const thickness = Math.max(0, outerRadius - innerRadius);
  return {
    eta,
    outerRadius,
    innerRadius,
    thickness,
    thicknessFraction: outerRadius > 0 ? thickness / outerRadius : 0
  };
}

export function shellGeometryFromModel(row: Row, parameters: ModelParameters): ShellGeometry {
  return shellGeometryFor(row.R, mAt(row.R, parameters));
}
