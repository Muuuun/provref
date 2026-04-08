/**
 * Parse \resultref{...} and \litref{...} calls from LaTeX source.
 *
 * Skips:
 * - lines starting with `%` (after leading whitespace) — comments
 * - inline `%` comments (everything after `%` on a line, unless escaped `\%`)
 *
 * Captures:
 * - command name (`resultref` | `litref`)
 * - optional bracketed options (e.g. `[dp=2]`)
 * - the key path (e.g. `run_5.dynamics.energy`)
 * - line number for error reporting
 * - the original raw match for diagnostics
 */

export type RefKind = "resultref" | "litref";

export interface ProvRef {
  kind: RefKind;
  key: string;
  options: string | null;
  line: number;
  raw: string;
}

const REF_RE = /\\(resultref|litref)(\[[^\]]*\])?\{([^}]+)\}/g;

/** Strip LaTeX inline comments (`%` to end of line, but not `\%`). */
function stripInlineComment(line: string): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) {
      out += c + line[i + 1];
      i++;
      continue;
    }
    if (c === "%") break;
    out += c;
  }
  return out;
}

export function parseRefs(texContent: string): ProvRef[] {
  const refs: ProvRef[] = [];
  const lines = texContent.split("\n");

  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    if (rawLine === undefined) continue;
    if (rawLine.trimStart().startsWith("%")) continue;
    const line = stripInlineComment(rawLine);

    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(line)) !== null) {
      const [raw, kind, options, key] = m;
      refs.push({
        kind: kind as RefKind,
        key: key!.trim(),
        options: options ?? null,
        line: li + 1,
        raw: raw!,
      });
    }
  }

  return refs;
}
