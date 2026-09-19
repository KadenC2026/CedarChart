import type { AppState, RemoteCourse, Requirement } from "./types";

export const localId = (id: string) => id.replace(/^mit:/, "");
export function earnedCourseIds(state: Pick<AppState, "completedCourseIds" | "priorCredits">) {
  return new Set([...state.completedCourseIds.map(localId), ...state.priorCredits.map(c => localId(c.courseId))]);
}
export function isArchivedRequirement(req: Requirement) {
  return /old|pre-fa|before fall/i.test(`${req["medium-title"]} ${req["title-no-degree"]}`);
}
export function requirementLabel(req: Requirement) {
  return `Course ${req["short-title"] ?? "—"} — ${req["title-no-degree"] ?? req.title ?? "Requirements"} (${req["medium-title"] ?? "Program"})`;
}
export function requirementSubjects(req: Requirement): string[] {
  return req.req && !req["plain-string"] ? [req.req] : (req.reqs ?? []).flatMap(requirementSubjects);
}
export type Progress = { fraction: number; review: boolean; matched: string[] };
// Only explicit subject/GIR leaves and documented all/any/GTE thresholds are evaluated.
// Free-form rules remain unresolved; they must never silently become fulfilled.
export function evaluateRequirement(req: Requirement, earned: Set<string>, catalog: Map<string, RemoteCourse>): Progress {
  const children = (req.reqs ?? []).map(child => evaluateRequirement(child, earned, catalog));
  const matched = [...new Set(children.flatMap(child => child.matched))];
  let review = children.some(child => child.review);
  if (req.req) {
    if (req["plain-string"]) return { fraction: 0, review: true, matched: [] };
    const matches = [...earned].filter(id => id === req.req ||
      (req.req!.startsWith("GIR:") && catalog.get(id)?.gir_attribute === req.req!.slice(4)));
    return applyThresholds(req, { fraction: matches.length ? 1 : 0, review: !catalog.has(req.req) && !req.req.startsWith("GIR:"), matched: matches }, [], catalog);
  }
  if (!children.length) return { fraction: 0, review: true, matched };
  let fraction = req["connection-type"] === "any"
    ? Math.max(...children.map(child => child.fraction))
    : children.reduce((sum, child) => sum + child.fraction, 0) / children.length;
  return applyThresholds(req, { fraction, review, matched }, children, catalog);
}
function applyThresholds(req: Requirement, result: Progress, children: Progress[], catalog: Map<string, RemoteCourse>): Progress {
  let { fraction, review } = result;
  const { matched } = result;
  for (const [threshold, distinct] of [[req.threshold, false], [req["distinct-threshold"], true]] as const) {
    if (!threshold) continue;
    if (threshold.type !== "GTE" || (distinct && threshold.criterion !== "subjects")) {
      review = true; fraction = 0; continue;
    }
    const value = distinct ? children.filter(child => child.fraction === 1).length
      : threshold.criterion === "units" ? matched.reduce((sum, id) => sum + (catalog.get(id)?.total_units ?? 0), 0) : matched.length;
    const ratio = threshold.cutoff === 0 ? 1 : Math.min(1, value / threshold.cutoff);
    fraction = distinct && req.threshold ? Math.min(fraction, ratio) : ratio;
  }
  return { fraction, review, matched };
}
