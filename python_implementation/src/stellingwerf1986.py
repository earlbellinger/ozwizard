"""Reproduce the figures from Stellingwerf (1986), ApJ 303, 119.

The paper figures use the constant-m equations printed as eqs. (33)-(35),
with a fixed base luminosity. The S_Tran files in this directory are useful
implementation references, but OZ1.S/OZC.S also include later/local switches
such as variable m(R), an R^-1 inner luminosity, and turbulent pressure.
"""

from __future__ import annotations

import argparse
import csv
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from html import escape
from math import isfinite, pi, sin, sqrt
from pathlib import Path

from solvers import DEFAULT_SOLVER, SOLVER_NAMES, SolverName, SolverOptions, integrate
from stability import StabilityDetector, StabilityOptions


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "stellingwerf1986"
Row = dict[str, float]
Point = tuple[float, float]


@dataclass(frozen=True)
class PaperModelParams:
    name: str
    zeta: float
    zetac: float
    gammac: float
    m: float = 10.0
    gamma1: float = 1.1
    n: float = 1.0
    s: float = 3.0
    r0: float = 1.4
    v0: float = 0.0
    p0: float = 1.0
    uc0: float = 1.0
    source_exp: float = 0.0
    cq: float = 0.0
    variable_m: bool = False
    convective_driver: str = "p"

    @property
    def gammar(self) -> float:
        return 1.0 - self.gammac

    @property
    def gamma11(self) -> float:
        return self.gamma1 - 1.0

    @property
    def eta(self) -> float:
        return (1.0 - 3.0 / self.m) ** (1.0 / 3.0)

    def m_at(self, radius: float) -> float:
        if not self.variable_m:
            return self.m
        return 3.0 / (1.0 - (self.eta / radius) ** 3.0)

    def b_at(self, radius: float) -> float:
        return 4.0 + self.m_at(radius) * (self.n - (self.s + 4.0) * self.gamma11)

    def q_at(self, radius: float) -> float:
        return self.m_at(radius) * self.gamma1 - 2.0

    def c_at(self, radius: float) -> float:
        return self.m_at(radius) - 2.0

    def d_at(self, radius: float) -> float:
        return self.m_at(radius) * self.gamma11 / 2.0

    @property
    def b(self) -> float:
        return self.b_at(1.0)

    @property
    def q(self) -> float:
        return self.q_at(1.0)

    @property
    def c(self) -> float:
        return self.c_at(1.0)

    @property
    def d(self) -> float:
        return self.d_at(1.0)


class PaperModel:
    def __init__(self, params: PaperModelParams) -> None:
        self.params = params

    def derivatives(self, _time: float, state: Sequence[float]) -> list[float]:
        radius, velocity, pressure, convective_velocity = state
        if radius <= 0.0 or pressure <= 0.0:
            raise ValueError("model left the positive-radius/positive-pressure domain")

        params = self.params
        m = params.m_at(radius)
        b = params.b_at(radius)
        q = params.q_at(radius)
        c = params.c_at(radius)
        d = params.d_at(radius)
        lr = radius**b * pressure ** (params.s + 4.0)
        lc = radius ** (-c) * convective_velocity**3.0
        inner_luminosity = radius**params.source_exp
        if params.convective_driver == "p":
            convective_driver = sqrt(pressure)
        elif params.convective_driver == "abs-v":
            convective_driver = sqrt(abs(velocity))
        else:
            raise ValueError(f"Unknown convective driver: {params.convective_driver}")
        return [
            velocity,
            pressure / radius**q - 1.0 / radius**2.0 - params.cq * velocity**3.0,
            params.zeta
            * radius ** (m * params.gamma11)
            * (inner_luminosity - params.gammar * lr - params.gammac * lc),
            params.zetac * (radius ** (-d) * convective_driver - convective_velocity),
        ]

    def sample(self, time: float, state: Sequence[float]) -> Row:
        radius, velocity, pressure, convective_velocity = state
        params = self.params
        lr = radius**params.b_at(radius) * pressure ** (params.s + 4.0)
        lc = radius ** (-params.c_at(radius)) * convective_velocity**3.0
        return {
            "tau": time,
            "R": radius,
            "V": velocity,
            "P": pressure,
            "Uc": convective_velocity,
            "Lr": lr,
            "Lc": lc,
            "L": params.gammar * lr + params.gammac * lc,
        }

    def run(
        self,
        t_end: float,
        initial_step: float = 0.001,
        err_tol: float = 1.0e-7,
        max_rows: int = 500_000,
        solver: SolverName = DEFAULT_SOLVER,
        rtol: float = 1.0e-8,
        atol: float = 1.0e-10,
        max_step: float = 0.15,
        run_until_stable: bool = True,
        stability_tol: float = 2.0e-3,
        stable_cycles: int = 5,
    ) -> list[Row]:
        options = SolverOptions(
            solver=solver,
            rtol=rtol,
            atol=atol,
            initial_step=initial_step,
            max_step=max_step,
            max_rows=max_rows,
            err_tol=err_tol,
        )
        detector = StabilityDetector(
            StabilityOptions(
                run_until_stable=run_until_stable,
                tolerance=stability_tol,
                stable_cycles=stable_cycles,
            )
        )
        detector.observe(self.sample(0.0, [self.params.r0, self.params.v0, self.params.p0, self.params.uc0]))

        def stop(time: float, state: Sequence[float]) -> str | None:
            row = self.sample(time, state)
            if row["R"] > 25.0:
                return "runaway"
            return detector.observe(row)

        result = integrate(
            self.derivatives,
            [self.params.r0, self.params.v0, self.params.p0, self.params.uc0],
            t_end,
            options,
            stop_condition=stop,
        )
        return [self.sample(time, state) for time, state in result.points]


