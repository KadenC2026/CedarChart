import { afterEach, describe, expect, it } from "vitest";
import handler from "./network-recommendations";

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
});

function responseRecorder() {
  let statusCode = 200;
  let body: any;
  return {
    response: {
      status(code: number) { statusCode = code; return this; },
      json(value: any) { body = value; return this; },
    },
    result: () => ({ statusCode, body }),
  };
}

describe("network recommendations endpoint", () => {
  it("returns grounded profile matches when no AI key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const recorder = responseRecorder();
    await handler({
      method: "POST",
      body: {
        interestQuery: "robotics and machine learning",
        careerGoal: "AI research",
        backgroundExperience: "built a robot",
        courseIds: ["6.3900"],
        studentYear: "first-year",
      },
    }, recorder.response);

    const result = recorder.result();
    expect(result.statusCode).toBe(200);
    expect(result.body.method).toBe("profile");
    expect(result.body.results[0].id).toBe("csail");
    expect(result.body.results.every((item: any) => item.url.startsWith("https://"))).toBe(true);
  });
});
