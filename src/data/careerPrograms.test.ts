import { describe, expect, it } from "vitest";
import { careerPrograms, programsForYear } from "./careerPrograms";

describe("career programs", () => {
  it("puts first-year discovery programs before later-year internships", () => {
    const ranked = programsForYear(careerPrograms, "first-year");
    expect(ranked.slice(0, 2).map((program) => program.id)).toContain("jane-street-first-year");
    expect(ranked.findIndex((program) => program.id === "jane-street-first-year"))
      .toBeLessThan(ranked.findIndex((program) => program.id === "jane-street-internships"));
    expect(ranked.at(-1)?.id).toBe("anthropic-careers");
  });
});
