export type State = number[];
export type Derivative = (t: number, y: readonly number[]) => State;
export type StopCondition = (t: number, y: readonly number[]) => string | null;
export type SolverName = "midpoint" | "rk45" | "dop853";
export type SolverStatus = "complete" | "runaway" | "runaway_trend" | "domain_error" | "step_limit" | "step_count_limit" | "row_limit" | "equilibrium" | "limit_cycle";

export const DEFAULT_SOLVER: SolverName = "rk45";
export const SOLVER_NAMES: SolverName[] = ["rk45", "dop853", "midpoint"];

export interface SolverOptions {
  solver: SolverName;
  rtol: number;
  atol: number;
  initialStep: number;
  maxStep: number;
  minStep: number;
  maxRows: number;
  maxAcceptedSteps: number;
  outputInterval?: number;
  errTol?: number;
}

export interface SolverStats {
  acceptedSteps: number;
  rejectedSteps: number;
  finalStep: number;
  maxNormalizedError: number;
}

export interface OdeResult {
  points: Array<{ t: number; y: State }>;
  status: SolverStatus;
  message: string;
  stats: SolverStats;
}

interface StepResult {
  t: number;
  y: State;
  nextStep: number;
  errorNorm: number;
  rejectedSteps: number;
}

export function defaultSolverOptions(overrides: Partial<SolverOptions> = {}): SolverOptions {
  return {
    solver: DEFAULT_SOLVER,
    rtol: 1e-11,
    atol: 1e-13,
    initialStep: 0.001,
    maxStep: 0.03,
    minStep: 1e-10,
    maxRows: 500000,
    maxAcceptedSteps: 500000,
    errTol: 1e-8,
    ...overrides
  };
}

function clamp(low: number, value: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function rmsNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function combine(y: readonly number[], h: number, stages: readonly State[], coeffs: readonly number[]): State {
  return y.map((value, i) => value + h * coeffs.reduce((sum, coeff, j) => sum + coeff * stages[j][i], 0));
}

function weightedErrorNorm(y0: readonly number[], y1: readonly number[], error: readonly number[], rtol: number, atol: number): number {
  return rmsNorm(error.map((err, i) => err / (atol + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i])))));
}

const RK45_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1];
const RK45_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]
];
const RK45_B = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84];
const RK45_E = [-71 / 57600, 0, 71 / 16695, -71 / 1920, 17253 / 339200, -22 / 525, 1 / 40];

function rk45Step(t: number, y: readonly number[], h: number, derivative: Derivative, rtol: number, atol: number): StepResult {
  const k: State[] = [derivative(t, y)];
  for (let stage = 1; stage < RK45_C.length; stage += 1) {
    const yStage = combine(y, h, k, RK45_A[stage]);
    k.push(derivative(t + RK45_C[stage] * h, yStage));
  }
  const yNew = combine(y, h, k, RK45_B);
  k.push(derivative(t + h, yNew));
  const error = y.map((_value, i) => h * RK45_E.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0));
  return { t: t + h, y: yNew, nextStep: h, errorNorm: weightedErrorNorm(y, yNew, error, rtol, atol), rejectedSteps: 0 };
}