def stability_margin(zeta: float, zetac: float, gammac: float, params: PaperModelParams | None = None) -> float:
    """Return the minimum Hurwitz stability expression for eqs. (42)-(53)."""

    p = params or PaperModelParams("standard", zeta=1.0, zetac=1.0, gammac=gammac)
    gammar = 1.0 - gammac
    p_term = gammar * p.b - gammac * p.c
    q_term = gammar * (p.s + 4.0)
    r_term = p.q - 2.0

    a = zeta * zetac * (p_term + r_term * q_term + 3.0 * gammac * (r_term / 2.0 - p.d))
    b = zetac * r_term + zeta * (p_term + r_term * q_term)
    c = zeta * zetac * (q_term + 1.5 * gammac) + r_term
    d = zetac + zeta * q_term
    dynamic = b * c - a * d
    pulsational = d * dynamic - b * b
    return min(a, b, dynamic, pulsational)


def write_csv(path: Path, rows: Sequence[Row]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("tau", "R", "V", "P", "Uc", "Lr", "Lc", "L"))
        writer.writeheader()
        writer.writerows(rows)


def _fmt(value: float) -> str:
    if abs(value) >= 1000.0 or (0.0 < abs(value) < 0.001):
        return f"{value:.1e}"
    if abs(value - round(value)) < 1.0e-9:
        return str(int(round(value)))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _ticks(minimum: float, maximum: float, count: int = 5) -> list[float]:
    if count < 2:
        return [minimum]
    step = (maximum - minimum) / (count - 1)
    return [minimum + index * step for index in range(count)]


class Figure:
    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.parts: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            "<defs>",
            '<marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">',
            '<path d="M0,0 L8,4 L0,8 Z" fill="#111"/>',
            "</marker>",
            '<pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">',
            '<circle cx="2" cy="2" r="1.1" fill="#111"/>',
            "</pattern>",
            '<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">',
            '<line x1="0" y1="0" x2="0" y2="7" stroke="#111" stroke-width="1"/>',
            "</pattern>",
            "</defs>",
            '<rect width="100%" height="100%" fill="#fff"/>',
        ]

    def text(self, x: float, y: float, value: str, size: int = 14, anchor: str = "middle", weight: str = "normal") -> None:
        self.parts.append(
            f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" '
            f'font-family="Georgia, Times New Roman, serif" font-size="{size}" font-weight="{weight}">{escape(value)}</text>'
        )

    def line(self, p1: Point, p2: Point, dash: str | None = None, width: float = 1.6, arrow: bool = False) -> None:
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        marker = ' marker-end="url(#arrow)"' if arrow else ""
        self.parts.append(
            f'<line x1="{p1[0]:.2f}" y1="{p1[1]:.2f}" x2="{p2[0]:.2f}" y2="{p2[1]:.2f}" '
            f'stroke="#111" stroke-width="{width}" fill="none"{extra}{marker}/>'
        )

    def path(self, points: Sequence[Point], dash: str | None = None, width: float = 1.6, extra: str = "") -> None:
        if len(points) < 2:
            return
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        data = " ".join(f"{x:.2f},{y:.2f}" for x, y in points if isfinite(x) and isfinite(y))
        self.parts.append(f'<polyline points="{data}" fill="none" stroke="#111" stroke-width="{width}"{dash_attr} {extra}/>')

    def polygon(self, points: Sequence[Point], fill: str, stroke: str = "none", opacity: float = 1.0) -> None:
        data = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        self.parts.append(f'<polygon points="{data}" fill="{fill}" stroke="{stroke}" opacity="{opacity:.3f}"/>')

    def save(self, path: Path) -> None:
        self.parts.append("</svg>")
        path.write_text("\n".join(self.parts), encoding="utf-8")


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

    def map_points(self, rows: Sequence[Row], x_key: str, y_key: str, x_window: tuple[float, float] | None = None) -> list[Point]:
        points: list[Point] = []
        for row in rows:
            x_value = row[x_key]
            if x_window and not (x_window[0] <= x_value <= x_window[1]):
                continue
            points.append((self.sx(x_value), self.sy(row[y_key])))
        return points


