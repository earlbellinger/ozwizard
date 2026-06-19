from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from oz1 import CSV_COLUMNS as OZ1_CSV_COLUMNS  # noqa: E402
from ozc import CSV_COLUMNS as OZC_CSV_COLUMNS  # noqa: E402
from plot_two_phase_lightcurve import write_csv as write_two_phase_csv  # noqa: E402
from solvers import SolverOptions, integrate, midpoint_adaptive_step  # noqa: E402
from stability import StabilityDetector, StabilityOptions  # noqa: E402
from stellingwerf1986 import PaperModel, PaperModelParams, write_csv as write_paper_csv  # noqa: E402


class SolverTests(unittest.TestCase):
    def test_midpoint_matches_translated_fixture(self) -> None:
        result = midpoint_adaptive_step(0.0, [1.0], 0.1, lambda _t, y: [-0.5 * y[0]], 1.0)
        self.assertAlmostEqual(result.t, 0.1)
        self.assertAlmostEqual(result.y[0], 0.95125)
        self.assertGreaterEqual(result.error_norm, 0.0)

    def test_modern_solvers_integrate_exponential_decay(self) -> None:
        exact = math.exp(-1.0)
        for solver in ("rk45", "dop853"):
            with self.subTest(solver=solver):
                result = integrate(
                    lambda _t, y: [-0.5 * y[0]],
                    [1.0],
                    2.0,
                    SolverOptions(solver=solver, initial_step=0.1, max_step=0.2),
                )
                self.assertEqual(result.status, "complete")
                self.assertAlmostEqual(result.points[-1][1][0], exact, places=8)
                self.assertGreater(result.stats.accepted_steps, 0)

    def test_rk45_and_dop853_agree_on_strip_short_run(self) -> None:
        params = PaperModelParams("Strip", zeta=1.0, zetac=1.0, gammac=0.2)
        rk45 = PaperModel(params).run(4.0, solver="rk45", rtol=1.0e-9, atol=1.0e-11)
        dop853 = PaperModel(params).run(4.0, solver="dop853", rtol=1.0e-10, atol=1.0e-12)
        self.assertAlmostEqual(rk45[-1]["R"], dop853[-1]["R"], delta=5.0e-6)
        self.assertAlmostEqual(rk45[-1]["H"], dop853[-1]["H"], delta=5.0e-6)

    def test_domain_failure_returns_status(self) -> None:
        result = integrate(
            lambda _t, _y: (_ for _ in ()).throw(ValueError("domain")),
            [1.0],
            1.0,
            SolverOptions(solver="rk45", initial_step=0.1, min_step=1.0e-6),
        )
        self.assertIn(result.status, {"domain_error", "step_limit"})

    def test_stability_detector_classifies_flat_equilibrium(self) -> None:
        detector = StabilityDetector(StabilityOptions(tolerance=1.0e-3))
        status = None
        for index in range(30):
            status = detector.observe({"tau": index * 0.1, "R": 1.0, "V": 0.0, "H": 1.0, "Uc": 1.0, "L": 1.0})
        self.assertEqual(status, "equilibrium")

    def test_stability_default_requires_five_cycles(self) -> None:
        self.assertEqual(StabilityOptions().stable_cycles, 5)

    def test_csv_headers_use_tau_r_h(self) -> None:
        expected = ("tau", "R", "V", "H")
        self.assertEqual(OZ1_CSV_COLUMNS[:4], expected)
        self.assertEqual(OZC_CSV_COLUMNS[:4], expected)
        for header in (OZ1_CSV_COLUMNS, OZC_CSV_COLUMNS):
            self.assertFalse({"T", "X", "P"} & set(header))

        paper_row = {"tau": 0.0, "R": 1.0, "V": 0.0, "H": 1.0, "Uc": 1.0, "Lr": 1.0, "Lc": 0.0, "L": 1.0}
        phase_row = {"Phase": 0.0, "tau": 0.0, "R": 1.0, "V": 0.0, "H": 1.0, "L": 1.0}
        with TemporaryDirectory() as tmp:
            paper_path = Path(tmp) / "paper.csv"
            phase_path = Path(tmp) / "phase.csv"
            write_paper_csv(paper_path, [paper_row])
            write_two_phase_csv(phase_path, [phase_row])
            self.assertEqual(paper_path.read_text().splitlines()[0], "tau,R,V,H,Uc,Lr,Lc,L")
            self.assertEqual(phase_path.read_text().splitlines()[0], "Phase,tau,R,V,H,L")
            self.assertFalse({"T", "X", "P"} & set(paper_path.read_text().splitlines()[0].split(",")))
            self.assertFalse({"T", "X", "P"} & set(phase_path.read_text().splitlines()[0].split(",")))


if __name__ == "__main__":
    unittest.main()
