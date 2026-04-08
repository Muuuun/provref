/**
 * Merge per-run results files (data/runs/run_N/results.json) into a single
 * data/runs/all_results.json keyed by run ID.
 *
 * This is the deterministic counterpart to "agent writes one big file":
 * the experiment agent only writes per-run files (the natural unit), and
 * `provref merge` combines them at build time.
 *
 * Output structure:
 *   {
 *     "run_1": { ... contents of run_1/results.json ... },
 *     "run_2": { ... },
 *     ...
 *   }
 *
 * Run ID is the directory name. We sort run IDs naturally (run_2 < run_10).
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface MergeOptions {
  /** Pattern for run directories. Default: anything starting with "run_" */
  runPrefix?: string;
  /** Filename inside each run dir. Default: "results.json" */
  resultsFile?: string;
}

export interface MergeResult {
  merged: Record<string, unknown>;
  runIds: string[];
  skipped: { dir: string; reason: string }[];
}

function naturalCompare(a: string, b: string): number {
  // Split into chunks of digits/non-digits and compare numerically when both are numbers
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];
  a.replace(/(\d+)|(\D+)/g, (_, n, s) => {
    ax.push(n ? Number(n) : s);
    return "";
  });
  b.replace(/(\d+)|(\D+)/g, (_, n, s) => {
    bx.push(n ? Number(n) : s);
    return "";
  });
  while (ax.length && bx.length) {
    const av = ax.shift()!;
    const bv = bx.shift()!;
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  }
  return ax.length - bx.length;
}

export function mergeRuns(runsDir: string, options: MergeOptions = {}): MergeResult {
  const prefix = options.runPrefix ?? "run_";
  const filename = options.resultsFile ?? "results.json";

  const merged: Record<string, unknown> = {};
  const runIds: string[] = [];
  const skipped: { dir: string; reason: string }[] = [];

  let entries: string[];
  try {
    entries = readdirSync(runsDir);
  } catch (err) {
    throw new Error(`Cannot read runs directory '${runsDir}': ${(err as Error).message}`);
  }

  const candidates = entries
    .filter((e) => e.startsWith(prefix))
    .sort(naturalCompare);

  for (const entry of candidates) {
    const fullPath = join(runsDir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      skipped.push({ dir: entry, reason: "stat failed" });
      continue;
    }
    if (!st.isDirectory()) continue;

    const resultsPath = join(fullPath, filename);
    let content: string;
    try {
      content = readFileSync(resultsPath, "utf-8");
    } catch {
      skipped.push({ dir: entry, reason: `${filename} not found` });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      skipped.push({ dir: entry, reason: `invalid JSON: ${(err as Error).message}` });
      continue;
    }

    merged[entry] = parsed;
    runIds.push(entry);
  }

  return { merged, runIds, skipped };
}

export function writeMerged(merged: MergeResult, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(merged.merged, null, 2) + "\n", "utf-8");
}
