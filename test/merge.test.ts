import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mergeRuns } from "../src/merge.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

test("merge: basic fixture has 2 runs in natural order", () => {
  const result = mergeRuns(join(FIXTURES, "basic/data/runs"));
  assert.deepEqual(result.runIds, ["run_1", "run_2"]);
  assert.equal(result.skipped.length, 0);
  // Spot check: each run is the parsed JSON
  assert.equal((result.merged.run_1 as any).fidelity, 0.873);
  assert.equal((result.merged.run_2 as any).fidelity, 0.891);
});

test("merge: errors fixture has 1 run", () => {
  const result = mergeRuns(join(FIXTURES, "errors/data/runs"));
  assert.deepEqual(result.runIds, ["run_1"]);
  assert.equal((result.merged.run_1 as any).fidelity, 0.873);
});

test("merge: throws on missing directory", () => {
  assert.throws(
    () => mergeRuns("/nonexistent/path/that/does/not/exist"),
    /Cannot read runs directory/,
  );
});
