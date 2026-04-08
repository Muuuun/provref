import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRefs } from "../src/parser.ts";

test("parses single \\resultref", () => {
  const tex = "Value: \\resultref{run_1.acc}.";
  const refs = parseRefs(tex);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.kind, "resultref");
  assert.equal(refs[0]?.key, "run_1.acc");
  assert.equal(refs[0]?.line, 1);
  assert.equal(refs[0]?.options, null);
});

test("parses single \\litref", () => {
  const refs = parseRefs("Prior: \\litref{rydberg2024.fidelity}.");
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.kind, "litref");
  assert.equal(refs[0]?.key, "rydberg2024.fidelity");
});

test("parses options bracket", () => {
  const refs = parseRefs("\\resultref[dp=2]{run_1.fidelity}");
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.options, "[dp=2]");
});

test("parses nested + array indexing key", () => {
  const refs = parseRefs("\\resultref{run_2.details.samples[0]}");
  assert.equal(refs[0]?.key, "run_2.details.samples[0]");
});

test("multiple refs on one line", () => {
  const tex = "Compare \\resultref{run_1.acc} vs \\litref{rydberg2024.fidelity}.";
  const refs = parseRefs(tex);
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.kind, "resultref");
  assert.equal(refs[1]?.kind, "litref");
  assert.equal(refs[0]?.line, 1);
  assert.equal(refs[1]?.line, 1);
});

test("line numbers track correctly", () => {
  const tex = ["Line 1", "Line 2 \\resultref{a.b}", "Line 3", "\\litref{x.y}"].join("\n");
  const refs = parseRefs(tex);
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.line, 2);
  assert.equal(refs[1]?.line, 4);
});

test("skips full-line comments", () => {
  const tex = ["% \\resultref{ignored.this}", "\\resultref{kept.this}"].join("\n");
  const refs = parseRefs(tex);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.key, "kept.this");
});

test("skips inline comments after %", () => {
  const tex = "real \\resultref{kept.one} % \\resultref{ignored.one}";
  const refs = parseRefs(tex);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.key, "kept.one");
});

test("handles escaped \\% (not a comment)", () => {
  const tex = "5\\% boost \\resultref{kept.after_pct}";
  const refs = parseRefs(tex);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.key, "kept.after_pct");
});

test("captures raw match for diagnostics", () => {
  const refs = parseRefs("\\resultref[dp=2]{run_1.fidelity}");
  assert.equal(refs[0]?.raw, "\\resultref[dp=2]{run_1.fidelity}");
});

test("empty input returns empty list", () => {
  assert.deepEqual(parseRefs(""), []);
});

test("input with no refs returns empty list", () => {
  assert.deepEqual(parseRefs("Just plain LaTeX text \\cite{foo}"), []);
});
