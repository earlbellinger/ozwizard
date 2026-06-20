import { type OdeResult, type SolverName, type SolverOptions, defaultSolverOptions, integrate } from "./solvers";

export type Driver = "h" | "abs-v";
export type ReferenceFamily = "baker" | "stellingwerf-1986" | "stellingwerf-1987" | "local-s-tran" | "diagnostic";
export type PhaseMode = "reference" | "final";

export interface ModelParameters {
  zeta: number;
  zetac: number;
  gammac: number;
  m: number;
  gamma1: number;
  n: number;
  s: number;
  sourceExp: number;
  cq: number;
  r0: number;
  v0: number;
  h0: number;
  uc0: number;
  tEnd: number;
  step: number;
  maxStep: number;
  logRtol: number;
  logAtol: number;
  logErrTol: number;
  variableM: boolean;
  driver: Driver;
  solver: SolverName;
  runUntilStable: boolean;
  logStabilityTol: number;
  stableCycles: number;
  referenceFamily: ReferenceFamily;
  phaseWarmupTau?: number;
  phaseMinAmplitude: number;
  phaseMode: PhaseMode;
}

export interface Row {
  tau: number;
  R: number;
  V: number;
  H: number;
  Uc: number;
  Lr: number;
  Lc: number;
  L: number;
}

export interface SolveResult {
  rows: Row[];
  status: OdeResult["status"];
  message: string;
  stats: OdeResult["stats"];
}

export const COLORS = {
  tau: "#9EA7FF",
  R: "#7FA7FF",
  V: "#FF6F91",
  H: "#65D68A",
  Uc: "#F0BD3D",
  L: "#C084FC",
  Lr: "#FFD166",
  Lc: "#55D6D2",
  zeta: "#A78BFA",
  zetac: "#FF7EB6",
  gammac: "#39D4B8",
  m: "#9AA8BD",
  gamma1: "#B994FF",
  n: "#72B7FF",
  s: "#F778BA",
  sourceExp: "#D99A50",
  cq: "#8994A6",
  tEnd: "#9EA7FF",
  step: "#9EA7FF",
  maxStep: "#9EA7FF",
  rtol: "#C0CAE8",
  atol: "#C0CAE8",
  errTol: "#C0CAE8"
} as const;

export const TEX = {
  tau: "\\ozTau{\\tau}",
  R: "\\ozRadius{R}",
  V: "\\ozVelocity{V}",
  H: "\\ozPressure{H}",
  Uc: "\\ozConvective{U_c}",
  L: "\\ozLuminosity{L}",
  Lr: "\\ozRadiative{L_r}",
  Lc: "\\ozConvLum{L_c}",
  zeta: "\\ozZeta{\\zeta}",
  zetac: "\\ozZetac{\\zeta_c}",
  gammac: "\\ozGammac{\\gamma_c}",
  m: "\\ozChiZero{\\chi_0}",
  gamma1: "\\ozGamma{\\Gamma_1}",
  n: "\\ozBlue{n}",
  s: "\\ozPink{s}",
  sourceExp: "\\ozSource{U}",
  cq: "\\ozDamping{C_q}"
} as const;

const TEX_EXTRA = {
  gammaR: "\\ozNeutral{\\gamma_r}",
  eta: "\\ozEta{\\eta}",
  kappa: "\\ozNeutral{\\kappa}",
  rho: "\\ozNeutral{\\rho}",
  temp: "\\ozNeutral{T}"
} as const;

export type NumericParameterKey = {
  [K in keyof ModelParameters]-?: NonNullable<ModelParameters[K]> extends number ? K : never
}[keyof ModelParameters];

export type ControlParameterKey = Exclude<NumericParameterKey, "phaseWarmupTau" | "phaseMinAmplitude">;

export type ControlDef = [ControlParameterKey, string, string, number, number, number, number, string];