const DOP853_C = [
  0,
  0.526001519587677318785587544488e-1,
  0.789002279381515978178381316732e-1,
  0.11835034190722739672675719751,
  0.28164965809277260327324280249,
  1 / 3,
  0.25,
  0.307692307692307692307692307692,
  0.651282051282051282051282051282,
  0.6,
  0.857142857142857142857142857142,
  1
];
const DOP853_A = [
  [],
  [5.26001519587677318785587544488e-2],
  [1.97250569845378994544595329183e-2, 5.91751709536136983633785987549e-2],
  [2.95875854768068491816892993775e-2, 0, 8.87627564304205475450678981324e-2],
  [2.41365134159266685502369798665e-1, 0, -8.84549479328286085344864962717e-1, 9.24834003261792003115737966543e-1],
  [3.7037037037037037037037037037e-2, 0, 0, 1.70828608729473871279604482173e-1, 1.25467687566822425016691814123e-1],
  [3.7109375e-2, 0, 0, 1.70252211019544039314978060272e-1, 6.02165389804559606850219397283e-2, -1.7578125e-2],
  [3.70920001185047927108779319836e-2, 0, 0, 1.70383925712239993810214054705e-1, 1.07262030446373284651809199168e-1, -1.53194377486244017527936158236e-2, 8.27378916381402288758473766002e-3],
  [6.24110958716075717114429577812e-1, 0, 0, -3.36089262944694129406857109825, -8.68219346841726006818189891453e-1, 2.75920996994467083049415600797e1, 2.01540675504778934086186788979e1, -4.34898841810699588477366255144e1],
  [4.77662536438264365890433908527e-1, 0, 0, -2.48811461997166764192642586468, -5.90290826836842996371446475743e-1, 2.12300514481811942347288949897e1, 1.52792336328824235832596922938e1, -3.32882109689848629194453265587e1, -2.03312017085086261358222928593e-2],
  [-9.3714243008598732571704021658e-1, 0, 0, 5.18637242884406370830023853209, 1.09143734899672957818500254654, -8.14978701074692612513997267357, -1.85200656599969598641566180701e1, 2.27394870993505042818970056734e1, 2.49360555267965238987089396762, -3.0467644718982195003823669022],
  [2.27331014751653820792359768449, 0, 0, -1.05344954667372501984066689879e1, -2.00087205822486249909675718444, -1.79589318631187989172765950534e1, 2.79488845294199600508499808837e1, -2.85899827713502369474065508674, -8.87285693353062954433549289258, 1.23605671757943030647266201528e1, 6.43392746015763530355970484046e-1]
];
const DOP853_B = [5.42937341165687622380535766363e-2, 0, 0, 0, 0, 4.45031289275240888144113950566, 1.89151789931450038304281599044, -5.8012039600105847814672114227, 3.1116436695781989440891606237e-1, -1.52160949662516078556178806805e-1, 2.01365400804030348374776537501e-1, 4.47106157277725905176885569043e-2];
const DOP853_E3 = [-0.189800754072407617382868756574, 0, 0, 0, 0, 4.45031289275240888144113950566, 1.89151789931450038304281599044, -5.8012039600105847814672114227, -0.422682321324528962932445157177, -0.152160949662516078556178806805, 0.201365400804030348374776537501, 0.0226517921983608252170407424708, 0];
const DOP853_E5 = [0.1312004499419488073250102996e-1, 0, 0, 0, 0, -0.1225156446376204440720569753e1, -0.4957589496572501915214079952, 0.1664377182454986536961530415e1, -0.350328848749973681688648729, 0.3341791187130174790297318841, 0.8192320648511571246570742613e-1, -0.2235530786388629525884427845e-1, 0];

function dop853Step(t: number, y: readonly number[], h: number, derivative: Derivative, rtol: number, atol: number): StepResult {
  const k: State[] = [derivative(t, y)];
  for (let stage = 1; stage < DOP853_C.length; stage += 1) {
    const yStage = combine(y, h, k, DOP853_A[stage]);
    k.push(derivative(t + DOP853_C[stage] * h, yStage));
  }
  const yNew = combine(y, h, k, DOP853_B);
  k.push(derivative(t + h, yNew));
  const err5: number[] = [];
  const err3: number[] = [];
  y.forEach((before, i) => {
    const scale = atol + rtol * Math.max(Math.abs(before), Math.abs(yNew[i]));
    err5.push(DOP853_E5.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0) / scale);
    err3.push(DOP853_E3.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0) / scale);
  });
  const err5Norm2 = err5.reduce((sum, value) => sum + value * value, 0);
  const err3Norm2 = err3.reduce((sum, value) => sum + value * value, 0);
  const errorNorm = err5Norm2 === 0 && err3Norm2 === 0
    ? 0
    : Math.abs(h) * err5Norm2 / Math.sqrt((err5Norm2 + 0.01 * err3Norm2) * y.length);
  return { t: t + h, y: yNew, nextStep: h, errorNorm, rejectedSteps: 0 };
}

function midpointStep(t: number, y: readonly number[], h: number, derivative: Derivative, errTol: number): StepResult {
  const y0 = [...y];
  let step = h;
  for (let reset = 0; reset <= 10; reset += 1) {
    const f1 = derivative(t, y0);
    const k1 = f1.map((value) => (step / 2) * value);
    const yMid = y0.map((value, i) => value + k1[i]);
    const f2 = derivative(t + step / 2, yMid);
    const k2 = f2.map((value) => step * value);
    const rawError = k2.reduce((sum, value, i) => sum + (value / 2 - k1[i]) ** 2, 0);
    const scaledError = Math.sqrt(rawError) * step / 2;
    if (scaledError > 10 * errTol) {
      step /= 10;
      continue;
    }
    let nextStep = step;
    if (scaledError > errTol) nextStep *= 0.9;
    else if (scaledError < errTol / 2) nextStep *= 1.1;
    return {
      t: t + step,
      y: y0.map((value, i) => value + k2[i]),
      nextStep,
      errorNorm: scaledError,
      rejectedSteps: reset
    };
  }
  throw new Error("adaptive step reset limit reached");
}

