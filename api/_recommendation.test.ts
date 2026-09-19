import { describe, expect, it } from "vitest";
import {
  groundedAiResults,
  keywordResults,
  retrieveCandidates,
  type CatalogCourse,
} from "./_recommendation";

const catalog: CatalogCourse[] = [
  {
    subject_id: "6.4200",
    title: "Robotics: Science and Systems",
    description: "Algorithms for sensing, planning, and control of mobile robots.",
  },
  {
    subject_id: "6.1210",
    title: "Introduction to Algorithms",
    description: "Data structures and analysis of computational problems.",
  },
  {
    subject_id: "6.006",
    title: "Introduction to Algorithms",
    is_historical: true,
  },
];

describe("AI recommendation retrieval", () => {
  it("uses model-expanded concepts to retrieve courses without literal query overlap", () => {
    const results = retrieveCandidates(
      catalog,
      "I want machines that can move through a hospital",
      ["robotics", "autonomous navigation", "motion planning"],
    );
    expect(results[0]?.subject_id).toBe("6.4200");
  });

  it("preserves exact subject-number searches and excludes historical subjects", () => {
    expect(retrieveCandidates(catalog, "6.1210")[0]?.subject_id).toBe("6.1210");
    expect(retrieveCandidates(catalog, "algorithms").map((course) => course.subject_id)).not.toContain("6.006");
  });

  it("accepts only unique model results from the supplied candidates", () => {
    const results = groundedAiResults([
      { subjectId: "made-up", relevanceExplanation: "Invented" },
      { subjectId: "6.4200", relevanceExplanation: "Connects sensing and planning to mobile robots." },
      { subjectId: "6.4200", relevanceExplanation: "Duplicate" },
    ], catalog);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ courseId: "mit:6.4200", recommendationMethod: "AI" });
    expect(results[0]?.supportingCatalogText).toBe(catalog[0]?.description);
  });

  it("builds fallback copy from catalog data", () => {
    expect(keywordResults(catalog, 1)[0]).toMatchObject({
      courseId: "mit:6.4200",
      recommendationMethod: "keyword",
    });
  });
});
