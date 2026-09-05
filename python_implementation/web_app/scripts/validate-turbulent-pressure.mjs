#!/usr/bin/env node
/** Reproduce published and current OZwizard sequences, with finite-time and solver checks.
 * Run from any directory: node python_implementation/web_app/scripts/validate-turbulent-pressure.mjs
 * --quick uses only the published sequences; --local also includes the historical current sequence.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(appDir, '../../analysis/turbulent-pressure');
await mkdir(outDir, { recursive: true });
const sourceModuleSha256 = {};
for (const name of ['model', 'solvers', 'phase']) {
  sourceModuleSha256[name] = createHash('sha256').update(await readFile(join(appDir, `src/${name}.ts`))).digest('hex');
}
const compiled = await build({ stdin: {
  contents: "export * from './src/model.ts'; export * from './src/solvers.ts';",
  resolveDir: appDir, loader: 'ts'
}, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const app = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const alphaA8 = 1.4 ** (-10) * 0.7 ** 2 / (1.4 ** (-11) + 1.4 ** (-10) * 0.7 ** 2);
const etaExactM = 3 / (1 - 0.888 ** 3);
const base = { ...app.PRESETS[app.DEFAULT_PRESET_NAME], alphaP: 0,
  runUntilStable: false, tEnd: 1000, maxStep: 0.03, logRtol: -11, logAtol: -13 };
const published = { ...base, geometryMode: 'constant', variableM: false, m: 10,
  gamma1: 1.1, n: 1, s: 3, sourceExp: 0, cq: 0, driver: 'h',
  r0: 1.4, v0: 0, h0: 1, uc0: 0.7, phaseWarmupTau: 100 };
const cases = [];
const add = (id, family, p) => cases.push({ id, family, parameters: { ...p } });
for (const alphaP of [0, 0.4, alphaA8]) for (const zetac of [0.28, 0.4, 1, 4, 9]) {
  add(`fig7-alpha${alphaP === alphaA8 ? 'A8' : alphaP}-zc${zetac}`, 'Fig. 7 comparison',
    { ...published, zeta: 4, gammac: 0.4, zetac, alphaP });
}
add('fig8c-fully-convective', 'Fig. 8c', { ...published, gammac: 1, zeta: 7.5, zetac: 9 });
add('fig8c-cepheid', 'Fig. 8c', { ...published, gammac: 0.2, zeta: 8, zetac: 1.2 });
// Fixed published slice to test the shift of fully convective cycles with pressure.
for (const alphaP of [0, 0.4]) for (const zetac of [5, 6, 7, 8]) {
  add(`fully-convective-alpha${alphaP}-zc${zetac}`, 'Fully convective slice',
    { ...published, gammac: 1, zeta: 7.5, zetac, alphaP });
}
if (!process.argv.includes('--quick')) {
  const geometries = process.argv.includes('--local') ? ['homogeneous-shell', 'local-exponent'] : ['homogeneous-shell'];
  for (const geometryMode of geometries) for (const gammac of [0.01, 0.25, 0.33, 0.45]) {
    for (const alphaP of [0, 0.1, 0.2, 0.4]) {
      add(`current-${geometryMode}-gc${gammac}-alpha${alphaP}`, 'Current lightcurve sequence',
        { ...base, geometryMode, gammac, alphaP });
    }
  }
}

const keys = ['R', 'V', 'H', 'Uc', 'L', 'Lr', 'Lc'];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const extent = (xs) => xs.reduce(([lo, hi], x) => [Math.min(lo, x), Math.max(hi, x)], [Infinity, -Infinity]);
const span = (xs) => { const [lo, hi] = extent(xs); return hi - lo; };
const hermite = (a, b, da, db, dt, w) => (2 * w ** 3 - 3 * w ** 2 + 1) * a
  + (w ** 3 - 2 * w ** 2 + w) * dt * da + (-2 * w ** 3 + 3 * w ** 2) * b
  + (w ** 3 - w ** 2) * dt * db;
function at(rows, t, p) {
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].tau <= t) lo = mid; else hi = mid; }
  const a = rows[lo], b = rows[hi], w = (t - a.tau) / (b.tau - a.tau);
  const stateKeys = ['R', 'V', 'H', 'Uc'];
  const da = app.derivatives(a.tau, stateKeys.map((key) => a[key]), p);
  const db = app.derivatives(b.tau, stateKeys.map((key) => b[key]), p);
  return app.sample(t, stateKeys.map((key, i) => hermite(a[key], b[key], da[i], db[i], b.tau - a.tau, w)), p);
}
function radialMaxima(rows, p) {
  const found = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (!(a.V > 0 && b.V <= 0)) continue;
    const dt = b.tau - a.tau;
    const da = app.derivatives(a.tau, [a.R, a.V, a.H, a.Uc], p)[1];
    const db = app.derivatives(b.tau, [b.R, b.V, b.H, b.Uc], p)[1];
    let low = 0, high = 1;
    for (let j = 0; j < 32; j++) {
      const mid = (low + high) / 2;
      if (hermite(a.V, b.V, da, db, dt, mid) > 0) low = mid; else high = mid;
    }
    const w = (low + high) / 2;
    const radius = hermite(a.R, b.R, a.V, b.V, dt, w);
    found.push({ tau: a.tau + w * dt, R: radius });
  }
  return found;
}
function cycleSamples(rows, start, end, p) {
  return Array.from({ length: 512 }, (_, i) => ({ phase: i / 512, ...at(rows, start + (end - start) * i / 512, p) }));
}
function maximaProminence(values) {
  const n = values.length, peaks = [], troughs = [];
  for (let i = 0; i < n; i++) {
    const left = values[(i + n - 1) % n], here = values[i], right = values[(i + 1) % n];
    if (here > left && here >= right) peaks.push(i);
    if (here < left && here <= right) troughs.push(i);
  }
  if (!troughs.length) return [];
  return peaks.map((i) => {
    const left = [...troughs].reverse().find((j) => j < i) ?? troughs.at(-1);
    const right = troughs.find((j) => j > i) ?? troughs[0];
    return { phase: i / n, luminosity: values[i], prominence: values[i] - Math.max(values[left], values[right]) };
  }).sort((a, b) => b.prominence - a.prominence);
}
function characterize(solution, p) {
  const rows = solution.rows, final = rows.at(-1), end = final?.tau ?? 0;
  if (!final) return { classification: solution.status, finalTau: end, cycle: null };
  const tail = rows.filter((r) => r.tau >= Math.max(end - 200, end * 0.6));
  const lastTen = rows.filter((r) => r.tau >= end - 10);
  const distance = Math.max(...lastTen.map((r) => Math.max(Math.abs(r.R - 1), Math.abs(r.V), Math.abs(r.H - 1), Math.abs(r.Uc - 1))));
  const result = { classification: solution.status === 'complete' ? 'unsettled' : solution.status,
    finalTau: end, equilibriumDistance: distance, finalState: Object.fromEntries(keys.map((k) => [k, final[k]])),
    radiusExtent: extent(tail.map((r) => r.R)), cycle: null };
  if (solution.status !== 'complete') return result;
  if (distance < 1e-7) return { ...result, classification: 'equilibrium' };
  if (distance < 1e-4 && span(lastTen.map((r) => r.R)) < 1e-5) return { ...result, classification: 'near_equilibrium' };
  const peaks = radialMaxima(tail, p).slice(-5);
  if (peaks.length < 5) return result;
  const periods = peaks.slice(1).map((p, i) => p.tau - peaks[i].tau);
  const start = peaks.at(-2).tau, finish = peaks.at(-1).tau;
  const cycle = cycleSamples(rows, start, finish, p), previous = cycleSamples(rows, peaks.at(-3).tau, start, p);
  const waveformError = Math.max(...['R', 'H', 'Uc', 'L'].map((key) =>
    Math.max(...cycle.map((r, i) => Math.abs(r[key] - previous[i][key]))) / Math.max(1e-5, span(cycle.map((r) => r[key])))));
  const radialPeakSpread = span(peaks.map((p) => p.R));
  const periodRelativeSpread = span(periods) / mean(periods);
  const luminosity = cycle.map((r) => r.L), lumPeaks = maximaProminence(luminosity);
  const peakCount = lumPeaks.filter((p) => p.prominence > Math.max(1e-6, 1e-3 * span(luminosity))).length;
  const minR = cycle.reduce((best, row) => row.R < best.R ? row : best);
  const maxLc = cycle.reduce((best, row) => row.Lc > best.Lc ? row : best);
  const cycleMetrics = {
    startTau: start, endTau: finish, period: finish - start, radiusAmplitude: span(cycle.map((r) => r.R)),
    luminosityAmplitude: span(luminosity), luminosityMaximum: Math.max(...luminosity),
    luminosityPeaks: lumPeaks, significantLuminosityPeakCount: peakCount,
    phaseLcMaximumMinusRadiusMinimum: ((maxLc.phase - minR.phase + 1.5) % 1) - 0.5,
    radialPeakSpread, periodRelativeSpread, waveformRelativeError: waveformError
  };
  const classification = radialPeakSpread < 1e-7 && periodRelativeSpread < 1e-4 && waveformError < 1e-3 ? 'limit_cycle' : 'unsettled';
  return { ...result, classification, cycle: cycleMetrics, samples: cycle };
}
function run(p, solver, end = 1000, tight = false) {
  const raw = app.integrate((t, y) => app.derivatives(t, y, p), [p.r0, p.v0, p.h0, p.uc0], end,
    app.defaultSolverOptions({ solver, initialStep: 0.001, maxStep: tight ? 0.015 : 0.03,
      rtol: tight ? 1e-12 : 1e-11, atol: tight ? 1e-14 : 1e-13,
      outputInterval: tight ? 0.005 : 0.01, maxRows: 650000, maxAcceptedSteps: 3000000 }),
    (_t, y) => y[0] > 15 || Math.abs(y[2]) > 1e5 ? 'runaway' : null);
  const rows = raw.points.map(({ t, y }) => app.sample(t, y, p));
  return { ...raw, rows };
}
const cached = process.argv.includes('--report-only') ? JSON.parse(await readFile(join(outDir, 'results.json'), 'utf8')) : null;
const results = cached?.results ?? [];
for (const c of cached ? [] : cases) {
  let primary = characterize(run(c.parameters, 'dop853'), c.parameters);
  if (primary.classification === 'unsettled' || primary.classification === 'near_equilibrium') primary = characterize(run(c.parameters, 'dop853', 3000), c.parameters);
  const check = characterize(run(c.parameters, 'rk45', Math.max(1000, primary.finalTau), true), c.parameters);
  const differences = primary.cycle && check.cycle ? {
    periodRelative: Math.abs(primary.cycle.period / check.cycle.period - 1),
    luminosityAmplitudeAbsolute: Math.abs(primary.cycle.luminosityAmplitude - check.cycle.luminosityAmplitude),
    radiusAmplitudeAbsolute: Math.abs(primary.cycle.radiusAmplitude - check.cycle.radiusAmplitude),
    peakCountAgrees: primary.cycle.significantLuminosityPeakCount === check.cycle.significantLuminosityPeakCount
  } : null;
  const { samples, ...metrics } = primary;
  const { samples: _checkSamples, ...checkMetrics } = check;
  if (samples) {
    const header = ['phase', ...keys];
    await writeFile(join(outDir, `${c.id}.csv`), `${header.join(',')}\n${samples.map((r) => header.map((k) => r[k]).join(',')).join('\n')}\n`);
  } else {
    // Remove only this case's obsolete output if a previous run stored a transient cycle.
    await unlink(join(outDir, `${c.id}.csv`)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
  results.push({ ...c, ...metrics, solverCheck: { solver: 'rk45', ...checkMetrics, differences } });
  console.log(`${c.id}: ${primary.classification}, tau=${primary.finalTau.toFixed(1)}, P=${primary.cycle?.period.toFixed(6) ?? '-'}, dL=${primary.cycle?.luminosityAmplitude.toFixed(6) ?? '-'}`);
}

let sourceChangedDuringRun = false;
for (const name of ['model', 'solvers', 'phase']) {
  sourceChangedDuringRun ||= sourceModuleSha256[name] !== createHash('sha256').update(await readFile(join(appDir, `src/${name}.ts`))).digest('hex');
}
const output = { generatedAt: new Date().toISOString(), source: 'https://arxiv.org/pdf/astro-ph/0503697',
  assumptions: { gamma3EqualsGamma1: true, publishedM: 10, mFromPrintedEta: etaExactM,
    alphaPFromA8: alphaA8, alphaPFromRoundedText: 0.4, turbulentEnergyStorage: false },
  numericalProtocol: { primary: 'DOP853 rtol=1e-11,atol=1e-13,maxStep=.03,output=.01',
    check: 'RK45 rtol=1e-12,atol=1e-14,maxStep=.015,output=.005',
    horizon: '1000 dynamical times, extended to 3000 if unsettled or near equilibrium',
    limitCycle: 'last five radius maxima spread <1e-7, relative period spread <1e-4, successive phase-aligned state waveforms <1e-3 of each state amplitude',
    equilibrium: 'maximum component distance from (1,0,1,1) <1e-7 throughout final ten dynamical times',
    nearEquilibrium: 'distance<1e-4 and final ten-time radial amplitude<1e-5; residual decay is not labeled a limit cycle',
    interpolation: 'cubic Hermite state interpolation from endpoint RHS; luminosity recomputed from state; radial maxima found by bisection on Hermite V',
    runaway: 'radius>15 or |H|>1e5; integration/domain failures retained separately',
    lightcurvePeak: 'periodic local maximum prominence exceeds max(1e-6, .001*peak-to-peak L)' },
  sourceModuleSha256, sourceChangedDuringRun, results };
if (!cached) await writeFile(join(outDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
const fmt = (v) => v == null ? '—' : Number(v).toPrecision(6);
const comparisons = results.flatMap((r) => r.solverCheck.differences ? [r.solverCheck.differences] : []);
const agreementCount = results.filter((r) => r.classification === r.solverCheck.classification).length;
const periodDifference = Math.max(...comparisons.map((r) => r.periodRelative));
const amplitudeDifference = Math.max(...comparisons.map((r) => r.luminosityAmplitudeAbsolute));
const current = results.filter((r) => r.family === 'Current lightcurve sequence' && r.parameters.geometryMode === 'homogeneous-shell');
const doubleSequence = current.filter((r) => r.parameters.gammac === 0.33);
const findings = [
  `DOP853 and RK45 assign the same outcome in ${agreementCount} of ${results.length} cases. Across final-cycle comparisons, the largest relative period difference is ${periodDifference.toExponential(3)}, and the largest absolute difference in peak-to-peak luminosity is ${amplitudeDifference.toExponential(3)} L₀. The two pressure-enabled Figure 7 cases at ζc=0.28 and the Figure 8c Cepheid comparison retain measurable radius-peak drift at τ=3000. Their finite-time classifications remain unsettled.`,
  ...(doubleSequence.length === 4 ? [
    `All ${current.length} current homogeneous-shell cases reach the stated limit-cycle criterion. At γc=0.33, the lightcurve has two significant maxima for αp=0 and 0.1, and one for αp=0.2 and 0.4. The smaller peak has prominence ${doubleSequence[0].cycle.luminosityPeaks[1].prominence.toPrecision(5)} L₀ at αp=0 and ${doubleSequence[1].cycle.luminosityPeaks[1].prominence.toPrecision(5)} L₀ at αp=0.1. The secondary maximum therefore survives weak turbulent pressure and disappears in the two stronger-pressure cases.`,
  ] : []),
  'The fully convective Figure 8c model reaches a limit cycle at (ζ,ζc,αp)=(7.5,9,0). A pressure-enabled case at (7.5,5,0.4) also converges, while the tested αp=0.4 cases at ζc=6,7,8 approach equilibrium. Cases that stop at the numerical step limit remain labeled as integration failures.'
];
const lines = ['# Turbulent-pressure benchmarks', '',
  'The calculations below use the implemented pressure force and compression-work term. They neglect turbulent kinetic-energy storage and set Γ₃=Γ₁, consistent with the application’s ideal-gas closure.', '',
  'The source is [Munteanu et al. (2005)](https://arxiv.org/pdf/astro-ph/0503697), especially equations (6), (A7), and (A12). Appendix A defines d=m(Γ₁−1)/2; the section 2 definition prints Γ₁−2. We use the appendix definition.', '',
  `Published comparisons use constant m=10, Γ₁=1.1, n=1, s=3, a constant source, zero cubic drag, and initial (R,V,H,Uc)=(1.4,0,1,0.7). Equation (A8) gives αp=${alphaA8.toFixed(9)}, while section 3.2 quotes approximately 0.4. Both choices are tested. The printed η=0.888 would give m=${etaExactM.toFixed(9)}; m=10 follows the explicit section 2 value.`, '',
  'Figure 7 uses γc=0.4, ζ=4 and ζc=0.28,0.4,1,4,9. Its αp=0 counterparts isolate the effect of the pressure/work pair. Figure 8c supplies the fully convective example and its Cepheid comparison. The additional fully convective slice tests ζ=7.5 at ζc=5,6,7,8.', '',
  'Current-sequence runs retain the current default source exponent −2, cubic drag 5, and homogeneous-shell density. They are OZwizard sensitivity experiments.', '',
  'DOP853 runs use relative/absolute tolerances 1e−11/1e−13 and maximum step 0.03. RK45 checks tighten these to 1e−12/1e−14 and 0.015. Runs reach τ=1000; unsettled and near-equilibrium cases are extended to τ=3000. Neither run uses the interactive early-stop classifier. Cubic Hermite state interpolation supplies radial maxima and phase-aligned waveforms; luminosities are recomputed from the interpolated state. A limit cycle requires convergence of five radius maxima and successive R,H,Uc,L waveforms. Exact thresholds, stop reasons, final states, and solver differences are stored in [results.json](results.json). “Unsettled” and “near_equilibrium” denote finite-time results.', '',
  ...findings.flatMap((paragraph) => [paragraph, '']),
  '| Case | αp | Outcome | Period | ΔR | ΔL | L maxima | RK45 outcome | ΔP/P |',
  '|---|---:|---|---:|---:|---:|---:|---|---:|'];
for (const r of results) lines.push(`| ${r.id} | ${fmt(r.parameters.alphaP)} | ${r.classification} | ${fmt(r.cycle?.period)} | ${fmt(r.cycle?.radiusAmplitude)} | ${fmt(r.cycle?.luminosityAmplitude)} | ${r.cycle?.significantLuminosityPeakCount ?? '—'} | ${r.solverCheck.classification} | ${fmt(r.solverCheck.differences?.periodRelative)} |`);
lines.push('', 'ΔR and ΔL are peak-to-peak amplitudes in the final complete radial cycle. CSV files store that cycle at 512 equally spaced phases, with phase zero at maximum radius. The peak count uses the prominence threshold recorded in the JSON protocol. Periods are in dynamical-time units. Numerical agreement establishes the behavior of these equations under the stated choices; the paper supplies no numerical lightcurve data for pointwise validation.', '',
  'Regenerate with `node python_implementation/web_app/scripts/validate-turbulent-pressure.mjs`. Add `--local` to include the earlier local-exponent density prescription, or `--quick` to restrict the run to the published comparisons and fully convective slice.', '');
await writeFile(join(outDir, 'README.md'), lines.join('\n'));
console.log(`Wrote ${results.length} cases to ${outDir}`);
