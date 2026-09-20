import { describe, expect, it } from "vitest";
import { recommendClubs, recommendSocialThemes } from "./socialRecommendations";

describe("social recommendations", () => {
  it("uses interests and planned courses to rank MIT community themes", () => {
    const recommendations = recommendSocialThemes({
      interestQuery: "I want to build robots with machine learning",
      plannedCourses: [{ courseId: "6.3900", title: "Introduction to Machine Learning", term: 4 }],
      limit: 3,
    });

    expect(recommendations[0].id).toBe("technology");
    expect(recommendations[0].reason).toMatch(/interests|plan/);
  });

  it("returns useful broad suggestions when the profile is empty", () => {
    const recommendations = recommendSocialThemes({
      interestQuery: "",
      plannedCourses: [],
      limit: 4,
    });

    expect(recommendations).toHaveLength(4);
    expect(new Set(recommendations.map((item) => item.id)).size).toBe(4);
  });
});

describe("club recommendations", () => {
  it("matches specific clubs to a student's interests and courses", () => {
    const recommendations = recommendClubs({
      interestQuery: "I want to build rockets and study aerospace engineering",
      plannedCourses: [{ courseId: "16.00", title: "Introduction to Aerospace and Design", term: 1 }],
      matchLimit: 3,
      surpriseLimit: 2,
    });

    expect(recommendations[0].id).toBe("rocket-team");
    expect(recommendations.filter((club) => club.kind === "surprise")).toHaveLength(2);
    expect(new Set(recommendations.map((club) => club.id)).size).toBe(recommendations.length);
  });

  it("returns stable, varied discovery picks for an empty profile", () => {
    const first = recommendClubs({ interestQuery: "", plannedCourses: [], matchLimit: 4, surpriseLimit: 2 });
    const second = recommendClubs({ interestQuery: "", plannedCourses: [], matchLimit: 4, surpriseLimit: 2 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(6);
    expect(first.slice(-2).every((club) => club.kind === "surprise")).toBe(true);
  });
});