export const CONTROL_GROUPS: Record<"physical" | "initial" | "integration", ControlDef[]> = {
  physical: [
    ["zeta", `\\(${TEX.zeta}\\)`, "thermal response", 0.05, 12, 0.05, 1, COLORS.zeta],
    ["zetac", `\\(${TEX.zetac}\\)`, "convective response", 0, 12, 0.05, 1, COLORS.zetac],
    ["gammac", `\\(${TEX.gammac}\\)`, "convective flux fraction", 0, 1, 0.01, 0.2, COLORS.gammac],
    ["m", `\\(${TEX.m}\\)`, "shell form factor", 3, 20, 0.1, 10, COLORS.m],
    ["gamma1", `\\(${TEX.gamma1}\\)`, "adiabatic exponent", 1.01, 1.67, 0.01, 1.1, COLORS.gamma1],
    ["n", `\\(${TEX.n}\\)`, "opacity-density exponent", 0, 3, 0.05, 1, COLORS.n],
    ["s", `\\(${TEX.s}\\)`, "opacity-temperature exponent", 0, 8, 0.1, 3, COLORS.s],
    ["sourceExp", `\\(${TEX.sourceExp}\\)`, "inner luminosity exponent", -2, 2, 0.05, 0, COLORS.sourceExp],
    ["cq", `\\(${TEX.cq}\\)`, "turbulent damping", 0, 10, 0.05, 0, COLORS.cq]
  ],
  initial: [
    ["r0", `\\(${TEX.R}_0\\)`, "initial radius", 0.75, 1.9, 0.01, 1.4, COLORS.R],
    ["v0", `\\(${TEX.V}_0\\)`, "initial radial velocity", -1.2, 1.2, 0.01, 0, COLORS.V],
    ["h0", `\\(${TEX.H}_0\\)`, "initial H factor", 0.3, 1.8, 0.01, 1, COLORS.H],
    ["uc0", `\\(${TEX.Uc}_{0}\\)`, "initial convective velocity", 0, 1.8, 0.01, 1, COLORS.Uc]
  ],
  integration: [
    ["tEnd", `\\(${TEX.tau}_{\\max}\\)`, "max time", 0, 3, 0.01, 100, COLORS.tEnd],
    ["step", `\\(\\Delta ${TEX.tau}_0\\)`, "initial step", 0.0005, 0.02, 0.0005, 0.001, COLORS.step],
    ["maxStep", `\\(\\Delta ${TEX.tau}_{\\max}\\)`, "max adaptive step", 0.005, 0.3, 0.005, 0.15, COLORS.maxStep],
    ["logRtol", "\\(\\ozNeutral{\\log_{10} r_{tol}}\\)", "relative tol", -11, -5, 0.25, -8, COLORS.rtol],
    ["logAtol", "\\(\\ozNeutral{\\log_{10} a_{tol}}\\)", "absolute tol", -13, -7, 0.25, -10, COLORS.atol],
    ["logErrTol", "\\(\\ozNeutral{\\log_{10}\\epsilon}\\)", "tolerance", -8, -4, 0.25, -7, COLORS.errTol],
    ["logStabilityTol", "\\(\\ozNeutral{\\log_{10}\\epsilon_s}\\)", "stability tolerance", -4, -1, 0.25, -2.7, COLORS.errTol],
    ["stableCycles", "\\(\\ozNeutral{N_s}\\)", "stable cycles required", 3, 8, 1, 5, COLORS.errTol]
  ]
};

