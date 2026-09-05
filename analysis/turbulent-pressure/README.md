# Turbulent-pressure benchmarks

The calculations below use the implemented pressure force and compression-work term. They neglect turbulent kinetic-energy storage and set Γ₃=Γ₁, consistent with the application’s ideal-gas closure.

The source is [Munteanu et al. (2005)](https://arxiv.org/pdf/astro-ph/0503697), especially equations (6), (A7), and (A12). Appendix A defines d=m(Γ₁−1)/2; the section 2 definition prints Γ₁−2. We use the appendix definition.

Published comparisons use constant m=10, Γ₁=1.1, n=1, s=3, a constant source, zero cubic drag, and initial (R,V,H,Uc)=(1.4,0,1,0.7). Equation (A8) gives αp=0.406880190, while section 3.2 quotes approximately 0.4. Both choices are tested. The printed η=0.888 would give m=10.007574800; m=10 follows the explicit section 2 value.

Figure 7 uses γc=0.4, ζ=4 and ζc=0.28,0.4,1,4,9. Its αp=0 counterparts isolate the effect of the pressure/work pair. Figure 8c supplies the fully convective example and its Cepheid comparison. The additional fully convective slice tests ζ=7.5 at ζc=5,6,7,8.

Current-sequence runs retain the current default source exponent −2, cubic drag 5, and homogeneous-shell density. They are OZwizard sensitivity experiments.

DOP853 runs use relative/absolute tolerances 1e−11/1e−13 and maximum step 0.03. RK45 checks tighten these to 1e−12/1e−14 and 0.015. Runs reach τ=1000; unsettled and near-equilibrium cases are extended to τ=3000. Neither run uses the interactive early-stop classifier. Cubic Hermite state interpolation supplies radial maxima and phase-aligned waveforms; luminosities are recomputed from the interpolated state. A limit cycle requires convergence of five radius maxima and successive R,H,Uc,L waveforms. Exact thresholds, stop reasons, final states, and solver differences are stored in [results.json](results.json). “Unsettled” and “near_equilibrium” denote finite-time results.

DOP853 and RK45 assign the same outcome in 41 of 41 cases. Across final-cycle comparisons, the largest relative period difference is 2.312e-9, and the largest absolute difference in peak-to-peak luminosity is 4.596e-7 L₀. The two pressure-enabled Figure 7 cases at ζc=0.28 and the Figure 8c Cepheid comparison retain measurable radius-peak drift at τ=3000. Their finite-time classifications remain unsettled.

All 16 current homogeneous-shell cases reach the stated limit-cycle criterion. At γc=0.33, the lightcurve has two significant maxima for αp=0 and 0.1, and one for αp=0.2 and 0.4. The smaller peak has prominence 0.0011337 L₀ at αp=0 and 0.00043188 L₀ at αp=0.1. The secondary maximum therefore survives weak turbulent pressure and disappears in the two stronger-pressure cases.

The fully convective Figure 8c model reaches a limit cycle at (ζ,ζc,αp)=(7.5,9,0). A pressure-enabled case at (7.5,5,0.4) also converges, while the tested αp=0.4 cases at ζc=6,7,8 approach equilibrium. Cases that stop at the numerical step limit remain labeled as integration failures.

| Case | αp | Outcome | Period | ΔR | ΔL | L maxima | RK45 outcome | ΔP/P |
|---|---:|---|---:|---:|---:|---:|---|---:|
| fig7-alpha0-zc0.28 | 0.00000 | limit_cycle | 2.38567 | 0.111684 | 0.0285080 | 2 | limit_cycle | 1.27713e-11 |
| fig7-alpha0-zc0.4 | 0.00000 | limit_cycle | 2.36585 | 0.0860280 | 0.0200452 | 2 | limit_cycle | 2.36422e-11 |
| fig7-alpha0-zc1 | 0.00000 | near_equilibrium | — | — | — | — | near_equilibrium | — |
| fig7-alpha0-zc4 | 0.00000 | equilibrium | — | — | — | — | equilibrium | — |
| fig7-alpha0-zc9 | 0.00000 | near_equilibrium | — | — | — | — | near_equilibrium | — |
| fig7-alpha0.4-zc0.28 | 0.400000 | unsettled | 2.42532 | 0.0482579 | 0.0151029 | 1 | unsettled | 8.19373e-11 |
| fig7-alpha0.4-zc0.4 | 0.400000 | limit_cycle | 2.46901 | 0.122507 | 0.0565964 | 1 | limit_cycle | 3.07585e-11 |
| fig7-alpha0.4-zc1 | 0.400000 | limit_cycle | 2.56312 | 0.211297 | 0.170154 | 2 | limit_cycle | 9.45644e-11 |
| fig7-alpha0.4-zc4 | 0.400000 | limit_cycle | 2.46909 | 0.158162 | 0.126097 | 2 | limit_cycle | 1.19945e-10 |
| fig7-alpha0.4-zc9 | 0.400000 | limit_cycle | 2.37166 | 0.0509277 | 0.0224517 | 1 | limit_cycle | 6.96023e-11 |
| fig7-alphaA8-zc0.28 | 0.406880 | unsettled | 2.42623 | 0.0467385 | 0.0150565 | 1 | unsettled | 3.46745e-11 |
| fig7-alphaA8-zc0.4 | 0.406880 | limit_cycle | 2.47104 | 0.123370 | 0.0584220 | 1 | limit_cycle | 5.88907e-12 |
| fig7-alphaA8-zc1 | 0.406880 | limit_cycle | 2.56680 | 0.213301 | 0.175455 | 2 | limit_cycle | 2.26328e-11 |
| fig7-alphaA8-zc4 | 0.406880 | limit_cycle | 2.47025 | 0.159064 | 0.129072 | 1 | limit_cycle | 6.83432e-11 |
| fig7-alphaA8-zc9 | 0.406880 | limit_cycle | 2.37096 | 0.0493477 | 0.0221691 | 1 | limit_cycle | 1.01654e-11 |
| fig8c-fully-convective | 0.00000 | limit_cycle | 8.32799 | 0.400240 | 0.339299 | 1 | limit_cycle | 5.11237e-11 |
| fig8c-cepheid | 0.00000 | unsettled | 2.55426 | 0.276522 | 0.0652179 | 1 | unsettled | 1.95843e-12 |
| fully-convective-alpha0-zc5 | 0.00000 | step_limit | — | — | — | — | step_limit | — |
| fully-convective-alpha0-zc6 | 0.00000 | step_limit | — | — | — | — | step_limit | — |
| fully-convective-alpha0-zc7 | 0.00000 | step_limit | — | — | — | — | step_limit | — |
| fully-convective-alpha0-zc8 | 0.00000 | runaway | — | — | — | — | runaway | — |
| fully-convective-alpha0.4-zc5 | 0.400000 | limit_cycle | 8.28477 | 0.259540 | 0.211639 | 1 | limit_cycle | 5.46699e-11 |
| fully-convective-alpha0.4-zc6 | 0.400000 | equilibrium | — | — | — | — | equilibrium | — |
| fully-convective-alpha0.4-zc7 | 0.400000 | equilibrium | — | — | — | — | equilibrium | — |
| fully-convective-alpha0.4-zc8 | 0.400000 | equilibrium | — | — | — | — | equilibrium | — |
| current-homogeneous-shell-gc0.01-alpha0 | 0.00000 | limit_cycle | 2.35729 | 0.147441 | 0.443949 | 1 | limit_cycle | 2.60425e-12 |
| current-homogeneous-shell-gc0.01-alpha0.1 | 0.100000 | limit_cycle | 2.37764 | 0.147619 | 0.412848 | 1 | limit_cycle | 2.31233e-9 |
| current-homogeneous-shell-gc0.01-alpha0.2 | 0.200000 | limit_cycle | 2.39899 | 0.148122 | 0.377401 | 1 | limit_cycle | 1.67697e-9 |
| current-homogeneous-shell-gc0.01-alpha0.4 | 0.400000 | limit_cycle | 2.44360 | 0.150113 | 0.289770 | 1 | limit_cycle | 3.48934e-11 |
| current-homogeneous-shell-gc0.25-alpha0 | 0.00000 | limit_cycle | 2.37215 | 0.134575 | 0.298773 | 1 | limit_cycle | 1.01473e-9 |
| current-homogeneous-shell-gc0.25-alpha0.1 | 0.100000 | limit_cycle | 2.38690 | 0.132941 | 0.271812 | 1 | limit_cycle | 2.17315e-9 |
| current-homogeneous-shell-gc0.25-alpha0.2 | 0.200000 | limit_cycle | 2.40225 | 0.131540 | 0.242864 | 1 | limit_cycle | 7.07084e-10 |
| current-homogeneous-shell-gc0.25-alpha0.4 | 0.400000 | limit_cycle | 2.43352 | 0.129568 | 0.258122 | 1 | limit_cycle | 6.50768e-11 |
| current-homogeneous-shell-gc0.33-alpha0 | 0.00000 | limit_cycle | 2.37306 | 0.124767 | 0.237721 | 2 | limit_cycle | 1.39410e-11 |
| current-homogeneous-shell-gc0.33-alpha0.1 | 0.100000 | limit_cycle | 2.38569 | 0.122427 | 0.226690 | 2 | limit_cycle | 2.20994e-9 |
| current-homogeneous-shell-gc0.33-alpha0.2 | 0.200000 | limit_cycle | 2.39875 | 0.120286 | 0.230105 | 1 | limit_cycle | 2.04695e-10 |
| current-homogeneous-shell-gc0.33-alpha0.4 | 0.400000 | limit_cycle | 2.42479 | 0.116823 | 0.256768 | 1 | limit_cycle | 1.08769e-9 |
| current-homogeneous-shell-gc0.45-alpha0 | 0.00000 | limit_cycle | 2.36776 | 0.0978829 | 0.199427 | 1 | limit_cycle | 1.13602e-10 |
| current-homogeneous-shell-gc0.45-alpha0.1 | 0.100000 | limit_cycle | 2.37693 | 0.0941265 | 0.196596 | 1 | limit_cycle | 9.50223e-10 |
| current-homogeneous-shell-gc0.45-alpha0.2 | 0.200000 | limit_cycle | 2.38617 | 0.0904842 | 0.196054 | 1 | limit_cycle | 3.96494e-10 |
| current-homogeneous-shell-gc0.45-alpha0.4 | 0.400000 | limit_cycle | 2.40331 | 0.0841290 | 0.211618 | 1 | limit_cycle | 3.41963e-10 |

ΔR and ΔL are peak-to-peak amplitudes in the final complete radial cycle. CSV files store that cycle at 512 equally spaced phases, with phase zero at maximum radius. The peak count uses the prominence threshold recorded in the JSON protocol. Periods are in dynamical-time units. Numerical agreement establishes the behavior of these equations under the stated choices; the paper supplies no numerical lightcurve data for pointwise validation.

Regenerate with `node python_implementation/web_app/scripts/validate-turbulent-pressure.mjs`. Add `--local` to include the earlier local-exponent density prescription, or `--quick` to restrict the run to the published comparisons and fully convective slice.
