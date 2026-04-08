import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, formatErrors } from "../src/checker.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Build the merged "all_results.json" inline for tests so we don't need to
// run the merge command first.
function loadRunsMerged(fixtureDir: string, runIds: string[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const id of runIds) {
    merged[id] = loadJson(join(fixtureDir, "data/runs", id, "results.json"));
  }
  return merged;
}

test("basic fixture: all refs resolve, zero errors", () => {
  const fixtureDir = join(FIXTURES, "basic");
  const tex = readFileSync(join(fixtureDir, "report/report.tex"), "utf-8");
  const runs = loadRunsMerged(fixtureDir, ["run_1", "run_2"]);
  const lit = loadJson(join(fixtureDir, "notes/literature_values.json"));

  const result = check(tex, runs, lit);
  assert.equal(result.errors.length, 0, `unexpected errors: ${formatErrors(result.errors)}`);
  // 6 refs in basic fixture (5 numeric refs + the commented-out one is skipped)
  assert.ok(result.resolved.length >= 5);
  // Spot-check a value
  const r1 = result.resolved.find((r) => r.ref.key === "run_1.fidelity");
  assert.equal(r1?.value, 0.873);
});

test("errors fixture: catches all 5 problems with friendly messages", () => {
  const fixtureDir = join(FIXTURES, "errors");
  const tex = readFileSync(join(fixtureDir, "report/report.tex"), "utf-8");
  const runs = loadRunsMerged(fixtureDir, ["run_1"]);
  const lit = loadJson(join(fixtureDir, "notes/literature_values.json"));

  const result = check(tex, runs, lit);
  assert.equal(result.errors.length, 5);

  const errorsByLine = new Map(result.errors.map((e) => [e.ref.line, e]));

  // (1) missing run_99
  const e1 = result.errors.find((e) => e.ref.key === "run_99.acc");
  assert.ok(e1);
  assert.equal(e1?.kind, "missing-key");
  assert.match(e1!.message, /run_99/);
  assert.match(e1!.message, /Available: run_1/);

  // (2) typo: energy_conservaton
  const e2 = result.errors.find((e) => e.ref.key === "run_1.dynamics.energy_conservaton");
  assert.ok(e2);
  assert.equal(e2?.kind, "missing-key");
  assert.match(e2!.message, /Did you mean/);
  assert.match(e2!.message, /energy_conservation/);

  // (3) non-numeric label
  const e3 = result.errors.find((e) => e.ref.key === "run_1.label");
  assert.ok(e3);
  assert.equal(e3?.kind, "non-numeric");

  // (4) missing bibkey rydberg2025 → should suggest rydberg2024
  const e4 = result.errors.find((e) => e.ref.key === "rydberg2025.fidelity");
  assert.ok(e4);
  assert.equal(e4?.kind, "missing-key");
  assert.match(e4!.message, /Did you mean/);
  assert.match(e4!.message, /rydberg2024/);

  // (5) non-numeric: rydberg2024.arxiv is a string
  const e5 = result.errors.find((e) => e.ref.key === "rydberg2024.arxiv");
  assert.ok(e5);
  assert.equal(e5?.kind, "non-numeric");
});

test("formatErrors produces multi-error block", () => {
  const fixtureDir = join(FIXTURES, "errors");
  const tex = readFileSync(join(fixtureDir, "report/report.tex"), "utf-8");
  const runs = loadRunsMerged(fixtureDir, ["run_1"]);
  const lit = loadJson(join(fixtureDir, "notes/literature_values.json"));

  const result = check(tex, runs, lit);
  const formatted = formatErrors(result.errors);
  assert.match(formatted, /5 unresolved/);
  assert.match(formatted, /\[1\]/);
  assert.match(formatted, /\[5\]/);
});

test("allowNonNumeric=true skips type check", () => {
  const fixtureDir = join(FIXTURES, "errors");
  const tex = "\\resultref{run_1.label}";
  const runs = loadRunsMerged(fixtureDir, ["run_1"]);
  const lit = loadJson(join(fixtureDir, "notes/literature_values.json"));

  const result = check(tex, runs, lit, { allowNonNumeric: true });
  assert.equal(result.errors.length, 0);
});