export const PARAMETER_DESCRIPTIONS: Partial<Record<keyof ModelParameters, string>> = {
  zeta: `Ratio of the model free-fall/dynamical time to the thermal time; larger values make \\(${TEX.H}\\) adjust faster per \\(${TEX.tau}\\).`,
  zetac: `Ratio of the model free-fall/dynamical time to the convective adjustment time; larger values make \\(${TEX.Uc}\\) relax faster, while zero freezes \\(${TEX.Uc}\\).`,
  gammac: `Equilibrium convective luminosity fraction \\(${TEX.gammac}=${TEX.Lc}_{0}/${TEX.L}_{0}\\); the radiative weight is \\(${TEX_EXTRA.gammaR}=1-${TEX.gammac}\\).`,
  m: `User-tunable reference shell form factor that sets \\(${TEX_EXTRA.eta}\\), the shell's inner boundary radius as a fraction of the reference outer radius. Larger \\(${TEX.m}\\) means a thinner shell; when radius-dependent geometry is off, \\(\\ozChi{\\chi}=${TEX.m}\\).`,
  gamma1: `First adiabatic exponent used in the \\(${TEX.H}\\) response.`,
  n: `Density exponent in the opacity convention \\(${TEX_EXTRA.kappa}\\propto${TEX_EXTRA.rho}^{${TEX.n}}${TEX_EXTRA.temp}^{-${TEX.s}}\\).`,
  s: `Temperature exponent in the opacity convention \\(${TEX_EXTRA.kappa}\\propto${TEX_EXTRA.rho}^{${TEX.n}}${TEX_EXTRA.temp}^{-${TEX.s}}\\).`,
  sourceExp: `Exponent \\(${TEX.sourceExp}\\) in the inner luminosity source \\(${TEX.R}^{${TEX.sourceExp}}\\).`,
  cq: "Cubic turbulent damping coefficient in the acceleration equation.",
  r0: `Starting shell radius \\(${TEX.R}_{0}\\).`,
  v0: `Starting radial velocity \\(${TEX.V}_{0}\\).`,
  h0: `Starting nonadiabatic pressure factor \\(${TEX.H}_{0}\\), not the total gas pressure.`,
  uc0: `Starting convective velocity \\(${TEX.Uc}_{0}\\).`,
  tEnd: `Maximum integration time \\(${TEX.tau}\\), measured in free-fall/dynamical time units. The slider uses a logarithmic scale.`,
  step: `Initial adaptive step size \\(\\Delta ${TEX.tau}_0\\).`,
  maxStep: `Maximum step size \\(\\Delta ${TEX.tau}_{\\max}\\) allowed for adaptive solvers.`,
  logRtol: "Base-10 logarithm of the modern relative tolerance.",
  logAtol: "Base-10 logarithm of the modern absolute tolerance.",
  logErrTol: "Base-10 logarithm of the legacy midpoint error tolerance.",
  logStabilityTol: "Base-10 logarithm of the stability classification tolerance.",
  stableCycles: "Number of repeated cycles required before a limit cycle is classified stable."
};

const presetBase = {
  maxStep: 0.15,
  logRtol: -8,
  logAtol: -10,
  solver: "rk45" as SolverName,
  runUntilStable: true,
  logStabilityTol: -2.7,
  stableCycles: 5,
  phaseMinAmplitude: 1e-4,
  phaseMode: "reference" as PhaseMode
};

const paperBase = {
  ...presetBase,
  referenceFamily: "stellingwerf-1986" as const,
  phaseWarmupTau: 4
};

const ozcBase = {
  ...presetBase,
  referenceFamily: "local-s-tran" as const
};

const overtoneBase = {
  ...presetBase,
  referenceFamily: "stellingwerf-1987" as const,
  phaseWarmupTau: 1,
  zeta: 1,
  zetac: 0,
  gammac: 0,
  gamma1: 1.1,
  n: 1,
  s: 3,
  cq: 0,
  v0: 0,
  h0: 0.9,
  uc0: 0,
  tEnd: 10,
  step: 0.001,
  logErrTol: -7,
  variableM: true,
  driver: "h" as Driver,
  runUntilStable: false
};

export const DEFAULT_PRESET_NAME = "RR Lyrae low-amplitude fundamental, damped";

