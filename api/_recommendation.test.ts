import { describe, expect, it, vi } from "vitest";
import handler, {
  groundedAiResults,
  keywordResults,
  retrieveCandidates,
  translatedKeywordResults,
  type CatalogCourse,
} from "./recommend";

const rank = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({ default: class { responses = { create: rank }; } }));

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

  it("keeps a translated food query grounded in courses about food", () => {
    const courses: CatalogCourse[] = [
      { subject_id: "21G.045", title: "Global Chinese Food", description: "History of Chinese food." },
      { subject_id: "16.C21A", title: "Numerical Methods", description: "Diffusion in physical systems." },
    ];
    const candidates = retrieveCandidates(courses, "I like Chinese food", ["diffusion"]);
    expect(candidates[0]?.subject_id).toBe("21G.045");
    const results = groundedAiResults([
      { subjectId: "16.C21A", relevanceExplanation: "Food cooks through diffusion." },
      { subjectId: "21G.045", relevanceExplanation: "Covers Chinese food history." },
    ], candidates, 5, "Chinese food");
    expect(results.map((result) => result.courseId)).toEqual(["mit:21G.045"]);
    expect(translatedKeywordResults(candidates, "I like Chinese food").map((result) => result.courseId))
      .toEqual(["mit:21G.045"]);
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

  it("loads the serverless route and serves catalog results without an API key", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    let statusCode = 0;
    let body: { method?: string; reason?: string; results?: Array<{ courseId: string }> } = {};
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: typeof body) {
        body = payload;
        return this;
      },
    };

    try {
      await handler({ method: "POST", body: { query: "robotics" } }, response);
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }

    expect(statusCode).toBe(200);
    expect(body.method).toBe("keyword");
    expect(body.reason).toBe("api-key-missing");
    expect(body.results?.length).toBeGreaterThan(0);
    expect(body.results?.every((result) => result.courseId.startsWith("mit:"))).toBe(true);
  });
});


it("uses a career-only request and preserves the model's no-match decision", async () => {
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  rank.mockResolvedValueOnce({ status: "completed", output_text: JSON.stringify({
    intentSummary: "Robotics career", englishQuery: "robotics", coreTopic: "robotics",
    searchTerms: ["robots", "control", "robotics"],
  }) }).mockResolvedValueOnce({ status: "completed", output_text: '{"results":[]}' });
  let body: any;
  const res = { status() { return this; }, json(value: any) { body = value; return this; } };
  try {
    await handler({ method: "POST", body: { careerGoal: "robotics engineer" } }, res);
    expect(rank).toHaveBeenCalledTimes(2);
    expect(rank.mock.calls[0][0].input).toContain("robotics engineer");
    expect(JSON.parse(rank.mock.calls[1][0].input).careerGoal).toBe("robotics engineer");
    expect(body).toEqual({ results: [], method: "AI" });
  } finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
