import { test } from "node:test";
import assert from "node:assert/strict";
import { levenshtein, suggest } from "../src/hints.ts";

test("levenshtein: identical strings → 0", () => {
  assert.equal(levenshtein("hello", "hello"), 0);
});

test("levenshtein: single substitution", () => {
  assert.equal(levenshtein("kitten", "sitten"), 1);
});

test("levenshtein: classic example kitten/sitting → 3", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
});

test("levenshtein: empty string handling", () => {
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", ""), 3);
  assert.equal(levenshtein("", ""), 0);
});

test("suggest: finds close match within threshold", () => {
  const candidates = ["energy_conservation", "max_drift", "fidelity"];
  const sugg = suggest("energy_conservaton", candidates);
  assert.ok(sugg.length >= 1);
  assert.equal(sugg[0]?.candidate, "energy_conservation");
});

test("suggest: returns empty when no candidates close enough", () => {
  const candidates = ["foo", "bar", "baz"];
  const sugg = suggest("xyzqweasd", candidates);
  assert.equal(sugg.length, 0);
});

test("suggest: typo with 1 distance is found", () => {
  const candidates = ["dynamics", "fidelity"];
  const sugg = suggest("dynamic", candidates);
  assert.equal(sugg[0]?.candidate, "dynamics");
});

test("suggest: respects limit", () => {
  const candidates = ["aaa", "aab", "aac", "aad", "aae"];
  const sugg = suggest("aaa", candidates, { limit: 2 });
  assert.equal(sugg.length, 2);
});

test("suggest: bibkey typo finds rydberg2024", () => {
  const candidates = ["rydberg2024", "smith2023"];
  const sugg = suggest("rydberg2025", candidates);
  assert.equal(sugg[0]?.candidate, "rydberg2024");
});