def draw_axes(
    fig: Figure,
    panel: Panel,
    x_ticks: Sequence[float],
    y_ticks: Sequence[float],
    show_x_labels: bool = True,
    show_y_labels: bool = True,
) -> None:
    fig.parts.append(
        f'<rect x="{panel.left:.2f}" y="{panel.top:.2f}" width="{panel.width:.2f}" height="{panel.height:.2f}" '
        'fill="none" stroke="#111" stroke-width="1.4"/>'
    )
    for tick in x_ticks:
        x = panel.sx(tick)
        fig.line((x, panel.top), (x, panel.top + 8), width=1.1)
        fig.line((x, panel.top + panel.height), (x, panel.top + panel.height - 8), width=1.1)
        if show_x_labels:
            fig.text(x, panel.top + panel.height + 23, _fmt(tick), size=12)
    for tick in y_ticks:
        y = panel.sy(tick)
        fig.line((panel.left, y), (panel.left + 8, y), width=1.1)
        fig.line((panel.left + panel.width, y), (panel.left + panel.width - 8, y), width=1.1)
        if show_y_labels:
            fig.text(panel.left - 12, y + 4, _fmt(tick), size=12, anchor="end")


def contour_segments(
    fn: Callable[[float, float], float],
    xlim: tuple[float, float],
    ylim: tuple[float, float],
    nx: int = 150,
    ny: int = 150,
) -> list[tuple[Point, Point]]:
    xs = [xlim[0] + (xlim[1] - xlim[0]) * i / nx for i in range(nx + 1)]
    ys = [ylim[0] + (ylim[1] - ylim[0]) * j / ny for j in range(ny + 1)]
    values = [[fn(x, y) for x in xs] for y in ys]
    segments: list[tuple[Point, Point]] = []

    def interp(a: Point, va: float, b: Point, vb: float) -> Point:
        if va == vb:
            t = 0.5
        else:
            t = -va / (vb - va)
        t = max(0.0, min(1.0, t))
        return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))

    for j in range(ny):
        for i in range(nx):
            corners = [
                ((xs[i], ys[j]), values[j][i]),
                ((xs[i + 1], ys[j]), values[j][i + 1]),
                ((xs[i + 1], ys[j + 1]), values[j + 1][i + 1]),
                ((xs[i], ys[j + 1]), values[j + 1][i]),
            ]
            crossings: list[Point] = []
            for first, second in ((0, 1), (1, 2), (2, 3), (3, 0)):
                p1, v1 = corners[first]
                p2, v2 = corners[second]
                if v1 == 0.0:
                    crossings.append(p1)
                elif v1 * v2 < 0.0:
                    crossings.append(interp(p1, v1, p2, v2))
            if len(crossings) == 2:
                segments.append((crossings[0], crossings[1]))
            elif len(crossings) == 4:
                segments.append((crossings[0], crossings[1]))
                segments.append((crossings[2], crossings[3]))
    return segments


def draw_curve_arrow(fig: Figure, panel: Panel, rows: Sequence[Row], x_key: str, y_key: str, fraction: float = 0.62) -> None:
    if len(rows) < 4:
        return
    index = max(1, min(len(rows) - 2, int(len(rows) * fraction)))
    p1 = (panel.sx(rows[index - 1][x_key]), panel.sy(rows[index - 1][y_key]))
    p2 = (panel.sx(rows[index + 1][x_key]), panel.sy(rows[index + 1][y_key]))
    fig.line(p1, p2, width=1.1, arrow=True)


