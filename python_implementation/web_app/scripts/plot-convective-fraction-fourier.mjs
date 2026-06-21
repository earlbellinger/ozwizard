import * as esbuild from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_APP_DIR = path.resolve(SCRIPT_DIR, "..");
const PYTHON_DIR = path.resolve(WEB_APP_DIR, "..");
const OUTPUT_DIR = path.join(PYTHON_DIR, "outputs", "animations", "rr_lyrae_convective_fraction");

const FRAME_COUNT = 61;
const GAMMAC_VALUES = Array.from({ length: FRAME_COUNT }, (_unused, index) => Number((0.6 - index * 0.01).toFixed(2)));
const TAU_MAX = 1000;
const ZETAC = 10;
const SHELL_M = 10;
const ANIMATION_MAX_STEP = 0.02;
const MIN_SEPARATION = 2.0;
const HARMONICS = 3;
const TWO_PI = 2 * Math.PI;
const MIN_HARMONIC_AMPLITUDE = 1e-4;
const PLOT_WIDTH = 1120;
const PLOT_HEIGHT = 820;

const COLORS = {
  background: "#08111f",
  panel: "#0c1728",
  grid: "#26334e",
  axis: "#526489",
  text: "#d9e7ff",
  muted: "#9aa8bd"
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { outputDir: OUTPUT_DIR };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      options.outputDir = path.resolve(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function loadModelModule() {
  const outfile = path.join(os.tmpdir(), `ozwizard-model-${Date.now()}-${process.pid}.mjs`);
  await esbuild.build({
    absWorkingDir: WEB_APP_DIR,
    bundle: true,
    entryPoints: ["src/model.ts"],
    format: "esm",
    outfile,
    platform: "node"
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(outfile, { force: true });
  }
}

function interpolateRow(rows, tau) {
  if (tau <= rows[0].tau) return { ...rows[0], tau };
  if (tau >= rows.at(-1).tau) return { ...rows.at(-1), tau };

  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].tau <= tau) lo = mid;
    else hi = mid;
  }

  const left = rows[lo];
  const right = rows[hi];
  const fraction = (tau - left.tau) / (right.tau - left.tau);
  const blend = (key) => left[key] + (right[key] - left[key]) * fraction;
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

function refinedQuadraticMinimum(left, center, right) {
  const xLeft = left.tau - center.tau;
  const xRight = right.tau - center.tau;
  const yLeft = left.L - center.L;
  const yRight = right.L - center.L;
  const denominator = xLeft * xRight * (xLeft - xRight);
  if (denominator === 0) return null;

  const a = (yLeft * xRight - yRight * xLeft) / denominator;
  const b = (xLeft ** 2 * yRight - xRight ** 2 * yLeft) / denominator;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;

  const xVertex = -b / (2 * a);
  if (xVertex < xLeft || xVertex > xRight) return null;
  const tau = center.tau + xVertex;
  const luminosity = center.L + a * xVertex ** 2 + b * xVertex;
  if (!Number.isFinite(tau) || !Number.isFinite(luminosity)) return null;
  return { tau, luminosity };
}

function refineLuminosityMinimum(rows, index) {
  const center = rows[index];
  const refined = refinedQuadraticMinimum(rows[index - 1], center, rows[index + 1]);
  if (!refined) return { ...center, sampleTau: center.tau, sampleL: center.L, refinementTau: 0 };
  return {
    ...interpolateRow(rows, refined.tau),
    L: refined.luminosity,
    sampleTau: center.tau,
    sampleL: center.L,
    refinementTau: refined.tau - center.tau
  };
}

function findLuminosityMinima(rows, minSeparation = MIN_SEPARATION) {
  const minima = [];
  for (let index = 1; index < rows.length - 1; index += 1) {
    const row = rows[index];
    if (rows[index - 1].L > row.L && row.L <= rows[index + 1].L) {
      const last = minima.at(-1);
      if (last && row.tau - last.row.tau < minSeparation) {
        if (row.L < last.row.L) minima[minima.length - 1] = { index, row };
      } else {
        minima.push({ index, row });
      }
    }
  }
  return minima.map(({ index }) => refineLuminosityMinimum(rows, index));
}

function foldLastTwoCyclesAtMinimumLight(rows) {
  const minima = findLuminosityMinima(rows);
  if (minima.length < 3) throw new Error(`Need three luminosity minima, found ${minima.length}`);
  const [first, second, third] = minima.slice(-3);
  const firstPeriod = second.tau - first.tau;
  const secondPeriod = third.tau - second.tau;
  const period = (firstPeriod + secondPeriod) / 2;
  if (!Number.isFinite(period) || period <= 0 || firstPeriod <= 0 || secondPeriod <= 0) {
    throw new Error(`Invalid phase period from minima ${first.tau}, ${second.tau}, ${third.tau}`);
  }
  const phaseForTau = (tau) => (
    tau <= second.tau
      ? (tau - first.tau) / firstPeriod
      : 1 + (tau - second.tau) / secondPeriod
  );
  const rowsInWindow = [
    ...rows.filter((row) => row.tau > first.tau && row.tau < third.tau),
    first,
    second,
    third
  ]
    .sort((a, b) => a.tau - b.tau)
    .map((row) => ({ ...row, phase: phaseForTau(row.tau) }))
    .filter((row) => row.phase >= 0 && row.phase <= 2);
  return { rows: rowsInWindow, period, firstPeriod, secondPeriod, minima: [first, second, third] };
}

function solveLinearSystem(matrix, rhs) {
  const n = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) throw new Error("Singular Fourier normal matrix");
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
  const wrappedPhase = phase >= 2 ? 0 : phase % 1;
  const basis = [1];
  for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
    const angle = TWO_PI * harmonic * wrappedPhase;
    basis.push(Math.cos(angle), Math.sin(angle));
  }
  return basis;
}

