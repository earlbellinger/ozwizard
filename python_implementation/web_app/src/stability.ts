import { derivedPowers, derivatives, mAt, type ModelParameters } from "./model";

export type StabilityKind = "stable" | "convective" | "secular" | "dynamic" | "pulsational" | "neutral";
export type AnalyticStabilityKind = "convective" | "secular" | "dynamic" | "pulsational";
export type StabilityPhysicsMode = "convective" | "radiative";

export interface ComplexRoot {
  re: number;
  im: number;
}

export interface StabilityResult {
  kind: StabilityKind;
  maxReal: number;
  dominant: ComplexRoot;
  roots: ComplexRoot[];
}

export interface AnalyticStabilityCondition {
  kind: AnalyticStabilityKind;
  stable: boolean;
  value: number;
  threshold: number;
  margin: number;
  expression: string;
}

export interface AnalyticStabilityResult {
  m: number;
  b: number;
  physicsMode: StabilityPhysicsMode;
  eCoefficient: number;
  terms: {
    radiativeThermal: number;
    restoring: number;
    secularCoupling: number;
    convectiveCorrection: number;
    convectiveResponse: number;
    dynamicCoupling: number;
    thermalResponse: number;
  };
  convective?: AnalyticStabilityCondition;
  dynamic: AnalyticStabilityCondition;
  secular: AnalyticStabilityCondition;
  pulsational: AnalyticStabilityCondition;
  conditions: AnalyticStabilityCondition[];
  kind: StabilityKind;
  allStable: boolean;
}

const EQUILIBRIUM_STATE = [1, 0, 1, 1] as const;

function condition(kind: AnalyticStabilityKind, value: number, expression: string): AnalyticStabilityCondition {
  return {
    kind,
    stable: value > 0,
    value,
    threshold: 0,
    margin: value,
    expression
  };
}

function firstStabilityKind(
  conditions: readonly AnalyticStabilityCondition[],
  additionalMargins: readonly number[] = []
): StabilityKind {
  const neutralTolerance = 1e-10;
  if (
    conditions.some((item) => Math.abs(item.value) <= neutralTolerance)
    || additionalMargins.some((value) => Math.abs(value) <= neutralTolerance)
  ) {
    return "neutral";
  }
  const firstUnstable = conditions.find((item) => !item.stable);
  return firstUnstable?.kind ?? "stable";
}

export function analyticStabilityConditions(parameters: ModelParameters): AnalyticStabilityResult {
  const radius = 1;
  const m = mAt(radius, parameters);
  const powers = derivedPowers(radius, parameters);
  const radiativeWeight = 1 - parameters.gammac;
  const eCoefficient = radiativeWeight * powers.b - parameters.gammac * powers.c - parameters.sourceExp;
  const radiativeThermal = radiativeWeight * (parameters.s + 4);
  const restoring = powers.q - 2;
  const secularCoupling = eCoefficient + restoring * radiativeThermal;
  const convectiveCorrection = 1.5 * parameters.gammac * (m - 4);
  const convectiveResponse = parameters.zeta * parameters.zetac * (secularCoupling + convectiveCorrection);
  const secularResponse = parameters.zetac * restoring + parameters.zeta * secularCoupling;
  const dynamicCoupling = parameters.zeta * parameters.zetac * (radiativeThermal + 1.5 * parameters.gammac) + restoring;
  const thermalResponse = parameters.zetac + parameters.zeta * radiativeThermal;
  const terms = {
    radiativeThermal,
    restoring,
    secularCoupling,
    convectiveCorrection,
    convectiveResponse,
    dynamicCoupling,
    thermalResponse
  };

  if (parameters.zetac <= 0) {
    const thermalMargin = parameters.zeta * radiativeThermal;
    const secular = condition(
      "secular",
      parameters.zeta * secularCoupling,
      "zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4)) > 0"
    );
    const dynamic = condition(
      "dynamic",
      restoring,
      "chi0 * Gamma1 - 4 > 0"
    );
    const pulsational = condition(
      "pulsational",
      -eCoefficient,
      "-E > 0"
    );
    const conditions = [secular, dynamic, pulsational];
    return {
      m,
      b: powers.b,
      physicsMode: "radiative",
      eCoefficient,
      terms,
      dynamic,
      secular,
      pulsational,
      conditions,
      kind: thermalMargin < 0 ? "secular" : firstStabilityKind(conditions, [thermalMargin]),
      allStable: thermalMargin > 0 && conditions.every((item) => item.stable)
    };
  }

  const convective = condition(
    "convective",
    convectiveResponse,
    "zeta * zeta_c * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4) + 3 * gamma_c * (chi0 - 4) / 2) > 0"
  );
  const secular = condition(
    "secular",
    secularResponse,
    "zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4)) > 0"
  );
  const dynamicValue = secularResponse * dynamicCoupling - convectiveResponse * thermalResponse;
  const dynamic = condition(
    "dynamic",
    dynamicValue,
    "[zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4))] * [zeta * zeta_c * ((1 - gamma_c) * (s + 4) + 3 * gamma_c / 2) + chi0 * Gamma1 - 4] - [zeta * zeta_c * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4) + 3 * gamma_c * (chi0 - 4) / 2)] * [zeta_c + zeta * (1 - gamma_c) * (s + 4)] > 0"
  );
  const pulsational = condition(
    "pulsational",
    thermalResponse * dynamicValue - secularResponse ** 2,
    "[zeta_c + zeta * (1 - gamma_c) * (s + 4)] * dynamic_margin - [zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4))]^2 > 0"
  );
  const conditions = [convective, secular, dynamic, pulsational];
  return {
    m,
    b: powers.b,
    physicsMode: "convective",
    eCoefficient,
    terms,
    convective,
    dynamic,
    secular,
    pulsational,
    conditions,
    kind: firstStabilityKind(conditions),
    allStable: conditions.every((item) => item.stable)
  };
}

