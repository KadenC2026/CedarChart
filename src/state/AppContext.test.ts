import { describe, expect, it } from "vitest";
import { reducer } from "./AppContext";
import { earnedCourseIds } from "../domain/requirements";
import type { AppState } from "../domain/types";
const initial: AppState = { completedCourseIds: [], priorCredits: [], selectedCourseId: null, highlightedCourseIds: [], targetCourseId: null, interestQuery: "", recommendations: [], plannedCourses: [], selectedRequirementId: null };
describe("shared credit state", () => {
  it("does not treat scheduled classes as earned", () => {
    const state = reducer(initial, { type: "ADD_PLANNED_COURSE", course: { courseId: "18.01", title: "Calculus", term: 0 } });
    expect(earnedCourseIds(state).size).toBe(0);
  });
  it("updates a credit source without duplication and removes it", () => {
    let state = reducer(initial, { type: "SET_PRIOR_CREDIT", credit: { courseId: "mit:18.01", source: "prior" } });
    state = reducer(state, { type: "SET_PRIOR_CREDIT", credit: { courseId: "mit:18.01", source: "ase" } });
    expect(state.priorCredits).toEqual([{ courseId: "mit:18.01", source: "ase" }]);
    expect(earnedCourseIds(state).has("18.01")).toBe(true);
    state = reducer(state, { type: "REMOVE_PRIOR_CREDIT", courseId: "mit:18.01" });
    expect(earnedCourseIds(state).size).toBe(0);
  });
  it("keeps an independent completion mark when credit is removed", () => {
    let state = reducer(initial, { type: "TOGGLE_COMPLETED", courseId: "mit:18.01" });
    state = reducer(state, { type: "SET_PRIOR_CREDIT", credit: { courseId: "mit:18.01", source: "ase" } });
    state = reducer(state, { type: "REMOVE_PRIOR_CREDIT", courseId: "mit:18.01" });
    expect(earnedCourseIds(state).has("18.01")).toBe(true);
    state = reducer(state, { type: "TOGGLE_COMPLETED", courseId: "mit:18.01" });
    expect(earnedCourseIds(state).size).toBe(0);
  });
});