function wrapTwoPi(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function fourierParameters(phaseRows) {
  const parameterCount = 1 + 2 * HARMONICS;
  const normal = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0));
  const rhs = Array(parameterCount).fill(0);

  for (const row of phaseRows) {
    const basis = fourierBasis(row.phase);
    for (let i = 0; i < parameterCount; i += 1) {
      rhs[i] += basis[i] * row.L;
      for (let j = 0; j < parameterCount; j += 1) normal[i][j] += basis[i] * basis[j];
    }
  }

  const coefficients = solveLinearSystem(normal, rhs);
  const harmonics = [];
  for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
    const cosine = coefficients[2 * harmonic - 1];
    const sine = coefficients[2 * harmonic];
    harmonics.push({
      harmonic,
      cosine,
      sine,
      amplitude: Math.hypot(cosine, sine),
      phase: Math.atan2(-sine, cosine)
    });
  }
  const [h1, h2, h3] = harmonics;
  return {
    phi1: wrapTwoPi(h1.phase),
    phi2: wrapTwoPi(h2.phase),
    phi3: wrapTwoPi(h3.phase),
    phi21: wrapTwoPi(h2.phase - 2 * h1.phase),
    phi31: wrapTwoPi(h3.phase - 3 * h1.phase),
    r21: h2.amplitude / h1.amplitude,
    r31: h3.amplitude / h1.amplitude,
    amplitude1: h1.amplitude,
    amplitude2: h2.amplitude,
    amplitude3: h3.amplitude,
    coefficients
  };
}

function paddedRange(values, fraction = 0.08) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) {
    const pad = Math.abs(low) * fraction || 1;
    return [low - pad, high + pad];
  }
  const pad = (high - low) * fraction;
  return [low - pad, high + pad];
}

function ticks([low, high], count = 5) {
  return Array.from({ length: count }, (_unused, index) => low + ((high - low) * index) / (count - 1));
}

