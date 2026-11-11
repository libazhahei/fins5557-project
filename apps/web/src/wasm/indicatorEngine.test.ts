import { describe, expect, it } from "vitest";
import { DEFAULT_ENABLED, INDICATOR_CATALOG } from "./types";

describe("indicator catalog", () => {
  it("covers low mid high groups", () => {
    const groups = new Set(INDICATOR_CATALOG.map((m) => m.group));
    expect(groups.has("low")).toBe(true);
    expect(groups.has("mid")).toBe(true);
    expect(groups.has("high")).toBe(true);
  });

  it("defaults include boll sma atr hv vp", () => {
    for (const id of ["boll", "sma", "atr", "hv", "vp"] as const) {
      expect(DEFAULT_ENABLED).toContain(id);
    }
  });
});
