import type { TermKey } from "./courseSearch";

/** Planner term slots, ordered Fall, IAP, Spring for each of the four years. */
export const plannerTerms = [
  "Year 1 · Fall", "Year 1 · IAP", "Year 1 · Spring",
  "Year 2 · Fall", "Year 2 · IAP", "Year 2 · Spring",
  "Year 3 · Fall", "Year 3 · IAP", "Year 3 · Spring",
  "Year 4 · Fall", "Year 4 · IAP", "Year 4 · Spring",
];

export function termLabel(index: number) {
  return plannerTerms[index] ?? `Term ${index + 1}`;
}

/** A stable visual token for each slot in the four-year planner. */
export function termColorClass(index: number) {
  const normalized = ((index % plannerTerms.length) + plannerTerms.length) % plannerTerms.length;
  return `term-color-${normalized + 1}`;
}

export function termKeyForIndex(index: number): TermKey {
  const position = ((index % 3) + 3) % 3;
  if (position === 0) return "fall";
  if (position === 1) return "IAP";
  return "spring";
}
