# Stellingwerf One-Zone Pulsation Workspace

This workspace is split into two intentionally separate trees.

## `stellingwerf_original/`

Original Stellingwerf and S_Tran material, kept apart from the Python work:

- `codes/`: original S_Tran model and plotting files.
- `documentation/`: original Word/text documentation.
- `s_tran_runtime/`: recovered S_Tran runtime source and archive.

## `python_implementation/`

Our Python translation, documentation, and generated outputs:

- `src/`: Python model translations, plotters, and reproduction scripts.
- `docs/`: generated MathJax documentation for the equations.
- `web_app/`: the interactive Wizard of OZ model explorer.
- `outputs/`: generated CSV and SVG products.

## Canonical Commands

Run these from this directory:

```powershell
python -B python_implementation/src/oz1.py --quiet
python -B python_implementation/src/ozc.py --quiet
python -B python_implementation/src/stellingwerf1986.py
python -B python_implementation/src/plot_two_phase_lightcurve.py --source paper-strip
python -B python_implementation/src/plot_two_phase_lightcurve.py --source paper-strip-abs-v
python -B python_implementation/src/plot_two_phase_lightcurve.py --source oz1
```

The Python scripts now use the adaptive RK45 solver by default. The OZ1/OZC
scripts and phase plotter run until the model reaches equilibrium or a stable
limit cycle, with the requested final time treated as a maximum cap. That cap
defaults to `--max-time 120`; stable limit-cycle detection requires five full
repeated cycles by default. Use `--fixed-time --max-time 10` for the old
fixed-duration workflow, `--solver midpoint` to reproduce the historical
S_Tran midpoint integration, or `--solver dop853` for the high-accuracy
reference solver. Modern solvers accept `--rtol`, `--atol`, and `--max-step`;
midpoint also honors the legacy `--err-tol`. `stellingwerf1986.py` keeps its
paper figure windows by default and uses `--max-time` only when
`--run-until-stable` is supplied.

The normal Strip phase plot uses `sqrt(P)` in the convective velocity equation.
The `paper-strip-abs-v` variant changes only that driver to `sqrt(abs(V))`.

The interactive explorer is now a Vite + TypeScript app:

```powershell
cd python_implementation/web_app
npm install
npm run dev
npm test
npm run test:e2e
```

Open the served `wizard_of_oz.html` URL from Vite to explore the equations
interactively. The app defaults to RK45, runs until stability or the maximum
time cap, shows the stop reason explicitly, and can compare the selected solver
against the historical midpoint method. Its default cap is
\({\tau}_{max}=120\), with the control allowing values up to 240.

For a disk-opened copy, run `npm run build` first. That writes a classic
fallback bundle under `python_implementation/web_app/dist/assets/`, allowing
both `python_implementation/web_app/wizard_of_oz.html` and
`python_implementation/web_app/dist/wizard_of_oz.html` to work from `file://`.
