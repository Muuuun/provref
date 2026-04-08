/**
 * Walk a dotted path through a JSON value.
 *
 * Path syntax (matches jsonparse semantics):
 * - `a.b.c` → object navigation
 * - `a[0].b` → array index then object key (zero-based)
 * - keys cannot contain dots or brackets (use jsonparse defaults)
 *
 * Returns:
 * - { ok: true, value } on success — value is the leaf
 * - { ok: false, reason, navigated, remaining, availableKeys } on failure
 *
 * `availableKeys` lists what was available at the level where navigation
 * failed, so the caller can suggest alternatives.
 */

export type WalkSuccess = { ok: true; value: unknown };

export type WalkFailureReason =
  | "missing-key"
  | "missing-index"
  | "not-object"
  | "not-array"
  | "out-of-bounds";

export type WalkFailure = {
  ok: false;
  reason: WalkFailureReason;
  navigated: string;
  remaining: string;
  /** The path segment that triggered the failure (e.g. "rydberg2025" or "[99]"). */
  failingSegment: string;
  availableKeys: string[];
};

export type WalkResult = WalkSuccess | WalkFailure;

interface PathSegment {
  kind: "key" | "index";
  value: string | number;
  raw: string;
}

/** Tokenize "run_5.dynamics[2].energy" into segments. */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;
  let buf = "";

  const flushKey = () => {
    if (buf.length > 0) {
      segments.push({ kind: "key", value: buf, raw: buf });
      buf = "";
    }
  };

  while (i < path.length) {
    const c = path[i]!;
    if (c === ".") {
      flushKey();
      i++;
    } else if (c === "[") {
      flushKey();
      const closeIdx = path.indexOf("]", i);
      if (closeIdx === -1) {
        // Malformed; treat the rest as a literal key for diagnostics.
        buf += path.slice(i);
        i = path.length;
        continue;
      }
      const idxStr = path.slice(i + 1, closeIdx);
      const idx = Number.parseInt(idxStr, 10);
      if (Number.isNaN(idx)) {
        segments.push({ kind: "key", value: idxStr, raw: `[${idxStr}]` });
      } else {
        segments.push({ kind: "index", value: idx, raw: `[${idx}]` });
      }
      i = closeIdx + 1;
    } else {
      buf += c;
      i++;
    }
  }
  flushKey();

  return segments;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function walk(root: unknown, path: string): WalkResult {
  const segments = parsePath(path);
  let current: unknown = root;
  const navigatedParts: string[] = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    const navigatedSoFar = navigatedParts.join("");
    const remaining = segments
      .slice(si)
      .map((s) => (s.kind === "key" && navigatedParts.length > 0 ? "." + s.raw : s.raw))
      .join("");

    if (seg.kind === "key") {
      if (!isPlainObject(current)) {
        return {
          ok: false,
          reason: "not-object",
          navigated: navigatedSoFar,
          remaining,
          failingSegment: seg.raw,
          availableKeys: [],
        };
      }
      if (!(seg.value in current)) {
        return {
          ok: false,
          reason: "missing-key",
          navigated: navigatedSoFar,
          remaining,
          failingSegment: seg.raw,
          availableKeys: Object.keys(current),
        };
      }
      current = current[seg.value as string];
      navigatedParts.push(navigatedParts.length === 0 ? seg.raw : "." + seg.raw);
    } else {
      if (!Array.isArray(current)) {
        return {
          ok: false,
          reason: "not-array",
          navigated: navigatedSoFar,
          remaining,
          failingSegment: seg.raw,
          availableKeys: [],
        };
      }
      const idx = seg.value as number;
      if (idx < 0 || idx >= current.length) {
        return {
          ok: false,
          reason: "out-of-bounds",
          navigated: navigatedSoFar,
          remaining,
          failingSegment: seg.raw,
          availableKeys: [`array length ${current.length}`],
        };
      }
      current = current[idx];
      navigatedParts.push(seg.raw);
    }
  }

  return { ok: true, value: current };
}

/**
 * Collect all leaf paths reachable from a root object.
 * Used to suggest alternatives across the whole namespace.
 *
 * `prefix` lets the caller scope to a sub-tree (e.g. only inside `run_5`).
 */
export function collectLeafPaths(
  root: unknown,
  prefix: string = "",
  maxDepth: number = 6,
): string[] {
  const out: string[] = [];
  const visit = (v: unknown, path: string, depth: number) => {
    if (depth > maxDepth) return;
    if (isPlainObject(v)) {
      for (const k of Object.keys(v)) {
        const next = path ? path + "." + k : k;
        visit(v[k], next, depth + 1);
      }
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        visit(v[i], path + "[" + i + "]", depth + 1);
      }
    } else {
      // Leaf
      if (path) out.push(path);
    }
  };
  visit(root, prefix, 0);
  return out;
}
