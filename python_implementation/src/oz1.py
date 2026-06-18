"""Stellingwerf OZ1.S radiative one-zone test case translated to Python."""

from __future__ import annotations

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from solvers import DEFAULT_SOLVER, SOLVER_NAMES, SolverName, SolverOptions, integrate
from stability import StabilityDetector, StabilityOptions


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "oz1"
CSV_COLUMNS = ("tau", "R", "V", "P", "L")


@dataclass
class OZ1Parameters:
    steps: int = 1000
    t0: float = 0.0
    radius0: float = 1.2
    velocity0: float = 0.0
    pressure0: float = 0.8
    err_tol: float = 0.00001
    t_last: float = 10.0

    zeta: float = 1.0
    mgeo: float = 10.0
    gamma1: float = 1.1
    nk: float = 1.0
    sk: float = 3.0
    interior_lum_exp: float = -1.0
    cq: float = 2.0

    @property
    def initial_step(self) -> float:
        return 0.1 * (self.t_last - self.t0) / self.steps

    @property
    def eta3(self) -> float:
        return 1.0 - 3.0 / self.mgeo

    @property
    def eta(self) -> float:
        return self.eta3 ** (1.0 / 3.0)

    @property
    def gamma11(self) -> float:
        return self.gamma1 - 1.0

    @property
    def b1(self) -> float:
        return (self.sk + 4.0) * self.gamma11

    @property
    def b(self) -> float:
        return 4.0 + self.mgeo * (self.nk - self.b1)

    @property
    def q(self) -> float:
        return self.mgeo * self.gamma1 - 2.0


@dataclass
class OZ1Sample:
    t: float
    radius: float
    velocity: float
    pressure: float
    luminosity: float

    def as_row(self) -> dict[str, float]:
        return {
            "tau": self.t,
            "R": self.radius,
            "V": self.velocity,
            "P": self.pressure,
            "L": self.luminosity,
        }


class OZ1Model:
    def __init__(self, params: OZ1Parameters) -> None:
        self.params = params

    def mvar(self, radius: float) -> float:
        return 3.0 / (1.0 - (self.params.eta / radius) ** 3.0)

    def bvar(self, radius: float) -> float:
        return 4.0 + self.mvar(radius) * (self.params.nk - self.params.b1)

    def qvar(self, radius: float) -> float:
        return self.mvar(radius) * self.params.gamma1 - 2.0

    def luminosity(self, radius: float, pressure: float) -> float:
        return radius**self.bvar(radius) * pressure ** (self.params.sk + 4.0)

    def derivatives(self, _time: float, state: Sequence[float]) -> list[float]:
        radius, velocity, pressure = state
        if radius <= 0.0 or pressure <= 0.0:
            raise ValueError("model left the positive-radius/positive-pressure domain")
        return [
            velocity,
            pressure / radius**self.qvar(radius) - 1.0 / radius**2.0 - self.params.cq * velocity**3.0,
            self.params.zeta
            * radius ** (self.mvar(radius) * self.params.gamma11)
            * (radius**self.params.interior_lum_exp - self.luminosity(radius, pressure)),
        ]

    def make_sample(self, t: float, state: Sequence[float], initial: bool = False) -> OZ1Sample:
        radius, velocity, pressure = state
        luminosity = 1.0 if initial else self.luminosity(radius, pressure)
        return OZ1Sample(t, radius, velocity, pressure, luminosity)

    def run(
        self,
        verbose: bool = True,
        *,
        solver: SolverName = DEFAULT_SOLVER,
        rtol: float = 1.0e-8,
        atol: float = 1.0e-10,
        max_step: float = 0.15,
        err_tol: float | None = None,
        max_rows: int | None = None,
        run_until_stable: bool = True,
        stability_tol: float = 2.0e-3,
        stable_cycles: int = 5,
    ) -> list[OZ1Sample]:
        params = self.params
        if verbose:
            self.show_setup()

        default_rows = params.steps + 1 if solver == "midpoint" else 500_000
        options = SolverOptions(
            solver=solver,
            rtol=rtol,
            atol=atol,
            initial_step=params.initial_step,
            max_step=max_step,
            max_rows=max_rows or default_rows,
            err_tol=err_tol or params.err_tol,
        )
        detector = StabilityDetector(
            StabilityOptions(
                run_until_stable=run_until_stable,
                tolerance=stability_tol,
                stable_cycles=stable_cycles,
            )
        )
        detector.observe(self.make_sample(params.t0, [params.radius0, params.velocity0, params.pressure0]).as_row())

        def stop(time: float, state: Sequence[float]) -> str | None:
            if state[0] > 5.0:
                return "runaway"
            return detector.observe(self.make_sample(time, state).as_row())

        result = integrate(
            self.derivatives,
            [params.radius0, params.velocity0, params.pressure0],
            params.t_last,
            options,
            t0=params.t0,
            stop_condition=stop,
        )
        if verbose:
            if result.status != "complete":
                print(result.message)
            elif run_until_stable:
                print("max_time")
        return [self.make_sample(time, state, initial=index == 0) for index, (time, state) in enumerate(result.points)]

    def show_setup(self) -> None:
        p = self.params
        print("Zeta Mgeo Eta Cq")
        print(f"{p.zeta:g} {p.mgeo:g} {p.eta:g} {p.cq:g}")
        print("G1 Nk Sk B Q U")
        print(f"{p.gamma1:g} {p.nk:g} {p.sk:g} {p.b:g} {p.q:g} {p.interior_lum_exp:g}")


def write_samples(samples: Sequence[OZ1Sample], output_path: Path) -> None:
    with output_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for sample in samples:
            writer.writerow(sample.as_row())


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR / "oz1.csv", help="CSV output path")
    parser.add_argument("--quiet", action="store_true", help="Suppress setup/progress output")
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

    params = OZ1Parameters()
    params.t_last = args.max_time
    samples = OZ1Model(params).run(
        verbose=not args.quiet,
        solver=args.solver,
        rtol=args.rtol,
        atol=args.atol,
        max_step=args.max_step,
        err_tol=args.err_tol,
        run_until_stable=args.run_until_stable,
        stability_tol=args.stability_tol,
        stable_cycles=args.stable_cycles,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_samples(samples, args.output)
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
