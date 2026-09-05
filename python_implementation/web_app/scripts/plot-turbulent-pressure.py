"""Render archived turbulent-pressure comparisons without rerunning the model."""
from pathlib import Path
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

folder = Path(__file__).resolve().parents[3] / "analysis" / "turbulent-pressure"
report = json.loads((folder / "results.json").read_text(encoding="utf-8"))
cases = {item["id"]: item for item in report["results"]}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "pdf.fonttype": 42, "ps.fonttype": 42})
colors = ["#4C72B0", "#DD8452", "#55A868", "#8172B3"]


def draw_case(ax, case_id, color, variable="L"):
    item = cases[case_id]
    path = folder / f"{case_id}.csv"
    if item["classification"] == "equilibrium":
        ax.axhline(item["finalState"][variable], color=color, lw=1.6, alpha=0.8)
    elif item["classification"] == "near_equilibrium":
        ax.axhline(item["finalState"][variable], color=color, lw=1.6, ls=":")
    elif item.get("cycle") and path.exists():
        data = np.genfromtxt(path, delimiter=",", names=True)
        style = "-" if item["classification"] == "limit_cycle" else "--"
        ax.plot(data["phase"], data[variable], color=color, lw=1.7, ls=style)
    else:
        return item["classification"].replace("_", " ")
    return None


for geometry in ["homogeneous-shell", "local-exponent"]:
    if not any(key.startswith(f"current-{geometry}") for key in cases):
        continue
    fig, axes = plt.subplots(2, 2, figsize=(8, 5.6), sharex=True, sharey=True)
    for ax, gamma in zip(axes.flat, [0.01, 0.25, 0.33, 0.45]):
        missing = []
        for alpha, color in zip([0, 0.1, 0.2, 0.4], colors):
            outcome = draw_case(ax, f"current-{geometry}-gc{gamma}-alpha{alpha}", color)
            if outcome:
                missing.append(f"$\\alpha_p={alpha}$: {outcome}")
        ax.set_title(rf"$\gamma_c={gamma}$", loc="left")
        ax.set_xlim(0, 1)
        ax.grid(alpha=0.15)
        if missing:
            ax.text(0.02, 0.03, "\n".join(missing), transform=ax.transAxes, fontsize=8)
    for ax in axes[-1]:
        ax.set_xlabel("Phase since maximum radius")
    for ax in axes[:, 0]:
        ax.set_ylabel(r"Total luminosity $L/L_0$")
    handles = [plt.Line2D([], [], color=color, lw=2, label=rf"$\alpha_p={alpha}$")
               for alpha, color in zip([0, 0.1, 0.2, 0.4], colors)]
    fig.legend(handles=handles, loc="upper center", ncol=4, frameon=False,
               bbox_to_anchor=(0.5, 0.945))
    fig.suptitle(f"Turbulent-pressure sensitivity: {geometry} geometry", y=0.975)
    fig.text(0.5, 0.008, "Solid: converged cycle or equilibrium. Dashed: final cycle still unsettled.",
             ha="center", fontsize=8)
    fig.tight_layout(rect=(0, 0.035, 1, 0.885))
    for extension in ["png", "pdf"]:
        fig.savefig(folder / f"current-{geometry}-comparison.{extension}", dpi=200)
    plt.close(fig)

fig, axes = plt.subplots(2, 5, figsize=(12, 5), sharex=True, sharey="row")
for column, zc in enumerate([0.28, 0.4, 1, 4, 9]):
    for row, variable in enumerate(["L", "R"]):
        ax = axes[row, column]
        for alpha, color in zip([0, 0.4], [colors[0], colors[3]]):
            missing = draw_case(ax, f"fig7-alpha{alpha}-zc{zc}", color, variable)
            if missing:
                ax.text(0.03, 0.05, rf"$\alpha_p={alpha}$: {missing}",
                        color=color, transform=ax.transAxes, fontsize=8)
        ax.set_xlim(0, 1)
        ax.grid(alpha=0.15)
        if row == 0:
            ax.set_title(rf"$\zeta_c={zc}$")
        else:
            ax.set_xlabel("Phase")
axes[0, 0].set_ylabel(r"$L/L_0$")
axes[1, 0].set_ylabel(r"$r/r_0$")
handles = [plt.Line2D([], [], color=color, lw=2, label=rf"$\alpha_p={alpha}$")
           for alpha, color in zip([0, 0.4], [colors[0], colors[3]])]
fig.legend(handles=handles, loc="upper center", ncol=2, frameon=False,
           bbox_to_anchor=(0.5, 0.955))
fig.suptitle(r"Munteanu Figure 7 parameters: $\gamma_c=0.4$, $\zeta=4$, $\chi_0=10$", y=0.975)
fig.text(0.5, 0.006, "Phase zero at maximum radius. Dashed: unsettled cycle. Dotted: near-equilibrium final value. Solid constant: equilibrium.",
         ha="center", fontsize=8)
fig.tight_layout(rect=(0, 0.035, 1, 0.88))
for extension in ["png", "pdf"]:
    fig.savefig(folder / f"munteanu-figure7-comparison.{extension}", dpi=200)
plt.close(fig)
print(f"Saved comparison figures in {folder}")
