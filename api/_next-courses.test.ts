import { afterEach, describe, expect, it } from "vitest";
import handler from "./next-courses";

const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

describe("next courses serverless route", () => {
  it("loads and serves deterministic candidates without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    let statusCode = 0;
    let body: { results?: Array<{ subjectId: string }> } = {};
    const res = {
      status(code: number) { statusCode = code; return this; },
      json(payload: typeof body) { body = payload; return this; },
    };

    await handler({ method: "POST", body: {
      currentCourse: { subjectId: "18.06", title: "Linear Algebra" },
      candidates: [{
        subjectId: "18.100A",
        title: "Real Analysis",
        relationship: "related-direction",
        deterministicScore: 10,
        deterministicReasons: ["Related mathematics course."],
      }],
    } }, res);

    expect(statusCode).toBe(200);
    expect(body.results?.[0]?.subjectId).toBe("18.100A");
  });
});
