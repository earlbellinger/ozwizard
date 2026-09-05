# OZwizard

OZwizard is an interactive explorer for Stellingwerf's one-zone stellar pulsation models. Visit [earlbellinger.com/apps/ozwizard/](https://earlbellinger.com/apps/ozwizard/).

The principal preset uses the exact density of a homogeneous shell with fixed
mass and fixed inner radius. The geometry control also offers the historical
radius-dependent exponent prescription and constant-exponent models. Existing
exported presets retain their original prescription when imported; new exports
record the selected geometry explicitly.

An optional turbulent-pressure fraction adds pressure support and its coupled
thermal work term following Munteanu et al. (2005). It defaults to zero for
existing models and imported files. See
[`python_implementation/docs/turbulent_pressure.md`](python_implementation/docs/turbulent_pressure.md)
for the equations, assumptions, and reference comparisons.
