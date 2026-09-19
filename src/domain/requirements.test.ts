import { describe, expect, it } from "vitest";
import { earnedCourseIds, evaluateRequirement, requirementLabel } from "./requirements";
import { progressionGroups, referencesCourse } from "./progression";
import type { RemoteCourse, Requirement } from "./types";
const courses: RemoteCourse[] = [
  { subject_id: "18.01", title: "Calculus", gir_attribute: "CAL1", total_units: 12 },
  { subject_id: "18.02", title: "Calculus", prerequisites: "GIR:CAL1", total_units: 12 },
  { subject_id: "5.01", title: "Test chemistry subject", prerequisites: "18.01", total_units: 6 },
];
const catalog = new Map(courses.map(c => [c.subject_id, c]));
const subject = (req: string): Requirement => ({ req });
const evaluate = (req: Requirement, ids: string[]) => evaluateRequirement(req, new Set(ids), catalog);
describe("requirement completion", () => {
  it("combines checked courses and awarded credit without double counting", () => {
    expect([...earnedCourseIds({ completedCourseIds: ["mit:18.01"], priorCredits: [{ courseId: "mit:18.01", source: "ase" }, { courseId: "mit:18.02", source: "prior" }] })]).toEqual(["18.01", "18.02"]);
  });
  it("counts ALL groups and preserves OR alternatives", () => {
    const req: Requirement = { reqs: [subject("18.01"), { "connection-type": "any", reqs: [subject("18.02"), subject("5.01")] }] };
    expect(evaluate(req, []).fraction).toBe(0);
    expect(evaluate(req, ["18.01"]).fraction).toBe(.5);
    expect(evaluate(req, ["18.01", "5.01"]).fraction).toBe(1);
  });
  it("deduplicates repeated courses for subject thresholds", () => {
    const req: Requirement = { reqs: [subject("18.01"), subject("18.01"), subject("18.02")], threshold: { type: "GTE", criterion: "subjects", cutoff: 2 } };
    expect(evaluate(req, ["18.01"]).fraction).toBe(.5);
  });
  it("supports units and distinct child thresholds", () => {
    const req: Requirement = { reqs: [subject("18.01"), subject("5.01")], threshold: { type: "GTE", criterion: "units", cutoff: 18 }, "distinct-threshold": { type: "GTE", criterion: "subjects", cutoff: 2 } };
    expect(evaluate(req, ["18.01"]).fraction).toBe(.5);
    expect(evaluate(req, ["18.01", "5.01"]).fraction).toBe(1);
  });
  it("leaves free-form and unsupported rules for review", () => {
    expect(evaluate({ req: "Two approved electives", "plain-string": true }, []).review).toBe(true);
    expect(evaluate({ reqs: [subject("18.01")], threshold: { type: "LT", criterion: "units", cutoff: 12 } }, ["18.01"]).fraction).toBe(0);
  });
  it("applies subject thresholds to GIR leaves", () => {
    expect(evaluate({ req: "GIR:CAL1", threshold: { type: "GTE", criterion: "subjects", cutoff: 2 } }, ["18.01"]).fraction).toBe(.5);
  });
  it("recognizes GIR credit", () => expect(evaluate(subject("GIR:CAL1"), ["18.01"]).fraction).toBe(1));
  it("labels majors with number and name", () => expect(requirementLabel({ "short-title": "18", "title-no-degree": "Mathematics", "medium-title": "18 Major" })).toBe("Course 18 — Mathematics (18 Major)"));
});
describe("major progression", () => {
  it("includes GIR links without matching similar course IDs", () => {
    expect(referencesCourse("GIR:CAL1", courses[0])).toBe(true);
    expect(referencesCourse("18.011", courses[0])).toBe(false);
    expect(referencesCourse("(18.01/18.01A), permission", courses[0])).toBe(true);
  });
  it("groups math and chemistry with expandable program identities", () => {
    const groups = progressionGroups(courses.slice(1), {
      major18: { "short-title": "18", "title-no-degree": "Mathematics", reqs: [] },
      major5: { "short-title": "5", "title-no-degree": "Chemistry", reqs: [] },
    });
    expect(groups.find(g => g.id === "major18")?.courses.map(c => c.subject_id)).toEqual(["18.02"]);
    expect(groups.find(g => g.id === "major5")?.courses.map(c => c.subject_id)).toEqual(["5.01"]);
  });
  it("retains unmatched departments instead of truncating downstream subjects", () => {
    expect(progressionGroups(courses, {}).flatMap(g => g.courses)).toHaveLength(3);
  });
});
