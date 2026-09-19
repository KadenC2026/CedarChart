import { describe, expect, it } from "vitest";
import { buildCourseFamilies } from "./courseFamilies";
import type { RemoteCourse } from "./types";

function course(subject_id: string, title: string, equivalent_subjects?: string[]): RemoteCourse {
  return { subject_id, title, equivalent_subjects };
}

describe("course family grouping", () => {
  it("merges lettered variants with the same title", () => {
    const { familyByCourseId } = buildCourseFamilies([
      course("18.100A", "Real Analysis"),
      course("18.100B", "Real Analysis"),
      course("18.100C", "Real Analysis"),
    ]);

    const family = familyByCourseId.get("18.100A");
    expect(family?.members.map((item) => item.subject_id)).toEqual([
      "18.100A",
      "18.100B",
      "18.100C",
    ]);
  });

  it("keeps same-stem courses separate when titles are meaningfully different", () => {
    const { familyByCourseId } = buildCourseFamilies([
      course("6.100A", "Introduction to Computer Science Programming in Python"),
      course("6.100B", "Introduction to Computational Thinking and Data Science"),
    ]);

    expect(familyByCourseId.get("6.100A")?.id).not.toBe(
      familyByCourseId.get("6.100B")?.id,
    );
  });

  it("merges explicit equivalent subjects even when numbers differ", () => {
    const { familyByCourseId } = buildCourseFamilies([
      course("1.001", "Example Subject", ["2.001"]),
      course("2.001", "Equivalent Example"),
    ]);

    expect(familyByCourseId.get("1.001")).toBe(familyByCourseId.get("2.001"));
  });
});