function fmt(value, digits = 3) {
  if (!Number.isFinite(value)) return "n/a";
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function colorForGamma(gammac) {
  const stops = [
    [0.0, "#3b82f6"],
    [0.3, "#22c55e"],
    [0.6, "#ffd166"]
  ];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [x0, c0] = stops[index];
    const [x1, c1] = stops[index + 1];
    if (gammac >= x0 && gammac <= x1) {
      const t = (gammac - x0) / (x1 - x0);
      const rgb0 = hexToRgb(c0);
      const rgb1 = hexToRgb(c1);
      return rgbToHex(rgb0.map((channel, i) => lerp(channel, rgb1[i], t)));
    }
  }
  return gammac < stops[0][0] ? stops[0][1] : stops.at(-1)[1];
}

function subscripted(symbol, subscript) {
  return `<tspan font-style="italic">${symbol}<tspan baseline-shift="sub" font-size="70%">${subscript}</tspan></tspan>`;
}

function phi(subscript) {
  return subscripted("&phi;", subscript);
}

function gammaC() {
  return subscripted("&gamma;", "c");
}

function amplitude(subscript) {
  return subscripted("A", subscript);
}

function ratio(subscript) {
  return subscripted("r", subscript);
}

function panelSvg(panel, points, xlim) {
  const paddedY = paddedRange(points.map((point) => point[panel.key]), 0.1);
  const ylim = panel.phase
    ? [Math.max(0, paddedY[0]), Math.min(TWO_PI, paddedY[1])]
    : [Math.max(0, paddedY[0]), paddedY[1]];
  const sx = (value) => panel.left + ((value - xlim[0]) / (xlim[1] - xlim[0])) * panel.width;
  const sy = (value) => panel.top + panel.height - ((value - ylim[0]) / (ylim[1] - ylim[0])) * panel.height;
  const yTicks = ticks(ylim, 5);
  const parts = [
    `<rect x="${panel.left}" y="${panel.top}" width="${panel.width}" height="${panel.height}" rx="6" fill="${COLORS.panel}" stroke="${COLORS.axis}" stroke-width="1.2"/>`,
    `<text x="${panel.left + panel.width / 2}" y="${panel.top - 14}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="${COLORS.text}">${panel.title}</text>`
  ];

  for (const tick of ticks(xlim, 5)) {
    const x = sx(tick);
    parts.push(`<line x1="${x.toFixed(2)}" y1="${panel.top}" x2="${x.toFixed(2)}" y2="${panel.top + panel.height}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x.toFixed(2)}" y="${panel.top + panel.height + 23}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" fill="${COLORS.muted}">${fmt(tick, 3)}</text>`);
  }
  for (const tick of yTicks) {
    const y = sy(tick);
    parts.push(`<line x1="${panel.left}" y1="${y.toFixed(2)}" x2="${panel.left + panel.width}" y2="${y.toFixed(2)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${panel.left - 12}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="12" fill="${COLORS.muted}">${fmt(tick, panel.phase ? 2 : 3)}</text>`);
  }
  if (panel.showXLabel) {
    parts.push(`<text x="${panel.left + panel.width / 2}" y="${panel.top + panel.height + 50}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="${COLORS.text}">period (&tau;)</text>`);
  }
  parts.push(`<text x="${panel.left - 54}" y="${panel.top + panel.height / 2}" text-anchor="middle" transform="rotate(-90 ${panel.left - 54} ${panel.top + panel.height / 2})" font-family="Inter, Arial, sans-serif" font-size="14" fill="${COLORS.text}">${panel.ylabel}</text>`);

  for (const point of points) {
    parts.push(`
    <circle cx="${sx(point.period).toFixed(2)}" cy="${sy(point[panel.key]).toFixed(2)}" r="4.7" fill="${colorForGamma(point.gammac)}" stroke="#08111f" stroke-width="1.1">
      <title>gamma_c=${fmt(point.gammac, 2)}, period=${fmt(point.period, 4)}, ${panel.key}=${fmt(point[panel.key], 4)}</title>
    </circle>`);
  }

  return parts.join("\n");
}