def window_rows(rows: Sequence[Row], start: float, end: float) -> list[Row]:
    return [row for row in rows if start <= row["tau"] <= end]


def shift_time(rows: Sequence[Row], origin: float) -> list[Row]:
    return [{**row, "tau": row["tau"] - origin} for row in rows]


def figure1(path: Path) -> None:
    fig = Figure(900, 470)
    left_panel = Panel(62, 38, 385, 360, (0, 4), (0, 4))
    right_panel = Panel(447, 38, 385, 360, (0, 4), (0, 4))
    for label, panel in (("a", left_panel), ("b", right_panel)):
        draw_axes(fig, panel, _ticks(0, 4, 5), _ticks(0, 4, 5), show_y_labels=(label == "a"))
        fig.text(panel.left + 30, panel.top + 28, label, size=13, weight="bold")

    for gammac in (0.3, 0.4, 0.45):
        segments = contour_segments(lambda zc, z, gc=gammac: stability_margin(z, zc, gc), (0, 4), (0, 4))
        for p1, p2 in segments:
            fig.line((left_panel.sx(p1[0]), left_panel.sy(p1[1])), (left_panel.sx(p2[0]), left_panel.sy(p2[1])), width=1.6)
    for gammac in (0.85, 0.9, 1.0):
        segments = contour_segments(lambda zc, z, gc=gammac: stability_margin(z, zc, gc), (0, 4), (0, 4))
        for p1, p2 in segments:
            fig.line((right_panel.sx(p1[0]), right_panel.sy(p1[1])), (right_panel.sx(p2[0]), right_panel.sy(p2[1])), width=1.6)

    fig.text(255, 80, "STABLE", size=17, weight="bold")
    fig.text(280, 112, "gamma_c = 0.3", size=15)
    fig.line((270, 124), (300, 124), arrow=True)
    fig.text(200, 205, "STABLE", size=17, weight="bold")
    fig.text(220, 238, "gamma_c = 0.4", size=15)
    fig.line((210, 250), (240, 250), arrow=True)
    fig.text(110, 312, "STABLE", size=17, weight="bold")
    fig.text(135, 344, "gamma_c = 0.45", size=15)
    fig.line((126, 356), (156, 356), arrow=True)

    fig.text(565, 112, "gamma_c = 0.85", size=15)
    fig.text(560, 142, "STABLE", size=17, weight="bold")
    fig.line((552, 154), (582, 154), arrow=True)
    fig.text(635, 192, "gamma_c = 0.9", size=15)
    fig.text(630, 222, "STABLE", size=17, weight="bold")
    fig.line((622, 234), (652, 234), arrow=True)
    fig.text(700, 292, "gamma_c = 1", size=15)
    fig.text(700, 322, "STABLE", size=17, weight="bold")
    fig.line((704, 334), (734, 334), arrow=True)

    fig.text(24, 220, "zeta", size=16)
    fig.text(447, 435, "zeta_c", size=16)
    fig.text(450, 458, "Fig. 1 - Stability boundaries from the Hurwitz criteria", size=13)
    fig.save(path)


