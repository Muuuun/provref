import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, parsePath, collectLeafPaths } from "../src/walker.ts";

const data = {
  run_1: {
    fidelity: 0.873,
    dynamics: {
      energy_conservation: 99.99,
      max_drift: 0.012,
    },
  },
  run_2: {
    fidelity: 0.891,
    samples: [0.89, 0.892, 0.891],
    nested: { a: { b: { c: 42 } } },
  },
};

test("parsePath: simple dotted", () => {
  const segs = parsePath("a.b.c");
  assert.deepEqual(
    segs.map((s) => s.value),
    ["a", "b", "c"],
  );
});

test("parsePath: with array index", () => {
  const segs = parsePath("a.b[2].c");
  assert.deepEqual(
    segs.map((s) => ({ kind: s.kind, value: s.value })),
    [
      { kind: "key", value: "a" },
      { kind: "key", value: "b" },
      { kind: "index", value: 2 },
      { kind: "key", value: "c" },
    ],
  );
});

test("walk: top-level nested key resolves to scalar", () => {
  const r = walk(data, "run_1.fidelity");
  assert.ok(r.ok);
  assert.equal((r as any).value, 0.873);
});

test("walk: deeply nested resolves", () => {
  const r = walk(data, "run_2.nested.a.b.c");
  assert.ok(r.ok);
  assert.equal((r as any).value, 42);
});

test("walk: nested object navigation", () => {
  const r = walk(data, "run_1.dynamics.energy_conservation");
  assert.ok(r.ok);
  assert.equal((r as any).value, 99.99);
});

test("walk: array index resolves", () => {
  const r = walk(data, "run_2.samples[1]");
  assert.ok(r.ok);
  assert.equal((r as any).value, 0.892);
});

test("walk: missing top-level key", () => {
  const r = walk(data, "run_99.acc");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "missing-key");
    assert.deepEqual(r.availableKeys.sort(), ["run_1", "run_2"]);
  }
});

test("walk: missing nested key reports parent's keys", () => {
  const r = walk(data, "run_1.dynamic.energy"); // typo: dynamic vs dynamics
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "missing-key");
    // availableKeys should be the keys at the level where it failed = run_1
    assert.deepEqual(r.availableKeys.sort(), ["dynamics", "fidelity"]);
  }
});

test("walk: array out of bounds", () => {
  const r = walk(data, "run_2.samples[99]");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "out-of-bounds");
  }
});

test("walk: navigating into a non-object", () => {
  const r = walk(data, "run_1.fidelity.foo"); // fidelity is a number
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "not-object");
  }
});

test("walk: indexing into a non-array", () => {
  const r = walk(data, "run_1[0]");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "not-array");
  }
});

test("collectLeafPaths returns dotted leaf paths", () => {
  const leaves = collectLeafPaths(data);
  assert.ok(leaves.includes("run_1.fidelity"));
  assert.ok(leaves.includes("run_1.dynamics.energy_conservation"));
  assert.ok(leaves.includes("run_2.samples[0]"));
  assert.ok(leaves.includes("run_2.nested.a.b.c"));
});
