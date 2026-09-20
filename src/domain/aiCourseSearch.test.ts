import { describe, expect, it } from "vitest";
import { groundCourseRecommendations } from "./aiCourseSearch";
import type { InterestSearchResult, RemoteCourse } from "./types";

const catalog: RemoteCourse[] = [
  { subject_id: "2.12", title: "Introduction to Robotics" },
  { subject_id: "6.1210", title: "Introduction to Algorithms" },
];

describe("groundCourseRecommendations", () => {
  it("keeps unique recommendations that exist in the imported catalog", () => {
    const results: InterestSearchResult[] = [
      { courseId: "mit:2.12", relevanceExplanation: "Robotics", supportingCatalogText: "Robotics", recommendationMethod: "AI" },
      { courseId: "mit:made-up", relevanceExplanation: "Invalid", supportingCatalogText: "Invalid", recommendationMethod: "AI" },
      { courseId: "mit:2.12", relevanceExplanation: "Duplicate", supportingCatalogText: "Duplicate", recommendationMethod: "AI" },
    ];

    expect(groundCourseRecommendations(results, catalog)).toEqual([
      { course: catalog[0], recommendation: results[0] },
    ]);
  });
});