def figure2(path: Path) -> None:
    fig = Figure(760, 520)
    panel = Panel(95, 38, 560, 350, (0, 1), (0, 1))
    draw_axes(fig, panel, [], _ticks(0, 1, 5))

    xs = [i / 120 for i in range(121)]
    lower = [(panel.sx(x), panel.sy(0.39 + 0.08 * sin(pi * x) - 0.04 * x)) for x in xs]
    upper = [(panel.sx(x), panel.sy(min(1.0, 0.84 + 0.25 * x**1.6))) for x in xs]
    stable_poly = [*lower, *[(panel.sx(1), panel.sy(1)), (panel.sx(0), panel.sy(1))]]
    hatch_poly = [(panel.sx(0), panel.sy(1)), *upper, (panel.sx(0), panel.sy(1))]
    fig.polygon(stable_poly, "url(#dots)", opacity=0.8)
    fig.polygon(hatch_poly, "url(#hatch)", opacity=0.75)
    fig.path(lower, width=1.8)
    fig.path(upper, width=1.8)
    dashed = [(panel.sx(x), panel.sy(min(1.0, 0.02 + 0.98 * x**2.4))) for x in xs]
    fig.path(dashed, dash="9 7", width=1.7)
    fig.line((panel.sx(0.62), panel.sy(0.33)), (panel.sx(0.62), panel.sy(0.47)), arrow=True)

    fig.text(185, 80, "DYNAMIC INST.", size=16, weight="bold")
    fig.text(375, 165, "STABLE", size=18, weight="bold")
    fig.text(510, 292, "RED\nEDGE", size=16, weight="bold")
    fig.text(495, 205, "STARS", size=15, weight="bold")
    fig.text(160, 420, "BLUE", size=16, weight="bold")
    fig.text(360, 420, "CEPHEIDS", size=16, weight="bold")
    fig.text(590, 420, "RED", size=16, weight="bold")
    fig.text(42, 200, "gamma_c  CONVECTIVE FLUX FRACTION", size=15, anchor="middle")
    fig.parts[-1] = fig.parts[-1].replace(f'x="42.00" y="200.00"', f'x="42.00" y="200.00" transform="rotate(-90 42 200)"')
    fig.text(380, 482, "Te", size=16, weight="bold")
    fig.line((350, 460), (305, 460), arrow=True)
    fig.text(380, 505, "Fig. 2 - Schematic interpretation of the Fig. 1 stability map", size=13)
    fig.save(path)


def time_panel_figure(path: Path, rows: Sequence[Row], start: float, end: float, label: str, title: str) -> None:
    sub = window_rows(rows, start, end)
    fig = Figure(620, 560)
    top = Panel(70, 42, 500, 225, (start, end), (-0.8, 1.6))
    bottom = Panel(70, 267, 500, 225, (start, end), (min(min(r["P"], r["Uc"]) for r in sub) - 0.02, max(max(r["P"], r["Uc"]) for r in sub) + 0.02))
    x_ticks = [round(start + i, 1) for i in range(1, int(end - start) + 1)]
    draw_axes(fig, top, x_ticks, _ticks(-0.5, 1.5, 5), show_x_labels=False)
    draw_axes(fig, bottom, x_ticks, _ticks(round(bottom.ylim[0], 2), round(bottom.ylim[1], 2), 5))
    fig.path(top.map_points(rows, "tau", "R", (start, end)), width=1.7)
    fig.path(top.map_points(rows, "tau", "V", (start, end)), dash="9 5", width=1.7)
    fig.path(bottom.map_points(rows, "tau", "P", (start, end)), width=1.7)
    fig.path(bottom.map_points(rows, "tau", "Uc", (start, end)), dash="9 5", width=1.7)
    fig.text(190, 104, "R", size=15, weight="bold")
    fig.text(150, 190, "V", size=15, weight="bold")
    fig.text(190, 332, "P", size=15, weight="bold")
    fig.text(305, 365, "U_c", size=15, weight="bold")
    fig.text(500, 78, label, size=15, weight="bold")
    fig.text(320, 535, "tau", size=16, weight="bold")
    fig.text(320, 555, title, size=12)
    fig.save(path)


def figure6(path: Path, case_rows: dict[str, tuple[Sequence[Row], tuple[float, float]]]) -> None:
    fig = Figure(620, 760)
    panels = [
        ("a", "BLUE", Panel(70, 35, 500, 205, (0.82, 1.58), (0.60, 1.18))),
        ("b", "STRIP", Panel(70, 240, 500, 205, (0.80, 1.62), (0.64, 1.08))),
        ("c", "RED", Panel(70, 445, 500, 205, (0.82, 1.34), (0.79, 1.03))),
    ]
    for key, label, panel in panels:
        rows, window = case_rows[label.title()]
        sub = window_rows(rows, *window)
        draw_axes(fig, panel, _ticks(panel.xlim[0], panel.xlim[1], 5), _ticks(panel.ylim[0], panel.ylim[1], 4), show_x_labels=(key == "c"))
        fig.path(panel.map_points(sub, "R", "P"), width=1.6)
        fig.path(panel.map_points(sub, "R", "Uc"), dash="9 5", width=1.6)
        draw_curve_arrow(fig, panel, sub, "R", "P", 0.45)
        draw_curve_arrow(fig, panel, sub, "R", "Uc", 0.68)
        fig.text(panel.left + panel.width - 25, panel.top + 32, key, size=13, weight="bold")
        fig.text(panel.left + panel.width - 55, panel.top + 55, label, size=15, weight="bold")
        fig.text(panel.left + 95, panel.top + 48, "P", size=14, weight="bold")
        fig.text(panel.left + 145, panel.top + panel.height - 42, "U_c", size=14, weight="bold")
    fig.text(320, 706, "R", size=16, weight="bold")
    fig.text(320, 735, "Fig. 6 - Phase plots for the Blue, Strip, and Red cases", size=12)
    fig.save(path)


