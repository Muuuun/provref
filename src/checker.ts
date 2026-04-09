/**
 * Main check pipeline.
 *
 * Given:
 *   - LaTeX source content
 *   - parsed runs JSON  (namespace for \resultref)
 *   - parsed literature JSON (namespace for \litref)
 *
 * Produce:
 *   - list of resolved refs (with values, for diagnostics)
 *   - list of errors with friendly messages, hints, and "did you mean"
 */

import { ProvRef, parseRefs, RefKind } from "./parser.js";
import { walk, parsePath, collectLeafPaths } from "./walker.js";
import { suggest } from "./hints.js";

export type CheckErrorKind =
  | "missing-key"
  | "missing-index"
  | "not-object"
  | "not-array"
  | "out-of-bounds"
  | "non-numeric"
  | "empty-key";

export interface CheckError {
  kind: CheckErrorKind;
  ref: ProvRef;
  message: string;
}

export interface ResolvedRef {
  ref: ProvRef;
  value: number;
}

export interface CheckResult {
  resolved: ResolvedRef[];
  errors: CheckError[];
}

export interface CheckOptions {
  /** Allow non-numeric leaves (default: false → error if leaf isn't number) */
  allowNonNumeric?: boolean;
  /** Maximum number of "did you mean" suggestions (default: 3) */
  hintLimit?: number;
}

function namespaceLabel(kind: RefKind): string {
  return kind === "resultref" ? "runs" : "literature";
}

function fileLabel(kind: RefKind): string {
  return kind === "resultref"
    ? "data/runs/all_results.json"
    : "notes/literature_values.json";
}

function buildHintBlock(query: string, candidates: string[], hintLimit: number): string {
  if (candidates.length === 0) return "  (no available keys at this level)";
  const sugg = suggest(query, candidates, { limit: hintLimit });
  const lines: string[] = [];
  if (sugg.length > 0) {
    lines.push(`  Did you mean: ${sugg.map((s) => s.candidate).join(", ")}?`);
  }
  // Show up to 8 available keys at the failure level
  const preview = candidates.slice(0, 8);
  const more = candidates.length > 8 ? ` (+${candidates.length - 8} more)` : "";
  lines.push(`  Available: ${preview.join(", ")}${more}`);
  return lines.join("\n");
}

export function check(
  texContent: string,
  runsJson: unknown,
  litJson: unknown,
  options: CheckOptions = {},
): CheckResult {
  const allowNonNumeric = options.allowNonNumeric ?? false;
  const hintLimit = options.hintLimit ?? 3;

  const refs = parseRefs(texContent);
  const errors: CheckError[] = [];
  const resolved: ResolvedRef[] = [];

  for (const ref of refs) {
    const root = ref.kind === "resultref" ? runsJson : litJson;
    const ns = namespaceLabel(ref.kind);
    const file = fileLabel(ref.kind);

    if (ref.key.length === 0) {
      errors.push({
        kind: "empty-key",
        ref,
        message: `line ${ref.line}: ${ref.raw}\n  Empty key`,
      });
      continue;
    }

    const result = walk(root, ref.key);

    if (!result.ok) {
      const failingSeg = result.failingSegment;

      let header: string;
      switch (result.reason) {
        case "missing-key":
          header =
            result.navigated.length === 0
              ? `${ns} root has no key '${failingSeg}' (file: ${file})`
              : `path '${result.navigated}' exists but has no key '${failingSeg}'`;
          break;
        case "missing-index":
          header = `path '${result.navigated}' missing index ${failingSeg}`;
          break;
        case "not-object":
          header = `path '${result.navigated}' is not an object — cannot navigate to '${failingSeg}'`;
          break;
        case "not-array":
          header = `path '${result.navigated}' is not an array — cannot index ${failingSeg}`;
          break;
        case "out-of-bounds":
          header = `path '${result.navigated}' index out of bounds: ${failingSeg}`;
          break;
      }

      // Use the failing segment (not the last segment) as the hint query
      const queryForHint = failingSeg.replace(/^\[|\]$/g, "");
      const hintBlock = buildHintBlock(queryForHint, result.availableKeys, hintLimit);

      // Cross-namespace fallback: if at root level, also show available top-level keys
      // (in case the user typed run_5 but it's a literature key, etc.)
      let extra = "";
      if (
        result.reason === "missing-key" &&
        result.navigated.length === 0 &&
        result.availableKeys.length > 0
      ) {
        // Already shown by hintBlock
      } else if (result.availableKeys.length === 0) {
        // No keys at this level — show top-level keys for context
        const topKeys = collectLeafPaths(root, "", 2).slice(0, 8);
        if (topKeys.length > 0) {
          extra = `\n  Top-level paths: ${topKeys.join(", ")}`;
        }
      }

      errors.push({
        kind: result.reason,
        ref,
        message: `line ${ref.line}: ${ref.raw}\n  ${header}\n${hintBlock}${extra}`,
      });
      continue;
    }

    // Type check on leaf
    if (typeof result.value !== "number") {
      if (allowNonNumeric) {
        // Skip type check; the user opted in to allowing strings/etc.
      } else {
        errors.push({
          kind: "non-numeric",
          ref,
          message:
            `line ${ref.line}: ${ref.raw}\n` +
            `  Value at '${ref.key}' is ${typeof result.value}, expected number\n` +
            `  Got: ${JSON.stringify(result.value).slice(0, 80)}`,
        });
        continue;
      }
    }

    resolved.push({ ref, value: result.value as number });
  }

  return { resolved, errors };
}

/**
 * Resolve all refs in texContent, producing a "clean" version with literal numbers.
 * Runs check() first; if any errors, returns them without substitution.
 */
export function resolve(
  texContent: string,
  runsJson: unknown,
  litJson: unknown,
  options: CheckOptions = {},
): { resolved: string; errors: CheckError[] } {
  const result = check(texContent, runsJson, litJson, options);
  if (result.errors.length > 0) {
    return { resolved: texContent, errors: result.errors };
  }

  const REF_RE = /\\(resultref|litref)(\[[^\]]*\])?\{([^}]+)\}/g;
  const resolved = texContent.replace(REF_RE, (match, kind: string, opts: string | undefined, key: string) => {
    const root = kind === "resultref" ? runsJson : litJson;
    const w = walk(root, key.trim());
    if (!w.ok) return match;
    return formatValue(w.value, opts);
  });

  return { resolved, errors: [] };
}

function formatValue(value: unknown, opts: string | undefined): string {
  if (typeof value !== "number") return String(value);
  if (!opts) return String(value);
  const dpMatch = opts.match(/dp=(\d+)/);
  if (dpMatch) return value.toFixed(parseInt(dpMatch[1]!, 10));
  return String(value);
}

/** Format errors as a human-readable block. */
export function formatErrors(errors: CheckError[]): string {
  if (errors.length === 0) return "";
  const header = `provref: ${errors.length} unresolved reference${errors.length === 1 ? "" : "s"}\n`;
  const body = errors
    .map((e, i) => `[${i + 1}] ${e.message}`)
    .join("\n\n");
  return header + "\n" + body;
}
