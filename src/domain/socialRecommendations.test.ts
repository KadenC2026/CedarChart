import { describe, expect, it } from "vitest";
import { recommendSocialThemes } from "./socialRecommendations";

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
