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
      maxAcceptedSteps: 5e5,
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
      const stopped = stopCondition?.(t, y);
      const shouldStore = !options.outputInterval || t >= nextOutputTime - options.outputInterval * 1e-9 || t >= tEnd || Boolean(stopped);
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

  // src/model.ts
  var COLORS = {
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
  };
  var TEX = {
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
    m: "\\ozMass{m}",
    gamma1: "\\ozGamma{\\Gamma_1}",
    n: "\\ozBlue{n}",
    s: "\\ozPink{s}",
    sourceExp: "\\ozSource{U}",
    cq: "\\ozDamping{C_q}"
  };
  var TEX_EXTRA = {
    gammaR: "\\ozNeutral{\\gamma_r}",
    eta: "\\ozMass{\\eta}",
    kappa: "\\ozNeutral{\\kappa}",
    rho: "\\ozNeutral{\\rho}",
    temp: "\\ozNeutral{T}"
  };
  var CONTROL_GROUPS = {
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
      ["step", `\\(\\Delta ${TEX.tau}_0\\)`, "initial step", 5e-4, 0.02, 5e-4, 1e-3, COLORS.step],
      ["maxStep", `\\(\\Delta ${TEX.tau}_{\\max}\\)`, "max adaptive step", 5e-3, 0.3, 5e-3, 0.15, COLORS.maxStep],
      ["logRtol", "\\(\\ozNeutral{\\log_{10} r_{tol}}\\)", "relative tol", -11, -5, 0.25, -8, COLORS.rtol],
      ["logAtol", "\\(\\ozNeutral{\\log_{10} a_{tol}}\\)", "absolute tol", -13, -7, 0.25, -10, COLORS.atol],
      ["logErrTol", "\\(\\ozNeutral{\\log_{10}\\epsilon}\\)", "tolerance", -8, -4, 0.25, -7, COLORS.errTol],
      ["logStabilityTol", "\\(\\ozNeutral{\\log_{10}\\epsilon_s}\\)", "stability tolerance", -4, -1, 0.25, -2.7, COLORS.errTol],
      ["stableCycles", "\\(\\ozNeutral{N_s}\\)", "stable cycles required", 3, 8, 1, 5, COLORS.errTol]
    ]
  };
  var PARAMETER_DESCRIPTIONS = {
    zeta: `Ratio of the model free-fall/dynamical time to the thermal time; larger values make \\(${TEX.H}\\) adjust faster per \\(${TEX.tau}\\).`,
    zetac: `Ratio of the model free-fall/dynamical time to the convective adjustment time; larger values make \\(${TEX.Uc}\\) relax faster, while zero freezes \\(${TEX.Uc}\\).`,
    gammac: `Equilibrium convective luminosity fraction \\(${TEX.gammac}=${TEX.Lc}_{0}/${TEX.L}_{0}\\); the radiative weight is \\(${TEX_EXTRA.gammaR}=1-${TEX.gammac}\\).`,
    m: `Equilibrium shell-thickness form factor \\(${TEX.m}=3/(1-${TEX_EXTRA.eta}^{3})\\), where \\(${TEX_EXTRA.eta}=${TEX.R}_{c}/${TEX.R}_{0}\\). Larger \\(${TEX.m}\\) means a thinner shell.`,
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
  var presetBase = {
    maxStep: 0.15,
    logRtol: -8,
    logAtol: -10,
    solver: "rk45",
    runUntilStable: true,
    logStabilityTol: -2.7,
    stableCycles: 5,
    phaseMinAmplitude: 1e-4,
    phaseMode: "reference"
  };
  var paperBase = {
    ...presetBase,
    referenceFamily: "stellingwerf-1986",
    phaseWarmupTau: 4
  };
  var ozcBase = {
    ...presetBase,
    referenceFamily: "local-s-tran"
  };
  var overtoneBase = {
    ...presetBase,
    referenceFamily: "stellingwerf-1987",
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
    step: 1e-3,
    logErrTol: -7,
    variableM: true,
    driver: "h",
    runUntilStable: false
  };
  var DEFAULT_PRESET_NAME = "RR Lyrae low-amplitude fundamental, damped";
  var PRESETS = {
    "Baker radiative pulsator": { ...presetBase, referenceFamily: "baker", phaseWarmupTau: 4, zeta: 1, zetac: 0, gammac: 0, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 0, tEnd: 24, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "Blue-edge convection": { ...paperBase, phaseWarmupTau: 24, zeta: 10, zetac: 0.1, gammac: 0.1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 40, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "Instability-strip convection": { ...paperBase, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 15, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "Red-edge convection": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 14, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "Radius-dependent strip": { ...paperBase, phaseWarmupTau: 6, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 1e-3, logErrTol: -7, variableM: true, driver: "h", runUntilStable: false },
    "Fully convective runaway": { ...paperBase, phaseWarmupTau: 1, zeta: 2, zetac: 1, gammac: 1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 8, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "Thick convective shell": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 1, m: 5, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 1e-3, logErrTol: -7, variableM: false, driver: "h", runUntilStable: false },
    "RR Lyrae fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.2 },
    "RR Lyrae low-amplitude fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.1 },
    "RR Lyrae low-amplitude fundamental, damped": { ...overtoneBase, phaseWarmupTau: 40, m: 10, sourceExp: -2, cq: 5, r0: 1.1, tEnd: 100 },
    "RR Lyrae first overtone": { ...overtoneBase, m: 15, sourceExp: 2, r0: 1.05 },
    "RR Lyrae first overtone, damped": { ...overtoneBase, phaseWarmupTau: 40, m: 15, sourceExp: 2, cq: 7, r0: 1.05, tEnd: 80 },
    "RR Lyrae high-amplitude first overtone": { ...overtoneBase, m: 15, sourceExp: 2, r0: 1.1 },
    "RR Lyrae second overtone": { ...overtoneBase, m: 20, sourceExp: 1, r0: 1.05 },
    "Local radiative OZ1": { ...presetBase, referenceFamily: "local-s-tran", phaseWarmupTau: 1, zeta: 1, zetac: 0, gammac: 0, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 2, r0: 1.2, v0: 0, h0: 0.8, uc0: 0, tEnd: 20, step: 0.012, logErrTol: -5, variableM: true, driver: "h", runUntilStable: false },
    "Local convective OZC": { ...ozcBase, zeta: 1, zetac: 1, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 1, r0: 1.4, v0: 0, h0: 0.9, uc0: 0.7, tEnd: 20, step: 1e-3, logErrTol: -5, variableM: true, driver: "h", runUntilStable: false },
    "OZC abs(V) driver diagnostic": { ...ozcBase, referenceFamily: "diagnostic", zeta: 1, zetac: 1, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: -1, cq: 1, r0: 1.4, v0: 0, h0: 0.9, uc0: 0.7, tEnd: 20, step: 1e-3, logErrTol: -5, variableM: true, driver: "abs-v", runUntilStable: false }
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
    return { tau, R: radius, V: velocity, H: pressure, Uc: convectiveVelocity, Lr: lr, Lc: lc, L: gammar * lr + p.gammac * lc };
  }
  function derivatives(_t, y, p) {
    const [radius, velocity, pressure, convectiveVelocity] = y;
    if (radius <= 0 || pressure <= 0 || !Number.isFinite(radius + velocity + pressure + convectiveVelocity)) {
      throw new Error("model left the positive-radius/positive-H domain");
    }
    const powers = derivedPowers(radius, p);
    const lr = radius ** powers.b * pressure ** (p.s + 4);
    const lc = radius ** -powers.c * convectiveVelocity ** 3;
    const gammar = 1 - p.gammac;
    const driver = p.driver === "h" ? Math.sqrt(pressure) : Math.sqrt(Math.abs(velocity));
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
      maxAcceptedSteps: 6e5,
      outputInterval: Math.max(5e-3, Math.min(0.02, p.tEnd / 12e3)),
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
      if (peak.tau < this.minTime) return;
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
      for (const key of ["R", "V", "H", "Uc", "L"]) {
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

  // src/phase.ts
  function defaultWarmupTau(rows) {
    const finalTau = rows.at(-1)?.tau ?? 0;
    return Math.max(1, Math.min(4, 0.05 * finalTau));
  }
  function phaseWarmupTau(rows, requested) {
    return requested !== void 0 && Number.isFinite(requested) ? requested : defaultWarmupTau(rows);
  }
  function findLuminosityMaxima(rows, after, minSeparation = 0.75) {
    const maxima = [];
    for (let i = 1; i < rows.length - 1; i += 1) {
      const row = rows[i];
      if (row.tau < after) continue;
      if (rows[i - 1].L < row.L && row.L >= rows[i + 1].L) {
        const last = maxima.at(-1);
        if (last && row.tau - last.tau < minSeparation) {
          if (row.L > last.L) maxima[maxima.length - 1] = row;
        } else {
          maxima.push(row);
        }
      }
    }
    return maxima;
  }
  function findLuminosityMinima(rows, after, minSeparation = 0.75) {
    const minima = [];
    for (let i = 1; i < rows.length - 1; i += 1) {
      const row = rows[i];
      if (row.tau < after) continue;
      if (rows[i - 1].L > row.L && row.L <= rows[i + 1].L) {
        const last = minima.at(-1);
        if (last && row.tau - last.tau < minSeparation) {
          if (row.L < last.L) minima[minima.length - 1] = row;
        } else {
          minima.push(row);
        }
      }
    }
    return minima;
  }
  function cycleAmplitude(rows, startTau, endTau) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
      if (row.tau < startTau || row.tau > endTau) continue;
      min = Math.min(min, row.L);
      max = Math.max(max, row.L);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    const scale = Math.max(1, Math.abs(max), Math.abs(min));
    return (max - min) / scale;
  }
  function minimumBetween(rows, startTau, endTau) {
    let minimum = null;
    for (const row of rows) {
      if (row.tau <= startTau || row.tau >= endTau) continue;
      if (!minimum || row.L < minimum.L) minimum = row;
    }
    return minimum;
  }
  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function minimumSeparationFromMaxima(maxima, requested) {
    if (requested !== void 0) return requested;
    const gaps = [];
    for (let i = 0; i < maxima.length - 1; i += 1) gaps.push(maxima[i + 1].tau - maxima[i].tau);
    const period = median(gaps);
    return period ? Math.max(0.75, period * 0.55) : 0.75;
  }
  function buildReferenceFromMinima(rows, minimumRows, warmupTau, minAmplitude) {
    const [first, second, third] = minimumRows;
    const firstCycleAmplitude = cycleAmplitude(rows, first.tau, second.tau);
    const secondCycleAmplitude = cycleAmplitude(rows, second.tau, third.tau);
    if (firstCycleAmplitude < minAmplitude || secondCycleAmplitude < minAmplitude) return null;
    const period = (third.tau - first.tau) / 2;
    if (period <= 0 || !Number.isFinite(period)) return null;
    const reference = {
      startTau: first.tau,
      midTau: second.tau,
      endTau: third.tau,
      period,
      warmupTau,
      minAmplitude,
      minimumRows
    };
    return foldRowsToReference(rows, reference);
  }
  function buildReference(rows, options) {
    if (rows.length < 3) {
      return { rows: [], reference: null, period: null, reason: "not_enough_rows" };
    }
    const warmupTau = phaseWarmupTau(rows, options.warmupTau);
    const minAmplitude = options.minAmplitude ?? 1e-4;
    const maxima = findLuminosityMaxima(rows, warmupTau, options.minSeparation);
    if (maxima.length >= 4) {
      const start2 = options.selection === "last" ? maxima.length - 4 : 0;
      const end2 = options.selection === "last" ? -1 : maxima.length - 4;
      const direction2 = options.selection === "last" ? -1 : 1;
      for (let i = start2; options.selection === "last" ? i > end2 : i <= end2; i += direction2) {
        const firstMinimum = minimumBetween(rows, maxima[i].tau, maxima[i + 1].tau);
        const secondMinimum = minimumBetween(rows, maxima[i + 1].tau, maxima[i + 2].tau);
        const thirdMinimum = minimumBetween(rows, maxima[i + 2].tau, maxima[i + 3].tau);
        if (!firstMinimum || !secondMinimum || !thirdMinimum) continue;
        const result = buildReferenceFromMinima(rows, [firstMinimum, secondMinimum, thirdMinimum], warmupTau, minAmplitude);
        if (result) return result;
      }
    }
    const minima = findLuminosityMinima(rows, warmupTau, minimumSeparationFromMaxima(maxima, options.minSeparation));
    if (minima.length < 3) {
      return { rows: [], reference: null, period: null, reason: "not_enough_minima" };
    }
    const start = options.selection === "last" ? minima.length - 3 : 0;
    const end = options.selection === "last" ? -1 : minima.length - 3;
    const direction = options.selection === "last" ? -1 : 1;
    for (let i = start; options.selection === "last" ? i > end : i <= end; i += direction) {
      const result = buildReferenceFromMinima(rows, [minima[i], minima[i + 1], minima[i + 2]], warmupTau, minAmplitude);
      if (result) return result;
    }
    return { rows: [], reference: null, period: null, reason: "amplitude_below_threshold" };
  }
  function foldRowsToReference(rows, reference) {
    const folded = [];
    for (const row of rows) {
      if (row.tau < reference.startTau || row.tau > reference.endTau) continue;
      const phase = (row.tau - reference.startTau) / reference.period;
      if (phase >= 0 && phase <= 2) folded.push({ ...row, tau: phase });
    }
    return {
      rows: folded,
      reference,
      period: reference.period,
      reason: folded.length ? "ok" : "reference_out_of_range"
    };
  }
  function buildTwoCyclePhase(rows, options = {}) {
    if (options.reference) return foldRowsToReference(rows, options.reference);
    return buildReference(rows, options);
  }

  // src/main.ts
  var state = { ...PRESETS[DEFAULT_PRESET_NAME] };
  var selectedPreset = DEFAULT_PRESET_NAME;
  var activePreset = DEFAULT_PRESET_NAME;
  var latestRows = [];
  var latestResult = solveModel(state);
  var debounceTimer = 0;
  var mathTypesetTimer = 0;
  var mathTypesetRunning = false;
  var mathTypesetPending = false;
  var mathTypesetWholeRoot = false;
  var mathRenderVersion = 0;
  var mathTypesetTargets = /* @__PURE__ */ new Set();
  var stagedMathUpdates = /* @__PURE__ */ new Map();
  var controlElements = /* @__PURE__ */ new Map();
  var TAU_TICKS = [1, 3, 10, 30, 100, 300, 1e3];
  var THEME = {
    axisGrid: "#26334E",
    axisText: "#A8B4C7",
    axisBorder: "#526489",
    selectionFill: "rgba(158, 167, 255, 0.16)",
    selectionStroke: "#9EA7FF",
    neutralSymbol: "#C0CAE8"
  };
  var INTERACTIVE_CANVASES = {
    timeCanvas: "time",
    lumCanvas: "lum"
  };
  var SIDEBAR_COLLAPSE_QUERY = "(max-width: 780px)";
  var plotViews = {
    time: {},
    lum: {}
  };
  var plotVisibility = {
    time: { R: true, V: true, H: true, Uc: true },
    lum: { L: true, Lr: true, Lc: true }
  };
  var plotRenderStates = /* @__PURE__ */ new Map();
  var legendSignatures = /* @__PURE__ */ new Map();
  var activeSelection = null;
  var DENSE_ENVELOPE_POINTS_PER_PIXEL = 2.25;
  var PLOT_LAYOUT = {
    left: 84,
    top: 18,
    right: 20,
    bottom: 72,
    yTickGap: 18,
    yLabelX: 22
  };
  function fmt(value, digits = 4) {
    if (!Number.isFinite(value)) return "n/a";
    const fixed = Number(value).toFixed(digits);
    const decimal = digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
    const scientific = value.toExponential(2).replace(/\.?0+e/, "e");
    return scientific.length < decimal.length ? scientific : decimal;
  }
  function fmtFixed(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return Number(value).toFixed(digits);
  }
  function stageMathHtml(element, html) {
    const version = ++mathRenderVersion;
    stagedMathUpdates.set(element, { html, version });
    element.dataset.mathState = "rendering";
    element.dataset.mathVersion = String(version);
  }
  function markStagedMathReady(element, update) {
    const current = stagedMathUpdates.get(element);
    if (!current || current.version !== update.version) return false;
    stagedMathUpdates.delete(element);
    element.dataset.mathState = "ready";
    delete element.dataset.mathVersion;
    return true;
  }
  function applyRawStagedMathFallback(entries) {
    entries.forEach(([element, update]) => {
      if (!markStagedMathReady(element, update)) return;
      element.innerHTML = update.html;
    });
  }
  function queueMathTypeset(elements) {
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
  async function runMathTypeset() {
    if (mathTypesetRunning) {
      mathTypesetPending = true;
      return;
    }
    const root = document.querySelector(".app-shell");
    const mathJax = window.MathJax;
    if (!root) return;
    const elements = mathTypesetWholeRoot || mathTypesetTargets.size === 0 ? [root] : Array.from(mathTypesetTargets);
    const stagedEntries = mathTypesetWholeRoot ? Array.from(stagedMathUpdates.entries()) : elements.flatMap((element) => {
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
  async function renderStagedMath(entries, mathJax) {
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
    setupResponsiveSidebarControls();
    buildPresetButtons();
    buildSolverButtons();
    buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
    buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
    rebuildIntegrationControls();
    buildParameterTable();
    const variableM = el("variableM");
    variableM.checked = state.variableM;
    variableM.addEventListener("change", (event) => {
      state.variableM = event.target.checked;
      updateEquationBlocks();
      refreshActivePreset();
      scheduleSolve();
    });
    const runUntilStable = el("runUntilStable");
    runUntilStable.checked = state.runUntilStable;
    runUntilStable.addEventListener("change", (event) => {
      state.runUntilStable = event.target.checked;
      rebuildIntegrationControls();
      refreshActivePreset();
      scheduleSolve();
    });
    document.querySelectorAll("[data-phase-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.phaseMode = button.dataset.phaseMode === "final" ? "final" : "reference";
        updatePhaseModeButtons();
        refreshActivePreset();
        drawAll();
      });
    });
    document.querySelectorAll("[data-driver]").forEach((button) => {
      button.addEventListener("click", () => {
        state.driver = button.dataset.driver === "abs-v" ? "abs-v" : "h";
        updateDriverButtons();
        updateEquationBlocks();
        refreshActivePreset();
        scheduleSolve();
      });
    });
    el("resetPreset").addEventListener("click", () => applyPreset(selectedPreset));
    el("downloadCsv").addEventListener("click", downloadCsv);
    setupInteractivePlots();
    window.addEventListener("resize", drawAll);
    updateDriverButtons();
    updatePhaseModeButtons();
    updateSolverButtons();
    updateEquationBlocks();
    updateAllSliderLabels();
    updateResetButtons();
  }
  function setupResponsiveSidebarControls() {
    const details = document.getElementById("sidebarControls");
    if (!details) return;
    const media = window.matchMedia(SIDEBAR_COLLAPSE_QUERY);
    const sync = () => {
      details.open = !media.matches;
    };
    sync();
    media.addEventListener("change", sync);
  }
  function setupInteractivePlots() {
    Object.entries(INTERACTIVE_CANVASES).forEach(([canvasId, plotId]) => {
      const canvas = el(canvasId);
      canvas.classList.add("interactive-canvas");
      canvas.addEventListener("pointerdown", (event) => beginPlotSelection(event, canvasId, plotId));
      canvas.addEventListener("pointermove", (event) => updatePlotSelection(event, canvasId));
      canvas.addEventListener("pointerup", (event) => finishPlotSelection(event, canvasId));
      canvas.addEventListener("pointercancel", (event) => cancelPlotSelection(event, canvasId));
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      canvas.addEventListener("dblclick", () => resetPlotView(plotId));
      canvas.addEventListener("wheel", (event) => zoomPlotWithWheel(event, canvasId, plotId), { passive: false });
    });
    document.querySelectorAll("[data-plot-reset]").forEach((button) => {
      button.addEventListener("click", () => {
        const plotId = button.dataset.plotReset;
        if (plotId) resetPlotView(plotId);
      });
    });
    updatePlotResetButtons();
  }
  function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function clamp2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function clampPointToPlot(point, plot) {
    return {
      x: clamp2(point.x, plot.left, plot.left + plot.width),
      y: clamp2(point.y, plot.top, plot.top + plot.height)
    };
  }
  function pointInPlot(point, plot) {
    return point.x >= plot.left && point.x <= plot.left + plot.width && point.y >= plot.top && point.y <= plot.top + plot.height;
  }
  function xFromPixel(render, x) {
    const f = (x - render.plot.left) / render.plot.width;
    return render.xlim[0] + f * (render.xlim[1] - render.xlim[0]);
  }
  function yFromPixel(render, y) {
    const f = 1 - (y - render.plot.top) / render.plot.height;
    return render.ylim[0] + f * (render.ylim[1] - render.ylim[0]);
  }
  function sortedRange(a, b) {
    return a <= b ? [a, b] : [b, a];
  }
  function validRange(rangeValue, minimumSpan = 1e-9) {
    const [min, max] = rangeValue;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < minimumSpan) return void 0;
    return rangeValue;
  }
  function beginPlotSelection(event, canvasId, plotId) {
    if (event.button !== 0 && event.button !== 2) return;
    const canvas = event.currentTarget;
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
  function updatePlotSelection(event, canvasId) {
    if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    const render = plotRenderStates.get(canvasId);
    if (!render) return;
    const point = activeSelection.mode === "pan" ? canvasPoint(canvas, event) : clampPointToPlot(canvasPoint(canvas, event), render.plot);
    activeSelection.currentX = point.x;
    activeSelection.currentY = point.y;
    if (activeSelection.mode === "pan") {
      const xDelta = (point.x - activeSelection.startX) / render.plot.width * (activeSelection.startXlim[1] - activeSelection.startXlim[0]);
      const yDelta = -(point.y - activeSelection.startY) / render.plot.height * (activeSelection.startYlim[1] - activeSelection.startYlim[0]);
      plotViews[activeSelection.plotId] = {
        xlim: validRange([activeSelection.startXlim[0] - xDelta, activeSelection.startXlim[1] - xDelta]) || activeSelection.startXlim,
        ylim: validRange([activeSelection.startYlim[0] - yDelta, activeSelection.startYlim[1] - yDelta]) || activeSelection.startYlim
      };
      updatePlotResetButtons();
    }
    drawAll();
  }
  function finishPlotSelection(event, canvasId) {
    if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
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
    const nextView = { ...plotViews[selection.plotId] };
    if (dx > 8) nextView.xlim = validRange(sortedRange(xFromPixel(render, selection.startX), xFromPixel(render, selection.currentX)));
    if (dy > 8) nextView.ylim = validRange(sortedRange(yFromPixel(render, selection.startY), yFromPixel(render, selection.currentY)));
    if (dx > 8 || dy > 8) {
      plotViews[selection.plotId] = nextView;
      updatePlotResetButtons();
    }
    drawAll();
  }
  function cancelPlotSelection(event, canvasId) {
    if (!activeSelection || activeSelection.canvasId !== canvasId || activeSelection.pointerId !== event.pointerId) return;
    activeSelection = null;
    drawAll();
  }
  function zoomRangeAround(rangeValue, center, factor) {
    const [min, max] = rangeValue;
    return [
      center - (center - min) * factor,
      center + (max - center) * factor
    ];
  }
  function zoomPlotWithWheel(event, canvasId, plotId) {
    const canvas = event.currentTarget;
    const render = plotRenderStates.get(canvasId);
    if (!render) return;
    const point = canvasPoint(canvas, event);
    if (!pointInPlot(point, render.plot)) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.16 : 1 / 1.16;
    const nextView = {
      xlim: validRange(zoomRangeAround(render.xlim, xFromPixel(render, point.x), factor)) || render.xlim,
      ylim: validRange(zoomRangeAround(render.ylim, yFromPixel(render, point.y), factor)) || render.ylim
    };
    plotViews[plotId] = nextView;
    updatePlotResetButtons();
    drawAll();
  }
  function resetPlotView(plotId) {
    plotViews[plotId] = {};
    if (activeSelection?.plotId === plotId) activeSelection = null;
    updatePlotResetButtons();
    drawAll();
  }
  function plotViewIsActive(plotId) {
    return Boolean(plotViews[plotId].xlim || plotViews[plotId].ylim);
  }
  function updatePlotResetButtons() {
    document.querySelectorAll("[data-plot-reset]").forEach((button) => {
      const plotId = button.dataset.plotReset;
      button.disabled = !plotId || !plotViewIsActive(plotId);
    });
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
    const labels = { rk45: "RK45", dop853: "DOP853", midpoint: "Mid" };
    const titles = { rk45: "RK45 adaptive solver", dop853: "DOP853 reference solver", midpoint: "Historical midpoint solver" };
    SOLVER_NAMES.forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.solver = name;
      button.textContent = labels[name];
      button.title = titles[name];
      button.addEventListener("click", () => {
        state.solver = name;
        updateSolverButtons();
        rebuildIntegrationControls();
        refreshActivePreset();
        scheduleSolve();
      });
      container.appendChild(button);
    });
  }
  function activeIntegrationControlKeys() {
    const visible = /* @__PURE__ */ new Set(["tEnd", "step", "maxStep"]);
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
  function rebuildIntegrationControls() {
    const container = el("integrationControls");
    if (!container.querySelector("[data-control-key]")) {
      buildSliderGroup("integrationControls", CONTROL_GROUPS.integration);
    }
    updateIntegrationControlVisibility();
    updateResetButtons();
  }
  function updateIntegrationControlVisibility() {
    const visible = activeIntegrationControlKeys();
    document.querySelectorAll("#integrationControls [data-control-key]").forEach((wrapper) => {
      const key = wrapper.dataset.controlKey;
      wrapper.hidden = !key || !visible.has(key);
    });
  }
  function buildSliderGroup(containerId, controls) {
    const container = el(containerId);
    container.querySelectorAll("[data-reset-key]").forEach((button) => {
      const key = button.dataset.resetKey;
      if (key) controlElements.delete(key);
    });
    container.innerHTML = "";
    controls.forEach(([key, symbol, name, min, max, step2, _defaultValue, color]) => {
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
        <input type="range" min="${min}" max="${max}" step="${step2}" value="${String(sliderInputValue(key))}" aria-label="${name}">
        ${key === "tEnd" ? tauScaleMarkup() : ""}
        </div>
      <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">\u21BA</button>
    `;
      const input = wrapper.querySelector("input");
      if (!input) throw new Error("missing slider input");
      input.addEventListener("input", (event) => {
        state[key] = valueFromSlider(key, Number(event.target.value));
        updateSliderLabel(key);
        if (key === "m") updateEquationBlocks();
        refreshActivePreset();
        scheduleSolve();
      });
      wrapper.querySelector("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
      container.appendChild(wrapper);
      controlElements.set(key, input);
      updateSliderLabel(key);
    });
    queueMathTypeset([container]);
  }
  function tauScaleMarkup() {
    const maxLog = Math.log10(Math.max(...TAU_TICKS));
    return `<div class="slider-scale">${TAU_TICKS.map((tick) => {
      const position = Math.log10(tick) / maxLog * 100;
      return `<span style="--tick-position:${position.toFixed(4)}%">${tick}</span>`;
    }).join("")}</div>`;
  }
  function sliderInputValue(key) {
    return key === "tEnd" ? Math.log10(state.tEnd) : state[key];
  }
  function valueFromSlider(key, value) {
    if (key !== "tEnd") return value;
    return Math.min(1e3, Math.max(1, 10 ** value));
  }
  function controlValueLabel(key, value) {
    if (key !== "tEnd") return fmt(value, 5);
    return fmt(value, value >= 100 ? 0 : 1);
  }
  function buildParameterTable() {
    const tunableTable = el("tunableParameterTable");
    const numericalTable = el("numericalParameterTable");
    const meaning = (text) => text.trim().replace(/\.$/, "");
    const controlRows = (controls) => controls.map(([key, symbol, _name, _min, _max, _step, _defaultValue, color]) => `
      <tr>
        <td class="symbol-cell" style="--color:${color}">${symbol}</td>
        <td>${meaning(PARAMETER_DESCRIPTIONS[key] || "")}</td>
      </tr>
    `).join("");
    tunableTable.innerHTML = controlRows(CONTROL_GROUPS.physical) + `
      <tr><td class="symbol-cell" style="--color:${COLORS.H}">driver</td><td>${meaning(`Convective driving choice: the standard Stellingwerf pressure form is \\(\\sqrt{${TEX.H}}\\); \\(\\sqrt{|${TEX.V}|}\\) is retained as a diagnostic variant.`)}</td></tr>
      <tr><td class="symbol-cell" style="--color:${COLORS.m}">geometry</td><td>${meaning(`Switch between fixed paper-model \\(${TEX.m}\\) and radius-dependent local geometry \\(${TEX.m}_{\\mathrm{eff}}(${TEX.R})\\).`)}</td></tr>
    `;
    numericalTable.innerHTML = controlRows(CONTROL_GROUPS.integration) + `
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>${meaning("Numerical method: RK45 default, DOP853 reference, or historical midpoint.")}</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">phase window</td><td>${meaning("Reference cycles use the first valid minimum-light luminosity window; final cycles use the latest valid window.")}</td></tr>
    `;
    queueMathTypeset();
  }
  function updateEquationBlocks() {
    const eta = Math.cbrt(Math.max(0, 1 - 3 / state.m));
    const etaDisplay = fmtFixed(eta, 2);
    const geometry = state.variableM ? `\\ozMass{m}_{\\mathrm{eff}} &= \\frac{3}{1-(\\ozNeutral{\\eta}/\\ozRadius{R})^3}
       \\qquad \\ozNeutral{\\eta}=\\left(1-\\frac{3}{\\ozMass{m}}\\right)^{1/3}=\\ozNeutral{${etaDisplay}}` : `\\ozMass{m}_{\\mathrm{eff}} &= \\ozMass{m}`;
    const driver = state.driver === "abs-v" ? "\\sqrt{|\\ozVelocity{V}|}" : "\\sqrt{\\ozPressure{H}}";
    const odeNode = el("odeEquations");
    const luminosityNode = el("luminosityEquations");
    odeNode.dataset.driverMode = state.driver;
    const odeHtml = `
    \\[
    \\begin{aligned}
    \\frac{d\\ozRadius{R}}{d\\ozTau{\\tau}} &=
      \\ozVelocity{V}\\\\[0.35em]
    \\frac{d\\ozVelocity{V}}{d\\ozTau{\\tau}} &=
      \\frac{\\ozPressure{H}}{\\ozRadius{R}^{\\ozMass{m}_{\\mathrm{eff}}\\ozGamma{\\Gamma_1}-2}}
      - \\frac{1}{\\ozRadius{R}^{2}}
      - \\ozDamping{C_q}\\ozVelocity{V}^{3}\\\\[0.35em]
    \\frac{d\\ozPressure{H}}{d\\ozTau{\\tau}} &=
      \\ozZeta{\\zeta}\\,
      \\ozRadius{R}^{\\ozMass{m}_{\\mathrm{eff}}(\\ozGamma{\\Gamma_1}-1)}
      \\left[
        \\ozRadius{R}^{\\ozSource{U}}
        - \\ozLuminosity{L}
      \\right]\\\\[0.35em]
    \\frac{d\\ozConvective{U_c}}{d\\ozTau{\\tau}} &=
      \\ozZetac{\\zeta_c}
      \\left[
        \\ozRadius{R}^{-\\ozMass{m}_{\\mathrm{eff}}(\\ozGamma{\\Gamma_1}-1)/2}\\,${driver}
        - \\ozConvective{U_c}
      \\right]
    \\end{aligned}
    \\]
  `;
    luminosityNode.dataset.geometryMode = state.variableM ? "radius-dependent" : "fixed";
    luminosityNode.dataset.etaValue = etaDisplay;
    const luminosityHtml = `
    \\[
    \\begin{aligned}
    ${geometry}\\\\[0.35em]
    \\ozRadiative{L_r} &=
      \\ozRadius{R}^{4+\\ozMass{m}_{\\mathrm{eff}}
      \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
      \\ozPressure{H}^{\\ozPink{s}+4}\\\\[0.35em]
    \\ozConvLum{L_c} &=
      \\ozRadius{R}^{-(\\ozMass{m}_{\\mathrm{eff}}-2)}
      \\ozConvective{U_c}^{3}\\\\[0.35em]
    \\ozLuminosity{L} &=
      (1-\\ozGammac{\\gamma_c})\\ozRadiative{L_r}
      + \\ozGammac{\\gamma_c}\\ozConvLum{L_c}
    \\end{aligned}
    \\]
  `;
    stageMathHtml(odeNode, odeHtml);
    stageMathHtml(luminosityNode, luminosityHtml);
    queueMathTypeset([odeNode, luminosityNode]);
  }
  function updateVariableInitials() {
    const initial = sample(0, [state.r0, state.v0, state.h0, state.uc0], state);
    const values = {
      initialTau: `\\(${TEX.tau}_{0}=0\\)`,
      initialR: `\\(${TEX.R}_{0}=${fmt(initial.R, 4)}\\)`,
      initialV: `\\(${TEX.V}_{0}=${fmt(initial.V, 4)}\\)`,
      initialH: `\\(${TEX.H}_{0}=${fmt(initial.H, 4)}\\)`,
      initialUc: `\\(${TEX.Uc}_{0}=${fmt(initial.Uc, 4)}\\)`,
      initialLr: `\\(${TEX.Lr}_{0}=${fmt(initial.Lr, 4)}\\)`,
      initialLc: `\\(${TEX.Lc}_{0}=${fmt(initial.Lc, 4)}\\)`,
      initialL: `\\(${TEX.L}_{0}=${fmt(initial.L, 4)}\\)`
    };
    const targets = [];
    Object.entries(values).forEach(([id, value]) => {
      const node = el(id);
      if (node.dataset.mathSource === value || stagedMathUpdates.get(node)?.html === value) return;
      node.dataset.mathSource = value;
      stageMathHtml(node, value);
      targets.push(node);
    });
    if (targets.length) queueMathTypeset(targets);
  }
  function updateSliderLabel(key) {
    const label = document.querySelector(`[data-value-for="${String(key)}"]`);
    if (!label) return;
    const value = state[key];
    label.textContent = controlValueLabel(key, value);
    const input = controlElements.get(key);
    if (input) input.value = String(sliderInputValue(key));
  }
  function updateAllSliderLabels() {
    controlElements.forEach((_input, key) => updateSliderLabel(key));
    updateResetButtons();
  }
  function restoreParameterDefault(key) {
    state[key] = PRESETS[selectedPreset][key];
    updateSliderLabel(key);
    if (key === "m") updateEquationBlocks();
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
    el("presetSummaryLabel").textContent = activePreset;
  }
  function updateDriverButtons() {
    document.querySelectorAll("[data-driver]").forEach((button) => {
      button.classList.toggle("active", button.dataset.driver === state.driver);
    });
  }
  function updatePhaseModeButtons() {
    document.querySelectorAll("[data-phase-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.phaseMode === state.phaseMode);
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
    updatePhaseModeButtons();
    updateSolverButtons();
    el("variableM").checked = state.variableM;
    el("runUntilStable").checked = state.runUntilStable;
    rebuildIntegrationControls();
    updateEquationBlocks();
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
    drawAll();
  }
  function strideDownsample(rows, maxPoints) {
    if (rows.length <= maxPoints) return rows;
    const stride = Math.ceil(rows.length / maxPoints);
    const sampled = rows.filter((_row, index) => index % stride === 0);
    const last = rows.at(-1);
    if (last && sampled.at(-1) !== last) sampled.push(last);
    return sampled;
  }
  function downsample(rows, maxPoints = 2200, keys = []) {
    if (rows.length <= maxPoints) return rows;
    const uniqueKeys = [...new Set(keys)];
    if (!uniqueKeys.length) return strideDownsample(rows, maxPoints);
    const maxPointsPerBucket = 2 + uniqueKeys.length * 2;
    const bucketCount = Math.max(1, Math.floor(maxPoints / maxPointsPerBucket));
    const bucketSize = Math.ceil(rows.length / bucketCount);
    const selectedIndices = /* @__PURE__ */ new Set();
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
    return [...selectedIndices].sort((a, b) => a - b).map((index) => rows[index]);
  }
  function rowsInTauRange(rows, xlim) {
    if (!xlim || !validRange(xlim)) return rows;
    const [minTau, maxTau] = xlim;
    const firstVisible = rows.findIndex((row) => row.tau >= minTau);
    if (firstVisible === -1) return [];
    let endExclusive = firstVisible;
    while (endExclusive < rows.length && rows[endExclusive].tau <= maxTau) endExclusive += 1;
    return rows.slice(Math.max(0, firstVisible - 1), Math.min(rows.length, endExclusive + 1));
  }
  function activeSeriesKeys(plotId, keys) {
    return keys.filter((key) => seriesIsVisible(plotId, key));
  }
  function rowsForInteractivePlot(plotId, rows, keys, maxPoints = 6e4) {
    const windowedRows = rowsInTauRange(rows, plotViews[plotId].xlim);
    return downsample(windowedRows, maxPoints, activeSeriesKeys(plotId, keys));
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
  function colorWithAlpha(color, alpha) {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    if (!match) return color;
    const [, r, g, b] = match;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }
  function drawDenseEnvelope(ctx, item, plot, xlim, ylim) {
    const xSpan = xlim[1] - xlim[0];
    const ySpan = ylim[1] - ylim[0];
    if (xSpan <= 0 || ySpan <= 0) return false;
    const columnCount = Math.max(1, Math.ceil(plot.width));
    const bins = Array.from({ length: columnCount }, () => ({
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
      const column = clamp2(Math.floor((x - xlim[0]) / xSpan * columnCount), 0, columnCount - 1);
      const bin = bins[column];
      bin.min = Math.min(bin.min, y);
      bin.max = Math.max(bin.max, y);
      bin.sum += y;
      bin.count += 1;
      visibleCount += 1;
    });
    if (visibleCount <= plot.width * DENSE_ENVELOPE_POINTS_PER_PIXEL) return false;
    const sx = (column) => plot.left + (column + 0.5) / columnCount * plot.width;
    const sy = (value) => plot.top + plot.height - (value - ylim[0]) / ySpan * plot.height;
    const drawSegment = (start2, end) => {
      ctx.beginPath();
      for (let column = start2; column <= end; column += 1) {
        const bin = bins[column];
        const x = sx(column);
        const y = sy(bin.max);
        if (column === start2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let column = end; column >= start2; column -= 1) {
        const bin = bins[column];
        ctx.lineTo(sx(column), sy(bin.min));
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      for (let column = start2; column <= end; column += 1) {
        const bin = bins[column];
        const x = sx(column);
        const y = sy(bin.sum / bin.count);
        if (column === start2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.fillStyle = colorWithAlpha(item.color, 0.22);
    ctx.strokeStyle = colorWithAlpha(item.color, 0.88);
    ctx.lineWidth = item.width ? Math.max(1, item.width * 0.65) : 1.3;
    ctx.setLineDash([]);
    let start = null;
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
      ctx.fillText(fmt(ylim[1] - (ylim[1] - ylim[0]) * i / 4, 2), plot.left - PLOT_LAYOUT.yTickGap, y);
    }
    ctx.strokeStyle = THEME.axisBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = xlabelColor;
    ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
    ctx.save();
    ctx.translate(PLOT_LAYOUT.yLabelX, plot.top + plot.height / 2);
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
    const plot = {
      left: PLOT_LAYOUT.left,
      top: PLOT_LAYOUT.top,
      width: rect.width - PLOT_LAYOUT.left - PLOT_LAYOUT.right,
      height: rect.height - PLOT_LAYOUT.top - PLOT_LAYOUT.bottom
    };
    const xValues = [];
    const yValues = [];
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
    const ylim = options.view?.ylim || options.ylim || range(yValues, 0.08);
    plotRenderStates.set(canvasId, { plotId: options.interactivePlotId, plot, xlim, ylim });
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    drawAxes(ctx, plot, xlim, ylim, options.xlabel, options.ylabel, options.xlabelColor, options.ylabelColor);
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
    series.forEach((item) => {
      if (options.denseEnvelope && drawDenseEnvelope(ctx, item, plot, xlim, ylim)) return;
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
    ctx.restore();
    drawSelectionOverlay(ctx, canvasId, plot);
  }
  function drawSelectionOverlay(ctx, canvasId, plot) {
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
  function drawLegend(id, items, options = {}) {
    const node = el(id);
    const signature = JSON.stringify({
      plotId: options.plotId || "",
      items: items.map(({ label, color, key, toggleLabel }) => ({ label, color, key: key || "", toggleLabel: toggleLabel || "" }))
    });
    if (legendSignatures.get(id) === signature) {
      updateLegendToggleState(node, options.plotId);
      return;
    }
    legendSignatures.set(id, signature);
    node.innerHTML = items.map((item) => {
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
    }).join("");
    if (options.plotId) {
      node.querySelectorAll("[data-plot-series]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.plotSeries;
          if (!key) return;
          plotVisibility[options.plotId][key] = !seriesIsVisible(options.plotId, key);
          updateLegendToggleState(node, options.plotId);
          drawAll();
        });
      });
    }
    queueMathTypeset([node]);
  }
  function updateLegendToggleState(node, plotId) {
    if (!plotId) return;
    node.querySelectorAll("[data-plot-series]").forEach((button) => {
      const key = button.dataset.plotSeries;
      if (!key) return;
      const visible = seriesIsVisible(plotId, key);
      button.classList.toggle("is-hidden", !visible);
      button.setAttribute("aria-pressed", String(visible));
    });
  }
  function seriesIsVisible(plotId, key) {
    return plotVisibility[plotId][key] !== false;
  }
  function stopReasonLabel(message, runUntilStable) {
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
  function phaseUnavailableLabel(phase) {
    switch (phase.reason) {
      case "ok":
        return void 0;
      case "not_enough_rows":
        return "phase unavailable: not enough samples";
      case "not_enough_minima":
        return "phase unavailable: fewer than three luminosity minima";
      case "amplitude_below_threshold":
        return "phase unavailable: luminosity cycles are below threshold";
      case "reference_out_of_range":
        return "phase unavailable: comparison does not cover the reference window";
    }
  }
  function phaseForRows(rows) {
    return buildTwoCyclePhase(rows, {
      warmupTau: state.phaseWarmupTau,
      minAmplitude: state.phaseMinAmplitude,
      selection: state.phaseMode === "final" ? "last" : "first"
    });
  }
  function timeDomain(rows) {
    if (!rows.length) return [0, 1];
    const first = rows[0].tau;
    const last = rows[rows.length - 1].tau;
    return first === last ? range([first, last], 0.02) : [first, last];
  }
  function integrationTimeRange() {
    return [0, Math.max(state.tEnd, Number.EPSILON)];
  }
  function clearStalePlotView(plotId, rows) {
    const view = plotViews[plotId];
    const domain = timeDomain(rows);
    if (view.xlim && (view.xlim[1] < domain[0] || view.xlim[0] > domain[1])) view.xlim = void 0;
    if (view.xlim && !validRange(view.xlim)) view.xlim = void 0;
    if (view.ylim && !validRange(view.ylim)) view.ylim = void 0;
  }
  function visibleRows(plotId, key, rows) {
    return seriesIsVisible(plotId, key) ? rows : [];
  }
  function drawAll() {
    const rows = latestRows;
    updateVariableInitials();
    clearStalePlotView("time", rows);
    clearStalePlotView("lum", rows);
    updatePlotResetButtons();
    const stopReason = stopReasonLabel(latestResult.message, state.runUntilStable);
    const okStatus = latestResult.message === "equilibrium" || latestResult.message === "limit_cycle" || !state.runUntilStable && latestResult.status === "complete";
    const final = rows[rows.length - 1];
    const phase = phaseForRows(rows);
    const metricsNode = el("metrics");
    const metricItems = [
      { label: "stop", value: stopReason, className: okStatus ? "status-ok" : "status-warn" },
      { label: `final \\(${TEX.tau}\\)`, value: final ? fmt(final.tau || 0, 4) : "n/a" },
      { label: "models", value: rows.length },
      { label: "accepted", value: latestResult.stats.acceptedSteps },
      { label: "rejected", value: latestResult.stats.rejectedSteps },
      { label: "max err", value: fmt(latestResult.stats.maxNormalizedError, 3) },
      { label: "period", value: phase.period ? fmt(phase.period, 3) : "n/a" },
      { label: "phase", value: phase.reason === "ok" ? "available" : "unavailable" },
      { label: `final \\(${TEX.R}\\)`, value: final ? fmt(final.R, 3) : "n/a" },
      { label: `final \\(${TEX.L}\\)`, value: final ? fmt(final.L, 3) : "n/a" }
    ];
    const metricsHtml = metricItems.map(({ label, value, className }) => `<span class="metric${className ? ` ${className}` : ""}">${label}<b>${value}</b></span>`).join("");
    stageMathHtml(metricsNode, metricsHtml);
    queueMathTypeset([metricsNode]);
    const phaseSample = phase.rows.length ? downsample(phase.rows, 1800, ["L", "V"]) : [];
    const phaseMessage = phaseUnavailableLabel(phase);
    const phasePeriodLabel = `phase (period = ${phase.period ? fmt(phase.period, 3) : "n/a"} \u03C4)`;
    drawSeries("lightCanvas", [
      { label: "L", color: COLORS.L, rows: phaseSample, x: (row) => row.tau, y: (row) => row.L }
    ], {
      xlabel: phasePeriodLabel,
      ylabel: "luminosity L",
      ylabelColor: COLORS.L,
      xlim: [0, 2],
      ylim: phaseSample.length ? void 0 : [0, 1],
      message: phaseMessage
    });
    drawSeries("velocityCanvas", [
      { label: "V", color: COLORS.V, rows: phaseSample, x: (row) => row.tau, y: (row) => row.V }
    ], {
      xlabel: phasePeriodLabel,
      ylabel: "radial velocity V",
      ylabelColor: COLORS.V,
      xlim: [0, 2],
      ylim: phaseSample.length ? void 0 : [0, 1],
      message: phaseMessage
    });
    const timeXlim = integrationTimeRange();
    const sampledTimeRows = rowsForInteractivePlot("time", rows, ["R", "V", "H", "Uc"]);
    const sampledLumRows = rowsForInteractivePlot("lum", rows, ["L", "Lr", "Lc"]);
    drawSeries("timeCanvas", [
      { label: "R", color: COLORS.R, rows: visibleRows("time", "R", sampledTimeRows), x: (row) => row.tau, y: (row) => row.R },
      { label: "V", color: COLORS.V, rows: visibleRows("time", "V", sampledTimeRows), x: (row) => row.tau, y: (row) => row.V },
      { label: "H", color: COLORS.H, rows: visibleRows("time", "H", sampledTimeRows), x: (row) => row.tau, y: (row) => row.H },
      { label: "Uc", color: COLORS.Uc, rows: visibleRows("time", "Uc", sampledTimeRows), x: (row) => row.tau, y: (row) => row.Uc }
    ], {
      xlabel: "time \u03C4",
      ylabel: "state",
      xlabelColor: COLORS.tau,
      fallbackXlim: timeXlim,
      view: plotViews.time,
      interactivePlotId: "time",
      denseEnvelope: true,
      message: "all series hidden"
    });
    drawLegend("timeLegend", [
      { key: "R", label: `\\(${TEX.R}\\) radius`, color: COLORS.R, toggleLabel: "radius" },
      { key: "V", label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V, toggleLabel: "radial velocity" },
      { key: "H", label: `\\(${TEX.H}\\) nonadiabatic pressure factor`, color: COLORS.H, toggleLabel: "nonadiabatic pressure factor" },
      { key: "Uc", label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc, toggleLabel: "convective velocity" }
    ], { plotId: "time" });
    drawSeries("lumCanvas", [
      { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", sampledLumRows), x: (row) => row.tau, y: (row) => row.L },
      { label: "Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lr },
      { label: "Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lc }
    ], {
      xlabel: "time \u03C4",
      ylabel: "luminosity",
      xlabelColor: COLORS.tau,
      fallbackXlim: timeXlim,
      view: plotViews.lum,
      interactivePlotId: "lum",
      denseEnvelope: true,
      message: "all luminosity variables hidden"
    });
    drawLegend("lumLegend", [
      { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
      { key: "Lr", label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr, toggleLabel: "radiative luminosity" },
      { key: "Lc", label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc, toggleLabel: "convective luminosity" }
    ], { plotId: "lum" });
  }
  function downloadCsv() {
    if (!latestRows.length) return;
    const headers = ["tau", "R", "V", "H", "Uc", "Lr", "Lc", "L"];
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
    window.addEventListener("load", () => queueMathTypeset());
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
