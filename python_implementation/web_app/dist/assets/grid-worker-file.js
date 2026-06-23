"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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

  // src/solvers.ts
  var DEFAULT_SOLVER = "rk45";
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
      const window = [];
      for (let i = this.rows.length - 1; i >= 0; i -= 1) {
        if (end - this.rows[i].tau > this.equilibriumWindow) break;
        window.push(this.rows[i]);
      }
      if (window.length < 6 || end - window.at(-1).tau < this.equilibriumWindow * 0.75) return false;
      for (const key of ["R", "V", "H", "Uc", "L"]) {
        const values = window.map((row) => row[key]);
        const scale = Math.max(1, ...values.map(Math.abs));
        if ((Math.max(...values) - Math.min(...values)) / scale > this.tolerance) return false;
      }
      return Math.max(...window.map((row) => Math.abs(row.V))) < this.tolerance;
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
  function parameterValueFromSlider(key, sliderValue) {
    const meta = sliderMeta(key);
    const value = clampToMeta(sliderValue, meta);
    if (key === "tEnd") return Math.min(1e3, Math.max(1, 10 ** value));
    if (key === "zeta") return 10 ** value;
    if (key === "zetac") return value <= RESPONSE_LOG_MIN + 1e-12 ? 0 : 10 ** value;
    if (key === "m") return chiFromSliderValue(value);
    return value;
  }
  function normalizeGridRange(range) {
    const meta = sliderMeta(range.key);
    const low = Math.min(range.lowerSliderValue, range.upperSliderValue);
    const high = Math.max(range.lowerSliderValue, range.upperSliderValue);
    return {
      ...range,
      lowerSliderValue: clampToMeta(low, meta),
      upperSliderValue: clampToMeta(high, meta),
      centerSliderValue: clampToMeta(range.centerSliderValue, meta),
      nativeStep: meta.step
    };
  }
  function generateSliderSamples(rangeInput, stride = 1) {
    const range = normalizeGridRange(rangeInput);
    const meta = sliderMeta(range.key);
    const step2 = meta.step;
    const firstIndex = Math.ceil((range.lowerSliderValue - meta.min) / step2 - 1e-9);
    const lastIndex = Math.floor((range.upperSliderValue - meta.min) / step2 + 1e-9);
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
    const range = normalizeGridRange(rangeInput);
    const samples = generateSliderSamples(range, 1);
    if (!samples.length) return roundToNativeStep(range.centerSliderValue, range.nativeStep);
    return samples.reduce(
      (best, sample2) => Math.abs(sample2 - range.centerSliderValue) < Math.abs(best - range.centerSliderValue) ? sample2 : best,
      samples[0]
    );
  }
  function meanSliderSample(rangeInput) {
    const range = normalizeGridRange(rangeInput);
    return Number(((range.lowerSliderValue + range.upperSliderValue) / 2).toFixed(12));
  }
  function fallbackSliderSamples(rangeInput, selected) {
    const range = normalizeGridRange(rangeInput);
    if (!selected) return [centerSliderSample(range)];
    const low = roundToNativeStep(range.lowerSliderValue, range.nativeStep);
    const center = centerSliderSample(range);
    const high = roundToNativeStep(range.upperSliderValue, range.nativeStep);
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
    return ranges.map((range) => ({
      key: range.key,
      centerSliderValue: normalizeGridRange(range).centerSliderValue,
      samples: addCenterSample(
        options.zeroCompletedFallback ? fallbackSliderSamples(range, range.key === loopKey) : generateSliderSamples(range, options.stride ?? 1),
        range
      )
    }));
  }
  function buildLoopPathSamples(ranges, loopKey) {
    return ranges.map((rangeInput) => {
      const range = normalizeGridRange(rangeInput);
      const mean = meanSliderSample(range);
      return {
        key: range.key,
        centerSliderValue: mean,
        samples: range.key === loopKey ? generateSliderSamples(range, 1) : [mean]
      };
    });
  }
  function gridTotal(samples) {
    return samples.reduce((total, item) => total * Math.max(1, item.samples.length), 1);
  }
  function clampToMeta(value, meta) {
    return Math.min(meta.max, Math.max(meta.min, value));
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
  function addCenterSample(samples, range) {
    const center = centerSliderSample(range);
    return [.../* @__PURE__ */ new Set([...samples, center])].sort((a, b) => a - b);
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
  function isTimeWindowReason(message) {
    return message === "equilibrium" || message === "runaway" || message === "runaway_trend";
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
    const path = await runLoopPathPass(request, callbacks);
    if (callbacks.isCanceled()) {
      callbacks.post({ type: "grid-canceled", requestId: request.requestId });
      return;
    }
    postComplete(request, coarsened, path.results, estimate.stride, true, estimate.zeroCompletedFallback, callbacks);
  }
  async function runLoopPathPass(request, callbacks) {
    const pathSamples = buildLoopPathSamples(request.ranges, request.loopKey);
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

  // src/gridWorker.ts
  var activeToken = 0;
  self.onmessage = (event) => {
    const message = event.data;
    if (message.type === "cancel-grid") {
      activeToken += 1;
      if (message.requestId !== void 0) post({ type: "grid-canceled", requestId: message.requestId });
      return;
    }
    if (message.type === "compute-grid") {
      const token = activeToken + 1;
      activeToken = token;
      void computeGridWithMessages(message.request, {
        post,
        isCanceled: () => token !== activeToken
      });
    }
  };
  function post(message) {
    self.postMessage(message);
  }
})();
