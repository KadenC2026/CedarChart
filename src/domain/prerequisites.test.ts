import { describe, expect, it } from "vitest";
import { evaluatePrerequisite, parseCatalogPrerequisites } from "./prerequisites";
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

describe("parseCatalogPrerequisites", () => {
  it("treats commas as AND and slashes as OR", () => {
    expect(parseCatalogPrerequisites("18.01, (6.100A/6.100B)")).toEqual({
      type: "all",
      children: [
        { type: "token", value: "18.01" },
        {
          type: "any",
          children: [
            { type: "token", value: "6.100A" },
            { type: "token", value: "6.100B" },
          ],
        },
      ],
    });
  });

  it("preserves grouped AND alternatives", () => {
    expect(parseCatalogPrerequisites("(6.100A, 6.100B)/(6.100L, 16.C20)")).toEqual({
      type: "any",
      children: [
        {
          type: "all",
          children: [
            { type: "token", value: "6.100A" },
            { type: "token", value: "6.100B" },
          ],
        },
        {
          type: "all",
          children: [
            { type: "token", value: "6.100L" },
            { type: "token", value: "16.C20" },
          ],
        },
      ],
    });
  });

  it("does not split punctuation inside quoted permission text", () => {
    expect(parseCatalogPrerequisites("18.03/''permission of instructor, department approval''")).toEqual({
      type: "any",
      children: [
        { type: "token", value: "18.03" },
        { type: "token", value: "''permission of instructor, department approval''" },
      ],
    });
  });
});
