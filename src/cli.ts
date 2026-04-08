#!/usr/bin/env node
/**
 * provref CLI
 *
 * Commands:
 *   provref check <tex> --runs <json> --lit <json>
 *       Validate all \resultref / \litref calls in <tex> against the JSON
 *       sources. Prints errors with hints, exits non-zero on failure.
 *
 *   provref merge <runs-dir> --output <path>
 *       Merge per-run results files into a single JSON file.
 *
 *   provref --help
 *
 * Designed to be small enough to read in one screen.
 */

import { readFileSync } from "node:fs";
import { check, formatErrors } from "./checker.js";
import { mergeRuns, writeMerged } from "./merge.js";

function getFlag(args: string[], name: string, fallback?: string): string | undefined {
  const idx = args.indexOf("--" + name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes("--" + name);
}

function getPositional(args: string[], startIdx: number): string[] {
  const out: string[] = [];
  for (let i = startIdx; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(`provref — structured numerical references for LaTeX

Usage:
  provref check <tex> --runs <runs.json> --lit <lit.json> [--allow-non-numeric]
      Validate \\resultref{...} and \\litref{...} calls in <tex>
      against the JSON sources. Exits non-zero on errors.

  provref merge <runs-dir> --output <path>
      Merge data/runs/run_*/results.json into one JSON file
      keyed by run id (sorted naturally).

  provref --help        Show this help
  provref --version     Show version

Examples:
  provref check report/report.tex \\
      --runs data/runs/all_results.json \\
      --lit notes/literature_values.json

  provref merge data/runs --output data/runs/all_results.json
`);
}

async function cmdCheck(args: string[]): Promise<number> {
  const positional = getPositional(args, 1);
  const texPath = positional[0];
  if (!texPath) {
    process.stderr.write("provref check: missing <tex> path\n");
    return 2;
  }
  const runsPath = getFlag(args, "runs");
  const litPath = getFlag(args, "lit");
  if (!runsPath || !litPath) {
    process.stderr.write("provref check: --runs and --lit are required\n");
    return 2;
  }
  const allowNonNumeric = hasFlag(args, "allow-non-numeric");

  let texContent: string;
  try {
    texContent = readFileSync(texPath, "utf-8");
  } catch (err) {
    process.stderr.write(`provref check: cannot read tex '${texPath}': ${(err as Error).message}\n`);
    return 2;
  }

  let runsJson: unknown;
  try {
    runsJson = JSON.parse(readFileSync(runsPath, "utf-8"));
  } catch (err) {
    process.stderr.write(`provref check: cannot load runs JSON '${runsPath}': ${(err as Error).message}\n`);
    return 2;
  }

  let litJson: unknown;
  try {
    litJson = JSON.parse(readFileSync(litPath, "utf-8"));
  } catch (err) {
    process.stderr.write(`provref check: cannot load literature JSON '${litPath}': ${(err as Error).message}\n`);
    return 2;
  }

  const result = check(texContent, runsJson, litJson, { allowNonNumeric });

  if (result.errors.length > 0) {
    process.stderr.write(formatErrors(result.errors) + "\n");
    return 1;
  }
  process.stdout.write(
    `provref: ${result.resolved.length} reference${result.resolved.length === 1 ? "" : "s"} OK\n`,
  );
  return 0;
}

function cmdMerge(args: string[]): number {
  const positional = getPositional(args, 1);
  const runsDir = positional[0];
  if (!runsDir) {
    process.stderr.write("provref merge: missing <runs-dir>\n");
    return 2;
  }
  const output = getFlag(args, "output");
  if (!output) {
    process.stderr.write("provref merge: --output is required\n");
    return 2;
  }

  let result;
  try {
    result = mergeRuns(runsDir);
  } catch (err) {
    process.stderr.write(`provref merge: ${(err as Error).message}\n`);
    return 2;
  }

  writeMerged(result, output);

  process.stdout.write(
    `provref merge: ${result.runIds.length} run${result.runIds.length === 1 ? "" : "s"} → ${output}\n`,
  );
  if (result.runIds.length > 0) {
    process.stdout.write(`  ${result.runIds.join(", ")}\n`);
  }
  if (result.skipped.length > 0) {
    process.stdout.write(`  skipped: ${result.skipped.map((s) => `${s.dir} (${s.reason})`).join(", ")}\n`);
  }
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write("provref 0.1.0\n");
    return 0;
  }
  const cmd = args[0];
  switch (cmd) {
    case "check":
      return await cmdCheck(args);
    case "merge":
      return cmdMerge(args);
    default:
      process.stderr.write(`provref: unknown command '${cmd}'. Try --help.\n`);
      return 2;
  }
}

main().then((code) => process.exit(code));
