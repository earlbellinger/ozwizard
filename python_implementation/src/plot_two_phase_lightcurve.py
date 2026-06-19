"""Create a two-cycle phase plot from one of the one-zone model sources."""

from __future__ import annotations

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass
from html import escape
from pathlib import Path

from oz1 import OZ1Model, OZ1Parameters
from solvers import DEFAULT_SOLVER, SOLVER_NAMES, SolverName
from stellingwerf1986 import PaperModel, PaperModelParams


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "two_phase"
Row = dict[str, float]
Point = tuple[float, float]


@dataclass(frozen=True)
class Panel:
    left: float
    top: float
    width: float
    height: float
    xlim: tuple[float, float]
    ylim: tuple[float, float]

    def sx(self, value: float) -> float:
        return self.left + (value - self.xlim[0]) / (self.xlim[1] - self.xlim[0]) * self.width

    def sy(self, value: float) -> float:
        return self.top + self.height - (value - self.ylim[0]) / (self.ylim[1] - self.ylim[0]) * self.height


def find_local_maxima(
    rows: Sequence[Row],
    key: str,
    after: float = 0.0,
    min_separation: float = 0.0,
) -> list[int]:
    maxima: list[int] = []
    for index in range(1, len(rows) - 1):
        if rows[index]["tau"] < after:
            continue
        if rows[index - 1][key] < rows[index][key] >= rows[index + 1][key]:
            if maxima and rows[index]["tau"] - rows[maxima[-1]]["tau"] < min_separation:
                if rows[index][key] > rows[maxima[-1]][key]:
                    maxima[-1] = index
            else:
                maxima.append(index)
    return maxima


def two_cycle_phase_rows(rows: Sequence[Row], after: float = 3.0) -> tuple[list[Row], float]:
    maxima = find_local_maxima(rows, "L", after=after, min_separation=2.0)
    if len(maxima) < 3:
        raise RuntimeError("Could not identify three luminosity maxima for a two-cycle phase plot")

    start_index = maxima[0]
    end_index = maxima[2]
    tau0 = rows[start_index]["tau"]
    period = (rows[end_index]["tau"] - tau0) / 2.0

    phase_rows: list[Row] = []
    for row in rows[start_index : end_index + 1]:
        phase = (row["tau"] - tau0) / period
        if 0.0 <= phase <= 2.0:
            phase_rows.append({**row, "Phase": phase})

    return phase_rows, period


def padded_range(values: Sequence[float], fraction: float = 0.08) -> tuple[float, float]:
    low = min(values)
    high = max(values)
    if low == high:
        pad = abs(low) * fraction or 1.0
    else:
        pad = (high - low) * fraction
    return low - pad, high + pad


def ticks(minimum: float, maximum: float, count: int = 5) -> list[float]:
    return [minimum + (maximum - minimum) * index / (count - 1) for index in range(count)]


def fmt(value: float) -> str:
    if abs(value) >= 100.0 or (0.0 < abs(value) < 0.01):
        return f"{value:.2e}"
    return f"{value:.2f}".rstrip("0").rstrip(".")


def polyline(points: Sequence[Point]) -> str:
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in points)


def draw_axes(parts: list[str], panel: Panel, xlabel: str, ylabel: str) -> None:
    parts.append(
        f'<rect x="{panel.left:.2f}" y="{panel.top:.2f}" width="{panel.width:.2f}" '
        f'height="{panel.height:.2f}" fill="#ffffff" stroke="#222" stroke-width="1.4"/>'
    )
    for tick in ticks(panel.xlim[0], panel.xlim[1], 5):
        x = panel.sx(tick)
        parts.append(f'<line x1="{x:.2f}" y1="{panel.top:.2f}" x2="{x:.2f}" y2="{panel.top + panel.height:.2f}" stroke="#e7ebef"/>')
        parts.append(f'<line x1="{x:.2f}" y1="{panel.top + panel.height:.2f}" x2="{x:.2f}" y2="{panel.top + panel.height - 8:.2f}" stroke="#222"/>')
        parts.append(
            f'<text x="{x:.2f}" y="{panel.top + panel.height + 24:.2f}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="12">{fmt(tick)}</text>'
        )
    for tick in ticks(panel.ylim[0], panel.ylim[1], 5):
        y = panel.sy(tick)
        parts.append(f'<line x1="{panel.left:.2f}" y1="{y:.2f}" x2="{panel.left + panel.width:.2f}" y2="{y:.2f}" stroke="#e7ebef"/>')
        parts.append(f'<line x1="{panel.left:.2f}" y1="{y:.2f}" x2="{panel.left + 8:.2f}" y2="{y:.2f}" stroke="#222"/>')
        parts.append(
            f'<text x="{panel.left - 12:.2f}" y="{y + 4:.2f}" text-anchor="end" '
            f'font-family="Arial, sans-serif" font-size="12">{fmt(tick)}</text>'
        )
    parts.append(
        f'<text x="{panel.left + panel.width / 2:.2f}" y="{panel.top + panel.height + 48:.2f}" '
        f'text-anchor="middle" font-family="Arial, sans-serif" font-size="14">{escape(xlabel)}</text>'
    )
    parts.append(
        f'<text x="{panel.left - 50:.2f}" y="{panel.top + panel.height / 2:.2f}" text-anchor="middle" '
        f'transform="rotate(-90 {panel.left - 50:.2f} {panel.top + panel.height / 2:.2f})" '
        f'font-family="Arial, sans-serif" font-size="14">{escape(ylabel)}</text>'
    )


