import { describe, expect, it } from "vitest";
import handler, {
  catalogPetitionSuggestions,
  groundedPetitionSuggestions,
  petitionCandidates,
  type PetitionCatalogCourse,
} from "./petition-suggestions";

const catalog: PetitionCatalogCourse[] = [
  {
    subject_id: "18.02",
    title: "Calculus",
    description: "Multivariable calculus, vectors, matrices, and partial derivatives.",
    level: "U",
  },
  {
    subject_id: "6.100A",
    title: "Introduction to Computer Science Programming in Python",
    description: "Programming in Python, testing, and computational problem solving.",
    level: "U",
  },
  {
    subject_id: "6.3900",
    title: "Introduction to Machine Learning",
    description: "Machine learning algorithms and applications.",
    prerequisites: "18.02 and 6.100A",
    level: "U",
  },
];

describe("petition suggestion grounding", () => {
  it("prioritizes subjects named as prerequisites for the current plan", () => {
    const candidates = petitionCandidates(catalog, "multivariable calculus and Python programming", ["6.3900"]);
    expect(candidates.slice(0, 2).map((course) => course.subject_id)).toEqual(["6.100A", "18.02"]);
    expect(candidates[0]?.prerequisiteFor).toEqual(["6.3900"]);
  });

  it("excludes subjects that already count as completed or prior credit", () => {
    const candidates = petitionCandidates(catalog, "multivariable calculus and Python programming", ["6.3900"], ["18.02"]);
    expect(candidates.map((course) => course.subject_id)).not.toContain("18.02");
  });

  it("accepts only unique AI results from the supplied candidates", () => {
    const candidates = petitionCandidates(catalog, "multivariable calculus", ["6.3900"]);
    const results = groundedPetitionSuggestions([
      { subjectId: "made-up", overlapExplanation: "Invented", petitionQuestion: "Skip it?" },
      { subjectId: "18.02", overlapExplanation: "Your stated calculus work overlaps with the description.", petitionQuestion: "Could this preparation satisfy the expected background?" },
      { subjectId: "18.02", overlapExplanation: "Duplicate", petitionQuestion: "Duplicate?" },
    ], candidates);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ courseId: "18.02", recommendationMethod: "AI", prerequisiteFor: ["6.3900"] });
  });

  it("builds cautious catalog fallback copy", () => {
    const candidates = petitionCandidates(catalog, "Python programming", ["6.3900"]);
    expect(catalogPetitionSuggestions(candidates)[0]).toMatchObject({
      courseId: "6.100A",
      recommendationMethod: "catalog",
    });
  });

  it("serves catalog-grounded suggestions without an API key", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let statusCode = 0;
    let body: { method?: string; results?: Array<{ courseId: string }> } = {};
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: typeof body) { body = payload; return this; },
    };

    try {
      await handler({
        method: "POST",
        body: { backgroundExperience: "multivariable calculus and linear algebra", plannedCourseIds: [] },
      }, response);
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }

    expect(statusCode).toBe(200);
    expect(body.method).toBe("catalog");
    expect(body.results?.length).toBeGreaterThan(0);
  });
});
