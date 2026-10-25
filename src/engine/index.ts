// Public entry point of the scoring engine.
// Import from "@/engine" everywhere else in the app, never from the individual files.

export { computeState, validateNext } from "./computeState";
export type { ValidationResult } from "./computeState";
export {
  BALLS_PER_OVER,
  allowedWickets,
  ballChip,
  formatOvers,
  isLegal,
  maxWickets,
  totalRuns,
} from "./rules";
export { economy, projectedScore, requiredRate, runRate, strikeRate } from "./stats";
export type * from "./types";
