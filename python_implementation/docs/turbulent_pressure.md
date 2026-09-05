# Turbulent pressure in OZwizard

The optional `alphaP` control implements the turbulent-pressure approximation
of Munteanu et al. (2005), equations (6), (A7), and (A12).
It changes both the radial force and the thermal equation. The convective
velocity still obeys the existing relaxation equation. Turbulent kinetic-energy
storage, retained in their equation (A11), is omitted in this approximation.
The source is [Munteanu et al., ApJ 627, 454–463](https://doi.org/10.1086/430371);
the equations are available in [Appendix A](https://arxiv.org/pdf/astro-ph/0503697#page=10).

## Equations and normalization

Write `f = rho/rho0` for the selected density law and
`k = -d ln(f)/d ln(R)` for its logarithmic slope. The existing thermal variable
is defined by `P/P0 = H f^Gamma1`. The equilibrium pressure fraction is

\[
\alpha_p=\frac{P_{t,0}}{P_0+P_{t,0}},\qquad 0\leq\alpha_p<1.
\]

It is an independent equilibrium parameter, held fixed when changing initial
conditions. The gas and turbulent contributions to dimensionless acceleration are

\[
F_g=(1-\alpha_p)R^2f^{\Gamma_1}H,
\qquad F_t=\alpha_pR^2fU_c^2.
\]

The implemented equations are

\[
\dot R=V,\qquad
\dot V=F_g+F_t-R^{-2}-C_qV^3,
\]
\[
\dot H=\zeta f^{1-\Gamma_1}(R^U-L_r-L_c)
-k(\Gamma_1-1)\frac{\alpha_p}{1-\alpha_p}
 f^{1-\Gamma_1}\frac{V}{R}U_c^2,
\]
\[
\dot U_c=\zeta_c\left(f^{(\Gamma_1-1)/2}\sqrt H-U_c\right).
\]

Dots denote derivatives with respect to dimensionless time. The luminosity
expressions and source prescription are unchanged. The implementation assumes
`Gamma3 = Gamma1`, consistent with OZwizard's existing perfect-gas closure.
For constant geometry, `f = R^(-chi0)` and `k = chi0`, so the added thermal
term reduces to equation (A12). For the exact homogeneous shell, `k = chi(R)`.
For the historical local-exponent prescription, differentiating its finite
density law gives `k = chi(R) - chi(R)(chi(R)-3) ln(R)`.
The latter two extensions use the actual selected density derivative; the
published reference calculation uses constant geometry.

At `R = H = Uc = 1, V = 0`, gas and turbulent support sum to unity.
For positive density slope, expansion makes the added thermal term negative
and contraction makes it positive. Setting `alphaP = 0` recovers the previous
equations. Old inlists and stored presets without this field load with zero
turbulent pressure, independently of the model selected before import.

## Diagnostics and comparison

Mechanical energy is `Emech = V^2/2 - 1/R`. Its exact differential identity is

\[
\dot E_{\rm mech}=VF_g+VF_t-C_qV^4.
\]

Gas-pressure and turbulent-pressure work must therefore be integrated
separately and included in their total. This mechanical identity does not
assert conservation of a complete thermal-plus-turbulent energy reservoir:
the adopted approximation omits turbulent-energy storage, and the existing
cubic drag does not return its dissipated energy to `H`.

The equilibrium Jacobian includes the turbulent force and the new velocity
dependence in the thermal equation. The stability map uses that Jacobian's
characteristic polynomial. The mechanical period estimate freezes `H` and `Uc`
and uses `omega^2 = chi0[(1-alphaP)Gamma1+alphaP]-4`; it is distinct from the
full coupled eigenfrequency.

Published comparisons should select constant geometry, `sourceExp = 0`,
`cq = 0`, and the paper's initial conditions before testing the newer geometry
and source prescriptions. The benchmark script and its results are in
`web_app/scripts/validate-turbulent-pressure.mjs` and
`analysis/turbulent-pressure/` at the repository root.
