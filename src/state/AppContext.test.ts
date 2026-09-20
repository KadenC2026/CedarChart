import { describe, expect, it } from "vitest";
import { reducer } from "./AppContext";
import { earnedCourseIds } from "../domain/requirements";
import type { AppState } from "../domain/types";
const initial: AppState = { completedCourseIds: [], priorCredits: [], instructorPermissionCourseIds: [], selectedCourseId: null, highlightedCourseIds: [], targetCourseId: null, interestQuery: "", careerGoal: "", backgroundExperience: "", recommendations: [], plannedCourses: [], hiddenMapCourseIds: [], priorityCourses: [], selectedRequirementId: null, studentYear: "unspecified" };
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

describe("instructor permission state", () => {
  it("records and removes only an explicit instructor-permission waiver", () => {
    let state = reducer(initial, { type: "TOGGLE_INSTRUCTOR_PERMISSION", courseId: "mit:6.1910" });
    expect(state.instructorPermissionCourseIds).toEqual(["mit:6.1910"]);
    state = reducer(state, { type: "TOGGLE_INSTRUCTOR_PERMISSION", courseId: "mit:6.1910" });
    expect(state.instructorPermissionCourseIds).toEqual([]);
  });
});

describe("search personalization state", () => {
  it("stores the career goal for recommendations on other pages", () => {
    const state = reducer(initial, { type: "SET_CAREER_GOAL", careerGoal: "robotics researcher" });
    expect(state.careerGoal).toBe("robotics researcher");
  });

  it("stores background experience for petition suggestions", () => {
    const state = reducer(initial, { type: "SET_BACKGROUND_EXPERIENCE", backgroundExperience: "Built compilers in high school" });
    expect(state.backgroundExperience).toBe("Built compilers in high school");
  });
});

describe("priority list state", () => {
  it("adds each subject once and keeps list order", () => {
    let state = reducer(initial, { type: "ADD_PRIORITY_COURSE", course: { courseId: "6.1200", tier: "required" } });
    state = reducer(state, { type: "ADD_PRIORITY_COURSE", course: { courseId: "18.06", tier: "preferred" } });
    state = reducer(state, { type: "ADD_PRIORITY_COURSE", course: { courseId: "6.1200", tier: "preferred" } });
    expect(state.priorityCourses).toEqual([
      { courseId: "6.1200", tier: "required" },
      { courseId: "18.06", tier: "preferred" },
    ]);
  });

  it("reorders, retiers, removes, and clears", () => {
    let state = reducer(initial, { type: "ADD_PRIORITY_COURSE", course: { courseId: "6.1200", tier: "preferred" } });
    state = reducer(state, { type: "ADD_PRIORITY_COURSE", course: { courseId: "18.06", tier: "preferred" } });

    state = reducer(state, { type: "MOVE_PRIORITY_COURSE", courseId: "18.06", direction: -1 });
    expect(state.priorityCourses.map(c => c.courseId)).toEqual(["18.06", "6.1200"]);

    const unchanged = reducer(state, { type: "MOVE_PRIORITY_COURSE", courseId: "18.06", direction: -1 });
    expect(unchanged).toBe(state);

    state = reducer(state, { type: "SET_PRIORITY_TIER", courseId: "18.06", tier: "required" });
    expect(state.priorityCourses[0]).toEqual({ courseId: "18.06", tier: "required" });

    state = reducer(state, { type: "REMOVE_PRIORITY_COURSE", courseId: "18.06" });
    expect(state.priorityCourses.map(c => c.courseId)).toEqual(["6.1200"]);

    state = reducer(state, { type: "CLEAR_PRIORITY_COURSES" });
    expect(state.priorityCourses).toEqual([]);
  });
});

describe("persistent map courses", () => {
  it("hides a scheduled course without removing it from the plan", () => {
    let state = reducer(initial, { type: "ADD_PLANNED_COURSE", course: { courseId: "6.3900", title: "Introduction to Machine Learning", term: 0 } });
    state = reducer(state, { type: "SET_MAP_COURSE_VISIBILITY", courseIds: ["6.3900"], visible: false });
    expect(state.plannedCourses).toHaveLength(1);
    expect(state.hiddenMapCourseIds).toEqual(["6.3900"]);

    state = reducer(state, { type: "SET_MAP_COURSE_VISIBILITY", courseIds: ["6.3900"], visible: true });
    expect(state.hiddenMapCourseIds).toEqual([]);
  });

  it("repins a hidden course when it is newly added again", () => {
    let state = reducer(initial, { type: "SET_MAP_COURSE_VISIBILITY", courseIds: ["18.06"], visible: false });
    state = reducer(state, { type: "ADD_PLANNED_COURSE", course: { courseId: "18.06", title: "Linear Algebra", term: 1 } });
    expect(state.hiddenMapCourseIds).toEqual([]);
  });
});

describe("planned course variants", () => {
  it("replaces a planned variant in place and makes the replacement visible on the map", () => {
    let state = reducer(initial, { type: "ADD_PLANNED_COURSE", course: { courseId: "18.10A", title: "Analysis A", term: 2 } });
    state = reducer(state, { type: "SET_MAP_COURSE_VISIBILITY", courseIds: ["18.100A"], visible: false });
    state = reducer(state, {
      type: "REPLACE_PLANNED_COURSE",
      courseId: "18.10A",
      term: 2,
      replacement: { courseId: "18.100A", title: "Real Analysis", term: 2 },
    });

    expect(state.plannedCourses).toEqual([{ courseId: "18.100A", title: "Real Analysis", term: 2 }]);
    expect(state.hiddenMapCourseIds).toEqual([]);
  });
});
