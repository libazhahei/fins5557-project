import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toolDefs } from "./tools.js";

describe("agent tools", () => {
  it("exposes core quant tools", () => {
    const names = toolDefs.map((t) => t.name);
    assert.ok(names.includes("run_template"));
    assert.ok(names.includes("list_runs"));
    assert.ok(names.includes("create_job"));
  });
});