def write_two_panel_svg(rows: Sequence[Row], output_path: Path) -> None:
    width = 980
    height = 390
    left = Panel(84, 34, 365, 275, (0.0, 2.0), padded_range([row["L"] for row in rows]))
    right = Panel(570, 34, 365, 275, (0.0, 2.0), padded_range([row["V"] for row in rows]))

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
    ]

    draw_axes(parts, left, "Phase", "Luminosity L")
    draw_axes(parts, right, "Phase", "Radial velocity V")

    for phase_mark in (1.0,):
        for panel in (left, right):
            x = panel.sx(phase_mark)
            parts.append(
                f'<line x1="{x:.2f}" y1="{panel.top:.2f}" x2="{x:.2f}" y2="{panel.top + panel.height:.2f}" '
                'stroke="#9aa6b2" stroke-dasharray="6 5"/>'
            )

    lum_points = [(left.sx(row["Phase"]), left.sy(row["L"])) for row in rows]
    vel_points = [(right.sx(row["Phase"]), right.sy(row["V"])) for row in rows]
    parts.append(
        f'<polyline points="{polyline(lum_points)}" fill="none" stroke="#111111" '
        'stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>'
    )
    parts.append(
        f'<polyline points="{polyline(vel_points)}" fill="none" stroke="#111111" '
        'stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>'
    )
    parts.append("</svg>")
    output_path.write_text("\n".join(parts), encoding="utf-8")


def write_csv(path: Path, rows: Sequence[Row]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("Phase", "tau", "R", "V", "H", "L"), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def rows_from_source(
    source: str,
    *,
    solver: SolverName = DEFAULT_SOLVER,
    rtol: float = 1.0e-8,
    atol: float = 1.0e-10,
    max_step: float = 0.15,
    max_time: float = 120.0,
    err_tol: float | None = None,
    run_until_stable: bool = True,
    stability_tol: float = 2.0e-3,
    stable_cycles: int = 5,
) -> tuple[list[Row], float]:
    if source == "paper-strip":
        params = PaperModelParams("Strip", zeta=1.0, zetac=1.0, gammac=0.2)
        rows = PaperModel(params).run(
            max_time,
            solver=solver,
            rtol=rtol,
            atol=atol,
            max_step=max_step,
            err_tol=err_tol or 1.0e-7,
            run_until_stable=run_until_stable,
            stability_tol=stability_tol,
            stable_cycles=stable_cycles,
        )
        return rows, 4.0
    if source == "paper-strip-abs-v":
        params = PaperModelParams("Strip", zeta=1.0, zetac=1.0, gammac=0.2, convective_driver="abs-v")
        rows = PaperModel(params).run(
            max_time,
            solver=solver,
            rtol=rtol,
            atol=atol,
            max_step=max_step,
            err_tol=err_tol or 1.0e-7,
            run_until_stable=run_until_stable,
            stability_tol=stability_tol,
            stable_cycles=stable_cycles,
        )
        return rows, 4.0
    if source == "oz1":
        params = OZ1Parameters()
        params.t_last = max_time
        rows = [
            sample.as_row()
            for sample in OZ1Model(params).run(
                verbose=False,
                solver=solver,
                rtol=rtol,
                atol=atol,
                max_step=max_step,
                err_tol=err_tol,
                run_until_stable=run_until_stable,
                stability_tol=stability_tol,
                stable_cycles=stable_cycles,
            )
        ]
        return rows, 1.0
    raise ValueError(f"Unknown source: {source}")


def output_stem(source: str) -> str:
    stems = {
        "paper-strip": "python_paper_strip_two_phase_lightcurve",
        "paper-strip-abs-v": "python_paper_strip_abs_v_two_phase_lightcurve",
        "oz1": "stellingwerf_oz1_two_phase_lightcurve",
    }
    return stems[source]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=("paper-strip", "paper-strip-abs-v", "oz1"),
        default="oz1",
        help="Data source for the phase plot",
    )
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--csv", type=Path, default=None)
    parser.add_argument("--solver", choices=SOLVER_NAMES, default=DEFAULT_SOLVER)
    parser.add_argument("--rtol", type=float, default=1.0e-8)
    parser.add_argument("--atol", type=float, default=1.0e-10)
    parser.add_argument("--max-step", type=float, default=0.15)
    parser.add_argument("--max-time", type=float, default=120.0, help="Maximum tau cap; final tau when --fixed-time is used")
    parser.add_argument("--err-tol", type=float, default=None, help="Legacy midpoint absolute error tolerance")
    parser.add_argument("--fixed-time", dest="run_until_stable", action="store_false", default=True, help="Disable early stability stopping")
    parser.add_argument("--stability-tol", type=float, default=2.0e-3)
    parser.add_argument("--stable-cycles", type=int, default=5)
    args = parser.parse_args(argv)

    stem = output_stem(args.source)
    output = args.output or OUTPUT_DIR / f"{stem}.svg"
    csv_path = args.csv or OUTPUT_DIR / f"{stem}.csv"
    rows, after = rows_from_source(
        args.source,
        solver=args.solver,
        rtol=args.rtol,
        atol=args.atol,
        max_step=args.max_step,
        max_time=args.max_time,
        err_tol=args.err_tol,
        run_until_stable=args.run_until_stable,
        stability_tol=args.stability_tol,
        stable_cycles=args.stable_cycles,
    )
    phase_rows, _period = two_cycle_phase_rows(rows, after=after)

    output.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    write_two_panel_svg(phase_rows, output)
    write_csv(csv_path, phase_rows)
    print(output)
    print(csv_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
