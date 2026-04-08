<div align="center">

# provref

### Stop AI agents from making up numbers in your research papers.

<br>

When an AI agent writes a scientific paper for you, every number it types is a chance to hallucinate. The accuracy was 87.3 — but the LLM remembers it as 89.3 and writes that. The fidelity came from run 5 — but the LLM cites run 3 instead. The benchmark from Smith et al. was 0.84 — but the LLM rounds it to 0.85 to match the surrounding prose. None of these errors break compilation. None trigger a warning. They just sit there in your published PDF, wrong.

**provref makes this impossible by construction.** Instead of typing `87.3%`, the agent writes `\resultref{run_5.accuracy}` — a structured reference that points into a JSON file. Before LaTeX compiles, a build-time validator checks that every reference resolves to an actual value in your data. Typos, missing keys, and wrong types fail the build with friendly "Did you mean…?" suggestions. At LaTeX time, the value is substituted inline. The author never types a number — only references one.

This is the same trust pattern BibTeX gave us for citations, applied to numerical claims. You don't write `[1]` and trust yourself to keep the bibliography in sync — you write `\cite{einstein1905}` and let the build verify the link. provref does that for `\resultref{run_5.accuracy}`.

<br>

[![][version-shield]][release-link]
[![][node-shield]][node-link]
[![][license-shield]][license-link]

<br>

