import { derivedPowers, derivatives, effectiveGammaC, mAt, type ModelParameters } from "./model";

export type StabilityKind = "stable" | "convective" | "secular" | "dynamic" | "pulsational" | "neutral" | "unavailable";
export type AnalyticStabilityKind = "convective" | "secular" | "dynamic" | "pulsational";
export type StabilityPhysicsMode = "convective" | "radiative";

export interface ComplexRoot {
  re: number;
  im: number;
}

export interface StabilityResult {
  equilibriumValid: boolean;
  equilibriumNote?: string;
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
  equilibriumValid: boolean;
  equilibriumNote?: string;
  turbulentPressureFraction: number;
  /** Coefficients of the monic characteristic polynomial, in descending order. */
  coefficients: { a1: number; a2: number; a3: number; a4?: number };
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
    pressureRestoring: number;
    pressureWork: number;
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

function normalizedEquilibriumNote(parameters: ModelParameters): string | undefined {
  if ((parameters.alphaP ?? 0) > 0 && parameters.zetac <= 0 && Math.abs(parameters.uc0 - 1) > 1e-9) {
    return "Frozen Uc differs from 1, so the normalized turbulent-pressure equilibrium is unavailable for this initial state.";
  }
  return undefined;
}

function reducedEquilibriumMode(parameters: ModelParameters): boolean {
  return parameters.zetac <= 0 || (effectiveGammaC(parameters) <= 1e-9 && (parameters.alphaP ?? 0) === 0);
}

/** Linearization of the H-driven model at (R,V,H,Uc)=(1,0,1,1). */
export function equilibriumJacobian(parameters: ModelParameters): number[][] {
  const m = mAt(1, parameters);
  const alpha = parameters.alphaP ?? 0;
  const gasFraction = 1 - alpha;
  const gammaC = effectiveGammaC(parameters);
  const powers = derivedPowers(1, parameters);
  const e = (1 - gammaC) * powers.b - gammaC * powers.c - parameters.sourceExp;
  const q = (1 - gammaC) * (parameters.s + 4);
  const d = m * (parameters.gamma1 - 1) / 2;
  const restoring = m * (gasFraction * parameters.gamma1 + alpha) - 4;
  const pressureWork = 2 * d * alpha / gasFraction;
  return [
    [0, 1, 0, 0],
    [-restoring, 0, gasFraction, 2 * alpha],
    [-parameters.zeta * e, -pressureWork, -parameters.zeta * q, -3 * parameters.zeta * gammaC],
    [-parameters.zetac * d, 0, parameters.zetac / 2, -parameters.zetac]
  ];
}

/** Frozen or decoupled Uc is excluded from the active characteristic polynomial. */
export function equilibriumCharacteristicCoefficients(parameters: ModelParameters): number[] {
  const result = analyticStabilityConditions(parameters).coefficients;
  return result.a4 === undefined
    ? [result.a1, result.a2, result.a3]
    : [result.a1, result.a2, result.a3, result.a4];
}

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
  // A zero Hurwitz margin can coexist with a growing mode. Only report a
  // neutral boundary after excluding the strictly failed conditions.
  const firstUnstable = conditions.find((item) => item.value < -neutralTolerance);
  if (firstUnstable) return firstUnstable.kind;
  if (
    conditions.some((item) => Math.abs(item.value) <= neutralTolerance)
    || additionalMargins.some((value) => Math.abs(value) <= neutralTolerance)
  ) {
    return "neutral";
  }
  return "stable";
}