function colorbarSvg(colorbar) {
  const colorStops = Array.from({ length: 25 }, (_unused, index) => {
    const y0 = colorbar.top + (colorbar.height * index) / 25;
    const y1 = colorbar.top + (colorbar.height * (index + 1)) / 25;
    const gammac = 0.6 * (1 - (index + 0.5) / 25);
    return `<rect x="${colorbar.left}" y="${y0.toFixed(2)}" width="${colorbar.width}" height="${(y1 - y0 + 0.5).toFixed(2)}" fill="${colorForGamma(gammac)}"/>`;
  }).join("\n");
  const gammaTicks = [0, 0.2, 0.4, 0.6].map((tick) => {
    const y = colorbar.top + colorbar.height * (1 - tick / 0.6);
    return `<line x1="${colorbar.left + colorbar.width}" y1="${y.toFixed(2)}" x2="${colorbar.left + colorbar.width + 8}" y2="${y.toFixed(2)}" stroke="${COLORS.axis}" stroke-width="1"/>
      <text x="${colorbar.left + colorbar.width + 14}" y="${(y + 4).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="13" fill="${COLORS.muted}">${fmt(tick, 1)}</text>`;
  }).join("\n");
  return `<rect x="${colorbar.left}" y="${colorbar.top}" width="${colorbar.width}" height="${colorbar.height}" fill="none" stroke="${COLORS.axis}" stroke-width="1"/>
  ${colorStops}
  <rect x="${colorbar.left}" y="${colorbar.top}" width="${colorbar.width}" height="${colorbar.height}" fill="none" stroke="${COLORS.axis}" stroke-width="1"/>
  ${gammaTicks}
  <text x="${colorbar.left + colorbar.width / 2}" y="${colorbar.top - 16}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" fill="${COLORS.text}">${gammaC()}</text>`;
}

function plotSvg(points) {
  const xlim = paddedRange(points.map((point) => point.period), 0.06);
  const panelWidth = 395;
  const panelHeight = 250;
  const panels = [
    { key: "r21", title: `${ratio("21")} vs period`, ylabel: ratio("21"), left: 96, top: 118, width: panelWidth, height: panelHeight },
    { key: "phi21", title: `${phi("21")} vs period`, ylabel: `${phi("21")} (rad)`, left: 580, top: 118, width: panelWidth, height: panelHeight, phase: true },
    { key: "r31", title: `${ratio("31")} vs period`, ylabel: ratio("31"), left: 96, top: 478, width: panelWidth, height: panelHeight, showXLabel: true },
    { key: "phi31", title: `${phi("31")} vs period`, ylabel: `${phi("31")} (rad)`, left: 580, top: 478, width: panelWidth, height: panelHeight, phase: true, showXLabel: true }
  ];
  const colorbar = { left: 1040, top: 118, width: 24, height: 610 };
  const panelMarkup = panels.map((panel) => panelSvg(panel, points, xlim)).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" viewBox="0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}">
  <rect width="100%" height="100%" fill="${COLORS.background}"/>
  <text x="${PLOT_WIDTH / 2}" y="38" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700" fill="${COLORS.text}">RR Lyrae convective fraction Fourier parameters</text>
  <text x="${PLOT_WIDTH / 2}" y="64" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="${COLORS.muted}">${ratio("21")}, ${phi("21")}, ${ratio("31")}, and ${phi("31")} from the last two minimum-light cycles; models with ${amplitude("1")}, ${amplitude("2")}, or ${amplitude("3")} &lt; ${MIN_HARMONIC_AMPLITUDE} removed.</text>
  ${panelMarkup}
  ${colorbarSvg(colorbar)}
