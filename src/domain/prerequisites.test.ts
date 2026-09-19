import { describe, expect, it } from "vitest";
import { evaluatePrerequisite } from "./prerequisites";
import type { PrerequisiteRule } from "./types";

describe("evaluatePrerequisite", () => {
  it("satisfies an empty all rule", () => {
    expect(evaluatePrerequisite({ type: "all", children: [] }, new Set()).status).toBe("satisfied");
  });

  it("reports a missing course", () => {
    const result = evaluatePrerequisite({ type: "course", courseId: "mit:A" }, new Set());
    expect(result.status).toBe("missing");
    expect(result.missingCourseIds).toEqual(["mit:A"]);
  });

  it("handles AND", () => {
    const rule: PrerequisiteRule = {
      type: "all",
      children: [
        { type: "course", courseId: "mit:A" },
        { type: "course", courseId: "mit:B" },
      ],
    };
    expect(evaluatePrerequisite(rule, new Set(["mit:A"])).missingCourseIds).toEqual(["mit:B"]);
  });

  it("handles OR", () => {
    const rule: PrerequisiteRule = {
      type: "any",
      children: [
        { type: "course", courseId: "mit:A" },
        { type: "course", courseId: "mit:B" },
      ],
    };
    expect(evaluatePrerequisite(rule, new Set(["mit:B"])).status).toBe("satisfied");
  });

  it("keeps unresolved rules as needs_review", () => {
    expect(
      evaluatePrerequisite({ type: "permission", text: "Permission of instructor" }, new Set()).status,
    ).toBe("needs_review");
  });
});