export function analyticStabilityConditions(parameters: ModelParameters): AnalyticStabilityResult {
  const radius = 1;
  const m = mAt(radius, parameters);
  const powers = derivedPowers(radius, parameters);
  const alpha = parameters.alphaP ?? 0;
  const gasFraction = 1 - alpha;
  const gammaC = effectiveGammaC(parameters);
  const radiativeWeight = 1 - gammaC;
  const eCoefficient = radiativeWeight * powers.b - gammaC * powers.c - parameters.sourceExp;
  const radiativeThermal = radiativeWeight * (parameters.s + 4);
  const restoring = powers.q - 2;
  const pressureRestoring = restoring - alpha * m * (parameters.gamma1 - 1);
  const pressureWork = m * (parameters.gamma1 - 1) * alpha / gasFraction;
  const secularCoupling = gasFraction * eCoefficient + pressureRestoring * radiativeThermal;
  const convectiveCorrection = 1.5 * gammaC * (m - 4)
    + alpha * (eCoefficient + m * (parameters.gamma1 - 1) * radiativeThermal);
  // Pressure support and compression work cancel from a2 and a4. Both
  // contributions must be retained in a3, including the finite Uc response.
  const convectiveResponse = parameters.zeta * parameters.zetac
    * (eCoefficient + restoring * radiativeThermal + 1.5 * gammaC * (m - 4));
  const secularResponse = parameters.zetac * (restoring + pressureWork) + parameters.zeta * secularCoupling;
  const dynamicCoupling = parameters.zeta * parameters.zetac * (radiativeThermal + 1.5 * gammaC) + restoring;
  const thermalResponse = parameters.zetac + parameters.zeta * radiativeThermal;
  const reducedRadiativeMode = reducedEquilibriumMode(parameters);
  const terms = {
    radiativeThermal,
    restoring,
    secularCoupling,
    convectiveCorrection,
    convectiveResponse,
    dynamicCoupling,
    thermalResponse,
    pressureRestoring,
    pressureWork
  };
  const equilibriumNote = normalizedEquilibriumNote(parameters);
  const equilibriumValid = equilibriumNote === undefined;
  const common = {
    equilibriumValid,
    ...(equilibriumNote ? { equilibriumNote } : {}),
    turbulentPressureFraction: alpha
  };

  if (reducedRadiativeMode) {
    const thermalMargin = parameters.zeta * radiativeThermal;
    const secular = condition(
      "secular",
      parameters.zeta * secularCoupling,
      alpha > 0 ? "a3 = zeta * (K * Q + (1 - alpha_p) * E) > 0"
        : "zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4)) > 0"
    );
    const dynamic = condition(
      "dynamic",
      restoring,
      alpha > 0 ? "a2 = K + (1 - alpha_p) * W > 0" : "chi0 * Gamma1 - 4 > 0"
    );
    const pulsational = condition(
      "pulsational",
      gasFraction * (pressureWork * radiativeThermal - eCoefficient),
      alpha > 0 ? "(a1 * a2 - a3) / zeta = (1 - alpha_p) * (W * Q - E) > 0" : "-E > 0"
    );
    const conditions = [secular, dynamic, pulsational];
    return {
      ...common,
      coefficients: { a1: thermalMargin, a2: restoring, a3: parameters.zeta * secularCoupling },
      m,
      b: powers.b,
      physicsMode: "radiative",
      eCoefficient,
      terms,
      dynamic,
      secular,
      pulsational,
      conditions,
      kind: !equilibriumValid ? "unavailable" : thermalMargin < 0 ? "secular" : firstStabilityKind(conditions, [thermalMargin]),
      allStable: equilibriumValid && thermalMargin > 0 && conditions.every((item) => item.stable)
    };
  }

  const convective = condition(
    "convective",
    convectiveResponse,
    alpha > 0 ? "a4 > 0" : "zeta * zeta_c * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4) + 3 * gamma_c * (chi0 - 4) / 2) > 0"
  );
  const secular = condition(
    "secular",
    secularResponse,
    alpha > 0 ? "a3 > 0" : "zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4)) > 0"
  );
  const dynamicValue = secularResponse * dynamicCoupling - convectiveResponse * thermalResponse;
  const dynamic = condition(
    "dynamic",
    dynamicValue,
    alpha > 0 ? "a3 * a2 - a4 * a1 > 0"
      : "[zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4))] * [zeta * zeta_c * ((1 - gamma_c) * (s + 4) + 3 * gamma_c / 2) + chi0 * Gamma1 - 4] - [zeta * zeta_c * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4) + 3 * gamma_c * (chi0 - 4) / 2)] * [zeta_c + zeta * (1 - gamma_c) * (s + 4)] > 0"
  );
  const pulsational = condition(
    "pulsational",
    thermalResponse * dynamicValue - secularResponse ** 2,
    alpha > 0 ? "a1 * (a3 * a2 - a4 * a1) - a3^2 > 0"
      : "[zeta_c + zeta * (1 - gamma_c) * (s + 4)] * dynamic_margin - [zeta_c * (chi0 * Gamma1 - 4) + zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4))]^2 > 0"
  );
  const conditions = [convective, secular, dynamic, pulsational];
  return {
    ...common,
    coefficients: { a1: thermalResponse, a2: dynamicCoupling, a3: secularResponse, a4: convectiveResponse },
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
    kind: !equilibriumValid ? "unavailable" : firstStabilityKind(conditions),
    allStable: equilibriumValid && conditions.every((item) => item.stable)
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
  const equilibriumNote = normalizedEquilibriumNote(parameters);
  if (equilibriumNote) {
    return {
      equilibriumValid: false,
      equilibriumNote,
      kind: "unavailable",
      maxReal: Number.NaN,
      dominant: { re: Number.NaN, im: Number.NaN },
      roots: []
    };
  }
  const jacobian = numericalJacobian({
    ...parameters,
    driver: "h"
  });
  const activeJacobian = reducedEquilibriumMode(parameters)
    ? jacobian.slice(0, 3).map((row) => row.slice(0, 3))
    : jacobian;
  const roots = polynomialRoots(characteristicCoefficients(activeJacobian));
  const dominant = roots.reduce((best, root) => root.re > best.re ? root : best, roots[0] || { re: 0, im: 0 });
  const maxReal = dominant.re;
  const tolerance = 1e-7;
  const kind: StabilityKind = Math.abs(maxReal) <= tolerance
    ? "neutral"
    : maxReal < 0
      ? "stable"
      : Math.abs(dominant.im) < 1e-5 ? "dynamic" : "pulsational";
  return { equilibriumValid: true, kind, maxReal, dominant, roots };
}

export function cepheidStripCoordinate(parameters: Pick<ModelParameters, "zeta" | "zetac">): number {
  const zeta = Math.max(1e-6, parameters.zeta);
  const zetac = Math.max(1e-6, parameters.zetac);
  return Math.min(1, Math.max(0, (Math.log10(zetac / zeta) + 2) / 4));
}