def quad_figure(path: Path, rows: Sequence[Row], time_window: tuple[float, float], title: str, xlim_phase: tuple[float, float]) -> None:
    sub = window_rows(rows, *time_window)
    fig = Figure(860, 470)
    left_top = Panel(62, 32, 360, 180, time_window, (min(r["R"] for r in sub) - 0.02, max(r["R"] for r in sub) + 0.02))
    left_bottom = Panel(62, 212, 360, 180, time_window, (min(r["V"] for r in sub) - 0.03, max(r["V"] for r in sub) + 0.03))
    right_top = Panel(432, 32, 360, 180, xlim_phase, (min(r["P"] for r in sub) - 0.04, max(r["P"] for r in sub) + 0.04))
    right_bottom = Panel(432, 212, 360, 180, xlim_phase, (min(r["Uc"] for r in sub) - 0.03, max(r["Uc"] for r in sub) + 0.03))
    for panel, y_key, letter, label in (
        (left_top, "R", "a", "R"),
        (left_bottom, "V", "b", "V"),
        (right_top, "P", "c", "P"),
        (right_bottom, "Uc", "d", "U_c"),
    ):
        draw_axes(fig, panel, _ticks(panel.xlim[0], panel.xlim[1], 5), _ticks(panel.ylim[0], panel.ylim[1], 4), show_x_labels=panel in (left_bottom, right_bottom))
        x_key = "tau" if panel in (left_top, left_bottom) else "R"
        fig.path(panel.map_points(sub, x_key, y_key), width=1.7)
        fig.text(panel.left + panel.width - 38, panel.top + 28, letter, size=13, weight="bold")
        fig.text(panel.left + panel.width * 0.36, panel.top + panel.height * 0.55, label, size=15, weight="bold")
        if panel in (right_top, right_bottom):
            draw_curve_arrow(fig, panel, sub, "R", y_key, 0.72)
    fig.text(245, 438, "tau", size=15, weight="bold")
    fig.text(615, 438, "R", size=15, weight="bold")
    fig.text(430, 462, title, size=12)
    fig.save(path)


