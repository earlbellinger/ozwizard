"""Thor plot translations for the Stellingwerf one-zone model CSV output."""

from __future__ import annotations

import argparse
import csv
from collections.abc import Iterable, Sequence
from html import escape
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "ozc"
COLOR_BY_COLUMN = {
    "R": "#2f6fbb",
    "V": "#b23a48",
    "H": "#4f8a3f",
    "L": "#7a4fb3",
    "Lr": "#d1882f",
    "Lc": "#238c8c",
    "Uc": "#555555",
}


def read_csv_rows(path: Path) -> list[dict[str, float]]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        return [{key: float(value) for key, value in row.items()} for row in reader]


def _nice_ticks(minimum: float, maximum: float, count: int = 5) -> list[float]:
    if count <= 1 or minimum == maximum:
        return [minimum]
    step = (maximum - minimum) / (count - 1)
    return [minimum + index * step for index in range(count)]


def _range_with_padding(values: Iterable[float]) -> tuple[float, float]:
    values = list(values)
    minimum = min(values)
    maximum = max(values)
    if minimum == maximum:
        padding = abs(minimum) * 0.1 or 1.0
    else:
        padding = (maximum - minimum) * 0.07
    return minimum - padding, maximum + padding


def _format_number(value: float) -> str:
    if abs(value) >= 1000.0 or (abs(value) < 0.001 and value != 0.0):
        return f"{value:.2e}"
    return f"{value:.3g}"


def _polyline(points: Sequence[tuple[float, float]]) -> str:
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in points)


def write_timeseries_svg(
    rows: Sequence[dict[str, float]],
    output_path: Path,
    columns: Sequence[str],
    title: str,
    width: int = 950,
    height: int = 388,
) -> None:
    x_min, x_max = _range_with_padding(row["tau"] for row in rows)
    y_min, y_max = _range_with_padding(row[column] for row in rows for column in columns)
    _write_xy_svg(
        rows=rows,
        output_path=output_path,
        curves=[("tau", column, column) for column in columns],
        title=title,
        x_label="tau",
        y_label=", ".join(columns),
        x_min=x_min,
        x_max=x_max,
        y_min=y_min,
        y_max=y_max,
        width=width,
        height=height,
    )


def write_xy_svg(
    rows: Sequence[dict[str, float]],
    output_path: Path,
    x_column: str,
    y_column: str,
    title: str,
    width: int = 950,
    height: int = 388,
) -> None:
    x_min, x_max = _range_with_padding(row[x_column] for row in rows)
    y_min, y_max = _range_with_padding(row[y_column] for row in rows)
    _write_xy_svg(
        rows=rows,
        output_path=output_path,
        curves=[(x_column, y_column, f"{y_column} vs {x_column}")],
        title=title,
        x_label=x_column,
        y_label=y_column,
        x_min=x_min,
        x_max=x_max,
        y_min=y_min,
        y_max=y_max,
        width=width,
        height=height,
    )


def _write_xy_svg(
    rows: Sequence[dict[str, float]],
    output_path: Path,
    curves: Sequence[tuple[str, str, str]],
    title: str,
    x_label: str,
    y_label: str,
    x_min: float,
    x_max: float,
    y_min: float,
    y_max: float,
    width: int,
    height: int,
) -> None:
    left = 64
    right = 155 if len(curves) > 1 else 50
    top = 36
    bottom = 52
    plot_width = width - left - right
    plot_height = height - top - bottom

    def sx(value: float) -> float:
        return left + (value - x_min) / (x_max - x_min) * plot_width

    def sy(value: float) -> float:
        return top + plot_height - (value - y_min) / (y_max - y_min) * plot_height

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{left}" y="23" font-family="Arial, sans-serif" font-size="16" font-weight="700">{escape(title)}</text>',
    ]

    for tick in _nice_ticks(x_min, x_max):
        x = sx(tick)
        lines.append(f'<line x1="{x:.2f}" y1="{top}" x2="{x:.2f}" y2="{top + plot_height}" stroke="#eeeeee"/>')
        lines.append(
            f'<text x="{x:.2f}" y="{height - 18}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="11" fill="#333333">{_format_number(tick)}</text>'
        )

    for tick in _nice_ticks(y_min, y_max):
        y = sy(tick)
        lines.append(f'<line x1="{left}" y1="{y:.2f}" x2="{left + plot_width}" y2="{y:.2f}" stroke="#eeeeee"/>')
        lines.append(
            f'<text x="{left - 9}" y="{y + 4:.2f}" text-anchor="end" '
            f'font-family="Arial, sans-serif" font-size="11" fill="#333333">{_format_number(tick)}</text>'
        )

    lines.extend(
        [
            f'<rect x="{left}" y="{top}" width="{plot_width}" height="{plot_height}" fill="none" stroke="#222222"/>',
            f'<text x="{left + plot_width / 2:.2f}" y="{height - 3}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="12" fill="#222222">{escape(x_label)}</text>',
            f'<text x="15" y="{top + plot_height / 2:.2f}" text-anchor="middle" '
            f'transform="rotate(-90 15 {top + plot_height / 2:.2f})" '
            f'font-family="Arial, sans-serif" font-size="12" fill="#222222">{escape(y_label)}</text>',
        ]
    )

    for curve_index, (x_column, y_column, label) in enumerate(curves):
        color = COLOR_BY_COLUMN.get(y_column, "#333333")
        points = [(sx(row[x_column]), sy(row[y_column])) for row in rows]
        lines.append(
            f'<polyline points="{_polyline(points)}" fill="none" stroke="{color}" '
            'stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>'
        )
        if len(curves) > 1:
            legend_x = left + plot_width + 22
            legend_y = top + 18 + curve_index * 20
            lines.append(f'<line x1="{legend_x}" y1="{legend_y}" x2="{legend_x + 18}" y2="{legend_y}" stroke="{color}" stroke-width="2"/>')
            lines.append(
                f'<text x="{legend_x + 25}" y="{legend_y + 4}" '
                f'font-family="Arial, sans-serif" font-size="12" fill="#222222">{escape(label)}</text>'
            )

    lines.append("</svg>")
    output_path.write_text("\n".join(lines), encoding="utf-8")


def plot_ozc(csv_path: Path, output_dir: Path) -> list[Path]:
    rows = read_csv_rows(csv_path)
    outputs = [
        output_dir / "ozc_timeseries.svg",
        output_dir / "ozc_phase.svg",
    ]
    write_timeseries_svg(rows, outputs[0], ("R", "V", "H", "L", "Lr", "Lc", "Uc"), "OZc translated Thor plot")
    write_xy_svg(rows, outputs[1], "R", "V", "OZc sequence plot")
    return outputs


def plot_ozcl(csv_path: Path, output_dir: Path) -> list[Path]:
    rows = read_csv_rows(csv_path)
    output = output_dir / "ozcl_luminosity.svg"
    write_timeseries_svg(rows, output, ("L", "Lr", "Lc", "Uc"), "OZcL translated luminosity plot")
    return [output]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=OUTPUT_DIR / "ozc.csv", help="CSV generated by ozc.py")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Directory for SVG output")
    parser.add_argument("--variant", choices=("all", "ozc", "ozcl"), default="all")
    args = parser.parse_args(argv)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    if args.variant in ("all", "ozc"):
        outputs.extend(plot_ozc(args.csv, args.output_dir))
    if args.variant in ("all", "ozcl"):
        outputs.extend(plot_ozcl(args.csv, args.output_dir))

    for output in outputs:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
