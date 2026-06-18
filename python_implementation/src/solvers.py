"""Small pure-Python ODE solvers for the one-zone model scripts."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from math import isfinite, sqrt
from typing import Literal

from midpoint import midpoint_step


State = list[float]
Derivative = Callable[[float, Sequence[float]], Sequence[float]]
StopCondition = Callable[[float, Sequence[float]], str | None]
SolverName = Literal["midpoint", "rk45", "dop853"]
Status = Literal["complete", "runaway", "domain_error", "step_limit", "row_limit", "equilibrium", "limit_cycle"]

DEFAULT_SOLVER: SolverName = "rk45"
SOLVER_NAMES: tuple[SolverName, ...] = ("midpoint", "rk45", "dop853")


@dataclass(frozen=True)
class SolverOptions:
    solver: SolverName = DEFAULT_SOLVER
    rtol: float = 1.0e-8
    atol: float = 1.0e-10
    initial_step: float = 0.001
    max_step: float = 0.15
    min_step: float = 1.0e-10
    max_rows: int = 500_000
    err_tol: float | None = None


@dataclass(frozen=True)
class SolverStats:
    accepted_steps: int
    rejected_steps: int
    final_step: float
    max_normalized_error: float


@dataclass(frozen=True)
class OdeResult:
    points: list[tuple[float, State]]
    status: Status
    message: str
    stats: SolverStats


@dataclass(frozen=True)
class _StepResult:
    t: float
    y: State
    next_step: float
    error_norm: float
    rejected_steps: int


def clamp(low: float, value: float, high: float) -> float:
    return min(max(value, low), high)


def rms_norm(values: Sequence[float]) -> float:
    return sqrt(sum(value * value for value in values) / len(values))


def weighted_error_norm(y0: Sequence[float], y1: Sequence[float], error: Sequence[float], rtol: float, atol: float) -> float:
    scaled: list[float] = []
    for before, after, err in zip(y0, y1, error, strict=True):
        scale = atol + rtol * max(abs(before), abs(after))
        scaled.append(err / scale)
    return rms_norm(scaled)


def combine(y: Sequence[float], h: float, ks: Sequence[Sequence[float]], coeffs: Sequence[float]) -> State:
    return [
        value + h * sum(coeff * stage[i] for coeff, stage in zip(coeffs, ks, strict=True))
        for i, value in enumerate(y)
    ]


RK45_C = (0.0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1.0)
RK45_A = (
    (),
    (1 / 5,),
    (3 / 40, 9 / 40),
    (44 / 45, -56 / 15, 32 / 9),
    (19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729),
    (9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656),
)
RK45_B = (35 / 384, 0.0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84)
RK45_E = (-71 / 57600, 0.0, 71 / 16695, -71 / 1920, 17253 / 339200, -22 / 525, 1 / 40)


def rk45_step(t: float, y: Sequence[float], h: float, derivative: Derivative, rtol: float, atol: float) -> _StepResult:
    k: list[State] = [list(derivative(t, y))]
    for stage in range(1, len(RK45_C)):
        y_stage = combine(y, h, k, RK45_A[stage])
        k.append(list(derivative(t + RK45_C[stage] * h, y_stage)))

    y_new = combine(y, h, k, RK45_B)
    k.append(list(derivative(t + h, y_new)))
    error = [h * sum(coeff * stage[i] for coeff, stage in zip(RK45_E, k, strict=True)) for i in range(len(y))]
    error_norm = weighted_error_norm(y, y_new, error, rtol, atol)
    return _StepResult(t + h, y_new, h, error_norm, 0)


# DOP853 coefficients mirror SciPy's pure-Python DOP853 implementation, which
# uses the Hairer/Norsett/Wanner 8(5,3) tableau.
DOP853_C = (
    0.0,
    0.526001519587677318785587544488e-01,
    0.789002279381515978178381316732e-01,
    0.118350341907227396726757197510,
    0.281649658092772603273242802490,
    0.333333333333333333333333333333,
    0.25,
    0.307692307692307692307692307692,
    0.651282051282051282051282051282,
    0.6,
    0.857142857142857142857142857142,
    1.0,
)
DOP853_A = (
    (),
    (5.26001519587677318785587544488e-2,),
    (1.97250569845378994544595329183e-2, 5.91751709536136983633785987549e-2),
    (2.95875854768068491816892993775e-2, 0.0, 8.87627564304205475450678981324e-2),
    (2.41365134159266685502369798665e-1, 0.0, -8.84549479328286085344864962717e-1, 9.24834003261792003115737966543e-1),
    (3.7037037037037037037037037037e-2, 0.0, 0.0, 1.70828608729473871279604482173e-1, 1.25467687566822425016691814123e-1),
    (3.7109375e-2, 0.0, 0.0, 1.70252211019544039314978060272e-1, 6.02165389804559606850219397283e-2, -1.7578125e-2),
    (3.70920001185047927108779319836e-2, 0.0, 0.0, 1.70383925712239993810214054705e-1, 1.07262030446373284651809199168e-1, -1.53194377486244017527936158236e-2, 8.27378916381402288758473766002e-3),
    (6.24110958716075717114429577812e-1, 0.0, 0.0, -3.36089262944694129406857109825, -8.68219346841726006818189891453e-1, 2.75920996994467083049415600797e1, 2.01540675504778934086186788979e1, -4.34898841810699588477366255144e1),
    (4.77662536438264365890433908527e-1, 0.0, 0.0, -2.48811461997166764192642586468, -5.90290826836842996371446475743e-1, 2.12300514481811942347288949897e1, 1.52792336328824235832596922938e1, -3.32882109689848629194453265587e1, -2.03312017085086261358222928593e-2),
    (-9.3714243008598732571704021658e-1, 0.0, 0.0, 5.18637242884406370830023853209, 1.09143734899672957818500254654, -8.14978701074692612513997267357, -1.85200656599969598641566180701e1, 2.27394870993505042818970056734e1, 2.49360555267965238987089396762, -3.0467644718982195003823669022),
    (2.27331014751653820792359768449, 0.0, 0.0, -1.05344954667372501984066689879e1, -2.00087205822486249909675718444, -1.79589318631187989172765950534e1, 2.79488845294199600508499808837e1, -2.85899827713502369474065508674, -8.87285693353062954433549289258, 1.23605671757943030647266201528e1, 6.43392746015763530355970484046e-1),
)
DOP853_B = (
    5.42937341165687622380535766363e-2,
    0.0,
    0.0,
    0.0,
    0.0,
    4.45031289275240888144113950566,
    1.89151789931450038304281599044,
    -5.8012039600105847814672114227,
    3.1116436695781989440891606237e-1,
    -1.52160949662516078556178806805e-1,
    2.01365400804030348374776537501e-1,
    4.47106157277725905176885569043e-2,
)
DOP853_E3 = (
    -0.189800754072407617382868756574,
    0.0,
    0.0,
    0.0,
    0.0,
    4.45031289275240888144113950566,
    1.89151789931450038304281599044,
    -5.8012039600105847814672114227,
    -0.422682321324528962932445157177,
    -0.152160949662516078556178806805,
    0.201365400804030348374776537501,
    0.0226517921983608252170407424708,
    0.0,
)
DOP853_E5 = (
    0.1312004499419488073250102996e-1,
    0.0,
    0.0,
    0.0,
    0.0,
    -0.1225156446376204440720569753e1,
    -0.4957589496572501915214079952,
    0.1664377182454986536961530415e1,
    -0.3503288487499736816886487290,
    0.3341791187130174790297318841,
    0.8192320648511571246570742613e-1,
    -0.2235530786388629525884427845e-1,
    0.0,
)


def dop853_step(t: float, y: Sequence[float], h: float, derivative: Derivative, rtol: float, atol: float) -> _StepResult:
    k: list[State] = [list(derivative(t, y))]
    for stage in range(1, len(DOP853_C)):
        y_stage = combine(y, h, k, DOP853_A[stage])
        k.append(list(derivative(t + DOP853_C[stage] * h, y_stage)))

    y_new = combine(y, h, k, DOP853_B)
    k.append(list(derivative(t + h, y_new)))

    err5: list[float] = []
    err3: list[float] = []
    for i, (before, after) in enumerate(zip(y, y_new, strict=True)):
        scale = atol + rtol * max(abs(before), abs(after))
        err5.append(sum(coeff * stage[i] for coeff, stage in zip(DOP853_E5, k, strict=True)) / scale)
        err3.append(sum(coeff * stage[i] for coeff, stage in zip(DOP853_E3, k, strict=True)) / scale)
    err5_norm_2 = sum(value * value for value in err5)
    err3_norm_2 = sum(value * value for value in err3)
    if err5_norm_2 == 0.0 and err3_norm_2 == 0.0:
        error_norm = 0.0
    else:
        error_norm = abs(h) * err5_norm_2 / sqrt((err5_norm_2 + 0.01 * err3_norm_2) * len(y))
    return _StepResult(t + h, y_new, h, error_norm, 0)


def midpoint_adaptive_step(t: float, y: Sequence[float], h: float, derivative: Derivative, err_tol: float) -> _StepResult:
    result = midpoint_step(t, y, h, derivative, err_tol)
    return _StepResult(result.x, result.y, result.step, result.error, result.resets)


def adaptive_step(t: float, y: Sequence[float], h: float, derivative: Derivative, options: SolverOptions) -> _StepResult:
    if options.solver == "midpoint":
        return midpoint_adaptive_step(t, y, h, derivative, options.err_tol or options.atol)
    if options.solver == "rk45":
        return rk45_step(t, y, h, derivative, options.rtol, options.atol)
    if options.solver == "dop853":
        return dop853_step(t, y, h, derivative, options.rtol, options.atol)
    raise ValueError(f"Unknown solver: {options.solver}")


def next_modern_step(h: float, error_norm: float, order: int, was_rejected: bool, min_step: float, max_step: float) -> float:
    if error_norm == 0.0:
        factor = 5.0
    else:
        factor = clamp(0.2, 0.9 * error_norm ** (-1.0 / (order + 1.0)), 5.0)
    if was_rejected:
        factor = min(1.0, factor)
    return clamp(min_step, abs(h) * factor, max_step)


def integrate(
    derivative: Derivative,
    y0: Sequence[float],
    t_end: float,
    options: SolverOptions,
    *,
    t0: float = 0.0,
    stop_condition: StopCondition | None = None,
) -> OdeResult:
    if options.solver not in SOLVER_NAMES:
        raise ValueError(f"Unknown solver: {options.solver}")
    if t_end < t0:
        raise ValueError("Only forward integration is supported")
    if options.initial_step <= 0.0 or options.max_step <= 0.0 or options.min_step <= 0.0:
        raise ValueError("Step sizes must be positive")

    t = t0
    y = list(y0)
    h = min(options.initial_step, options.max_step, max(options.min_step, t_end - t0 or options.initial_step))
    points: list[tuple[float, State]] = [(t, y.copy())]
    accepted = 0
    rejected = 0
    max_error = 0.0
    status: Status = "complete"
    message = "complete"

    while t < t_end:
        if len(points) >= options.max_rows:
            status = "row_limit"
            message = "row_limit"
            break

        h = min(h, t_end - t)
        if h < options.min_step:
            status = "step_limit"
            message = "step_limit"
            break

        step_rejected = False
        while True:
            try:
                result = adaptive_step(t, y, h, derivative, options)
            except ValueError as error:
                if options.solver == "midpoint" or h <= options.min_step:
                    status = "domain_error"
                    message = str(error) or "domain_error"
                    break
                rejected += 1
                step_rejected = True
                h *= 0.2
                if h < options.min_step:
                    status = "step_limit"
                    message = "step_limit"
                    break
                continue

            if options.solver == "midpoint":
                t, y, h = result.t, result.y, clamp(options.min_step, abs(result.next_step), options.max_step)
                rejected += result.rejected_steps
                max_error = max(max_error, result.error_norm)
                accepted += 1
                break

            if not all(isfinite(value) for value in result.y):
                status = "domain_error"
                message = "non-finite state"
                break

            order = 4 if options.solver == "rk45" else 7
            if result.error_norm <= 1.0:
                t, y = result.t, result.y
                h = next_modern_step(h, result.error_norm, order, step_rejected, options.min_step, options.max_step)
                max_error = max(max_error, result.error_norm)
                accepted += 1
                break

            rejected += 1
            step_rejected = True
            h = next_modern_step(h, result.error_norm, order, False, options.min_step, options.max_step)
            if h <= options.min_step:
                status = "step_limit"
                message = "step_limit"
                break

        if status != "complete":
            break

        points.append((t, y.copy()))
        if stop_condition:
            stop_status = stop_condition(t, y)
            if stop_status:
                if stop_status in {"runaway", "equilibrium", "limit_cycle"}:
                    status = stop_status  # type: ignore[assignment]
                    message = stop_status
                else:
                    status = "domain_error"
                    message = stop_status
                break

    stats = SolverStats(accepted, rejected, h, max_error)
    return OdeResult(points, status, message, stats)