def reproduce(
    output_dir: Path,
    solver_options: SolverOptions | None = None,
    *,
    run_until_stable: bool = False,
    stable_max_time: float = 120.0,
    stability_tol: float = 2.0e-3,
    stable_cycles: int = 5,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_dir = output_dir / "csv"
    figures: list[Path] = []
    opts = solver_options or SolverOptions()

    def run_model(params: PaperModelParams, t_end: float) -> list[Row]:
        return PaperModel(params).run(
            stable_max_time if run_until_stable else t_end,
            initial_step=opts.initial_step,
            err_tol=opts.err_tol or 1.0e-7,
            max_rows=opts.max_rows,
            solver=opts.solver,
            rtol=opts.rtol,
            atol=opts.atol,
            max_step=opts.max_step,
            run_until_stable=run_until_stable,
            stability_tol=stability_tol,
            stable_cycles=stable_cycles,
        )

    figure1(output_dir / "fig1.svg")
    figure2(output_dir / "fig2.svg")
    figures.extend([output_dir / "fig1.svg", output_dir / "fig2.svg"])

    cases = {
        "Blue": (PaperModelParams("Blue", zeta=10.0, zetac=0.1, gammac=0.1), 32.0, (24.8, 31.4)),
        "Strip": (PaperModelParams("Strip", zeta=1.0, zetac=1.0, gammac=0.2), 11.0, (4.5, 10.5)),
        "Red": (PaperModelParams("Red", zeta=0.1, zetac=10.0, gammac=0.5), 14.0, (7.5, 13.5)),
    }
    case_rows: dict[str, tuple[list[Row], tuple[float, float]]] = {}
    for index, (name, (params, t_end, window)) in enumerate(cases.items(), start=3):
        rows = run_model(params, t_end)
        case_rows[name] = (rows, window)
        write_csv(csv_dir / f"{name.lower()}.csv", rows)
        out = output_dir / f"fig{index}.svg"
        time_panel_figure(out, rows, *window, name.upper(), f"Fig. {index} - {name} case")
        figures.append(out)

    figure6(output_dir / "fig6.svg", case_rows)
    figures.append(output_dir / "fig6.svg")

    fig7_params = PaperModelParams("dynamic_unstable", zeta=2.0, zetac=1.0, gammac=1.0, r0=1.1)
    fig7_rows = run_model(fig7_params, 8.4)
    write_csv(csv_dir / "dynamic_unstable.csv", fig7_rows)
    fig7_plot_start = 2.0
    fig7_shifted_rows = shift_time(window_rows(fig7_rows, fig7_plot_start, fig7_rows[-1]["tau"]), fig7_plot_start)
    quad_figure(
        output_dir / "fig7.svg",
        fig7_shifted_rows,
        (0.0, fig7_shifted_rows[-1]["tau"]),
        "Fig. 7 - Dynamic instability, fully convective standard shell",
        (0.75, 1.12),
    )
    figures.append(output_dir / "fig7.svg")

    diagnostic_dir = output_dir / "diagnostics"
    diagnostic_dir.mkdir(parents=True, exist_ok=True)
    quad_figure(
        diagnostic_dir / "fig7_raw_from_initial_condition.svg",
        fig7_rows,
        (0.0, fig7_rows[-1]["tau"]),
        "Diagnostic - Fig. 7 from the initial condition",
        (0.86, 1.12),
    )
    figures.append(diagnostic_dir / "fig7_raw_from_initial_condition.svg")

    fig7_u_minus_1_params = PaperModelParams(
        "dynamic_unstable_u_minus_1",
        zeta=2.0,
        zetac=1.0,
        gammac=1.0,
        r0=1.1,
        source_exp=-1.0,
    )
    fig7_u_minus_1_rows = run_model(fig7_u_minus_1_params, 5.4)
    write_csv(csv_dir / "dynamic_unstable_u_minus_1.csv", fig7_u_minus_1_rows)
    quad_figure(
        diagnostic_dir / "fig7_u_minus_1_source.svg",
        fig7_u_minus_1_rows,
        (0.0, fig7_u_minus_1_rows[-1]["tau"]),
        "Diagnostic - Fig. 7 with OZ1/OZC-style R^-1 source",
        (0.80, 1.12),
    )
    figures.append(diagnostic_dir / "fig7_u_minus_1_source.svg")

    fig8_params = PaperModelParams("thick_shell", zeta=0.1, zetac=10.0, gammac=1.0, m=5.0, r0=1.1)
    fig8_rows = run_model(fig8_params, 25.5)
    write_csv(csv_dir / "thick_shell.csv", fig8_rows)
    quad_figure(output_dir / "fig8.svg", fig8_rows, (14.0, 25.5), "Fig. 8 - Thick convective shell instability", (1.00, 1.07))
    figures.append(output_dir / "fig8.svg")

    return figures


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--solver", choices=SOLVER_NAMES, default=DEFAULT_SOLVER)
    parser.add_argument("--rtol", type=float, default=1.0e-8)
    parser.add_argument("--atol", type=float, default=1.0e-10)
    parser.add_argument("--max-step", type=float, default=0.15)
    parser.add_argument("--initial-step", type=float, default=0.001)
    parser.add_argument("--max-rows", type=int, default=500_000)
    parser.add_argument("--err-tol", type=float, default=1.0e-7, help="Legacy midpoint absolute error tolerance")
    parser.add_argument("--run-until-stable", action="store_true", help="Stop early if the model reaches equilibrium or a stable limit cycle")
    parser.add_argument("--max-time", type=float, default=120.0, help="Maximum tau cap when --run-until-stable is used")
    parser.add_argument("--stability-tol", type=float, default=2.0e-3)
    parser.add_argument("--stable-cycles", type=int, default=5)
    args = parser.parse_args(argv)
    solver_options = SolverOptions(
        solver=args.solver,
        rtol=args.rtol,
        atol=args.atol,
        initial_step=args.initial_step,
        max_step=args.max_step,
        max_rows=args.max_rows,
        err_tol=args.err_tol,
    )
    for figure in reproduce(
        args.output_dir,
        solver_options,
        run_until_stable=args.run_until_stable,
        stable_max_time=args.max_time,
        stability_tol=args.stability_tol,
        stable_cycles=args.stable_cycles,
    ):
        print(figure)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
