/**
 * Public API entry point.
 *
 * Re-exports the main building blocks so consumers can:
 *   import { check, parseRefs, formatErrors, mergeRuns } from "provref";
 */

export { parseRefs } from "./parser.js";
export type { ProvRef, RefKind } from "./parser.js";

export { walk, parsePath, collectLeafPaths } from "./walker.js";
export type { WalkResult, WalkSuccess, WalkFailure, WalkFailureReason } from "./walker.js";

export { suggest, levenshtein } from "./hints.js";
export type { Suggestion } from "./hints.js";

export { check, resolve, formatErrors } from "./checker.js";
export type { CheckResult, CheckError, CheckErrorKind, CheckOptions, ResolvedRef } from "./checker.js";

export { mergeRuns, writeMerged } from "./merge.js";
export type { MergeOptions, MergeResult } from "./merge.js";
