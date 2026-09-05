import { describe, expect, it } from "vitest";
import { PRESETS, DEFAULT_PRESET_NAME, derivatives } from "../src/model";
import { parameterValueFromSlider, sliderValueFromParameter } from "../src/grid";
import {
  USER_PRESETS_STORAGE_KEY, loadLocalPresetStore, parsePresetInlistBundle,
  serializePresetInlistBundle, snapshotFromParameters
} from "../src/presets";

describe("turbulent pressure preset compatibility", () => {
  const base = PRESETS[DEFAULT_PRESET_NAME];

  it("loads a legacy inlist with zero pressure even over an active pressure model", () => {
    const parsed = parsePresetInlistBundle("&controls\n gammac = 0.25\n/", {
      baseParameters: { ...base, alphaP: 0.4 }
    });
    expect(parsed.errors).toEqual([]);
    const parameters = parsed.snapshots[0].parameters;
    expect(parameters.alphaP).toBe(0);
    expect(derivatives(0, [1.07, -0.12, 0.98, 1.03], parameters)).toEqual(
      derivatives(0, [1.07, -0.12, 0.98, 1.03], { ...base, gammac: 0.25, alphaP: 0 })
    );
  });

  it("restores missing alpha from legacy browser storage", () => {
    const parameters = { ...base };
    delete parameters.alphaP;
    const value = JSON.stringify({ version: 1, presets: [{ name: "Legacy model", parameters }] });
    const result = loadLocalPresetStore({
      getItem: (key) => key === USER_PRESETS_STORAGE_KEY ? value : null,
      setItem: () => {}, removeItem: () => {}
    });
    expect(result.warnings).toEqual([]);
    expect(result.store.presets[0].parameters.alphaP).toBe(0);
    expect(sliderValueFromParameter("alphaP", parameters)).toBe(0);
  });

  it("round-trips the pressure fraction and pressure grid", () => {
    const snapshot = snapshotFromParameters("Pressure comparison", { ...base, alphaP: 0.4 }, {
      enabled: true, loopKey: "alphaP", budgetMode: "models", timeoutSeconds: 3, maxModels: 5,
      ranges: [{ key: "alphaP", lower: 0, upper: 0.4, center: 0.2 }]
    });
    const parsed = parsePresetInlistBundle(serializePresetInlistBundle([snapshot]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.snapshots[0]).toEqual(snapshot);
    expect(parameterValueFromSlider("alphaP", 0.4)).toBe(0.4);
  });

  it.each([-0.01, 1, 1.1])("rejects singular or unphysical pressure fraction %s", (alpha) => {
    const parsed = parsePresetInlistBundle(`&controls\n alpha_p = ${alpha}\n/`);
    expect(parsed.errors.map((error) => error.message)).toContain("alphaP must satisfy 0 <= alphaP < 1.");
  });
});
