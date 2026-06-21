import { derivedPowers, derivatives, mAt, type ModelParameters } from "./model";

export type StabilityKind = "stable" | "convective" | "secular" | "dynamic" | "pulsational" | "neutral";
export type AnalyticStabilityKind = "convective" | "secular" | "dynamic" | "pulsational";

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
  coefficients: {
    A: number;
    B: number;
    C: number;
    D: number;
    P: number;
    Q: number;
    R: number;
  };
  convective: AnalyticStabilityCondition;
  dynamic: AnalyticStabilityCondition;
  secular: AnalyticStabilityCondition;
  pulsational: AnalyticStabilityCondition;
  kind: StabilityKind;
  allStable: boolean;
}

const EQUILIBRIUM_STATE = [1, 0, 1, 1] as const;

export function analyticStabilityConditions(parameters: ModelParameters): AnalyticStabilityResult {
  const radius = 1;
  const m = mAt(radius, parameters);
  const powers = derivedPowers(radius, parameters);
  const radiativeWeight = 1 - parameters.gammac;
  const pCoefficient = radiativeWeight * powers.b - parameters.gammac * powers.c - parameters.sourceExp;
  const qCoefficient = radiativeWeight * (parameters.s + 4);
  const rCoefficient = powers.q - 2;
  const A = parameters.zeta * parameters.zetac * (
    pCoefficient
    + rCoefficient * qCoefficient
    + 3 * parameters.gammac * (rCoefficient / 2 - powers.d)
  );
  const B = parameters.zetac * rCoefficient + parameters.zeta * (pCoefficient + rCoefficient * qCoefficient);
  const C = parameters.zeta * parameters.zetac * (qCoefficient + 1.5 * parameters.gammac) + rCoefficient;
  const D = parameters.zetac + parameters.zeta * qCoefficient;
  const dynamicValue = B * C - A * D;
  const pulsationalValue = D * dynamicValue - B ** 2;
  const convective: AnalyticStabilityCondition = {
    kind: "convective",
    stable: A > 0,
    value: A,
    threshold: 0,
    margin: A,
    expression: "A > 0"
  };
  const secular: AnalyticStabilityCondition = {
    kind: "secular",
    stable: B > 0,
    value: B,
    threshold: 0,
    margin: B,
    expression: "B > 0"
  };
  const dynamic: AnalyticStabilityCondition = {
    kind: "dynamic",
    stable: dynamicValue > 0,
    value: dynamicValue,
    threshold: 0,
    margin: dynamicValue,
    expression: "B C - A D > 0"
  };
  const pulsational: AnalyticStabilityCondition = {
    kind: "pulsational",
    stable: pulsationalValue > 0,
    value: pulsationalValue,
    threshold: 0,
    margin: pulsationalValue,
    expression: "D(B C - A D) - B^2 > 0"
  };
  const orderedConditions = [convective, secular, dynamic, pulsational] as const;
  const neutralTolerance = 1e-10;
  const firstUnstable = orderedConditions.find((condition) => !condition.stable);
  const kind: StabilityKind = orderedConditions.some((condition) => Math.abs(condition.value) <= neutralTolerance)
    ? "neutral"
    : firstUnstable?.kind ?? "stable";
  return {
    m,
    b: powers.b,
    coefficients: {
      A,
      B,
      C,
      D,
      P: pCoefficient,
      Q: qCoefficient,
      R: rCoefficient
    },
    convective,
    dynamic,
    secular,
    pulsational,
    kind,
    allStable: orderedConditions.every((condition) => condition.stable)
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