export const PRESETS: Record<string, ModelParameters> = {
  "Baker radiative pulsator": { ...presetBase, referenceFamily: "baker", phaseWarmupTau: 4, zeta: 1, zetac: 0, gammac: 0, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 0, tEnd: 24, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "Blue-edge convection": { ...paperBase, phaseWarmupTau: 24, zeta: 10, zetac: 0.1, gammac: 0.1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 40, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "Instability-strip convection": { ...paperBase, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 15, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "Red-edge convection": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 14, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "Radius-dependent strip": { ...paperBase, phaseWarmupTau: 6, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 0.001, logErrTol: -7, variableM: true, driver: "h", runUntilStable: false },
  "Fully convective runaway": { ...paperBase, phaseWarmupTau: 1, zeta: 2, zetac: 1, gammac: 1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 8, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "Thick convective shell": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 1, m: 5, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 0.001, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
  "RR Lyrae fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.2 },
  "RR Lyrae low-amplitude fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.1 },
  "RR Lyrae low-amplitude fundamental, damped": { ...overtoneBase, phaseWarmupTau: 40, m: 10, sourceExp: -2, cq: 5, r0: 1.1, tEnd: 100 },
  "RR Lyrae first overtone": { ...overtoneBase, m: 15, sourceExp: 2, r0: 1.05 },
  "RR Lyrae first overtone, damped": { ...overtoneBase, phaseWarmupTau: 40, m: 15, sourceExp: 2, cq: 7, r0: 1.05, tEnd: 80 },
  "RR Lyrae high-amplitude first overtone": { ...overtoneBase, m: 15, sourceExp: 2, r0: 1.1 },
  "RR Lyrae second overtone": { ...overtoneBase, m: 20, sourceExp: 1, r0: 1.05 },
  "Local radiative OZ1": { ...presetBase, referenceFamily: "local-s-tran", phaseWarmupTau: 1, zeta: 1, zetac: 0, gammac: 0, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 2, r0: 1.2, v0: 0, h0: 0.8, uc0: 0, tEnd: 20, step: 0.012, logErrTol: -5, variableM: true, driver: "h", runUntilStable: false },
  "Local convective OZC": { ...ozcBase, zeta: 1, zetac: 1, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 1, r0: 1.4, v0: 0, h0: 0.9, uc0: 0.7, tEnd: 20, step: 0.001, logErrTol: -5, variableM: true, driver: "h", runUntilStable: false },
  "OZC abs(V) driver diagnostic": { ...ozcBase, referenceFamily: "diagnostic", zeta: 1, zetac: 1, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 1, r0: 1.4, v0: 0, h0: 0.9, uc0: 0.7, tEnd: 20, step: 0.001, logErrTol: -5, variableM: true, driver: "abs-v", runUntilStable: false }
};

export function mAt(radius: number, p: ModelParameters): number {
  if (!p.variableM) return p.m;
  const eta = (1 - 3 / p.m) ** (1 / 3);
  return 3 / (1 - (eta / radius) ** 3);
}

export function derivedPowers(radius: number, p: ModelParameters): { m: number; b: number; q: number; c: number; d: number } {
  const m = mAt(radius, p);
  const gamma11 = p.gamma1 - 1;
  const b1 = (p.s + 4) * gamma11;
  return {
    m,
    b: 4 + m * (p.n - b1),
    q: m * p.gamma1 - 2,
    c: m - 2,
    d: (m * gamma11) / 2
  };
}

export function sample(tau: number, y: readonly number[], p: ModelParameters): Row {
  const [radius, velocity, pressure, convectiveVelocity] = y;
  const powers = derivedPowers(radius, p);
  const lr = radius ** powers.b * pressure ** (p.s + 4);
  const lc = radius ** (-powers.c) * convectiveVelocity ** 3;
  const gammar = 1 - p.gammac;
  return { tau, R: radius, V: velocity, H: pressure, Uc: convectiveVelocity, Lr: lr, Lc: lc, L: gammar * lr + p.gammac * lc };
}

export function derivatives(_t: number, y: readonly number[], p: ModelParameters): number[] {
  const [radius, velocity, pressure, convectiveVelocity] = y;
  if (radius <= 0 || pressure <= 0 || !Number.isFinite(radius + velocity + pressure + convectiveVelocity)) {
    throw new Error("model left the positive-radius/positive-H domain");
  }
  const powers = derivedPowers(radius, p);
  const lr = radius ** powers.b * pressure ** (p.s + 4);
  const lc = radius ** (-powers.c) * convectiveVelocity ** 3;
  const gammar = 1 - p.gammac;
  const driver = p.driver === "h" ? Math.sqrt(pressure) : Math.sqrt(Math.abs(velocity));
  return [
    velocity,
    pressure / radius ** powers.q - 1 / radius ** 2 - p.cq * velocity ** 3,
    p.zeta * radius ** (powers.m * (p.gamma1 - 1)) * (radius ** p.sourceExp - gammar * lr - p.gammac * lc),
    p.zetac * (radius ** (-powers.d) * driver - convectiveVelocity)
  ];
}

export function solverOptionsFromParameters(p: ModelParameters, solver = p.solver): SolverOptions {
  return defaultSolverOptions({
    solver,
    rtol: 10 ** p.logRtol,
    atol: 10 ** p.logAtol,
    initialStep: p.step,
    maxStep: p.maxStep,
    minStep: 1e-10,
    maxRows: 60000,
    maxAcceptedSteps: 600000,
    outputInterval: Math.max(0.005, Math.min(0.02, p.tEnd / 12000)),
    errTol: 10 ** p.logErrTol
  });
}

type StableStatus = "equilibrium" | "limit_cycle";

class StabilityDetector {
  private readonly rows: Row[] = [];
  private readonly peakIndices: number[] = [];

  constructor(
    private readonly tolerance: number,
    private readonly stableCycles: number,
    private readonly minTime = 2,
    private readonly equilibriumWindow = 1.5
  ) {}

  observe(row: Row): StableStatus | null {
    this.rows.push(row);
    this.captureLuminosityPeak();
    if (row.tau < this.minTime) return null;
    if (this.isEquilibrium()) return "equilibrium";
    if (this.isLimitCycle()) return "limit_cycle";
    return null;
  }

  private captureLuminosityPeak(): void {
    if (this.rows.length < 3) return;
    const prev = this.rows[this.rows.length - 3];
    const peak = this.rows[this.rows.length - 2];
    const current = this.rows[this.rows.length - 1];
    if (peak.tau < this.minTime) return;
    if (prev.L < peak.L && peak.L >= current.L) {
      const previousPeakIndex = this.peakIndices.at(-1);
      if (previousPeakIndex !== undefined && peak.tau - this.rows[previousPeakIndex].tau < 0.05) {
        if (peak.L > this.rows[previousPeakIndex].L) this.peakIndices[this.peakIndices.length - 1] = this.rows.length - 2;
      } else {
        this.peakIndices.push(this.rows.length - 2);
      }
    }
  }

  private isEquilibrium(): boolean {
    const end = this.rows.at(-1)?.tau ?? 0;
    const window: Row[] = [];
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (end - this.rows[i].tau > this.equilibriumWindow) break;
      window.push(this.rows[i]);
    }
    if (window.length < 6 || end - window.at(-1)!.tau < this.equilibriumWindow * 0.75) return false;
    for (const key of ["R", "V", "H", "Uc", "L"] as const) {
      const values = window.map((row) => row[key]);
      const scale = Math.max(1, ...values.map(Math.abs));
      if ((Math.max(...values) - Math.min(...values)) / scale > this.tolerance) return false;
    }
    return Math.max(...window.map((row) => Math.abs(row.V))) < this.tolerance;
  }

  private isLimitCycle(): boolean {
    const neededPeaks = this.stableCycles + 1;
    if (this.peakIndices.length < neededPeaks) return false;
    const peaks = this.peakIndices.slice(-neededPeaks);
    const periods: number[] = [];
    const amplitudes: number[] = [];
    const peakLuminosities: number[] = [];
    for (let i = 0; i < peaks.length - 1; i += 1) {
      const left = peaks[i];
      const right = peaks[i + 1];
      periods.push(this.rows[right].tau - this.rows[left].tau);
      const cycle = this.rows.slice(left, right + 1);
      const lum = cycle.map((row) => row.L);
      amplitudes.push(Math.max(...lum) - Math.min(...lum));
      peakLuminosities.push(this.rows[right].L);
    }
    return this.relativeSpreadOk(periods)
      && this.relativeSpreadOk(amplitudes)
      && this.relativeSpreadOk(peakLuminosities);
  }

  private relativeSpreadOk(values: number[]): boolean {
    if (values.length < 2) return false;
    const center = Math.max(Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length), 1e-12);
    return (Math.max(...values) - Math.min(...values)) / center <= this.tolerance;
  }
}

export function solveModel(p: ModelParameters, solver = p.solver): SolveResult {
  const stabilityMinTime = Math.max(2, p.phaseWarmupTau ?? 2);
  const detector = new StabilityDetector(10 ** p.logStabilityTol, p.stableCycles, stabilityMinTime);
  detector.observe(sample(0, [p.r0, p.v0, p.h0, p.uc0], p));
  const result = integrate(
    (t, y) => derivatives(t, y, p),
    [p.r0, p.v0, p.h0, p.uc0],
    p.tEnd,
    solverOptionsFromParameters(p, solver),
    (t, y) => {
      const row = sample(t, y, p);
      if (Math.abs(row.R) > 30 || Math.abs(row.L) > 1e5 || Math.abs(row.H) > 1e5) return "runaway";
      if (p.runUntilStable && row.R > 20 && row.V > 0) return "runaway_trend";
      return p.runUntilStable ? detector.observe(row) : null;
    }
  );
  const message = p.runUntilStable && result.status === "complete" ? "max_time" : result.message;
  return {
    rows: result.points.map((point) => sample(point.t, point.y, p)),
    status: result.status,
    message,
    stats: result.stats
  };
}

function interpolateRow(rows: readonly Row[], time: number): Row | null {
  if (!rows.length || time < rows[0].tau || time > rows[rows.length - 1].tau) return null;
  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].tau <= time) lo = mid;
    else hi = mid;
  }
  const a = rows[lo];
  const b = rows[Math.min(hi, rows.length - 1)];
  if (a.tau === b.tau) return a;
  const f = (time - a.tau) / (b.tau - a.tau);
  const blend = (key: keyof Row) => a[key] + (b[key] - a[key]) * f;
  return { tau: time, R: blend("R"), V: blend("V"), H: blend("H"), Uc: blend("Uc"), Lr: blend("Lr"), Lc: blend("Lc"), L: blend("L") };
}

export interface ComparisonMetrics {
  commonPoints: number;
  maxStateDelta: number;
  maxLuminosityDelta: number;
}

export function compareRows(selected: readonly Row[], baseline: readonly Row[], p: ModelParameters): ComparisonMetrics {
  let commonPoints = 0;
  let maxStateDelta = 0;
  let maxLuminosityDelta = 0;
  const rtol = 10 ** p.logRtol;
  const atol = 10 ** p.logAtol;
  for (const row of selected) {
    const other = interpolateRow(baseline, row.tau);
    if (!other) continue;
    commonPoints += 1;
    const stateDelta = Math.sqrt(
      (["R", "V", "H", "Uc"] as const).reduce((sum, key) => {
        const scale = atol + rtol * Math.max(Math.abs(row[key]), Math.abs(other[key]));
        return sum + ((row[key] - other[key]) / scale) ** 2;
      }, 0) / 4
    );
    maxStateDelta = Math.max(maxStateDelta, stateDelta);
    maxLuminosityDelta = Math.max(maxLuminosityDelta, Math.abs(row.L - other.L));
  }
  return { commonPoints, maxStateDelta, maxLuminosityDelta };
}
