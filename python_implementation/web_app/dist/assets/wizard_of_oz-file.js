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
      rtol: 1e-11,
      atol: 1e-13,
      initialStep: 1e-3,
      maxStep: 0.03,
      minStep: 1e-10,
      maxRows: 5e5,
      maxAcceptedSteps: 5e5,
      errTol: 1e-8,
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
    tau: "#8B949E",
    R: "#58A6FF",
    V: "#E69F00",
    H: "#CC79A7",
    Uc: "#A371F7",
    L: "#FF7B72",
    Lr: "#79C0FF",
    Lc: "#39C5CF",
    zeta: "#B392F0",
    zetac: "#FF7EB6",
    gammac: "#7EE787",
    m: "#9AA8BD",
    gamma1: "#C297FF",
    n: "#79C0FF",
    s: "#FF9BCE",
    sourceExp: "#D18616",
    cq: "#8B949E",
    tEnd: "#8B949E",
    step: "#8B949E",
    maxStep: "#8B949E",
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
    m: "\\ozChiZero{\\chi_0}",
    gamma1: "\\ozGamma{\\Gamma_1}",
    n: "\\ozBlue{n}",
    s: "\\ozPink{s}",
    sourceExp: "\\ozSource{U}",
    cq: "\\ozDamping{C_q}"
  };
  var TEX_EXTRA = {
    eta: "\\ozEta{\\eta}",
    kappa: "\\ozNeutral{\\kappa}",
    rho: "\\ozNeutral{\\rho}",
    temp: "\\ozNeutral{T}"
  };
  var RESPONSE_LOG_MIN = -2;
  var RESPONSE_LOG_MAX = 2;
  var RESPONSE_LOG_STEP = 0.02;
  var CHI_SLIDER_MIN = 0;
  var CHI_SLIDER_MAX = 1;
  var CHI_SLIDER_STEP = 5e-3;
  var CHI_PARAMETER_MIN = 3;
  var CHI_PARAMETER_BREAK = 20;
  var CHI_PARAMETER_MAX = 100;
  var CHI_SLIDER_BREAK = 0.82;
  var CONTROL_GROUPS = {
    physical: [
      ["zeta", `\\(${TEX.zeta}\\)`, "thermal response", RESPONSE_LOG_MIN, RESPONSE_LOG_MAX, RESPONSE_LOG_STEP, 1, COLORS.zeta],
      ["zetac", `\\(${TEX.zetac}\\)`, "convective response", RESPONSE_LOG_MIN, RESPONSE_LOG_MAX, RESPONSE_LOG_STEP, 1, COLORS.zetac],
      ["gammac", `\\(${TEX.gammac}\\)`, "convective flux fraction", 0, 1, 0.01, 0.5, COLORS.gammac],
      ["m", `\\(${TEX.m}\\)`, "shell thinness", CHI_SLIDER_MIN, CHI_SLIDER_MAX, CHI_SLIDER_STEP, 10, COLORS.m],
      ["gamma1", `\\(${TEX.gamma1}\\)`, "adiabatic exponent", 1.01, 1.67, 0.01, 1.1, COLORS.gamma1],
      ["n", `\\(${TEX.n}\\)`, "\u03BA-\u03C1 exponent", 0, 3, 0.05, 1, COLORS.n],
      ["s", `\\(${TEX.s}\\)`, "\u03BA-T exponent", 0, 8, 0.1, 3, COLORS.s],
      ["sourceExp", `\\(${TEX.sourceExp}\\)`, "inner L exponent", -2, 2, 0.05, 0, COLORS.sourceExp],
      ["cq", `\\(${TEX.cq}\\)`, "turbulent damping", 0, 10, 0.05, 0, COLORS.cq]
    ],
    initial: [
      ["r0", `\\(${TEX.R}_0\\)`, "initial radius", 0.75, 1.9, 0.01, 1.4, COLORS.R],
      ["v0", `\\(${TEX.V}_0\\)`, "initial radial velocity", -1.2, 1.2, 0.01, 0, COLORS.V],
      ["h0", `\\(${TEX.H}_0\\)`, "initial H factor", 0.3, 1.8, 0.01, 1, COLORS.H],
      ["uc0", `\\(${TEX.Uc}_{0}\\)`, "initial convective velocity", 0, 1.8, 0.01, 1, COLORS.Uc]
    ],
    integration: [
      ["tEnd", `\\(${TEX.tau}_{\\max}\\)`, "max time", 0, 3, 0.01, 300, COLORS.tEnd],
      ["step", `\\(\\Delta ${TEX.tau}_0\\)`, "initial step", 5e-4, 0.02, 5e-4, 1e-3, COLORS.step],
      ["maxStep", `\\(\\Delta ${TEX.tau}_{\\max}\\)`, "max adaptive step", 5e-3, 0.12, 5e-3, 0.03, COLORS.maxStep],
      ["logRtol", "\\(\\ozNeutral{\\log_{10} r_{tol}}\\)", "relative tol", -12, -8, 0.25, -11, COLORS.rtol],
      ["logAtol", "\\(\\ozNeutral{\\log_{10} a_{tol}}\\)", "absolute tol", -14, -10, 0.25, -13, COLORS.atol],
      ["logErrTol", "\\(\\ozNeutral{\\log_{10}\\epsilon}\\)", "tolerance", -9, -5, 0.25, -8, COLORS.errTol],
      ["logStabilityTol", "\\(\\ozNeutral{\\log_{10}\\epsilon_s}\\)", "stability tolerance", -4, -1, 0.25, -2.7, COLORS.errTol],
      ["stableCycles", "\\(\\ozNeutral{N_s}\\)", "stable cycles required", 3, 8, 1, 5, COLORS.errTol]
    ]
  };
  var PARAMETER_DESCRIPTIONS = {
    zeta: `Ratio of the model dynamical time to the thermal time; larger values make \\(${TEX.H}\\) adjust faster per \\(${TEX.tau}\\). The slider is logarithmic over \\(10^{-2}\\) to \\(10^2\\).`,
    zetac: `Ratio of the model dynamical time to the convective adjustment time; larger values make \\(${TEX.Uc}\\) relax faster, while zero freezes \\(${TEX.Uc}\\). The nonzero slider range is logarithmic over \\(10^{-2}\\) to \\(10^2\\).`,
    gammac: `Equilibrium convective luminosity fraction used to weight \\(${TEX.Lc}\\); \\(${TEX.Lr}\\) carries the complementary radiative weight \\(1-${TEX.gammac}\\).`,
    m: `Thin shell form factor that sets \\(${TEX_EXTRA.eta}\\), the shell's inner boundary radius as a fraction of the reference outer radius. Larger \\(${TEX.m}\\) means a thinner shell; when radius-dependent geometry is off, \\(\\ozChi{\\chi}=${TEX.m}\\). The slider covers 3 to 100, with most of its travel devoted to 3 to 20.`,
    gamma1: `First adiabatic exponent used in the \\(${TEX.H}\\) response.`,
    n: `Density exponent in the opacity convention \\(${TEX_EXTRA.kappa}\\propto${TEX_EXTRA.rho}^{${TEX.n}}${TEX_EXTRA.temp}^{-${TEX.s}}\\).`,
    s: `Temperature exponent in the opacity convention \\(${TEX_EXTRA.kappa}\\propto${TEX_EXTRA.rho}^{${TEX.n}}${TEX_EXTRA.temp}^{-${TEX.s}}\\).`,
    sourceExp: `Exponent \\(${TEX.sourceExp}\\) in the inner luminosity source \\(${TEX.R}^{${TEX.sourceExp}}\\).`,
    cq: "Cubic turbulent damping coefficient in the acceleration equation.",
    r0: `Starting shell radius \\(${TEX.R}_{0}\\).`,
    v0: `Starting radial velocity \\(${TEX.V}_{0}\\).`,
    h0: `Starting nonadiabatic pressure factor \\(${TEX.H}_{0}\\), not the total gas pressure.`,
    uc0: `Starting convective velocity \\(${TEX.Uc}_{0}\\).`,
    tEnd: `Maximum integration time \\(${TEX.tau}\\), measured in dynamical time units. The slider uses a logarithmic scale.`,
    step: `Initial adaptive step size \\(\\Delta ${TEX.tau}_0\\).`,
    maxStep: `Maximum step size \\(\\Delta ${TEX.tau}_{\\max}\\) allowed for adaptive solvers.`,
    logRtol: "Base-10 logarithm of the modern relative tolerance.",
    logAtol: "Base-10 logarithm of the modern absolute tolerance.",
    logErrTol: "Base-10 logarithm of the legacy midpoint error tolerance.",
    logStabilityTol: "Base-10 logarithm of the stability classification tolerance.",
    stableCycles: "Number of repeated cycles required before a limit cycle is classified stable."
  };
  var presetBase = {
    maxStep: 0.03,
    logRtol: -11,
    logAtol: -13,
    solver: "rk45",
    runUntilStable: true,
    logStabilityTol: -2.7,
    stableCycles: 5,
    phaseMinAmplitude: 1e-4,
    phaseMode: "final"
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
    logErrTol: -8,
    variableM: true,
    driver: "h",
    runUntilStable: false
  };
  var DEFAULT_PRESET_NAME = "RR Lyrae low-amplitude fundamental, damped";
  var PRESETS = {
    "Baker radiative pulsator": { ...presetBase, referenceFamily: "baker", phaseWarmupTau: 4, zeta: 1, zetac: 0, gammac: 0, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 0, tEnd: 24, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "Blue-edge convection": { ...paperBase, phaseWarmupTau: 24, zeta: 10, zetac: 0.1, gammac: 0.1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 40, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "Instability-strip convection": { ...paperBase, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 15, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "Red-edge convection": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 0.5, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 14, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "Radius-dependent strip": { ...paperBase, phaseWarmupTau: 6, zeta: 1, zetac: 1, gammac: 0.2, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.4, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 1e-3, logErrTol: -8, variableM: true, driver: "h", runUntilStable: false },
    "Fully convective runaway": { ...paperBase, phaseWarmupTau: 1, zeta: 2, zetac: 1, gammac: 1, m: 10, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 8, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "Thick convective shell": { ...paperBase, phaseWarmupTau: 7.5, zeta: 0.1, zetac: 10, gammac: 1, m: 5, gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, r0: 1.1, v0: 0, h0: 1, uc0: 1, tEnd: 24, step: 1e-3, logErrTol: -8, variableM: false, driver: "h", runUntilStable: false },
    "RR Lyrae fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.2 },
    "RR Lyrae low-amplitude fundamental": { ...overtoneBase, m: 10, sourceExp: -2, r0: 1.1 },
    "RR Lyrae low-amplitude fundamental, damped": { ...overtoneBase, phaseWarmupTau: 40, zetac: 1, gammac: 0.5, m: 10, sourceExp: -2, cq: 5, r0: 1.1, tEnd: 300, runUntilStable: true },
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
  function linearDynamicPeriod(p) {
    const chi = mAt(1, p);
    const frequencySquared = chi * p.gamma1 - 4;
    if (!Number.isFinite(frequencySquared) || frequencySquared <= 0) return null;
    return 2 * Math.PI / Math.sqrt(frequencySquared);
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
  function effectiveGammaC(p) {
    return p.zetac <= 0 && Math.abs(p.uc0) <= 1e-9 ? 0 : p.gammac;
  }
  function sample(tau, y, p) {
    const [radius, velocity, pressure, convectiveVelocity] = y;
    const powers = derivedPowers(radius, p);
    const gammaC = effectiveGammaC(p);
    const rawLr = radius ** powers.b * pressure ** (p.s + 4);
    const rawLc = radius ** -powers.c * convectiveVelocity ** 3;
    const lr = (1 - gammaC) * rawLr;
    const lc = gammaC * rawLc;
    return { tau, R: radius, V: velocity, H: pressure, Uc: convectiveVelocity, Lr: lr, Lc: lc, L: lr + lc };
  }
  function derivatives(_t, y, p) {
    const [radius, velocity, pressure, convectiveVelocity] = y;
    if (radius <= 0 || pressure <= 0 || !Number.isFinite(radius + velocity + pressure + convectiveVelocity)) {
      throw new Error("model left the positive-radius/positive-H domain");
    }
    const powers = derivedPowers(radius, p);
    const gammaC = effectiveGammaC(p);
    const lr = radius ** powers.b * pressure ** (p.s + 4);
    const lc = radius ** -powers.c * convectiveVelocity ** 3;
    const radiativeWeight = 1 - gammaC;
    const driver = p.driver === "h" ? Math.sqrt(pressure) : Math.sqrt(Math.abs(velocity));
    return [
      velocity,
      pressure / radius ** powers.q - 1 / radius ** 2 - p.cq * velocity ** 3,
      p.zeta * radius ** (powers.m * (p.gamma1 - 1)) * (radius ** p.sourceExp - radiativeWeight * lr - gammaC * lc),
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

  // src/grid.ts
  var CONTROL_META = /* @__PURE__ */ new Map();
  Object.values(CONTROL_GROUPS).forEach((controls) => {
    controls.forEach(([key, _symbol, _name, min, max, step2, defaultValue]) => {
      CONTROL_META.set(key, { key, min, max, step: step2, defaultValue });
    });
  });
  function sliderMeta(key) {
    const meta = CONTROL_META.get(key);
    if (!meta) throw new Error(`Missing control metadata for ${String(key)}`);
    return meta;
  }
  function decimalPlaces(value) {
    const text = String(value);
    if (text.includes("e-")) return Number(text.split("e-")[1]);
    const decimal = text.split(".")[1];
    return decimal ? decimal.length : 0;
  }
  function roundToNativeStep(value, step2) {
    const digits = Math.min(12, Math.max(0, decimalPlaces(step2) + 2));
    return Number(value.toFixed(digits));
  }
  function sliderValueFromParameter(key, parameters) {
    return sliderValueFromNumericValue(key, Number(parameters[key]));
  }
  function parameterValueFromSlider(key, sliderValue) {
    const meta = sliderMeta(key);
    const value = clampToMeta(sliderValue, meta);
    if (key === "tEnd") return Math.min(1e3, Math.max(1, 10 ** value));
    if (key === "zeta") return 10 ** value;
    if (key === "zetac") return value <= RESPONSE_LOG_MIN + 1e-12 ? 0 : 10 ** value;
    if (key === "m") return chiFromSliderValue(value);
    return value;
  }
  function sliderValueFromNumericValue(key, value) {
    const meta = sliderMeta(key);
    if (key === "tEnd") return clampToMeta(Math.log10(Math.max(1, value)), meta);
    if (key === "zeta") return clampToMeta(Math.log10(Math.max(10 ** RESPONSE_LOG_MIN, value)), meta);
    if (key === "zetac") {
      if (value <= 0 || !Number.isFinite(value)) return RESPONSE_LOG_MIN;
      return clampToMeta(Math.log10(value), meta);
    }
    if (key === "m") return clampToMeta(sliderValueFromChi(value), meta);
    return clampToMeta(value, meta);
  }
  function normalizeGridRange(range2) {
    const meta = sliderMeta(range2.key);
    const low = Math.min(range2.lowerSliderValue, range2.upperSliderValue);
    const high = Math.max(range2.lowerSliderValue, range2.upperSliderValue);
    return {
      ...range2,
      lowerSliderValue: clampToMeta(low, meta),
      upperSliderValue: clampToMeta(high, meta),
      centerSliderValue: clampToMeta(range2.centerSliderValue, meta),
      nativeStep: meta.step
    };
  }
  function defaultGridRange(key, currentSliderValue) {
    const meta = sliderMeta(key);
    const current = clampToMeta(currentSliderValue, meta);
    const distanceToMin = Math.abs(current - meta.min);
    const distanceToMax = Math.abs(meta.max - current);
    const target = distanceToMax >= distanceToMin ? meta.max : meta.min;
    const edge = current + (target - current) / 2;
    return normalizeGridRange({
      key,
      lowerSliderValue: Math.min(current, edge),
      upperSliderValue: Math.max(current, edge),
      centerSliderValue: current,
      nativeStep: meta.step
    });
  }
  function generateSliderSamples(rangeInput, stride = 1) {
    const range2 = normalizeGridRange(rangeInput);
    const meta = sliderMeta(range2.key);
    const step2 = meta.step;
    const firstIndex = Math.ceil((range2.lowerSliderValue - meta.min) / step2 - 1e-9);
    const lastIndex = Math.floor((range2.upperSliderValue - meta.min) / step2 + 1e-9);
    const effectiveStride = Math.max(1, Math.floor(stride));
    const samples = [];
    for (let index = firstIndex; index <= lastIndex; index += effectiveStride) {
      samples.push(roundToNativeStep(meta.min + index * step2, step2));
    }
    const upper = roundToNativeStep(meta.min + lastIndex * step2, step2);
    if (Number.isFinite(upper) && samples.at(-1) !== upper) samples.push(upper);
    return [...new Set(samples.filter((sample2) => sample2 >= meta.min - 1e-9 && sample2 <= meta.max + 1e-9))];
  }
  function centerSliderSample(rangeInput) {
    const range2 = normalizeGridRange(rangeInput);
    const samples = generateSliderSamples(range2, 1);
    if (!samples.length) return roundToNativeStep(range2.centerSliderValue, range2.nativeStep);
    return samples.reduce(
      (best, sample2) => Math.abs(sample2 - range2.centerSliderValue) < Math.abs(best - range2.centerSliderValue) ? sample2 : best,
      samples[0]
    );
  }
  function meanSliderSample(rangeInput) {
    const range2 = normalizeGridRange(rangeInput);
    return Number(((range2.lowerSliderValue + range2.upperSliderValue) / 2).toFixed(12));
  }
  function fallbackSliderSamples(rangeInput, selected) {
    const range2 = normalizeGridRange(rangeInput);
    if (!selected) return [centerSliderSample(range2)];
    const low = roundToNativeStep(range2.lowerSliderValue, range2.nativeStep);
    const center = centerSliderSample(range2);
    const high = roundToNativeStep(range2.upperSliderValue, range2.nativeStep);
    return [.../* @__PURE__ */ new Set([low, center, high])].sort((a, b) => a - b);
  }
  function estimateGridCoarseness(total, completed, elapsedMs, dimensionCount, targetMs = 1e3) {
    if (completed <= 0 || elapsedMs <= 0 || total <= 0) {
      return { stride: 1, estimatedTotalMs: null, zeroCompletedFallback: true };
    }
    const estimatedTotalMs = elapsedMs * total / completed;
    const reduction = Math.max(1, estimatedTotalMs / targetMs);
    const exponent = 1 / Math.max(1, dimensionCount);
    return {
      stride: Math.max(1, Math.ceil(reduction ** exponent)),
      estimatedTotalMs,
      zeroCompletedFallback: false
    };
  }
  function buildRangeSamples(ranges, loopKey, options = {}) {
    return ranges.map((range2) => ({
      key: range2.key,
      centerSliderValue: normalizeGridRange(range2).centerSliderValue,
      samples: addCenterSample(
        options.zeroCompletedFallback ? fallbackSliderSamples(range2, range2.key === loopKey) : generateSliderSamples(range2, options.stride ?? 1),
        range2
      )
    }));
  }
  function buildLoopPathSamples(ranges, loopKey, options = {}) {
    return ranges.map((rangeInput) => {
      const range2 = normalizeGridRange(rangeInput);
      const mean = meanSliderSample(range2);
      const samples = options.zeroCompletedFallback ? fallbackSliderSamples(range2, true) : generateSliderSamples(range2, options.stride ?? 1);
      return {
        key: range2.key,
        centerSliderValue: mean,
        samples: range2.key === loopKey ? samples : [mean]
      };
    });
  }
  function gridTotal(samples) {
    return samples.reduce((total, item) => total * Math.max(1, item.samples.length), 1);
  }
  function clampToMeta(value, meta) {
    return Math.min(meta.max, Math.max(meta.min, value));
  }
  function sliderValueFromChi(value) {
    const chi = Math.min(CHI_PARAMETER_MAX, Math.max(CHI_PARAMETER_MIN, value));
    if (chi <= CHI_PARAMETER_BREAK) {
      const fraction2 = (chi - CHI_PARAMETER_MIN) / (CHI_PARAMETER_BREAK - CHI_PARAMETER_MIN);
      return CHI_SLIDER_MIN + fraction2 * (CHI_SLIDER_BREAK - CHI_SLIDER_MIN);
    }
    const logMin = Math.log(CHI_PARAMETER_BREAK);
    const logMax = Math.log(CHI_PARAMETER_MAX);
    const fraction = (Math.log(chi) - logMin) / (logMax - logMin);
    return CHI_SLIDER_BREAK + fraction * (CHI_SLIDER_MAX - CHI_SLIDER_BREAK);
  }
  function chiFromSliderValue(value) {
    const slider = Math.min(CHI_SLIDER_MAX, Math.max(CHI_SLIDER_MIN, value));
    if (slider <= CHI_SLIDER_BREAK) {
      const fraction2 = (slider - CHI_SLIDER_MIN) / (CHI_SLIDER_BREAK - CHI_SLIDER_MIN);
      return CHI_PARAMETER_MIN + fraction2 * (CHI_PARAMETER_BREAK - CHI_PARAMETER_MIN);
    }
    const fraction = (slider - CHI_SLIDER_BREAK) / (CHI_SLIDER_MAX - CHI_SLIDER_BREAK);
    return CHI_PARAMETER_BREAK * (CHI_PARAMETER_MAX / CHI_PARAMETER_BREAK) ** fraction;
  }
  function addCenterSample(samples, range2) {
    const center = centerSliderSample(range2);
    return [.../* @__PURE__ */ new Set([...samples, center])].sort((a, b) => a - b);
  }

  // src/fourier.ts
  var TWO_PI = 2 * Math.PI;
  var FOURIER_HARMONICS = 7;
  var MIN_FOURIER_AMPLITUDE = 1e-4;
  function solveLinearSystem(matrix, rhs) {
    const n = rhs.length;
    const augmented = matrix.map((row, index) => [...row, rhs[index]]);
    for (let column = 0; column < n; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < n; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
      if (pivot !== column) [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];
      const scale = augmented[column][column];
      for (let j = column; j <= n; j += 1) augmented[column][j] /= scale;
      for (let row = 0; row < n; row += 1) {
        if (row === column) continue;
        const factor = augmented[row][column];
        for (let j = column; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
      }
    }
    return augmented.map((row) => row[n]);
  }
  function fourierBasis(phase) {
    const wrappedPhase = phase >= 2 ? 0 : (phase % 1 + 1) % 1;
    const basis = [1];
    for (let harmonic = 1; harmonic <= FOURIER_HARMONICS; harmonic += 1) {
      const angle = TWO_PI * harmonic * wrappedPhase;
      basis.push(Math.cos(angle), Math.sin(angle));
    }
    return basis;
  }
  function foldedPhase(phase) {
    const wrapped = (phase % 1 + 1) % 1;
    return wrapped >= 1 ? 0 : wrapped;
  }
  function foldedLightCurvePoints(rows) {
    const sorted = rows.filter((row) => Number.isFinite(row.tau) && Number.isFinite(row.L)).map((row) => ({ phase: foldedPhase(row.tau), luminosity: row.L })).sort((a, b) => a.phase - b.phase);
    const merged = [];
    for (const point of sorted) {
      const previous = merged.at(-1);
      if (previous && Math.abs(point.phase - previous.phase) < 1e-6) {
        previous.luminosity = 0.5 * (previous.luminosity + point.luminosity);
      } else {
        merged.push({ ...point });
      }
    }
    return merged;
  }
  function interpolatedFoldedLuminosity(points, phase) {
    if (!points.length) return NaN;
    if (points.length === 1) return points[0].luminosity;
    const targetPhase = foldedPhase(phase);
    for (let i = 1; i < points.length; i += 1) {
      const left2 = points[i - 1];
      const right2 = points[i];
      if (targetPhase <= right2.phase) {
        const span2 = right2.phase - left2.phase || 1;
        const t2 = (targetPhase - left2.phase) / span2;
        return left2.luminosity + (right2.luminosity - left2.luminosity) * t2;
      }
    }
    const left = points[points.length - 1];
    const right = points[0];
    const shiftedTarget = targetPhase < right.phase ? targetPhase + 1 : targetPhase;
    const span = right.phase + 1 - left.phase || 1;
    const t = (shiftedTarget - left.phase) / span;
    return left.luminosity + (right.luminosity - left.luminosity) * t;
  }
  function lightCurveMorphology(rows) {
    const points = foldedLightCurvePoints(rows);
    const sampleCount = 720;
    if (points.length < 3) return { skewness: 1, acuteness: 1 };
    const samples = Array.from({ length: sampleCount }, (_value, index) => {
      const phase = index / sampleCount;
      return { phase, luminosity: interpolatedFoldedLuminosity(points, phase) };
    }).filter((point) => Number.isFinite(point.luminosity));
    if (samples.length < 3) return { skewness: 1, acuteness: 1 };
    let maxPoint = samples[0];
    let minPoint = samples[0];
    for (const point of samples) {
      if (point.luminosity > maxPoint.luminosity) maxPoint = point;
      if (point.luminosity < minPoint.luminosity) minPoint = point;
    }
    const amplitude = maxPoint.luminosity - minPoint.luminosity;
    if (!(amplitude > 0)) return { skewness: 1, acuteness: 1 };
    const riseFraction = (maxPoint.phase - minPoint.phase + 1) % 1 || 1;
    const midpoint = 0.5 * (maxPoint.luminosity + minPoint.luminosity);
    let brightFraction = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const left = samples[index];
      const right = samples[(index + 1) % samples.length];
      const rightPhase = index === samples.length - 1 ? 1 : right.phase;
      const span = rightPhase - left.phase;
      const leftOffset = left.luminosity - midpoint;
      const rightOffset = right.luminosity - midpoint;
      if (leftOffset >= 0 && rightOffset >= 0) {
        brightFraction += span;
      } else if (leftOffset > 0 || rightOffset > 0) {
        const crossing = span * (Math.abs(leftOffset) / (Math.abs(leftOffset) + Math.abs(rightOffset) || 1));
        brightFraction += leftOffset > 0 ? crossing : span - crossing;
      }
    }
    const boundedRise = Math.min(1, Math.max(1 / samples.length, riseFraction));
    const boundedBright = Math.min(1, Math.max(1 / samples.length, brightFraction));
    return {
      skewness: 1 / boundedRise - 1,
      acuteness: 1 / boundedBright - 1
    };
  }
  function luminosityAmplitude(rows) {
    const values = rows.map((row) => row.L).filter(Number.isFinite);
    if (!values.length) return 0;
    return Math.max(...values) - Math.min(...values);
  }
  function wrapTwoPi(angle) {
    return (angle % TWO_PI + TWO_PI) % TWO_PI;
  }
  function computeFourierParameters(phaseRows) {
    const finiteRows = phaseRows.filter(
      (row) => Number.isFinite(row.tau) && Number.isFinite(row.L)
    );
    const parameterCount = 1 + 2 * FOURIER_HARMONICS;
    if (finiteRows.length < parameterCount) return null;
    const normal = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0));
    const rhs = Array(parameterCount).fill(0);
    for (const row of finiteRows) {
      const basis = fourierBasis(row.tau);
      for (let i = 0; i < parameterCount; i += 1) {
        rhs[i] += basis[i] * row.L;
        for (let j = 0; j < parameterCount; j += 1) normal[i][j] += basis[i] * basis[j];
      }
    }
    const coefficients = solveLinearSystem(normal, rhs);
    if (!coefficients) return null;
    const harmonics = [];
    for (let harmonic = 1; harmonic <= FOURIER_HARMONICS; harmonic += 1) {
      const cosine = coefficients[2 * harmonic - 1];
      const sine = coefficients[2 * harmonic];
      const amplitude = Math.hypot(cosine, sine);
      const phase = Math.atan2(-sine, cosine);
      harmonics.push({ amplitude, phase });
    }
    const [h1, h2, h3, h4, h5, h6, h7] = harmonics;
    if (!h1 || !h2 || !h3 || h1.amplitude <= 0) return null;
    const phases = [NaN, ...harmonics.map((harmonic) => wrapTwoPi(harmonic.phase))];
    const amplitudes = [NaN, ...harmonics.map((harmonic) => harmonic.amplitude)];
    const phiK1 = [NaN, 0, ...harmonics.slice(1).map(
      (harmonic, index) => wrapTwoPi(harmonic.phase - (index + 2) * h1.phase)
    )];
    const amplitudeRatios = [NaN, 1, ...harmonics.slice(1).map((harmonic) => harmonic.amplitude / h1.amplitude)];
    const morphology = lightCurveMorphology(finiteRows);
    return {
      luminosityAmplitude: luminosityAmplitude(finiteRows),
      phi1: phases[1],
      phi2: phases[2],
      phi3: phases[3],
      phi4: phases[4],
      phi5: phases[5],
      phi6: phases[6],
      phi7: phases[7],
      phi21: phiK1[2],
      phi31: phiK1[3],
      phi41: phiK1[4],
      phi51: phiK1[5],
      phi61: phiK1[6],
      phi71: phiK1[7],
      r21: amplitudeRatios[2],
      r31: amplitudeRatios[3],
      r41: amplitudeRatios[4],
      r51: amplitudeRatios[5],
      r61: amplitudeRatios[6],
      r71: amplitudeRatios[7],
      amplitude1: h1.amplitude,
      amplitude2: h2.amplitude,
      amplitude3: h3.amplitude,
      amplitude4: h4?.amplitude ?? 0,
      amplitude5: h5?.amplitude ?? 0,
      amplitude6: h6?.amplitude ?? 0,
      amplitude7: h7?.amplitude ?? 0,
      phases,
      phiK1,
      amplitudes,
      amplitudeRatios,
      skewness: morphology.skewness,
      acuteness: morphology.acuteness,
      coefficients
    };
  }
  function hasUsableFourierAmplitudes(fourier, minimum = MIN_FOURIER_AMPLITUDE) {
    return Boolean(fourier && fourier.amplitude1 >= minimum && fourier.amplitude2 >= minimum && fourier.amplitude3 >= minimum);
  }

  // src/phase.ts
  var SAME_EXTREMUM_LUMINOSITY_TOLERANCE = 0.025;
  function defaultWarmupTau(rows) {
    const finalTau = rows.at(-1)?.tau ?? 0;
    return Math.max(1, Math.min(4, 0.05 * finalTau));
  }
  function phaseWarmupTau(rows, requested) {
    return requested !== void 0 && Number.isFinite(requested) ? requested : defaultWarmupTau(rows);
  }
  function guidedMinSeparationFromPeriod(rows, period) {
    if (period === null || period === void 0 || !Number.isFinite(period) || period <= 0) return void 0;
    const firstTau = rows[0]?.tau;
    const finalTau = rows.at(-1)?.tau;
    if (firstTau === void 0 || finalTau === void 0) return void 0;
    if (!Number.isFinite(firstTau) || !Number.isFinite(finalTau) || finalTau <= firstTau) return void 0;
    const span = finalTau - firstTau;
    const guided = period * 0.55;
    const cap = Math.max(0.75, span / 5);
    return Math.max(0.75, Math.min(guided, cap));
  }
  function refinedLuminosityExtremum(rows, index, mode) {
    if (index <= 0 || index >= rows.length - 1) return rows[index];
    const previous = rows[index - 1];
    const current = rows[index];
    const next = rows[index + 1];
    const x0 = previous.tau - current.tau;
    const x2 = next.tau - current.tau;
    if (!(x0 < 0 && x2 > 0)) return current;
    const y0 = previous.L - current.L;
    const y2 = next.L - current.L;
    const slope0 = y0 / x0;
    const a = (slope0 - y2 / x2) / (x0 - x2);
    const b = slope0 - a * x0;
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) < 1e-14) return current;
    if (mode === "min" && a <= 0 || mode === "max" && a >= 0) return current;
    const vertex = -b / (2 * a);
    if (!Number.isFinite(vertex) || vertex < x0 || vertex > x2) return current;
    const luminosity = current.L + a * vertex * vertex + b * vertex;
    if (!Number.isFinite(luminosity)) return current;
    return { ...current, tau: current.tau + vertex, L: luminosity };
  }
  function findLuminosityMaxima(rows, after, minSeparation = 0.75) {
    const maxima = [];
    for (let i = 1; i < rows.length - 1; i += 1) {
      const row = rows[i];
      if (row.tau < after) continue;
      if (rows[i - 1].L < row.L && row.L >= rows[i + 1].L) {
        const maximum = refinedLuminosityExtremum(rows, i, "max");
        const last = maxima.at(-1);
        if (last && maximum.tau - last.tau < minSeparation) {
          if (maximum.L > last.L) maxima[maxima.length - 1] = maximum;
        } else {
          maxima.push(maximum);
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
        const minimum = refinedLuminosityExtremum(rows, i, "min");
        const last = minima.at(-1);
        if (last && minimum.tau - last.tau < minSeparation) {
          if (minimum.L < last.L) minima[minima.length - 1] = minimum;
        } else {
          minima.push(minimum);
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
    let minimumIndex = -1;
    let minimum = null;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.tau <= startTau || row.tau >= endTau) continue;
      if (!minimum || row.L < minimum.L) {
        minimum = row;
        minimumIndex = i;
      }
    }
    if (minimumIndex < 0) return minimum;
    const refined = refinedLuminosityExtremum(rows, minimumIndex, "min");
    return refined.tau > startTau && refined.tau < endTau ? refined : minimum;
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
  function buildReferenceFromAnchors(rows, anchorRows, anchor, warmupTau, minAmplitude) {
    const [first, second, third] = anchorRows;
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
      anchor,
      anchorRows,
      minimumRows: anchor === "min" ? anchorRows : void 0,
      maximumRows: anchor === "max" ? anchorRows : void 0
    };
    return foldRowsToReference(rows, reference);
  }
  function anchorLuminosityScore(anchorRows) {
    const values = anchorRows.map((row) => row.L);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
    return (max - min) / scale;
  }
  function selectAnchorCandidate(candidates) {
    if (!candidates.length) return null;
    const direct = candidates.find(
      (candidate) => candidate.stride === 1 && candidate.score <= SAME_EXTREMUM_LUMINOSITY_TOLERANCE
    );
    if (direct) return direct;
    return [...candidates].sort((a, b) => a.score - b.score || a.stride - b.stride)[0];
  }
  function selectAlternatingExtremumCandidate(candidates, anchor, selection) {
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => {
      const luminosityDelta = anchor === "min" ? a.meanLuminosity - b.meanLuminosity : b.meanLuminosity - a.meanLuminosity;
      if (Math.abs(luminosityDelta) > 1e-12) return luminosityDelta;
      const aReference = a.result.reference;
      const bReference = b.result.reference;
      const tauDelta = selection === "last" ? bReference.endTau - aReference.endTau : aReference.startTau - bReference.startTau;
      return tauDelta || a.score - b.score;
    })[0];
  }
  function buildAnchorCandidate(rows, anchorRows, anchor, warmupTau, minAmplitude, stride) {
    const result = buildReferenceFromAnchors(rows, anchorRows, anchor, warmupTau, minAmplitude);
    if (!result) return null;
    return {
      result,
      score: anchorLuminosityScore(anchorRows),
      stride,
      meanLuminosity: anchorRows.reduce((sum, row) => sum + row.L, 0) / anchorRows.length
    };
  }
  function buildReferenceFromExtrema(rows, extrema, anchor, warmupTau, minAmplitude, selection) {
    if (extrema.length < 3) {
      return { rows: [], reference: null, period: null, reason: anchor === "max" ? "not_enough_maxima" : "not_enough_minima" };
    }
    if (selection === "last") {
      const alternatingCandidates = [];
      for (let endIndex = extrema.length - 1; endIndex >= 2; endIndex -= 1) {
        const candidates = [];
        [1, 2].forEach((stride) => {
          const firstIndex = endIndex - 2 * stride;
          const midIndex = endIndex - stride;
          if (firstIndex < 0) return;
          const candidate = buildAnchorCandidate(
            rows,
            [extrema[firstIndex], extrema[midIndex], extrema[endIndex]],
            anchor,
            warmupTau,
            minAmplitude,
            stride
          );
          if (candidate) candidates.push(candidate);
        });
        const selected2 = selectAnchorCandidate(candidates);
        if (!selected2) continue;
        if (selected2.stride === 1) return selected2.result;
        alternatingCandidates.push(selected2);
        if (alternatingCandidates.length >= 2) {
          return selectAlternatingExtremumCandidate(alternatingCandidates, anchor, selection).result;
        }
      }
      const selected = selectAlternatingExtremumCandidate(alternatingCandidates, anchor, selection);
      if (selected) return selected.result;
    } else {
      const alternatingCandidates = [];
      for (let firstIndex = 0; firstIndex <= extrema.length - 3; firstIndex += 1) {
        const candidates = [];
        [1, 2].forEach((stride) => {
          const midIndex = firstIndex + stride;
          const endIndex = firstIndex + 2 * stride;
          if (endIndex >= extrema.length) return;
          const candidate = buildAnchorCandidate(
            rows,
            [extrema[firstIndex], extrema[midIndex], extrema[endIndex]],
            anchor,
            warmupTau,
            minAmplitude,
            stride
          );
          if (candidate) candidates.push(candidate);
        });
        const selected2 = selectAnchorCandidate(candidates);
        if (!selected2) continue;
        if (selected2.stride === 1) return selected2.result;
        alternatingCandidates.push(selected2);
        if (alternatingCandidates.length >= 2) {
          return selectAlternatingExtremumCandidate(alternatingCandidates, anchor, selection).result;
        }
      }
      const selected = selectAlternatingExtremumCandidate(alternatingCandidates, anchor, selection);
      if (selected) return selected.result;
    }
    return { rows: [], reference: null, period: null, reason: "amplitude_below_threshold" };
  }
  function buildMaxLightReference(rows, maxima, warmupTau, minAmplitude, selection) {
    return buildReferenceFromExtrema(rows, maxima, "max", warmupTau, minAmplitude, selection);
  }
  function buildReference(rows, options) {
    if (rows.length < 3) {
      return { rows: [], reference: null, period: null, reason: "not_enough_rows" };
    }
    const warmupTau = phaseWarmupTau(rows, options.warmupTau);
    const minAmplitude = options.minAmplitude ?? 1e-4;
    const maxima = findLuminosityMaxima(rows, warmupTau, options.minSeparation);
    if (options.anchor === "max") {
      return buildMaxLightReference(rows, maxima, warmupTau, minAmplitude, options.selection);
    }
    const minima = findLuminosityMinima(rows, warmupTau, minimumSeparationFromMaxima(maxima, options.minSeparation));
    const directMinimumResult = buildReferenceFromExtrema(rows, minima, "min", warmupTau, minAmplitude, options.selection);
    if (directMinimumResult.reason === "ok") return directMinimumResult;
    if (maxima.length >= 4) {
      const cycleMinima = [];
      for (let i = 0; i < maxima.length - 1; i += 1) {
        const minimum = minimumBetween(rows, maxima[i].tau, maxima[i + 1].tau);
        if (minimum) cycleMinima.push(minimum);
      }
      const result = buildReferenceFromExtrema(rows, cycleMinima, "min", warmupTau, minAmplitude, options.selection);
      if (result.reason === "ok") return result;
    }
    return directMinimumResult;
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

  // src/displayWindow.ts
  var AMPLITUDE_NOISE_FLOOR = 1e-5;
  var PARTIAL_CHANGE_FACTOR = 1.25;
  function isTimeWindowReason(message) {
    return message === "equilibrium" || message === "runaway" || message === "runaway_trend";
  }
  function buildPhaseDisplayWindow(phase, message) {
    return {
      mode: "phase",
      reason: phase.reason === "ok" ? "phase" : "phase_unavailable",
      rows: phase.rows,
      xlim: [0, 2],
      period: phase.period,
      message
    };
  }
  function buildTimeDisplayWindow(rows, reason, message) {
    const selection = terminalTimeWindowSelection(rows, reason);
    return {
      mode: "time",
      reason,
      rows: selection.rows,
      xlim: timeDomain(selection.rows),
      period: null,
      message: selection.kind === "damping_decade" ? "time window: last damping decade" : selection.kind === "partial_damping" ? "time window: partial damping window" : selection.kind === "growth_decade" ? "time window: runaway growth decade" : selection.kind === "partial_growth" ? "time window: partial runaway growth" : message
    };
  }
  function terminalTimeWindowSelection(rows, reason) {
    const finiteRows = rows.filter((row) => Number.isFinite(row.tau));
    if (finiteRows.length <= 2) return { rows: [...finiteRows], kind: "terminal" };
    const firstTau = finiteRows[0].tau;
    const finalTau = finiteRows[finiteRows.length - 1].tau;
    const span = finalTau - firstTau;
    if (span <= 0) return { rows: [...finiteRows], kind: "terminal" };
    let startTau = null;
    let kind = "terminal";
    if (reason === "equilibrium") {
      const dampingWindow = dampingWindowStart(finiteRows);
      if (dampingWindow) {
        startTau = dampingWindow.startTau;
        kind = dampingWindow.kind;
      }
    }
    if (reason === "runaway" || reason === "runaway_trend") {
      const growthWindow = growthWindowStart(finiteRows);
      if (growthWindow) {
        startTau = growthWindow.startTau;
        kind = growthWindow.kind;
      } else {
        const extrema = luminosityExtremaIndices(finiteRows);
        if (extrema.length >= 6) {
          startTau = finiteRows[extrema[extrema.length - 6]].tau;
          kind = "recent_extrema";
        } else if (extrema.length >= 3) {
          startTau = finiteRows[extrema[0]].tau;
          kind = "recent_extrema";
        }
      }
    }
    if (startTau === null) {
      const fraction = reason === "equilibrium" ? 0.22 : 0.28;
      const minimumDuration = reason === "equilibrium" ? 4 : 3;
      const maximumDuration = reason === "equilibrium" ? 18 : 24;
      const duration = Math.min(maximumDuration, Math.max(minimumDuration, span * fraction));
      startTau = Math.max(firstTau, finalTau - duration);
    }
    const selected = finiteRows.filter((row) => row.tau >= startTau && row.tau <= finalTau);
    return {
      rows: selected.length >= 2 ? selected : finiteRows.slice(-Math.min(finiteRows.length, 64)),
      kind
    };
  }
  function rowAtDisplayPosition(display, position) {
    if (display.mode === "time") return rowAtTime(display.rows, displayTimeAtPosition(display, position));
    return rowAtFoldedPhase(display.rows, position);
  }
  function displayMarkerX(display, position) {
    if (display.mode === "time") return displayTimeAtPosition(display, position);
    return normalizeFoldedPhase(position);
  }
  function displayAnimationEnd(display) {
    return display.mode === "time" ? 1 : 2;
  }
  function rowAtTime(rows, time) {
    if (!rows.length) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const target = clamp2(time, first.tau, last.tau);
    if (target <= first.tau) return first;
    if (target >= last.tau) return last;
    let lo = 0;
    let hi = rows.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (rows[mid].tau <= target) lo = mid;
      else hi = mid;
    }
    return interpolateRows(rows[lo], rows[hi], target);
  }
  function rowAtFoldedPhase(rows, phase) {
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
    return interpolateRows(rows[lo], rows[hi], target);
  }
  function interpolateRows(a, b, tau) {
    if (a.tau === b.tau) return a;
    const fraction = (tau - a.tau) / (b.tau - a.tau);
    const blend = (key) => a[key] + (b[key] - a[key]) * fraction;
    return {
      tau,
      R: blend("R"),
      V: blend("V"),
      H: blend("H"),
      Uc: blend("Uc"),
      Lr: blend("Lr"),
      Lc: blend("Lc"),
      L: blend("L")
    };
  }
  function displayTimeAtPosition(display, position) {
    const fraction = clamp2(position, 0, 1);
    return display.xlim[0] + fraction * (display.xlim[1] - display.xlim[0]);
  }
  function timeDomain(rows) {
    if (!rows.length) return [0, 1];
    const first = rows[0].tau;
    const last = rows[rows.length - 1].tau;
    if (first === last) return [first - 0.5, last + 0.5];
    return [first, last];
  }
  function luminosityExtremaIndices(rows) {
    const extrema = [];
    for (let index = 1; index < rows.length - 1; index += 1) {
      const previous = rows[index - 1].L;
      const current = rows[index].L;
      const next = rows[index + 1].L;
      if (!Number.isFinite(previous + current + next)) continue;
      if (current >= previous && current > next || current <= previous && current < next) {
        extrema.push(index);
      }
    }
    return extrema;
  }
  function dampingWindowStart(rows) {
    const extrema = luminosityExtremaIndices(rows);
    if (extrema.length < 5) return null;
    const samples = luminosityAmplitudeSamples(rows, extrema);
    if (samples.length < 4) return null;
    const amplitudes = samples.map((sample2) => sample2.amplitude);
    const maxAmplitude = Math.max(...amplitudes);
    if (!Number.isFinite(maxAmplitude) || maxAmplitude <= 0) return null;
    const amplitudeFloor = amplitudeNoiseFloor(maxAmplitude);
    let lastIndex = -1;
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      if (samples[index].amplitude >= amplitudeFloor) {
        lastIndex = index;
        break;
      }
    }
    if (lastIndex < 2) return null;
    const targetAmplitude = samples[lastIndex].amplitude * 10;
    if (targetAmplitude <= maxAmplitude * 1.02) {
      for (let index = lastIndex - 1; index >= 0; index -= 1) {
        if (samples[index].amplitude >= targetAmplitude) {
          return {
            startTau: paddedOscillationStartTau(rows, extrema, samples[index].startTau),
            kind: "damping_decade"
          };
        }
      }
    }
    const earlier = samples.slice(0, lastIndex).map((sample2, index) => ({ ...sample2, index })).filter((sample2) => sample2.amplitude >= amplitudeFloor).sort((a, b) => b.amplitude - a.amplitude)[0];
    if (!earlier || earlier.amplitude < samples[lastIndex].amplitude * PARTIAL_CHANGE_FACTOR) return null;
    return {
      startTau: paddedOscillationStartTau(rows, extrema, earlier.startTau),
      kind: "partial_damping"
    };
  }
  function growthWindowStart(rows) {
    return oscillatoryGrowthWindowStart(rows) ?? runawayMagnitudeGrowthWindowStart(rows);
  }
  function oscillatoryGrowthWindowStart(rows) {
    const extrema = luminosityExtremaIndices(rows);
    if (extrema.length < 5) return null;
    const samples = luminosityAmplitudeSamples(rows, extrema);
    if (samples.length < 4) return null;
    const amplitudes = samples.map((sample2) => sample2.amplitude);
    const maxAmplitude = Math.max(...amplitudes);
    if (!Number.isFinite(maxAmplitude) || maxAmplitude <= 0) return null;
    const amplitudeFloor = amplitudeNoiseFloor(maxAmplitude);
    let lastIndex = -1;
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      if (samples[index].amplitude >= amplitudeFloor) {
        lastIndex = index;
        break;
      }
    }
    if (lastIndex < 2) return null;
    const finalAmplitude = samples[lastIndex].amplitude;
    const previousMax = Math.max(...samples.slice(0, lastIndex).map((sample2) => sample2.amplitude));
    if (!Number.isFinite(finalAmplitude + previousMax) || finalAmplitude <= 0 || finalAmplitude < previousMax * 0.8) return null;
    const targetAmplitude = finalAmplitude / 10;
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      if (samples[index].amplitude >= amplitudeFloor && samples[index].amplitude <= targetAmplitude) {
        return {
          startTau: paddedOscillationStartTau(rows, extrema, samples[index].startTau),
          kind: "growth_decade"
        };
      }
    }
    const earlier = samples.slice(0, lastIndex).map((sample2, index) => ({ ...sample2, index })).filter((sample2) => sample2.amplitude >= amplitudeFloor).sort((a, b) => a.amplitude - b.amplitude)[0];
    if (!earlier || finalAmplitude < earlier.amplitude * PARTIAL_CHANGE_FACTOR) return null;
    return {
      startTau: paddedOscillationStartTau(rows, extrema, earlier.startTau),
      kind: "partial_growth"
    };
  }
  function paddedOscillationStartTau(rows, extrema, startTau) {
    const firstTau = rows[0].tau;
    const finalTau = rows[rows.length - 1].tau;
    const period = luminosityExtremaPeriod(rows, extrema);
    let paddedStartTau = startTau;
    if (period !== null) {
      paddedStartTau = Math.max(firstTau, paddedStartTau - 0.25 * period);
      const minimumDuration = Math.max(3, 2.5 * period);
      if (finalTau - paddedStartTau < minimumDuration) paddedStartTau = Math.max(firstTau, finalTau - minimumDuration);
    }
    return paddedStartTau;
  }
  function runawayMagnitudeGrowthWindowStart(rows) {
    if (rows.length < 4) return null;
    const values = rows.map(runawayMagnitude);
    const finalValue = values.at(-1) ?? 0;
    const maxValue = Math.max(...values);
    const floor = amplitudeNoiseFloor(maxValue);
    if (!Number.isFinite(finalValue + maxValue) || finalValue <= floor || finalValue < maxValue * 0.8) return null;
    const target = finalValue / 10;
    for (let index = values.length - 2; index >= 0; index -= 1) {
      if (values[index] >= floor && values[index] <= target) {
        return {
          startTau: paddedTrendStartTau(rows, rows[index].tau),
          kind: "growth_decade"
        };
      }
    }
    let startIndex = -1;
    let minValue = Infinity;
    for (let index = 0; index < values.length - 1; index += 1) {
      if (values[index] >= floor && values[index] < minValue) {
        minValue = values[index];
        startIndex = index;
      }
    }
    if (startIndex < 0 || finalValue < minValue * PARTIAL_CHANGE_FACTOR) return null;
    return {
      startTau: paddedTrendStartTau(rows, rows[startIndex].tau),
      kind: "partial_growth"
    };
  }
  function paddedTrendStartTau(rows, startTau) {
    const firstTau = rows[0].tau;
    const finalTau = rows[rows.length - 1].tau;
    const minimumDuration = Math.max(2, (finalTau - firstTau) * 0.06);
    let paddedStartTau = startTau;
    if (finalTau - paddedStartTau < minimumDuration) paddedStartTau = Math.max(firstTau, finalTau - minimumDuration);
    return paddedStartTau;
  }
  function runawayMagnitude(row) {
    const values = [
      Math.abs(row.R - 1),
      Math.abs(row.H - 1),
      Math.abs(row.Uc - 1),
      Math.abs(row.L - 1),
      Math.abs(row.V)
    ].filter(Number.isFinite);
    return values.length ? Math.max(...values) : 0;
  }
  function amplitudeNoiseFloor(maxAmplitude) {
    return Math.max(AMPLITUDE_NOISE_FLOOR, maxAmplitude * 1e-4);
  }
  function luminosityAmplitudeSamples(rows, extrema) {
    const samples = [];
    for (let index = 0; index < extrema.length - 1; index += 1) {
      const left = rows[extrema[index]];
      const right = rows[extrema[index + 1]];
      const duration = right.tau - left.tau;
      const scale = Math.max(1, Math.abs(left.L), Math.abs(right.L));
      const amplitude = Math.abs(right.L - left.L) / scale;
      if (duration > 0 && Number.isFinite(amplitude) && amplitude > 0) {
        samples.push({ startTau: left.tau, amplitude });
      }
    }
    return samples;
  }
  function luminosityExtremaPeriod(rows, extrema) {
    const gaps = [];
    for (let index = 0; index < extrema.length - 1; index += 1) {
      const gap = rows[extrema[index + 1]].tau - rows[extrema[index]].tau;
      if (gap > 0 && Number.isFinite(gap)) gaps.push(gap);
    }
    const halfPeriod = median2(gaps);
    return halfPeriod !== null ? 2 * halfPeriod : null;
  }
  function median2(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function normalizeFoldedPhase(phase) {
    if (!Number.isFinite(phase)) return 0;
    if (phase === 2) return 2;
    return (phase % 2 + 2) % 2;
  }
  function clamp2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // src/gridCompute.ts
  async function computeGridWithMessages(request, callbacks) {
    const nativeSamples = buildRangeSamples(request.ranges, request.loopKey, { stride: 1 });
    const native = await runGridPass(request, nativeSamples, callbacks, 2e3);
    if (callbacks.isCanceled()) {
      callbacks.post({ type: "grid-canceled", requestId: request.requestId });
      return;
    }
    if (native.completed) {
      const path2 = request.ranges.length <= 1 ? native : await runLoopPathPass(request, callbacks);
      if (callbacks.isCanceled()) {
        callbacks.post({ type: "grid-canceled", requestId: request.requestId });
        return;
      }
      postComplete(request, native, path2.results, 1, false, false, callbacks);
      return;
    }
    const estimate = estimateGridCoarseness(native.total, native.attempted, native.elapsedMs, Math.max(1, request.ranges.length));
    callbacks.post({
      type: "grid-canceled-for-coarsening",
      requestId: request.requestId,
      completed: native.attempted,
      total: native.total,
      elapsedMs: native.elapsedMs,
      stride: estimate.stride,
      estimatedTotalMs: estimate.estimatedTotalMs
    });
    const coarsenedSamples = buildRangeSamples(request.ranges, request.loopKey, {
      stride: estimate.stride,
      zeroCompletedFallback: estimate.zeroCompletedFallback
    });
    const coarsened = await runGridPass(request, coarsenedSamples, callbacks);
    if (callbacks.isCanceled()) {
      callbacks.post({ type: "grid-canceled", requestId: request.requestId });
      return;
    }
    const path = request.ranges.length <= 1 ? coarsened : await runLoopPathPass(request, callbacks, estimate.stride, estimate.zeroCompletedFallback);
    if (callbacks.isCanceled()) {
      callbacks.post({ type: "grid-canceled", requestId: request.requestId });
      return;
    }
    postComplete(request, coarsened, path.results, estimate.stride, true, estimate.zeroCompletedFallback, callbacks);
  }
  async function runLoopPathPass(request, callbacks, stride = 1, zeroCompletedFallback = false) {
    const pathSamples = buildLoopPathSamples(request.ranges, request.loopKey, { stride, zeroCompletedFallback });
    return runGridPass(request, pathSamples, callbacks, void 0, false);
  }
  async function runGridPass(request, samples, callbacks, deadlineMs, reportProgress = true) {
    const started = performance.now();
    const total = gridTotal(samples);
    const stats = {
      results: [],
      total,
      attempted: 0,
      validPhase: 0,
      validFourier: 0,
      excludedNonPhase: 0,
      phaseUnavailable: 0,
      failed: 0,
      elapsedMs: 0,
      completed: true
    };
    if (!samples.length || total <= 0) {
      stats.elapsedMs = performance.now() - started;
      return stats;
    }
    for (const sliderValues of sliderCombinations(samples)) {
      if (callbacks.isCanceled()) {
        stats.completed = false;
        break;
      }
      const elapsed = performance.now() - started;
      if (deadlineMs !== void 0 && elapsed > deadlineMs && stats.attempted < total) {
        stats.completed = false;
        break;
      }
      addGridModel(request, samples, sliderValues, stats);
      stats.attempted += 1;
      if (stats.attempted % 4 === 0 || stats.attempted === total) {
        stats.elapsedMs = performance.now() - started;
        if (reportProgress) {
          callbacks.post({
            type: "grid-progress",
            requestId: request.requestId,
            completed: stats.attempted,
            total,
            elapsedMs: stats.elapsedMs
          });
        }
        await yieldToBrowser();
      }
    }
    stats.elapsedMs = performance.now() - started;
    return stats;
  }
  function addGridModel(request, samples, sliderValues, stats) {
    const parameters = { ...request.baseParameters };
    const variedValues = {};
    for (const item of samples) {
      const sliderValue = sliderValues[item.key];
      if (sliderValue === void 0) continue;
      const parameterValue = parameterValueFromSlider(item.key, sliderValue);
      setNumericParameter(parameters, item.key, parameterValue);
      variedValues[item.key] = parameterValue;
    }
    try {
      const solved = solveModel(parameters);
      if (isTimeWindowReason(solved.message) || isTimeWindowReason(solved.status)) {
        stats.excludedNonPhase += 1;
        return;
      }
      const phase = buildTwoCyclePhase(solved.rows, {
        ...request.phase,
        minSeparation: guidedMinSeparationFromPeriod(solved.rows, linearDynamicPeriod(parameters))
      });
      if (phase.reason !== "ok" || !phase.period || phase.rows.length < 8) {
        stats.phaseUnavailable += 1;
        return;
      }
      const phaseRows = strideDownsample(phase.rows, 420);
      const rawFourier = computeFourierParameters(phase.rows);
      const fourier = hasUsableFourierAmplitudes(rawFourier) ? rawFourier : null;
      if (fourier) stats.validFourier += 1;
      stats.validPhase += 1;
      stats.results.push({
        id: stats.results.length,
        parameters,
        sliderValues: { ...sliderValues },
        variedValues,
        phaseRows,
        period: phase.period,
        fourier
      });
    } catch (_error) {
      stats.failed += 1;
    }
  }
  function setNumericParameter(parameters, key, value) {
    parameters[key] = value;
  }
  function* sliderCombinations(samples) {
    function* visit(index, current) {
      if (index >= samples.length) {
        yield { ...current };
        return;
      }
      const item = samples[index];
      for (const sample2 of item.samples) {
        current[item.key] = sample2;
        yield* visit(index + 1, current);
      }
      delete current[item.key];
    }
    yield* visit(0, {});
  }
  function strideDownsample(rows, maxPoints) {
    if (rows.length <= maxPoints) return [...rows];
    const stride = Math.ceil(rows.length / maxPoints);
    const sampled = rows.filter((_row, index) => index % stride === 0);
    const last = rows.at(-1);
    if (last && sampled.at(-1) !== last) sampled.push(last);
    return sampled;
  }
  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  function postComplete(request, stats, pathResults, stride, coarsened, zeroCompletedFallback, callbacks) {
    callbacks.post({
      type: "grid-complete",
      requestId: request.requestId,
      results: stats.results,
      pathResults,
      total: stats.total,
      attempted: stats.attempted,
      validPhase: stats.validPhase,
      validFourier: stats.validFourier,
      excludedNonPhase: stats.excludedNonPhase,
      phaseUnavailable: stats.phaseUnavailable,
      failed: stats.failed,
      elapsedMs: stats.elapsedMs,
      stride,
      coarsened,
      zeroCompletedFallback
    });
  }

  // src/visualization.ts
  var BLACKBODY_REFERENCE_TEMPERATURE = 6500;
  var BLACKBODY_RGB_10DEG_TABLE = [
    { temperature: 1e3, r: 255, g: 56, b: 0 },
    { temperature: 1500, r: 255, g: 109, b: 0 },
    { temperature: 2e3, r: 255, g: 137, b: 18 },
    { temperature: 2500, r: 255, g: 161, b: 72 },
    { temperature: 3e3, r: 255, g: 180, b: 107 },
    { temperature: 3500, r: 255, g: 196, b: 137 },
    { temperature: 4e3, r: 255, g: 209, b: 163 },
    { temperature: 4500, r: 255, g: 219, b: 186 },
    { temperature: 5e3, r: 255, g: 228, b: 206 },
    { temperature: 5500, r: 255, g: 236, b: 224 },
    { temperature: 6e3, r: 255, g: 243, b: 239 },
    { temperature: 6500, r: 255, g: 249, b: 253 },
    { temperature: 7e3, r: 245, g: 243, b: 255 },
    { temperature: 7500, r: 235, g: 238, b: 255 },
    { temperature: 8e3, r: 227, g: 233, b: 255 },
    { temperature: 8500, r: 220, g: 229, b: 255 },
    { temperature: 9e3, r: 214, g: 225, b: 255 },
    { temperature: 9500, r: 208, g: 222, b: 255 },
    { temperature: 1e4, r: 204, g: 219, b: 255 },
    { temperature: 10500, r: 200, g: 217, b: 255 },
    { temperature: 11e3, r: 196, g: 215, b: 255 },
    { temperature: 11500, r: 193, g: 213, b: 255 },
    { temperature: 12e3, r: 191, g: 211, b: 255 },
    { temperature: 12500, r: 188, g: 210, b: 255 },
    { temperature: 13e3, r: 186, g: 208, b: 255 }
  ];
  function clamp3(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function interpolateNumber(a, b, fraction) {
    return a + (b - a) * fraction;
  }
  function inferEffectiveTemperature(luminosity, radius, referenceTemperature = BLACKBODY_REFERENCE_TEMPERATURE) {
    if (luminosity <= 0 || radius <= 0 || !Number.isFinite(luminosity + radius + referenceTemperature)) {
      return referenceTemperature;
    }
    return referenceTemperature * (luminosity / radius ** 2) ** 0.25;
  }
  function clampBlackbodyTemperature(temperature) {
    const first = BLACKBODY_RGB_10DEG_TABLE[0].temperature;
    const last = BLACKBODY_RGB_10DEG_TABLE[BLACKBODY_RGB_10DEG_TABLE.length - 1].temperature;
    return clamp3(Number.isFinite(temperature) ? temperature : BLACKBODY_REFERENCE_TEMPERATURE, first, last);
  }
  function blackbodyRgbForTemperature(temperature) {
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
  function rgbCss(color, alpha = 1) {
    return alpha >= 1 ? `rgb(${color.r}, ${color.g}, ${color.b})` : `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp3(alpha, 0, 1)})`;
  }
  function shellGeometryFor(radius, formFactor) {
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
  function shellGeometryFromModel(row, parameters) {
    return shellGeometryFor(row.R, mAt(row.R, parameters));
  }

  // src/stability.ts
  function condition(kind, value, expression) {
    return {
      kind,
      stable: value > 0,
      value,
      threshold: 0,
      margin: value,
      expression
    };
  }
  function firstStabilityKind(conditions, additionalMargins = []) {
    const neutralTolerance = 1e-10;
    if (conditions.some((item) => Math.abs(item.value) <= neutralTolerance) || additionalMargins.some((value) => Math.abs(value) <= neutralTolerance)) {
      return "neutral";
    }
    const firstUnstable = conditions.find((item) => !item.stable);
    return firstUnstable?.kind ?? "stable";
  }
  function analyticStabilityConditions(parameters) {
    const radius = 1;
    const m = mAt(radius, parameters);
    const powers = derivedPowers(radius, parameters);
    const gammaC = effectiveGammaC(parameters);
    const radiativeWeight = 1 - gammaC;
    const eCoefficient = radiativeWeight * powers.b - gammaC * powers.c - parameters.sourceExp;
    const radiativeThermal = radiativeWeight * (parameters.s + 4);
    const restoring = powers.q - 2;
    const secularCoupling = eCoefficient + restoring * radiativeThermal;
    const convectiveCorrection = 1.5 * gammaC * (m - 4);
    const convectiveResponse = parameters.zeta * parameters.zetac * (secularCoupling + convectiveCorrection);
    const secularResponse = parameters.zetac * restoring + parameters.zeta * secularCoupling;
    const dynamicCoupling = parameters.zeta * parameters.zetac * (radiativeThermal + 1.5 * gammaC) + restoring;
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
      const secular2 = condition(
        "secular",
        parameters.zeta * secularCoupling,
        "zeta * (E + (chi0 * Gamma1 - 4) * (1 - gamma_c) * (s + 4)) > 0"
      );
      const dynamic2 = condition(
        "dynamic",
        restoring,
        "chi0 * Gamma1 - 4 > 0"
      );
      const pulsational2 = condition(
        "pulsational",
        -eCoefficient,
        "-E > 0"
      );
      const conditions2 = [secular2, dynamic2, pulsational2];
      return {
        m,
        b: powers.b,
        physicsMode: "radiative",
        eCoefficient,
        terms,
        dynamic: dynamic2,
        secular: secular2,
        pulsational: pulsational2,
        conditions: conditions2,
        kind: thermalMargin < 0 ? "secular" : firstStabilityKind(conditions2, [thermalMargin]),
        allStable: thermalMargin > 0 && conditions2.every((item) => item.stable)
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
  function cepheidStripCoordinate(parameters) {
    const zeta = Math.max(1e-6, parameters.zeta);
    const zetac = Math.max(1e-6, parameters.zetac);
    return Math.min(1, Math.max(0, (Math.log10(zetac / zeta) + 2) / 4));
  }

  // src/main.ts
  var state = { ...PRESETS[DEFAULT_PRESET_NAME] };
  var selectedPreset = DEFAULT_PRESET_NAME;
  var activePreset = DEFAULT_PRESET_NAME;
  var latestRows = [];
  var latestResult = solveModel(state);
  var phaseAnchor = "min";
  var debounceTimer = 0;
  var mathTypesetTimer = 0;
  var mathTypesetRunning = false;
  var mathTypesetPending = false;
  var mathTypesetWholeRoot = false;
  var mathRenderVersion = 0;
  var lastDerivationSignature = "";
  var mathTypesetTargets = /* @__PURE__ */ new Set();
  var stagedMathUpdates = /* @__PURE__ */ new Map();
  var PIANO_MIN_NOTE = 21;
  var PIANO_MAX_NOTE = 108;
  var MIDDLE_C_NOTE = 60;
  var PIANO_VISIBLE_OCTAVES = 2;
  var PIANO_MIN_START_OCTAVE = 1;
  var PIANO_MAX_START_OCTAVE = 6;
  var PIANO_DEFAULT_START_OCTAVE = 3;
  var PIANO_OUTPUT_GAIN = 0.45;
  var SONIFICATION_ATTACK_SECONDS = 1;
  var SONIFICATION_RELEASE_SECONDS = 0.14;
  var SONIFICATION_OUTPUT_GAIN = 0.12;
  var SONIFICATION_FREQUENCY_GLIDE_SECONDS = 0.035;
  var SONIFICATION_WAVEFORM_CROSSFADE_SECONDS = 0.18;
  var SONIFICATION_MAX_SAMPLES = 2400;
  var SONIFICATION_WAVEFORM_SAMPLES = 512;
  var SONIFICATION_WAVEFORM_SMOOTH_PASSES = 5;
  var SONIFICATION_MAX_HARMONICS = 32;
  var PIANO_DEFAULT_ENVELOPE = { attack: 0.015, decay: 0.22, release: 0.36 };
  var PIANO_DEFAULT_SUSTAIN_LEVEL = 0.38;
  var MODEL_ANIMATION_BASE_DURATION_MS = 4e3;
  var MODEL_ANIMATION_MIN_SPEED = 0.25;
  var MODEL_ANIMATION_MAX_SPEED = 4;
  var GRID_LOOP_BASE_INTERVAL_MS = 90;
  var GRID_LOOP_MIN_SPEED = 0.25;
  var GRID_LOOP_MAX_SPEED = 4;
  var GRID_PHASE_BACKGROUND_MAX_MODELS = 96;
  var GRID_PHASE_BACKGROUND_MAX_POINTS = 160;
  var GRID_PHASE_PATH_MAX_POINTS = 260;
  var GRID_PHASE_CURRENT_MAX_POINTS = 900;
  var TP_OPACITY_BACKGROUND_MAX_MODELS = 28;
  var TP_OPACITY_BACKGROUND_MAX_POINTS = 220;
  var TP_OPACITY_PATH_MAX_POINTS = 360;
  var TP_OPACITY_CURRENT_MAX_POINTS = 900;
  var PHASE_MARKER_COLOR = "#FFD166";
  var POSITIVE_VELOCITY_COLOR = "#4DA3FF";
  var NEGATIVE_VELOCITY_COLOR = "#FF5F6D";
  var FOURIER_HARMONIC_COLORS = {
    2: "#79C0FF",
    3: "#FF7B72",
    4: "#7EE787",
    5: "#FFD166",
    6: "#C297FF",
    7: "#39C5CF"
  };
  var PHASE_SCRUB_CANVAS_IDS = ["lightCanvas", "velocityCanvas", "pressureCanvas"];
  var PHASE_HOVER_CANVAS_IDS = ["lightCanvas", "velocityCanvas"];
  var SONIFICATION_SOURCE_LABELS = {
    luminosity: "luminosity",
    velocity: "radial velocity",
    pressure: "pressure"
  };
  var controlElements = /* @__PURE__ */ new Map();
  var gridRangeElements = /* @__PURE__ */ new Map();
  var gridState = {
    enabled: false,
    ranges: /* @__PURE__ */ new Map(),
    savedRanges: /* @__PURE__ */ new Map(),
    selectedLoopKey: null,
    status: "idle",
    statusText: "Grid off",
    requestId: 0,
    worker: null,
    workerDisabled: false,
    fallbackToken: 0,
    debounceTimer: 0,
    animationTimer: 0,
    animationIndex: 0,
    animationDirection: 1,
    results: [],
    pathResults: [],
    hoverResult: null,
    heldResult: null,
    lastComplete: null,
    restorePlotVisibility: null
  };
  var currentAnimationPhase = 0;
  var modelAnimationSpeed = 1;
  var gridLoopSpeed = 1;
  var modelAnimationFrame = 0;
  var modelAnimationStartTime = null;
  var latestDisplayWindow = {
    mode: "phase",
    reason: "phase_unavailable",
    rows: [],
    xlim: [0, 2],
    period: null
  };
  var latestPhaseRows = [];
  var latestPhaseSample = [];
  var latestPhaseMessage;
  var latestPhasePeriodLabel = "phase (period = n/a \u03C4)";
  var latestPhaseLuminosityRange = [0, 1];
  var latestPhaseParameters = state;
  var phaseAnnotationsVisible = false;
  var sonificationReferenceNote = MIDDLE_C_NOTE;
  var sonificationReferenceHz = noteToFrequency(MIDDLE_C_NOTE);
  var sonificationSamples = [];
  var sonificationWaveformSignature = "";
  var sonificationSource = "luminosity";
  var sonificationContext = null;
  var sonificationVoice = null;
  var sonificationMasterGain = null;
  var sonificationStopTimer = 0;
  var sonificationVoices = /* @__PURE__ */ new Set();
  var sonificationActive = false;
  var activePhaseScrub = null;
  var activePhaseHoverCanvasId = null;
  var activeReferencePlotInteraction = null;
  var pianoModeActive = false;
  var pianoStartOctave = PIANO_DEFAULT_START_OCTAVE;
  var pianoMasterGain = null;
  var pianoEnvelope = { ...PIANO_DEFAULT_ENVELOPE };
  var pianoSustainLevel = PIANO_DEFAULT_SUSTAIN_LEVEL;
  var activePianoVoices = /* @__PURE__ */ new Map();
  var activePianoMidiCounts = /* @__PURE__ */ new Map();
  var referencePlotRenderStates = /* @__PURE__ */ new Map();
  var gridPathCache = null;
  var gridPhaseRowCache = /* @__PURE__ */ new WeakMap();
  var thermodynamicGridBackdropCache = null;
  var TAU_SCALE_MAX = 1e3;
  var TAU_TICKS = [1, 3, 10, 30, 100, 300];
  var THEME = {
    axisGrid: "#26334E",
    axisText: "#A8B4C7",
    axisBorder: "#526489",
    selectionFill: "rgba(158, 167, 255, 0.16)",
    selectionStroke: "#9EA7FF",
    neutralSymbol: "#C0CAE8"
  };
  var PIANO_KEYBOARD_BINDINGS = [
    { code: "KeyZ", label: "Z", offset: 0 },
    { code: "KeyS", label: "S", offset: 1 },
    { code: "KeyX", label: "X", offset: 2 },
    { code: "KeyD", label: "D", offset: 3 },
    { code: "KeyC", label: "C", offset: 4 },
    { code: "KeyV", label: "V", offset: 5 },
    { code: "KeyG", label: "G", offset: 6 },
    { code: "KeyB", label: "B", offset: 7 },
    { code: "KeyH", label: "H", offset: 8 },
    { code: "KeyN", label: "N", offset: 9 },
    { code: "KeyJ", label: "J", offset: 10 },
    { code: "KeyM", label: "M", offset: 11 },
    { code: "KeyQ", label: "Q", offset: 12 },
    { code: "Digit2", label: "2", offset: 13 },
    { code: "KeyW", label: "W", offset: 14 },
    { code: "Digit3", label: "3", offset: 15 },
    { code: "KeyE", label: "E", offset: 16 },
    { code: "KeyR", label: "R", offset: 17 },
    { code: "Digit5", label: "5", offset: 18 },
    { code: "KeyT", label: "T", offset: 19 },
    { code: "Digit6", label: "6", offset: 20 },
    { code: "KeyY", label: "Y", offset: 21 },
    { code: "Digit7", label: "7", offset: 22 },
    { code: "KeyU", label: "U", offset: 23 }
  ];
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
    lum: { L: true, Lr: true, Lc: true, Lb: true }
  };
  var PLOT_PANEL_LABELS = {
    model: "Shell",
    light: "Lightcurve",
    velocity: "RV Curve",
    heatEngine: "Heat Engine",
    work: "Work",
    time: "History",
    lum: "Luminosity Evolution",
    tpOpacity: "T-P Loop",
    stability: "Stability Map",
    strip: "Instability Strip",
    phasePortrait: "Thermal-Convection Loop"
  };
  var plotPanelVisibility = {
    model: true,
    light: true,
    velocity: true,
    heatEngine: true,
    work: true,
    time: true,
    lum: true,
    tpOpacity: true,
    stability: true,
    strip: true,
    phasePortrait: true
  };
  var plotRenderStates = /* @__PURE__ */ new Map();
  var legendSignatures = /* @__PURE__ */ new Map();
  var activeSelection = null;
  var gridColorbarRegions = /* @__PURE__ */ new Map();
  var fourierPointHits = [];
  var activeGridCanvasInteraction = null;
  var SLIDER_RANGE_DOUBLE_TAP_MS = 360;
  var SLIDER_RANGE_DOUBLE_TAP_DISTANCE = 22;
  var activeSliderTapStart = null;
  var lastSliderTap = null;
  var DENSE_ENVELOPE_POINTS_PER_PIXEL = 2.25;
  var STABILITY_MAP_RESOLUTION = 54;
  var INSTABILITY_STRIP_X_RESOLUTION = 72;
  var INSTABILITY_STRIP_Y_RESOLUTION = 44;
  var STRIP_LOG_RATIO_MIN = -2;
  var STRIP_LOG_RATIO_MAX = 2;
  var stabilityMapCache = /* @__PURE__ */ new Map();
  var instabilityStripCache = /* @__PURE__ */ new Map();
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
  function escapeAttribute(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function s72State(stable) {
    return stable ? "stable" : "unstable";
  }
  function s72Verdict(kind, stable) {
    const stateText = stable ? "stable" : "unstable";
    if (kind === "convective") return `convectively/turbulently ${stateText}`;
    if (kind === "dynamic") return `dynamically ${stateText}`;
    if (kind === "secular") return `secularly ${stateText}`;
    return `pulsationally ${stateText}`;
  }
  function s72MetricClass(stable) {
    return stable ? "status-ok" : "status-bad";
  }
  function s72LatexInequality(satisfied, symbol) {
    if (satisfied) return symbol;
    return symbol === ">" ? "\\not\\gt" : "\\not\\lt";
  }
  function s72TextInequality(satisfied, symbol) {
    if (satisfied) return symbol;
    return symbol === ">" ? "\u226F" : "\u226E";
  }
  function s72ShortLabel(kind) {
    if (kind === "convective") return "conv";
    if (kind === "dynamic") return "dyn";
    if (kind === "secular") return "sec";
    return "puls";
  }
  function s72E() {
    return "\\ozNeutral{E}";
  }
  var TEX_GAMMAC_EFF = "\\ozGammac{\\gamma_{c,\\rm eff}}";
  function s72Restoring() {
    return `(${TEX.m}${TEX.gamma1}-4)`;
  }
  function s72RadiativeThermal() {
    return `(1-${TEX_GAMMAC_EFF})(${TEX.s}+4)`;
  }
  function s72SecularCoupling() {
    return `${s72E()}+${s72Restoring()}${s72RadiativeThermal()}`;
  }
  function s72ConvectiveCorrection() {
    return `\\frac{3}{2}${TEX_GAMMAC_EFF}(${TEX.m}-4)`;
  }
  function s72ConvectiveMargin() {
    return `${TEX.zeta}${TEX.zetac}\\left[${s72SecularCoupling()}+${s72ConvectiveCorrection()}\\right]`;
  }
  function s72SecularMargin(stability) {
    if (stability.physicsMode === "radiative") return `${TEX.zeta}\\left[${s72SecularCoupling()}\\right]`;
    return `${TEX.zetac}${s72Restoring()}+${TEX.zeta}\\left[${s72SecularCoupling()}\\right]`;
  }
  function s72DynamicCoupling() {
    return `${TEX.zeta}${TEX.zetac}\\left[${s72RadiativeThermal()}+\\frac{3}{2}${TEX_GAMMAC_EFF}\\right]+${s72Restoring()}`;
  }
  function s72ThermalResponse() {
    return `${TEX.zetac}+${TEX.zeta}${s72RadiativeThermal()}`;
  }
  function s72DynamicMargin(stability) {
    if (stability.physicsMode === "radiative") return s72Restoring();
    return `\\left[${s72SecularMargin(stability)}\\right]\\left[${s72DynamicCoupling()}\\right]-\\left[${s72ConvectiveMargin()}\\right]\\left[${s72ThermalResponse()}\\right]`;
  }
  function s72PulsationalMargin(stability) {
    if (stability.physicsMode === "radiative") return `-${s72E()}`;
    return `\\left[${s72ThermalResponse()}\\right]\\ozNeutral{\\Delta_{\\rm dyn}}-\\left[${s72SecularMargin(stability)}\\right]^2`;
  }
  function s72ConditionMetric(stability, condition2) {
    const symbol = s72LatexInequality(condition2.stable, ">");
    const formula = s72ConditionFormula(stability, condition2);
    return `\\(${formula}=${fmt(condition2.value, 2)} ${symbol} 0\\)`;
  }
  function s72ConditionFormula(stability, condition2) {
    return condition2.kind === "convective" ? s72ConvectiveMargin() : condition2.kind === "secular" ? s72SecularMargin(stability) : condition2.kind === "dynamic" ? s72DynamicMargin(stability) : s72PulsationalMargin(stability);
  }
  function mathChunk(latex) {
    return `<span class="stability-equation-chunk">\\(${latex}\\)</span>`;
  }
  function s72ConditionFormulaChunks(stability, condition2) {
    if (condition2.kind === "convective") {
      return [
        `${TEX.zeta}${TEX.zetac}\\bigl[`,
        s72E(),
        `+${s72Restoring()}${s72RadiativeThermal()}`,
        `+${s72ConvectiveCorrection()}\\bigr]`
      ];
    }
    if (condition2.kind === "secular") {
      return stability.physicsMode === "radiative" ? [`${TEX.zeta}\\bigl[`, s72E(), `+${s72Restoring()}${s72RadiativeThermal()}\\bigr]`] : [`${TEX.zetac}${s72Restoring()}`, `+${TEX.zeta}\\bigl[`, s72E(), `+${s72Restoring()}${s72RadiativeThermal()}\\bigr]`];
    }
    if (condition2.kind === "dynamic") {
      if (stability.physicsMode === "radiative") return [s72Restoring()];
      return [
        `\\left[${s72SecularMargin(stability)}\\right]`,
        `\\left[${s72DynamicCoupling()}\\right]`,
        `-\\left[${s72ConvectiveMargin()}\\right]`,
        `\\left[${s72ThermalResponse()}\\right]`
      ];
    }
    return stability.physicsMode === "radiative" ? [`-${s72E()}`] : [
      `\\left[${s72ThermalResponse()}\\right]`,
      `\\ozNeutral{\\Delta_{\\rm dyn}}`,
      `-\\left[${s72SecularMargin(stability)}\\right]^2`
    ];
  }
  function s72ConditionMetricHtml(stability, condition2) {
    const symbol = s72LatexInequality(condition2.stable, ">");
    const chunks = s72ConditionFormulaChunks(stability, condition2).map(mathChunk).join("<wbr>");
    return `<span class="stability-equation">${chunks}<wbr>${mathChunk(`=${fmt(condition2.value, 2)} ${symbol} 0`)}</span>`;
  }
  function s72ConciseVerdict(kind, stable) {
    const stateText = stable ? "stable" : "unstable";
    if (kind === "convective") return `turb-response ${stateText}`;
    if (kind === "dynamic") return `dynamically ${stateText}`;
    if (kind === "secular") return `secularly ${stateText}`;
    return `pulsationally ${stateText}`;
  }
  function s72ConditionSummary(condition2) {
    const symbol = s72TextInequality(condition2.stable, ">");
    return `${s72ConciseVerdict(condition2.kind, condition2.stable)} <span class="stability-margin">(${fmt(condition2.value, 2)} ${symbol} 0)</span>`;
  }
  function s72TermSummary(stability) {
    const { radiativeThermal, restoring, secularCoupling, convectiveCorrection, thermalResponse, dynamicCoupling } = stability.terms;
    return `E=${fmt(stability.eCoefficient, 3)}, (chi0*Gamma1 - 4)=${fmt(restoring, 3)}, (1-gamma_c_eff)*(s+4)=${fmt(radiativeThermal, 3)}, E+(chi0*Gamma1 - 4)*(1-gamma_c_eff)*(s+4)=${fmt(secularCoupling, 3)}, 3*gamma_c_eff*(chi0 - 4)/2=${fmt(convectiveCorrection, 3)}, zeta_c+zeta*(1-gamma_c_eff)*(s+4)=${fmt(thermalResponse, 3)}, zeta*zeta_c*((1-gamma_c_eff)*(s+4)+3*gamma_c_eff/2)+chi0*Gamma1-4=${fmt(dynamicCoupling, 3)}`;
  }
  function s72ConditionTitle(stability, condition2) {
    const symbol = s72TextInequality(condition2.stable, ">");
    const prefix = condition2.kind === "convective" ? "Convective/turbulent stability" : condition2.kind === "dynamic" ? "Dynamic stability" : condition2.kind === "secular" ? "Secular stability" : "Pulsational stability";
    return `${prefix}: ${s72TermSummary(stability)}; margin=${fmt(condition2.value, 3)} ${symbol} 0 -> ${s72Verdict(condition2.kind, condition2.stable)}`;
  }
  function linearPeriodMetric(parameters, period) {
    const chi = mAt(1, parameters);
    const frequencySquared = chi * parameters.gamma1 - 4;
    const value = period ? fmt(period, 3) : "\\ozNeutral{n/a}";
    return `\\(2\\pi/\\sqrt{\\ozChi{\\chi}\\ozGamma{\\Gamma_1}-4}=${value}\\)`;
  }
  function linearPeriodTitle(parameters, period) {
    const chi = mAt(1, parameters);
    const frequencySquared = chi * parameters.gamma1 - 4;
    if (!period) {
      return `Linear dynamic period unavailable because chi*Gamma_1 - 4 = ${fmt(frequencySquared, 4)} is not positive.`;
    }
    return `Linear dynamic period from 2*pi/sqrt(chi*Gamma_1 - 4): chi=${fmt(chi, 4)}, Gamma_1=${fmt(parameters.gamma1, 4)}, P_lin=${fmt(period, 4)}.`;
  }
  function nonlinearPeriodTitle(period) {
    return period ? `Nonlinear period measured from the selected luminosity extrema in the integration: P_nonlin=${fmt(period, 4)}.` : "Nonlinear period unavailable because the integration did not produce a usable phase window.";
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
  function noteToFrequency(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }
  function formatHz(value) {
    return String(Math.round(value));
  }
  function midiToOctave(midi) {
    return Math.floor(midi / 12) - 1;
  }
  function noteNameForMidi(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${names[(midi % 12 + 12) % 12]}${midiToOctave(midi)}`;
  }
  function firstVisiblePianoMidi() {
    return 12 * (pianoStartOctave + 1);
  }
  function pianoOctaveLabel() {
    const first = firstVisiblePianoMidi();
    const last = first + PIANO_VISIBLE_OCTAVES * 12 - 1;
    return `${noteNameForMidi(first)}-${noteNameForMidi(last)}`;
  }
  function keyboardMidiForCode(code) {
    const binding = PIANO_KEYBOARD_BINDINGS.find((item) => item.code === code);
    if (!binding) return null;
    return firstVisiblePianoMidi() + binding.offset;
  }
  function keyboardLabelForOffset(offset) {
    return PIANO_KEYBOARD_BINDINGS.find((item) => item.offset === offset)?.label || "";
  }
  function setupSonificationControls() {
    const piano = el("pianoToggle");
    const toggle = el("sonificationToggle");
    const pitch = el("sonificationPitch");
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    pitch.addEventListener("input", handleSonificationSliderInput);
    document.querySelectorAll("[data-sonify-source]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.sonifySource;
        if (!isSonificationSource(source) || source === sonificationSource) return;
        sonificationSource = source;
        drawAll();
      });
    });
    if (!AudioContextCtor) {
      piano.disabled = true;
      piano.title = "Audio is not supported in this browser";
      piano.setAttribute("aria-label", "Piano unavailable");
      toggle.disabled = true;
      toggle.title = "Audio is not supported in this browser";
      toggle.setAttribute("aria-label", "Lightcurve sonification unavailable");
    } else {
      piano.addEventListener("click", togglePianoMode);
      toggle.addEventListener("click", () => {
        void toggleSonification();
      });
    }
    setupPianoControls();
    updateSonificationSourceControls();
    updateHeaderAudioControls();
    updateSonificationToggleUi();
    updatePianoToggleUi();
    window.addEventListener("keydown", handlePianoKeyDown);
    window.addEventListener("keyup", handlePianoKeyUp);
    window.addEventListener("blur", releaseAllPianoNotes);
  }
  function isSonificationSource(value) {
    return value === "luminosity" || value === "velocity" || value === "pressure";
  }
  function updateSonificationSourceControls() {
    document.querySelectorAll("[data-sonify-source]").forEach((button) => {
      const source = button.dataset.sonifySource;
      const active = source === sonificationSource;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      if (isSonificationSource(source)) button.title = `Sonify ${SONIFICATION_SOURCE_LABELS[source]}`;
    });
    const pressureVisible = sonificationSource === "pressure";
    const pressurePanel = document.getElementById("pressurePhasePanel");
    if (pressurePanel instanceof HTMLElement) pressurePanel.hidden = !pressureVisible;
    const plotGrid = document.querySelector(".plot-grid");
    if (plotGrid) plotGrid.dataset.pressureVisible = String(pressureVisible);
    updatePlotGridColumns();
    if (pressureVisible) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(drawPhasePlots));
    }
  }
  function handleSonificationSliderInput(event) {
    const input = event.target;
    if (pianoModeActive) {
      pianoStartOctave = Number(input.value);
      updateHeaderAudioControls();
      buildPianoKeyboard();
      return;
    }
    sonificationReferenceNote = Number(input.value);
    sonificationReferenceHz = noteToFrequency(sonificationReferenceNote);
    updateHeaderAudioControls();
    updateSonificationFrequency();
    updateSonificationWaveform();
  }
  function updateHeaderAudioControls() {
    const slider = document.getElementById("sonificationPitch");
    if (slider instanceof HTMLInputElement) {
      if (pianoModeActive) {
        slider.min = String(PIANO_MIN_START_OCTAVE);
        slider.max = String(PIANO_MAX_START_OCTAVE);
        slider.step = "1";
        slider.value = String(pianoStartOctave);
        slider.setAttribute("aria-label", "shown piano octaves");
        slider.title = "Shown piano octaves";
      } else {
        slider.min = String(PIANO_MIN_NOTE);
        slider.max = String(PIANO_MAX_NOTE);
        slider.step = "1";
        slider.value = String(sonificationReferenceNote);
        slider.setAttribute("aria-label", "reference pitch");
        slider.title = "Reference pitch";
      }
    }
    const label = document.getElementById("sonificationHz");
    if (label) label.textContent = pianoModeActive ? pianoOctaveLabel() : `${formatHz(sonificationReferenceHz)} Hz`;
  }
  function updateSonificationToggleUi() {
    const toggle = document.getElementById("sonificationToggle");
    if (!(toggle instanceof HTMLButtonElement)) return;
    if (!(window.AudioContext || window.webkitAudioContext)) {
      toggle.disabled = true;
      toggle.classList.remove("active");
      toggle.setAttribute("aria-pressed", "false");
      return;
    }
    toggle.disabled = false;
    const action = sonificationActive ? "Stop" : "Start";
    toggle.classList.toggle("active", sonificationActive);
    toggle.setAttribute("aria-pressed", String(sonificationActive));
    toggle.setAttribute("aria-label", `${action} lightcurve sonification`);
    toggle.title = `${action} lightcurve sonification`;
  }
  function updatePianoToggleUi() {
    const toggle = document.getElementById("pianoToggle");
    if (!(toggle instanceof HTMLButtonElement)) return;
    toggle.classList.toggle("active", pianoModeActive);
    toggle.setAttribute("aria-pressed", String(pianoModeActive));
    toggle.setAttribute("aria-label", `${pianoModeActive ? "Hide" : "Show"} lightcurve piano`);
    toggle.title = `${pianoModeActive ? "Hide" : "Show"} lightcurve piano`;
  }
  function togglePianoMode() {
    pianoModeActive = !pianoModeActive;
    if (pianoModeActive) {
      buildPianoKeyboard();
      setPianoPanelVisible(true);
    } else {
      releaseAllPianoNotes();
      setPianoPanelVisible(false);
    }
    updateHeaderAudioControls();
    updateSonificationToggleUi();
    updatePianoToggleUi();
    drawAdsrVisualization();
  }
  function setPianoPanelVisible(visible) {
    const panel = document.getElementById("pianoPanel");
    if (!panel) return;
    panel.hidden = !visible;
  }
  function capitalize(value) {
    return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
  }
  function setupPianoControls() {
    const bindEnvelopeSlider = (id, key) => {
      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement)) return;
      input.value = String(pianoEnvelope[key]);
      input.addEventListener("input", () => {
        pianoEnvelope = { ...pianoEnvelope, [key]: Number(input.value) };
        updatePianoControlLabels();
        updatePianoResetButtons();
        drawAdsrVisualization();
      });
    };
    bindEnvelopeSlider("pianoAttack", "attack");
    bindEnvelopeSlider("pianoDecay", "decay");
    bindEnvelopeSlider("pianoRelease", "release");
    const sustain = document.getElementById("pianoSustain");
    if (sustain instanceof HTMLInputElement) {
      sustain.value = String(pianoSustainLevel);
      sustain.addEventListener("input", () => {
        pianoSustainLevel = Number(sustain.value);
        updatePianoControlLabels();
        updatePianoResetButtons();
        drawAdsrVisualization();
      });
    }
    document.querySelectorAll("[data-piano-reset]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.pianoReset;
        if (key) resetPianoControl(key);
      });
    });
    buildPianoKeyboard();
    updatePianoControlLabels();
    updatePianoResetButtons();
    drawAdsrVisualization();
  }
  function resetPianoControl(key) {
    if (key === "sustain") {
      pianoSustainLevel = PIANO_DEFAULT_SUSTAIN_LEVEL;
      const input = document.getElementById("pianoSustain");
      if (input instanceof HTMLInputElement) input.value = String(pianoSustainLevel);
    } else {
      pianoEnvelope = { ...pianoEnvelope, [key]: PIANO_DEFAULT_ENVELOPE[key] };
      const input = document.getElementById(`piano${capitalize(key)}`);
      if (input instanceof HTMLInputElement) input.value = String(pianoEnvelope[key]);
    }
    updatePianoControlLabels();
    updatePianoResetButtons();
    drawAdsrVisualization();
  }
  function updatePianoResetButtons() {
    document.querySelectorAll("[data-piano-reset]").forEach((button) => {
      const key = button.dataset.pianoReset;
      if (!key) return;
      const current = key === "sustain" ? pianoSustainLevel : pianoEnvelope[key];
      const defaultValue = key === "sustain" ? PIANO_DEFAULT_SUSTAIN_LEVEL : PIANO_DEFAULT_ENVELOPE[key];
      const label = capitalize(key);
      button.disabled = valuesMatch(current, defaultValue);
      button.title = `Reset ${label.toLowerCase()} to ${formatPianoControlValue(key, defaultValue)}`;
    });
  }
  function updatePianoControlLabels() {
    const labels = {
      pianoAttackValue: formatPianoControlValue("attack", pianoEnvelope.attack),
      pianoDecayValue: formatPianoControlValue("decay", pianoEnvelope.decay),
      pianoReleaseValue: formatPianoControlValue("release", pianoEnvelope.release),
      pianoSustainValue: formatPianoControlValue("sustain", pianoSustainLevel)
    };
    Object.entries(labels).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    });
  }
  function formatPianoControlValue(key, value) {
    return key === "sustain" ? `${Math.round(value * 100)}%` : formatDuration(value);
  }
  function formatDuration(seconds) {
    return seconds < 0.1 ? `${Math.round(seconds * 1e3)} ms` : `${seconds.toFixed(2).replace(/\.?0+$/, "")} s`;
  }
  function buildPianoKeyboard() {
    const container = document.getElementById("pianoKeys");
    if (!container) return;
    const firstMidi = firstVisiblePianoMidi();
    const lastMidi = firstMidi + PIANO_VISIBLE_OCTAVES * 12 - 1;
    container.innerHTML = '<div class="white-keys"></div><div class="black-keys"></div>';
    const whiteKeys = container.querySelector(".white-keys");
    const blackKeys = container.querySelector(".black-keys");
    if (!whiteKeys || !blackKeys) return;
    const whiteCount = Array.from({ length: lastMidi - firstMidi + 1 }, (_unused, index) => firstMidi + index).filter((midi) => !isBlackPianoKey(midi)).length;
    let whiteIndex = 0;
    for (let midi = firstMidi; midi <= lastMidi; midi += 1) {
      const isBlack = isBlackPianoKey(midi);
      const key = buildPianoKey(midi, isBlack);
      if (isBlack) {
        key.style.left = `calc(${(whiteIndex / whiteCount * 100).toFixed(4)}% - var(--black-key-width) / 2)`;
        blackKeys.appendChild(key);
      } else {
        whiteKeys.appendChild(key);
        whiteIndex += 1;
      }
      updatePianoKeyState(midi);
    }
  }
  function buildPianoKey(midi, isBlack) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = `piano-key ${isBlack ? "black-key" : "white-key"}`;
    key.dataset.midi = String(midi);
    key.setAttribute("aria-label", `Play ${noteNameForMidi(midi)}`);
    const offset = midi - firstVisiblePianoMidi();
    const keyboardLabel = keyboardLabelForOffset(offset);
    key.innerHTML = `
    <span class="piano-note-label">${noteNameForMidi(midi)}</span>
    <span class="piano-key-label">${keyboardLabel}</span>
  `;
    key.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      key.setPointerCapture(event.pointerId);
      void startPianoNote(`pointer:${event.pointerId}`, midi);
    });
    key.addEventListener("pointerup", (event) => {
      releasePianoNote(`pointer:${event.pointerId}`);
      if (key.hasPointerCapture(event.pointerId)) key.releasePointerCapture(event.pointerId);
    });
    key.addEventListener("pointercancel", (event) => releasePianoNote(`pointer:${event.pointerId}`));
    return key;
  }
  function isBlackPianoKey(midi) {
    return [1, 3, 6, 8, 10].includes((midi % 12 + 12) % 12);
  }
  function updatePianoKeyState(midi) {
    document.querySelectorAll(`.piano-key[data-midi="${midi}"]`).forEach((key) => {
      key.classList.toggle("active", (activePianoMidiCounts.get(midi) || 0) > 0);
    });
  }
  function isTypingTarget(target) {
    if (target instanceof HTMLInputElement) {
      return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type);
    }
    return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable;
  }
  function handlePianoKeyDown(event) {
    if (!pianoModeActive || event.repeat || isTypingTarget(event.target)) return;
    const midi = keyboardMidiForCode(event.code);
    if (midi === null) return;
    event.preventDefault();
    void startPianoNote(`key:${event.code}`, midi);
  }
  function handlePianoKeyUp(event) {
    if (!pianoModeActive) return;
    if (!PIANO_KEYBOARD_BINDINGS.some((binding) => binding.code === event.code)) return;
    event.preventDefault();
    releasePianoNote(`key:${event.code}`);
  }
  function drawAdsrVisualization() {
    const canvas = document.getElementById("adsrCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, Math.floor(rect.width || 360));
    const height = Math.max(120, Math.floor(rect.height || 130));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const pad = { left: 22, top: 14, right: 12, bottom: 20 };
    const plot = {
      left: pad.left,
      top: pad.top,
      width: width - pad.left - pad.right,
      height: height - pad.top - pad.bottom
    };
    const hold = 0.45;
    const total = Math.max(0.2, pianoEnvelope.attack + pianoEnvelope.decay + hold + pianoEnvelope.release);
    const x = (seconds) => plot.left + seconds / total * plot.width;
    const y = (amplitude) => plot.top + plot.height - amplitude * plot.height;
    const attackEnd = pianoEnvelope.attack;
    const decayEnd = attackEnd + pianoEnvelope.decay;
    const releaseStart = decayEnd + hold;
    const releaseEnd = releaseStart + pianoEnvelope.release;
    ctx.strokeStyle = THEME.axisGrid;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
    ctx.fillStyle = THEME.axisText;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("amp", 0, plot.top - 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${formatDuration(total)}`, width - 2, height - 2);
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    ctx.lineTo(x(attackEnd), y(1));
    ctx.lineTo(x(decayEnd), y(pianoSustainLevel));
    ctx.lineTo(x(releaseStart), y(pianoSustainLevel));
    ctx.lineTo(x(releaseEnd), y(0));
    ctx.strokeStyle = "#FFD166";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 209, 102, 0.12)";
    ctx.lineTo(x(0), y(0));
    ctx.closePath();
    ctx.fill();
  }
  function toggleSonification() {
    if (sonificationActive) {
      stopSonification();
      return;
    }
    startSonification();
  }
  function ensureAudioContext() {
    if (sonificationContext) return sonificationContext;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    sonificationContext = new AudioContextCtor();
    return sonificationContext;
  }
  function resumeAudioContext(context) {
    if (context.state === "closed") return;
    void context.resume().catch(() => void 0);
  }
  function unlockAudioContext(context) {
    if (context.state === "closed") return;
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, Math.max(1, context.sampleRate || 44100));
      source.connect(context.destination);
      source.addEventListener("ended", () => source.disconnect(), { once: true });
      source.start();
      source.stop(context.currentTime + 1e-3);
    } catch {
    }
  }
  function startSonification() {
    const context = ensureAudioContext();
    if (!context) return;
    unlockAudioContext(context);
    if (sonificationStopTimer) {
      window.clearTimeout(sonificationStopTimer);
      sonificationStopTimer = 0;
    }
    stopSonificationGraph();
    const masterGain = context.createGain();
    const now = context.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(SONIFICATION_OUTPUT_GAIN, now + SONIFICATION_ATTACK_SECONDS);
    masterGain.connect(context.destination);
    sonificationMasterGain = masterGain;
    sonificationVoice = createSonificationVoice(context, masterGain, 1);
    sonificationActive = true;
    updateSonificationToggleUi();
    resumeAudioContext(context);
  }
  function stopSonification() {
    if (!sonificationActive && !sonificationMasterGain && !sonificationVoices.size) return;
    const context = sonificationContext;
    const masterGain = sonificationMasterGain;
    sonificationActive = false;
    updateSonificationToggleUi();
    if (!context || !masterGain) {
      stopSonificationGraph();
      return;
    }
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(0, now, SONIFICATION_RELEASE_SECONDS / 3);
    const stopAt = now + SONIFICATION_RELEASE_SECONDS;
    sonificationVoices.forEach((voice) => stopSonificationVoice(voice, stopAt));
    sonificationStopTimer = window.setTimeout(() => {
      sonificationStopTimer = 0;
      if (!sonificationActive) stopSonificationGraph();
    }, (SONIFICATION_RELEASE_SECONDS + 0.03) * 1e3);
  }
  function stopSonificationGraph() {
    if (sonificationStopTimer) {
      window.clearTimeout(sonificationStopTimer);
      sonificationStopTimer = 0;
    }
    sonificationVoices.forEach((voice) => {
      stopSonificationVoice(voice, sonificationContext?.currentTime ?? 0);
      disconnectSonificationVoice(voice);
    });
    sonificationMasterGain?.disconnect();
    sonificationVoice = null;
    sonificationMasterGain = null;
  }
  function updateSonificationFrequency() {
    const context = sonificationContext;
    if (!context || !sonificationActive) return;
    const now = context.currentTime;
    sonificationVoices.forEach((voice) => {
      voice.oscillator.frequency.setTargetAtTime(sonificationReferenceHz, now, SONIFICATION_FREQUENCY_GLIDE_SECONDS);
    });
  }
  function updateSonificationWaveform() {
    const context = sonificationContext;
    const masterGain = sonificationMasterGain;
    if (!context || !masterGain || !sonificationActive) return;
    const previousVoice = sonificationVoice;
    const nextVoice = createSonificationVoice(context, masterGain, 0);
    sonificationVoice = nextVoice;
    const now = context.currentTime;
    const fadeEnd = now + SONIFICATION_WAVEFORM_CROSSFADE_SECONDS;
    nextVoice.gain.gain.cancelScheduledValues(now);
    nextVoice.gain.gain.setValueAtTime(0, now);
    nextVoice.gain.gain.linearRampToValueAtTime(1, fadeEnd);
    if (previousVoice) {
      previousVoice.gain.gain.cancelScheduledValues(now);
      previousVoice.gain.gain.setValueAtTime(previousVoice.gain.gain.value, now);
      previousVoice.gain.gain.linearRampToValueAtTime(0, fadeEnd);
      stopSonificationVoice(previousVoice, fadeEnd + 0.02);
    }
  }
  function createSonificationVoice(context, output, initialGain) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(sonificationReferenceHz, now);
    const wave = createSonificationPeriodicWave(context);
    if (wave) oscillator.setPeriodicWave(wave);
    gain.gain.setValueAtTime(initialGain, now);
    oscillator.connect(gain);
    gain.connect(output);
    const voice = { oscillator, gain, stopped: false };
    oscillator.addEventListener("ended", () => disconnectSonificationVoice(voice), { once: true });
    sonificationVoices.add(voice);
    oscillator.start(now);
    return voice;
  }
  function stopSonificationVoice(voice, when) {
    if (voice.stopped) return;
    voice.stopped = true;
    try {
      voice.oscillator.stop(Math.max(when, sonificationContext?.currentTime ?? 0));
    } catch {
      disconnectSonificationVoice(voice);
    }
  }
  function disconnectSonificationVoice(voice) {
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    sonificationVoices.delete(voice);
    if (sonificationVoice === voice) sonificationVoice = null;
  }
  function ensurePianoMasterGain(context) {
    if (pianoMasterGain) return pianoMasterGain;
    pianoMasterGain = context.createGain();
    pianoMasterGain.gain.setValueAtTime(PIANO_OUTPUT_GAIN, context.currentTime);
    pianoMasterGain.connect(context.destination);
    return pianoMasterGain;
  }
  function startPianoNote(sourceId, midi) {
    if (!pianoModeActive || activePianoVoices.has(sourceId)) return;
    const note = clamp4(Math.round(midi), PIANO_MIN_NOTE, PIANO_MAX_NOTE);
    const context = ensureAudioContext();
    if (!context) return;
    unlockAudioContext(context);
    const output = ensurePianoMasterGain(context);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const attack = Math.max(1e-3, pianoEnvelope.attack);
    const decay = Math.max(1e-3, pianoEnvelope.decay);
    const sustain = clamp4(pianoSustainLevel, 0, 1);
    oscillator.frequency.setValueAtTime(noteToFrequency(note), now);
    const wave = createSonificationPeriodicWave(context);
    if (wave) oscillator.setPeriodicWave(wave);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    oscillator.connect(gain);
    gain.connect(output);
    const voice = {
      oscillator,
      gain,
      midi: note,
      startedAt: now,
      attack,
      decay,
      sustain,
      released: false
    };
    oscillator.addEventListener("ended", () => disconnectPianoVoice(sourceId, voice), { once: true });
    activePianoVoices.set(sourceId, voice);
    activePianoMidiCounts.set(note, (activePianoMidiCounts.get(note) || 0) + 1);
    updatePianoKeyState(note);
    oscillator.start(now);
    resumeAudioContext(context);
  }
  function releasePianoNote(sourceId) {
    const voice = activePianoVoices.get(sourceId);
    const context = sonificationContext;
    if (!voice || !context || voice.released) return;
    voice.released = true;
    activePianoVoices.delete(sourceId);
    const count = (activePianoMidiCounts.get(voice.midi) || 1) - 1;
    if (count > 0) activePianoMidiCounts.set(voice.midi, count);
    else activePianoMidiCounts.delete(voice.midi);
    updatePianoKeyState(voice.midi);
    const now = context.currentTime;
    const release = Math.max(0.01, pianoEnvelope.release);
    const amplitude = estimatePianoVoiceAmplitude(voice, now);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(amplitude, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + release);
    voice.oscillator.stop(now + release + 0.03);
  }
  function estimatePianoVoiceAmplitude(voice, now) {
    const elapsed = Math.max(0, now - voice.startedAt);
    if (elapsed <= voice.attack) return clamp4(elapsed / voice.attack, 0, 1);
    if (elapsed <= voice.attack + voice.decay) {
      const decayProgress = (elapsed - voice.attack) / voice.decay;
      return 1 - (1 - voice.sustain) * clamp4(decayProgress, 0, 1);
    }
    return voice.sustain;
  }
  function releaseAllPianoNotes() {
    Array.from(activePianoVoices.keys()).forEach(releasePianoNote);
  }
  function disconnectPianoVoice(sourceId, voice) {
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    if (activePianoVoices.get(sourceId) === voice) activePianoVoices.delete(sourceId);
  }
  function createSonificationPeriodicWave(context) {
    const harmonicCount = Math.max(
      1,
      Math.min(SONIFICATION_MAX_HARMONICS, Math.floor(context.sampleRate / 2 / Math.max(sonificationReferenceHz, 1)))
    );
    const real = new Float32Array(harmonicCount + 1);
    const imag = new Float32Array(harmonicCount + 1);
    const waveformValues = circularSmooth(
      Array.from(
        { length: SONIFICATION_WAVEFORM_SAMPLES },
        (_unused, index) => sonificationValueAtPhase(index / SONIFICATION_WAVEFORM_SAMPLES)
      ),
      SONIFICATION_WAVEFORM_SMOOTH_PASSES
    );
    const mean = waveformValues.reduce((sum, value) => sum + value, 0) / waveformValues.length;
    const centered = waveformValues.map((value) => value - mean);
    const scale = Math.max(...centered.map((value) => Math.abs(value)), 1e-6);
    const normalized = centered.map((value) => value / scale);
    for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
      let realSum = 0;
      let imagSum = 0;
      for (let index = 0; index < normalized.length; index += 1) {
        const angle = 2 * Math.PI * harmonic * index / normalized.length;
        realSum += normalized[index] * Math.cos(angle);
        imagSum += normalized[index] * Math.sin(angle);
      }
      const cutoffPosition = harmonic / (harmonicCount + 1);
      const lanczos = Math.sin(Math.PI * cutoffPosition) / (Math.PI * cutoffPosition);
      const hann = 0.5 * (1 + Math.cos(Math.PI * cutoffPosition));
      const taper = lanczos * lanczos * hann;
      real[harmonic] = 2 * realSum / normalized.length * taper;
      imag[harmonic] = 2 * imagSum / normalized.length * taper;
    }
    return context.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  function updateActivePianoWaveforms() {
    const context = sonificationContext;
    if (!context || !activePianoVoices.size) return;
    const wave = createSonificationPeriodicWave(context);
    if (!wave) return;
    activePianoVoices.forEach((voice) => {
      try {
        voice.oscillator.setPeriodicWave(wave);
      } catch {
      }
    });
  }
  function circularSmooth(values, passes) {
    let smoothed = [...values];
    for (let pass = 0; pass < passes; pass += 1) {
      smoothed = smoothed.map((value, index) => {
        const previous = smoothed[(index - 1 + smoothed.length) % smoothed.length];
        const next = smoothed[(index + 1) % smoothed.length];
        return previous * 0.25 + value * 0.5 + next * 0.25;
      });
    }
    return smoothed;
  }
  function sonificationValueAtPhase(phase) {
    if (!sonificationSamples.length) return Math.sin(2 * Math.PI * phase);
    if (sonificationSamples.length === 1) return sonificationSamples[0].value;
    if (phase <= sonificationSamples[0].phase) return sonificationSamples[0].value;
    const last = sonificationSamples[sonificationSamples.length - 1];
    if (phase >= last.phase) return last.value;
    let lo = 0;
    let hi = sonificationSamples.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (sonificationSamples[mid].phase <= phase) lo = mid;
      else hi = mid;
    }
    const a = sonificationSamples[lo];
    const b = sonificationSamples[hi];
    const span = b.phase - a.phase;
    if (span <= 0) return a.value;
    const mix = (phase - a.phase) / span;
    return a.value + (b.value - a.value) * mix;
  }
  function updateSonificationCurve(phaseRows, fallbackRows, parameters) {
    const firstCycleRows = phaseRows.filter((row) => row.tau >= 0 && row.tau <= 1);
    const nextSamples = firstCycleRows.length >= 3 ? buildSonificationSamples(firstCycleRows, [0, 1], parameters) : buildSonificationSamples(fallbackRows, void 0, parameters);
    const nextSignature = sonificationSampleSignature(nextSamples);
    document.getElementById("pianoPanel")?.setAttribute("data-sonification-signature", nextSignature);
    if (nextSignature === sonificationWaveformSignature) return;
    sonificationSamples = nextSamples;
    sonificationWaveformSignature = nextSignature;
    updateSonificationWaveform();
    updateActivePianoWaveforms();
  }
  function syncSonificationCurve(displayWindow, gridResult, fallbackRows) {
    const sonificationFallbackRows = displayWindow.mode === "time" || gridResult ? latestPhaseRows : fallbackRows;
    updateSonificationCurve(
      displayWindow.mode === "phase" ? latestPhaseRows : [],
      sonificationFallbackRows,
      latestPhaseParameters
    );
  }
  function sonificationSampleSignature(samples) {
    if (!samples.length) return `${sonificationSource}|empty`;
    const step2 = Math.max(1, Math.floor(samples.length / 48));
    const values = [sonificationSource, String(samples.length)];
    for (let index = 0; index < samples.length; index += step2) {
      const sample2 = samples[index];
      values.push(`${sample2.phase.toFixed(4)}:${sample2.value.toFixed(4)}`);
    }
    const last = samples[samples.length - 1];
    values.push(`${last.phase.toFixed(4)}:${last.value.toFixed(4)}`);
    return values.join("|");
  }
  function acousticPressure(row, parameters = state) {
    const m = mAt(row.R, parameters);
    return row.H * row.R ** (-m * parameters.gamma1);
  }
  function acousticPressureSignal(row, parameters = state) {
    const pressure = acousticPressure(row, parameters);
    return pressure > 0 ? pressure : NaN;
  }
  function sonificationSignal(row, parameters) {
    switch (sonificationSource) {
      case "luminosity":
        return row.L;
      case "velocity":
        return row.V;
      case "pressure":
        return acousticPressureSignal(row, parameters);
    }
  }
  function buildSonificationSamples(rows, domain, parameters) {
    const finiteRows = rows.map((row) => ({ row, value: sonificationSignal(row, parameters) })).filter((sample2) => Number.isFinite(sample2.row.tau) && Number.isFinite(sample2.value));
    if (!finiteRows.length) return [];
    const start = domain?.[0] ?? finiteRows[0].row.tau;
    const end = domain?.[1] ?? finiteRows[finiteRows.length - 1].row.tau;
    if (end <= start) return [{ phase: 0, value: 0 }];
    const inDomain = finiteRows.filter((sample2) => sample2.row.tau >= start && sample2.row.tau <= end);
    if (!inDomain.length) return [];
    const sourceValues = inDomain.map((sample2) => sample2.value);
    const minValue = Math.min(...sourceValues);
    const maxValue = Math.max(...sourceValues);
    const span = maxValue - minValue;
    const samples = strideDownsample2(inDomain, SONIFICATION_MAX_SAMPLES).map((sample2) => ({
      phase: clamp4((sample2.row.tau - start) / (end - start), 0, 1),
      value: span > 1e-12 ? clamp4(2 * ((sample2.value - minValue) / span) - 1, -1, 1) : 0
    })).sort((a, b) => a.phase - b.phase);
    if (!samples.length) return [];
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first.phase > 0) samples.unshift({ phase: 0, value: first.value });
    if (last.phase >= 1 - 1e-6) last.value = first.value;
    else samples.push({ phase: 1, value: first.value });
    return samples;
  }
  function stabilityChipFromEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    return target.closest("#metrics [data-stability-expanded]");
  }
  function setStabilityChipExpanded(chip, expanded) {
    chip.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (expanded) chip.dataset.stabilityView = "formula";
    else delete chip.dataset.stabilityView;
  }
  function toggleStabilityChip(chip) {
    setStabilityChipExpanded(chip, chip.getAttribute("aria-expanded") !== "true");
  }
  function setupStabilityChipInteractions() {
    const metrics = el("metrics");
    metrics.addEventListener("click", (event) => {
      const chip = stabilityChipFromEvent(event);
      if (!chip) return;
      event.preventDefault();
      toggleStabilityChip(chip);
    });
    metrics.addEventListener("keydown", (event) => {
      const chip = stabilityChipFromEvent(event);
      if (!chip || event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleStabilityChip(chip);
    });
  }
  function buildControls() {
    setupResponsiveSidebarControls();
    setupSonificationControls();
    setupStabilityChipInteractions();
    setupModelSpeedControl();
    setupPhaseAnnotationControls();
    buildPresetButtons();
    buildSolverButtons();
    buildSliderGroup("physicalControls", CONTROL_GROUPS.physical);
    buildSliderGroup("initialControls", CONTROL_GROUPS.initial);
    rebuildIntegrationControls();
    buildParameterTable();
    setupGridControls();
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
        scheduleGridCompute();
        drawAll();
      });
    });
    document.querySelectorAll("[data-phase-anchor]").forEach((button) => {
      button.addEventListener("click", () => {
        phaseAnchor = button.dataset.phaseAnchor === "max" ? "max" : "min";
        updatePhaseAnchorButtons();
        scheduleGridCompute();
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
    setupPlotPanelToggles();
    setupInteractivePlots();
    setupPhaseScrubbing();
    setupGridCanvasInteractions();
    setupReferencePlotInteractions();
    window.addEventListener("resize", drawAll);
    window.addEventListener("resize", drawAdsrVisualization);
    updateDriverButtons();
    updatePhaseModeButtons();
    updatePhaseAnchorButtons();
    updateSolverButtons();
    updateEquationBlocks();
    updateAllSliderLabels();
    updateResetButtons();
  }
  function modelAnimationDurationMs() {
    return MODEL_ANIMATION_BASE_DURATION_MS / modelAnimationSpeed;
  }
  function modelSpeedLabel(speed) {
    return `${fmt(speed, 2)}x`;
  }
  function setupModelSpeedControl() {
    const input = el("modelSpeed");
    const output = el("modelSpeedValue");
    const sync = () => {
      modelAnimationSpeed = clamp4(Number(input.value), MODEL_ANIMATION_MIN_SPEED, MODEL_ANIMATION_MAX_SPEED);
      input.value = String(modelAnimationSpeed);
      output.value = modelSpeedLabel(modelAnimationSpeed);
      output.textContent = output.value;
      modelAnimationStartTime = null;
      drawAnimatedPhaseViews();
    };
    input.addEventListener("input", sync);
    sync();
  }
  function setupPhaseAnnotationControls() {
    const toggle = document.getElementById("phaseAnnotationsToggle");
    if (!(toggle instanceof HTMLInputElement)) return;
    toggle.checked = phaseAnnotationsVisible;
    toggle.addEventListener("change", () => {
      phaseAnnotationsVisible = toggle.checked;
      updatePhaseAnnotationControls();
      drawPhasePlots();
    });
    updatePhaseAnnotationControls();
  }
  function updatePhaseAnnotationControls() {
    const toggle = document.getElementById("phaseAnnotationsToggle");
    const label = document.getElementById("phaseAnnotationToggleLabel");
    const legend = document.getElementById("phaseAnnotationLegendItems");
    if (toggle instanceof HTMLInputElement) toggle.checked = phaseAnnotationsVisible;
    if (label instanceof HTMLElement) {
      label.classList.toggle("is-hidden", !phaseAnnotationsVisible);
      label.setAttribute("aria-pressed", String(phaseAnnotationsVisible));
    }
    if (legend instanceof HTMLElement) {
      legend.hidden = !phaseAnnotationsVisible;
      legend.style.display = phaseAnnotationsVisible ? "" : "none";
    }
  }
  function setupGridLoopSpeedControl() {
    const input = document.getElementById("gridLoopSpeed");
    const output = document.getElementById("gridLoopSpeedValue");
    if (!(input instanceof HTMLInputElement) || !(output instanceof HTMLOutputElement)) return;
    const sync = () => {
      gridLoopSpeed = clamp4(Number(input.value), GRID_LOOP_MIN_SPEED, GRID_LOOP_MAX_SPEED);
      input.value = String(gridLoopSpeed);
      output.value = modelSpeedLabel(gridLoopSpeed);
      output.textContent = output.value;
      if (gridState.enabled && gridPathResults().length > 1) startGridAnimation();
    };
    input.addEventListener("input", sync);
    sync();
  }
  function isUserPlotId(value) {
    return Boolean(value && value in PLOT_PANEL_LABELS);
  }
  function setupPlotPanelToggles() {
    document.querySelectorAll("[data-plot-toggle]").forEach((input) => {
      const plotId = input.dataset.plotToggle;
      if (!isUserPlotId(plotId)) return;
      input.addEventListener("change", () => {
        plotPanelVisibility[plotId] = input.checked;
        updatePlotPanelVisibility();
        drawAll();
      });
    });
    updatePlotPanelVisibility();
  }
  function updatePlotPanelVisibility() {
    const hiddenControls = el("hiddenPlotControls");
    let hiddenCount = 0;
    Object.keys(plotPanelVisibility).forEach((plotId) => {
      const forcedHidden = gridState.enabled && (plotId === "model" || plotId === "heatEngine" || plotId === "work" || plotId === "time" || plotId === "lum");
      const visible = forcedHidden ? false : plotPanelVisibility[plotId];
      const panel = document.querySelector(`[data-plot-panel="${plotId}"]`);
      const control = document.querySelector(`[data-plot-control="${plotId}"]`);
      const home = document.querySelector(`[data-plot-control-home="${plotId}"]`);
      const input = control?.querySelector("[data-plot-toggle]");
      if (!panel || !control || !home || !input) return;
      input.checked = visible;
      input.disabled = forcedHidden;
      input.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${PLOT_PANEL_LABELS[plotId]} plot`);
      if (visible) {
        if (control.parentElement !== home) home.prepend(control);
        panel.hidden = false;
      } else {
        panel.hidden = true;
        hiddenControls.append(control);
        hiddenCount += 1;
      }
    });
    hiddenControls.hidden = hiddenCount === 0;
    updatePlotGridColumns();
  }
  function updatePlotGridColumns() {
    const plotGrid = document.getElementById("plotGrid");
    if (!(plotGrid instanceof HTMLElement)) return;
    const visibleCount = Array.from(plotGrid.querySelectorAll(".plot-panel")).filter((panel) => !panel.hidden).length;
    plotGrid.dataset.visiblePlots = String(visibleCount);
    plotGrid.hidden = visibleCount === 0;
  }
  function setupGridControls() {
    const toggle = document.getElementById("gridModeToggle");
    if (toggle instanceof HTMLInputElement) {
      toggle.checked = gridState.enabled;
      toggle.addEventListener("change", () => setGridModeEnabled(toggle.checked, { defaultGammaRange: toggle.checked }));
    }
    setupGridLoopSpeedControl();
    updateGridRangeUi();
    updateGridStatusUi();
  }
  function setGridModeEnabled(enabled, options = {}) {
    if (gridState.enabled === enabled) return;
    gridState.enabled = enabled;
    activePhaseHoverCanvasId = null;
    activePhaseScrub = null;
    const toggle = document.getElementById("gridModeToggle");
    if (toggle instanceof HTMLInputElement) toggle.checked = enabled;
    if (enabled) {
      gridState.restorePlotVisibility = {
        model: plotPanelVisibility.model,
        heatEngine: plotPanelVisibility.heatEngine,
        work: plotPanelVisibility.work,
        time: plotPanelVisibility.time,
        lum: plotPanelVisibility.lum
      };
      plotPanelVisibility.model = false;
      plotPanelVisibility.heatEngine = false;
      plotPanelVisibility.work = false;
      plotPanelVisibility.time = false;
      plotPanelVisibility.lum = false;
      modelAnimationStartTime = null;
      gridState.status = "idle";
      gridState.statusText = "Click a slider to define a grid range";
      if (options.defaultGammaRange) setDefaultGammaGridRange();
    } else {
      cancelGridCompute();
      stopGridAnimation();
      gridState.results = [];
      gridState.pathResults = [];
      gridState.hoverResult = null;
      gridState.heldResult = null;
      gridState.lastComplete = null;
      gridState.status = "idle";
      gridState.statusText = "Grid off";
      if (gridState.restorePlotVisibility) {
        plotPanelVisibility.model = gridState.restorePlotVisibility.model;
        plotPanelVisibility.heatEngine = gridState.restorePlotVisibility.heatEngine;
        plotPanelVisibility.work = gridState.restorePlotVisibility.work;
        plotPanelVisibility.time = gridState.restorePlotVisibility.time;
        plotPanelVisibility.lum = gridState.restorePlotVisibility.lum;
      }
      gridState.restorePlotVisibility = null;
      modelAnimationStartTime = null;
    }
    updatePlotPanelVisibility();
    updateGridRangeUi();
    updateGridStatusUi();
    updateFourierPanelVisibility();
    if (enabled) scheduleGridCompute();
    drawAll();
  }
  function setDefaultGammaGridRange() {
    const key = "gammac";
    const range2 = normalizeGridRange({
      key,
      lowerSliderValue: 0,
      upperSliderValue: 0.5,
      centerSliderValue: sliderInputValue(key),
      nativeStep: sliderMeta(key).step
    });
    gridState.ranges.clear();
    gridState.ranges.set(key, range2);
    gridState.savedRanges.set(key, range2);
    gridState.selectedLoopKey = key;
  }
  function toggleGridRange(key) {
    if (gridState.ranges.has(key)) {
      const current = gridState.ranges.get(key);
      if (current) gridState.savedRanges.set(key, current);
      gridState.ranges.delete(key);
    } else {
      enableGridRange(key);
      return;
    }
    updateGridRangeUi();
    scheduleGridCompute();
    drawAll();
  }
  function enableGridRange(key) {
    const existing = gridState.ranges.get(key);
    const currentSliderValue = sliderInputValue(key);
    const saved = gridState.savedRanges.get(key);
    const range2 = normalizeGridRange(existing || saved || defaultGridRange(key, currentSliderValue));
    gridState.ranges.set(key, { ...range2, centerSliderValue: currentSliderValue });
    if (!gridState.selectedLoopKey || !activeGridRangeKeys().includes(gridState.selectedLoopKey)) gridState.selectedLoopKey = key;
    updateGridRangeUi();
    scheduleGridCompute();
  }
  function toggleGridRangeFromSliderGesture(key) {
    if (!gridState.enabled) {
      setGridModeEnabled(true);
      enableGridRange(key);
      return;
    }
    toggleGridRange(key);
  }
  function sliderGestureTarget(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest("[data-reset-key]")) return false;
    return Boolean(target.closest(".slider-track") || target.closest("input[type='range']"));
  }
  function beginSliderTap(event, key) {
    if (event.pointerType !== "touch" || !sliderGestureTarget(event)) return;
    activeSliderTapStart = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function finishSliderTap(event, key) {
    if (event.pointerType !== "touch" || !activeSliderTapStart || activeSliderTapStart.key !== key || activeSliderTapStart.pointerId !== event.pointerId) return;
    const start = activeSliderTapStart;
    activeSliderTapStart = null;
    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (travel > SLIDER_RANGE_DOUBLE_TAP_DISTANCE) {
      lastSliderTap = null;
      return;
    }
    const now = window.performance.now();
    const previous = lastSliderTap;
    const doubleTap = Boolean(
      previous && previous.key === key && now - previous.time <= SLIDER_RANGE_DOUBLE_TAP_MS && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= SLIDER_RANGE_DOUBLE_TAP_DISTANCE
    );
    lastSliderTap = { key, time: now, x: event.clientX, y: event.clientY };
    if (!doubleTap) return;
    event.preventDefault();
    lastSliderTap = null;
    toggleGridRangeFromSliderGesture(key);
  }
  function syncGridRangeCenter(key) {
    const range2 = gridState.ranges.get(key);
    if (!range2) return;
    gridState.ranges.set(key, normalizeGridRange({ ...range2, centerSliderValue: sliderInputValue(key) }));
    refreshGridRangeUi(key);
  }
  function syncAllGridRangeCenters() {
    Array.from(gridState.ranges.keys()).forEach(syncGridRangeCenter);
  }
  function updateGridRangeBounds(key, lower, upper) {
    const current = gridState.ranges.get(key) || defaultGridRange(key, sliderInputValue(key));
    const range2 = normalizeGridRange({
      ...current,
      lowerSliderValue: lower,
      upperSliderValue: upper,
      centerSliderValue: sliderInputValue(key),
      nativeStep: sliderMeta(key).step
    });
    gridState.ranges.set(key, range2);
    gridState.savedRanges.set(key, range2);
    refreshGridRangeUi(key);
    scheduleGridCompute();
  }
  function activeGridRangeKeys() {
    if (!gridState.enabled) return [];
    return Array.from(gridState.ranges.keys()).filter((key) => {
      const elements = gridRangeElements.get(key);
      return Boolean(elements && !elements.wrapper.hidden);
    });
  }
  function activeGridRanges() {
    return activeGridRangeKeys().map((key) => gridState.ranges.get(key)).filter((range2) => Boolean(range2)).map(normalizeGridRange);
  }
  function updateGridRangeUi() {
    gridRangeElements.forEach((_elements, key) => refreshGridRangeUi(key));
    updateGridLoopControls();
  }
  function refreshGridRangeUi(key) {
    const elements = gridRangeElements.get(key);
    if (!elements) return;
    const active = gridState.enabled && gridState.ranges.has(key);
    const range2 = gridState.ranges.get(key);
    elements.wrapper.classList.toggle("is-grid-enabled", gridState.enabled);
    elements.wrapper.classList.toggle("is-grid-range", active);
    const controls = elements.wrapper.querySelector("[data-grid-range-controls]");
    if (controls) controls.hidden = !active;
    if (!range2) return;
    const normalized = normalizeGridRange(range2);
    elements.lower.value = String(normalized.lowerSliderValue);
    elements.upper.value = String(normalized.upperSliderValue);
    const meta = sliderMeta(key);
    const span = Math.max(1e-12, meta.max - meta.min);
    const left = (normalized.lowerSliderValue - meta.min) / span * 100;
    const right = (normalized.upperSliderValue - meta.min) / span * 100;
    controls?.style.setProperty("--grid-range-left", `${left.toFixed(4)}%`);
    controls?.style.setProperty("--grid-range-right", `${right.toFixed(4)}%`);
    elements.lower.title = `Lower bound: ${controlValueLabel(key, parameterValueFromSlider(key, normalized.lowerSliderValue))}`;
    elements.upper.title = `Upper bound: ${controlValueLabel(key, parameterValueFromSlider(key, normalized.upperSliderValue))}`;
    updateGridLoopSliderMarker(key);
  }
  function updateGridLoopSliderMarkers() {
    gridRangeElements.forEach((_elements, key) => updateGridLoopSliderMarker(key));
    gridRangeElements.forEach((_elements, key) => updateSliderLabel(key));
  }
  function updateGridLoopSliderMarker(key) {
    const elements = gridRangeElements.get(key);
    const marker = elements?.wrapper.querySelector("[data-grid-loop-marker]");
    const controls = elements?.wrapper.querySelector("[data-grid-range-controls]");
    if (!elements || !marker || !controls) return;
    const current = currentGridResult();
    const range2 = currentLoopRange();
    const sliderValue = current?.sliderValues[key];
    const active = gridState.enabled && gridState.ranges.has(key) && key === gridState.selectedLoopKey && range2?.key === key && sliderValue !== void 0;
    marker.hidden = !active;
    elements.wrapper.classList.toggle("is-grid-looping", active);
    if (!active || sliderValue === void 0 || !range2 || !current) return;
    const meta = sliderMeta(key);
    const span = Math.max(1e-12, meta.max - meta.min);
    const position = clamp4((sliderValue - meta.min) / span * 100, 0, 100);
    const value = current.variedValues[key] ?? parameterValueFromSlider(key, sliderValue);
    controls.style.setProperty("--grid-loop-position", `${position.toFixed(4)}%`);
    controls.style.setProperty("--grid-loop-color", parameterColorAt(value, range2, 1));
  }
  function createGridWorker() {
    try {
      if (gridState.workerDisabled) return null;
      const path = window.location.pathname.replace(/\\/g, "/");
      const src = window.location.protocol === "file:" ? path.includes("/dist/") ? "./assets/grid-worker-file.js" : "./dist/assets/grid-worker-file.js" : path.includes("/dist/") ? "./assets/grid-worker-file.js" : "/src/gridWorker.ts";
      return new Worker(src, { type: "module" });
    } catch (error) {
      gridState.workerDisabled = true;
      console.warn("Grid worker blocked; falling back to in-tab grid computation", error);
      return null;
    }
  }
  function scheduleGridCompute() {
    if (!gridState.enabled) return;
    window.clearTimeout(gridState.debounceTimer);
    const ranges = activeGridRanges();
    if (!ranges.length) {
      cancelGridCompute();
      gridState.results = [];
      gridState.pathResults = [];
      gridState.hoverResult = null;
      gridState.heldResult = null;
      gridState.lastComplete = null;
      gridState.status = "idle";
      gridState.statusText = "Click a slider to define a grid range";
      updateGridStatusUi();
      updateFourierPanelVisibility();
      return;
    }
    gridState.status = "queued";
    gridState.statusText = "Grid queued";
    updateGridStatusUi();
    gridState.debounceTimer = window.setTimeout(startGridCompute, 140);
  }
  function startGridCompute() {
    const ranges = activeGridRanges();
    if (!gridState.enabled || !ranges.length) return;
    const loopKey = gridState.selectedLoopKey && ranges.some((range2) => range2.key === gridState.selectedLoopKey) ? gridState.selectedLoopKey : ranges[0].key;
    gridState.selectedLoopKey = loopKey;
    gridState.requestId += 1;
    gridState.results = [];
    gridState.pathResults = [];
    gridState.hoverResult = null;
    gridState.heldResult = null;
    gridState.lastComplete = null;
    gridState.animationIndex = 0;
    gridState.animationDirection = 1;
    stopGridAnimation();
    updateGridLoopControls();
    const request = {
      requestId: gridState.requestId,
      baseParameters: { ...state },
      ranges,
      loopKey,
      phase: {
        warmupTau: state.phaseWarmupTau,
        minAmplitude: state.phaseMinAmplitude,
        selection: state.phaseMode === "final" ? "last" : "first",
        anchor: phaseAnchor
      }
    };
    if (!gridState.worker && !gridState.workerDisabled) {
      gridState.worker = createGridWorker();
      if (gridState.worker) {
        gridState.worker.addEventListener("message", (event) => handleGridWorkerMessage(event.data));
        gridState.worker.addEventListener("error", () => {
          gridState.worker?.terminate();
          gridState.worker = null;
          gridState.workerDisabled = true;
          if (gridState.enabled && request.requestId === gridState.requestId) {
            startGridFallbackCompute(request, "Using browser-tab grid compute");
          }
        });
      }
    }
    if (!gridState.worker) {
      startGridFallbackCompute(request, "Using browser-tab grid compute");
      return;
    }
    gridState.status = "running";
    gridState.statusText = `Grid running: 0 models`;
    updateGridStatusUi();
    gridState.worker.postMessage({
      type: "compute-grid",
      request
    });
  }
  function cancelGridCompute() {
    window.clearTimeout(gridState.debounceTimer);
    gridState.requestId += 1;
    gridState.fallbackToken += 1;
    gridState.worker?.postMessage({ type: "cancel-grid", requestId: gridState.requestId });
  }
  function startGridFallbackCompute(request, statusText) {
    const token = gridState.fallbackToken + 1;
    gridState.fallbackToken = token;
    gridState.status = "running";
    gridState.statusText = statusText;
    updateGridStatusUi();
    void computeGridWithMessages(request, {
      post: (message) => {
        if (token !== gridState.fallbackToken) return;
        handleGridWorkerMessage(message);
      },
      isCanceled: () => token !== gridState.fallbackToken || request.requestId !== gridState.requestId || !gridState.enabled
    }).catch((error) => {
      if (token !== gridState.fallbackToken) return;
      console.warn("Grid fallback failed", error);
      gridState.status = "error";
      gridState.statusText = "Grid computation failed";
      updateGridStatusUi();
    });
  }
  function handleGridWorkerMessage(message) {
    if (message.requestId !== gridState.requestId) return;
    if (message.type === "grid-progress") {
      gridState.status = "running";
      gridState.statusText = `Grid running: ${message.completed}/${message.total} models`;
      updateGridStatusUi();
      return;
    }
    if (message.type === "grid-canceled-for-coarsening") {
      gridState.status = "coarsening";
      gridState.statusText = `Grid coarsening: stride ${message.stride}`;
      updateGridStatusUi();
      return;
    }
    if (message.type === "grid-canceled") {
      return;
    }
    gridState.lastComplete = message;
    gridState.results = message.results;
    gridState.pathResults = message.pathResults;
    gridState.status = "complete";
    const coarsenedSuffix = message.coarsened ? `, stride ${message.stride}` : "";
    const excludedSuffix = message.excludedNonPhase ? `, ${message.excludedNonPhase} non-periodic excluded` : "";
    gridState.statusText = `Grid complete: ${message.validPhase}/${message.total} phase models${coarsenedSuffix}${excludedSuffix}`;
    gridState.animationIndex = 0;
    gridState.animationDirection = 1;
    updateGridLoopControls();
    updateGridStatusUi();
    updateFourierPanelVisibility();
    startGridAnimation();
    drawAll();
  }
  function updateGridStatusUi() {
    const bar = document.getElementById("gridStatusBar");
    const text = document.getElementById("gridStatusText");
    if (bar instanceof HTMLElement) bar.hidden = !gridState.enabled;
    if (text instanceof HTMLElement) text.textContent = gridState.statusText;
  }
  function updateGridLoopControls() {
    const container = document.getElementById("gridLoopControls");
    if (!(container instanceof HTMLElement)) return;
    const ranges = activeGridRanges();
    if (!gridState.enabled || ranges.length <= 1) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;
    const signature = ranges.map((range2) => `${range2.key}:${range2.lowerSliderValue}:${range2.upperSliderValue}`).join("|");
    if (container.dataset.signature === signature && container.childElementCount) {
      container.querySelectorAll("input[type='radio']").forEach((input) => {
        input.checked = input.value === gridState.selectedLoopKey;
      });
      return;
    }
    container.dataset.signature = signature;
    container.innerHTML = `<span>loop</span>${ranges.map((range2) => {
      const name = controlDefForKey(range2.key)?.[2] ?? controlShortLabel(range2.key);
      const symbol = controlSymbolHtml(range2.key);
      const color = controlColor(range2.key);
      return `
      <label style="--color:${color}" aria-label="Loop by ${name}">
        <input type="radio" name="gridLoopKey" value="${range2.key}"${range2.key === gridState.selectedLoopKey ? " checked" : ""}>
        <span class="grid-loop-symbol">${symbol}</span>
      </label>
    `;
    }).join("")}`;
    queueMathTypeset([container]);
    container.querySelectorAll("input[type='radio']").forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        gridState.selectedLoopKey = input.value;
        gridState.animationIndex = 0;
        gridState.animationDirection = 1;
        gridState.pathResults = [];
        updateGridLoopControls();
        scheduleGridCompute();
        drawAll();
      });
    });
  }
  function updateFourierPanelVisibility() {
    const panel = document.getElementById("fourierGridPanel");
    if (panel instanceof HTMLElement) panel.hidden = !gridState.enabled;
  }
  function startGridAnimation() {
    stopGridAnimation();
    const path = gridPathResults();
    if (!gridState.enabled || path.length <= 1) return;
    gridState.animationTimer = window.setInterval(() => {
      const currentPath = gridPathResults();
      if (currentPath.length <= 1) return;
      const next = gridState.animationIndex + gridState.animationDirection;
      if (next >= currentPath.length) {
        gridState.animationDirection = -1;
        gridState.animationIndex = Math.max(0, currentPath.length - 2);
      } else if (next < 0) {
        gridState.animationDirection = 1;
        gridState.animationIndex = Math.min(1, currentPath.length - 1);
      } else {
        gridState.animationIndex = next;
      }
      drawGridAnimationFrame();
    }, GRID_LOOP_BASE_INTERVAL_MS / gridLoopSpeed);
  }
  function stopGridAnimation() {
    if (gridState.animationTimer) {
      window.clearInterval(gridState.animationTimer);
      gridState.animationTimer = 0;
    }
  }
  function gridPathResultsCacheKey() {
    const loopKey = gridState.selectedLoopKey ?? "none";
    const ranges = activeGridRanges().map((range2) => `${range2.key}:${range2.lowerSliderValue}:${range2.upperSliderValue}:${range2.centerSliderValue}`).join(",");
    const pathEdgeIds = gridState.pathResults.length ? `${gridState.pathResults.length}:${gridState.pathResults[0]?.id ?? ""}:${gridState.pathResults.at(-1)?.id ?? ""}` : "no-path";
    return `${gridState.requestId}|${loopKey}|${gridState.results.length}|${pathEdgeIds}|${ranges}`;
  }
  function gridPathResults() {
    const key = gridPathResultsCacheKey();
    if (gridPathCache?.key === key) return gridPathCache.results;
    const loopKey = gridState.selectedLoopKey;
    if (!loopKey) {
      gridPathCache = { key, results: [] };
      return gridPathCache.results;
    }
    if (gridState.pathResults.length) {
      const results2 = [...gridState.pathResults].filter((result) => result.sliderValues[loopKey] !== void 0).sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
      gridPathCache = { key, results: results2 };
      return results2;
    }
    if (!gridState.results.length) {
      gridPathCache = { key, results: [] };
      return gridPathCache.results;
    }
    const ranges = activeGridRanges();
    const centerByKey = /* @__PURE__ */ new Map();
    ranges.forEach((range2) => {
      if (range2.key !== loopKey) centerByKey.set(range2.key, centerSliderSample(range2));
    });
    const results = gridState.results.filter((result) => {
      for (const [key2, center] of centerByKey) {
        const value = result.sliderValues[key2];
        if (value === void 0 || Math.abs(value - center) > sliderMeta(key2).step / 2 + 1e-9) return false;
      }
      return result.sliderValues[loopKey] !== void 0;
    }).sort((a, b) => (a.sliderValues[loopKey] ?? 0) - (b.sliderValues[loopKey] ?? 0));
    gridPathCache = { key, results };
    return results;
  }
  function currentGridResult() {
    if (gridState.heldResult) return gridState.heldResult;
    const path = gridPathResults();
    if (!path.length) return null;
    const index = Math.min(path.length - 1, Math.max(0, gridState.animationIndex));
    return path[index] || null;
  }
  function currentLoopRange() {
    const loopKey = gridState.selectedLoopKey;
    if (!loopKey) return null;
    return activeGridRanges().find((range2) => range2.key === loopKey) || null;
  }
  function controlDefForKey(key) {
    return [...CONTROL_GROUPS.physical, ...CONTROL_GROUPS.initial, ...CONTROL_GROUPS.integration].find(([controlKey]) => controlKey === key);
  }
  function controlSymbolHtml(key) {
    return controlDefForKey(key)?.[1] ?? controlShortLabel(key);
  }
  function controlColor(key) {
    return controlDefForKey(key)?.[7] ?? THEME.neutralSymbol;
  }
  function controlCanvasSymbol(key) {
    const symbols = {
      zeta: "\u03B6",
      zetac: "\u03B6c",
      gammac: "\u03B3c",
      m: "\u03C70",
      gamma1: "\u03931",
      n: "n",
      s: "s",
      sourceExp: "U",
      cq: "Cq",
      r0: "R0",
      v0: "V0",
      h0: "H0",
      uc0: "Uc0",
      tEnd: "\u03C4max",
      step: "\u0394\u03C40",
      maxStep: "\u0394\u03C4max",
      logRtol: "log10 rtol",
      logAtol: "log10 atol",
      logErrTol: "log10 \u03B5",
      logStabilityTol: "log10 \u03B5s",
      stableCycles: "Ns"
    };
    return symbols[key] ?? controlShortLabel(key);
  }
  function parameterColorAt(value, range2, alpha = 1) {
    if (!range2) return colorWithAlpha("#FFD166", alpha);
    const span = range2.upperSliderValue - range2.lowerSliderValue || 1;
    const sliderValue = sliderValueFromNumericValue(range2.key, value);
    const t = clamp4((sliderValue - range2.lowerSliderValue) / span, 0, 1);
    const a = { r: 96, g: 128, b: 208 };
    const b = { r: 255, g: 209, b: 102 };
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const blue = Math.round(a.b + (b.b - a.b) * t);
    return alpha >= 1 ? `rgb(${r}, ${g}, ${blue})` : `rgba(${r}, ${g}, ${blue}, ${clamp4(alpha, 0, 1)})`;
  }
  function gridResultColor(result, alpha = 1) {
    const loopKey = gridState.selectedLoopKey;
    if (!loopKey) return parameterColorAt(0, null, alpha);
    return parameterColorAt(result.variedValues[loopKey] ?? 0, currentLoopRange(), alpha);
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
  function setupGridCanvasInteractions() {
    ["lightCanvas", "velocityCanvas", "fourierCanvas"].forEach((canvasId) => {
      const canvas = el(canvasId);
      canvas.classList.add("grid-interaction-canvas");
      canvas.addEventListener("pointerdown", (event) => beginGridCanvasInteraction(event, canvasId));
      canvas.addEventListener("pointermove", (event) => updateGridCanvasInteraction(event, canvasId));
      canvas.addEventListener("pointerup", (event) => finishGridCanvasInteraction(event, canvasId));
      canvas.addEventListener("pointercancel", (event) => finishGridCanvasInteraction(event, canvasId));
      canvas.addEventListener("pointerleave", () => clearFourierHover(canvasId));
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }
  function setupPhaseScrubbing() {
    PHASE_SCRUB_CANVAS_IDS.forEach((canvasId) => {
      const canvas = document.getElementById(canvasId);
      if (!(canvas instanceof HTMLCanvasElement)) return;
      canvas.classList.add("phase-scrub-canvas");
      canvas.addEventListener("pointerdown", (event) => beginPhaseScrub(event, canvasId));
      canvas.addEventListener("pointermove", (event) => updatePhaseScrub(event, canvasId));
      canvas.addEventListener("pointerup", (event) => finishPhaseScrub(event, canvasId));
      canvas.addEventListener("pointercancel", (event) => finishPhaseScrub(event, canvasId));
      canvas.addEventListener("pointerleave", () => clearPhaseHover(canvasId));
    });
  }
  function setupReferencePlotInteractions() {
    ["stabilityMapCanvas", "cepheidGuideCanvas"].forEach((canvasId) => {
      const canvas = el(canvasId);
      canvas.classList.add("reference-control-canvas");
      canvas.addEventListener("pointerdown", (event) => beginReferencePlotInteraction(event, canvasId));
      canvas.addEventListener("pointermove", (event) => updateReferencePlotInteraction(event, canvasId));
      canvas.addEventListener("pointerup", (event) => finishReferencePlotInteraction(event, canvasId));
      canvas.addEventListener("pointercancel", (event) => finishReferencePlotInteraction(event, canvasId));
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }
  function phaseFromCanvasPoint(canvasId, point) {
    const render = plotRenderStates.get(canvasId);
    if (!render || !latestPhaseRows.length || gridState.enabled || latestDisplayWindow.mode !== "phase") return null;
    if (point.x < render.plot.left || point.x > render.plot.left + render.plot.width) return null;
    const clamped = clampPointToPlot(point, render.plot);
    return clamp4(xFromPixel(render, clamped.x), 0, 2);
  }
  function scrubPhaseToPointer(canvas, canvasId, event) {
    const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
    if (phase === null) return;
    currentAnimationPhase = phase;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  }
  function canvasSupportsPhaseHover(canvasId) {
    return PHASE_HOVER_CANVAS_IDS.includes(canvasId);
  }
  function beginPhaseScrub(event, canvasId) {
    if (event.button !== 0 || gridState.enabled || !latestPhaseRows.length || latestDisplayWindow.mode !== "phase") return;
    const canvas = event.currentTarget;
    const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
    if (phase === null) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activePhaseScrub = { canvasId, pointerId: event.pointerId };
    activePhaseHoverCanvasId = null;
    currentAnimationPhase = phase;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  }
  function updatePhaseScrub(event, canvasId) {
    if (activePhaseScrub) {
      if (activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
      event.preventDefault();
      scrubPhaseToPointer(event.currentTarget, canvasId, event);
      return;
    }
    if (gridState.enabled) return;
    if (event.pointerType !== "mouse" || event.buttons !== 0 || !canvasSupportsPhaseHover(canvasId)) return;
    const canvas = event.currentTarget;
    const phase = phaseFromCanvasPoint(canvasId, canvasPoint(canvas, event));
    if (phase === null) {
      clearPhaseHover(canvasId);
      return;
    }
    activePhaseHoverCanvasId = canvasId;
    currentAnimationPhase = phase;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  }
  function finishPhaseScrub(event, canvasId) {
    if (!activePhaseScrub || activePhaseScrub.canvasId !== canvasId || activePhaseScrub.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    event.preventDefault();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activePhaseScrub = null;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  }
  function clearPhaseHover(canvasId) {
    if (activePhaseHoverCanvasId !== canvasId) return;
    activePhaseHoverCanvasId = null;
    modelAnimationStartTime = null;
    drawAnimatedPhaseViews();
  }
  function referenceCanvasPoint(canvas, event, render) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = render.width / Math.max(1, rect.width);
    const scaleY = render.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }
  function snapParameterValue(key, value) {
    const meta = sliderMeta(key);
    const rawSliderValue = sliderValueFromNumericValue(key, value);
    const clampedSliderValue = clamp4(rawSliderValue, meta.min, meta.max);
    const snappedSliderValue = roundToNativeStep(
      meta.min + Math.round((clampedSliderValue - meta.min) / meta.step) * meta.step,
      meta.step
    );
    return parameterValueFromSlider(key, clamp4(snappedSliderValue, meta.min, meta.max));
  }
  function setReferencePlotParameter(key, value) {
    const snapped = snapParameterValue(key, value);
    if (!Number.isFinite(snapped) || valuesMatch(state[key], snapped)) return false;
    state[key] = snapped;
    syncGridRangeCenter(key);
    updateSliderLabel(key);
    return true;
  }
  function commitReferencePlotParameters(updates) {
    let changed = false;
    Object.entries(updates).forEach(([key, value]) => {
      if (typeof value !== "number") return;
      changed = setReferencePlotParameter(key, value) || changed;
    });
    if (!changed) return false;
    gridState.hoverResult = null;
    gridState.heldResult = null;
    updateAllSliderLabels();
    refreshActivePreset();
    scheduleSolve();
    return true;
  }
  function referenceCoordinate(render, point) {
    const clamped = clampPointToPlot(point, render.plot);
    const xFraction = (clamped.x - render.plot.left) / render.plot.width;
    const yFraction = 1 - (clamped.y - render.plot.top) / render.plot.height;
    return {
      x: render.xlim[0] + xFraction * (render.xlim[1] - render.xlim[0]),
      y: render.ylim[0] + yFraction * (render.ylim[1] - render.ylim[0])
    };
  }
  function updateStabilityMapParameters(canvas, event) {
    const render = referencePlotRenderStates.get("stabilityMapCanvas");
    if (!render) return false;
    const point = referenceCanvasPoint(canvas, event, render);
    const coordinate = referenceCoordinate(render, point);
    return commitReferencePlotParameters({
      zetac: 10 ** coordinate.x,
      zeta: 10 ** coordinate.y
    });
  }
  function updateInstabilityStripParameters(canvas, event) {
    const render = referencePlotRenderStates.get("cepheidGuideCanvas");
    if (!render) return false;
    const point = referenceCanvasPoint(canvas, event, render);
    const coordinate = referenceCoordinate(render, point);
    const stripCoordinate = clamp4(coordinate.x, 0, 1);
    const gamma = clamp4(coordinate.y, 0, 1);
    const zeta = Math.max(1e-6, state.zeta);
    const zetac = zeta * 10 ** (4 * stripCoordinate - 2);
    return commitReferencePlotParameters({
      zetac,
      gammac: gamma
    });
  }
  function applyReferencePlotPointer(canvas, canvasId, event) {
    return canvasId === "stabilityMapCanvas" ? updateStabilityMapParameters(canvas, event) : updateInstabilityStripParameters(canvas, event);
  }
  function beginReferencePlotInteraction(event, canvasId) {
    if (event.button !== 0) return;
    const canvas = event.currentTarget;
    const render = referencePlotRenderStates.get(canvasId);
    if (!render) return;
    const point = referenceCanvasPoint(canvas, event, render);
    if (!pointInPlot(point, render.plot)) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeReferencePlotInteraction = { canvasId, pointerId: event.pointerId };
    canvas.dataset.referenceInteraction = canvasId === "stabilityMapCanvas" ? "stability-map" : "instability-strip";
    applyReferencePlotPointer(canvas, canvasId, event);
  }
  function updateReferencePlotInteraction(event, canvasId) {
    if (!activeReferencePlotInteraction || activeReferencePlotInteraction.canvasId !== canvasId || activeReferencePlotInteraction.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyReferencePlotPointer(event.currentTarget, canvasId, event);
  }
  function finishReferencePlotInteraction(event, canvasId) {
    if (!activeReferencePlotInteraction || activeReferencePlotInteraction.canvasId !== canvasId || activeReferencePlotInteraction.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    event.preventDefault();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    delete canvas.dataset.referenceInteraction;
    activeReferencePlotInteraction = null;
  }
  function setPointerCaptureIfAvailable(element, pointerId) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
    }
  }
  function beginGridCanvasInteraction(event, canvasId) {
    if (!gridState.enabled) return;
    const canvas = event.currentTarget;
    const point = canvasPoint(canvas, event);
    const colorbar = colorbarRegionAt(canvasId, point);
    if (colorbar) {
      event.preventDefault();
      setPointerCaptureIfAvailable(canvas, event.pointerId);
      activeGridCanvasInteraction = { type: "colorbar", canvasId, pointerId: event.pointerId };
      canvas.dataset.gridInteraction = "colorbar";
      gridState.heldResult = null;
      stopGridAnimation();
      scrubGridColorbar(colorbar, point);
      return;
    }
    if (canvasId === "fourierCanvas") {
      const hit = fourierPointHitAt(point);
      const result = hit?.result ?? gridState.hoverResult;
      if (!result) return;
      event.preventDefault();
      setPointerCaptureIfAvailable(canvas, event.pointerId);
      activeGridCanvasInteraction = { type: "fourier-hold", canvasId, pointerId: event.pointerId };
      canvas.dataset.gridInteraction = "fourier-hold";
      gridState.hoverResult = result;
      gridState.heldResult = result;
      stopGridAnimation();
      drawAll();
    }
  }
  function updateGridCanvasInteraction(event, canvasId) {
    const canvas = event.currentTarget;
    const point = canvasPoint(canvas, event);
    if (activeGridCanvasInteraction?.canvasId === canvasId && activeGridCanvasInteraction.pointerId === event.pointerId) {
      event.preventDefault();
      if (activeGridCanvasInteraction.type === "colorbar") {
        const region = gridColorbarRegions.get(canvasId);
        if (region) scrubGridColorbar(region, point);
        return;
      }
      if (activeGridCanvasInteraction.type === "fourier-hold") {
        const hit = fourierPointHitAt(point);
        if (hit && hit.result !== gridState.heldResult) {
          gridState.hoverResult = hit.result;
          gridState.heldResult = hit.result;
          drawAll();
        }
        return;
      }
    }
    const overColorbar = Boolean(colorbarRegionAt(canvasId, point));
    const overFourier = canvasId === "fourierCanvas" ? fourierPointHitAt(point) : null;
    canvas.style.cursor = overColorbar ? "ew-resize" : overFourier ? "pointer" : "";
    if (canvasId === "fourierCanvas") updateFourierHover(overFourier?.result ?? null, canvas);
  }
  function finishGridCanvasInteraction(event, canvasId) {
    if (!activeGridCanvasInteraction || activeGridCanvasInteraction.canvasId !== canvasId || activeGridCanvasInteraction.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    event.preventDefault();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    delete canvas.dataset.gridInteraction;
    activeGridCanvasInteraction = null;
    gridState.heldResult = null;
    startGridAnimation();
    drawAll();
  }
  function clearFourierHover(canvasId) {
    if (canvasId !== "fourierCanvas" || activeGridCanvasInteraction) return;
    const canvas = document.getElementById("fourierCanvas");
    if (canvas) {
      delete canvas.dataset.gridHover;
      canvas.style.cursor = "";
    }
    if (!gridState.hoverResult) return;
    gridState.hoverResult = null;
    drawAll();
  }
  function colorbarRegionAt(canvasId, point) {
    const region = gridColorbarRegions.get(canvasId);
    if (!region) return null;
    return point.x >= region.hitLeft && point.x <= region.hitRight && point.y >= region.hitTop && point.y <= region.hitBottom ? region : null;
  }
  function scrubGridColorbar(region, point) {
    const loopKey = gridState.selectedLoopKey;
    const range2 = currentLoopRange();
    const path = gridPathResults();
    if (!loopKey || !range2 || !path.length) return;
    const fraction = clamp4((point.x - region.left) / Math.max(1e-12, region.width), 0, 1);
    const targetSliderValue = range2.lowerSliderValue + fraction * (range2.upperSliderValue - range2.lowerSliderValue);
    let bestIndex = 0;
    let bestDistance = Infinity;
    path.forEach((result, index) => {
      const sliderValue = result.sliderValues[loopKey];
      if (sliderValue === void 0) return;
      const distance = Math.abs(sliderValue - targetSliderValue);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    gridState.animationIndex = bestIndex;
    gridState.hoverResult = null;
    gridState.heldResult = null;
    const canvas = document.getElementById(region.canvasId);
    if (canvas) canvas.dataset.gridScrubIndex = String(bestIndex);
    drawAll();
  }
  function fourierPointHitAt(point) {
    let best = null;
    let bestDistance = Infinity;
    fourierPointHits.forEach((hit) => {
      const distance = Math.hypot(point.x - hit.x, point.y - hit.y);
      const threshold = Math.max(9, hit.radius + 6);
      if (distance <= threshold && distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    });
    return best;
  }
  function updateFourierHover(result, canvas) {
    if (result === gridState.hoverResult) return;
    gridState.hoverResult = result;
    if (result) canvas.dataset.gridHover = "true";
    else delete canvas.dataset.gridHover;
    drawAll();
  }
  function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function clamp4(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function clampPointToPlot(point, plot) {
    return {
      x: clamp4(point.x, plot.left, plot.left + plot.width),
      y: clamp4(point.y, plot.top, plot.top + plot.height)
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
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
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
    updateGridLoopControls();
  }
  function buildSliderGroup(containerId, controls) {
    const container = el(containerId);
    container.querySelectorAll("[data-reset-key]").forEach((button) => {
      const key = button.dataset.resetKey;
      if (key) {
        controlElements.delete(key);
        gridRangeElements.delete(key);
      }
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
        <input class="single-slider" type="range" min="${min}" max="${max}" step="${step2}" value="${String(sliderInputValue(key))}" aria-label="${name}">
        <div class="grid-range-controls" data-grid-range-controls hidden>
          <div class="grid-range-fill" aria-hidden="true"></div>
          <div class="grid-loop-marker" data-grid-loop-marker hidden aria-hidden="true"></div>
          <div class="grid-range-inputs">
            <input class="grid-bound grid-bound-low" data-grid-bound="lower" type="range" min="${min}" max="${max}" step="${step2}" value="${String(sliderInputValue(key))}" aria-label="${name} grid lower bound">
            <input class="grid-bound grid-bound-high" data-grid-bound="upper" type="range" min="${min}" max="${max}" step="${step2}" value="${String(sliderInputValue(key))}" aria-label="${name} grid upper bound">
          </div>
        </div>
        ${sliderScaleMarkup(key)}
        </div>
      <button class="parameter-reset" type="button" data-reset-key="${key}" title="Restore ${name} to the ${selectedPreset} preset value" aria-label="Restore ${name} to the preset value">\u21BA</button>
    `;
      const input = wrapper.querySelector(".single-slider");
      const lower = wrapper.querySelector("[data-grid-bound='lower']");
      const upper = wrapper.querySelector("[data-grid-bound='upper']");
      if (!input || !lower || !upper) throw new Error("missing slider input");
      input.addEventListener("input", (event) => {
        state[key] = valueFromSlider(key, Number(event.target.value));
        syncGridRangeCenter(key);
        updateSliderLabel(key);
        if (key === "m") updateEquationBlocks();
        else updateDerivationPanel();
        refreshActivePreset();
        scheduleSolve();
      });
      const updateBounds = () => updateGridRangeBounds(key, Number(lower.value), Number(upper.value));
      lower.addEventListener("input", updateBounds);
      upper.addEventListener("input", updateBounds);
      wrapper.addEventListener("pointerdown", (event) => beginSliderTap(event, key));
      wrapper.addEventListener("pointerup", (event) => finishSliderTap(event, key));
      wrapper.addEventListener("pointercancel", (event) => {
        if (activeSliderTapStart?.key === key && activeSliderTapStart.pointerId === event.pointerId) activeSliderTapStart = null;
      });
      wrapper.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        toggleGridRangeFromSliderGesture(key);
      });
      wrapper.querySelector("[data-reset-key]")?.addEventListener("click", () => restoreParameterDefault(key));
      container.appendChild(wrapper);
      controlElements.set(key, input);
      gridRangeElements.set(key, { wrapper, center: input, lower, upper });
      refreshGridRangeUi(key);
      updateSliderLabel(key);
    });
    queueMathTypeset([container]);
  }
  function tauScaleMarkup() {
    const maxLog = Math.log10(TAU_SCALE_MAX);
    return `<div class="slider-scale">${TAU_TICKS.map((tick) => {
      const position = Math.log10(tick) / maxLog * 100;
      const edge = tick === 1 ? ` data-scale-edge="start"` : tick === TAU_SCALE_MAX ? ` data-scale-edge="end"` : "";
      return `<span${edge} style="--tick-position:${position.toFixed(4)}%">${tick}</span>`;
    }).join("")}</div>`;
  }
  function sliderScaleMarkup(key) {
    if (key === "tEnd") return tauScaleMarkup();
    if (key === "zeta") return keyedScaleMarkup(key, [0.01, 0.1, 1, 10, 100]);
    if (key === "zetac") return keyedScaleMarkup(key, [0, 0.1, 1, 10, 100]);
    if (key === "m") return keyedScaleMarkup(key, [CHI_PARAMETER_MIN, 10, CHI_PARAMETER_BREAK, CHI_PARAMETER_MAX]);
    return "";
  }
  function keyedScaleMarkup(key, ticks) {
    const meta = sliderMeta(key);
    const span = meta.max - meta.min || 1;
    return `<div class="slider-scale">${ticks.map((tick) => {
      const sliderValue = sliderValueFromNumericValue(key, tick);
      const position = (sliderValue - meta.min) / span * 100;
      const edge = Math.abs(position) < 1e-8 ? ` data-scale-edge="start"` : Math.abs(position - 100) < 1e-8 ? ` data-scale-edge="end"` : "";
      return `<span${edge} style="--tick-position:${position.toFixed(4)}%">${controlValueLabel(key, tick)}</span>`;
    }).join("")}</div>`;
  }
  function sliderInputValue(key) {
    return sliderValueFromParameter(key, state);
  }
  function valueFromSlider(key, value) {
    return parameterValueFromSlider(key, value);
  }
  function controlValueLabel(key, value) {
    if (key === "zeta" || key === "zetac") {
      if (Math.abs(value) < 1e-12) return "0";
      if (Math.abs(value) >= 10) return fmt(value, 1);
      if (Math.abs(value) >= 1) return fmt(value, 2);
      if (Math.abs(value) >= 0.1) return fmt(value, 3);
      return fmt(value, 4);
    }
    if (key === "m") return fmt(value, value >= 20 ? 1 : 2);
    if (key !== "tEnd") return fmt(value, 5);
    return fmt(value, value >= 100 ? 0 : 1);
  }
  function controlShortLabel(key) {
    if (key === "tEnd") return "tau_max";
    if (key === "logRtol") return "log rtol";
    if (key === "logAtol") return "log atol";
    if (key === "logErrTol") return "log eps";
    if (key === "logStabilityTol") return "log eps_s";
    return String(key);
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
      <tr><td class="symbol-cell" style="--color:${COLORS.m}">geometry</td><td>${meaning(`Switch between fixed geometry \\(\\ozChi{\\chi}=${TEX.m}\\) and radius-dependent local geometry \\(\\ozChi{\\chi}(${TEX.R})\\).`)}</td></tr>
      <tr><td class="symbol-cell" style="--color:${COLORS.H}">driver</td><td>${meaning(`Convective driving choice: the standard Stellingwerf pressure form is \\(\\sqrt{${TEX.H}}\\); \\(\\sqrt{|${TEX.V}|}\\) is retained as a diagnostic variant.`)}</td></tr>
    `;
    numericalTable.innerHTML = controlRows(CONTROL_GROUPS.integration) + `
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">solver</td><td>${meaning("Numerical method: RK45 default, DOP853 reference, or historical midpoint.")}</td></tr>
      <tr><td class="symbol-cell" style="--color:${THEME.neutralSymbol}">phase window</td><td>${meaning("Reference cycles use the first valid luminosity window; final cycles use the latest valid window; the lightcurve control chooses min- or max-light phase zero.")}</td></tr>
  `;
    queueMathTypeset();
  }
  function derivationBlock(key, title, body) {
    return `
    <section class="derivation-block" data-derivation-block="${key}">
      <h4>${title}</h4>
      ${body}
    </section>
  `;
  }
  function derivationEquation(lines) {
    return `
    <div class="equation-block derivation-equations">
      \\[
      \\begin{aligned}
      ${lines.join("\\\\[0.35em]\n")}
      \\end{aligned}
      \\]
    </div>
  `;
  }
  function derivationConditionFormula(stability, condition2) {
    if (condition2.kind === "convective") return s72ConvectiveMargin();
    if (condition2.kind === "secular") return s72SecularMargin(stability);
    if (condition2.kind === "dynamic") return s72DynamicMargin(stability);
    return s72PulsationalMargin(stability);
  }
  function derivationConditionRows(stability) {
    return stability.conditions.map((condition2) => {
      const symbol = s72LatexInequality(condition2.stable, ">");
      const className = s72MetricClass(condition2.stable);
      return `
        <tr data-stability-kind="${condition2.kind}" class="${className}">
          <td>${s72Verdict(condition2.kind, condition2.stable)}</td>
          <td>\\(\\Delta_{\\rm ${s72ShortLabel(condition2.kind)}}=${fmt(condition2.value, 3)}\\ ${symbol}\\ 0\\)</td>
        </tr>
      `;
    }).join("");
  }
  function buildGeometryDerivation(parameters) {
    const eta = Math.cbrt(Math.max(0, 1 - 3 / parameters.m));
    const etaDisplay = fmtFixed(eta, 3);
    const chiDisplay = fmt(parameters.m, 3);
    const lines = parameters.variableM ? [
      `\\ozEta{\\eta} &= \\left(1-\\frac{3}{${TEX.m}}\\right)^{1/3}=\\ozEta{${etaDisplay}}`,
      `\\ozChi{\\chi}(${TEX.R}) &= \\frac{3}{1-(\\ozEta{\\eta}/${TEX.R})^3}`,
      `\\ozChi{\\chi}(1) &= ${TEX.m}=\\ozChiZero{${chiDisplay}}`,
      `\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0} &= ${TEX.R}^{-\\ozChi{\\chi}(${TEX.R})}`
    ] : [
      `\\ozChi{\\chi} &= ${TEX.m}=\\ozChiZero{${chiDisplay}}`,
      `\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0} &= ${TEX.R}^{-${TEX.m}}`
    ];
    return derivationBlock(
      "geometry",
      "Geometry and Shell Thinness",
      `<p>${parameters.variableM ? "Radius-dependent shell geometry is active, so the local thin shell factor changes with radius." : "Fixed shell geometry is active, so the thin shell factor stays at the slider value."}</p>${derivationEquation(lines)}`
    );
  }
  function buildOpacityDerivation(parameters) {
    const powers = derivedPowers(1, parameters);
    return derivationBlock(
      "opacity",
      "Opacity and Radiative Scaling",
      derivationEquation([
        `\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0} &= ${TEX.R}^{-\\ozChi{\\chi}(${TEX.gamma1}-1)}${TEX.H}`,
        `\\frac{\\ozNeutral{\\kappa}}{\\ozNeutral{\\kappa}_0} &= \\left(\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0}\\right)^{${TEX.n}}\\left(\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0}\\right)^{-${TEX.s}}`,
        `&= ${TEX.R}^{-\\ozChi{\\chi}${TEX.n}+\\ozChi{\\chi}${TEX.s}(${TEX.gamma1}-1)}${TEX.H}^{-${TEX.s}}`,
        `\\ozNeutral{b} &= 4+\\ozChi{\\chi}\\left[${TEX.n}-(${TEX.s}+4)(${TEX.gamma1}-1)\\right]=\\ozNeutral{${fmt(powers.b, 3)}}`
      ])
    );
  }
  function buildEquilibriumDerivation(parameters) {
    const powers = derivedPowers(1, parameters);
    const base = 1 ** parameters.sourceExp;
    const gammaC = effectiveGammaC(parameters);
    return derivationBlock(
      "equilibrium",
      "Equilibrium Quantities",
      derivationEquation([
        `${TEX.R}_0 &= 1,\\quad ${TEX.V}_0=0,\\quad ${TEX.H}_0=1,\\quad ${TEX.Uc}_0=1`,
        `\\left.\\frac{\\ozNeutral{\\rho}}{\\ozNeutral{\\rho}_0}\\right|_0 &= 1,\\quad \\left.\\frac{\\ozNeutral{P}}{\\ozNeutral{P}_0}\\right|_0 = 1,\\quad \\left.\\frac{\\ozNeutral{T}}{\\ozNeutral{T}_0}\\right|_0=1`,
        `\\left.\\frac{\\ozNeutral{\\kappa}}{\\ozNeutral{\\kappa}_0}\\right|_0 &= 1,\\quad \\ozNeutral{b}=\\ozNeutral{${fmt(powers.b, 3)}},\\quad \\ozNeutral{c}=\\ozChi{\\chi}-2=\\ozNeutral{${fmt(powers.c, 3)}}`,
        `${TEX_GAMMAC_EFF} &= \\ozGammac{${fmt(gammaC, 3)}}`,
        `\\ozRadiative{L_{r,0}} &= 1-${TEX_GAMMAC_EFF}=\\ozRadiative{${fmt(1 - gammaC, 3)}}`,
        `\\ozConvLum{L_{c,0}} &= ${TEX_GAMMAC_EFF}=\\ozConvLum{${fmt(gammaC, 3)}}`,
        `\\ozLuminosity{L_0} &= \\ozRadiative{L_{r,0}}+\\ozConvLum{L_{c,0}}=1,\\quad \\ozNeutral{L_{b,0}}=${fmt(base, 3)}`
      ])
    );
  }
  function buildLuminosityDerivation(parameters) {
    const convectionFrozen = parameters.zetac <= 0;
    const gammaC = effectiveGammaC(parameters);
    const convectionAbsent = convectionFrozen && Math.abs(parameters.uc0) <= 1e-9;
    const note = convectionAbsent ? "<p>With \\(\\zeta_c=0\\) and \\(U_{c,0}=0\\), convection is absent, so \\(\\gamma_{c,\\rm eff}=0\\) and radiation carries the full luminosity.</p>" : convectionFrozen ? "<p>With \\(\\zeta_c=0\\), the convective velocity is frozen. If \\(U_{c,0}\\neq0\\), the nonlinear luminosity can still include the weighted frozen convective channel.</p>" : "<p>Time-dependent convection is active, so radiative and convective luminosities both respond to the perturbation.</p>";
    return derivationBlock(
      "luminosity",
      "Luminosity and Source",
      `${note}${derivationEquation([
        `\\ozNeutral{L_b} &= ${TEX.R}^{${TEX.sourceExp}}`,
        `${TEX_GAMMAC_EFF} &= \\ozGammac{${fmt(gammaC, 3)}}`,
        `${TEX.Lr} &= (1-${TEX_GAMMAC_EFF})\\,${TEX.R}^{\\ozNeutral{b}}${TEX.H}^{${TEX.s}+4}`,
        `${TEX.Lc} &= ${TEX_GAMMAC_EFF}\\,${TEX.R}^{-(\\ozNeutral{c})}${TEX.Uc}^{3}`,
        `${TEX.L} &= ${TEX.Lr}+${TEX.Lc}`,
        `\\frac{d${TEX.H}}{d${TEX.tau}} &= ${TEX.zeta}\\,${TEX.R}^{\\ozChi{\\chi}(${TEX.gamma1}-1)}\\left(${TEX.R}^{${TEX.sourceExp}}-${TEX.L}\\right)`
      ])}`
    );
  }
  function buildConvectionDerivation(parameters) {
    const driver = parameters.driver === "abs-v" ? `\\sqrt{|${TEX.V}|}` : `\\sqrt{${TEX.H}}`;
    const powers = derivedPowers(1, parameters);
    const intro = parameters.zetac <= 0 ? "<p>Time-dependent convection is off in the active physics because \\(\\zeta_c=0\\).</p>" : `<p>The active convective driver is \\(${driver}\\).</p>`;
    const evolution = parameters.zetac <= 0 ? `\\frac{d${TEX.Uc}}{d${TEX.tau}} = 0` : `\\frac{d${TEX.Uc}}{d${TEX.tau}} = ${TEX.zetac}\\left[${TEX.R}^{-\\ozNeutral{d}}${driver}-${TEX.Uc}\\right]`;
    return derivationBlock(
      "convection",
      "Convection Assumption",
      `${intro}${derivationEquation([
        `\\ozNeutral{d} &= \\frac{\\ozChi{\\chi}(${TEX.gamma1}-1)}{2}=\\ozNeutral{${fmt(powers.d, 3)}}`,
        evolution,
        `\\ozNeutral{c} &= \\ozChi{\\chi}-2=\\ozNeutral{${fmt(powers.c, 3)}}`
      ])}`
    );
  }
  function buildLinearDerivation(parameters, stability) {
    const modeLabel = stability.physicsMode === "convective" ? "time-dependent convective" : "reduced frozen-convection/radiative";
    const definitions = derivationEquation([
      `\\ozNeutral{E} &= (1-${TEX_GAMMAC_EFF})\\ozNeutral{b}-${TEX_GAMMAC_EFF}\\ozNeutral{c}-${TEX.sourceExp}=\\ozNeutral{${fmt(stability.eCoefficient, 3)}}`,
      `\\ozNeutral{Q} &= (1-${TEX_GAMMAC_EFF})(${TEX.s}+4)=\\ozNeutral{${fmt(stability.terms.radiativeThermal, 3)}}`,
      `\\ozNeutral{S} &= ${TEX.m}${TEX.gamma1}-4=\\ozNeutral{${fmt(stability.terms.restoring, 3)}}`
    ]);
    const conditions = stability.conditions.map((condition2) => {
      const formula = derivationConditionFormula(stability, condition2);
      return `\\Delta_{\\rm ${s72ShortLabel(condition2.kind)}} &= ${formula}`;
    });
    const reducedNote = stability.physicsMode === "radiative" ? "<p>The \\(u_c\\) perturbation is removed when \\(\\zeta_c=0\\), so the convective/turbulent criterion drops out and the remaining Hurwitz margins reduce.</p>" : "<p>The active four-variable linear system keeps the convective lag perturbation \\(u_c\\), producing the four Stellingwerf margins.</p>";
    return derivationBlock(
      "linear",
      "Linear Analysis and Stability Criteria",
      `
      <p>Linearized about \\(R=H=U_c=1\\) with active ${modeLabel} physics.</p>
      ${definitions}
      ${reducedNote}
      ${derivationEquation(conditions)}
      <table class="derivation-condition-table" aria-label="Current stability criteria">
        <tbody>${derivationConditionRows(stability)}</tbody>
      </table>
    `
    );
  }
  function buildDerivationHtml(parameters, stability) {
    return [
      buildGeometryDerivation(parameters),
      buildOpacityDerivation(parameters),
      buildEquilibriumDerivation(parameters),
      buildLuminosityDerivation(parameters),
      buildConvectionDerivation(parameters),
      buildLinearDerivation(parameters, stability)
    ].join("");
  }
  function derivationSignature(parameters, stability) {
    return [
      parameters.variableM ? "variable" : "fixed",
      parameters.driver,
      stability.physicsMode,
      parameters.zeta,
      parameters.zetac,
      parameters.gammac,
      parameters.m,
      parameters.gamma1,
      parameters.n,
      parameters.s,
      parameters.sourceExp,
      parameters.cq,
      ...stability.conditions.map((condition2) => `${condition2.kind}:${condition2.value}`)
    ].map((value) => String(value)).join("|");
  }
  function updateDerivationPanel(parameters = state, stability = analyticStabilityConditions(parameters)) {
    const node = document.getElementById("derivationContent");
    if (!(node instanceof HTMLElement)) return;
    const signature = derivationSignature(parameters, stability);
    if (signature === lastDerivationSignature) return;
    lastDerivationSignature = signature;
    const details = document.getElementById("derivationPanel");
    if (details) {
      details.dataset.physicsMode = stability.physicsMode;
      details.dataset.geometryMode = parameters.variableM ? "radius-dependent" : "fixed";
      details.dataset.driverMode = parameters.driver;
      details.dataset.convectionMode = parameters.zetac <= 0 ? "frozen" : "time-dependent";
    }
    stageMathHtml(node, buildDerivationHtml(parameters, stability));
    queueMathTypeset([node]);
  }
  function updateEquationBlocks() {
    const eta = Math.cbrt(Math.max(0, 1 - 3 / state.m));
    const etaDisplay = fmtFixed(eta, 2);
    const geometry = state.variableM ? `\\ozChi{\\chi} &= \\frac{3}{1-(\\ozEta{\\eta}/\\ozRadius{R})^3}\\\\[0.2em]
       \\ozEta{\\eta} &= \\left(1-\\frac{3}{\\ozChiZero{\\chi_0}}\\right)^{1/3}=\\ozEta{${etaDisplay}}` : `\\ozChi{\\chi} &= \\ozChiZero{\\chi_0}`;
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
      \\frac{\\ozPressure{H}}{\\ozRadius{R}^{\\ozChi{\\chi}\\ozGamma{\\Gamma_1}-2}}
      - \\frac{1}{\\ozRadius{R}^{2}}
      - \\ozDamping{C_q}\\ozVelocity{V}^{3}\\\\[0.35em]
    \\frac{d\\ozPressure{H}}{d\\ozTau{\\tau}} &=
      \\ozZeta{\\zeta}\\,
      \\ozRadius{R}^{\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)}
      \\left[
        \\ozRadius{R}^{\\ozSource{U}}
        - \\ozLuminosity{L}
      \\right]\\\\[0.35em]
    \\frac{d\\ozConvective{U_c}}{d\\ozTau{\\tau}} &=
      \\ozZetac{\\zeta_c}
      \\left[
        \\ozRadius{R}^{-\\ozChi{\\chi}(\\ozGamma{\\Gamma_1}-1)/2}\\,${driver}
        - \\ozConvective{U_c}
      \\right]
    \\end{aligned}
    \\]
  `;
    luminosityNode.dataset.geometryMode = state.variableM ? "radius-dependent" : "fixed";
    luminosityNode.dataset.geometryLayout = "stacked";
    luminosityNode.dataset.etaValue = etaDisplay;
    const luminosityHtml = `
    \\[
    \\begin{aligned}
    ${geometry}\\\\[0.35em]
    \\ozRadiative{L_r} &=
      (1-\\ozGammac{\\gamma_c})\\,
      \\ozRadius{R}^{4+\\ozChi{\\chi}
      \\left[\\ozBlue{n}-(\\ozPink{s}+4)(\\ozGamma{\\Gamma_1}-1)\\right]}
      \\ozPressure{H}^{\\ozPink{s}+4}\\\\[0.35em]
    \\ozConvLum{L_c} &=
      \\ozGammac{\\gamma_c}\\,
      \\ozRadius{R}^{-(\\ozChi{\\chi}-2)}
      \\ozConvective{U_c}^{3}\\\\[0.35em]
    \\ozLuminosity{L} &=
      \\ozRadiative{L_r}
      + \\ozConvLum{L_c}
    \\end{aligned}
    \\]
  `;
    stageMathHtml(odeNode, odeHtml);
    stageMathHtml(luminosityNode, luminosityHtml);
    queueMathTypeset([odeNode, luminosityNode]);
    updateDerivationPanel();
  }
  function updateVariableInitials() {
    const initial = sample(0, [state.r0, state.v0, state.h0, state.uc0], state);
    const values = {
      initialTau: `\\(${TEX.tau}_{0}=0.00\\)`,
      initialR: `\\(${TEX.R}_{0}=${fmtFixed(initial.R, 2)}\\)`,
      initialV: `\\(${TEX.V}_{0}=${fmtFixed(initial.V, 2)}\\)`,
      initialH: `\\(${TEX.H}_{0}=${fmtFixed(initial.H, 2)}\\)`,
      initialUc: `\\(${TEX.Uc}_{0}=${fmtFixed(initial.Uc, 2)}\\)`,
      initialLr: `\\(${TEX.Lr}_{0}=${fmtFixed(initial.Lr, 2)}\\)`,
      initialLc: `\\(${TEX.Lc}_{0}=${fmtFixed(initial.Lc, 2)}\\)`,
      initialL: `\\(${TEX.L}_{0}=${fmtFixed(initial.L, 2)}\\)`
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
    const current = currentGridResult();
    const dynamicValue = gridState.enabled && key === gridState.selectedLoopKey ? current?.variedValues[key] : void 0;
    const value = dynamicValue ?? state[key];
    label.textContent = controlValueLabel(key, value);
    const input = controlElements.get(key);
    if (input) input.value = String(sliderInputValue(key));
  }
  function updateAllSliderLabels() {
    syncAllGridRangeCenters();
    controlElements.forEach((_input, key) => updateSliderLabel(key));
    updateResetButtons();
  }
  function restoreParameterDefault(key) {
    state[key] = PRESETS[selectedPreset][key];
    syncGridRangeCenter(key);
    updateSliderLabel(key);
    if (key === "m") updateEquationBlocks();
    else updateDerivationPanel();
    refreshActivePreset();
    scheduleSolve();
  }
  function updateResetButtons() {
    document.querySelectorAll("[data-reset-key]").forEach((button) => {
      const key = button.dataset.resetKey;
      button.disabled = valuesMatch(state[key], PRESETS[selectedPreset][key]);
      button.title = `Restore to ${selectedPreset} preset value: ${controlValueLabel(key, Number(PRESETS[selectedPreset][key]))}`;
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
  function updatePhaseAnchorButtons() {
    document.querySelectorAll("[data-phase-anchor]").forEach((button) => {
      const active = button.dataset.phaseAnchor === phaseAnchor;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
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
    scheduleGridCompute();
  }
  function solveAndDraw() {
    latestResult = solveModel(state);
    latestRows = latestResult.rows;
    drawAll();
  }
  function strideDownsample2(rows, maxPoints) {
    if (rows.length <= maxPoints) return rows;
    const stride = Math.ceil(rows.length / maxPoints);
    const sampled = rows.filter((_row, index) => index % stride === 0);
    const last = rows.at(-1);
    if (last && sampled.at(-1) !== last) sampled.push(last);
    return sampled;
  }
  function rowSeriesKey(key) {
    return key !== "Lb";
  }
  function baseLuminosity(row, parameters = state) {
    if (!Number.isFinite(row.R) || row.R <= 0) return NaN;
    const value = row.R ** parameters.sourceExp;
    return Number.isFinite(value) ? value : NaN;
  }
  function sourceLuminosityColor() {
    return COLORS.sourceExp;
  }
  function sourceLuminosityLegendLabel() {
    return `\\(${TEX.R}^{${TEX.sourceExp}}\\) source`;
  }
  function log10Positive(value) {
    return Number.isFinite(value) && value > 0 ? Math.log10(value) : NaN;
  }
  function temperatureRatio(row, parameters) {
    if (!Number.isFinite(row.R) || row.R <= 0 || !Number.isFinite(row.H) || row.H <= 0) return NaN;
    const chi = mAt(row.R, parameters);
    const value = row.R ** (-chi * (parameters.gamma1 - 1)) * row.H;
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }
  function pressureRatio(row, parameters) {
    if (!Number.isFinite(row.R) || row.R <= 0 || !Number.isFinite(row.H) || row.H <= 0) return NaN;
    const chi = mAt(row.R, parameters);
    const value = row.R ** (-chi * parameters.gamma1) * row.H;
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }
  function opacityLogFromLogTemperaturePressure(logT, logP, parameters) {
    if (!Number.isFinite(logT) || !Number.isFinite(logP)) return NaN;
    return parameters.n * logP - (parameters.n + parameters.s) * logT;
  }
  function thermodynamicPoint(row, parameters) {
    const logT = log10Positive(temperatureRatio(row, parameters));
    const logP = log10Positive(pressureRatio(row, parameters));
    const logOpacity = opacityLogFromLogTemperaturePressure(logT, logP, parameters);
    if (![logT, logP, logOpacity].every(Number.isFinite)) return null;
    return { row, logT, logP, logOpacity };
  }
  function thermodynamicPoints(rows, parameters, maxPoints = 1400) {
    return downsample(rows, maxPoints, ["R", "H"]).map((row) => thermodynamicPoint(row, parameters)).filter((point) => Boolean(point));
  }
  var gridThermodynamicPointCache = /* @__PURE__ */ new WeakMap();
  function thermodynamicPointsForGridResult(result, maxPoints) {
    let pointsByDensity = gridThermodynamicPointCache.get(result);
    if (!pointsByDensity) {
      pointsByDensity = /* @__PURE__ */ new Map();
      gridThermodynamicPointCache.set(result, pointsByDensity);
    }
    const cached = pointsByDensity.get(maxPoints);
    if (cached) return cached;
    const points = thermodynamicPoints(closedLoopPanelRows(result.phaseRows), result.parameters, maxPoints);
    pointsByDensity.set(maxPoints, points);
    return points;
  }
  function downsample(rows, maxPoints = 2200, keys = []) {
    if (rows.length <= maxPoints) return rows;
    const uniqueKeys = [...new Set(keys.filter(rowSeriesKey))];
    if (!uniqueKeys.length) return strideDownsample2(rows, maxPoints);
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
  function convectiveResponseDisabled(parameters = state) {
    return parameters.zetac <= 0;
  }
  function convectiveLuminosityAvailable(parameters = state) {
    return effectiveGammaC(parameters) > 1e-9;
  }
  function convectiveVelocityHistoryAvailable(rows = latestRows, parameters = state) {
    return !convectiveResponseDisabled(parameters) || convectiveLuminosityAvailable(parameters) && rows.some((row) => Math.abs(row.Uc) > 1e-9);
  }
  function plotSeriesIsAvailable(plotId, key) {
    if (plotId === "time" && key === "Uc") return convectiveVelocityHistoryAvailable();
    if (plotId === "lum" && (key === "Lr" || key === "Lc")) return convectiveLuminosityAvailable();
    return true;
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
  function anchoredVisualRange(values, anchor, minimumHalfSpan, padFraction = 0.08) {
    const base = range([...values, anchor], padFraction);
    if (!Number.isFinite(anchor) || !Number.isFinite(minimumHalfSpan) || minimumHalfSpan <= 0) return base;
    return [
      Math.min(base[0], anchor - minimumHalfSpan),
      Math.max(base[1], anchor + minimumHalfSpan)
    ];
  }
  function stableTimeEquilibriumDisplayActive() {
    return latestDisplayWindow.mode === "time" && latestDisplayWindow.reason === "equilibrium";
  }
  function stableTimeVisualReferenceRows(rows) {
    return stableTimeEquilibriumDisplayActive() && latestRows.length ? latestRows : rows;
  }
  function expandRangeToInclude(base, included) {
    if (!included) return base;
    return [
      Math.min(base[0], included[0]),
      Math.max(base[1], included[1])
    ];
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
      const column = clamp4(Math.floor((x - xlim[0]) / xSpan * columnCount), 0, columnCount - 1);
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
  function drawAxes(ctx, plot, xlim, ylim, xlabel, ylabel, xlabelColor = THEME.axisText, ylabelColor = THEME.axisText, ylabelX = PLOT_LAYOUT.yLabelX) {
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
    ctx.translate(ylabelX, plot.top + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ylabelColor;
    ctx.fillText(ylabel, 0, 0);
    ctx.restore();
  }
  function drawSeries(canvasId, series, options) {
    const canvas = el(canvasId);
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) {
      plotRenderStates.delete(canvasId);
      return;
    }
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
    const automaticYlim = options.ylim || range(yValues, 0.08);
    const ylim = options.view?.ylim || (options.ylim ? options.ylim : expandRangeToInclude(automaticYlim, options.minimumYlim));
    canvas.dataset.xlim = `${fmtFixed(xlim[0], 3)},${fmtFixed(xlim[1], 3)}`;
    canvas.dataset.ylim = `${fmtFixed(ylim[0], 4)},${fmtFixed(ylim[1], 4)}`;
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
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(item.dash || []);
      if (item.colorAt || item.widthAt) {
        let previous = null;
        item.rows.forEach((row) => {
          const x = item.x(row);
          const y = item.y(row);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            previous = null;
            return;
          }
          const current = { row, x: sx(x), y: sy(y) };
          if (previous) {
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(current.x, current.y);
            ctx.strokeStyle = item.colorAt ? item.colorAt(row) : item.color;
            ctx.lineWidth = item.widthAt ? item.widthAt(row) : item.width || 2;
            ctx.stroke();
          }
          previous = current;
        });
      } else {
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
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
    ctx.restore();
    if (options.phaseMarker) drawPhaseMarker(ctx, plot, xlim, options.phaseMarker);
    options.afterDraw?.(ctx, plot, xlim, ylim, canvasId);
    drawSelectionOverlay(ctx, canvasId, plot);
  }
  function drawPhaseMarker(ctx, plot, xlim, marker) {
    if (!Number.isFinite(marker.x) || marker.x < xlim[0] || marker.x > xlim[1]) return;
    const x = plot.left + (marker.x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.strokeStyle = marker.color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
    ctx.restore();
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
  function parseHexColor(color) {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    if (!match) return [255, 255, 255];
    return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
  }
  function mixHexColors(a, b, fraction) {
    const [ar, ag, ab] = parseHexColor(a);
    const [br, bg, bb] = parseHexColor(b);
    const f = clamp4(fraction, 0, 1);
    const channel = (start, end) => Math.round(start + (end - start) * f);
    return `rgb(${channel(ar, br)}, ${channel(ag, bg)}, ${channel(ab, bb)})`;
  }
  function radialVelocityCurveColor(value, maxAbs) {
    if (!Number.isFinite(value) || !Number.isFinite(maxAbs) || maxAbs <= 0) return "#FFFFFF";
    const color = value >= 0 ? POSITIVE_VELOCITY_COLOR : NEGATIVE_VELOCITY_COLOR;
    return mixHexColors("#FFFFFF", color, Math.min(1, Math.abs(value) / maxAbs));
  }
  function gridPhaseRowsForResult(result, quantity, maxPoints) {
    let rowsByDensity = gridPhaseRowCache.get(result);
    if (!rowsByDensity) {
      rowsByDensity = /* @__PURE__ */ new Map();
      gridPhaseRowCache.set(result, rowsByDensity);
    }
    const key = `${quantity}:${maxPoints}`;
    const cached = rowsByDensity.get(key);
    if (cached) return cached;
    const rows = downsample(result.phaseRows, maxPoints, [quantity]);
    rowsByDensity.set(key, rows);
    return rows;
  }
  function gridPhaseSeries(quantity, color, fallbackRows) {
    const accessor = (row) => row[quantity];
    if (!gridState.enabled || !gridState.results.length) {
      const singleSeries = { label: quantity, color, rows: fallbackRows, x: (row) => row.tau, y: accessor };
      if (!gridState.enabled && quantity === "V") {
        const maxAbs = Math.max(1e-12, ...fallbackRows.map((row) => Math.abs(row.V)).filter(Number.isFinite));
        singleSeries.colorAt = (row) => radialVelocityCurveColor(row.V, maxAbs);
        singleSeries.width = 2.3;
      }
      return [singleSeries];
    }
    const path = gridPathResults();
    const current = currentGridResult();
    const backgroundStride = Math.max(1, Math.ceil(gridState.results.length / GRID_PHASE_BACKGROUND_MAX_MODELS));
    const series = gridState.results.filter((_result, index) => index % backgroundStride === 0).map((result) => ({
      label: `grid-${result.id}`,
      color: "rgba(190, 200, 216, 0.18)",
      rows: gridPhaseRowsForResult(result, quantity, GRID_PHASE_BACKGROUND_MAX_POINTS),
      x: (row) => row.tau,
      y: accessor,
      width: 0.8
    }));
    path.forEach((result) => {
      series.push({
        label: `path-${result.id}`,
        color: "rgba(190, 200, 216, 0.34)",
        rows: gridPhaseRowsForResult(result, quantity, GRID_PHASE_PATH_MAX_POINTS),
        x: (row) => row.tau,
        y: accessor,
        width: 1.15
      });
    });
    const highlighted = gridState.heldResult || gridState.hoverResult;
    if (highlighted && highlighted !== current) {
      series.push({
        label: `highlight-${highlighted.id}`,
        color: gridResultColor(highlighted, 0.98),
        rows: gridPhaseRowsForResult(highlighted, quantity, GRID_PHASE_CURRENT_MAX_POINTS),
        x: (row) => row.tau,
        y: accessor,
        width: 3.4
      });
    }
    if (current) {
      series.push({
        label: quantity,
        color: gridResultColor(current, 0.98),
        rows: gridPhaseRowsForResult(current, quantity, GRID_PHASE_CURRENT_MAX_POINTS),
        x: (row) => row.tau,
        y: accessor,
        width: 2.8
      });
    }
    return series;
  }
  function drawGridColorbar(ctx, plot, _xlim, _ylim, canvasId = "fourierCanvas") {
    const clearRegion = () => {
      gridColorbarRegions.delete(canvasId);
      const canvas2 = document.getElementById(canvasId);
      if (!canvas2) return;
      delete canvas2.dataset.gridColorbar;
      delete canvas2.dataset.gridColorbarKey;
      delete canvas2.dataset.gridColorbarHit;
    };
    if (!gridState.enabled) {
      clearRegion();
      return;
    }
    const range2 = currentLoopRange();
    const current = currentGridResult();
    if (!range2 || !current) {
      clearRegion();
      return;
    }
    const value = current.variedValues[range2.key];
    const sliderValue = current.sliderValues[range2.key];
    if (value === void 0 || sliderValue === void 0) {
      clearRegion();
      return;
    }
    const width = Math.min(150, Math.max(112, plot.width * 0.24));
    const height = 9;
    const left = plot.left + plot.width - width - 12;
    const top = plot.top + 12;
    gridColorbarRegions.set(canvasId, {
      canvasId,
      left,
      top,
      width,
      height,
      hitLeft: left - 12,
      hitTop: top - 10,
      hitRight: left + width + 12,
      hitBottom: top + 50
    });
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      canvas.dataset.gridColorbar = "ready";
      canvas.dataset.gridColorbarKey = range2.key;
      canvas.dataset.gridColorbarHit = [
        Math.round(left - 12),
        Math.round(top - 10),
        Math.round(left + width + 12),
        Math.round(top + 50)
      ].join(",");
    }
    const lowerValue = parameterValueFromSlider(range2.key, range2.lowerSliderValue);
    const upperValue = parameterValueFromSlider(range2.key, range2.upperSliderValue);
    const gradient = ctx.createLinearGradient(left, top, left + width, top);
    gradient.addColorStop(0, "#6080D0");
    gradient.addColorStop(1, "#FFD166");
    ctx.save();
    ctx.fillStyle = "rgba(5, 8, 20, 0.68)";
    ctx.fillRect(left - 8, top - 8, width + 16, 58);
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = "rgba(238, 245, 255, 0.62)";
    ctx.strokeRect(left, top, width, height);
    const fraction = clamp4((sliderValue - range2.lowerSliderValue) / Math.max(1e-12, range2.upperSliderValue - range2.lowerSliderValue), 0, 1);
    const markerX = left + fraction * width;
    ctx.fillStyle = parameterColorAt(value, range2);
    ctx.strokeStyle = "#050814";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(markerX, top + height + 2);
    ctx.lineTo(markerX - 5, top + height + 10);
    ctx.lineTo(markerX + 5, top + height + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THEME.axisText;
    ctx.font = "11px Inter, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(controlValueLabel(range2.key, lowerValue), left, top + height + 13);
    ctx.textAlign = "right";
    ctx.fillText(controlValueLabel(range2.key, upperValue), left + width, top + height + 13);
    const symbol = controlCanvasSymbol(range2.key);
    const valueText = ` = ${controlValueLabel(range2.key, value)}`;
    ctx.font = "600 11px Inter, sans-serif";
    const symbolWidth = ctx.measureText(symbol).width;
    ctx.font = "11px Inter, sans-serif";
    const valueWidth = ctx.measureText(valueText).width;
    const labelLeft = left + width / 2 - (symbolWidth + valueWidth) / 2;
    ctx.textAlign = "left";
    ctx.font = "600 11px Inter, sans-serif";
    ctx.fillStyle = controlColor(range2.key);
    ctx.fillText(symbol, labelLeft, top + height + 28);
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = THEME.axisText;
    ctx.fillText(valueText, labelLeft + symbolWidth, top + height + 28);
    ctx.restore();
  }
  function drawFourierPanel() {
    const panel = document.getElementById("fourierGridPanel");
    const canvas = document.getElementById("fourierCanvas");
    if (!(panel instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return;
    panel.hidden = !gridState.enabled;
    if (panel.hidden) {
      fourierPointHits = [];
      gridColorbarRegions.delete("fourierCanvas");
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const gridPoints = gridState.results.filter((result) => result.fourier);
    const path = gridPathResults().filter((result) => result.fourier);
    const allPoints = [...gridPoints, ...path];
    const panels = [
      {
        latex: "r_{21}",
        xLabel: "period/\u03C4",
        yLabel: { base: "r", subscript: "21" },
        xValue: (result) => result.period,
        yValue: (result) => result.fourier.r21
      },
      {
        latex: "r_{31}",
        xLabel: "period/\u03C4",
        yLabel: { base: "r", subscript: "31" },
        xValue: (result) => result.period,
        yValue: (result) => result.fourier.r31
      },
      {
        latex: "\\phi_{21}",
        xLabel: "period/\u03C4",
        yLabel: { base: "phi", subscript: "21" },
        xValue: (result) => result.period,
        yValue: (result) => result.fourier.phi21,
        yPhase: true
      },
      {
        latex: "\\phi_{31}",
        xLabel: "period/\u03C4",
        yLabel: { base: "phi", subscript: "31" },
        xValue: (result) => result.period,
        yValue: (result) => result.fourier.phi31,
        yPhase: true
      }
    ];
    const columns = rect.width >= 1760 ? 5 : rect.width >= 1320 ? 4 : rect.width >= 780 ? 2 : 1;
    const rows = Math.ceil(panels.length / columns);
    const cssHeight = Math.max(280, rows * 238);
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, cssHeight);
    fourierPointHits = [];
    delete canvas.dataset.firstFourierHit;
    canvas.dataset.fourierHitCount = "0";
    if (!allPoints.length) {
      gridColorbarRegions.delete("fourierCanvas");
      ctx.fillStyle = THEME.axisText;
      ctx.font = "13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(gridState.status === "complete" ? "No Fourier diagnostics passed the amplitude filter" : gridState.statusText, rect.width / 2, cssHeight / 2);
      return;
    }
    const current = currentGridResult();
    const currentFourier = current?.fourier ? current : null;
    canvas.dataset.fourierAxisLabels = panels.map((item) => item.latex).join(",");
    canvas.dataset.fourierPathCount = String(path.length);
    canvas.dataset.fourierPhaseTicks = "pi-multiples";
    delete canvas.dataset.fourierStructuralPanels;
    delete canvas.dataset.fourierAdiabaticReference;
    const adiabaticReference = [];
    const gap = 16;
    const pad = { left: 78, right: 22, top: 42, bottom: 60 };
    const panelWidth = (rect.width - gap * (columns - 1)) / columns;
    const panelHeight = (cssHeight - gap * (rows - 1)) / rows;
    panels.forEach((item, index) => {
      const column = index % columns;
      const rowIndex = Math.floor(index / columns);
      const box = {
        left: column * (panelWidth + gap) + pad.left,
        top: rowIndex * (panelHeight + gap) + pad.top,
        width: panelWidth - pad.left - pad.right,
        height: panelHeight - pad.top - pad.bottom
      };
      const xValues = fourierPanelXValues(item, allPoints, item.adiabaticReference ? adiabaticReference : []);
      const yValues = fourierPanelYValues(item, allPoints, path, item.adiabaticReference ? adiabaticReference : []);
      const xlim = item.xPhase ? phaseRange(xValues, false) : range(xValues, 0.05);
      const ylim = item.yPhase ? phaseRange(yValues, true) : range(yValues, 0.08);
      const ylabelX = Math.max(8, box.left - 70);
      drawFourierAxes(ctx, box, xlim, ylim, item.xLabel, ylabelX, {
        xPhase: item.xPhase,
        yPhase: item.yPhase,
        upperSkewnessAxis: item.upperSkewnessAxis ? path : null
      });
      drawFourierAxisLabel(ctx, item.yLabel, ylabelX, box.top + box.height / 2);
      if (item.identityLine) drawFourierIdentityLine(ctx, box, xlim, ylim);
      if (item.adiabaticReference) drawAdiabaticFourierReference(ctx, box, xlim, ylim, adiabaticReference);
      if (item.harmonics?.length && item.harmonicValues) {
        drawFourierHarmonicLegend(ctx, box, item.harmonics);
        item.harmonics.forEach((harmonic) => {
          const color = FOURIER_HARMONIC_COLORS[harmonic] || THEME.axisText;
          const yValue = (result) => item.harmonicValues(result, harmonic);
          collectFourierPointHits(box, xlim, ylim, allPoints, item.xValue, yValue);
          drawFourierPoints(ctx, box, xlim, ylim, gridPoints, item.xValue, yValue, colorWithAlpha(color, 0.28), 1.8);
          drawFourierSeriesPath(
            ctx,
            box,
            xlim,
            ylim,
            buildFourierSeries(path, item.xValue, yValue, Boolean(item.yPhase)),
            1.45,
            colorWithAlpha(color, 0.72)
          );
          drawFourierPoints(ctx, box, xlim, ylim, path, item.xValue, yValue, colorWithAlpha(color, 0.76), 2.2);
          const highlighted2 = gridState.heldResult || gridState.hoverResult;
          if (highlighted2?.fourier && highlighted2 !== currentFourier) {
            drawFourierPoints(ctx, box, xlim, ylim, [highlighted2], item.xValue, yValue, colorWithAlpha(color, 0.96), 4.5);
          }
          if (currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [currentFourier], item.xValue, yValue, colorWithAlpha(color, 1), 5.2);
        });
        return;
      }
      if (!item.yValue) return;
      collectFourierPointHits(box, xlim, ylim, allPoints, item.xValue, item.yValue);
      drawFourierPoints(ctx, box, xlim, ylim, gridPoints, item.xValue, item.yValue, "rgba(190, 200, 216, 0.24)", 2.1);
      drawFourierSeriesPath(
        ctx,
        box,
        xlim,
        ylim,
        buildFourierSeries(path, item.xValue, item.yValue, Boolean(item.yPhase)),
        1.9,
        (point) => point.result ? gridResultColor(point.result, 0.62) : colorWithAlpha(PHASE_MARKER_COLOR, 0.58)
      );
      drawFourierPoints(ctx, box, xlim, ylim, path, item.xValue, item.yValue, (result) => gridResultColor(result, 0.78), 2.9);
      const highlighted = gridState.heldResult || gridState.hoverResult;
      if (highlighted?.fourier && highlighted !== currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [highlighted], item.xValue, item.yValue, (result) => gridResultColor(result, 0.98), 5.4);
      if (currentFourier) drawFourierPoints(ctx, box, xlim, ylim, [currentFourier], item.xValue, item.yValue, (result) => gridResultColor(result, 0.98), 6.2);
    });
    canvas.dataset.fourierHitCount = String(fourierPointHits.length);
    drawGridColorbar(ctx, {
      left: rect.width - 184,
      top: 4,
      width: 170,
      height: 36
    });
    const firstHit = fourierPointHits.find((hit) => !colorbarRegionAt("fourierCanvas", hit)) ?? fourierPointHits[0];
    if (firstHit) canvas.dataset.firstFourierHit = `${firstHit.x.toFixed(1)},${firstHit.y.toFixed(1)}`;
  }
  function fourierPanelXValues(panel, points, reference) {
    return [
      ...points.map(panel.xValue),
      ...reference.map((point) => point.x)
    ].filter(Number.isFinite);
  }
  function fourierPanelYValues(panel, points, path, reference) {
    const values = [];
    if (panel.harmonics?.length && panel.harmonicValues) {
      panel.harmonics.forEach((harmonic) => {
        const yValue = (result) => panel.harmonicValues(result, harmonic);
        values.push(...points.map(yValue));
        if (panel.yPhase) values.push(...buildFourierSeries(path, panel.xValue, yValue, true).map((point) => point.y));
      });
    } else if (panel.yValue) {
      values.push(...points.map(panel.yValue));
      if (panel.yPhase) values.push(...buildFourierSeries(path, panel.xValue, panel.yValue, true).map((point) => point.y));
    }
    values.push(...reference.map((point) => point.y));
    return values.filter(Number.isFinite);
  }
  function phaseRange(values, allowUnwrapped) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return [0, 2 * Math.PI];
    const min = allowUnwrapped ? Math.min(0, ...finite) : 0;
    const max = allowUnwrapped ? Math.max(2 * Math.PI, ...finite) : 2 * Math.PI;
    const step2 = Math.PI / 2;
    const lower = allowUnwrapped ? Math.floor(min / step2) * step2 : 0;
    return [lower, Math.max(2 * Math.PI, Math.ceil(max / step2) * step2)];
  }
  function phaseTickLabel(value) {
    const halfPi = Math.PI / 2;
    const rounded = Math.round(value / halfPi);
    const wrapped = (rounded % 4 + 4) % 4;
    if (rounded === 0) return "0";
    if (wrapped === 0) return "2\u03C0";
    if (wrapped === 1) return "\u03C0/2";
    if (wrapped === 2) return "\u03C0";
    return "3\u03C0/2";
  }
  function axisTickValues(lim, phase = false) {
    if (!phase) {
      return Array.from({ length: 5 }, (_value, index) => lim[0] + (lim[1] - lim[0]) * index / 4);
    }
    const step2 = Math.PI / 2;
    const first = Math.ceil(lim[0] / step2) * step2;
    const ticks = [];
    for (let value = first; value <= lim[1] + step2 * 0.1; value += step2) ticks.push(value);
    return ticks;
  }
  function skewnessAtPeriod(points, period) {
    const sorted = points.filter((point) => point.fourier && Number.isFinite(point.period) && Number.isFinite(point.fourier.skewness)).sort((a, b) => a.period - b.period);
    if (!sorted.length) return null;
    if (period <= sorted[0].period) return sorted[0].fourier.skewness;
    const last = sorted[sorted.length - 1];
    if (period >= last.period) return last.fourier.skewness;
    for (let index = 1; index < sorted.length; index += 1) {
      const left = sorted[index - 1];
      const right = sorted[index];
      if (period <= right.period) {
        const span = right.period - left.period || 1;
        const t = (period - left.period) / span;
        return left.fourier.skewness + (right.fourier.skewness - left.fourier.skewness) * t;
      }
    }
    return null;
  }
  function drawFourierAxes(ctx, plot, xlim, ylim, xlabel, ylabelX, options = {}) {
    ctx.save();
    ctx.strokeStyle = THEME.axisGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = THEME.axisText;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    axisTickValues(xlim, Boolean(options.xPhase)).forEach((value) => {
      const x = plot.left + (value - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
      if (!Number.isFinite(x)) return;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.fillText(options.xPhase ? phaseTickLabel(value) : fmt(value, 2), x, plot.top + plot.height + 8);
    });
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    axisTickValues(ylim, Boolean(options.yPhase)).forEach((value) => {
      const y = plot.top + plot.height - (value - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
      if (!Number.isFinite(y)) return;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
      ctx.fillText(options.yPhase ? phaseTickLabel(value) : fmt(value, 2), plot.left - PLOT_LAYOUT.yTickGap, y);
    });
    ctx.strokeStyle = THEME.axisBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
    if (options.upperSkewnessAxis?.length) {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillStyle = THEME.axisText;
      axisTickValues(xlim, false).forEach((period) => {
        const skewness = skewnessAtPeriod(options.upperSkewnessAxis || [], period);
        if (skewness === null) return;
        const x = plot.left + (period - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
        ctx.fillText(fmt(skewness, 2), x, plot.top - 10);
      });
      ctx.fillText("S_k", plot.left + plot.width / 2, plot.top - 26);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = THEME.axisText;
    ctx.fillText(xlabel, plot.left + plot.width / 2, plot.top + plot.height + 42);
    ctx.restore();
    void ylabelX;
  }
  function buildFourierSeries(points, xValue, yValue, unwrapY) {
    let previous = null;
    return points.map((result) => {
      const x = xValue(result);
      let y = yValue(result);
      if (unwrapY && Number.isFinite(y)) {
        if (previous !== null) {
          while (y - previous > Math.PI) y -= 2 * Math.PI;
          while (previous - y > Math.PI) y += 2 * Math.PI;
        }
        previous = y;
      }
      return { x, y, result };
    }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  function drawFourierIdentityLine(ctx, plot, xlim, ylim) {
    const start = Math.max(xlim[0], ylim[0]);
    const end = Math.min(xlim[1], ylim[1]);
    if (!(end > start)) return;
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    ctx.save();
    ctx.strokeStyle = "rgba(190, 200, 216, 0.46)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(start), sy(start));
    ctx.lineTo(sx(end), sy(end));
    ctx.stroke();
    ctx.fillStyle = "rgba(190, 200, 216, 0.82)";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("\u03C631=\u03C621", plot.left + plot.width - 6, plot.top + 6);
    ctx.restore();
  }
  function drawAdiabaticFourierReference(ctx, plot, xlim, ylim, reference) {
    drawFourierSeriesPath(ctx, plot, xlim, ylim, reference, 1.4, "rgba(255, 255, 255, 0.58)", [5, 5]);
    const point = reference[Math.floor(reference.length * 0.68)];
    if (!point) return;
    const x = plot.left + (point.x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const y = plot.top + plot.height - (point.y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.76)";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("adiabatic", x + 6, y - 4);
    ctx.restore();
  }
  function drawFourierHarmonicLegend(ctx, plot, harmonics) {
    ctx.save();
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const startX = plot.left + 8;
    const maxX = plot.left + plot.width - 8;
    let x = startX;
    let y = plot.top + 9;
    harmonics.forEach((harmonic) => {
      const color = FOURIER_HARMONIC_COLORS[harmonic] || THEME.axisText;
      if (x > startX && x + 40 > maxX) {
        x = startX;
        y += 13;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(`\u03C6${harmonic}1`, x + 16, y);
      x += 44;
    });
    ctx.restore();
  }
  function collectFourierPointHits(plot, xlim, ylim, points, xValue, yValue) {
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    points.forEach((result) => {
      const x = sx(xValue(result));
      const y = sy(yValue(result));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      fourierPointHits.push({ result, x, y, radius: 5 });
    });
  }
  function canvasMathFont(size, weight) {
    return `${weight ? `${weight} ` : ""}${size}px Inter, sans-serif`;
  }
  function canvasMathWidth(ctx, fragments, fontSize = 12, subscriptSize = 8) {
    return fragments.reduce((total, fragment) => {
      ctx.font = canvasMathFont(fontSize, fragment.weight);
      const baseWidth = ctx.measureText(fragment.text).width;
      if (!fragment.subscript && !fragment.superscript) return total + baseWidth;
      ctx.font = canvasMathFont(subscriptSize, fragment.weight);
      const subscriptWidth = fragment.subscript ? ctx.measureText(fragment.subscript).width : 0;
      const superscriptWidth = fragment.superscript ? ctx.measureText(fragment.superscript).width : 0;
      return total + baseWidth + Math.max(subscriptWidth, superscriptWidth) + 1;
    }, 0);
  }
  function drawCanvasMathFragments(ctx, fragments, x, y, options = {}) {
    const fontSize = options.fontSize ?? 12;
    const subscriptSize = options.subscriptSize ?? Math.max(8, Math.round(fontSize * 0.68));
    const align = options.align ?? "center";
    const totalWidth = canvasMathWidth(ctx, fragments, fontSize, subscriptSize);
    const start = align === "right" ? -totalWidth : align === "center" ? -totalWidth / 2 : 0;
    ctx.save();
    ctx.translate(x, y);
    if (options.rotate) ctx.rotate(options.rotate);
    let cursor = start;
    const drawText = (text, textX, textY) => {
      if (options.strokeWidth && options.strokeWidth > 0) {
        ctx.lineJoin = "round";
        ctx.strokeStyle = options.strokeColor || "rgba(5, 8, 20, 0.9)";
        ctx.lineWidth = options.strokeWidth;
        ctx.strokeText(text, textX, textY);
      }
      ctx.fillText(text, textX, textY);
    };
    fragments.forEach((fragment) => {
      ctx.font = canvasMathFont(fontSize, fragment.weight);
      ctx.fillStyle = fragment.color || options.color || THEME.axisText;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      drawText(fragment.text, cursor, 0);
      const baseWidth = ctx.measureText(fragment.text).width;
      cursor += baseWidth;
      if (fragment.subscript || fragment.superscript) {
        ctx.font = canvasMathFont(subscriptSize, fragment.weight);
        const scriptX = cursor + 1;
        const subscriptWidth = fragment.subscript ? ctx.measureText(fragment.subscript).width : 0;
        const superscriptWidth = fragment.superscript ? ctx.measureText(fragment.superscript).width : 0;
        if (fragment.superscript) {
          ctx.textBaseline = "alphabetic";
          drawText(fragment.superscript, scriptX, -fontSize * 0.28);
        }
        if (fragment.subscript) {
          ctx.textBaseline = "alphabetic";
          drawText(fragment.subscript, scriptX, fontSize * 0.42);
        }
        cursor += Math.max(subscriptWidth, superscriptWidth) + 1;
      }
    });
    ctx.restore();
    return totalWidth;
  }
  function drawFourierAxisLabel(ctx, label, x, y) {
    const base = label.base === "phi" ? "\u03C6" : label.base;
    drawCanvasMathFragments(ctx, [{ text: base, subscript: label.subscript }], x, y, { rotate: -Math.PI / 2 });
  }
  function updateStabilityLinearizedHeader(gammac) {
    const note = document.getElementById("stabilityLinearizedHeader");
    if (!note) return;
    note.textContent = `linearized at \u03B3c = ${fmt(gammac, 2)}`;
  }
  function drawFourierSeriesPath(ctx, plot, xlim, ylim, points, width, color, dash = []) {
    if (points.length < 2) return;
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash);
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      const x0 = sx(previous.x);
      const y0 = sy(previous.y);
      const x1 = sx(current.x);
      const y1 = sy(current.y);
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      ctx.strokeStyle = typeof color === "function" ? color(current) : color;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawFourierPoints(ctx, plot, xlim, ylim, points, xValue, yValue, color, radius) {
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    points.forEach((point) => {
      const x = sx(xValue(point));
      const y = sy(yValue(point));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      ctx.fillStyle = typeof color === "function" ? color(point) : color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.restore();
  }
  function stabilityDisplayParameters() {
    return currentGridResult()?.parameters || state;
  }
  function stabilityOverlayResults() {
    if (!gridState.enabled) return [];
    return gridState.results.filter(
      (result) => Number.isFinite(result.parameters.zeta) && Number.isFinite(result.parameters.zetac) && Number.isFinite(result.parameters.gammac)
    );
  }
  function responseLogValue(value) {
    if (!Number.isFinite(value) || value <= 0) return RESPONSE_LOG_MIN;
    return clamp4(Math.log10(value), RESPONSE_LOG_MIN, RESPONSE_LOG_MAX);
  }
  function stabilityCacheKey(parameters) {
    return [
      RESPONSE_LOG_MIN,
      RESPONSE_LOG_MAX,
      parameters.zetac <= 0 ? "radiative" : "convective",
      parameters.gammac.toFixed(3),
      parameters.n.toFixed(3),
      parameters.s.toFixed(3),
      parameters.m.toFixed(3),
      parameters.gamma1.toFixed(3),
      parameters.sourceExp.toFixed(3),
      parameters.cq.toFixed(3),
      String(parameters.variableM)
    ].join("|");
  }
  function stabilityKindsForMap(parameters) {
    const key = stabilityCacheKey(parameters);
    const cached = stabilityMapCache.get(key);
    if (cached) return cached;
    const kinds = [];
    const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
    const radiativeMode = parameters.zetac <= 0;
    for (let row = 0; row < STABILITY_MAP_RESOLUTION; row += 1) {
      const zeta = 10 ** (RESPONSE_LOG_MIN + (row + 0.5) / STABILITY_MAP_RESOLUTION * span);
      for (let column = 0; column < STABILITY_MAP_RESOLUTION; column += 1) {
        const zetac = radiativeMode ? 0 : 10 ** (RESPONSE_LOG_MIN + (column + 0.5) / STABILITY_MAP_RESOLUTION * span);
        kinds.push(analyticStabilityConditions({ ...parameters, zeta, zetac }).kind);
      }
    }
    if (stabilityMapCache.size > 24) stabilityMapCache.clear();
    stabilityMapCache.set(key, kinds);
    return kinds;
  }
  function instabilityStripCacheKey(parameters) {
    return [
      INSTABILITY_STRIP_X_RESOLUTION,
      INSTABILITY_STRIP_Y_RESOLUTION,
      parameters.zetac <= 0 ? "radiative" : "convective",
      parameters.zeta.toFixed(4),
      parameters.n.toFixed(3),
      parameters.s.toFixed(3),
      parameters.m.toFixed(3),
      parameters.gamma1.toFixed(3),
      parameters.sourceExp.toFixed(3),
      parameters.cq.toFixed(3),
      String(parameters.variableM)
    ].join("|");
  }
  function emptyStabilityCounts() {
    return {
      stable: 0,
      convective: 0,
      secular: 0,
      pulsational: 0,
      dynamic: 0,
      neutral: 0
    };
  }
  function instabilityKindsForStrip(parameters) {
    const key = instabilityStripCacheKey(parameters);
    const cached = instabilityStripCache.get(key);
    if (cached) return cached;
    const kinds = [];
    const counts = emptyStabilityCounts();
    const zeta = Math.max(1e-6, parameters.zeta);
    const radiativeMode = parameters.zetac <= 0;
    for (let row = 0; row < INSTABILITY_STRIP_Y_RESOLUTION; row += 1) {
      const gammac = (row + 0.5) / INSTABILITY_STRIP_Y_RESOLUTION;
      for (let column = 0; column < INSTABILITY_STRIP_X_RESOLUTION; column += 1) {
        const x = (column + 0.5) / INSTABILITY_STRIP_X_RESOLUTION;
        const logRatio = STRIP_LOG_RATIO_MIN + x * (STRIP_LOG_RATIO_MAX - STRIP_LOG_RATIO_MIN);
        const zetac = radiativeMode ? 0 : zeta * 10 ** logRatio;
        const kind = analyticStabilityConditions({ ...parameters, zeta, zetac, gammac }).kind;
        counts[kind] += 1;
        kinds.push(kind);
      }
    }
    const signature = [
      key,
      counts.stable,
      counts.convective,
      counts.secular,
      counts.dynamic,
      counts.pulsational,
      counts.neutral
    ].join("|");
    const result = { kinds, counts, signature };
    if (instabilityStripCache.size > 24) instabilityStripCache.clear();
    instabilityStripCache.set(key, result);
    return result;
  }
  function stabilityKindColor(kind, alpha = 1) {
    const colors = {
      stable: [69, 137, 118],
      convective: [61, 147, 196],
      secular: [155, 113, 217],
      pulsational: [184, 82, 94],
      dynamic: [216, 155, 65],
      neutral: [132, 146, 170]
    };
    const [r, g, b] = colors[kind];
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function stabilityKindAlpha(kind) {
    if (kind === "stable") return 0.5;
    if (kind === "neutral") return 0.22;
    return 0.6;
  }
  function linearStabilityLegendItems(physicsMode) {
    const items = [
      { label: "damping", color: stabilityKindColor("stable", 0.75) },
      { label: "secular", color: stabilityKindColor("secular", 0.82) },
      { label: "dynamic", color: stabilityKindColor("dynamic", 0.82) },
      { label: "pulsational", color: stabilityKindColor("pulsational", 0.82) }
    ];
    if (physicsMode === "convective") {
      items.splice(1, 0, { label: "conv/turb", color: stabilityKindColor("convective", 0.82) });
    }
    return items;
  }
  function linearStabilityLegendLabel(physicsMode) {
    const labels = ["linear damping"];
    if (physicsMode === "convective") labels.push("convective/turbulent instability");
    labels.push("secular instability", "dynamic instability", "pulsational instability");
    return labels.join(",");
  }
  function stabilityCountsLabel(counts, physicsMode) {
    const parts = [`stable:${counts.stable}`];
    if (physicsMode === "convective") parts.push(`convective:${counts.convective}`);
    parts.push(
      `secular:${counts.secular}`,
      `dynamic:${counts.dynamic}`,
      `pulsational:${counts.pulsational}`,
      `neutral:${counts.neutral}`
    );
    return parts.join(",");
  }
  function drawReferenceMarker(ctx, x, y, color, radius = 4) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#050814";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function drawStabilityOverlays(ctx, plot, current, overlays) {
    const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
    const sx = (zetac) => plot.left + (responseLogValue(zetac) - RESPONSE_LOG_MIN) / span * plot.width;
    const sy = (zeta) => plot.top + plot.height - (responseLogValue(zeta) - RESPONSE_LOG_MIN) / span * plot.height;
    const path = gridPathResults();
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    overlays.forEach((result) => {
      drawReferenceMarker(ctx, sx(result.parameters.zetac), sy(result.parameters.zeta), "rgba(220, 228, 244, 0.32)", 2.3);
    });
    if (path.length > 1) {
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < path.length; i += 1) {
        ctx.strokeStyle = gridResultColor(path[i], 0.74);
        ctx.beginPath();
        ctx.moveTo(sx(path[i - 1].parameters.zetac), sy(path[i - 1].parameters.zeta));
        ctx.lineTo(sx(path[i].parameters.zetac), sy(path[i].parameters.zeta));
        ctx.stroke();
      }
    }
    ctx.restore();
    const highlighted = gridState.heldResult || gridState.hoverResult || currentGridResult();
    if (highlighted) drawReferenceMarker(ctx, sx(highlighted.parameters.zetac), sy(highlighted.parameters.zeta), gridResultColor(highlighted, 1), 6);
    else drawReferenceMarker(ctx, sx(current.zetac), sy(current.zeta), COLORS.gammac, 6);
  }
  function responseTickLabel(logValue) {
    return controlValueLabel("zeta", 10 ** logValue);
  }
  function drawLogResponseAxes(ctx, plot) {
    const span = RESPONSE_LOG_MAX - RESPONSE_LOG_MIN;
    const position = (logValue) => (logValue - RESPONSE_LOG_MIN) / span;
    ctx.strokeStyle = THEME.axisGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = THEME.axisText;
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let logValue = RESPONSE_LOG_MIN; logValue <= RESPONSE_LOG_MAX + 1e-9; logValue += 1) {
      const x = plot.left + position(logValue) * plot.width;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.fillText(responseTickLabel(logValue), x, plot.top + plot.height + 8);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let logValue = RESPONSE_LOG_MIN; logValue <= RESPONSE_LOG_MAX + 1e-9; logValue += 1) {
      const y = plot.top + plot.height - position(logValue) * plot.height;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
      ctx.fillText(responseTickLabel(logValue), plot.left - PLOT_LAYOUT.yTickGap, y);
    }
    ctx.strokeStyle = THEME.axisBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  }
  function drawReferenceLegend(ctx, x, y, items, options = {}) {
    ctx.save();
    const fontSize = options.fontSize ?? 11;
    const swatchSize = options.swatchSize ?? 10;
    const labelGap = options.labelGap ?? 14;
    const itemGap = options.itemGap ?? 14;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    ctx.textBaseline = "middle";
    let cursor = x;
    let rowY = y;
    const maxX = options.maxX ?? Infinity;
    const lineHeight = options.lineHeight ?? Math.max(12, fontSize + 3);
    items.forEach((item) => {
      const itemWidth = swatchSize + labelGap + ctx.measureText(item.label).width + itemGap;
      if (cursor > x && cursor + itemWidth > maxX) {
        cursor = x;
        rowY += lineHeight;
      }
      ctx.fillStyle = item.color;
      ctx.fillRect(cursor, rowY - swatchSize / 2, swatchSize, swatchSize);
      ctx.fillStyle = THEME.axisText;
      ctx.textAlign = "left";
      ctx.fillText(item.label, cursor + swatchSize + labelGap, rowY);
      cursor += itemWidth;
    });
    ctx.restore();
  }
  function drawStabilityMap() {
    const canvas = document.getElementById("stabilityMapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) {
      referencePlotRenderStates.delete("stabilityMapCanvas");
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(360, rect.width || 540);
    const height = Math.max(290, rect.height || 310);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const parameters = stabilityDisplayParameters();
    const overlays = stabilityOverlayResults();
    const stabilityPhysics = analyticStabilityConditions(parameters).physicsMode;
    const kinds = stabilityKindsForMap(parameters);
    const plot = { left: 58, top: 34, width: width - 78, height: height - 88 };
    const cellWidth = plot.width / STABILITY_MAP_RESOLUTION;
    const cellHeight = plot.height / STABILITY_MAP_RESOLUTION;
    referencePlotRenderStates.set("stabilityMapCanvas", {
      plot,
      xlim: [RESPONSE_LOG_MIN, RESPONSE_LOG_MAX],
      ylim: [RESPONSE_LOG_MIN, RESPONSE_LOG_MAX],
      width,
      height
    });
    canvas.dataset.stabilityMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.stabilityGamma = fmtFixed(parameters.gammac, 3);
    canvas.dataset.stabilityPhysics = stabilityPhysics;
    canvas.dataset.stabilityScale = "log10";
    canvas.dataset.stabilityRange = `${controlValueLabel("zeta", 10 ** RESPONSE_LOG_MIN)},${controlValueLabel("zeta", 10 ** RESPONSE_LOG_MAX)}`;
    canvas.dataset.stabilityLegend = linearStabilityLegendLabel(stabilityPhysics);
    canvas.dataset.editableParameters = "zetac,zeta";
    canvas.dataset.stellingwerfLabels = "zeta,zeta_c,gamma_c";
    canvas.dataset.axisLabels = "log10 convective response zeta_c,log10 thermal response zeta";
    kinds.forEach((kind, index) => {
      const row = Math.floor(index / STABILITY_MAP_RESOLUTION);
      const column = index % STABILITY_MAP_RESOLUTION;
      ctx.fillStyle = stabilityKindColor(kind, stabilityKindAlpha(kind));
      ctx.fillRect(plot.left + column * cellWidth, plot.top + plot.height - (row + 1) * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
    });
    drawLogResponseAxes(ctx, plot);
    drawCanvasMathFragments(
      ctx,
      [
        { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
        { text: " " },
        { text: "convective response ", color: COLORS.zetac, weight: 600 },
        { text: "\u03B6", subscript: "c", color: COLORS.zetac, weight: 600 }
      ],
      plot.left + plot.width / 2,
      plot.top + plot.height + 42
    );
    drawCanvasMathFragments(
      ctx,
      [
        { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
        { text: " " },
        { text: "thermal response ", color: COLORS.zeta, weight: 600 },
        { text: "\u03B6", color: COLORS.zeta, weight: 600 }
      ],
      10,
      plot.top + plot.height / 2,
      { rotate: -Math.PI / 2, fontSize: 11 }
    );
    updateStabilityLinearizedHeader(parameters.gammac);
    drawReferenceLegend(ctx, plot.left + 4, 15, linearStabilityLegendItems(stabilityPhysics), { maxX: plot.left + plot.width - 4, fontSize: 10.5, swatchSize: 9, labelGap: 5, itemGap: 10, lineHeight: 12 });
    drawStabilityOverlays(ctx, plot, parameters, overlays);
  }
  function drawDashedCurve(ctx, points) {
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "rgba(238, 245, 255, 0.82)";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }
  function effectiveTemperatureProxy(row) {
    if (!Number.isFinite(row.L) || !Number.isFinite(row.R) || row.L <= 0 || row.R <= 0) return null;
    const value = (row.L / (row.R * row.R)) ** 0.25;
    return Number.isFinite(value) ? value : null;
  }
  function drawCepheidGuide() {
    const canvas = document.getElementById("cepheidGuideCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) {
      referencePlotRenderStates.delete("cepheidGuideCanvas");
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(360, rect.width || 540);
    const height = Math.max(290, rect.height || 310);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const plot = { left: 64, top: 28, width: width - 90, height: height - 88 };
    const sx = (x) => plot.left + clamp4(x, 0, 1) * plot.width;
    const sy = (gamma) => plot.top + plot.height - clamp4(gamma, 0, 1) * plot.height;
    referencePlotRenderStates.set("cepheidGuideCanvas", { plot, xlim: [0, 1], ylim: [0, 1], width, height });
    canvas.dataset.cepheidMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.instabilityMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.xAxisLabel = "log10(zetac/zeta) convective/thermal response";
    canvas.dataset.xAxisDirection = "redward-right";
    canvas.dataset.editableParameters = "zetac,gammac";
    canvas.dataset.stellingwerfLabels = "gamma_c,log10_zeta_c_over_zeta";
    canvas.dataset.axisLabels = "log10(zeta_c/zeta) convective/thermal response,convective flux fraction gamma_c";
    const current = currentGridResult();
    const parameters = current?.parameters || state;
    const stripPhysics = analyticStabilityConditions(parameters).physicsMode;
    canvas.dataset.instabilityPhysics = stripPhysics;
    canvas.dataset.instabilityLabels = linearStabilityLegendLabel(stripPhysics);
    canvas.dataset.instabilityLegend = linearStabilityLegendLabel(stripPhysics);
    const stripStability = instabilityKindsForStrip(parameters);
    canvas.dataset.instabilitySignature = stripStability.signature;
    canvas.dataset.instabilityCounts = stabilityCountsLabel(stripStability.counts, stripPhysics);
    const stripCellWidth = plot.width / INSTABILITY_STRIP_X_RESOLUTION;
    const stripCellHeight = plot.height / INSTABILITY_STRIP_Y_RESOLUTION;
    stripStability.kinds.forEach((kind, index) => {
      const row = Math.floor(index / INSTABILITY_STRIP_X_RESOLUTION);
      const column = index % INSTABILITY_STRIP_X_RESOLUTION;
      ctx.fillStyle = stabilityKindColor(kind, stabilityKindAlpha(kind));
      ctx.fillRect(
        plot.left + column * stripCellWidth,
        plot.top + plot.height - (row + 1) * stripCellHeight,
        stripCellWidth + 0.5,
        stripCellHeight + 0.5
      );
    });
    drawAxes(ctx, plot, [STRIP_LOG_RATIO_MIN, STRIP_LOG_RATIO_MAX], [0, 1], "", "", THEME.axisText, THEME.axisText, 12);
    drawReferenceLegend(ctx, plot.left + 8, 15, linearStabilityLegendItems(stripPhysics), { maxX: plot.left + plot.width - 4, fontSize: 10.5, swatchSize: 9, labelGap: 5, itemGap: 10, lineHeight: 12 });
    drawCanvasMathFragments(
      ctx,
      [
        { text: "log", subscript: "10", color: THEME.axisText, weight: 600 },
        { text: "(" },
        { text: "\u03B6", subscript: "c", color: COLORS.zetac, weight: 600 },
        { text: "/" },
        { text: "\u03B6", color: COLORS.zeta, weight: 600 },
        { text: ") " },
        { text: "convective response", color: COLORS.zetac, weight: 600 },
        { text: "/" },
        { text: "thermal response", color: COLORS.zeta, weight: 600 }
      ],
      plot.left + plot.width / 2,
      plot.top + plot.height + 46,
      { fontSize: 10.5, subscriptSize: 7 }
    );
    ctx.fillStyle = THEME.axisText;
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("blue", sx(0.08), plot.top + plot.height + 25);
    ctx.fillText("red", sx(0.92), plot.top + plot.height + 25);
    drawCanvasMathFragments(
      ctx,
      [
        { text: "convective flux fraction ", color: COLORS.gammac, weight: 600 },
        { text: "\u03B3", subscript: "c", color: COLORS.gammac, weight: 600 }
      ],
      12,
      plot.top + plot.height / 2,
      { rotate: -Math.PI / 2, fontSize: 11 }
    );
    ctx.fillStyle = THEME.axisText;
    ctx.font = "700 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.font = "12px Inter, sans-serif";
    const locus = Array.from({ length: 80 }, (_value, index) => {
      const x = index / 79;
      const gamma = clamp4(0.02 + 0.92 * x ** 2.25, 0, 1);
      return { x: sx(x), y: sy(gamma) };
    });
    drawDashedCurve(ctx, locus);
    const overlays = stabilityOverlayResults();
    overlays.forEach((result) => {
      drawReferenceMarker(
        ctx,
        sx(cepheidStripCoordinate(result.parameters)),
        sy(result.parameters.gammac),
        "rgba(220, 228, 244, 0.32)",
        2.3
      );
    });
    const path = gridPathResults();
    if (path.length > 1) {
      ctx.lineWidth = 1.8;
      for (let i = 1; i < path.length; i += 1) {
        ctx.strokeStyle = gridResultColor(path[i], 0.74);
        ctx.beginPath();
        ctx.moveTo(sx(cepheidStripCoordinate(path[i - 1].parameters)), sy(path[i - 1].parameters.gammac));
        ctx.lineTo(sx(cepheidStripCoordinate(path[i].parameters)), sy(path[i].parameters.gammac));
        ctx.stroke();
      }
    }
    const currentMode = current ? "phase" : latestDisplayWindow.mode;
    delete canvas.dataset.teffPhaseTrack;
    if (currentMode === "phase") {
      canvas.dataset.currentPhase = fmtFixed(currentAnimationPhase, 3);
      delete canvas.dataset.currentTime;
    } else {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    }
    drawReferenceMarker(
      ctx,
      sx(cepheidStripCoordinate(parameters)),
      sy(parameters.gammac),
      current ? gridResultColor(current, 1) : COLORS.gammac,
      6
    );
  }
  function drawPhasePortraitCurve(ctx, plot, xlim, ylim, rows, key, color, dash = []) {
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.strokeStyle = colorWithAlpha(color, 0.94);
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;
    rows.forEach((row) => {
      const x = sx(row.R);
      const y = sy(phasePortraitValue(row, key));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  function drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, key, color, fraction) {
    if (rows.length < 3) return;
    const index = Math.min(rows.length - 2, Math.max(1, Math.floor(fraction * (rows.length - 1))));
    const a = rows[index - 1];
    const b = rows[index + 1];
    const sx = (x2) => plot.left + (x2 - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y2) => plot.top + plot.height - (y2 - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    const x0 = sx(a.R);
    const y0 = sy(phasePortraitValue(a, key));
    const x1 = sx(b.R);
    const y1 = sy(phasePortraitValue(b, key));
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const x = sx(rows[index].R);
    const y = sy(phasePortraitValue(rows[index], key));
    if (![x, y, angle].every(Number.isFinite)) return;
    ctx.save();
    ctx.fillStyle = colorWithAlpha(color, 0.96);
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function phasePortraitValue(row, key) {
    return row[key];
  }
  function drawPhasePortraitLegend(ctx, plot) {
    ctx.save();
    const y = plot.top + 14;
    let x = plot.left + 12;
    [
      { fragments: [{ text: "H", color: COLORS.H, weight: 600 }], color: COLORS.H, dash: [] },
      { fragments: [{ text: "U", subscript: "c", color: COLORS.Uc, weight: 600 }], color: COLORS.Uc, dash: [8, 5] }
    ].forEach((item) => {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(item.dash);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 26, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const labelWidth = drawCanvasMathFragments(ctx, item.fragments, x + 34, y, { align: "left" });
      x += 52 + labelWidth;
    });
    ctx.restore();
  }
  function drawPhasePortraitCurrentMarkers(ctx, plot, xlim, ylim, rows = latestPhaseRows) {
    const row = rowAtCurrentClosedLoopPosition(rows);
    if (!row) return null;
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    drawReferenceMarker(ctx, sx(row.R), sy(row.H), COLORS.H, 5.6);
    drawReferenceMarker(ctx, sx(row.R), sy(row.Uc), COLORS.Uc, 5.6);
    return row;
  }
  function drawPhasePortraitPhaseLabel(ctx, plot) {
    const label = currentDisplayCoordinateLabel();
    ctx.save();
    ctx.font = "12px Inter, sans-serif";
    const width = ctx.measureText(label).width;
    const x = plot.left + plot.width - width - 30;
    const y = plot.top + 14;
    ctx.fillStyle = "rgba(5, 8, 20, 0.58)";
    ctx.fillRect(x - 21, y - 11, width + 30, 22);
    ctx.fillStyle = PHASE_MARKER_COLOR;
    ctx.strokeStyle = "#050814";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x - 10, y, 4.8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THEME.axisText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.restore();
  }
  function opacityColor(logOpacity, opacityRange, alpha = 1) {
    const stops = [
      { t: 0, r: 86, g: 105, b: 202 },
      { t: 0.28, r: 51, g: 145, b: 176 },
      { t: 0.54, r: 72, g: 173, b: 128 },
      { t: 0.78, r: 198, g: 171, b: 76 },
      { t: 1, r: 255, g: 220, b: 98 }
    ];
    const t = normalizedInRange(logOpacity, opacityRange);
    let start = stops[0];
    let end = stops[stops.length - 1];
    for (let index = 1; index < stops.length; index += 1) {
      if (t <= stops[index].t) {
        start = stops[index - 1];
        end = stops[index];
        break;
      }
    }
    const span = Math.max(1e-12, end.t - start.t);
    const local = clamp4((t - start.t) / span, 0, 1);
    const channel = (a, b) => Math.round(a + (b - a) * local);
    return `rgba(${channel(start.r, end.r)}, ${channel(start.g, end.g)}, ${channel(start.b, end.b)}, ${clamp4(alpha, 0, 1)})`;
  }
  function opacityContourSegment(value, xlim, ylim, parameters) {
    const a = -(parameters.n + parameters.s);
    const b = parameters.n;
    const points = [];
    const push = (x, y) => {
      if (!Number.isFinite(x + y)) return;
      if (x < xlim[0] - 1e-9 || x > xlim[1] + 1e-9 || y < ylim[0] - 1e-9 || y > ylim[1] + 1e-9) return;
      if (points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-7)) return;
      points.push({ x: clamp4(x, xlim[0], xlim[1]), y: clamp4(y, ylim[0], ylim[1]) });
    };
    if (Math.abs(b) > 1e-12) {
      xlim.forEach((x) => push(x, (value - a * x) / b));
    }
    if (Math.abs(a) > 1e-12) {
      ylim.forEach((y) => push((value - b * y) / a, y));
    }
    return points.length >= 2 ? points.slice(0, 2) : null;
  }
  function drawOpacityContours(ctx, plot, xlim, ylim, parameters, opacityRange, sx, sy) {
    if (!validRange(opacityRange)) return;
    const contourCount = 6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 9]);
    for (let index = 1; index <= contourCount; index += 1) {
      const fraction = index / (contourCount + 1);
      const value = opacityRange[0] + fraction * (opacityRange[1] - opacityRange[0]);
      const segment = opacityContourSegment(value, xlim, ylim, parameters);
      if (!segment) continue;
      ctx.strokeStyle = opacityColor(value, opacityRange, 0.22);
      ctx.beginPath();
      ctx.moveTo(sx(segment[0].x), sy(segment[0].y));
      ctx.lineTo(sx(segment[1].x), sy(segment[1].y));
      ctx.stroke();
    }
    ctx.restore();
  }
  function setOpacityColorbarDataset(canvas, opacityRange, currentLogOpacity) {
    canvas.dataset.opacityColorbar = "log10(kappa/kappa0)";
    canvas.dataset.opacityPalette = "blue-gold";
    canvas.dataset.opacityRange = `${fmtFixed(opacityRange[0], 3)},${fmtFixed(opacityRange[1], 3)}`;
    if (Number.isFinite(currentLogOpacity)) {
      canvas.dataset.opacityColorbarMarker = "current-phase";
      canvas.dataset.currentOpacity = fmtFixed(currentLogOpacity, 3);
    } else {
      delete canvas.dataset.opacityColorbarMarker;
      delete canvas.dataset.currentOpacity;
    }
  }
  function clearOpacityColorbarDataset(canvas) {
    delete canvas.dataset.opacityColorbar;
    delete canvas.dataset.opacityPalette;
    delete canvas.dataset.opacityRange;
    delete canvas.dataset.opacityColorbarMarker;
    delete canvas.dataset.currentOpacity;
  }
  function clearThermodynamicGridColorbar(canvas) {
    gridColorbarRegions.delete("tpOpacityCanvas");
    delete canvas.dataset.gridColorbar;
    delete canvas.dataset.gridColorbarKey;
    delete canvas.dataset.gridColorbarHit;
  }
  function drawOpacityColorbar(ctx, plot, opacityRange, canvas, currentLogOpacity) {
    const width = Math.min(138, Math.max(108, plot.width * 0.22));
    const height = 9;
    const left = plot.left + plot.width - width - 12;
    const top = plot.top + 12;
    const gradient = ctx.createLinearGradient(left, top, left + width, top);
    for (let index = 0; index <= 24; index += 1) {
      const fraction = index / 24;
      const value = opacityRange[0] + fraction * (opacityRange[1] - opacityRange[0]);
      gradient.addColorStop(fraction, opacityColor(value, opacityRange, 1));
    }
    ctx.save();
    ctx.fillStyle = "rgba(3, 7, 18, 0.42)";
    ctx.fillRect(left - 7, top - 7, width + 14, 42);
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = "rgba(238, 245, 255, 0.62)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, width, height);
    if (Number.isFinite(currentLogOpacity)) {
      const markerX = left + normalizedInRange(currentLogOpacity, opacityRange) * width;
      ctx.strokeStyle = "rgba(3, 7, 18, 0.9)";
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(markerX, top - 3);
      ctx.lineTo(markerX, top + height + 4);
      ctx.stroke();
      ctx.strokeStyle = PHASE_MARKER_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, top - 3);
      ctx.lineTo(markerX, top + height + 4);
      ctx.stroke();
    }
    ctx.font = "10.5px Inter, sans-serif";
    ctx.fillStyle = THEME.axisText;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(fmt(opacityRange[0], 2), left, top + height + 8);
    ctx.textAlign = "right";
    ctx.fillText(fmt(opacityRange[1], 2), left + width, top + height + 8);
    ctx.textAlign = "center";
    ctx.font = "600 10.5px Inter, sans-serif";
    ctx.fillText("log10 \u03BA/\u03BA0", left + width / 2, top + height + 23);
    ctx.restore();
    setOpacityColorbarDataset(canvas, opacityRange, currentLogOpacity);
  }
  function drawThermodynamicTrack(ctx, points, plot, xlim, ylim, opacityRange, width, alpha, sx, sy, color) {
    if (points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const x0 = sx(previous.logT);
      const y0 = sy(previous.logP);
      const x1 = sx(current.logT);
      const y1 = sy(current.logP);
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      if (width >= 2.2 && alpha > 0.7) {
        ctx.strokeStyle = "rgba(3, 7, 18, 0.72)";
        ctx.lineWidth = width + 2.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.strokeStyle = color || opacityColor((previous.logOpacity + current.logOpacity) / 2, opacityRange, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawThermodynamicCurrentMarker(ctx, plot, xlim, ylim, opacityRange, parameters, currentPoint) {
    const point = currentPoint === void 0 ? currentThermodynamicPoint(parameters) : currentPoint;
    if (!point) return;
    const sx = (x2) => plot.left + (x2 - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y2) => plot.top + plot.height - (y2 - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    const x = sx(point.logT);
    const y = sy(point.logP);
    if (![x, y].every(Number.isFinite)) return;
    ctx.save();
    ctx.shadowColor = opacityColor(point.logOpacity, opacityRange, 0.65);
    ctx.shadowBlur = 9;
    ctx.fillStyle = opacityColor(point.logOpacity, opacityRange, 1);
    ctx.strokeStyle = PHASE_MARKER_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, 5.8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function currentThermodynamicPoint(parameters) {
    const row = rowAtCurrentDisplayPosition(latestPhaseRows);
    return row ? thermodynamicPoint(row, parameters) : null;
  }
  function thermodynamicPlotBox(width, height) {
    return { left: 82, top: 24, width: width - 106, height: height - 88 };
  }
  function drawThermodynamicAxisLabels(ctx, plot) {
    drawCanvasMathFragments(
      ctx,
      [
        { text: "log10 ", color: THEME.axisText },
        { text: "T/T0", color: PHASE_MARKER_COLOR, weight: 600 }
      ],
      plot.left + plot.width / 2,
      plot.top + plot.height + 42
    );
    drawCanvasMathFragments(
      ctx,
      [
        { text: "log10 ", color: THEME.axisText },
        { text: "P/P0", color: COLORS.H, weight: 600 }
      ],
      22,
      plot.top + plot.height / 2,
      { rotate: -Math.PI / 2 }
    );
  }
  function drawThermodynamicStaticLayer(ctx, canvas, plot, xlim, ylim, opacityRange, parameters, tracks, options = {}) {
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    drawOpacityContours(ctx, plot, xlim, ylim, parameters, opacityRange, sx, sy);
    drawAxes(ctx, plot, xlim, ylim, "", "", THEME.axisText, THEME.axisText, 22);
    tracks.forEach((track) => drawThermodynamicTrack(ctx, track.points, plot, xlim, ylim, opacityRange, track.width, track.alpha, sx, sy, track.color));
    if (options.showOpacityColorbar ?? true) drawOpacityColorbar(ctx, plot, opacityRange, canvas, options.currentLogOpacity);
    canvas.dataset.opacityContours = "log10(kappa/kappa0)";
    delete canvas.dataset.opacityVectorField;
    drawThermodynamicAxisLabels(ctx, plot);
  }
  function thermodynamicGridStaticTracks() {
    const tracks = [];
    const backgroundStride = Math.max(1, Math.ceil(gridState.results.length / TP_OPACITY_BACKGROUND_MAX_MODELS));
    gridState.results.forEach((result, index) => {
      if (index % backgroundStride !== 0) return;
      const points = thermodynamicPointsForGridResult(result, TP_OPACITY_BACKGROUND_MAX_POINTS);
      if (points.length > 1) tracks.push({ points, width: 0.75, alpha: 0.16, color: gridResultColor(result, 0.16) });
    });
    gridPathResults().forEach((result) => {
      const points = thermodynamicPointsForGridResult(result, TP_OPACITY_PATH_MAX_POINTS);
      if (points.length > 1) tracks.push({ points, width: 1.35, alpha: 0.44, color: gridResultColor(result, 0.44) });
    });
    return tracks;
  }
  function thermodynamicGridBackdropKey(width, height, dpr, parameters) {
    const highlighted = gridState.heldResult || gridState.hoverResult;
    return [
      gridPathResultsCacheKey(),
      width.toFixed(1),
      height.toFixed(1),
      dpr.toFixed(3),
      parameters.n.toFixed(4),
      parameters.s.toFixed(4),
      highlighted?.id ?? "no-highlight"
    ].join("|");
  }
  function thermodynamicGridBackdrop(canvas, width, height, dpr) {
    const key = thermodynamicGridBackdropKey(width, height, dpr, latestPhaseParameters);
    if (thermodynamicGridBackdropCache?.key === key) return thermodynamicGridBackdropCache;
    const plot = thermodynamicPlotBox(width, height);
    const tracks = thermodynamicGridStaticTracks();
    const highlighted = gridState.heldResult || gridState.hoverResult;
    const highlightedPoints = highlighted ? thermodynamicPointsForGridResult(highlighted, TP_OPACITY_CURRENT_MAX_POINTS) : [];
    const allPoints = [
      ...tracks.flatMap((track) => track.points),
      ...highlightedPoints
    ];
    if (!allPoints.length) {
      thermodynamicGridBackdropCache = null;
      return null;
    }
    const xlim = range([...allPoints.map((point) => point.logT), 0], 0.14);
    const ylim = range([...allPoints.map((point) => point.logP), 0], 0.14);
    const opacityRange = range([...allPoints.map((point) => point.logOpacity), 0], 0.12);
    const cacheCanvas = document.createElement("canvas");
    cacheCanvas.width = Math.floor(width * dpr);
    cacheCanvas.height = Math.floor(height * dpr);
    const cacheCtx = cacheCanvas.getContext("2d");
    if (!cacheCtx) return null;
    cacheCtx.scale(dpr, dpr);
    cacheCtx.clearRect(0, 0, width, height);
    drawThermodynamicStaticLayer(cacheCtx, canvas, plot, xlim, ylim, opacityRange, latestPhaseParameters, tracks, { showOpacityColorbar: false });
    thermodynamicGridBackdropCache = {
      key,
      canvas: cacheCanvas,
      width,
      height,
      dpr,
      plot,
      xlim,
      ylim,
      opacityRange,
      staticTrackCount: tracks.length
    };
    return thermodynamicGridBackdropCache;
  }
  function drawThermodynamicPanel() {
    const canvas = document.getElementById("tpOpacityCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(360, rect.width || 720);
    const height = Math.max(260, rect.height || 300);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    canvas.dataset.tpOpacityMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.axisLabels = "log10(T/T0),log10(P/P0)";
    canvas.dataset.colorVariable = gridState.enabled ? "grid parameter" : "log10(kappa/kappa0)";
    if (gridState.enabled) {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
    } else if (latestDisplayWindow.mode === "time") {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    } else {
      canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
      delete canvas.dataset.currentTime;
    }
    if (gridState.enabled) {
      if (!gridState.results.length) {
        clearOpacityColorbarDataset(canvas);
        clearThermodynamicGridColorbar(canvas);
        delete canvas.dataset.opacityContours;
        delete canvas.dataset.opacityVectorField;
        canvas.dataset.tpOpacityTracks = "0";
        canvas.dataset.tpOpacityRows = "0";
        drawCanvasMessage(ctx, width, height, latestPhaseMessage || gridState.statusText || "phase unavailable");
        return;
      }
      const backdrop = thermodynamicGridBackdrop(canvas, width, height, dpr);
      if (!backdrop) {
        clearOpacityColorbarDataset(canvas);
        clearThermodynamicGridColorbar(canvas);
        delete canvas.dataset.opacityContours;
        delete canvas.dataset.opacityVectorField;
        canvas.dataset.tpOpacityTracks = "0";
        canvas.dataset.tpOpacityRows = "0";
        drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
        return;
      }
      ctx.drawImage(backdrop.canvas, 0, 0, width, height);
      clearOpacityColorbarDataset(canvas);
      canvas.dataset.opacityContours = "log10(kappa/kappa0)";
      delete canvas.dataset.opacityVectorField;
      drawGridColorbar(ctx, backdrop.plot, backdrop.xlim, backdrop.ylim, "tpOpacityCanvas");
      const sx = (x) => backdrop.plot.left + (x - backdrop.xlim[0]) / (backdrop.xlim[1] - backdrop.xlim[0]) * backdrop.plot.width;
      const sy = (y) => backdrop.plot.top + backdrop.plot.height - (y - backdrop.ylim[0]) / (backdrop.ylim[1] - backdrop.ylim[0]) * backdrop.plot.height;
      let dynamicTrackCount = 0;
      const currentGrid = currentGridResult();
      const highlighted = gridState.heldResult || gridState.hoverResult;
      if (highlighted && highlighted !== currentGrid) {
        const points = thermodynamicPointsForGridResult(highlighted, TP_OPACITY_CURRENT_MAX_POINTS);
        if (points.length > 1) {
          drawThermodynamicTrack(ctx, points, backdrop.plot, backdrop.xlim, backdrop.ylim, backdrop.opacityRange, 3.4, 0.92, sx, sy, gridResultColor(highlighted, 0.98));
          dynamicTrackCount += 1;
        }
      }
      const currentPoints2 = currentGrid ? thermodynamicPointsForGridResult(currentGrid, TP_OPACITY_CURRENT_MAX_POINTS) : [];
      if (currentPoints2.length > 1) {
        drawThermodynamicTrack(ctx, currentPoints2, backdrop.plot, backdrop.xlim, backdrop.ylim, backdrop.opacityRange, 3.1, 0.98, sx, sy, gridResultColor(currentGrid, 0.98));
        dynamicTrackCount += 1;
      }
      canvas.dataset.tpOpacityTracks = String(backdrop.staticTrackCount + dynamicTrackCount);
      canvas.dataset.tpOpacityRows = String(currentPoints2.length);
      return;
    }
    const loopRows = closedLoopPanelRows(latestPhaseRows);
    clearThermodynamicGridColorbar(canvas);
    const currentPoints = thermodynamicPoints(loopRows, latestPhaseParameters, 1400);
    const tracks = [];
    if (currentPoints.length > 1) tracks.push({ points: currentPoints, width: 2.8, alpha: 0.98 });
    const allPoints = tracks.flatMap((track) => track.points);
    canvas.dataset.tpOpacityTracks = String(tracks.length);
    canvas.dataset.tpOpacityRows = String(currentPoints.length);
    if (!allPoints.length) {
      clearOpacityColorbarDataset(canvas);
      delete canvas.dataset.opacityContours;
      delete canvas.dataset.opacityVectorField;
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
      return;
    }
    const xlim = range([...allPoints.map((point) => point.logT), 0], 0.14);
    const ylim = range([...allPoints.map((point) => point.logP), 0], 0.14);
    const opacityRange = range([...allPoints.map((point) => point.logOpacity), 0], 0.12);
    const plot = thermodynamicPlotBox(width, height);
    const currentLoopRow = rowAtCurrentClosedLoopPosition(loopRows);
    const currentPoint = currentLoopRow ? thermodynamicPoint(currentLoopRow, latestPhaseParameters) : null;
    drawThermodynamicStaticLayer(ctx, canvas, plot, xlim, ylim, opacityRange, latestPhaseParameters, tracks, {
      currentLogOpacity: currentPoint?.logOpacity,
      showOpacityColorbar: true
    });
    drawThermodynamicCurrentMarker(ctx, plot, xlim, ylim, opacityRange, latestPhaseParameters, currentPoint);
  }
  function drawPhasePortraitPanel() {
    const canvas = document.getElementById("phasePortraitCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(360, rect.width || 900);
    const height = Math.max(300, rect.height || 310);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const loopRows = closedLoopPanelRows(latestPhaseRows);
    canvas.dataset.phasePortraitMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.phasePortraitRows = String(loopRows.length);
    canvas.dataset.stellingwerfLabels = latestDisplayWindow.mode === "time" ? "R,H,U_c,current_time" : "R,H,U_c,current_phase";
    canvas.dataset.axisLabels = "radius R,state";
    if (!loopRows.length) {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
      return;
    }
    if (gridState.enabled) {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
    } else if (latestDisplayWindow.mode === "time") {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    } else {
      canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
      delete canvas.dataset.currentTime;
    }
    const rows = downsample(loopRows, 1400, ["R", "H", "Uc"]);
    const scaleRows = stableTimeVisualReferenceRows(rows);
    const xlim = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(scaleRows.map((row) => row.R), 1, 0.045, 0.08) : range(rows.map((row) => row.R), 0.08);
    const ylim = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange([...scaleRows.map((row) => row.H), ...scaleRows.map((row) => row.Uc)], 1, 0.05, 0.1) : range([...rows.map((row) => row.H), ...rows.map((row) => row.Uc)], 0.1);
    const plot = { left: 78, top: 28, width: width - 102, height: height - 88 };
    drawAxes(ctx, plot, xlim, ylim, "", "state", THEME.axisText, THEME.axisText, 22);
    drawCanvasMathFragments(
      ctx,
      [
        { text: "radius ", color: COLORS.R, weight: 600 },
        { text: "R", color: COLORS.R, weight: 600 }
      ],
      plot.left + plot.width / 2,
      plot.top + plot.height + 42
    );
    drawPhasePortraitCurve(ctx, plot, xlim, ylim, rows, "H", COLORS.H);
    drawPhasePortraitCurve(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, [8, 5]);
    drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "H", COLORS.H, 0.18);
    drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "H", COLORS.H, 0.62);
    drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, 0.3);
    drawPhasePortraitArrow(ctx, plot, xlim, ylim, rows, "Uc", COLORS.Uc, 0.74);
    if (!gridState.enabled) drawPhasePortraitCurrentMarkers(ctx, plot, xlim, ylim, rows);
    drawPhasePortraitLegend(ctx, plot);
    if (!gridState.enabled) drawPhasePortraitPhaseLabel(ctx, plot);
  }
  function drawStellingwerfReferencePanel() {
    drawStabilityMap();
    drawCepheidGuide();
    drawPhasePortraitPanel();
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
    if (!plotSeriesIsAvailable(plotId, key)) return false;
    if (convectiveResponseDisabled() && plotId === "lum" && key === "L") return true;
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
      case "not_enough_maxima":
        return "phase unavailable: fewer than three luminosity maxima";
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
      minSeparation: guidedMinSeparationFromPeriod(rows, linearDynamicPeriod(state)),
      selection: state.phaseMode === "final" ? "last" : "first",
      anchor: phaseAnchor
    });
  }
  function shouldUseStableDampingTimeWindow(phase, stability) {
    return state.phaseMode === "final" && stability.pulsational.stable && latestResult.message !== "limit_cycle" && phase.reason === "ok" && Boolean(phase.period) && latestResult.message !== "runaway" && latestResult.message !== "runaway_trend";
  }
  function buildCurrentDisplayWindow(rows, phase, gridResult, stability, phaseMessage) {
    if (gridResult) {
      return {
        ...buildPhaseDisplayWindow({ ...phase, reason: "ok", rows: gridResult.phaseRows, period: gridResult.period }, phaseMessage),
        reason: "phase"
      };
    }
    if (gridState.enabled) return buildPhaseDisplayWindow(phase, phaseMessage);
    if (isTimeWindowReason(latestResult.message)) {
      return buildTimeDisplayWindow(rows, latestResult.message, timeWindowMessage(latestResult.message));
    }
    if (!gridState.enabled && shouldUseStableDampingTimeWindow(phase, stability)) {
      return buildTimeDisplayWindow(rows, "equilibrium", "time window: stable damping");
    }
    return buildPhaseDisplayWindow(phase, phaseMessage);
  }
  function timeWindowMessage(reason) {
    switch (reason) {
      case "equilibrium":
        return "time window: stable equilibrium";
      case "runaway":
        return "time window: dynamic runaway";
      case "runaway_trend":
        return "time window: runaway trend";
      default:
        return "time window";
    }
  }
  function syncAnimationPositionToDisplayWindow() {
    const end = displayAnimationEnd(latestDisplayWindow);
    if (end <= 0) {
      currentAnimationPhase = 0;
      modelAnimationStartTime = null;
      return;
    }
    const clamped = clamp4(currentAnimationPhase, 0, end);
    if (clamped !== currentAnimationPhase) modelAnimationStartTime = null;
    currentAnimationPhase = clamped === end ? 0 : clamped;
  }
  function displayWindowForRows(rows) {
    return { ...latestDisplayWindow, rows };
  }
  function rowAtCurrentDisplayPosition(rows = latestPhaseRows) {
    return rowAtDisplayPosition(displayWindowForRows(rows), currentAnimationPhase);
  }
  function closedLoopPanelRows(rows = latestPhaseRows) {
    if (latestDisplayWindow.mode === "phase") {
      const cycle = phaseWindowRows(rows, 0, 1, true);
      if (cycle.length > 2) return cycle;
    }
    return [...rows];
  }
  function rowAtCurrentClosedLoopPosition(rows) {
    if (latestDisplayWindow.mode !== "phase") return rowAtCurrentDisplayPosition(rows);
    const cycleWindow = {
      mode: "phase",
      reason: "phase",
      rows,
      xlim: [0, 1],
      period: latestDisplayWindow.period
    };
    return rowAtDisplayPosition(cycleWindow, phaseModOne(currentAnimationPhase));
  }
  function currentDisplayCoordinateLabel() {
    if (latestDisplayWindow.mode === "time") {
      return `time \u03C4 = ${fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 2)}`;
    }
    return `phase = ${fmtFixed(phaseModOne(currentAnimationPhase), 2)}`;
  }
  function phaseModOne(phase) {
    return (phase % 1 + 1) % 1;
  }
  function updatePhaseAnchorControlAvailability() {
    const timeMode = latestDisplayWindow.mode === "time";
    document.querySelectorAll(".phase-anchor-control").forEach((control) => {
      control.hidden = timeMode;
      control.style.display = timeMode ? "none" : "";
      control.querySelectorAll("button").forEach((button) => {
        button.disabled = timeMode;
      });
    });
  }
  function timeDomain2(rows) {
    if (!rows.length) return [0, 1];
    const first = rows[0].tau;
    const last = rows[rows.length - 1].tau;
    return first === last ? range([first, last], 0.02) : [first, last];
  }
  function integrationTimeRange(rows) {
    const finalTau = rows.at(-1)?.tau;
    const stoppedEarly = state.runUntilStable && Number.isFinite(finalTau) && finalTau < state.tEnd - Math.max(1e-9, state.tEnd * 1e-9);
    return [0, Math.max(stoppedEarly ? finalTau : state.tEnd, Number.EPSILON)];
  }
  function clearStalePlotView(plotId, rows) {
    const view = plotViews[plotId];
    const domain = timeDomain2(rows);
    if (view.xlim && (view.xlim[1] < domain[0] || view.xlim[0] > domain[1])) view.xlim = void 0;
    if (view.xlim && !validRange(view.xlim)) view.xlim = void 0;
    if (view.ylim && !validRange(view.ylim)) view.ylim = void 0;
  }
  function visibleRows(plotId, key, rows) {
    return seriesIsVisible(plotId, key) ? rows : [];
  }
  function rawRange(values) {
    let min = Infinity;
    let max = -Infinity;
    values.forEach((value) => {
      if (!Number.isFinite(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [0, 1];
  }
  function normalizedInRange(value, valueRange) {
    const span = valueRange[1] - valueRange[0];
    if (!Number.isFinite(value) || span <= 1e-12) return clamp4(value, 0, 1);
    return clamp4((value - valueRange[0]) / span, 0, 1);
  }
  function scaledRgb(color, scale) {
    return {
      r: clamp4(Math.round(color.r * scale), 0, 255),
      g: clamp4(Math.round(color.g * scale), 0, 255),
      b: clamp4(Math.round(color.b * scale), 0, 255)
    };
  }
  function phaseMarker() {
    if (gridState.enabled) return void 0;
    return latestPhaseRows.length ? { x: displayMarkerX(latestDisplayWindow, currentAnimationPhase), color: PHASE_MARKER_COLOR } : void 0;
  }
  function syncPhaseCanvasState() {
    PHASE_SCRUB_CANVAS_IDS.forEach((canvasId) => {
      const canvas = document.getElementById(canvasId);
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const scrubEnabled = latestDisplayWindow.mode === "phase" && latestPhaseRows.length > 0 && !gridState.enabled;
      canvas.classList.toggle("phase-scrub-enabled", scrubEnabled);
      canvas.dataset.displayMode = latestDisplayWindow.mode;
      if (gridState.enabled) {
        delete canvas.dataset.currentPhase;
        delete canvas.dataset.currentTime;
      } else if (latestPhaseRows.length && latestDisplayWindow.mode === "phase") {
        canvas.dataset.currentPhase = fmtFixed(currentAnimationPhase, 3);
        delete canvas.dataset.currentTime;
      } else if (latestPhaseRows.length) {
        canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
        delete canvas.dataset.currentPhase;
      } else {
        delete canvas.dataset.currentPhase;
        delete canvas.dataset.currentTime;
      }
      if (activePhaseScrub?.canvasId === canvasId) canvas.dataset.phaseScrubbing = "true";
      else delete canvas.dataset.phaseScrubbing;
      if (!gridState.enabled && activePhaseHoverCanvasId === canvasId) canvas.dataset.phaseHovering = "true";
      else delete canvas.dataset.phaseHovering;
    });
    updatePhaseAnchorControlAvailability();
  }
  function extremaRow(rows, value, pick) {
    let selected = null;
    let selectedValue = pick === "min" ? Infinity : -Infinity;
    rows.forEach((row) => {
      const current = value(row);
      if (current === null || !Number.isFinite(current)) return;
      if (pick === "min" && current < selectedValue || pick === "max" && current > selectedValue) {
        selected = row;
        selectedValue = current;
      }
    });
    return selected;
  }
  function phaseWindowRows(rows, lower, upper, includeUpper) {
    return rows.filter(
      (row) => row.tau >= lower && (includeUpper ? row.tau <= upper : row.tau < upper)
    );
  }
  function phasePlotAnnotations(rows) {
    const annotations = [];
    const add = (kind, row, color) => {
      if (row) annotations.push({ kind, row, color });
    };
    [
      phaseWindowRows(rows, 0, 1, false),
      phaseWindowRows(rows, 1, 2, true)
    ].forEach((windowRows) => {
      add("maxL", extremaRow(windowRows, (row) => row.L, "max"), COLORS.L);
      add("minL", extremaRow(windowRows, (row) => row.L, "min"), COLORS.L);
      add("maxR", extremaRow(windowRows, (row) => row.R, "max"), COLORS.R);
      add("minR", extremaRow(windowRows, (row) => row.R, "min"), COLORS.R);
      add("maxV", extremaRow(windowRows, (row) => row.V, "max"), POSITIVE_VELOCITY_COLOR);
      add("minV", extremaRow(windowRows, (row) => row.V, "min"), NEGATIVE_VELOCITY_COLOR);
      add("maxTeff", extremaRow(windowRows, effectiveTemperatureProxy, "max"), PHASE_MARKER_COLOR);
      add("minTeff", extremaRow(windowRows, effectiveTemperatureProxy, "min"), PHASE_MARKER_COLOR);
    });
    return annotations;
  }
  function drawPhaseAnnotations(ctx, plot, xlim, ylim, canvasId, quantity) {
    const canvas = document.getElementById(canvasId);
    if (canvas instanceof HTMLCanvasElement) {
      canvas.dataset.annotations = phaseAnnotationsVisible ? "on" : "off";
      canvas.dataset.annotationCount = "0";
    }
    if (!phaseAnnotationsVisible || !latestPhaseRows.length) return;
    const annotations = phasePlotAnnotations(latestPhaseRows);
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    let drawn = 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    annotations.forEach((annotation) => {
      const x = annotation.row.tau;
      const y = annotation.row[quantity];
      if (!Number.isFinite(x + y) || x < xlim[0] || x > xlim[1] || y < ylim[0] || y > ylim[1]) return;
      drawPhaseAnnotationSymbol(ctx, sx(x), sy(y), annotation);
      drawn += 1;
    });
    ctx.restore();
    if (canvas instanceof HTMLCanvasElement) canvas.dataset.annotationCount = String(drawn);
  }
  function drawPhaseAnnotationSymbol(ctx, x, y, annotation) {
    ctx.save();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = "#050814";
    ctx.fillStyle = annotation.color;
    if (annotation.kind === "maxTeff" || annotation.kind === "minTeff") {
      ctx.font = "700 18px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const symbol = annotation.kind === "maxTeff" ? "\u2191" : "\u2193";
      ctx.lineWidth = 2.8;
      ctx.strokeText(symbol, x, y);
      ctx.fillText(symbol, x, y);
    } else if (annotation.kind === "maxR" || annotation.kind === "minR") {
      const size = annotation.kind === "maxR" ? 4.6 : 3.1;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (annotation.kind === "maxV" || annotation.kind === "minV") {
      const size = annotation.kind === "maxV" ? 5.8 : 3.8;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const size = annotation.kind === "maxL" ? 5.8 : 3.4;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawPhasePlotOverlays(ctx, plot, xlim, ylim, canvasId) {
    if (canvasId === "lightCanvas") drawPhaseAnnotations(ctx, plot, xlim, ylim, canvasId, "L");
    if (canvasId === "velocityCanvas") drawPhaseAnnotations(ctx, plot, xlim, ylim, canvasId, "V");
    drawGridColorbar(ctx, plot, xlim, ylim, canvasId);
  }
  function drawPhasePlots() {
    updatePhaseAnnotationControls();
    const marker = phaseMarker();
    drawSeries("lightCanvas", gridPhaseSeries("L", COLORS.L, latestPhaseSample), {
      xlabel: latestPhasePeriodLabel,
      ylabel: "luminosity L",
      ylabelColor: COLORS.L,
      xlim: latestDisplayWindow.xlim,
      ylim: latestPhaseSample.length || gridState.results.length ? void 0 : [0, 1],
      minimumYlim: [0.99, 1.01],
      message: latestPhaseMessage,
      phaseMarker: marker,
      afterDraw: drawPhasePlotOverlays
    });
    drawSeries("velocityCanvas", gridPhaseSeries("V", COLORS.V, latestPhaseSample), {
      xlabel: latestPhasePeriodLabel,
      ylabel: "radial velocity V",
      ylabelColor: COLORS.V,
      xlim: latestDisplayWindow.xlim,
      ylim: latestPhaseSample.length || gridState.results.length ? void 0 : [0, 1],
      minimumYlim: [-0.01, 0.01],
      message: latestPhaseMessage,
      phaseMarker: marker,
      afterDraw: drawPhasePlotOverlays
    });
    if (sonificationSource === "pressure") {
      drawSeries("pressureCanvas", [
        { label: "P", color: COLORS.H, rows: latestPhaseSample, x: (row) => row.tau, y: (row) => acousticPressureSignal(row, latestPhaseParameters) }
      ], {
        xlabel: latestPhasePeriodLabel,
        ylabel: "pressure",
        ylabelColor: COLORS.H,
        xlim: latestDisplayWindow.xlim,
        ylim: latestPhaseSample.length ? void 0 : [0, 1],
        message: latestPhaseMessage,
        phaseMarker: marker
      });
    }
    syncPhaseCanvasState();
  }
  function drawCanvasMessage(ctx, width, height, message) {
    ctx.fillStyle = THEME.axisText;
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
  }
  function drawAnnularSegment(ctx, centerX, centerY, outerRadius, innerRadius, startAngle, endAngle, fillStyle) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    if (innerRadius > 0) {
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    } else {
      ctx.lineTo(centerX, centerY);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  function maximumPhaseRadius(rows) {
    return Math.max(1.2, ...rows.map((row) => row.R).filter((value) => Number.isFinite(value) && value > 0));
  }
  function drawGuideCircle(ctx, centerX, centerY, radius, strokeStyle, lineDash = []) {
    if (radius <= 0) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.setLineDash(lineDash);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawModelReferenceGuides(ctx, rows, centerX, centerY, radiusScale) {
    const equilibriumGeometry = shellGeometryFor(1, mAt(1, state));
    const [minRadius, maxRadius] = rawRange(rows.map((row) => row.R));
    const hasRadiusRange = rows.length > 1 && maxRadius - minRadius > 1e-4;
    if (hasRadiusRange) {
      drawGuideCircle(ctx, centerX, centerY, minRadius * radiusScale, colorWithAlpha(COLORS.R, 0.18), [3, 5]);
      drawGuideCircle(ctx, centerX, centerY, maxRadius * radiusScale, colorWithAlpha(COLORS.R, 0.24), [7, 5]);
    }
    drawGuideCircle(ctx, centerX, centerY, radiusScale, "rgba(82, 100, 137, 0.42)");
    const innerReferenceRadius = equilibriumGeometry.innerRadius * radiusScale;
    if (innerReferenceRadius > 1) {
      drawGuideCircle(ctx, centerX, centerY, innerReferenceRadius, "rgba(255, 184, 108, 0.34)", [4, 4]);
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255, 184, 108, 0.36)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  function measureLuminosityLabelSymbol(ctx, symbol) {
    ctx.font = "700 13px Inter, sans-serif";
    const baseWidth = ctx.measureText(symbol.base).width;
    if (!symbol.subscript) return baseWidth;
    ctx.font = "700 9px Inter, sans-serif";
    return baseWidth + 1 + ctx.measureText(symbol.subscript).width;
  }
  function drawLuminosityLabelSymbol(ctx, symbol, x, y) {
    ctx.textAlign = "left";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.strokeText(symbol.base, x, y + 4);
    ctx.fillText(symbol.base, x, y + 4);
    const baseWidth = ctx.measureText(symbol.base).width;
    if (!symbol.subscript) return baseWidth;
    ctx.font = "700 9px Inter, sans-serif";
    ctx.strokeText(symbol.subscript, x + baseWidth + 1, y + 8);
    ctx.fillText(symbol.subscript, x + baseWidth + 1, y + 8);
    return baseWidth + 1 + ctx.measureText(symbol.subscript).width;
  }
  function drawLuminosityArcLabel(ctx, x, y, color, gammaSubscript, luminositySubscript) {
    const symbols = gammaSubscript ? [
      { base: "\u03B3", subscript: gammaSubscript },
      { base: "L", subscript: luminositySubscript }
    ] : [{ base: "L", subscript: luminositySubscript }];
    const gap = gammaSubscript ? 3 : 0;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(6, 11, 24, 0.92)";
    ctx.lineWidth = 4;
    ctx.fillStyle = colorWithAlpha(color, 0.98);
    const widths = symbols.map((symbol) => measureLuminosityLabelSymbol(ctx, symbol));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (symbols.length - 1);
    let cursor = x - totalWidth / 2;
    symbols.forEach((symbol, index) => {
      cursor += drawLuminosityLabelSymbol(ctx, symbol, cursor, y);
      if (index < symbols.length - 1) cursor += gap;
    });
    ctx.restore();
  }
  function drawConvectionArcs(ctx, row, centerX, centerY, radiusScale) {
    const equilibriumGeometry = shellGeometryFor(1, mAt(1, state));
    const equilibriumThickness = Math.max(3, equilibriumGeometry.thickness * radiusScale);
    const radius = radiusScale;
    const segment = Math.PI / 2 / 3;
    const gap = 0.018;
    const arcs = [
      { value: row.Lc, color: COLORS.Lc, luminositySubscript: "c" },
      { value: row.L, color: COLORS.L },
      { value: row.Lr, color: COLORS.Lr, luminositySubscript: "r" }
    ];
    const arcWidths = arcs.map((arc) => clamp4(equilibriumThickness * Math.max(0, arc.value), 2, equilibriumThickness * 3));
    const fixedLabelOffset = Math.max(18, equilibriumThickness * 0.75 + 10);
    const labelRadius = Math.min(
      radius + fixedLabelOffset,
      Math.max(0, Math.min(centerX, centerY) - 28)
    );
    ctx.save();
    ctx.lineCap = "butt";
    arcs.forEach((arc, index) => {
      const startAngle = index * segment + gap;
      const endAngle = (index + 1) * segment - gap;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.strokeStyle = colorWithAlpha(arc.color, 0.96);
      ctx.lineWidth = arcWidths[index];
      ctx.stroke();
    });
    arcs.forEach((arc, index) => {
      const angle = (index + 0.5) * segment;
      drawLuminosityArcLabel(
        ctx,
        centerX + Math.cos(angle) * labelRadius,
        centerY + Math.sin(angle) * labelRadius,
        arc.color,
        void 0,
        arc.luminositySubscript
      );
    });
    ctx.restore();
  }
  function pressureSupport(row, parameters) {
    if (!Number.isFinite(row.R + row.H) || row.R <= 0) return NaN;
    const { q } = derivedPowers(row.R, parameters);
    const value = row.H / row.R ** q;
    return Number.isFinite(value) ? value : NaN;
  }
  function convectiveVelocityTarget(row, parameters) {
    if (!Number.isFinite(row.R + row.H + row.V) || row.R <= 0) return NaN;
    const { d } = derivedPowers(row.R, parameters);
    const driver = parameters.driver === "h" ? Math.sqrt(Math.max(0, row.H)) : Math.sqrt(Math.abs(row.V));
    const value = row.R ** -d * driver;
    return Number.isFinite(value) ? value : NaN;
  }
  function heatEngineTerms(row, parameters) {
    if (!Number.isFinite(row.R + row.V + row.H + row.Uc) || row.R <= 0 || row.H <= 0) return null;
    const powers = derivedPowers(row.R, parameters);
    const pressureForce = row.H / row.R ** powers.q;
    const gravityForce = 1 / row.R ** 2;
    const dampingAcceleration = -parameters.cq * row.V ** 3;
    const source = baseLuminosity(row, parameters);
    const heatScale = parameters.zeta * row.R ** (powers.m * (parameters.gamma1 - 1));
    const radiativeLeak = row.Lr;
    const convectiveLeak = row.Lc;
    const convectiveTarget = convectiveVelocityTarget(row, parameters);
    const terms = {
      q: powers.q,
      pressureForce,
      gravityForce,
      dampingAcceleration,
      acceleration: pressureForce - gravityForce + dampingAcceleration,
      pressurePower: row.V * pressureForce,
      gravityPower: -row.V * gravityForce,
      dampingPower: -parameters.cq * row.V ** 4,
      mechanicalPower: row.V * (pressureForce - gravityForce + dampingAcceleration),
      source,
      radiativeLeak,
      convectiveLeak,
      heatNet: heatScale * (source - radiativeLeak - convectiveLeak),
      convectiveTarget,
      convectiveLag: convectiveTarget - row.Uc
    };
    return Object.values(terms).every(Number.isFinite) ? terms : null;
  }
  function heatEngineCycleRows(rows) {
    return closedLoopPanelRows(rows);
  }
  function radiusExtremaForWork(rows) {
    const extrema = [];
    for (let index = 1; index < rows.length - 1; index += 1) {
      const previous = rows[index - 1].R;
      const current = rows[index].R;
      const next = rows[index + 1].R;
      if (!Number.isFinite(previous + current + next)) continue;
      if (current >= previous && current > next) extrema.push({ index, kind: "max" });
      else if (current <= previous && current < next) extrema.push({ index, kind: "min" });
    }
    return extrema;
  }
  function radiusExtremaWithEndpointsForWork(rows) {
    const extrema = radiusExtremaForWork(rows);
    if (rows.length < 2) return extrema;
    const firstKind = rows[0].R <= rows[1].R ? "min" : "max";
    const lastIndex = rows.length - 1;
    const lastKind = rows[lastIndex].R <= rows[lastIndex - 1].R ? "min" : "max";
    return [
      { index: 0, kind: firstKind },
      ...extrema,
      { index: lastIndex, kind: lastKind }
    ];
  }
  function completeRadiusCycleRowsForWork(rows) {
    const extrema = radiusExtremaForWork(rows);
    if (extrema.length < 3) return [];
    let best = null;
    for (let startOrder = 0; startOrder < extrema.length - 2; startOrder += 1) {
      for (let endOrder = extrema.length - 1; endOrder >= startOrder + 2; endOrder -= 1) {
        if (extrema[endOrder].kind !== extrema[startOrder].kind) continue;
        const start = extrema[startOrder].index;
        const end = extrema[endOrder].index;
        const span = end - start;
        if (span > 1 && (!best || span > best.span)) best = { start, end, span };
        break;
      }
    }
    return best ? rows.slice(best.start, best.end + 1) : [];
  }
  function samePhaseCycleSegmentsForWork(rows) {
    const extrema = radiusExtremaWithEndpointsForWork(rows);
    const segments = [];
    for (let extremaIndex = 0; extremaIndex < extrema.length - 2; extremaIndex += 2) {
      const start = extrema[extremaIndex];
      const end = extrema[extremaIndex + 2];
      if (start.kind !== end.kind || end.index - start.index < 2) continue;
      segments.push(rows.slice(start.index, end.index + 1));
    }
    return segments;
  }
  function heatEngineWorkRows(rows) {
    const selectedRows = heatEngineCycleRows(rows);
    if (latestDisplayWindow.mode !== "time") {
      return { selectedRows, integrationRows: selectedRows, scope: "cycle" };
    }
    const completeCycleRows = completeRadiusCycleRowsForWork(selectedRows);
    if (completeCycleRows.length > 2) {
      return { selectedRows, integrationRows: completeCycleRows, scope: "cycles" };
    }
    return { selectedRows, integrationRows: selectedRows, scope: "window" };
  }
  function integrateHeatEngineWorkTerms(rows, parameters, closePressureLoop) {
    let pressure = 0;
    let gravity = 0;
    let damping = 0;
    const phaseTimeScale = latestDisplayWindow.mode === "phase" && latestDisplayWindow.period ? latestDisplayWindow.period : 1;
    for (let index = 1; index < rows.length; index += 1) {
      const left = rows[index - 1];
      const right = rows[index];
      const leftForce = pressureSupport(left, parameters);
      const rightForce = pressureSupport(right, parameters);
      const deltaR = right.R - left.R;
      if (Number.isFinite(leftForce + rightForce + deltaR)) {
        pressure += 0.5 * (leftForce + rightForce) * deltaR;
      }
      const dt = (right.tau - left.tau) * phaseTimeScale;
      if (!Number.isFinite(dt) || dt <= 0) continue;
      const leftGravityPower = -left.V / left.R ** 2;
      const rightGravityPower = -right.V / right.R ** 2;
      const leftDampingPower = -parameters.cq * left.V ** 4;
      const rightDampingPower = -parameters.cq * right.V ** 4;
      if (Number.isFinite(leftGravityPower + rightGravityPower)) {
        gravity += 0.5 * (leftGravityPower + rightGravityPower) * dt;
      }
      if (Number.isFinite(leftDampingPower + rightDampingPower)) {
        damping += 0.5 * (leftDampingPower + rightDampingPower) * dt;
      }
    }
    if (closePressureLoop && rows.length > 1) {
      const first = rows[0];
      const last = rows[rows.length - 1];
      const firstForce = pressureSupport(first, parameters);
      const lastForce = pressureSupport(last, parameters);
      const closingDeltaR = first.R - last.R;
      if (Number.isFinite(firstForce + lastForce + closingDeltaR)) {
        pressure += 0.5 * (firstForce + lastForce) * closingDeltaR;
      }
    }
    return { pressure, gravity, damping };
  }
  function heatEngineCycleWork(rows, parameters) {
    const segments = latestDisplayWindow.mode === "time" ? samePhaseCycleSegmentsForWork(rows) : [];
    const workSegments = segments.length ? segments : [rows];
    let pressure = 0;
    let gravity = 0;
    let damping = 0;
    workSegments.forEach((segment) => {
      const terms = integrateHeatEngineWorkTerms(segment, parameters, true);
      pressure += terms.pressure;
      gravity += terms.gravity;
      damping += terms.damping;
    });
    const net = pressure + damping;
    const mechanicalNet = net + gravity;
    return {
      pressure,
      gravity,
      damping,
      net,
      mechanicalNet,
      pressureDampingRatio: Math.abs(damping) > 1e-12 ? pressure / Math.abs(damping) : null
    };
  }
  function heatEngineRegime(work, rows) {
    if (latestResult.message === "equilibrium") return "equilibrium";
    if (latestResult.message === "runaway" || latestResult.message === "runaway_trend") return "runaway";
    const radiusRange = rawRange(rows.map((row) => row.R));
    const velocityMax = Math.max(...rows.map((row) => Math.abs(row.V)).filter(Number.isFinite), 0);
    if (radiusRange[1] - radiusRange[0] < 1e-4 && velocityMax < 1e-4) return "equilibrium";
    const scale = Math.max(Math.abs(work.pressure), Math.abs(work.damping), 1e-8);
    if (Math.abs(work.net) <= scale * 0.08) return "limit cycle";
    return work.net > 0 ? "driving" : "damped";
  }
  function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawHeatEngineLabel(ctx, text, x, y, color = THEME.axisText, align = "center", size = 11, weight = 700) {
    ctx.save();
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(5, 8, 20, 0.9)";
    ctx.lineWidth = 4;
    ctx.fillStyle = color;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawHeatEngineMathLabel(ctx, fragments, x, y, options = {}) {
    drawCanvasMathFragments(ctx, fragments, x, y, {
      fontSize: options.fontSize ?? 11,
      subscriptSize: options.subscriptSize,
      align: options.align,
      color: options.color,
      rotate: options.rotate,
      strokeColor: options.strokeColor || "rgba(5, 8, 20, 0.9)",
      strokeWidth: options.strokeWidth ?? 4
    });
  }
  function drawHeatEngineCanvasLabel(ctx, label, x, y, color = THEME.axisText, align = "center", size = 11, weight = 700) {
    if (typeof label === "string") {
      drawHeatEngineLabel(ctx, label, x, y, color, align, size, weight);
      return;
    }
    drawHeatEngineMathLabel(
      ctx,
      label.map((fragment) => ({
        ...fragment,
        color: fragment.color || color,
        weight: fragment.weight || weight
      })),
      x,
      y,
      { align, fontSize: size }
    );
  }
  function heatEngineSignedValue(value, digits = 3) {
    if (!Number.isFinite(value)) return "n/a";
    const formatted = fmt(value, digits);
    return value > 0 ? `+${formatted}` : formatted;
  }
  function heatEngineMaxMagnitude(values) {
    return Math.max(
      1e-9,
      ...values.map((item) => Math.abs(item)).filter(Number.isFinite)
    );
  }
  function heatEngineNormalizedMagnitude(value, maxMagnitude) {
    return clamp4(Math.abs(value) / maxMagnitude, 0, 1);
  }
  function heatEngineCompressibilityLevel(compressibility) {
    const value = Math.max(0, compressibility);
    const low = Math.log1p(1);
    const high = Math.log1p(24);
    return clamp4((Math.log1p(value) - low) / (high - low), 0, 1);
  }
  function heatEngineRegimeColor(regime) {
    if (regime === "driving") return COLORS.Lc;
    if (regime === "damped") return NEGATIVE_VELOCITY_COLOR;
    if (regime === "runaway") return sourceLuminosityColor();
    if (regime === "equilibrium") return THEME.axisText;
    return PHASE_MARKER_COLOR;
  }
  function drawHeatEngineArrow(ctx, x1, y1, x2, y2, color, width = 2.2, label, labelOffset = 12, headSize = 8) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    const head = Math.min(headSize, Math.max(0.8, length * 0.42), length * 0.8);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * head, y2 - uy * head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * head - uy * head * 0.52, y2 - uy * head + ux * head * 0.52);
    ctx.lineTo(x2 - ux * head + uy * head * 0.52, y2 - uy * head - ux * head * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      const lx = (x1 + x2) / 2 - uy * labelOffset;
      const ly = (y1 + y2) / 2 + ux * labelOffset;
      drawHeatEngineCanvasLabel(ctx, label, lx, ly, color);
    }
  }
  function drawHeatEngineArrowHead(ctx, x1, y1, x2, y2, color, size = 8) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * size - uy * size * 0.55, y2 - uy * size + ux * size * 0.55);
    ctx.lineTo(x2 - ux * size + uy * size * 0.55, y2 - uy * size - ux * size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawHeatEngineCompressibilitySpring(ctx, x, topY, bottomY, compressibility) {
    const span = bottomY - topY;
    if (!Number.isFinite(span + compressibility) || span <= 7) return;
    const stiffness = heatEngineCompressibilityLevel(compressibility);
    const lead = clamp4(span * 0.08, 3, 8);
    const coilTop = topY + lead;
    const coilBottom = bottomY - lead;
    const coilSpan = Math.max(1, coilBottom - coilTop);
    const targetHalfWaves = Math.round(8 + stiffness * 18);
    const halfWaves = Math.max(4, Math.min(targetHalfWaves, Math.floor(coilSpan / 2.2)));
    const amplitude = 6.2 + stiffness * 2.4;
    const alpha = 0.2 + stiffness * 0.18;
    ctx.save();
    ctx.strokeStyle = `rgba(210, 218, 232, ${alpha})`;
    ctx.shadowColor = `rgba(210, 218, 232, ${alpha * 0.6})`;
    ctx.shadowBlur = 2 + stiffness * 4;
    ctx.lineWidth = 1.05 + stiffness * 1.15;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, coilTop);
    for (let wave = 1; wave <= halfWaves; wave += 1) {
      const y = coilTop + coilSpan * wave / halfWaves;
      const side = wave % 2 === 0 ? -1 : 1;
      ctx.lineTo(x + amplitude * side, y);
    }
    ctx.lineTo(x, coilBottom);
    ctx.lineTo(x, bottomY);
    ctx.stroke();
    ctx.restore();
  }
  function drawHeatEnginePistonCausal(ctx, row, rows, terms, chamber, parameters) {
    const right = chamber.left + chamber.width;
    const bottom = chamber.top + chamber.height;
    const centerX = chamber.left + chamber.width / 2;
    const scaleRows = stableTimeVisualReferenceRows(rows);
    const radiusRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(scaleRows.map((item) => item.R), 1, 0.045, 0.08) : range(rows.map((item) => item.R), 0.08);
    const hRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(scaleRows.map((item) => item.H), 1, 0.045, 0.08) : range(rows.map((item) => item.H), 0.08);
    const pressureValues = scaleRows.map((item) => pressureSupport(item, parameters));
    const gravityValues = scaleRows.map((item) => 1 / item.R ** 2);
    const dampingValues = scaleRows.map((item) => parameters.cq * item.V ** 3);
    const sourceValues = scaleRows.map((item) => baseLuminosity(item, parameters));
    const radiativeValues = scaleRows.map((item) => item.Lr);
    const convectiveValues = scaleRows.map((item) => item.Lc);
    const forceMagnitudeMax = heatEngineMaxMagnitude([
      ...pressureValues,
      ...gravityValues,
      ...dampingValues,
      terms.pressureForce,
      terms.gravityForce,
      terms.dampingAcceleration
    ]);
    const heatFlowMagnitudeMax = heatEngineMaxMagnitude([
      ...sourceValues,
      ...radiativeValues,
      ...convectiveValues,
      terms.source,
      terms.radiativeLeak,
      terms.convectiveLeak
    ]);
    const forceMagnitude = (value) => heatEngineNormalizedMagnitude(value, forceMagnitudeMax);
    const forceArrowLength = (value) => heatEngineNormalizedMagnitude(value, forceMagnitudeMax) * 61;
    const heatFlowMagnitude = (value) => heatEngineNormalizedMagnitude(value, heatFlowMagnitudeMax);
    const luminosityRange = rawRange([
      ...scaleRows.map((item) => item.L),
      ...radiativeValues,
      ...convectiveValues,
      row.L,
      terms.radiativeLeak,
      terms.convectiveLeak
    ]);
    const luminosityLevel = (value) => normalizedInRange(value, luminosityRange);
    const travelTop = chamber.top + 18;
    const travelBottom = bottom - 88;
    const pistonY = travelBottom - normalizedInRange(row.R, radiusRange) * Math.max(1, travelBottom - travelTop);
    const pistonHeight = 6;
    const gasTop = pistonY + pistonHeight / 2;
    const hLevel = normalizedInRange(row.H, hRange);
    ctx.save();
    ctx.strokeStyle = "rgba(82, 100, 137, 0.88)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chamber.left, chamber.top);
    ctx.lineTo(chamber.left, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, chamber.top);
    ctx.stroke();
    const radiativeLevel = luminosityLevel(terms.radiativeLeak);
    const radiativeX = chamber.left + chamber.width * 0.95 - 10;
    const radiativeBaseY = pistonY - pistonHeight / 2 - 2;
    const radiativeTipY = Math.max(chamber.top - 12, radiativeBaseY - 28);
    const radiativeLabelY = (radiativeBaseY + radiativeTipY) / 2;
    ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.26 + radiativeLevel * 0.62);
    ctx.shadowColor = colorWithAlpha(COLORS.Lr, 0.2 + radiativeLevel * 0.52);
    ctx.shadowBlur = 2 + radiativeLevel * 10;
    ctx.lineWidth = 4.4;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(radiativeX, radiativeBaseY);
    ctx.lineTo(radiativeX, radiativeTipY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colorWithAlpha(COLORS.Lr, 0.32 + radiativeLevel * 0.62);
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    for (let ray = -1; ray <= 1; ray += 1) {
      ctx.beginPath();
      ctx.moveTo(radiativeX + ray * 7, radiativeTipY - 3);
      ctx.lineTo(radiativeX + ray * 11, radiativeTipY - 15);
      ctx.stroke();
    }
    drawHeatEngineMathLabel(ctx, [{ text: "L", subscript: "r", color: COLORS.Lr, weight: 800 }], radiativeX - 10, radiativeLabelY, {
      align: "right",
      fontSize: 11
    });
    const fillGradient = ctx.createLinearGradient(0, gasTop, 0, bottom);
    fillGradient.addColorStop(0, colorWithAlpha(COLORS.H, 0.18 + hLevel * 0.22));
    fillGradient.addColorStop(1, colorWithAlpha(COLORS.H, 0.42 + hLevel * 0.38));
    ctx.fillStyle = fillGradient;
    ctx.shadowColor = colorWithAlpha(COLORS.H, 0.78);
    ctx.shadowBlur = 8 + hLevel * 18;
    ctx.fillRect(chamber.left + 3, gasTop, chamber.width - 6, bottom - gasTop - 3);
    ctx.shadowBlur = 0;
    drawHeatEngineCompressibilitySpring(
      ctx,
      centerX + 9,
      gasTop + 7,
      bottom - 13,
      terms.q
    );
    const pressureLength = forceArrowLength(terms.pressureForce);
    const pressureX = centerX - 52;
    const currentOpacityPoint = thermodynamicPoint(row, parameters);
    if (currentOpacityPoint) {
      const opacityValues = scaleRows.map((item) => thermodynamicPoint(item, parameters)?.logOpacity ?? NaN).filter(Number.isFinite);
      const opacityRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange([...opacityValues, currentOpacityPoint.logOpacity], 0, 0.05, 0.12) : range([...opacityValues, currentOpacityPoint.logOpacity, 0], 0.12);
      const opacityLevel = normalizedInRange(currentOpacityPoint.logOpacity, opacityRange);
      const ghostWidth = 48;
      const ghostMaxHeight = 42;
      const ghostHeight = 16 + opacityLevel * (ghostMaxHeight - 16);
      const ghostX = clamp4(radiativeX - ghostWidth / 2, chamber.left + 10, right - ghostWidth - 8);
      const ghostY = clamp4(
        gasTop + Math.max(18, (bottom - gasTop) * 0.22),
        gasTop + 14,
        bottom - ghostMaxHeight - 24
      );
      const ghostTop = ghostY + ghostMaxHeight - ghostHeight;
      const opacityConnectorX = radiativeX;
      ctx.save();
      ctx.strokeStyle = "rgba(180, 190, 205, 0.42)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(opacityConnectorX, ghostTop);
      ctx.lineTo(opacityConnectorX, gasTop);
      ctx.stroke();
      roundedRectPath(ctx, ghostX, ghostTop, ghostWidth, ghostHeight, 7);
      ctx.fillStyle = "rgba(160, 172, 190, 0.09)";
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(180, 190, 205, 0.52)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawHeatEngineLabel(ctx, "opacity", ghostX + ghostWidth / 2, ghostTop + ghostHeight / 2, "rgba(210, 218, 232, 0.9)", "center", 9.4, 760);
    }
    const temperatureValues = scaleRows.map((item) => effectiveTemperatureProxy(item) ?? NaN).filter(Number.isFinite);
    const currentTemperatureProxy = effectiveTemperatureProxy(row);
    const temperatureRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange([...temperatureValues, currentTemperatureProxy ?? NaN], 1, 0.02, 0.08) : range([...temperatureValues, currentTemperatureProxy ?? NaN], 0.08);
    const pistonTemperatureLevel = normalizedInRange(currentTemperatureProxy ?? 1, temperatureRange);
    const pistonTemperatureColor = blackbodyRgbForTemperature(inferEffectiveTemperature(row.L, row.R));
    roundedRectPath(ctx, chamber.left - 5, pistonY - pistonHeight / 2, chamber.width + 10, pistonHeight, 3);
    ctx.shadowColor = rgbCss(pistonTemperatureColor, 0.2 + pistonTemperatureLevel * 0.5);
    ctx.shadowBlur = 4 + pistonTemperatureLevel * 13;
    ctx.fillStyle = rgbCss(pistonTemperatureColor, 0.44 + pistonTemperatureLevel * 0.42);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(240, 245, 255, 0.88)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const pressureEndY = gasTop + 2;
    drawHeatEngineArrow(ctx, pressureX, Math.min(bottom - 10, pressureEndY + pressureLength), pressureX, pressureEndY, COLORS.H, 3.1);
    drawHeatEngineLabel(ctx, "pressure", pressureX + 7, gasTop + 27, COLORS.H, "left", 9.4, 760);
    const gravityLength = forceArrowLength(terms.gravityForce);
    const gravityX = chamber.left + chamber.width * 0.05;
    const gravityEndY = pistonY - pistonHeight / 2 - 2;
    const gravityStartY = Math.max(3, gravityEndY - gravityLength);
    drawHeatEngineArrow(
      ctx,
      gravityX,
      gravityStartY,
      gravityX,
      gravityEndY,
      THEME.axisText,
      2.6
    );
    drawHeatEngineLabel(ctx, "gravity", gravityX + 10, pistonY - Math.max(12, pistonHeight * 0.9), THEME.axisText, "left", 9.4, 760);
    if (Math.abs(parameters.cq) > 1e-9) {
      const dampingLevel = Math.sqrt(forceMagnitude(terms.dampingAcceleration));
      const dampingLength = Math.max(9, forceArrowLength(terms.dampingAcceleration));
      const velocitySign = Math.abs(row.V) < 1e-6 ? 1 : Math.sign(row.V);
      const dampingDirection = velocitySign >= 0 ? 1 : -1;
      const dampingX = chamber.left - 10;
      const dampingColor = colorWithAlpha(COLORS.cq, 0.56 + dampingLevel * 0.34);
      drawHeatEngineArrow(ctx, dampingX, pistonY - dampingDirection * dampingLength / 2, dampingX, pistonY + dampingDirection * dampingLength / 2, dampingColor, 2 + dampingLevel * 0.8, void 0, 12, 5);
      drawHeatEngineLabel(ctx, "drag", dampingX - 3, pistonY, COLORS.cq, "right", 9.4, 760);
    }
    const sourceNorm = heatFlowMagnitude(terms.source);
    const sourceX = centerX - chamber.width * 0.22;
    const sourceLength = sourceNorm * 42;
    drawHeatEngineArrow(ctx, sourceX, bottom + sourceLength + 3, sourceX, bottom + 3, sourceLuminosityColor(), 3);
    drawHeatEngineLabel(ctx, "source", sourceX + 10, bottom + 18, sourceLuminosityColor(), "left", 9.4, 760);
    drawHeatEngineLabel(ctx, "luminosity", sourceX + 10, bottom + 30, sourceLuminosityColor(), "left", 9.4, 760);
    const convectiveLeakLevel = luminosityLevel(terms.convectiveLeak);
    const hasConvectiveLeak = convectiveLuminosityAvailable(parameters);
    if (hasConvectiveLeak) {
      const convectionResponsive = !convectiveResponseDisabled(parameters);
      const slotWidth = 34;
      const slotHeight = Math.min(84, Math.max(62, chamber.height * 0.32));
      const slotX = right + 14;
      const slotBottom = bottom - 34;
      const slotTop = slotBottom - slotHeight;
      const ductY = slotTop + slotHeight * 0.58;
      const ductHeight = 6;
      const ductWidth = Math.max(1, slotX - right);
      ctx.fillStyle = colorWithAlpha(COLORS.Lc, 0.18);
      ctx.fillRect(right, ductY - ductHeight / 2, ductWidth, ductHeight);
      ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.42);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(right, ductY - ductHeight / 2, ductWidth, ductHeight);
      const ductArrowX = right + ductWidth * 0.28;
      const ductArrowLength = Math.min(8, Math.max(4, ductWidth * 0.48));
      const ductArrowHalfHeight = Math.max(3.5, ductHeight * 0.65);
      ctx.fillStyle = colorWithAlpha(COLORS.Lc, 0.72);
      ctx.beginPath();
      ctx.moveTo(ductArrowX + ductArrowLength / 2, ductY);
      ctx.lineTo(ductArrowX - ductArrowLength / 2, ductY - ductArrowHalfHeight);
      ctx.lineTo(ductArrowX - ductArrowLength / 2, ductY + ductArrowHalfHeight);
      ctx.closePath();
      ctx.fill();
      const targetValues = convectionResponsive ? scaleRows.map((item) => convectiveVelocityTarget(item, parameters)) : [];
      const ucValues = convectionResponsive ? [...scaleRows.map((item) => item.Uc), ...targetValues] : [...scaleRows.map((item) => item.Uc), 0];
      const ucRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(ucValues, 1, 0.05, 0.12) : range(ucValues, 0.12);
      const currentAperture = normalizedInRange(row.Uc, ucRange);
      const currentY = slotBottom - currentAperture * slotHeight;
      roundedRectPath(ctx, slotX, slotTop, slotWidth, slotHeight, 6);
      ctx.fillStyle = "rgba(17, 27, 51, 0.66)";
      ctx.fill();
      ctx.strokeStyle = "rgba(192, 202, 232, 0.5)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (convectionResponsive) {
        const targetAperture = normalizedInRange(terms.convectiveTarget, ucRange);
        const targetY = slotBottom - targetAperture * slotHeight;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = colorWithAlpha(COLORS.Uc, 0.58);
        roundedRectPath(ctx, slotX - 4, targetY, slotWidth + 8, slotBottom - targetY, 5);
        ctx.stroke();
        ctx.setLineDash([]);
        drawHeatEngineMathLabel(ctx, [{ text: "U", subscript: "c,*", color: colorWithAlpha(COLORS.Uc, 0.9) }], slotX + slotWidth + 10, targetY, {
          align: "left",
          fontSize: 9.4
        });
      }
      ctx.fillStyle = colorWithAlpha(COLORS.Uc, 0.48 + currentAperture * 0.32);
      roundedRectPath(ctx, slotX + 4, currentY, slotWidth - 8, slotBottom - currentY, 4);
      ctx.fill();
      ctx.strokeStyle = COLORS.Uc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(slotX, currentY);
      ctx.lineTo(slotX + slotWidth, currentY);
      ctx.stroke();
      drawHeatEngineMathLabel(ctx, [{ text: "U", subscript: "c", color: COLORS.Uc }], slotX + slotWidth / 2, slotBottom + 12, {
        align: "center",
        fontSize: 10
      });
      const leakX = slotX + slotWidth / 2;
      const leakBaseY = slotTop - 1;
      const leakTipY = Math.max(chamber.top - 8, leakBaseY - 28);
      ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.26 + convectiveLeakLevel * 0.62);
      ctx.shadowColor = colorWithAlpha(COLORS.Lc, 0.2 + convectiveLeakLevel * 0.52);
      ctx.shadowBlur = 2 + convectiveLeakLevel * 10;
      ctx.lineWidth = 4.4;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(leakX, leakBaseY);
      ctx.lineTo(leakX, leakTipY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = colorWithAlpha(COLORS.Lc, 0.32 + convectiveLeakLevel * 0.62);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      for (let ray = -1; ray <= 1; ray += 1) {
        ctx.beginPath();
        ctx.moveTo(leakX + ray * 7, leakTipY - 3);
        ctx.lineTo(leakX + ray * 11, leakTipY - 15);
        ctx.stroke();
      }
      const leakLabelY = (leakBaseY + leakTipY) / 2;
      drawHeatEngineMathLabel(ctx, [{ text: "L", subscript: "c", color: COLORS.Lc, weight: 800 }], leakX + 10, leakLabelY, {
        align: "left",
        fontSize: 11
      });
    }
    drawHeatEngineMathLabel(ctx, [{ text: "H", color: COLORS.H, weight: 800 }], chamber.left + 8, bottom - 17, {
      align: "left",
      fontSize: 13
    });
    ctx.restore();
  }
  function drawWorkLoopPanel(ctx, rows, currentRow, parameters, work, regime, plot, scope) {
    const forces = rows.map((row) => pressureSupport(row, parameters));
    const scaleRows = stableTimeVisualReferenceRows(rows);
    const scaleForces = scaleRows.map((row) => pressureSupport(row, parameters));
    const xlim = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(scaleRows.map((row) => row.R), 1, 0.045, 0.08) : range(rows.map((row) => row.R), 0.08);
    const ylim = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(scaleForces, 1, 0.045, 0.1) : range(forces, 0.1);
    const sx = (x) => plot.left + (x - xlim[0]) / (xlim[1] - xlim[0]) * plot.width;
    const sy = (y) => plot.top + plot.height - (y - ylim[0]) / (ylim[1] - ylim[0]) * plot.height;
    const loopColor = COLORS.H;
    const ratio = work.pressureDampingRatio === null ? "n/a" : fmt(work.pressureDampingRatio, 2);
    const plotted = rows.map((loopRow) => {
      const force = pressureSupport(loopRow, parameters);
      return Number.isFinite(loopRow.R + force) ? { x: sx(loopRow.R), y: sy(force) } : null;
    }).filter((point) => Boolean(point));
    ctx.save();
    drawHeatEngineMathLabel(
      ctx,
      [
        { text: "W", subscript: "P", color: loopColor },
        { text: "/|" },
        { text: "W", subscript: "damp", color: COLORS.cq },
        { text: `|=${ratio}` }
      ],
      plot.left,
      plot.top - 15,
      { align: "left", fontSize: 10.6, subscriptSize: 8.6, strokeWidth: 2.6 }
    );
    drawHeatEngineMathLabel(
      ctx,
      [{ text: scope }, { text: " " }, { text: "W", subscript: "P", color: loopColor }, { text: `=${heatEngineSignedValue(work.pressure, 3)}` }],
      plot.left + plot.width,
      plot.top - 15,
      { align: "right", fontSize: 10.8, subscriptSize: 8.8, strokeWidth: 2.6 }
    );
    ctx.strokeStyle = "rgba(38, 51, 78, 0.9)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i += 1) {
      const x = plot.left + plot.width * i / 3;
      const y = plot.top + plot.height * i / 3;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = THEME.axisBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
    if (plotted.length > 2) {
      ctx.beginPath();
      plotted.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fillStyle = colorWithAlpha(loopColor, 0.16);
      ctx.strokeStyle = colorWithAlpha(loopColor, 0.95);
      ctx.lineWidth = 2.4;
      ctx.fill();
      ctx.stroke();
      [0.2, 0.46, 0.72].forEach((fraction) => {
        const index = Math.min(plotted.length - 2, Math.max(0, Math.round(fraction * (plotted.length - 2))));
        drawHeatEngineArrowHead(ctx, plotted[index].x, plotted[index].y, plotted[index + 1].x, plotted[index + 1].y, loopColor, 6.5);
      });
    }
    const currentForce = pressureSupport(currentRow, parameters);
    if (Number.isFinite(currentRow.R + currentForce)) {
      ctx.fillStyle = PHASE_MARKER_COLOR;
      ctx.strokeStyle = "#050814";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(currentRow.R), sy(currentForce), 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawHeatEngineMathLabel(ctx, [{ text: "R", color: COLORS.R }], plot.left + plot.width / 2, plot.top + plot.height + 18, {
      align: "center",
      fontSize: 10.7
    });
    drawWorkPressureSupportAxisLabel(ctx, plot.left - 24, plot.top + plot.height / 2, -Math.PI / 2);
    ctx.restore();
  }
  function drawWorkPressureSupportAxisLabel(ctx, x, y, rotate = 0) {
    const baseSize = 9.8;
    const exponentSize = 7.4;
    const exponentY = -baseSize * 0.45;
    const parts = [
      { text: "pressure support ", color: THEME.axisText, size: baseSize, y: 0 },
      { text: "H", color: COLORS.H, size: baseSize, y: 0 },
      { text: "/", color: THEME.axisText, size: baseSize, y: 0 },
      { text: "R", color: COLORS.R, size: baseSize, y: 0 },
      { text: "\u03C7", color: COLORS.m, size: exponentSize, y: exponentY },
      { text: "\u0393\u2081", color: COLORS.gamma1, size: exponentSize, y: exponentY },
      { text: "-2", color: THEME.axisText, size: exponentSize, y: exponentY }
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const totalWidth = parts.reduce((total, part) => {
      ctx.font = canvasMathFont(part.size, 760);
      return total + ctx.measureText(part.text).width;
    }, 0);
    let cursor = -totalWidth / 2;
    parts.forEach((part) => {
      ctx.font = canvasMathFont(part.size, 760);
      ctx.strokeStyle = "rgba(5, 8, 20, 0.9)";
      ctx.lineWidth = part.size === exponentSize ? 2 : 2.4;
      ctx.fillStyle = part.color;
      ctx.strokeText(part.text, cursor, part.y);
      ctx.fillText(part.text, cursor, part.y);
      cursor += ctx.measureText(part.text).width;
    });
    ctx.restore();
  }
  function drawWorkSummaryBars(ctx, work, regime, x, y, width, height) {
    const rows = [
      { label: [{ text: "W", subscript: "P", color: COLORS.H }], value: work.pressure, color: COLORS.H, width: 4.8 },
      { label: [{ text: "W", subscript: "damp", color: COLORS.cq }], value: work.damping, color: COLORS.cq, width: 4.8 },
      { label: [{ text: "\u0394E", subscript: "mech", color: heatEngineRegimeColor(regime) }], value: work.net, color: heatEngineRegimeColor(regime), width: 5.4 }
    ];
    const maxAbs = Math.max(1e-8, ...rows.map((row) => Math.abs(row.value)).filter(Number.isFinite));
    const center = x + width * 0.51;
    const barLimit = width * 0.22;
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, 5);
    ctx.fillStyle = "rgba(5, 8, 20, 0.28)";
    ctx.fill();
    ctx.strokeStyle = "rgba(82, 100, 137, 0.58)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(192, 202, 232, 0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center, y + 6);
    ctx.lineTo(center, y + height - 6);
    ctx.stroke();
    const laneGap = height / rows.length;
    rows.forEach((row, index) => {
      const laneY = y + laneGap * (index + 0.5);
      const bar = clamp4(row.value / maxAbs, -1, 1) * barLimit;
      ctx.strokeStyle = "rgba(82, 100, 137, 0.5)";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(center - barLimit, laneY);
      ctx.lineTo(center + barLimit, laneY);
      ctx.stroke();
      ctx.strokeStyle = colorWithAlpha(row.color, 0.95);
      ctx.shadowColor = colorWithAlpha(row.color, 0.22);
      ctx.shadowBlur = 5;
      ctx.lineWidth = row.width;
      ctx.beginPath();
      ctx.moveTo(center, laneY);
      ctx.lineTo(center + bar, laneY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      drawHeatEngineMathLabel(
        ctx,
        row.label.map((fragment) => ({
          ...fragment,
          color: fragment.color || row.color,
          weight: fragment.weight || 760
        })),
        x + 8,
        laneY,
        { align: "left", fontSize: 9.6, subscriptSize: 8.2, strokeWidth: 2.5 }
      );
    });
    const regimeColor = heatEngineRegimeColor(regime);
    drawHeatEngineLabel(ctx, regime, center + barLimit + 8, y + height - 8, regimeColor, "left", 8.6, 800);
    ctx.restore();
  }
  function drawWorkPanel() {
    const canvas = document.getElementById("workCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 292);
    const height = Math.max(230, rect.height || 260);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const { selectedRows, integrationRows, scope } = heatEngineWorkRows(latestPhaseRows);
    const plotRows = downsample(integrationRows, 1100, ["R", "V", "H", "Uc", "L", "Lr", "Lc"]);
    const row = integrationRows.length ? rowAtCurrentClosedLoopPosition(integrationRows) : null;
    if (!row || integrationRows.length < 2 || plotRows.length < 2) {
      canvas.dataset.workMode = "unavailable";
      canvas.dataset.workWindowRows = String(selectedRows.length);
      canvas.dataset.workRows = String(integrationRows.length);
      canvas.dataset.workPlotRows = String(plotRows.length);
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "work unavailable");
      return;
    }
    const work = heatEngineCycleWork(integrationRows, latestPhaseParameters);
    const regime = heatEngineRegime(work, integrationRows);
    canvas.dataset.workMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.workScope = scope;
    canvas.dataset.workWindowRows = String(selectedRows.length);
    canvas.dataset.workRows = String(integrationRows.length);
    canvas.dataset.workPlotRows = String(plotRows.length);
    canvas.dataset.workVisualization = "pressure support H/R^(chi Gamma1-2)-R loop";
    canvas.dataset.workLoop = "pressure support H/R^(chi Gamma1-2) versus R";
    canvas.dataset.workTerms = "W_P,W_damp,DeltaE_mech";
    canvas.dataset.cycleWorkPressure = fmt(work.pressure, 6);
    canvas.dataset.cycleWorkDamping = fmt(work.damping, 6);
    canvas.dataset.cycleWorkNet = fmt(work.net, 6);
    canvas.dataset.cycleWorkRatio = work.pressureDampingRatio === null ? "n/a" : fmt(work.pressureDampingRatio, 6);
    canvas.dataset.regime = regime;
    if (latestDisplayWindow.mode === "time") {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    } else {
      canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
      delete canvas.dataset.currentTime;
    }
    const summaryHeight = height < 245 ? 46 : 50;
    const summaryY = height - summaryHeight - 10;
    const loopPlot = {
      left: 38,
      top: 34,
      width: Math.max(180, width - 52),
      height: Math.max(94, summaryY - 66)
    };
    drawWorkLoopPanel(ctx, plotRows, row, latestPhaseParameters, work, regime, loopPlot, scope);
    drawWorkSummaryBars(ctx, work, regime, 10, summaryY, width - 20, summaryHeight);
  }
  function drawHeatEnginePanel() {
    const canvas = document.getElementById("heatEngineCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 292);
    const height = Math.max(230, rect.height || 260);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const row = latestPhaseRows.length ? rowAtCurrentDisplayPosition(latestPhaseRows) : null;
    if (!row) {
      canvas.dataset.heatEngineMode = "unavailable";
      canvas.dataset.heatEngineRows = "0";
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
      return;
    }
    const terms = heatEngineTerms(row, latestPhaseParameters);
    if (!terms) {
      canvas.dataset.heatEngineMode = "domain-error";
      drawCanvasMessage(ctx, width, height, "heat engine terms unavailable");
      return;
    }
    const cycleRows = downsample(heatEngineCycleRows(latestPhaseRows), 1100, ["R", "V", "H", "Uc", "L", "Lr", "Lc"]);
    canvas.dataset.heatEngineMode = gridState.enabled ? "grid" : "single";
    canvas.dataset.heatEngineRows = String(cycleRows.length);
    canvas.dataset.forceTerms = "pressure,gravity,damping";
    const heatEngineShowsUc = convectiveLuminosityAvailable(latestPhaseParameters);
    const heatEngineConvectionResponsive = heatEngineShowsUc && !convectiveResponseDisabled(latestPhaseParameters);
    canvas.dataset.heatFluxTerms = heatEngineShowsUc ? "source,L_r,L_c" : "source,L_r";
    canvas.dataset.convectiveValve = heatEngineShowsUc ? heatEngineConvectionResponsive ? "time-dependent" : "frozen" : "hidden";
    if (heatEngineConvectionResponsive) {
      canvas.dataset.convectiveTarget = "U_c,*";
      canvas.dataset.convectiveLag = fmt(terms.convectiveLag, 6);
    } else {
      delete canvas.dataset.convectiveTarget;
      delete canvas.dataset.convectiveLag;
    }
    delete canvas.dataset.workLoop;
    delete canvas.dataset.workState;
    delete canvas.dataset.workIntegral;
    delete canvas.dataset.cycleWorkNet;
    delete canvas.dataset.cycleWorkRatio;
    delete canvas.dataset.regime;
    delete canvas.dataset.eventLabels;
    if (gridState.enabled) {
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
    } else if (latestDisplayWindow.mode === "time") {
      canvas.dataset.currentTime = fmtFixed(displayMarkerX(latestDisplayWindow, currentAnimationPhase), 3);
      delete canvas.dataset.currentPhase;
    } else {
      canvas.dataset.currentPhase = fmtFixed(phaseModOne(currentAnimationPhase), 3);
      delete canvas.dataset.currentTime;
    }
    const chamberWidth = Math.max(160, Math.min(190, width - 128));
    const chamber = {
      left: 38,
      top: 44,
      width: chamberWidth,
      height: Math.max(142, height - 98)
    };
    drawHeatEnginePistonCausal(ctx, row, cycleRows, terms, chamber, latestPhaseParameters);
  }
  function drawModelVisualization() {
    const canvas = el("modelCanvas");
    const panel = canvas.closest(".plot-panel");
    if (panel?.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 320);
    const height = Math.max(260, rect.height || width);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    canvas.dataset.animationSpeed = modelSpeedLabel(modelAnimationSpeed);
    const row = latestPhaseRows.length ? rowAtCurrentDisplayPosition(latestPhaseRows) : null;
    if (!row) {
      canvas.dataset.convectionActive = "false";
      canvas.dataset.luminosityArcLabels = "";
      canvas.dataset.geometryGuides = "";
      delete canvas.dataset.boundaryLuminosityLines;
      delete canvas.dataset.velocityArcLabel;
      delete canvas.dataset.radiusLabel;
      delete canvas.dataset.currentPhase;
      delete canvas.dataset.currentTime;
      drawCanvasMessage(ctx, width, height, latestPhaseMessage || "phase unavailable");
      return;
    }
    const size = Math.min(width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const modelScaleRows = stableTimeVisualReferenceRows(latestPhaseRows);
    const maxRadius = maximumPhaseRadius(modelScaleRows);
    const radiusScale = size * 0.36 / maxRadius;
    const geometry = shellGeometryFromModel(row, state);
    const luminosityLevel = normalizedInRange(row.L, latestPhaseLuminosityRange);
    const temperature = inferEffectiveTemperature(row.L, row.R);
    const blackbody = blackbodyRgbForTemperature(temperature);
    const shellColor = scaledRgb(blackbody, 0.58 + luminosityLevel * 0.52);
    const outerRadius = Math.max(2, geometry.outerRadius * radiusScale);
    const innerRadius = Math.max(0, geometry.innerRadius * radiusScale);
    const convectionActive = convectiveLuminosityAvailable();
    const shellAlpha = 0.5 + luminosityLevel * 0.4;
    canvas.dataset.convectionActive = String(convectionActive);
    if (latestDisplayWindow.mode === "time") {
      canvas.dataset.currentTime = fmtFixed(row.tau, 3);
      delete canvas.dataset.currentPhase;
    } else {
      canvas.dataset.currentPhase = fmtFixed(row.tau, 3);
      delete canvas.dataset.currentTime;
    }
    canvas.dataset.luminosityArcLabels = convectionActive ? "L_c,L,L_r" : "";
    canvas.dataset.geometryGuides = "R=1,eta,minR,maxR";
    delete canvas.dataset.boundaryLuminosityLines;
    delete canvas.dataset.velocityArcLabel;
    delete canvas.dataset.radiusLabel;
    ctx.save();
    drawModelReferenceGuides(ctx, modelScaleRows, centerX, centerY, radiusScale);
    ctx.shadowColor = rgbCss(blackbody, 0.65);
    ctx.shadowBlur = 12 + luminosityLevel * 22;
    drawAnnularSegment(
      ctx,
      centerX,
      centerY,
      outerRadius,
      innerRadius,
      convectionActive ? Math.PI / 2 : 0,
      Math.PI * 2,
      rgbCss(shellColor, shellAlpha)
    );
    ctx.shadowBlur = 0;
    if (convectionActive) drawConvectionArcs(ctx, row, centerX, centerY, radiusScale);
    ctx.restore();
  }
  function drawAnimatedPhaseViews() {
    drawModelVisualization();
    drawPhasePlots();
    drawHeatEnginePanel();
    drawWorkPanel();
    drawThermodynamicPanel();
    drawCepheidGuide();
    drawPhasePortraitPanel();
  }
  function updateLatestPhaseDisplay(displayWindow, gridResult) {
    latestDisplayWindow = displayWindow;
    syncAnimationPositionToDisplayWindow();
    const phasePeriod = displayWindow.period;
    latestPhaseRows = [...displayWindow.rows];
    latestPhaseParameters = gridResult?.parameters ?? state;
    latestPhaseSample = latestPhaseRows.length ? downsample(latestPhaseRows, 1800, ["L", "V", "H"]) : [];
    latestPhaseMessage = displayWindow.message;
    latestPhasePeriodLabel = displayWindow.mode === "time" ? "time \u03C4" : `phase (period = ${phasePeriod ? fmt(phasePeriod, 3) : "n/a"} \u03C4)`;
    const luminosityRows = stableTimeVisualReferenceRows(latestPhaseRows);
    latestPhaseLuminosityRange = stableTimeEquilibriumDisplayActive() ? anchoredVisualRange(luminosityRows.map((row) => row.L), 1, 0.05) : rawRange(latestPhaseRows.map((row) => row.L));
  }
  function drawGridAnimationFrame() {
    if (!gridState.enabled) {
      drawAll();
      return;
    }
    const gridResult = currentGridResult();
    if (!gridResult) {
      drawAll();
      return;
    }
    const phaseMessage = gridState.enabled && activeGridRanges().length && !gridState.results.length ? gridState.statusText : void 0;
    const displayWindow = buildCurrentDisplayWindow(
      latestRows,
      { reason: "ok", reference: null, rows: gridResult.phaseRows, period: gridResult.period },
      gridResult,
      analyticStabilityConditions(gridResult.parameters),
      phaseMessage
    );
    updateGridLoopSliderMarkers();
    updateLatestPhaseDisplay(displayWindow, gridResult);
    syncSonificationCurve(displayWindow, gridResult, latestRows);
    drawPhasePlots();
    drawThermodynamicPanel();
    drawFourierPanel();
    drawStellingwerfReferencePanel();
  }
  function startModelAnimationLoop() {
    if (modelAnimationFrame) return;
    const tick = (timestamp) => {
      if (!document.hidden) {
        if (gridState.enabled) {
          modelAnimationStartTime = null;
        } else if (activePhaseScrub || activePhaseHoverCanvasId) {
          modelAnimationStartTime = null;
        } else {
          if (modelAnimationStartTime === null) {
            modelAnimationStartTime = timestamp - currentAnimationPhase / displayAnimationEnd(latestDisplayWindow) * modelAnimationDurationMs();
          }
          const duration = modelAnimationDurationMs();
          const elapsed = (timestamp - modelAnimationStartTime) % duration;
          currentAnimationPhase = elapsed / duration * displayAnimationEnd(latestDisplayWindow);
          drawAnimatedPhaseViews();
        }
      } else {
        modelAnimationStartTime = null;
      }
      modelAnimationFrame = window.requestAnimationFrame(tick);
    };
    modelAnimationFrame = window.requestAnimationFrame(tick);
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
    const gridResult = gridState.enabled ? currentGridResult() : null;
    const phaseMessage = gridState.enabled && activeGridRanges().length && !gridState.results.length ? gridState.statusText : phaseUnavailableLabel(phase);
    const stabilityParameters = stabilityDisplayParameters();
    const s72Stability = analyticStabilityConditions(stabilityParameters);
    const displayWindow = buildCurrentDisplayWindow(rows, phase, gridResult, s72Stability, phaseMessage);
    const linearPeriod = linearDynamicPeriod(stabilityParameters);
    const nonlinearPeriod = displayWindow.period;
    updateGridLoopSliderMarkers();
    updateSonificationSourceControls();
    updateDerivationPanel(stabilityParameters, s72Stability);
    const metricsNode = el("metrics");
    if (s72Stability.convective) metricsNode.dataset.s72Convective = s72State(s72Stability.convective.stable);
    else delete metricsNode.dataset.s72Convective;
    metricsNode.dataset.s72Dynamic = s72State(s72Stability.dynamic.stable);
    metricsNode.dataset.s72Secular = s72State(s72Stability.secular.stable);
    metricsNode.dataset.s72Pulsational = s72State(s72Stability.pulsational.stable);
    metricsNode.dataset.s72All = s72State(s72Stability.allStable);
    metricsNode.dataset.s72M = fmt(s72Stability.m, 6);
    metricsNode.dataset.s72B = fmt(s72Stability.b, 6);
    metricsNode.dataset.s72PhysicsMode = s72Stability.physicsMode;
    metricsNode.dataset.linearPeriodFormula = "2pi/sqrt(chi*Gamma1-4)";
    metricsNode.dataset.linearPeriod = linearPeriod ? fmt(linearPeriod, 6) : "unavailable";
    metricsNode.dataset.nonlinearPeriod = nonlinearPeriod ? fmt(nonlinearPeriod, 6) : "unavailable";
    const stabilityMetricItems = s72Stability.conditions.map((condition2) => {
      const formula = s72ConditionMetric(s72Stability, condition2);
      return {
        label: "",
        value: `<span class="stability-summary">${s72ConditionSummary(condition2)}</span><span class="stability-formula">${s72ConditionMetricHtml(s72Stability, condition2)}</span>`,
        detail: s72ConditionTitle(s72Stability, condition2),
        formula,
        className: s72MetricClass(condition2.stable),
        stabilityKind: condition2.kind
      };
    });
    const metricItems = [
      { label: "stop", value: stopReason, className: okStatus ? "status-ok" : "status-warn" },
      { label: `final \\(${TEX.tau}\\)`, value: final ? fmt(final.tau || 0, 4) : "n/a" },
      { label: "models", value: rows.length },
      { label: "accepted", value: latestResult.stats.acceptedSteps },
      { label: "rejected", value: latestResult.stats.rejectedSteps },
      { label: "max err", value: fmt(latestResult.stats.maxNormalizedError, 3) },
      {
        label: "P_lin =",
        value: linearPeriodMetric(stabilityParameters, linearPeriod),
        detail: linearPeriodTitle(stabilityParameters, linearPeriod),
        className: linearPeriod ? "status-ok" : "status-warn"
      },
      {
        label: "P_nonlin =",
        value: nonlinearPeriod ? fmt(nonlinearPeriod, 3) : "n/a",
        detail: nonlinearPeriodTitle(nonlinearPeriod),
        className: nonlinearPeriod ? "status-ok" : "status-warn"
      },
      { label: "phase", value: displayWindow.mode === "time" ? "time window" : phase.reason === "ok" ? "available" : "unavailable" },
      ...stabilityMetricItems
    ];
    const metricsHtml = metricItems.map(({ label, value, className, stabilityKind, detail, formula }) => {
      const stabilityAttribute = stabilityKind ? ` data-stability-kind="${stabilityKind}" data-stability-expanded role="button" tabindex="0" aria-expanded="false"${formula ? ` data-stability-formula="${escapeAttribute(formula)}"` : ""}` : "";
      const ariaLabelPrefix = label || (stabilityKind ? s72ShortLabel(stabilityKind) : "");
      const detailAttribute = detail ? ` data-stability-detail="${escapeAttribute(detail)}" aria-label="${escapeAttribute(`${ariaLabelPrefix}: ${detail}`)}"` : "";
      return `<span class="metric${className ? ` ${className}` : ""}"${stabilityAttribute}${detailAttribute}>${label}<b>${value}</b></span>`;
    }).join("");
    stageMathHtml(metricsNode, metricsHtml);
    queueMathTypeset([metricsNode]);
    updateLatestPhaseDisplay(displayWindow, gridResult);
    syncSonificationCurve(displayWindow, gridResult, rows);
    drawModelVisualization();
    drawPhasePlots();
    drawHeatEnginePanel();
    drawWorkPanel();
    drawThermodynamicPanel();
    const timeXlim = integrationTimeRange(rows);
    const showUcSeries = convectiveVelocityHistoryAvailable(rows);
    const showLuminositySplit = convectiveLuminosityAvailable();
    const timeKeys = showUcSeries ? ["R", "V", "H", "Uc"] : ["R", "V", "H"];
    const lumKeys = showLuminositySplit ? ["L", "Lr", "Lc", "Lb"] : ["L", "Lb"];
    const sampledTimeRows = rowsForInteractivePlot("time", rows, timeKeys);
    const sampledLumRows = rowsForInteractivePlot("lum", rows, lumKeys);
    const timeSeries = [
      { label: "R", color: COLORS.R, rows: visibleRows("time", "R", sampledTimeRows), x: (row) => row.tau, y: (row) => row.R },
      { label: "V", color: COLORS.V, rows: visibleRows("time", "V", sampledTimeRows), x: (row) => row.tau, y: (row) => row.V },
      { label: "H", color: COLORS.H, rows: visibleRows("time", "H", sampledTimeRows), x: (row) => row.tau, y: (row) => row.H }
    ];
    if (showUcSeries) {
      timeSeries.push({ label: "Uc", color: COLORS.Uc, rows: visibleRows("time", "Uc", sampledTimeRows), x: (row) => row.tau, y: (row) => row.Uc });
    }
    drawSeries("timeCanvas", timeSeries, {
      xlabel: "time \u03C4",
      ylabel: "state",
      xlabelColor: COLORS.tau,
      fallbackXlim: timeXlim,
      view: plotViews.time,
      interactivePlotId: "time",
      denseEnvelope: true,
      message: "all series hidden"
    });
    const timeLegendItems = [
      { key: "R", label: `\\(${TEX.R}\\) radius`, color: COLORS.R, toggleLabel: "radius" },
      { key: "V", label: `\\(${TEX.V}\\) radial velocity`, color: COLORS.V, toggleLabel: "radial velocity" },
      { key: "H", label: `\\(${TEX.H}\\) pressure factor`, color: COLORS.H, toggleLabel: "pressure factor" }
    ];
    if (showUcSeries) {
      timeLegendItems.push({ key: "Uc", label: `\\(${TEX.Uc}\\) convective velocity`, color: COLORS.Uc, toggleLabel: "convective velocity" });
    }
    drawLegend("timeLegend", timeLegendItems, { plotId: "time" });
    const lumSeries = [
      { label: "L", color: COLORS.L, rows: visibleRows("lum", "L", sampledLumRows), x: (row) => row.tau, y: (row) => row.L },
      { label: "Lb", color: sourceLuminosityColor(), rows: visibleRows("lum", "Lb", sampledLumRows), x: (row) => row.tau, y: (row) => baseLuminosity(row, state), dash: [7, 5] }
    ];
    if (showLuminositySplit) {
      lumSeries.push(
        { label: "Lr", color: COLORS.Lr, rows: visibleRows("lum", "Lr", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lr },
        { label: "Lc", color: COLORS.Lc, rows: visibleRows("lum", "Lc", sampledLumRows), x: (row) => row.tau, y: (row) => row.Lc }
      );
    }
    drawSeries("lumCanvas", lumSeries, {
      xlabel: "time \u03C4",
      ylabel: "luminosity",
      xlabelColor: COLORS.tau,
      fallbackXlim: timeXlim,
      view: plotViews.lum,
      interactivePlotId: "lum",
      denseEnvelope: true,
      message: "all luminosity variables hidden"
    });
    const lumLegendItems = showLuminositySplit ? [
      { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
      { key: "Lr", label: `\\(${TEX.Lr}\\) radiative`, color: COLORS.Lr, toggleLabel: "radiative luminosity" },
      { key: "Lc", label: `\\(${TEX.Lc}\\) convective`, color: COLORS.Lc, toggleLabel: "convective luminosity" },
      { key: "Lb", label: sourceLuminosityLegendLabel(), color: sourceLuminosityColor(), toggleLabel: "source luminosity" }
    ] : [
      { key: "L", label: `\\(${TEX.L}\\) total`, color: COLORS.L, toggleLabel: "total luminosity" },
      { key: "Lb", label: sourceLuminosityLegendLabel(), color: sourceLuminosityColor(), toggleLabel: "source luminosity" }
    ];
    drawLegend("lumLegend", lumLegendItems, { plotId: "lum" });
    drawFourierPanel();
    drawStellingwerfReferencePanel();
  }
  function startApp() {
    buildControls();
    solveAndDraw();
    startModelAnimationLoop();
    window.addEventListener("load", () => queueMathTypeset());
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
