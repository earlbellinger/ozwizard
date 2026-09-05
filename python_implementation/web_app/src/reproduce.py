#!/usr/bin/env python3
"""Reproduce an OZwizard paper bundle with Matplotlib.

The browser-generated PDFs are canonical. This script is an independent,
editable rendering of the archived numerical CSV data.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
MODEL_PARAMETERS = MANIFEST.get("model", {}).get("displayParameters") or MANIFEST.get("model", {}).get("parameters", {})
GEOMETRY_MODE = MODEL_PARAMETERS.get("geometryMode") or (
    "local-exponent" if MODEL_PARAMETERS.get("variableM", False) else "constant"
)
OUT = ROOT / "reproduced"
OUT.mkdir(exist_ok=True)
(OUT / "reproduction-metadata.json").write_text(
    json.dumps({"geometryMode": GEOMETRY_MODE, "source": "archived CSV data"}, indent=2) + "\n",
    encoding="utf-8",
)
FALLBACK_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000"]
FALLBACK_DASHES = ["-", "--", "-.", ":"]
FALLBACK_MARKERS = ["o", "s", "^", "D", "v", "P"]
AXIS_COLOR = "#000000"
AXIS_LINEWIDTH = 0.9
DATA_LINEWIDTH = 1.6
AXIS_LABEL_SIZE = 9
TICK_LABEL_SIZE = 7
KIND_COLORS = {
    "stable": "#D9EAD3",
    "convective": "#E69F00",
    "secular": "#56B4E9",
    "dynamic": "#D55E00",
    "pulsational": "#CC79A7",
    "neutral": "#999999",
}


def style_axes(ax):
    """Keep paper axes legible without competing with the plotted curves."""
    for spine in ax.spines.values():
        spine.set_color(AXIS_COLOR)
        spine.set_linewidth(AXIS_LINEWIDTH)
    ax.minorticks_on()
    ax.tick_params(
        axis="both", which="both", direction="out", colors=AXIS_COLOR,
        width=AXIS_LINEWIDTH, bottom=True, left=True, top=False, right=False,
        labelbottom=True, labelleft=True, labeltop=False, labelright=False,
    )
    ax.tick_params(axis="both", which="major", length=3.5, pad=2.5, labelsize=TICK_LABEL_SIZE)
    ax.tick_params(axis="both", which="minor", length=2)
    for axis in (ax.xaxis, ax.yaxis):
        axis.label.set_fontsize(AXIS_LABEL_SIZE)
        axis.label.set_color(AXIS_COLOR)
        axis.labelpad = 4
        axis.get_offset_text().set_fontsize(TICK_LABEL_SIZE)
        axis.get_offset_text().set_color(AXIS_COLOR)


def draw_reference_lines(ax, panel_id):
    """Match the equilibrium and phase guides in the browser rendering."""
    guides = {
        "light": {"x": [1], "y": [1]},
        "velocity": {"x": [1], "y": [0]},
        "phasePortrait": {"x": [1], "y": [1]},
        "phaseLag": {"y": [0]},
    }.get(panel_id, {})
    line_style = {
        "color": AXIS_COLOR, "linewidth": AXIS_LINEWIDTH,
        "linestyle": (0, (5, 4)), "zorder": 1.5,
    }
    for value in guides.get("x", []):
        if min(ax.get_xlim()) <= value <= max(ax.get_xlim()):
            ax.axvline(value, **line_style)
    for value in guides.get("y", []):
        if min(ax.get_ylim()) <= value <= max(ax.get_ylim()):
            ax.axhline(value, **line_style)


def load_rows(relative_path: str):
    with (ROOT / relative_path).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def number(value, default=float("nan")):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def style_map(panel):
    styles = {}
    for index, item in enumerate(panel.get("metadata", {}).get("seriesStyling", [])):
        dash = item.get("dash", [])
        styles[item.get("series", f"series-{index}")] = {
            "color": item.get("color", FALLBACK_COLORS[index % len(FALLBACK_COLORS)]),
            "linestyle": (0, tuple(dash)) if dash else "-",
            "marker": {"circle": "o", "square": "s", "triangle": "^", "diamond": "D", "none": None}.get(item.get("marker"), "o"),
        }
    return styles


def draw_snapshots(ax, rows, panel_id, columns):
    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")
    for index, row in enumerate(rows):
        column, line = index % columns, index // columns
        cx, cy = column * 2.5 + 1.2, -line * 2.35 - 1.15
        radius = max(0.12, number(row.get("R"), 1.0) * 0.65)
        if panel_id == "model":
            ax.add_patch(Circle((cx, cy), radius, facecolor=FALLBACK_COLORS[index % len(FALLBACK_COLORS)], alpha=0.72, edgecolor="black"))
            eta = max(0.0, 1.0 - 3.0 / max(3.0, number(MODEL_PARAMETERS.get("m"), 3.0))) ** (1.0 / 3.0)
            inner_radius = radius * eta if GEOMETRY_MODE == "constant" else 0.65 * eta
            if inner_radius > 0:
                ax.add_patch(Circle((cx, cy), inner_radius, facecolor="#f3f4f6", edgecolor="black", linewidth=0.7))
        else:
            ax.add_patch(Rectangle((cx - 0.62, cy - 0.72), 1.24, 1.44, facecolor="#f3f4f6", edgecolor="black"))
            piston_y = cy - 0.45 + max(0.0, min(1.0, number(row.get("R"), 1.0) / 2.0)) * 0.9
            ax.plot([cx - 0.52, cx + 0.52], [piston_y, piston_y], color=FALLBACK_COLORS[index % len(FALLBACK_COLORS)], linewidth=4)
        ax.text(cx, cy + 0.94, f"{chr(97 + index)}) {row.get('snapshot_label', '')}", ha="center", va="bottom", fontsize=7)
        ax.text(cx, cy + 0.77, row.get("coordinate_label", ""), ha="center", va="bottom", fontsize=6)
    ax.autoscale_view()


def series_specs(panel_id, rows):
    if panel_id == "light":
        return [("coordinate", "L", "model_id", "coordinate", "L")]
    if panel_id == "velocity":
        return [("coordinate", "V", "model_id", "coordinate", "V")]
    if panel_id == "work":
        return [("R", "pressure_support", None, "R", "pressure support")]
    if panel_id == "tpOpacity":
        return [("log10_T_over_T0", "log10_P_over_P0", "model_id", r"$\log_{10}(T/T_0)$", r"$\log_{10}(P/P_0)$")]
    if panel_id == "periodogram":
        return [("frequency", "power", None, r"frequency [$\tau^{-1}$]", r"power [$(\Delta L/L_0)^2$]")]
    if panel_id == "phaseLag":
        return [("parameter_value", "phase_lag", "pair", "grid parameter", r"phase lag $\Delta\phi$")]
    if panel_id == "phasePortrait":
        return [("R", "H", None, "R", "H"), ("R", "Uc", None, "R", r"$U_c$")]
    if panel_id == "time":
        return [("tau", key, None, r"time $\tau$", "state") for key in ("R", "V", "H", "Uc")]
    if panel_id == "lum":
        x_key = "phase" if rows and "phase" in rows[0] else "tau"
        xlabel = "phase" if x_key == "phase" else r"time $\tau$"
        return [(x_key, key, None, xlabel, "luminosity") for key in ("L", "Lr", "Lc")]
    if panel_id == "fourier":
        return [("period", "value", "diagnostic", r"period / $\tau$", "Fourier diagnostic")]
    return []


def draw_series(ax, panel, rows):
    styles = style_map(panel)
    panel_id = panel["id"]
    specs = series_specs(panel_id, rows)
    for spec_index, (x_key, y_key, group_key, xlabel, ylabel) in enumerate(specs):
        groups = defaultdict(list)
        for row in rows:
            group = row.get(group_key, y_key) if group_key else y_key
            x, y = number(row.get(x_key)), number(row.get(y_key))
            if x == x and y == y:
                groups[group].append((x, y))
        for group_index, (label, points) in enumerate(groups.items()):
            points.sort(key=lambda point: point[0])
            style = styles.get(label) or styles.get(y_key) or {
                "color": FALLBACK_COLORS[(spec_index + group_index) % len(FALLBACK_COLORS)],
                "linestyle": FALLBACK_DASHES[(spec_index + group_index) % len(FALLBACK_DASHES)],
                "marker": FALLBACK_MARKERS[(spec_index + group_index) % len(FALLBACK_MARKERS)],
            }
            stride = max(1, len(points) // 12)
            ax.plot(
                [point[0] for point in points], [point[1] for point in points], label=label,
                color=style["color"], linestyle=style["linestyle"], marker=style["marker"],
                markevery=stride, markersize=3, linewidth=DATA_LINEWIDTH,
            )
        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
    if sum(1 for line in ax.lines if not line.get_label().startswith("_")) > 1:
        ax.legend(frameon=False, fontsize=7)
    limits = panel.get("metadata", {}).get("axisLimits", {})
    axes = panel.get("metadata", {}).get("axes", {})
    if axes.get("x", {}).get("scale") == "log10":
        ax.set_xscale("log", base=10)
    if axes.get("y", {}).get("scale") == "log10":
        ax.set_yscale("log", base=10)
    if limits.get("x"):
        ax.set_xlim(*limits["x"])
    if limits.get("y"):
        ax.set_ylim(*limits["y"])
    draw_reference_lines(ax, panel_id)
    ax.grid(False)


def draw_stability_cells(ax, panel, rows, panel_id):
    if panel_id == "stability":
        axes = panel.get("metadata", {}).get("axes", {})
        x_key = axes.get("x", {}).get("dataColumn", "log10_zeta_c")
        y_key = axes.get("y", {}).get("dataColumn", "log10_zeta")
        xlabel = axes.get("x", {}).get("label", r"$\log_{10}\zeta_c$")
        ylabel = axes.get("y", {}).get("label", r"$\log_{10}\zeta$")
    else:
        x_key, y_key = "log10_zeta_c_over_zeta", "gamma_c"
        xlabel, ylabel = r"$\log_{10}(\zeta_c/\zeta)$", r"$\gamma_c$"
    palette = panel.get("metadata", {}).get("categoricalPalette", {})
    for kind in sorted({row.get("stability_kind", "neutral") for row in rows}):
        selected = [row for row in rows if row.get("stability_kind", "neutral") == kind]
        palette_item = palette.get(kind, {})
        if isinstance(palette_item, str):
            color, alpha = palette_item, 1.0
        else:
            color = palette_item.get("color", KIND_COLORS.get(kind, "#999999"))
            alpha = number(palette_item.get("alpha"), 1.0)
        ax.scatter([number(row.get(x_key)) for row in selected], [number(row.get(y_key)) for row in selected],
                   s=7, marker="s", linewidths=0, color=color, alpha=alpha, label=kind)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    axes = panel.get("metadata", {}).get("axes", {})
    if axes.get("x", {}).get("scale") == "log10":
        ax.set_xscale("log", base=10)
    if axes.get("y", {}).get("scale") == "log10":
        ax.set_yscale("log", base=10)
    ax.legend(frameon=False, fontsize=6)
    limits = panel.get("metadata", {}).get("axisLimits", {})
    if limits.get("x"):
        ax.set_xlim(*limits["x"])
    if limits.get("y"):
        ax.set_ylim(*limits["y"])
    ax.grid(False)


def rendering_geometry(panel, suffix):
    for rendering in panel.get("renderings", []):
        if rendering.get("size") == suffix:
            return number(rendering.get("widthInches")), number(rendering.get("heightInches"))
    width = 3.4 if suffix == "single" else 7.1
    snapshot = panel["id"] in {"model", "heatEngine"}
    columns = 1 if suffix == "single" else 2
    height = width * (max(1, (len(load_rows(panel["dataFile"])) + columns - 1) // columns) * 0.72 if snapshot else 0.62)
    return width, max(2.1, height)


for panel in MANIFEST["panels"]:
    rows = load_rows(panel["dataFile"])
    for suffix in ("single", "double"):
        width, height = rendering_geometry(panel, suffix)
        snapshot = panel["id"] in {"model", "heatEngine"}
        columns = 1 if suffix == "single" else 2
        fig, ax = plt.subplots(figsize=(width, height), constrained_layout=True)
        fig.get_layout_engine().set(w_pad=3 / 72, h_pad=3 / 72)
        if snapshot:
            draw_snapshots(ax, rows, panel["id"], columns)
        elif panel["id"] in {"stability", "strip"}:
            draw_stability_cells(ax, panel, rows, panel["id"])
        else:
            draw_series(ax, panel, rows)
        if not snapshot:
            style_axes(ax)
        stem = OUT / f"{panel['id']}-{suffix}"
        fig.savefig(stem.with_suffix(".pdf"))
        fig.savefig(stem.with_suffix(".svg"))
        fig.savefig(stem.with_suffix(".png"), dpi=600)
        plt.close(fig)
