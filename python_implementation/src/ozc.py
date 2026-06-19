"""Stellingwerf convective one-zone pulsation model translated from OZC.S."""

from __future__ import annotations

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass
from math import sqrt
from pathlib import Path

from ozc_plot import plot_ozc, plot_ozcl
from solvers import DEFAULT_SOLVER, SOLVER_NAMES, SolverName, SolverOptions, integrate
from stability import StabilityDetector, StabilityOptions


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "ozc"
CSV_COLUMNS = ("tau", "R", "V", "H", "L", "Lr", "Lc", "Uc")


@dataclass
class OZCParameters:
    n_equations: int = 4
    steps: int = 1000
    t0: float = 0.0
    radius0: float = 1.4
    velocity0: float = 0.0
    pressure0: float = 0.9
    convective_velocity0: float = 0.7
    err_tol: float = 0.00001
    t_last: float = 10.0

    zeta: float = 1.0
    mgeo: float = 10.0
    gamma1: float = 1.1
    nk: float = 1.0
    sk: float = 3.0
    interior_lum_exp: float = -1.0
    cq: float = 1.0

    zetac: float = 1.0
    gammac: float = 0.5

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

    @property
    def dc(self) -> float:
        return self.mgeo * self.gamma11 / 2.0

    @property
    def cc(self) -> float:
        return self.mgeo - 2.0

    @property
    def gammar(self) -> float:
        return 1.0 - self.gammac


@dataclass
class Sample:
    t: float
    radius: float
    velocity: float
    pressure: float
    luminosity: float
    radiative_luminosity: float
    convective_luminosity: float
    convective_velocity: float

    def as_row(self) -> dict[str, float]:
        return {
            "tau": self.t,
            "R": self.radius,
            "V": self.velocity,
            "H": self.pressure,
            "L": self.luminosity,
            "Lr": self.radiative_luminosity,
            "Lc": self.convective_luminosity,
            "Uc": self.convective_velocity,
        }


class ConvectiveOneZoneModel:
    def __init__(self, params: OZCParameters, convective_driver: str = "h") -> None:
        if convective_driver not in {"h", "v", "abs-v"}:
            raise ValueError("convective_driver must be 'h', 'v', or 'abs-v'")
        self.params = params
        self.convective_driver = convective_driver

    def mvar(self, radius: float) -> float:
        return 3.0 / (1.0 - (self.params.eta / radius) ** 3.0)

    def bvar(self, radius: float) -> float:
        return 4.0 + self.mvar(radius) * (self.params.nk - self.params.b1)

    def qvar(self, radius: float) -> float:
        return self.mvar(radius) * self.params.gamma1 - 2.0

    def cvar(self, radius: float) -> float:
        return self.mvar(radius) - 2.0

    def dvar(self, radius: float) -> float:
        return self.mvar(radius) * self.params.gamma11 / 2.0

    def radiative_luminosity(self, radius: float, pressure: float) -> float:
        return radius**self.bvar(radius) * pressure ** (self.params.sk + 4.0)

    def convective_luminosity(self, radius: float, convective_velocity: float) -> float:
        return radius ** (-self.cvar(radius)) * convective_velocity**3.0

    def total_luminosity(self, radius: float, pressure: float, convective_velocity: float) -> float:
        radiative = self.radiative_luminosity(radius, pressure)
        convective = self.convective_luminosity(radius, convective_velocity)
        return self.params.gammar * radiative + self.params.gammac * convective

    def derivatives(self, _time: float, state: Sequence[float]) -> list[float]:
        radius, velocity, pressure, convective_velocity = state
        if radius <= 0.0 or pressure <= 0.0:
            raise ValueError("model left the positive-radius/positive-H domain")
        radiative = self.radiative_luminosity(radius, pressure)
        convective = self.convective_luminosity(radius, convective_velocity)

        if self.convective_driver == "h":
            driver = pressure
        elif self.convective_driver == "abs-v":
            driver = abs(velocity)
        else:
            driver = velocity
        if driver < 0.0:
            raise ValueError(
                f"Cannot take a real square root of {self.convective_driver}={driver:g}; "
                "use the default H driver for the Stellingwerf equation."
            )

        return [
            velocity,
            pressure / radius**self.qvar(radius) - 1.0 / radius**2.0 - self.params.cq * velocity**3.0,
            self.params.zeta
            * radius ** (self.mvar(radius) * self.params.gamma11)
            * (
                radius**self.params.interior_lum_exp
                - self.params.gammar * radiative
                - self.params.gammac * convective
            ),
            self.params.zetac * (radius ** (-self.dvar(radius)) * sqrt(driver) - convective_velocity),
        ]

    def make_sample(self, t: float, state: Sequence[float], initial: bool = False) -> Sample:
        radius, velocity, pressure, convective_velocity = state
        if initial:
            luminosity = 1.0
            radiative = 1.0
            convective = 0.0
        else:
            radiative = self.radiative_luminosity(radius, pressure)
            convective = self.convective_luminosity(radius, convective_velocity)
            luminosity = self.params.gammar * radiative + self.params.gammac * convective
        return Sample(t, radius, velocity, pressure, luminosity, radiative, convective, convective_velocity)

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
    ) -> list[Sample]:
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
        detector.observe(
            self.make_sample(
                params.t0,
                [params.radius0, params.velocity0, params.pressure0, params.convective_velocity0],
            ).as_row()
        )

        def stop(time: float, state: Sequence[float]) -> str | None:
            sample = self.make_sample(time, state)
            if sample.radius > 5.0 or sample.radiative_luminosity > 10.0:
                return "runaway"
            return detector.observe(sample.as_row())

        result = integrate(
            self.derivatives,
            [params.radius0, params.velocity0, params.pressure0, params.convective_velocity0],
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
        params = self.params
        print("Zeta Mgeo Eta Cq")
        print(f"{params.zeta:g} {params.mgeo:g} {params.eta:g} {params.cq:g}")
        print("G1 Nk Sk B Q U")
        print(f"{params.gamma1:g} {params.nk:g} {params.sk:g} {params.b:g} {params.q:g} {params.interior_lum_exp:g}")
        print("Dc Cc Zetac Gammac")
        print(f"{params.dc:g} {params.cc:g} {params.zetac:g} {params.gammac:g}")


def write_samples(samples: Sequence[Sample], output_path: Path) -> None:
    with output_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for sample in samples:
            writer.writerow(sample.as_row())


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR / "ozc.csv", help="CSV output path")
    parser.add_argument("--plot-dir", type=Path, default=OUTPUT_DIR, help="Directory for translated SVG plots")
    parser.add_argument("--no-plots", action="store_true", help="Only write the CSV")
    parser.add_argument(
        "--convective-driver",
        choices=("h", "v", "abs-v"),
        default="h",
        help="Use H^(1/2), literal sqrt(V), or the bugged sqrt(abs(V)) driver",
    )
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

    params = OZCParameters()
    params.t_last = args.max_time
    model = ConvectiveOneZoneModel(params, convective_driver=args.convective_driver)
    samples = model.run(
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

    if not args.no_plots:
        args.plot_dir.mkdir(parents=True, exist_ok=True)
        for output in [*plot_ozc(args.output, args.plot_dir), *plot_ozcl(args.output, args.plot_dir)]:
            print(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
