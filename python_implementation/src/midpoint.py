"""Midpoint/RK2 integrator translated from 0MidPoint.s."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from math import sqrt


State = list[float]
Derivative = Callable[[float, Sequence[float]], Sequence[float]]


@dataclass(frozen=True)
class StepResult:
    """Result of one adaptive midpoint step."""

    x: float
    y: State
    step: float
    error: float
    resets: int


def midpoint_step(
    x: float,
    y: Sequence[float],
    step: float,
    derivative: Derivative,
    err_tol: float | None = None,
    max_resets: int = 10,
) -> StepResult:
    """Advance one step using the S_Tran 0MidPoint.s algorithm.

    The original routine estimates error from the difference between the
    half-step and centered full-step deltas, then shrinks or grows the next
    step size. This function intentionally mirrors that behavior.
    """

    x_start = x
    y0 = list(y)
    tol = err_tol or 0.0

    for reset_index in range(max_resets + 1):
        k1 = [(step / 2.0) * value for value in derivative(x, y0)]

        x_mid = x_start + step / 2.0
        y_mid = [value + delta for value, delta in zip(y0, k1, strict=True)]

        k2 = [step * value for value in derivative(x_mid, y_mid)]
        raw_error = sum((full_delta / 2.0 - half_delta) ** 2 for full_delta, half_delta in zip(k2, k1, strict=True))

        x_new = x_start + step
        y_new = [value + full_delta for value, full_delta in zip(y0, k2, strict=True)]

        scaled_error = 0.0
        if tol:
            scaled_error = sqrt(raw_error) * step / 2.0

            if scaled_error > 10.0 * tol:
                if reset_index >= max_resets:
                    raise RuntimeError("Midpoint setup error: step reset limit reached")
                step /= 10.0
                continue

            if scaled_error > tol:
                step *= 0.9
            elif scaled_error < tol / 2.0:
                step *= 1.1

        return StepResult(x=x_new, y=y_new, step=step, error=scaled_error, resets=reset_index)

    raise RuntimeError("Midpoint setup error: step reset loop exited unexpectedly")
