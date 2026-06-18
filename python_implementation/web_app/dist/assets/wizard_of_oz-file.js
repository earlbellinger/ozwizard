"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/solvers.ts
  var DEFAULT_SOLVER = "rk45";
  var SOLVER_NAMES = ["rk45", "dop853", "midpoint"];
  function defaultSolverOptions(overrides = {}) {
    return {
      solver: DEFAULT_SOLVER,
      rtol: 1e-8,
      atol: 1e-10,
      initialStep: 1e-3,
      maxStep: 0.15,
      minStep: 1e-10,
      maxRows: 5e5,
      errTol: 1e-7,
      ...overrides
    };
  }
  function clamp(low, value, high) {
    return Math.min(Math.max(value, low), high);
  }
  function rmsNorm(values) {
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  }
  function combine(y, h, stages, coeffs) {
    return y.map((value, i) => value + h * coeffs.reduce((sum, coeff, j) => sum + coeff * stages[j][i], 0));
  }
  function weightedErrorNorm(y0, y1, error, rtol, atol) {
    return rmsNorm(error.map((err, i) => err / (atol + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i])))));
  }
  var RK45_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1];
  var RK45_A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]
  ];
  var RK45_B = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84];
  var RK45_E = [-71 / 57600, 0, 71 / 16695, -71 / 1920, 17253 / 339200, -22 / 525, 1 / 40];
  function rk45Step(t, y, h, derivative, rtol, atol) {
    const k = [derivative(t, y)];
    for (let stage = 1; stage < RK45_C.length; stage += 1) {
      const yStage = combine(y, h, k, RK45_A[stage]);
      k.push(derivative(t + RK45_C[stage] * h, yStage));
    }
    const yNew = combine(y, h, k, RK45_B);
    k.push(derivative(t + h, yNew));
    const error = y.map((_value, i) => h * RK45_E.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0));
    return { t: t + h, y: yNew, nextStep: h, errorNorm: weightedErrorNorm(y, yNew, error, rtol, atol), rejectedSteps: 0 };
  }
  var DOP853_C = [
    0,
    0.05260015195876773,
    0.0789002279381516,
    0.1183503419072274,
    0.2816496580927726,
    1 / 3,
    0.25,
    0.3076923076923077,
    0.6512820512820513,
    0.6,
    0.8571428571428571,
    1
  ];
  var DOP853_A = [
    [],
    [0.05260015195876773],
    [0.0197250569845379, 0.0591751709536137],
    [0.02958758547680685, 0, 0.08876275643042054],
    [0.2413651341592667, 0, -0.8845494793282861, 0.924834003261792],
    [0.037037037037037035, 0, 0, 0.17082860872947386, 0.12546768756682242],
    [0.037109375, 0, 0, 0.17025221101954405, 0.06021653898045596, -0.017578125],
    [0.03709200011850479, 0, 0, 0.17038392571223998, 0.10726203044637328, -0.015319437748624402, 0.008273789163814023],
    [0.6241109587160757, 0, 0, -3.3608926294469414, -0.868219346841726, 27.59209969944671, 20.154067550477894, -43.48988418106996],
    [0.47766253643826434, 0, 0, -2.4881146199716677, -0.590290826836843, 21.230051448181193, 15.279233632882423, -33.28821096898486, -0.020331201708508627],
    [-0.9371424300859873, 0, 0, 5.186372428844064, 1.0914373489967295, -8.149787010746927, -18.52006565999696, 22.739487099350505, 2.4936055526796523, -3.0467644718982196],
    [2.273310147516538, 0, 0, -10.53449546673725, -2.0008720582248625, -17.9589318631188, 27.94888452941996, -2.8589982771350235, -8.87285693353063, 12.360567175794303, 0.6433927460157636]
  ];
  var DOP853_B = [0.054293734116568765, 0, 0, 0, 0, 4.450312892752409, 1.8915178993145003, -5.801203960010585, 0.3111643669578199, -0.1521609496625161, 0.20136540080403034, 0.04471061572777259];
  var DOP853_E3 = [-0.18980075407240762, 0, 0, 0, 0, 4.450312892752409, 1.8915178993145003, -5.801203960010585, -0.422682321324529, -0.1521609496625161, 0.20136540080403034, 0.022651792198360825, 0];
  var DOP853_E5 = [0.01312004499419488, 0, 0, 0, 0, -1.2251564463762044, -0.4957589496572502, 1.6643771824549864, -0.35032884874997366, 0.3341791187130175, 0.08192320648511571, -0.022355307863886294, 0];
  function dop853Step(t, y, h, derivative, rtol, atol) {
    const k = [derivative(t, y)];
    for (let stage = 1; stage < DOP853_C.length; stage += 1) {
      const yStage = combine(y, h, k, DOP853_A[stage]);
      k.push(derivative(t + DOP853_C[stage] * h, yStage));
    }
    const yNew = combine(y, h, k, DOP853_B);
    k.push(derivative(t + h, yNew));
    const err5 = [];
    const err3 = [];
    y.forEach((before, i) => {
      const scale = atol + rtol * Math.max(Math.abs(before), Math.abs(yNew[i]));
      err5.push(DOP853_E5.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0) / scale);
      err3.push(DOP853_E3.reduce((sum, coeff, j) => sum + coeff * k[j][i], 0) / scale);
    });
    const err5Norm2 = err5.reduce((sum, value) => sum + value * value, 0);
    const err3Norm2 = err3.reduce((sum, value) => sum + value * value, 0);
    const errorNorm = err5Norm2 === 0 && err3Norm2 === 0 ? 0 : Math.abs(h) * err5Norm2 / Math.sqrt((err5Norm2 + 0.01 * err3Norm2) * y.length);
    return { t: t + h, y: yNew, nextStep: h, errorNorm, rejectedSteps: 0 };
  }
  function midpointStep(t, y, h, derivative, errTol) {
    const y0 = [...y];
    let step2 = h;
    for (let reset = 0; reset <= 10; reset += 1) {
      const f1 = derivative(t, y0);
      const k1 = f1.map((value) => step2 / 2 * value);
      const yMid = y0.map((value, i) => value + k1[i]);
      const f2 = derivative(t + step2 / 2, yMid);
      const k2 = f2.map((value) => step2 * value);
      const rawError = k2.reduce((sum, value, i) => sum + (value / 2 - k1[i]) ** 2, 0);
      const scaledError = Math.sqrt(rawError) * step2 / 2;
      if (scaledError > 10 * errTol) {
        step2 /= 10;
        continue;
      }
      let nextStep = step2;
      if (scaledError > errTol) nextStep *= 0.9;
      else if (scaledError < errTol / 2) nextStep *= 1.1;
      return {
        t: t + step2,
        y: y0.map((value, i) => value + k2[i]),
        nextStep,
        errorNorm: scaledError,
        rejectedSteps: reset
      };
    }
    throw new Error("adaptive step reset limit reached");
  }
  function step(t, y, h, derivative, options) {
    if (options.solver === "midpoint") return midpointStep(t, y, h, derivative, options.errTol ?? options.atol);
    if (options.solver === "rk45") return rk45Step(t, y, h, derivative, options.rtol, options.atol);
    return dop853Step(t, y, h, derivative, options.rtol, options.atol);
  }
  function nextModernStep(h, errorNorm, order, wasRejected, minStep, maxStep) {
    let factor = errorNorm === 0 ? 5 : clamp(0.2, 0.9 * errorNorm ** (-1 / (order + 1)), 5);
    if (wasRejected) factor = Math.min(1, factor);
    return clamp(minStep, Math.abs(h) * factor, maxStep);
  }
  function integrate(derivative, y0, tEnd, optionsInput, stopCondition, t0 = 0) {
    const options = defaultSolverOptions(optionsInput);
    let t = t0;
    let y = [...y0];
    let h = Math.min(options.initialStep, options.maxStep, Math.max(options.minStep, tEnd - t0 || options.initialStep));
    const points = [{ t, y: [...y] }];
    let acceptedSteps = 0;
    let rejectedSteps = 0;
    let maxNormalizedError = 0;
    let status = "complete";
    let message = "complete";
    while (t < tEnd) {
      if (points.length >= options.maxRows) {
        status = "row_limit";
        message = "row_limit";
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
        let result;
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
      points.push({ t, y: [...y] });
      const stopped = stopCondition?.(t, y);
      if (stopped) {
        if (stopped === "runaway" || stopped === "equilibrium" || stopped === "limit_cycle") {
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

  // src/model.ts
  var COLORS = {
    tau: "#9EA7FF",
    R: "#7FA7FF",
    V: "#FF6F91",
    P: "#65D68A",
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
  };
  var TEX = {
    tau: "\\ozTau{\\tau}",
    R: "\\ozRadius{R}",
    V: "\\ozVelocity{V}",
    P: "\\ozPressure{P}",
    Uc: "\\ozConvective{U_c}",
    L: "\\ozLuminosity{L}",
    Lr: "\\ozRadiative{L_r}",
    Lc: "\\ozConvLum{L_c}",
    zeta: "\\ozZeta{\\zeta}",
    zetac: "\\ozZetac{\\zeta_c}",
    gammac: "\\ozGammac{\\gamma_c}",
    m: "\\ozMass{m}",
    gamma1: "\\ozGamma{\\Gamma_1}",
    n: "\\ozBlue{n}",
    s: "\\ozPink{s}",
    sourceExp: "\\ozSource{U}",
    cq: "\\ozDamping{C_q}"
  };
  var CONTROL_GROUPS = {
    physical: [
      ["zeta", `\\(${TEX.zeta}\\)`, "thermal response", 0.05, 12, 0.05, 1, COLORS.zeta],
      ["zetac", `\\(${TEX.zetac}\\)`, "convective response", 0.05, 12, 0.05, 1, COLORS.zetac],
      ["gammac", `\\(${TEX.gammac}\\)`, "convective flux fraction", 0, 1, 0.01, 0.2, COLORS.gammac],
      ["m", `\\(\\ozMass{m}(\\ozRadius{R})\\)`, "shell mass / geometry", 3.2, 20, 0.1, 10, COLORS.m],
      ["gamma1", `\\(${TEX.gamma1}\\)`, "adiabatic exponent", 1.01, 1.67, 0.01, 1.1, COLORS.gamma1],
      ["n", `\\(${TEX.n}\\)`, "opacity-density exponent", 0, 3, 0.05, 1, COLORS.n],
      ["s", `\\(${TEX.s}\\)`, "opacity-temperature exponent", 0, 8, 0.1, 3, COLORS.s],
      ["sourceExp", `\\(${TEX.sourceExp}\\)`, "inner luminosity exponent", -2, 1, 0.05, 0, COLORS.sourceExp],
      ["cq", `\\(${TEX.cq}\\)`, "turbulent damping", 0, 3, 0.05, 0, COLORS.cq]
    ],
    initial: [
      ["r0", `\\(${TEX.R}_0\\)`, "initial radius", 0.75, 1.9, 0.01, 1.4, COLORS.R],
      ["v0", `\\(${TEX.V}_0\\)`, "initial radial velocity", -1.2, 1.2, 0.01, 0, COLORS.V],
      ["p0", `\\(${TEX.P}_0\\)`, "initial pressure factor", 0.3, 1.8, 0.01, 1, COLORS.P],
      ["uc0", `\\(${TEX.Uc}_{0}\\)`, "initial convective velocity", 0, 1.8, 0.01, 1, COLORS.Uc]
    ],
    integration: [
      ["tEnd", `\\(${TEX.tau}_{\\max}\\)`, "maximum integration time", 4, 240, 1, 120, COLORS.tEnd],
      ["step", `\\(\\Delta ${TEX.tau}_0\\)`, "initial step", 5e-4, 0.02, 5e-4, 1e-3, COLORS.step],
      ["maxStep", `\\(\\Delta ${TEX.tau}_{\\max}\\)`, "maximum adaptive step", 5e-3, 0.3, 5e-3, 0.15, COLORS.maxStep],
      ["logRtol", "\\(\\ozNeutral{\\log_{10} r_{tol}}\\)", "modern relative tolerance", -11, -5, 0.25, -8, COLORS.rtol],
      ["logAtol", "\\(\\ozNeutral{\\log_{10} a_{tol}}\\)", "modern absolute tolerance", -13, -7, 0.25, -10, COLORS.atol],
      ["logErrTol", "\\(\\ozNeutral{\\log_{10}\\epsilon}\\)", "legacy midpoint tolerance", -8, -4, 0.25, -7, COLORS.errTol],
      ["logStabilityTol", "\\(\\ozNeutral{\\log_{10}\\epsilon_s}\\)", "stability tolerance", -4, -1, 0.25, -2.7, COLORS.errTol],
      ["stableCycles", "\\(\\ozNeutral{N_s}\\)", "stable cycles required", 3, 8, 1, 5, COLORS.errTol]
    ]
  };
  var PARAMETER_DESCRIPTIONS = {
    zeta: "Sets the thermal/pressure relaxation time scale.",
    zetac: "Sets the convective velocity relaxation time scale.",
    gammac: "Weights how much of the total flux is carried by convection.",
    m: "Shell-mass/geometric factor in the exponents. With fixed shell mass, \\(m(R)=m\\); with radius-dependent shell mass, \\(m(R)=3/[1-(\\eta/R)^3]\\), where \\(\\eta=(1-3/m)^{1/3}\\).",
    gamma1: "Adiabatic exponent used in the pressure response.",
    n: "Opacity-density exponent in the one-zone luminosity law.",
    s: "Opacity-temperature exponent in the one-zone luminosity law.",
    sourceExp: "Exponent \\(U\\) in the inner luminosity source \\(R^U\\).",
    cq: "Cubic turbulent damping coefficient in the acceleration equation.",
    r0: "Starting radius of the shell.",
    v0: "Starting radial velocity.",
    p0: "Starting nonadiabatic pressure factor.",
    uc0: "Starting convective velocity.",
    tEnd: `Maximum integration time \\(${TEX.tau}\\), measured in free-fall/dynamical time units.`,
    step: `Initial adaptive step size \\(\\Delta ${TEX.tau}_0\\).`,
    maxStep: `Maximum step size \\(\\Delta ${TEX.tau}_{\\max}\\) allowed for adaptive solvers.`,
    logRtol: "Base-10 logarithm of the modern relative tolerance.",
    logAtol: "Base-10 logarithm of the modern absolute tolerance.",
    logErrTol: "Base-10 logarithm of the legacy midpoint error tolerance.",
    logStabilityTol: "Base-10 logarithm of the stability classification tolerance.",
    stableCycles: "Number of repeated cycles required before a limit cycle is classified stable."
  };
  var presetBase = {
    maxStep: 0.15,
    logRtol: -8,
    logAtol: -10,
    solver: "rk45",
    compareMidpoint: false,
    runUntilStable: true,
    logStabilityTol: -2.7,
    stableCycles: 5
  };
  var PRESETS = {
    Strip: { ...presetBase, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, p0: 1, uc0: 1, tEnd: 120, step: 1e-3, logErrTol: -7, variableM: false, driver: "p" },
    Blue: { ...presetBase, zeta: 10, zetac: 0.1, gammac: 0.1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, p0: 1, uc0: 1, tEnd: 120, step: 1e-3, logErrTol: -7, variableM: false, driver: "p" },
    Red: { ...presetBase, zeta: 0.1, zetac: 10, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, p0: 1, uc0: 1, tEnd: 120, step: 1e-3, logErrTol: -7, variableM: false, driver: "p" },
    "OZC local": { ...presetBase, zeta: 1, zetac: 1, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 1, r0: 1.4, v0: 0, p0: 0.9, uc0: 0.7, tEnd: 120, step: 1e-3, logErrTol: -5, variableM: true, driver: "abs-v" },
    Thick: { ...presetBase, zeta: 0.1, zetac: 10, gammac: 1, m: 5, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, p0: 1, uc0: 1, tEnd: 120, step: 1e-3, logErrTol: -7, variableM: false, driver: "p" },
    Unstable: { ...presetBase, zeta: 2, zetac: 1, gammac: 1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, p0: 1, uc0: 1, tEnd: 120, step: 1e-3, logErrTol: -7, variableM: false, driver: "p" }
  };
  function mAt(radius, p) {
    if (!p.variableM) return p.m;
    const eta = (1 - 3 / p.m) ** (1 / 3);
    return 3 / (1 - (eta / radius) ** 3);
  }
  function derivedPowers(radius, p) {
    const m = mAt(radius, p);
    const gamma11 = p.gamma1 - 1;
    const b1 = (p.s + 4) * gamma11;
    return {
      m,
      b: 4 + m * (p.n - b1),
      q: m * p.gamma1 - 2,
      c: m - 2,
      d: m * gamma11 / 2
    };
  }
  function sample(tau, y, p) {
    const [radius, velocity, pressure, convectiveVelocity] = y;
    const powers = derivedPowers(radius, p);
    const lr = radius ** powers.b * pressure ** (p.s + 4);
    const lc = radius ** -powers.c * convectiveVelocity ** 3;
    const gammar = 1 - p.gammac;
    return { tau, R: radius, V: velocity, P: pressure, Uc: convectiveVelocity, Lr: lr, Lc: lc, L: gammar * lr + p.gammac * lc };
  }
  function derivatives(_t, y, p) {
    const [radius, velocity, pressure, convectiveVelocity] = y;
    if (radius <= 0 || pressure <= 0 || !Number.isFinite(radius + velocity + pressure + convectiveVelocity)) {
      throw new Error("model left the positive-radius/positive-pressure domain");
    }
    const powers = derivedPowers(radius, p);
    const lr = radius ** powers.b * pressure ** (p.s + 4);
    const lc = radius ** -powers.c * convectiveVelocity ** 3;
    const gammar = 1 - p.gammac;
    const driver = p.driver === "p" ? Math.sqrt(pressure) : Math.sqrt(Math.abs(velocity));
    return [
      velocity,
      pressure / radius ** powers.q - 1 / radius ** 2 - p.cq * velocity ** 3,
      p.zeta * radius ** (powers.m * (p.gamma1 - 1)) * (radius ** p.sourceExp - gammar * lr - p.gammac * lc),
      p.zetac * (radius ** -powers.d * driver - convectiveVelocity)
    ];
  }
  function solverOptionsFromParameters(p, solver = p.solver) {
    return defaultSolverOptions({
      solver,
      rtol: 10 ** p.logRtol,
      atol: 10 ** p.logAtol,
      initialStep: p.step,
      maxStep: p.maxStep,
      minStep: 1e-10,
      maxRows: 6e4,
      errTol: 10 ** p.logErrTol
    });
  }
  var StabilityDetector = class {
    constructor(tolerance, stableCycles, minTime = 2, equilibriumWindow = 1.5) {
      this.tolerance = tolerance;
      this.stableCycles = stableCycles;
      this.minTime = minTime;
      this.equilibriumWindow = equilibriumWindow;
      __publicField(this, "rows", []);
      __publicField(this, "peakIndices", []);
    }
    observe(row) {
      this.rows.push(row);
      this.captureLuminosityPeak();
      if (row.tau < this.minTime) return null;
      if (this.isEquilibrium()) return "equilibrium";
      if (this.isLimitCycle()) return "limit_cycle";
      return null;
    }
    captureLuminosityPeak() {
      if (this.rows.length < 3) return;
      const prev = this.rows[this.rows.length - 3];
      const peak = this.rows[this.rows.length - 2];
      const current = this.rows[this.rows.length - 1];
      if (prev.L < peak.L && peak.L >= current.L) {
        const previousPeakIndex = this.peakIndices.at(-1);
        if (previousPeakIndex !== void 0 && peak.tau - this.rows[previousPeakIndex].tau < 0.05) {
          if (peak.L > this.rows[previousPeakIndex].L) this.peakIndices[this.peakIndices.length - 1] = this.rows.length - 2;
        } else {
          this.peakIndices.push(this.rows.length - 2);
        }
      }
    }
    isEquilibrium() {
      const end = this.rows.at(-1)?.tau ?? 0;
      const window2 = [];
      for (let i = this.rows.length - 1; i >= 0; i -= 1) {
        if (end - this.rows[i].tau > this.equilibriumWindow) break;
        window2.push(this.rows[i]);
      }
      if (window2.length < 6 || end - window2.at(-1).tau < this.equilibriumWindow * 0.75) return false;
      for (const key of ["R", "V", "P", "Uc", "L"]) {
        const values = window2.map((row) => row[key]);
        const scale = Math.max(1, ...values.map(Math.abs));
        if ((Math.max(...values) - Math.min(...values)) / scale > this.tolerance) return false;
      }
      return Math.max(...window2.map((row) => Math.abs(row.V))) < this.tolerance;
    }
    isLimitCycle() {
      const neededPeaks = this.stableCycles + 1;
      if (this.peakIndices.length < neededPeaks) return false;
      const peaks = this.peakIndices.slice(-neededPeaks);
      const periods = [];
      const amplitudes = [];
      const peakLuminosities = [];
      for (let i = 0; i < peaks.length - 1; i += 1) {
        const left = peaks[i];
        const right = peaks[i + 1];
        periods.push(this.rows[right].tau - this.rows[left].tau);
        const cycle = this.rows.slice(left, right + 1);
        const lum = cycle.map((row) => row.L);
        amplitudes.push(Math.max(...lum) - Math.min(...lum));
        peakLuminosities.push(this.rows[right].L);
      }
      return this.relativeSpreadOk(periods) && this.relativeSpreadOk(amplitudes) && this.relativeSpreadOk(peakLuminosities);
    }
    relativeSpreadOk(values) {
      if (values.length < 2) return false;
      const center = Math.max(Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length), 1e-12);
      return (Math.max(...values) - Math.min(...values)) / center <= this.tolerance;
    }
  };
  function solveModel(p, solver = p.solver) {
    const detector = new StabilityDetector(10 ** p.logStabilityTol, p.stableCycles);
    detector.observe(sample(0, [p.r0, p.v0, p.p0, p.uc0], p));
    const result = integrate(
      (t, y) => derivatives(t, y, p),
      [p.r0, p.v0, p.p0, p.uc0],
      p.tEnd,
      solverOptionsFromParameters(p, solver),
      (t, y) => {
        const row = sample(t, y, p);
        if (Math.abs(row.R) > 30 || Math.abs(row.L) > 1e5 || Math.abs(row.P) > 1e5) return "runaway";
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
  function interpolateRow(rows, time) {
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
    const blend = (key) => a[key] + (b[key] - a[key]) * f;
    return { tau: time, R: blend("R"), V: blend("V"), P: blend("P"), Uc: blend("Uc"), Lr: blend("Lr"), Lc: blend("Lc"), L: blend("L") };
  }
  function compareRows(selected, baseline, p) {
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
        ["R", "V", "P", "Uc"].reduce((sum, key) => {
          const scale = atol + rtol * Math.max(Math.abs(row[key]), Math.abs(other[key]));
          return sum + ((row[key] - other[key]) / scale) ** 2;
        }, 0) / 4
      );
      maxStateDelta = Math.max(maxStateDelta, stateDelta);
      maxLuminosityDelta = Math.max(maxLuminosityDelta, Math.abs(row.L - other.L));
    }
    return { commonPoints, maxStateDelta, maxLuminosityDelta };
  }

  // src/main.ts
  var state = { ...PRESETS.Strip };
  var selectedPreset = "Strip";
  var activePreset = "Strip";
  var latestRows = [];
  var comparisonRows = [];
  var latestResult = solveModel(state);
  var comparisonResult = null;
  var debounceTimer = 0;
  var mathTypesetTimer = 0;
  var mathTypesetRunning = false;
  var mathTypesetPending = false;
  var controlElements = /* @__PURE__ */ new Map();
  var THEME = {
    axisGrid: "#26334E",
    axisText: "#A8B4C7",
    axisBorder: "#526489",
    comparison: "#8994A6",
    neutralSymbol: "#C0CAE8"
  };
  function fmt(value, digits = 4) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1e3 || Math.abs(value) > 0 && Math.abs(value) < 1e-3) return value.toExponential(2);
    return Number(value).toFixed(digits).replace(/\.?0+$/, "");
  }
  function queueMathTypeset() {
    window.clearTimeout(mathTypesetTimer);
    mathTypesetTimer = window.setTimeout(() => {
      void runMathTypeset();
    }, 80);
  }
  async function runMathTypeset() {
    if (mathTypesetRunning) {
      mathTypesetPending = true;
      return;
    }
    const root = document.querySelector(".app-shell");
    const mathJax = window.MathJax;
    if (!root || !mathJax?.typesetPromise) return;
    mathTypesetRunning = true;
    try {
      await mathJax.startup?.promise;
      mathJax.typesetClear?.([root]);
      await mathJax.typesetPromise([root]);
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
  function valuesMatch(a, b) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-12;
    return a === b;
  }
  function stateMatchesPreset(name) {
    const preset = PRESETS[name];
    return Object.keys(preset).every((key) => valuesMatch(state[key], preset[key]));
  }
  function refreshActivePreset() {
    activePreset = Object.keys(PRESETS).find((name) => stateMatchesPreset(name)) || "Custom";
    updatePresetButtons();
    updateResetButtons();
  }
  function el(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing element #${id}`);
    return node;
  }
  function buildControls() {
    buildPresetButtons();
    buildSolverButtons();
    buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
    buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
    buildSliderGroup("integrationControls", CONTROL_GROUPS.integration);
    buildParameterTable();
    const variableM = el("variableM");
    variableM.checked = state.variableM;
    variableM.addEventListener("change", (event) => {
      state.variableM = event.target.checked;
      refreshActivePreset();
      scheduleSolve();
    });
    const compare = el("compareMidpoint");
    compare.checked = state.compareMidpoint;
    compare.addEventListener("change", (event) => {
      state.compareMidpoint = event.target.checked;
      refreshActivePreset();
      scheduleSolve();
    });
    const runUntilStable = el("runUntilStable");
    runUntilStable.checked = state.runUntilStable;
    runUntilStable.addEventListener("change", (event) => {
      state.runUntilStable = event.target.checked;
      refreshActivePreset();
      scheduleSolve();
    });
    document.querySelectorAll("[data-driver]").forEach((button) => {
      button.addEventListener("click", () => {
        state.driver = button.dataset.driver === "abs-v" ? "abs-v" : "p";
        updateDriverButtons();
        refreshActivePreset();
        scheduleSolve();
      });
    });
    el("resetPreset").addEventListener("click", () => applyPreset(selectedPreset));
    el("downloadCsv").addEventListener("click", downloadCsv);
    window.addEventListener("resize", drawAll);
    updateDriverButtons();
    updateSolverButtons();
    updateAllSliderLabels();
    updateResetButtons();
  }
  function buildPresetButtons() {
    const container = el("presetButtons");
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
  function buildSolverButtons() {
    const container = el("solverButtons");
    container.innerHTML = "";
    const labels = { rk45: "RK45", dop853: "DOP853", midpoint: "Midpoint" };
    SOLVER_NAMES.forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.solver = name;
      button.textContent = labels[name];
      button.addEventListener("click", () => {
        state.solver = name;
        updateSolverButtons();
        refreshActivePreset();
        scheduleSolve();
      });
      container.appendChild(button);
    });
  }
  function buildSliderGroup(containerId, controls) {
    const container = el(containerId);
    container.innerHTML = "";
    controls.forEach(([key, symbol, name, min, max, step2, _defaultValue, color]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "slider-control";
      wrapper.style.setProperty("--accent", color);
      wrapper.innerHTML = `
      <div class="slider-head">
        <div class="slider-label"><span class="slider-symbol">${symbol}</span><span class="slider-name">${name}</span></div>
        <div class="slider-actions">
          <span class="slider-value" data-value-for="${key}"></span>
          <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">\u21BA</button>
        </div>
      </div>
      <input type="range" min="${min}" max="${max}" step="${step2}" value="${String(state[key])}">
    `;
      const input = wrapper.querySelector("input");
      if (!input) throw new Error("missing slider input");
      input.addEventListener("input", (event) => {
        state[key] = Number(event.target.value);
        updateSliderLabel(key);
        refreshActivePreset();
        scheduleSolve();
      });
      wrapper.querySelector("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
      container.appendChild(wrapper);
      controlElements.set(key, input);
    });
  }
  function buildParameterTable() {
    const table = el("parameterTable");
    const allControls = [...CONTROL_GROUPS.physical, ...CONTROL_GROUPS.initial, ...CONTROL_GROUPS.integration];
    table.innerHTML = allControls.map(([key, symbol, _name, _min, _max, _step, _defaultValue, color]) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${PARAMETER_DESCRIPTIONS[key] || ""}</td>
      </tr>
    `).join("") + `
      <tr><td class="symbol-cell" data-symbol="tau" style="--color:${COLORS.tau}">\\(${TEX.tau}\\)</td><td>Dimensionless clock scaled by the model's free-fall/dynamical time; derivatives such as \\(dR/d\\tau\\) are per dynamical time unit.</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>Numerical method: RK45 default, DOP853 reference, or historical midpoint.</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">D</td><td>Convective driver: \\(\\sqrt{P}\\) or \\(\\sqrt{|V|}\\).</td></tr>
    `;
    queueMathTypeset();
  }
  function updateSliderLabel(key) {
    const label = document.querySelector(`[data-value-for="${String(key)}"]`);
    if (!label) return;
    const value = state[key];
    label.textContent = typeof value === "number" ? fmt(value, 5) : String(value);
    const input = controlElements.get(key);
    if (input && typeof value === "number") input.value = String(value);
  }
  function updateAllSliderLabels() {
    controlElements.forEach((_input, key) => updateSliderLabel(key));
    updateResetButtons();
  }
  function restoreParameterDefault(key) {
    state[key] = PRESETS[selectedPreset][key];
    updateSliderLabel(key);
    refreshActivePreset();
    scheduleSolve();
  }
  function updateResetButtons() {
    document.querySelectorAll("[data-reset-key]").forEach((button) => {
      const key = button.dataset.resetKey;
      button.disabled = valuesMatch(state[key], PRESETS[selectedPreset][key]);
      button.title = `Restore to ${selectedPreset} preset value: ${fmt(Number(PRESETS[selectedPreset][key]), 5)}`;
    });
  }
  function updatePresetButtons() {
    document.querySelectorAll("#presetButtons button").forEach((button) => {
      button.classList.toggle("active", button.textContent === activePreset);
    });
  }
  function updateDriverButtons() {
    document.querySelectorAll("[data-driver]").forEach((button) => {
      button.classList.toggle("active", button.dataset.driver === state.driver);
    });
  }
  function updateSolverButtons() {
    document.querySelectorAll("[data-solver]").forEach((button) => {
      button.classList.toggle("active", button.dataset.solver === state.solver);
    });
  }
  function applyPreset(name) {
    state = { ...PRESETS[name] };
    selectedPreset = name;
    activePreset = name;
    updatePresetButtons();
    updateDriverButtons();
    updateSolverButtons();
    el("variableM").checked = state.variableM;
    el("compareMidpoint").checked = state.compareMidpoint;
    el("runUntilStable").checked = state.runUntilStable;
    updateAllSliderLabels();
    updateResetButtons();
    scheduleSolve();
  }
  function scheduleSolve() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(solveAndDraw, 80);
  }
  function solveAndDraw() {
    latestResult = solveModel(state);
    latestRows = latestResult.rows;
    if (state.compareMidpoint && state.solver !== "midpoint") {
      comparisonResult = solveModel(state, "midpoint");
      comparisonRows = comparisonResult.rows;
    } else {
      comparisonResult = null;
      comparisonRows = [];
    }
    drawAll();
  }
  function downsample(rows, maxPoints = 2200) {
    if (rows.length <= maxPoints) return rows;
    const stride = Math.ceil(rows.length / maxPoints);
    return rows.filter((_row, index) => index % stride === 0);
  }
  function range(values, padFraction = 0.08) {
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
      const pad2 = Math.abs(min) * padFraction || 1;
      return [min - pad2, max + pad2];
    }
    const pad = (max - min) * padFraction;
    return [min - pad, max + pad];
  }
  function drawAxes(ctx, plot, xlim, ylim, xlabel, ylabel, xlabelColor = THEME.axisText, ylabelColor = THEME.axisText) {
    ctx.strokeStyle = THEME.axisGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = THEME.axisText;
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 4; i += 1) {
      const x = plot.left + plot.width * i / 4;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.fillText(fmt(xlim[0] + (xlim[1] - xlim[0]) * i / 4, 2), x, plot.top + plot.height + 8);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const y = plot.top + plot.height * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
      ctx.fillText(fmt(ylim[1] - (ylim[1] - ylim[0]) * i / 4, 2), plot.left - 9, y);
    }
    ctx.strokeStyle = THEME.axisBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = xlabelColor;
    ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
    ctx.save();
    ctx.translate(16, plot.top + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ylabelColor;
    ctx.fillText(ylabel, 0, 0);
    ctx.restore();
  }
  function drawSeries(canvasId, series, options) {
    const canvas = el(canvasId);
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(260, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const plot = { left: 58, top: 18, width: rect.width - 78, height: rect.height - 72 };
    const xValues = [];
    const yValues = [];
    series.forEach((item) => {
      item.rows.forEach((row) => {
        xValues.push(item.x(row));
        yValues.push(item.y(row));
      });
    });
    const xlim = options.xlim || range(xValues, 0.02);
    const ylim = options.ylim || range(yValues, 0.08);
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    drawAxes(ctx, plot, xlim, ylim, options.xlabel, options.ylabel, options.xlabelColor, options.ylabelColor);
    series.forEach((item) => {
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
  }
  function drawLegend(id, items) {
    const node = el(id);
    node.innerHTML = items.map((item) => `<span class="legend-item"><span class="swatch" style="--color:${item.color}"></span>${item.label}</span>`).join("");
    queueMathTypeset();
  }
  function findMaxima(rows, key, after, minSeparation) {
    const maxima = [];
    for (let i = 1; i < rows.length - 1; i += 1) {
      if (rows[i].tau < after) continue;
      if (rows[i - 1][key] < rows[i][key] && rows[i][key] >= rows[i + 1][key]) {
        const last = maxima[maxima.length - 1];
        if (last && rows[i].tau - last.tau < minSeparation) {
          if (rows[i][key] > last[key]) maxima[maxima.length - 1] = rows[i];
        } else {
          maxima.push(rows[i]);
        }
      }
    }
    return maxima;
  }
  function zeroCrossingTimes(rows, key, direction, after) {
    const out = [];
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i].tau < after) continue;
      const prev = rows[i - 1][key];
      const next = rows[i][key];
      const crossedUp = direction === "up" && prev <= 0 && next > 0;
      const crossedDown = direction === "down" && prev >= 0 && next < 0;
      if (!crossedUp && !crossedDown) continue;
      const fraction = (0 - prev) / (next - prev);
      out.push(rows[i - 1].tau + fraction * (rows[i].tau - rows[i - 1].tau));
    }
    return out;
  }
  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function periodCandidate(times, finalTime, priority) {
    if (times.length < 3) return null;
    const intervals = [];
    for (let i = 1; i < times.length; i += 1) {
      const interval = times[i] - times[i - 1];
      if (interval > 0 && Number.isFinite(interval)) intervals.push(interval);
    }
    const recent = intervals.slice(priority === 2 ? -4 : -2);
    const period = priority === 2 ? median(recent) : recent[recent.length - 1];
    if (!period || period <= 0 || finalTime - times[times.length - 1] > period * 2.5) return null;
    return { period, priority };
  }
  function estimatePulsationPeriod(rows) {
    const finalTime = rows[rows.length - 1]?.tau;
    if (!finalTime || rows.length < 8) return null;
    const after = finalTime * 0.15;
    const minPeakSeparation = Math.max(0.2, finalTime / 200);
    const candidates = [
      periodCandidate(findMaxima(rows, "L", after, minPeakSeparation).map((row) => row.tau), finalTime, 2),
      periodCandidate(findMaxima(rows, "R", after, minPeakSeparation).map((row) => row.tau), finalTime, 1),
      periodCandidate(zeroCrossingTimes(rows, "V", "up", after), finalTime, 0)
    ].filter((candidate) => Boolean(candidate));
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0]?.period || null;
  }
  function phasedRows(rows) {
    const finalTime = rows[rows.length - 1]?.tau;
    const period = estimatePulsationPeriod(rows);
    if (!finalTime || !period) return { rows: [], period };
    const startTime = finalTime - 2 * period;
    const out = [];
    rows.forEach((row) => {
      const phase = (row.tau - startTime) / period;
      if (phase >= 0 && phase <= 2) out.push({ ...row, tau: phase });
    });
    return { rows: out, period };
  }
  function stopReasonLabel(message, runUntilStable) {
    switch (message) {
      case "limit_cycle":
        return "stable limit cycle";
      case "equilibrium":
        return "stable equilibrium";
      case "max_time":
        return "tau max reached";
      case "complete":
        return runUntilStable ? "tau max reached" : "fixed-time complete";
      case "domain_error":
        return "domain error";
      case "row_limit":
        return "row limit";
      case "step_limit":
        return "step limit";
      default:
        return message.replaceAll("_", " ");
    }
  }
  function drawAll() {
    const rows = latestRows;
    const sampled = downsample(rows);
    const statusPill = el("statusPill");
    const stopReason = stopReasonLabel(latestResult.message, state.runUntilStable);
    statusPill.textContent = `stop: ${stopReason}`;
    const okStatus = latestResult.message === "equilibrium" || latestResult.message === "limit_cycle" || !state.runUntilStable && latestResult.status === "complete";
    statusPill.className = `status-pill ${okStatus ? "status-ok" : "status-warn"}`;
    const final = rows[rows.length - 1];
    const phase = phasedRows(rows);
    const comparison = comparisonResult && comparisonRows.length ? compareRows(rows, comparisonRows, state) : null;
    const comparisonText = comparison ? `<span class="metric">midpoint \u0394y<b>${fmt(comparison.maxStateDelta, 3)}</b></span><span class="metric">midpoint \u0394L<b>${fmt(comparison.maxLuminosityDelta, 3)}</b></span>` : "";
    el("metrics").innerHTML = [
      ["solver", state.solver.toUpperCase()],
      ["stop reason", stopReason],
      ["driver", state.driver === "p" ? "sqrt(P)" : "sqrt(|V|)"],
      ["gamma_c", fmt(state.gammac, 3)],
      ["zeta", fmt(state.zeta, 3)],
      ["zeta_c", fmt(state.zetac, 3)],
      [`final \\(${TEX.tau}\\)`, final ? fmt(final.tau || 0, 4) : "n/a"],
      [`\\(${TEX.tau}_{max}\\)`, fmt(state.tEnd, 4)],
      ["rows", rows.length],
      ["accepted", latestResult.stats.acceptedSteps],
      ["rejected", latestResult.stats.rejectedSteps],
      ["max err", fmt(latestResult.stats.maxNormalizedError, 3)],
      ["period", phase.period ? fmt(phase.period, 3) : "n/a"],
      ["final R", final ? fmt(final.R, 3) : "n/a"],
      ["final L", final ? fmt(final.L, 3) : "n/a"]
    ].map(([label, value]) => `<span class="metric">${label}<b>${value}</b></span>`).join("") + comparisonText;
    el("modelSubtitle").textContent = "";
    const phaseSample = phase.rows.length ? downsample(phase.rows, 1800) : [];
    const phaseComparison = comparisonRows.length ? downsample(phasedRows(comparisonRows).rows, 1800) : [];
    drawSeries("lightCanvas", [
      { label: "L", color: COLORS.L, rows: phaseSample, x: (row) => row.tau, y: (row) => row.L },
      { label: "midpoint L", color: THEME.comparison, rows: phaseComparison, x: (row) => row.tau, y: (row) => row.L, dash: [5, 4], width: 1.5 }
    ], { xlabel: "phase", ylabel: "luminosity", xlim: [0, 2], ylim: phaseSample.length ? void 0 : [0, 1] });
    drawLegend("lightLegend", [
      { label: `\\(${TEX.L}\\) selected solver`, color: COLORS.L },
      ...phaseComparison.length ? [{ label: `\\(${TEX.L}\\) midpoint comparison`, color: THEME.comparison }] : []
    ]);
    drawSeries("velocityCanvas", [
      { label: "V", color: COLORS.V, rows: phaseSample, x: (row) => row.tau, y: (row) => row.V },
      { label: "midpoint V", color: THEME.comparison, rows: phaseComparison, x: (row) => row.tau, y: (row) => row.V, dash: [5, 4], width: 1.5 }
    ], { xlabel: "phase", ylabel: "radial velocity", xlim: [0, 2], ylim: phaseSample.length ? void 0 : [0, 1] });
    drawLegend("velocityLegend", [
      { label: `\\(${TEX.V}\\) selected solver`, color: COLORS.V },
      ...phaseComparison.length ? [{ label: `\\(${TEX.V}\\) midpoint comparison`, color: THEME.comparison }] : []
    ]);
    drawSeries("timeCanvas", [
      { label: "R", color: COLORS.R, rows: sampled, x: (row) => row.tau, y: (row) => row.R },
      { label: "V", color: COLORS.V, rows: sampled, x: (row) => row.tau, y: (row) => row.V },
      { label: "P", color: COLORS.P, rows: sampled, x: (row) => row.tau, y: (row) => row.P },
      { label: "Uc", color: COLORS.Uc, rows: sampled, x: (row) => row.tau, y: (row) => row.Uc }
    ], { xlabel: "time \u03C4", ylabel: "state", xlabelColor: COLORS.tau });
    drawLegend("timeLegend", [
      { label: `\\(${TEX.R}\\) radius`, color: COLORS.R },
      { label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V },
      { label: `\\(${TEX.P}\\) pressure`, color: COLORS.P },
      { label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc }
    ]);
    drawSeries("lumCanvas", [
      { label: "L", color: COLORS.L, rows: sampled, x: (row) => row.tau, y: (row) => row.L },
      { label: "Lr", color: COLORS.Lr, rows: sampled, x: (row) => row.tau, y: (row) => row.Lr },
      { label: "Lc", color: COLORS.Lc, rows: sampled, x: (row) => row.tau, y: (row) => row.Lc }
    ], { xlabel: "time \u03C4", ylabel: "luminosity", xlabelColor: COLORS.tau });
    drawLegend("lumLegend", [
      { label: `\\(${TEX.L}\\) total`, color: COLORS.L },
      { label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr },
      { label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc }
    ]);
    queueMathTypeset();
  }
  function downloadCsv() {
    if (!latestRows.length) return;
    const headers = ["tau", "R", "V", "P", "Uc", "Lr", "Lc", "L"];
    const body = latestRows.map((row) => headers.map((key) => row[key]).join(",")).join("\n");
    const blob = new Blob([`${headers.join(",")}
${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ozwizard-${state.solver}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function startApp() {
    buildControls();
    solveAndDraw();
    window.addEventListener("load", queueMathTypeset);
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