</svg>
`;
}

async function renderPng(svg, outputPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: PLOT_WIDTH, height: PLOT_HEIGHT } });
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:${COLORS.background}}</style>${svg}`, { waitUntil: "load" });
    await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: PLOT_WIDTH, height: PLOT_HEIGHT }, omitBackground: false });
  } finally {
    await browser.close();
  }
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function fourierCsv(points) {
  const columns = [
    "frame",
    "gammac",
    "zetac",
    "m",
    "maxStep",
    "period",
    "firstPeriod",
    "secondPeriod",
    "r21",
    "phi21",
    "r31",
    "phi31",
    "phi1",
    "phi2",
    "phi3",
    "amplitude1",
    "amplitude2",
    "amplitude3",
    "status",
    "message",
    "phaseRows"
  ];
  const rows = points.map((point) => [
    point.frame,
    point.gammac.toFixed(2),
    ZETAC,
    SHELL_M,
    ANIMATION_MAX_STEP,
    point.period,
    point.firstPeriod,
    point.secondPeriod,
    point.r21,
    point.phi21,
    point.r31,
    point.phi31,
    point.phi1,
    point.phi2,
    point.phi3,
    point.amplitude1,
    point.amplitude2,
    point.amplitude3,
    point.status,
    point.message,
    point.phaseRows
  ]);
  return [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

async function main() {
  const options = parseArgs();
  const { PRESETS, DEFAULT_PRESET_NAME, solveModel } = await loadModelModule();
  const basePreset = PRESETS[DEFAULT_PRESET_NAME];

  console.log(`Computing Fourier parameters for ${FRAME_COUNT} models from ${DEFAULT_PRESET_NAME}`);
  const points = [];
  for (const [index, gammac] of GAMMAC_VALUES.entries()) {
    const parameters = {
      ...basePreset,
      gammac,
      m: SHELL_M,
      maxStep: ANIMATION_MAX_STEP,
      runUntilStable: false,
      tEnd: TAU_MAX,
      zetac: ZETAC
    };
    const result = solveModel(parameters);
    if (result.status !== "complete") {
      throw new Error(`Frame ${index} gamma_c=${gammac.toFixed(2)} stopped with ${result.status}: ${result.message}`);
    }
    const phase = foldLastTwoCyclesAtMinimumLight(result.rows);
    const fourier = fourierParameters(phase.rows);
    points.push({
      frame: index,
      gammac,
      period: phase.period,
      firstPeriod: phase.firstPeriod,
      secondPeriod: phase.secondPeriod,
      r21: fourier.r21,
      phi21: fourier.phi21,
      r31: fourier.r31,
      phi31: fourier.phi31,
      phi1: fourier.phi1,
      phi2: fourier.phi2,
      phi3: fourier.phi3,
      amplitude1: fourier.amplitude1,
      amplitude2: fourier.amplitude2,
      amplitude3: fourier.amplitude3,
      status: result.status,
      message: result.message,
      phaseRows: phase.rows.length
    });
    console.log(`model ${String(index).padStart(2, "0")}  gamma_c=${gammac.toFixed(2)}  period=${phase.period.toFixed(4)}  r21=${fourier.r21.toFixed(4)}  phi21=${fourier.phi21.toFixed(4)}  r31=${fourier.r31.toFixed(4)}  phi31=${fourier.phi31.toFixed(4)}`);
  }

  await mkdir(options.outputDir, { recursive: true });
  const filteredPoints = points.filter((point) => (
    point.amplitude1 >= MIN_HARMONIC_AMPLITUDE
    && point.amplitude2 >= MIN_HARMONIC_AMPLITUDE
    && point.amplitude3 >= MIN_HARMONIC_AMPLITUDE
  ));
  const removed = points.length - filteredPoints.length;
  console.log(`removed ${removed} low-amplitude models with A1, A2, or A3 < ${MIN_HARMONIC_AMPLITUDE}`);

  const svg = plotSvg(filteredPoints);
  const svgPath = path.join(options.outputDir, "fourier_parameters_vs_period.svg");
  const pngPath = path.join(options.outputDir, "fourier_parameters_vs_period.png");
  const csvPath = path.join(options.outputDir, "fourier_parameters_vs_period.csv");
  await writeFile(svgPath, svg, "utf8");
  await writeFile(csvPath, fourierCsv(filteredPoints), "utf8");
  await renderPng(svg, pngPath);
  console.log(svgPath);
  console.log(pngPath);
  console.log(csvPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
