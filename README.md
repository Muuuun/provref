# provref

**Structured numerical references for LaTeX papers.** Replace fragile, copy-pasted numbers in your manuscript with build-time-validated lookups into JSON data files.

```latex
% Instead of writing:
Our model achieves 87.3\% accuracy.

% You write:
Our model achieves \resultref{run_5.accuracy}\% accuracy.
```

When `provref check` runs, every `\resultref` and `\litref` is verified to exist in the corresponding JSON file. Typos, missing data, and wrong types fail the build with helpful "Did you mean…?" hints. When `pdflatex` runs, [jsonparse](https://ctan.org/pkg/jsonparse) substitutes the actual values inline.

This is a thin layer of build-time validation on top of the excellent [`jsonparse`](https://github.com/jasperhabicht/jsonparse) LaTeX package. provref's job is to turn jsonparse's silent missing-key behavior into a loud build error with friendly suggestions.

## Why

Two failure modes that BibTeX-style citations don't catch:

1. **Fabricated numbers** — author writes `87.3%` but the experiment actually produced `83.7%`. No tool catches this.
2. **Stale numbers** — author copies a result, then re-runs the experiment, but forgets to update the manuscript. Common cause of retracted papers.

provref makes both impossible by construction: numbers come from a JSON file, the file is the single source of truth, and `provref check` verifies every reference resolves before pdflatex runs.

This was originally designed for autonomous research agents (LLMs writing LaTeX papers) where the author cannot be trusted to manually copy numbers correctly. It works equally well for human authors who want reproducibility.

## Install

```bash
npm install -g provref
```

You also need [jsonparse](https://ctan.org/pkg/jsonparse) installed in your TeX distribution. It is already included in TeX Live 2024+ and MiKTeX.

```bash
kpsewhich jsonparse.sty   # should print a path
```

Copy `tex/provref.sty` next to your manuscript, or install it system-wide. (CTAN submission TBD.)

## Quick start

**1. Project layout**

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

**2. JSON schemas**

`data/runs/run_N/results.json` — produced by your experiment script:

```json
{
  "accuracy": 0.873,
  "loss": 0.123,
  "dynamics": {
    "energy_conservation": 99.99
  }
}
```

`notes/literature_values.json` — maintained alongside your reading notes:

```json
{
  "smith2024": {
    "source": "Smith et al., Nature 631, 234 (2024)",
    "doi": "10.1038/...",
    "context": "ImageNet top-1 accuracy",
    "accuracy": 0.84,
    "params_M": 86
  }
}
```

`source` and `context` are conventional but not enforced. Any numeric leaf can be referenced.

**3. The LaTeX**

```latex
\documentclass{article}
\usepackage{provref}
\provrefLoadRuns{../data/runs/all_results.json}
\provrefLoadLit{../notes/literature_values.json}

\begin{document}

Our run achieves \resultref{run_2.accuracy} accuracy, an improvement of
\resultref{run_2.accuracy} over Smith et al.\ (\litref{smith2024.accuracy})
\cite{smith2024}.

Energy conservation: \resultref{run_2.dynamics.energy_conservation}\%.

\end{document}
```

**4. Build pipeline**

```bash
# Step 1: merge per-run files into one
provref merge data/runs --output data/runs/all_results.json

# Step 2: validate every \resultref and \litref
provref check report/report.tex \
    --runs data/runs/all_results.json \
    --lit notes/literature_values.json

# Step 3: compile (jsonparse handles substitution at LaTeX time)
cd report && pdflatex report.tex
```

## What `provref check` catches

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

Exit code is non-zero if any errors are reported.

## Syntax reference

| Macro | Looks up in | Example |
|---|---|---|
| `\resultref{path}` | runs JSON (your experiment data) | `\resultref{run_5.accuracy}` |
| `\litref{path}` | literature JSON (cited papers' values) | `\litref{smith2024.accuracy}` |

`path` is a dotted path with optional array indexing (jsonparse syntax):
- `run_5.dynamics.energy` — nested object navigation
- `run_5.samples[0]` — array index (zero-based)
- `run_5.nested.a.b.c` — arbitrary depth

## CLI

```
provref check <tex> --runs <runs.json> --lit <lit.json> [--allow-non-numeric]
provref merge <runs-dir> --output <path>
provref --help
provref --version
```

## Library API

```typescript
import { check, formatErrors, mergeRuns } from "provref";
import { readFileSync } from "node:fs";

const tex = readFileSync("report.tex", "utf-8");
const runs = JSON.parse(readFileSync("data/runs/all_results.json", "utf-8"));
const lit = JSON.parse(readFileSync("notes/literature_values.json", "utf-8"));

const result = check(tex, runs, lit);
if (result.errors.length > 0) {
  console.error(formatErrors(result.errors));
  process.exit(1);
}
console.log(`${result.resolved.length} refs OK`);
```

## How it relates to similar tools

| Tool | Mechanism | Constrains the writer? |
|---|---|---|
| **provref** (this) | jsonparse + build-time validation | ✓ JSON keys only |
| [jsonparse](https://ctan.org/pkg/jsonparse) | Pure-LaTeX expl3 JSON parser | Same, but silent on missing keys |
| [showyourwork](https://github.com/showyourwork/showyourwork) | One file per scalar (`\variable{x.txt}`) | ✓ File paths only |
| [knitr](https://yihui.org/knitr/) / [Quarto](https://quarto.org/) | `\Sexpr{}` / inline R/Python | ✗ Arbitrary code, can write any number |
| [PythonTeX](https://github.com/gpoore/pythontex) | `\py{}` runs Python during compile | ✗ Same issue |
| [datatool](https://ctan.org/pkg/datatool) | Pure-LaTeX CSV `\DTLfetch{}` | ✓ Awkward for nested data |

The key invariant provref preserves: **the author cannot write a number, only reference one**. Code-execution tools (knitr, Quarto, PythonTeX) lose this invariant — `\py{99.99}` is just as easy to type as `99.99`.

## Trust chain

provref is one link in a longer chain. It guarantees that the number in your PDF matches a number in your JSON file. It does **not** guarantee:

- That the number in the JSON is correct (the experiment must produce it).
- That the JSON wasn't tampered with after the experiment.
- That you cited the right number for the right claim.

For autonomous-agent use, the surrounding system should:
1. Forbid the agent from writing `data/runs/*` directly — only experiment scripts can write there.
2. Have the experiment script include a metadata block (script hash, timestamp).
3. Use a separate verifier to extract literature numbers with quoted source passages.

provref handles only the last link: paper → JSON. The first two are the responsibility of the experiment harness.

## Status

Early prototype (v0.1). API may change. Originally built for the Sisyphus autonomous research agent.

## License

MIT
