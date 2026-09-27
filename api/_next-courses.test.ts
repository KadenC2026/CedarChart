import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./next-courses";

const mocks = vi.hoisted(() => ({ rank: vi.fn(), embed: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  responses = { create: mocks.rank };
  embeddings = { create: mocks.embed };
} }));

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


it("keeps AI selection, removes duplicates and invented IDs, and survives embedding failure", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.embed.mockRejectedValue(new Error("embedding unavailable"));
  mocks.rank.mockResolvedValue({ status: "completed", output_text: JSON.stringify({ results: [
    { subjectId: "6.3900", explanation: "Builds on linear algebra for machine learning." },
    { subjectId: "6.3900", explanation: "Duplicate" },
    { subjectId: "invented", explanation: "Not a real course" },
  ] }) });
  let body: any;
  const res = { status() { return this; }, json(value: any) { body = value; return this; } };
  const request = { method: "POST", body: {
    currentCourse: { subjectId: "18.06", title: "Incorrect client title" },
    careerGoal: "machine learning",
    candidates: ["6.3900", "18.100A", "invented"].map((subjectId) => ({ subjectId,
      title: "Incorrect client title", relationship: "recommended-next", deterministicScore: 20, deterministicReasons: [] })),
  } };
  try {
    await handler(request, res);
    expect(body.method).toBe("vector+AI");
    expect(body.results.map((item: any) => item.subjectId)).toEqual(["6.3900"]);
    expect(JSON.stringify(mocks.rank.mock.calls.at(-1))).not.toContain("Incorrect client title");
    mocks.rank.mockResolvedValue({ status: "completed", output_text: '{"results":[]}' });
    await handler(request, res);
    expect(body.results).toEqual([]);
    expect(body.method).toBe("vector+AI");
  } finally { log.mockRestore(); }
});