function cAdd(a: ComplexRoot, b: ComplexRoot): ComplexRoot {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: ComplexRoot, b: ComplexRoot): ComplexRoot {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: ComplexRoot, b: ComplexRoot): ComplexRoot {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cDiv(a: ComplexRoot, b: ComplexRoot): ComplexRoot {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator < 1e-30) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator
  };
}

function cAbs(a: ComplexRoot): number {
  return Math.hypot(a.re, a.im);
}

function evaluatePolynomial(coefficients: readonly number[], value: ComplexRoot): ComplexRoot {
  let result: ComplexRoot = { re: 1, im: 0 };
  for (const coefficient of coefficients) {
    result = cAdd(cMul(result, value), { re: coefficient, im: 0 });
  }
  return result;
}

export function polynomialRoots(coefficients: readonly number[]): ComplexRoot[] {
  const degree = coefficients.length;
  if (degree <= 0) return [];
  const finiteCoefficients = coefficients.map((value) => Number.isFinite(value) ? value : 0);
  const radius = Math.max(1, 1 + Math.max(...finiteCoefficients.map(Math.abs)));
  let roots = Array.from({ length: degree }, (_value, index) => {
    const angle = (2 * Math.PI * (index + 0.35)) / degree;
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) };
  });

  for (let iteration = 0; iteration < 80; iteration += 1) {
    let maxDelta = 0;
    roots = roots.map((root, index) => {
      let denominator: ComplexRoot = { re: 1, im: 0 };
      roots.forEach((other, otherIndex) => {
        if (otherIndex !== index) denominator = cMul(denominator, cSub(root, other));
      });
      const delta = cDiv(evaluatePolynomial(finiteCoefficients, root), denominator);
      maxDelta = Math.max(maxDelta, cAbs(delta));
      return cSub(root, delta);
    });
    if (maxDelta < 1e-10) break;
  }

  return roots.map((root) => ({
    re: Math.abs(root.re) < 1e-10 ? 0 : root.re,
    im: Math.abs(root.im) < 1e-10 ? 0 : root.im
  }));
}

function identity(size: number): number[][] {
  return Array.from({ length: size }, (_row, row) =>
    Array.from({ length: size }, (_column, column) => row === column ? 1 : 0)
  );
}

function multiply(a: readonly number[][], b: readonly number[][]): number[][] {
  const size = a.length;
  return Array.from({ length: size }, (_row, row) =>
    Array.from({ length: size }, (_column, column) => {
      let sum = 0;
      for (let i = 0; i < size; i += 1) sum += a[row][i] * b[i][column];
      return sum;
    })
  );
}

function trace(matrix: readonly number[][]): number {
  return matrix.reduce((sum, row, index) => sum + row[index], 0);
}

function characteristicCoefficients(matrix: readonly number[][]): number[] {
  const size = matrix.length;
  let b = identity(size);
  const coefficients: number[] = [];
  for (let k = 1; k <= size; k += 1) {
    const ab = multiply(matrix, b);
    const coefficient = -trace(ab) / k;
    coefficients.push(coefficient);
    b = ab.map((row, rowIndex) =>
      row.map((value, columnIndex) => value + (rowIndex === columnIndex ? coefficient : 0))
    );
  }
  return coefficients;
}

function numericalJacobian(parameters: ModelParameters): number[][] {
  const base: number[] = [...EQUILIBRIUM_STATE];
  return base.map((_stateValue, column) => {
    const step = column === 1 ? 1e-6 : 1e-5;
    const high = [...base];
    const low = [...base];
    high[column] += step;
    low[column] -= step;
    if (column !== 1) low[column] = Math.max(1e-7, low[column]);
    const highDerivative = derivatives(0, high, parameters);
    const lowDerivative = derivatives(0, low, parameters);
    return highDerivative.map((value, row) => (value - lowDerivative[row]) / (high[column] - low[column]));
  }).reduce<number[][]>((rows, columnValues, column) => {
    columnValues.forEach((value, row) => {
      rows[row] ||= [];
      rows[row][column] = value;
    });
    return rows;
  }, []);
}

export function linearStability(parameters: ModelParameters): StabilityResult {
  const roots = polynomialRoots(characteristicCoefficients(numericalJacobian({
    ...parameters,
    driver: "h"
  })));
  const dominant = roots.reduce((best, root) => root.re > best.re ? root : best, roots[0] || { re: 0, im: 0 });
  const maxReal = dominant.re;
  const tolerance = 1e-7;
  const kind: StabilityKind = Math.abs(maxReal) <= tolerance
    ? "neutral"
    : maxReal < 0
      ? "stable"
      : Math.abs(dominant.im) < 1e-5 ? "dynamic" : "pulsational";
  return { kind, maxReal, dominant, roots };
}

export function cepheidStripCoordinate(parameters: Pick<ModelParameters, "zeta" | "zetac">): number {
  const zeta = Math.max(1e-6, parameters.zeta);
  const zetac = Math.max(1e-6, parameters.zetac);
  return Math.min(1, Math.max(0, (Math.log10(zetac / zeta) + 2) / 4));
}