[Quick Start](#quick-start) · [The Problem](#the-problem) · [How It Works](#how-it-works) · [Trust Chain](#trust-chain) · [Comparison](#how-it-relates-to-other-tools) · [FAQ](#faq)

</div>

---

## The Problem

Large language models confabulate numerical values. This is not a bug, it is a fundamental property of statistical text generators. Whenever an LLM writes a number into a manuscript — an accuracy score, an experimental measurement, a baseline from a cited paper — there is a non-zero probability that the digits it produces do not match the underlying source.

For most LLM-written text this is annoying. For scientific papers it is catastrophic. The fabricated number goes through compilation cleanly, the PDF looks fine, the reviewer reads it, and a wrong claim enters the literature. There is no spellchecker for digits. There is no `--strict` flag. The model is fluent and confident and wrong.

Existing reproducible-research tools assume the author is honest. Knitr, Quarto, PythonTeX, R Markdown — they all let you embed live code that emits values into your document. But they let the author write `\py{99.99}` just as easily as they let the author write `\py{results['accuracy']}`. There is no constraint that prevents a literal number from sneaking in. When the author is a language model, that constraint is exactly what is missing.

provref enforces the constraint at the syntax level: **the author cannot write a number, only reference one**. Every number in the manuscript must come from a structured key lookup into a JSON file. The validator runs before compilation and refuses to proceed if any reference fails to resolve. The result is a paper where every digit is traceable, every cite is verifiable, and no LLM hallucination can survive the build pipeline.

| Failure mode | Caught by provref? |
|---|---|
| Agent invents a number that no experiment produced | Yes — reference cannot resolve |
| Agent copies a real result into the wrong section | Yes — author cannot type literal numbers |
| Agent rounds, truncates, or transposes a digit | Yes — value is substituted, not typed |
| Agent re-runs an experiment but forgets to update the manuscript | Yes — values come from JSON automatically |
| Agent cites a paper with a fabricated benchmark | Yes — literature values are also referenced, not typed |
| Agent's experiment script computed the wrong thing | No — provref trusts the JSON; you must audit the script |

The first five failure modes are exactly the ones humans cannot catch by reading. The sixth is the one humans can catch by code review. provref pushes the verification surface from "every number in the PDF" to "every line of the experiment script" — a much smaller, more auditable target.

---

## Quick Start

Install the validator:

```bash
npm install -g provref
```

Install the LaTeX package (already in TeX Live 2024+ and MiKTeX):

```bash
kpsewhich jsonparse.sty   # should print a path
```

Copy `tex/provref.sty` next to your manuscript.

Set up your project:

```
project/
├── data/runs/
│   ├── run_1/results.json     ← {"accuracy": 0.873, "loss": 0.123}
│   └── run_2/results.json     ← {"accuracy": 0.891, ...}
├── notes/
│   └── literature_values.json ← {"smith2024": {"accuracy": 0.84}}
└── report/
    ├── provref.sty
    └── report.tex
```

Write your manuscript with structured references instead of raw numbers:

```latex
\documentclass{article}
\usepackage{provref}
\provrefLoadRuns{../data/runs/all_results.json}
\provrefLoadLit{../notes/literature_values.json}

\begin{document}

Our method achieves \resultref{run_2.accuracy} accuracy, an improvement
over the previous best of \litref{smith2024.accuracy} reported by
\cite{smith2024}. Energy conservation reaches
\resultref{run_2.dynamics.energy_conservation}\%.

\end{document}
```

Build:

```bash
# 1. Merge per-run files into one namespace file
provref merge data/runs --output data/runs/all_results.json

# 2. Validate every \resultref and \litref before compiling
provref check report/report.tex \
    --runs data/runs/all_results.json \
    --lit notes/literature_values.json

# 3. Compile (jsonparse handles substitution)
cd report && pdflatex report.tex
```

If any reference is broken, step 2 fails with a helpful error message and the build stops. If everything checks out, the PDF is generated with the actual values inlined.

---

## What `provref check` Catches

```
provref: 5 unresolved references

[1] line 6: \resultref{run_99.accuracy}
  runs root has no key 'run_99' (file: data/runs/all_results.json)
  Did you mean: run_1?
  Available: run_1, run_2

[2] line 9: \resultref{run_1.dynamics.energy_conservaton}
  path 'run_1.dynamics' exists but has no key 'energy_conservaton'
  Did you mean: energy_conservation?
  Available: energy_conservation, max_drift

[3] line 12: \resultref{run_1.label}
  Value at 'run_1.label' is string, expected number
  Got: "string-not-number"

[4] line 15: \litref{smith2025.accuracy}
  literature root has no key 'smith2025'
  Did you mean: smith2024?
  Available: smith2024

[5] line 18: \litref{smith2024.doi}
  Value at 'smith2024.doi' is string, expected number
  Got: "10.1038/..."
```

Every error reports the line number, the failing path segment, the keys that are actually available at that level, and a Levenshtein-based "Did you mean…?" hint when there is a close match. Exit code is non-zero so the build pipeline knows to stop.

---

## How It Works

### Two layers, clean separation

provref is intentionally split into two pieces that do different jobs at different times:

**Build time (`provref check`).** A small TypeScript validator parses your `.tex` file, finds every `\resultref` and `\litref` call, walks the corresponding JSON path, and reports anything that does not resolve. This is the layer that produces friendly errors and refuses to let bad data reach the compiler.

**LaTeX time (`provref.sty` + jsonparse).** A 10-line LaTeX shim wraps the [jsonparse](https://ctan.org/pkg/jsonparse) package — a pure-LaTeX expl3 JSON parser available on CTAN. When pdflatex encounters `\resultref{run_5.accuracy}`, jsonparse navigates the loaded JSON, finds the value, and substitutes it inline. No preprocessing pass, no extra build step, no source rewriting. Standard LaTeX all the way down.

The validator and the compiler do not need to know about each other. The validator does not call jsonparse. The LaTeX side does not call the validator. They both consume the same JSON file and they both arrive at the same answer — but the validator does it loudly with hints, while jsonparse does it silently with substitution. When you run them in order, you get loud failure on missing keys at build time, and clean substitution at compile time.

### The two namespaces

Numbers in a scientific paper come from two fundamentally different places, and provref reflects that with two separate macros and two separate JSON files:

| Macro | Source file | Meaning |
|---|---|---|
| `\resultref{path}` | `data/runs/all_results.json` | A value computed by your own experiment |
| `\litref{path}` | `notes/literature_values.json` | A value extracted from a cited paper |

The split matters because the trust models are different. Your own experiment results are produced by code you control — the experiment script writes `results.json` directly, and `provref merge` combines per-run files into a single namespace. Literature values are extracted from external papers — they should ideally come with a quoted source passage and a verifiable citation. Mixing the two namespaces would let `\resultref{smith2024.accuracy}` accidentally type-check, when conceptually it should not.

### The merge step

Experiment scripts naturally write per-run files: `data/runs/run_1/results.json`, `data/runs/run_2/results.json`, and so on. This is the right unit of work — one file per execution, immutable, easy to inspect. But `\resultref` needs a single root namespace to look into.

`provref merge` does the trivial flattening: it reads every `data/runs/run_N/results.json`, sorts the run IDs naturally (so `run_2` comes before `run_10`), and writes one merged JSON file keyed by run ID. The merge step is deterministic, fast, and runs as part of the build pipeline. The agent never touches the merged file directly.

```
data/runs/
├── run_1/results.json  ┐
├── run_2/results.json  ├──→  provref merge  ──→  data/runs/all_results.json
├── run_5/results.json  ┘
```

```json
{
  "run_1": { "accuracy": 0.873, "loss": 0.123 },
  "run_2": { "accuracy": 0.891, "details": { "std": 0.005 } },
  "run_5": { "accuracy": 0.912, "dynamics": { "energy": 99.99 } }
}
```

Now `\resultref{run_5.dynamics.energy}` resolves cleanly through the merged tree.

### Path syntax

The path inside `\resultref{...}` and `\litref{...}` follows the conventions of jsonparse: dotted keys for object navigation, square brackets for zero-indexed array access. Arbitrary depth is supported.

```latex
\resultref{run_5.accuracy}                    % top-level field
\resultref{run_5.dynamics.energy_conservation} % nested object
\resultref{run_5.samples[0]}                  % array index
\resultref{run_5.deeply.nested.a.b.c.value}   % arbitrary depth
\litref{smith2024.params_M}                   % literature value
```

---

## Trust Chain

provref is one link in a longer chain of trust. It guarantees that the number in the published PDF matches the number in the JSON file. It does **not** guarantee:

- That the number in the JSON file is correct.
- That the JSON file was not tampered with after the experiment.
- That the agent cited the right number for the right claim.

These are out of scope on purpose. provref's job is the last link — manuscript to data file. Everything before that link belongs to the experiment harness, the data ingestion pipeline, and the human reviewer.

For autonomous-agent workflows, the surrounding system should add at least three more guarantees:

1. **The agent cannot write `data/runs/*` directly.** Only the experiment script — running inside a sandbox or via a restricted bash tool — should be allowed to produce result files. This keeps the agent's hallucination risk inside the script source code, where it can be code-reviewed, instead of inside opaque JSON values.
2. **Result files include execution metadata.** A `_meta` block with the script's content hash, timestamp, and execution ID makes it straightforward to detect post-hoc tampering or stale results.
3. **Literature values come with verifiable quotes.** When the agent extracts a number from a cited paper into `literature_values.json`, the entry should also store the exact passage from the paper that contains the number, plus a path to the cached PDF. A separate verifier can then `grep` the quote against the PDF to confirm the agent did not hallucinate the extraction.

provref handles only the last step in this chain. It is small, focused, and composes cleanly with the harness-level safeguards above.

---

## How It Relates to Other Tools

The general space of "make LaTeX papers reproducible" has been explored for two decades. provref is novel in one specific axis: **it is the only tool that prevents the author from writing literal numbers**. Every other tool either trusts the author or executes arbitrary code on their behalf.

| Tool | Mechanism | Constrains the writer? |
|---|---|---|
| **provref** (this) | jsonparse + build-time validator | Yes — JSON keys only, no literal numbers |
| [jsonparse](https://ctan.org/pkg/jsonparse) | Pure-LaTeX expl3 JSON parser | Same constraint, but silent on missing keys |
| [showyourwork](https://github.com/showyourwork/showyourwork) | One file per scalar (`\variable{x.txt}`) | Yes — file paths only |
| [knitr](https://yihui.org/knitr/) / [Quarto](https://quarto.org/) | `\Sexpr{}` / inline R/Python code | No — `\Sexpr{99.99}` is just as easy to type as `99.99` |
| [PythonTeX](https://github.com/gpoore/pythontex) | `\py{}` runs Python during compile | No — same issue as knitr |
| [datatool](https://ctan.org/pkg/datatool) | Pure-LaTeX CSV `\DTLfetch{}` | Yes, but CSV-oriented and awkward for nested data |

The key invariant is the column on the right. If the author can write `\py{99.99}`, then a hallucinating LLM can write `\py{99.99}`, and the entire reproducibility story collapses. provref preserves the invariant that **the only way to put a number into the document is to reference an existing entry in a JSON file**. There is no escape hatch.

---

## CLI Reference

```
provref check <tex> --runs <runs.json> --lit <lit.json> [--allow-non-numeric]
    Validate \resultref{...} and \litref{...} calls in <tex>
    against the JSON sources. Reports errors with line numbers,
    available keys, and Did-you-mean hints. Exits non-zero on errors.

provref merge <runs-dir> --output <path>
    Merge per-run results files into a single JSON file
    keyed by run id (sorted naturally).

provref --help        Show help
provref --version     Show version
```

---

## Library API

provref also exposes a TypeScript library for embedding the validator in your own build pipeline.

```typescript
import { check, formatErrors, mergeRuns } from "provref";
import { readFileSync } from "node:fs";

const tex = readFileSync("report.tex", "utf-8");
const runs = JSON.parse(readFileSync("data/runs/all_results.json", "utf-8"));
const lit  = JSON.parse(readFileSync("notes/literature_values.json", "utf-8"));

const result = check(tex, runs, lit);
if (result.errors.length > 0) {
  console.error(formatErrors(result.errors));
  process.exit(1);
}
console.log(`${result.resolved.length} references OK`);
```

The full set of exports — `parseRefs`, `walk`, `parsePath`, `collectLeafPaths`, `suggest`, `levenshtein`, `mergeRuns`, `writeMerged`, plus all the type definitions — lets you build custom validators, IDE plugins, pre-commit hooks, or CI integrations on top of the same primitives.

---

## File Reference

| File | What |
|---|---|
| `src/parser.ts`  | Parses `\resultref` and `\litref` calls from `.tex`, including `[options]` and skipping comments |
| `src/walker.ts`  | Walks dotted JSON paths with structured failure reporting |
| `src/hints.ts`   | Levenshtein-based "Did you mean…?" suggestion engine |
| `src/checker.ts` | Main validation pipeline and human-readable error formatting |
| `src/merge.ts`   | Merges `data/runs/run_N/results.json` into one namespace file |
| `src/cli.ts`     | CLI entry point for `provref check` and `provref merge` |
| `src/index.ts`   | Public library exports |
| `bin/provref.mjs` | CLI shim that loads compiled JavaScript |
| `tex/provref.sty` | LaTeX shim wrapping jsonparse macros (`\resultref`, `\litref`, `\provrefLoadRuns`, `\provrefLoadLit`) |

---

## Project Structure

```
provref/
├── README.md                  ← you are here
├── package.json
├── tsconfig.json
├── src/                       ← TypeScript validator source
│   ├── parser.ts
│   ├── walker.ts
│   ├── hints.ts
│   ├── checker.ts
│   ├── merge.ts
│   ├── cli.ts
│   └── index.ts
├── bin/
│   └── provref.mjs            ← CLI shim
├── tex/
│   └── provref.sty            ← LaTeX package (10 lines)
└── test/
    ├── parser.test.ts
    ├── walker.test.ts
    ├── hints.test.ts
    ├── checker.test.ts
    ├── merge.test.ts
    └── fixtures/
        ├── basic/             ← happy-path fixture
        └── errors/            ← every error mode demonstrated
```

Forty unit tests cover the parser, walker, hint engine, checker, and merge logic. End-to-end compilation has been verified against pdflatex with jsonparse on TeX Live 2026.

---

## Requirements

- Node.js 20 or newer
- A TeX distribution that includes jsonparse (TeX Live 2024+, MiKTeX, or any system where `kpsewhich jsonparse.sty` resolves)

That is the entire dependency surface. provref has zero runtime npm dependencies — only `tsx` and `typescript` for development. The validator is small enough to read in one sitting and ship in a CI container without bloat.

---

## FAQ

**What is provref for, in one sentence?**
provref stops AI agents and human authors from writing numbers directly into LaTeX manuscripts; every numerical claim must reference a verified entry in a JSON file, and the build fails if any reference is missing.

**Is this only for AI-generated papers?**
No. Human authors who want reproducibility benefit from the same constraint. Once you adopt provref, re-running an experiment automatically updates every number in the paper that refers to it. No more "fix the abstract too" comments in code review.

**How is this different from `\Sexpr{}` in knitr?**
knitr executes arbitrary R code. provref is a structured key lookup. `\Sexpr{99.99}` and `\Sexpr{x$accuracy}` are both valid in knitr — the first one defeats the entire reproducibility story. provref does not have an escape hatch; the only thing you can put inside `\resultref{...}` is a path into a JSON file.

**Why not use BibTeX-style placeholders?**
BibTeX cites *papers*. provref cites *values*. They are complementary: use BibTeX for `\cite{smith2024}` and provref for `\litref{smith2024.accuracy}`. The two systems coexist cleanly in the same document.

**What happens if jsonparse is not installed?**
The validator still runs and catches missing references. The LaTeX compilation will fail because `\usepackage{provref}` requires jsonparse. Install jsonparse from CTAN, or check if your TeX distribution already includes it (`kpsewhich jsonparse.sty`).

**Does this work with Overleaf?**
Yes. Overleaf includes jsonparse in its TeX Live distribution. Upload `provref.sty` and your JSON files alongside your `.tex` source. The validator runs locally before you push.

**What if my JSON keys legitimately contain dots?**
The dot is a path separator in jsonparse and provref. Keys cannot contain literal dots. Use underscores or camelCase instead.

**Can I reference a string (not a number)?**
By default no — provref enforces that referenced values are numeric. Pass `--allow-non-numeric` to lift the restriction if you want to reference experiment metadata, dates, or text.

**Does provref verify that my data is correct?**
No. provref verifies that the number in the PDF matches the number in the JSON. Whether the JSON itself is correct depends on your experiment script and data ingestion pipeline. See the [Trust Chain](#trust-chain) section.

**Where do I report bugs or suggest features?**
Open an issue on GitHub. The codebase is small enough that pull requests are usually quick to review.

---

## Use Cases

provref was designed for the situations where number-level provenance matters most:

**Autonomous AI research agents.** When an LLM agent writes a scientific paper end-to-end — running experiments, analyzing results, drafting the manuscript — provref turns every numerical claim into a structured reference. The agent cannot fabricate digits because the only way to put a digit in the document is to reference an existing entry in the experiment output. This is the original motivation for the project.

**Reproducible computational research.** Human authors who re-run experiments and forget to update the manuscript text. After adoption, every re-run automatically updates every value in the paper. No more "the abstract still says 87.3 but the latest experiment is 89.1" comments in peer review.

**Multi-author manuscripts.** When several collaborators are filling in a shared LaTeX document, provref ensures everyone reads from the same source of truth. Conflicting numbers across sections become impossible.

**Benchmarks and leaderboards.** Papers that report many baseline numbers across many models. Maintaining the consistency of dozens of values by hand is error-prone. With provref, the leaderboard is a JSON file and the manuscript references it.

**Replication studies.** When you re-run someone else's code and produce slightly different numbers, you want every number in your replication paper to be traceable to your re-run, not silently inherited from the original. provref enforces this.

---

## Keywords

LaTeX, provenance, reproducible research, scientific writing, AI hallucination, LLM hallucination, agent hallucination, fabricated numbers, claim verification, build-time validation, jsonparse, autonomous research agent, AI scientist, generative AI, scientific manuscript, anti-fabrication, trust chain, structured references, numerical citation, data binding, BibTeX for numbers, computational reproducibility, retraction prevention.

---

## Contributors

- [@Muuuun](https://github.com/Muuuun) — author and maintainer

## License

MIT — see [LICENSE](LICENSE).

<!-- Link Definitions -->
[version-shield]: https://img.shields.io/badge/version-0.1.0-4dc9f6?style=flat-square&labelColor=0a0e14
[release-link]: https://github.com/Muuuun/provref/releases
[node-shield]: https://img.shields.io/badge/node-20+-7dd8f8?style=flat-square&labelColor=0a0e14&logo=node.js&logoColor=7dd8f8
[node-link]: https://nodejs.org/
[license-shield]: https://img.shields.io/badge/license-MIT-b0e8ff?style=flat-square&labelColor=0a0e14
[license-link]: https://github.com/Muuuun/provref/blob/main/LICENSE
