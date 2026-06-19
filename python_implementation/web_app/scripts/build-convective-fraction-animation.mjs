import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
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
const FRAME_DURATION_SECONDS = 0.14;

const COLORS = {
  background: "#08111f",
  panel: "#0c1728",
  grid: "#26334e",
  axis: "#526489",
  text: "#d9e7ff",
  muted: "#9aa8bd",
  luminosity: "#c084fc",
  velocity: "#ff6f91",
  highlight: "#ffd166"
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    outputDir: OUTPUT_DIR,
    keepFrames: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      options.outputDir = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--no-frames") {
      options.keepFrames = false;
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
  if (!refined) {
    return { ...center, sampleTau: center.tau, sampleL: center.L, refinementTau: 0 };
  }
  return {
    ...interpolateRow(rows, refined.tau),
    L: refined.luminosity,
    sampleTau: center.tau,
    sampleL: center.L,
    refinementTau: refined.tau - center.tau
  };
}

function foldLastTwoCyclesAtMinimumLight(rows) {
  const minima = findLuminosityMinima(rows);
  if (minima.length < 3) {
    throw new Error(`Need three luminosity minima, found ${minima.length}`);
  }
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
  const foldedRows = [
    ...rows.filter((row) => row.tau > first.tau && row.tau < third.tau),
    first,
    second,
    third
  ]
    .sort((a, b) => a.tau - b.tau)
    .map((row) => ({ ...row, phase: phaseForTau(row.tau) }))
    .filter((row) => row.phase >= 0 && row.phase <= 2);
  return {
    rows: foldedRows,
    period,
    firstPeriod,
    secondPeriod,
    minima: [first, second, third]
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
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function panelMapper(panel) {
  return {
    sx: (value) => panel.left + ((value - panel.xlim[0]) / (panel.xlim[1] - panel.xlim[0])) * panel.width,
    sy: (value) => panel.top + panel.height - ((value - panel.ylim[0]) / (panel.ylim[1] - panel.ylim[0])) * panel.height
  };
}

function polyline(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function drawAxes(panel, xlabel, ylabel) {
  const { sx, sy } = panelMapper(panel);
  const parts = [
    `<rect x="${panel.left}" y="${panel.top}" width="${panel.width}" height="${panel.height}" rx="6" fill="${COLORS.panel}" stroke="${COLORS.axis}" stroke-width="1.2"/>`
  ];
  for (const tick of ticks(panel.xlim, 5)) {
    const x = sx(tick);
    parts.push(`<line x1="${x.toFixed(2)}" y1="${panel.top}" x2="${x.toFixed(2)}" y2="${panel.top + panel.height}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x.toFixed(2)}" y="${panel.top + panel.height + 26}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="${COLORS.muted}">${fmt(tick, 1)}</text>`);
  }
  for (const tick of ticks(panel.ylim, 5)) {
    const y = sy(tick);
    parts.push(`<line x1="${panel.left}" y1="${y.toFixed(2)}" x2="${panel.left + panel.width}" y2="${y.toFixed(2)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${panel.left - 12}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="13" fill="${COLORS.muted}">${fmt(tick, 2)}</text>`);
  }
  parts.push(`<line x1="${sx(1).toFixed(2)}" y1="${panel.top}" x2="${sx(1).toFixed(2)}" y2="${panel.top + panel.height}" stroke="${COLORS.axis}" stroke-dasharray="7 6" stroke-width="1.1"/>`);
  parts.push(`<text x="${panel.left + panel.width / 2}" y="${panel.top + panel.height + 54}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="15" fill="${COLORS.text}">${escapeXml(xlabel)}</text>`);
  parts.push(`<text x="${panel.left - 58}" y="${panel.top + panel.height / 2}" text-anchor="middle" transform="rotate(-90 ${panel.left - 58} ${panel.top + panel.height / 2})" font-family="Inter, Arial, sans-serif" font-size="15" fill="${COLORS.text}">${escapeXml(ylabel)}</text>`);
  return parts.join("\n");
}

function curve(frame, panel, key, color) {
  const { sx, sy } = panelMapper(panel);
  const points = frame.phaseRows.map((row) => [sx(row.phase), sy(row[key])]);
  return `<polyline points="${polyline(points)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function frameTitle(frame) {
  return `RR Lyrae low-amplitude fundamental, damped  |  ζc=${fmt(frame.zetac, 2)}, γc=${fmt(frame.gammac, 2)}, m=${fmt(frame.m, 1)}  |  period=${fmt(frame.period, 3)}`;
}

function animationAttributes(frameIndex, frameCount) {
  const keyTimes = Array.from({ length: frameCount + 1 }, (_unused, index) => (index / frameCount).toFixed(6)).join(";");
  const values = Array.from({ length: frameCount + 1 }, (_unused, index) => (index === frameIndex ? "visible" : "hidden")).join(";");
  const duration = (frameCount * FRAME_DURATION_SECONDS).toFixed(2);
  return `visibility="${frameIndex === 0 ? "visible" : "hidden"}"><animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${duration}s" repeatCount="indefinite" calcMode="discrete"/>`;
}

function frameGroup(frame, frameIndex, frameCount, panels) {
  return `
  <g id="frame-${String(frameIndex).padStart(3, "0")}" ${animationAttributes(frameIndex, frameCount)}
    <text x="500" y="38" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="${COLORS.text}">${escapeXml(frameTitle(frame))}</text>
    <text x="500" y="62" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="${COLORS.muted}">Integrated to τ=${TAU_MAX}; last three quadratically refined luminosity minima map to phases 0, 1, and 2.</text>
    ${curve(frame, panels.luminosity, "L", COLORS.luminosity)}
    ${curve(frame, panels.velocity, "V", COLORS.velocity)}
  </g>`;
}

function staticFrameSvg(frame, panels) {
  return svgDocument([frame], panels, false);
}

function svgDocument(frames, panels, animated = true) {
  const frameMarkup = frames
    .map((frame, index) => animated ? frameGroup(frame, index, frames.length, panels) : frameGroup(frame, 0, 1, panels).replace(/<animate[^>]+\/>/, ""))
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="555" viewBox="0 0 1000 555">
  <rect width="100%" height="100%" fill="${COLORS.background}"/>
  ${drawAxes(panels.luminosity, "phase", "luminosity L")}
  ${drawAxes(panels.velocity, "phase", "radial velocity V")}
  <text x="252" y="106" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="${COLORS.luminosity}">Luminosity vs phase</text>
  <text x="742" y="106" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="${COLORS.velocity}">Radial velocity vs phase</text>
  ${frameMarkup}
</svg>
`;
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function summaryCsv(frames) {
  const columns = [
    "frame",
    "gammac",
    "zetac",
    "m",
    "maxStep",
    "period",
    "firstPeriod",
    "secondPeriod",
    "startTau",
    "midTau",
    "endTau",
    "startSampleTau",
    "midSampleTau",
    "endSampleTau",
    "maxAbsRefinementTau",
    "status",
    "message",
    "storedRows",
    "phaseRows"
  ];
  const rows = frames.map((frame, index) => [
    index,
    frame.gammac.toFixed(2),
    frame.zetac,
    frame.m,
    frame.maxStep,
    frame.period,
    frame.firstPeriod,
    frame.secondPeriod,
    frame.minima[0].tau,
    frame.minima[1].tau,
    frame.minima[2].tau,
    frame.minima[0].sampleTau,
    frame.minima[1].sampleTau,
    frame.minima[2].sampleTau,
    Math.max(...frame.minima.map((minimum) => Math.abs(minimum.refinementTau))),
    frame.status,
    frame.message,
    frame.storedRows,
    frame.phaseRows.length
  ]);
  return [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

async function renderPngFrames(frames, panels, framesDir) {
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1000, height: 555 }
  });
  try {
    for (const [index, frame] of frames.entries()) {
      const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:${COLORS.background}}</style>${staticFrameSvg(frame, panels)}`;
      await page.setContent(html, { waitUntil: "load" });
      await page.screenshot({
        path: path.join(framesDir, `frame_${String(index).padStart(3, "0")}.png`),
        clip: { x: 0, y: 0, width: 1000, height: 555 },
        omitBackground: false
      });
    }
  } finally {
    await browser.close();
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function encodeLoopingGif(framesDir, outputPath) {
  const frameRate = (1 / FRAME_DURATION_SECONDS).toFixed(6);
  const inputPattern = path.join(framesDir, "frame_%03d.png");
  const palettePath = path.join(path.dirname(outputPath), "rr_lyrae_convective_fraction_palette.png");
  await runCommand("ffmpeg", [
    "-y",
    "-framerate", frameRate,
    "-i", inputPattern,
    "-vf", "palettegen=stats_mode=diff",
    "-frames:v", "1",
    "-update", "1",
    palettePath
  ], WEB_APP_DIR);
  await runCommand("ffmpeg", [
    "-y",
    "-framerate", frameRate,
    "-i", inputPattern,
    "-i", palettePath,
    "-lavfi", "paletteuse=dither=bayer:bayer_scale=3",
    "-loop", "0",
    outputPath
  ], WEB_APP_DIR);
  await rm(palettePath, { force: true });
}

async function main() {
  const options = parseArgs();
  const { PRESETS, DEFAULT_PRESET_NAME, solveModel } = await loadModelModule();
  const basePreset = PRESETS[DEFAULT_PRESET_NAME];

  console.log(`Generating ${FRAME_COUNT} frames from ${DEFAULT_PRESET_NAME}`);
  const frames = [];
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
      throw new Error(`Frame ${index} γc=${gammac.toFixed(2)} stopped with ${result.status}: ${result.message}`);
    }
    const phase = foldLastTwoCyclesAtMinimumLight(result.rows);
    frames.push({
      gammac,
      m: SHELL_M,
      maxStep: ANIMATION_MAX_STEP,
      zetac: ZETAC,
      status: result.status,
      message: result.message,
      storedRows: result.rows.length,
      phaseRows: phase.rows,
      period: phase.period,
      firstPeriod: phase.firstPeriod,
      secondPeriod: phase.secondPeriod,
      minima: phase.minima
    });
    console.log(`frame ${String(index).padStart(2, "0")}  γc=${gammac.toFixed(2)}  period=${phase.period.toFixed(4)}  rows=${result.rows.length}`);
  }

  const luminosityRange = paddedRange(frames.flatMap((frame) => frame.phaseRows.map((row) => row.L)));
  const velocityRange = paddedRange(frames.flatMap((frame) => frame.phaseRows.map((row) => row.V)));
  const panels = {
    luminosity: { left: 92, top: 130, width: 360, height: 300, xlim: [0, 2], ylim: luminosityRange },
    velocity: { left: 582, top: 130, width: 360, height: 300, xlim: [0, 2], ylim: velocityRange }
  };

  await mkdir(options.outputDir, { recursive: true });
  const animationPath = path.join(options.outputDir, "rr_lyrae_convective_fraction.gif");
  const summaryPath = path.join(options.outputDir, "summary.csv");
  await rm(path.join(options.outputDir, "rr_lyrae_convective_fraction.svg"), { force: true });
  await writeFile(summaryPath, summaryCsv(frames), "utf8");

  const framesDir = options.keepFrames
    ? path.join(options.outputDir, "frames")
    : path.join(os.tmpdir(), `ozwizard-gif-frames-${Date.now()}-${process.pid}`);
  await renderPngFrames(frames, panels, framesDir);
  await encodeLoopingGif(framesDir, animationPath);
  if (!options.keepFrames) await rm(framesDir, { recursive: true, force: true });

  console.log(animationPath);
  console.log(summaryPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