function step(t: number, y: readonly number[], h: number, derivative: Derivative, options: SolverOptions): StepResult {
  if (options.solver === "midpoint") return midpointStep(t, y, h, derivative, options.errTol ?? options.atol);
  if (options.solver === "rk45") return rk45Step(t, y, h, derivative, options.rtol, options.atol);
  return dop853Step(t, y, h, derivative, options.rtol, options.atol);
}

function nextModernStep(h: number, errorNorm: number, order: number, wasRejected: boolean, minStep: number, maxStep: number): number {
  let factor = errorNorm === 0 ? 5 : clamp(0.2, 0.9 * errorNorm ** (-1 / (order + 1)), 5);
  if (wasRejected) factor = Math.min(1, factor);
  return clamp(minStep, Math.abs(h) * factor, maxStep);
}

export function integrate(
  derivative: Derivative,
  y0: readonly number[],
  tEnd: number,
  optionsInput: Partial<SolverOptions>,
  stopCondition?: StopCondition,
  t0 = 0
): OdeResult {
  const options = defaultSolverOptions(optionsInput);
  let t = t0;
  let y = [...y0];
  let h = Math.min(options.initialStep, options.maxStep, Math.max(options.minStep, tEnd - t0 || options.initialStep));
  const points: OdeResult["points"] = [{ t, y: [...y] }];
  let acceptedSteps = 0;
  let rejectedSteps = 0;
  let maxNormalizedError = 0;
  let status: SolverStatus = "complete";
  let message = "complete";
  let nextOutputTime = options.outputInterval ? t0 + options.outputInterval : 0;

  while (t < tEnd) {
    if (acceptedSteps >= options.maxAcceptedSteps) {
      status = "step_count_limit";
      message = "step_count_limit";
      break;
    }
    h = Math.min(h, tEnd - t);
    if (h < options.minStep) {
      status = "step_limit";
      message = "step_limit";
      break;
    }

    let stepRejected = false;
    while (true) {
      let result: StepResult;
      try {
        result = step(t, y, h, derivative, options);
      } catch (error) {
        if (options.solver === "midpoint" || h <= options.minStep) {
          status = "domain_error";
          message = error instanceof Error ? error.message : "domain_error";
          break;
        }
        rejectedSteps += 1;
        stepRejected = true;
        h *= 0.2;
        if (h < options.minStep) {
          status = "step_limit";
          message = "step_limit";
          break;
        }
        continue;
      }

      if (options.solver === "midpoint") {
        t = result.t;
        y = result.y;
        h = clamp(options.minStep, Math.abs(result.nextStep), options.maxStep);
        rejectedSteps += result.rejectedSteps;
        maxNormalizedError = Math.max(maxNormalizedError, result.errorNorm);
        acceptedSteps += 1;
        break;
      }

      if (!result.y.every(Number.isFinite)) {
        status = "domain_error";
        message = "non-finite state";
        break;
      }

      const order = options.solver === "rk45" ? 4 : 7;
      if (result.errorNorm <= 1) {
        t = result.t;
        y = result.y;
        h = nextModernStep(h, result.errorNorm, order, stepRejected, options.minStep, options.maxStep);
        maxNormalizedError = Math.max(maxNormalizedError, result.errorNorm);
        acceptedSteps += 1;
        break;
      }

      rejectedSteps += 1;
      stepRejected = true;
      h = nextModernStep(h, result.errorNorm, order, false, options.minStep, options.maxStep);
      if (h <= options.minStep) {
        status = "step_limit";
        message = "step_limit";
        break;
      }
    }

    if (status !== "complete") break;
    const stopped = stopCondition?.(t, y);
    const shouldStore = !options.outputInterval
      || t >= nextOutputTime - options.outputInterval * 1e-9
      || t >= tEnd
      || Boolean(stopped);
    if (shouldStore) {
      if (points.length >= options.maxRows) {
        status = "row_limit";
        message = "row_limit";
        break;
      }
      points.push({ t, y: [...y] });
      if (options.outputInterval) {
        while (nextOutputTime <= t + options.outputInterval * 1e-9) {
          nextOutputTime += options.outputInterval;
        }
      }
    }
    if (stopped) {
      if (stopped === "runaway" || stopped === "runaway_trend" || stopped === "equilibrium" || stopped === "limit_cycle") {
        status = stopped;
        message = stopped;
      } else {
        status = "domain_error";
        message = stopped;
      }
      break;
    }
  }

  return {
    points,
    status,
    message,
    stats: { acceptedSteps, rejectedSteps, finalStep: h, maxNormalizedError }
  };
}
