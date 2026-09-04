import { describe, expect, it } from "vitest";
import { generateSliderSamples, gridModelCountForStride, parameterValueFromSlider } from "../src/grid";
import { DEFAULT_PRESET_NAME, HERTZSPRUNG_PROGRESSION_PRESET_NAME, PRESETS } from "../src/model";
import {
  BUILT_IN_PRESETS,
  PHASE_LAG_PROGRESSION_PRESET_NAME,
  USER_PRESETS_STORAGE_KEY,
  gridRangeFromSnapshot,
  gridRangeSnapshotFromGridRange,
  loadLocalPresetStore,
  mergePresetRegistry,
  parsePresetInlistBundle,
  saveLocalPresetStore,
  serializePresetInlistBundle,
  snapshotFromParameters,
  upsertLocalPreset,
  type StorageLike
} from "../src/presets";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("preset inlists", () => {
  it("parses MESA-like sections, comments, d exponents, booleans, and grid ranges", () => {
    const result = parsePresetInlistBundle(`
&ignored
  thing = 1
/

&preset
  name = 'Quoted ! name'
/

&controls
  zeta = 1d1 ! thermal response
  zetac = 0
  source_exp = -2
  variableM = .true.
  runUntilStable = .false.
  solver = 'dop853'
  driver = 'abs-v'
  referenceFamily = 'diagnostic'
  phaseMode = final
/

&grid
  enabled = .true.
  loop_key = 'gammac'
  budget_mode = 'models'
  max_models = 25
/

&grid_range
  key = 'gammac'
  lower = 0.1
  upper = 0.5
  center = 0.2
/
`, {
      baseParameters: PRESETS[DEFAULT_PRESET_NAME]
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.message)).toContain("Unknown section &ignored ignored.");
    expect(result.snapshots).toHaveLength(1);
    const snapshot = result.snapshots[0];
    expect(snapshot.name).toBe("Quoted ! name");
    expect(snapshot.parameters.zeta).toBe(10);
    expect(snapshot.parameters.zetac).toBe(0);
    expect(snapshot.parameters.sourceExp).toBe(-2);
    expect(snapshot.parameters.variableM).toBe(true);
    expect(snapshot.parameters.runUntilStable).toBe(false);
    expect(snapshot.parameters.solver).toBe("dop853");
    expect(snapshot.parameters.driver).toBe("abs-v");
    expect(snapshot.parameters.referenceFamily).toBe("diagnostic");
    expect(snapshot.parameters.phaseMode).toBe("final");
    expect(snapshot.grid).toMatchObject({
      enabled: true,
      loopKey: "gammac",
      budgetMode: "models",
      maxModels: 25,
      ranges: [{ key: "gammac", lower: 0.1, upper: 0.5, center: 0.2 }]
    });
  });

  it("reports hard errors for invalid known values", () => {
    const result = parsePresetInlistBundle(`
&controls
  zeta = nope
  variableM = 1
  solver = 'magic'
/
&grid_range
  key = 'solver'
  lower = 0
  upper = 1
/
`);

    expect(result.snapshots).toHaveLength(1);
    expect(result.errors.map((error) => error.message)).toEqual([
      "zeta must be a finite number.",
      "variableM must be .true. or .false.",
      "solver has unsupported value \"magic\".",
      "\"solver\" is not a grid-capable parameter."
    ]);
  });

  it("parses solver controls from their own section", () => {
    const result = parsePresetInlistBundle(`
&controls
  gammac = 0.3
/
&solver
  solver = 'dop853'
  runUntilStable = .false.
  tEnd = 42
  logRtol = -10
/
`, {
      baseParameters: PRESETS[DEFAULT_PRESET_NAME]
    });

    expect(result.errors).toEqual([]);
    expect(result.snapshots[0].parameters).toMatchObject({
      gammac: 0.3,
      solver: "dop853",
      runUntilStable: false,
      tEnd: 42,
      logRtol: -10
    });
  });

  it("round-trips serialized presets including unset optional warmup", () => {
    const snapshot = snapshotFromParameters("Round trip", {
      ...PRESETS["OZC abs(V) driver diagnostic"],
      phaseWarmupTau: undefined,
      zeta: 0.25
    }, {
      enabled: true,
      loopKey: "m",
      budgetMode: "timeout",
      timeoutSeconds: 4.5,
      maxModels: 99,
      ranges: [{ key: "m", lower: 8, upper: 30, center: 10 }]
    });
    const text = serializePresetInlistBundle([snapshot]);
    expect(text).toContain("phaseWarmupTau = unset");
    expect(text).toContain("\n&solver\n");
    const controlsBlock = text.match(/&controls\n([\s\S]*?)\n\//)?.[1] ?? "";
    const solverBlock = text.match(/&solver\n([\s\S]*?)\n\//)?.[1] ?? "";
    expect(controlsBlock).not.toContain("solver =");
    expect(controlsBlock).not.toContain("runUntilStable =");
    expect(controlsBlock).not.toContain("tEnd =");
    expect(solverBlock).toContain("solver =");
    expect(solverBlock).toContain("runUntilStable =");
    expect(solverBlock).toContain("tEnd =");
    const parsed = parsePresetInlistBundle(text, {
      baseParameters: PRESETS[DEFAULT_PRESET_NAME]
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.snapshots[0].parameters.phaseWarmupTau).toBeUndefined();
    expect(parsed.snapshots[0].parameters.zeta).toBeCloseTo(0.25);
    expect(parsed.snapshots[0].grid?.ranges[0]).toEqual({ key: "m", lower: 8, upper: 30, center: 10 });
  });
});

describe("local preset registry and storage", () => {
  it("includes the Hertzsprung progression as a built-in gamma_c grid sweep", () => {
    const registry = mergePresetRegistry(PRESETS, []);
    const entry = registry.byName.get(HERTZSPRUNG_PROGRESSION_PRESET_NAME);

    expect(entry).toMatchObject({
      name: HERTZSPRUNG_PROGRESSION_PRESET_NAME,
      source: "built-in",
      shadowsBuiltIn: false,
      parameters: PRESETS[DEFAULT_PRESET_NAME],
      grid: {
        enabled: true,
        loopKey: "gammac",
        budgetMode: "models",
        maxModels: 57,
        ranges: [{ key: "gammac", lower: 0.01, upper: 0.57, center: 0.5 }]
      }
    });

    const range = gridRangeFromSnapshot(entry!.grid!.ranges[0], entry!.parameters);
    expect(gridModelCountForStride([range], "gammac").total).toBe(57);
    expect(parameterValueFromSlider("gammac", range.lowerSliderValue)).toBeCloseTo(0.01);
    expect(parameterValueFromSlider("gammac", range.upperSliderValue)).toBeCloseTo(0.57);
  });

  it("includes the default-derived gamma_c=0.2 phase-lag sweep at all 151 native log-zeta samples", () => {
    const registry = mergePresetRegistry(BUILT_IN_PRESETS, []);
    const entry = registry.byName.get(PHASE_LAG_PROGRESSION_PRESET_NAME);

    expect(entry).toMatchObject({
      name: PHASE_LAG_PROGRESSION_PRESET_NAME,
      source: "built-in",
      parameters: {
        ...PRESETS[DEFAULT_PRESET_NAME],
        gammac: 0.2
      },
      grid: {
        enabled: true,
        loopKey: "zeta",
        budgetMode: "models",
        maxModels: 151,
        ranges: [{ key: "zeta", lower: 0.01, upper: 10, center: 1 }]
      }
    });

    const range = gridRangeFromSnapshot(entry!.grid!.ranges[0], entry!.parameters);
    const samples = generateSliderSamples(range);
    expect(samples).toHaveLength(151);
    expect(samples[0]).toBe(-2);
    expect(samples.at(-1)).toBe(1);
    expect(parameterValueFromSlider("zeta", samples[0])).toBeCloseTo(0.01);
    expect(parameterValueFromSlider("zeta", samples.at(-1)!)).toBeCloseTo(10);
  });

  it("stores local presets and lets local entries shadow built-ins", () => {
    const storage = new MemoryStorage();
    const localDefault = snapshotFromParameters(DEFAULT_PRESET_NAME, {
      ...PRESETS[DEFAULT_PRESET_NAME],
      gammac: 0.33
    });
    const localOnly = snapshotFromParameters("Local only", {
      ...PRESETS[DEFAULT_PRESET_NAME],
      r0: 1.23
    });
    const store = upsertLocalPreset(upsertLocalPreset({ version: 1, presets: [] }, localDefault), localOnly);

    saveLocalPresetStore(storage, store);
    expect(storage.getItem(USER_PRESETS_STORAGE_KEY)).toContain("Local only");

    const loaded = loadLocalPresetStore(storage);
    expect(loaded.warnings).toEqual([]);
    const registry = mergePresetRegistry(PRESETS, loaded.store.presets);
    expect(registry.byName.get(DEFAULT_PRESET_NAME)).toMatchObject({
      source: "local",
      shadowsBuiltIn: true,
      parameters: expect.objectContaining({ gammac: 0.33 })
    });
    expect(registry.byName.get("Local only")).toMatchObject({
      source: "local",
      shadowsBuiltIn: false,
      parameters: expect.objectContaining({ r0: 1.23 })
    });
  });

  it("serializes grid ranges through nonlinear slider mappings", () => {
    for (const range of [
      { key: "zeta" as const, lower: 0.1, upper: 10, center: 1 },
      { key: "zetac" as const, lower: 0, upper: 100, center: 1 },
      { key: "m" as const, lower: 3, upper: 100, center: 20 },
      { key: "tEnd" as const, lower: 1, upper: 1000, center: 300 }
    ]) {
      const gridRange = gridRangeFromSnapshot(range, PRESETS[DEFAULT_PRESET_NAME]);
      const snapshot = gridRangeSnapshotFromGridRange(gridRange);
      expect(snapshot.key).toBe(range.key);
      expect(snapshot.lower).toBeCloseTo(range.lower, 10);
      expect(snapshot.upper).toBeCloseTo(range.upper, 10);
      expect(snapshot.center).toBeCloseTo(range.center, 10);
    }
  });
});
