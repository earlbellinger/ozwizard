"""Stability classification helpers for one-zone model integrations."""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Literal


StableStatus = Literal["equilibrium", "limit_cycle"]
Row = dict[str, float]


@dataclass(frozen=True)
class StabilityOptions:
    run_until_stable: bool = True
    tolerance: float = 2.0e-3
    stable_cycles: int = 5
    min_time: float = 2.0
    equilibrium_window: float = 1.5


@dataclass
class StabilityDetector:
    options: StabilityOptions
    rows: list[Row] = field(default_factory=list)
    peak_indices: list[int] = field(default_factory=list)

    def observe(self, row: Row) -> StableStatus | None:
        if not self.options.run_until_stable:
            return None
        self.rows.append(row)
        self._capture_luminosity_peak()
        if row["tau"] < self.options.min_time:
            return None
        if self._is_equilibrium():
            return "equilibrium"
        if self._is_limit_cycle():
            return "limit_cycle"
        return None

    def _capture_luminosity_peak(self) -> None:
        if len(self.rows) < 3:
            return
        prev = self.rows[-3]
        peak = self.rows[-2]
        current = self.rows[-1]
        if prev["L"] < peak["L"] >= current["L"]:
            if self.peak_indices and peak["tau"] - self.rows[self.peak_indices[-1]]["tau"] < 0.05:
                if peak["L"] > self.rows[self.peak_indices[-1]]["L"]:
                    self.peak_indices[-1] = len(self.rows) - 2
            else:
                self.peak_indices.append(len(self.rows) - 2)

    def _is_equilibrium(self) -> bool:
        end = self.rows[-1]["tau"]
        window = [row for row in reversed(self.rows) if end - row["tau"] <= self.options.equilibrium_window]
        if len(window) < 6 or end - window[-1]["tau"] < self.options.equilibrium_window * 0.75:
            return False
        keys = [key for key in ("R", "V", "H", "Uc", "L") if key in window[0]]
        for key in keys:
            values = [row[key] for row in window]
            scale = max(1.0, max(abs(value) for value in values))
            if (max(values) - min(values)) / scale > self.options.tolerance:
                return False
        return max(abs(row["V"]) for row in window) < self.options.tolerance

    def _is_limit_cycle(self) -> bool:
        needed_peaks = self.options.stable_cycles + 1
        if len(self.peak_indices) < needed_peaks:
            return False
        peak_indices = self.peak_indices[-needed_peaks:]
        periods = [self.rows[right]["tau"] - self.rows[left]["tau"] for left, right in zip(peak_indices, peak_indices[1:])]
        if not self._relative_spread_ok(periods, self.options.tolerance):
            return False
        amplitudes: list[float] = []
        peak_luminosities: list[float] = []
        for left, right in zip(peak_indices, peak_indices[1:]):
            cycle = self.rows[left : right + 1]
            lum = [row["L"] for row in cycle]
            amplitudes.append(max(lum) - min(lum))
            peak_luminosities.append(self.rows[right]["L"])
        if not self._relative_spread_ok(amplitudes, self.options.tolerance):
            return False
        if not self._relative_spread_ok(peak_luminosities, self.options.tolerance):
            return False
        return True

    @staticmethod
    def _relative_spread_ok(values: list[float], tolerance: float) -> bool:
        if len(values) < 2:
            return False
        center = max(abs(mean(values)), 1.0e-12)
        return (max(values) - min(values)) / center <= tolerance
