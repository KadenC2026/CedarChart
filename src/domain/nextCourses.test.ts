import { describe, expect, it } from "vitest";
import { recommendNextCourses } from "./nextCourses";
import type { RemoteCourse, Requirement } from "./types";

const c = (subject_id: string, title: string, description = "", prerequisites = ""): RemoteCourse => ({
  subject_id, title, description, prerequisites,
});

describe("recommendNextCourses", () => {
  const catalog = [
    c("18.C06", "Linear Algebra and Optimization", "linear algebra optimization matrices"),
    c("18.03", "Differential Equations", "linear systems eigenvalues differential equations"),
    c("18.100A", "Real Analysis", "rigorous proof analysis real numbers"),
    c("18.200", "Principles of Discrete Applied Mathematics", "discrete mathematics combinatorics"),
    c("18.300", "Principles of Continuum Applied Mathematics", "differential equations modeling", "18.03"),
  ];

  it("uses selected major requirements even without a direct prerequisite edge", () => {
    const requirements: Record<string, Requirement> = {
      "major18": {
        reqs: [
          { req: "18.03" },
          { req: "18.100A" },
        ],
      },
    };
    const results = recommendNextCourses({
      current: catalog[0],
      catalog,
      requirements,
      state: {
        completedCourseIds: ["mit:18.C06"],
        priorCredits: [],
        plannedCourses: [],
        selectedRequirementId: "major18",
      },
    });
    expect(results.map((result) => result.course.subject_id)).toContain("18.100A");
    expect(results.map((result) => result.course.subject_id)).toContain("18.03");
  });

  it("excludes already completed or planned classes", () => {
    const results = recommendNextCourses({
      current: catalog[0],
      catalog,
      requirements: {},
      state: {
        completedCourseIds: ["mit:18.C06", "mit:18.03"],
        priorCredits: [],
        plannedCourses: [{ courseId: "18.100A", title: "Real Analysis", term: 3 }],
        selectedRequirementId: null,
      },
    });
    expect(results.map((result) => result.course.subject_id)).not.toContain("18.03");
    expect(results.map((result) => result.course.subject_id)).not.toContain("18.100A");
  });

  it("boosts direct downstream courses", () => {
    const results = recommendNextCourses({
      current: catalog[1],
      catalog,
      requirements: {},
      state: {
        completedCourseIds: ["mit:18.03"],
        priorCredits: [],
        plannedCourses: [],
        selectedRequirementId: null,
      },
    });
    expect(results[0]?.course.subject_id).toBe("18.300");
    expect(results[0]?.relationship).toBe("required-next");
  });
});
