import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { departmentOf, emptyFilters, searchCourses } from "./courseSearch";
import type { RemoteCourse } from "./types";

const catalog = JSON.parse(
  readFileSync(new URL("../../public/data/catalog.json", import.meta.url), "utf8"),
) as RemoteCourse[];

describe("search ranking over the imported catalog snapshot", () => {
  it("answers a topic search with the subject that teaches it", () => {
    const results = searchCourses(catalog, { query: "algorithms", filters: emptyFilters, limit: 5 });
    expect(results[0]?.subject_id).toBe("6.1210");
    expect(departmentOf(results[0]?.subject_id ?? "")).toBe("6");
  });

  it("keeps description-only mentions out of the leading results", () => {
    const results = searchCourses(catalog, { query: "algorithms", filters: emptyFilters, limit: 10 });
    const leading = results.map((course) => course.subject_id);
    expect(leading).not.toContain("1.000");
  });

  it("ranks the canonical subject first for a course title", () => {
    const results = searchCourses(catalog, { query: "linear algebra", filters: emptyFilters, limit: 5 });
    expect(results[0]?.subject_id).toBe("18.06");
  });

  it("narrows a topic search to one department when filtered", () => {
    const results = searchCourses(catalog, {
      query: "algorithms",
      filters: { ...emptyFilters, departments: ["6"], level: "U" },
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((course) => departmentOf(course.subject_id) === "6")).toBe(true);
    expect(results.every((course) => course.level === "U")).toBe(true);
  });
});
