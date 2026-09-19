import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  departmentOf,
  departmentOptions,
  emptyFilters,
  matchesFilters,
  searchCourses,
  searchScore,
} from "./courseSearch";
import type { RemoteCourse } from "./types";

function course(partial: Partial<RemoteCourse> & { subject_id: string; title: string }): RemoteCourse {
  return partial;
}

const algorithms = course({
  subject_id: "6.1210",
  title: "Introduction to Algorithms",
  level: "U",
  total_units: 12,
  offered_fall: true,
  offered_spring: true,
});

const civilComputation = course({
  subject_id: "1.000",
  title: "Engineering Computation and Data Science",
  description: "Programming, data structures, and algorithms applied to civil engineering problems.",
  level: "U",
  total_units: 12,
  offered_fall: true,
});

const retiredAlgorithms = course({
  subject_id: "6.006",
  title: "Introduction to Algorithms",
  is_historical: true,
  level: "U",
});

const gradAlgorithms = course({
  subject_id: "6.5210",
  title: "Advanced Algorithms",
  level: "G",
  total_units: 12,
  offered_fall: true,
});

const hassSubject = course({
  subject_id: "21G.103",
  title: "Chinese I",
  hass_attribute: "HASS-H",
  communication_requirement: "CI-H",
  level: "U",
  total_units: 12,
  offered_fall: true,
});

const catalog = [civilComputation, algorithms, retiredAlgorithms, gradAlgorithms, hassSubject];

describe("course search ranking", () => {
  it("ranks a title match above a description-only mention", () => {
    expect(searchScore(algorithms, "algorithms")).toBeGreaterThan(
      searchScore(civilComputation, "algorithms"),
    );
  });

  it("returns subject-number matches first", () => {
    const results = searchCourses(catalog, { query: "6.1210", filters: emptyFilters });
    expect(results[0]?.subject_id).toBe("6.1210");
  });

  it("puts Course 6 ahead of Course 1 when searching algorithms", () => {
    const results = searchCourses(catalog, { query: "algorithms", filters: emptyFilters });
    expect(results.map((item) => item.subject_id)).toEqual(["6.1210", "6.5210", "1.000"]);
  });

  it("matches a subject number typed without the period", () => {
    expect(searchScore(algorithms, "61210")).toBeGreaterThan(0);
  });

  it("ignores courses that match nothing", () => {
    expect(searchScore(algorithms, "quantum")).toBe(0);
  });
});

describe("course filters", () => {
  it("hides retired subjects by default and shows them on request", () => {
    const hidden = searchCourses(catalog, { query: "algorithms", filters: emptyFilters });
    expect(hidden.map((item) => item.subject_id)).not.toContain("6.006");

    const shown = searchCourses(catalog, {
      query: "algorithms",
      filters: { ...emptyFilters, hideRetired: false },
    });
    expect(shown.map((item) => item.subject_id)).toContain("6.006");
  });

  it("restricts results to the chosen departments", () => {
    const results = searchCourses(catalog, {
      query: "algorithms",
      filters: { ...emptyFilters, departments: ["6"] },
    });
    expect(results.map((item) => item.subject_id)).toEqual(["6.1210", "6.5210"]);
  });

  it("filters by level, term, attribute, and unit range", () => {
    expect(matchesFilters(gradAlgorithms, { ...emptyFilters, level: "U" })).toBe(false);
    expect(matchesFilters(algorithms, { ...emptyFilters, level: "U" })).toBe(true);
    expect(matchesFilters(civilComputation, { ...emptyFilters, terms: ["spring"] })).toBe(false);
    expect(matchesFilters(algorithms, { ...emptyFilters, terms: ["spring"] })).toBe(true);
    expect(matchesFilters(hassSubject, { ...emptyFilters, attributes: ["CI-H"] })).toBe(true);
    expect(matchesFilters(algorithms, { ...emptyFilters, attributes: ["HASS-H"] })).toBe(false);
    expect(matchesFilters(algorithms, { ...emptyFilters, unitsMin: 15 })).toBe(false);
    expect(matchesFilters(algorithms, { ...emptyFilters, unitsMax: 12 })).toBe(true);
  });

  it("browses by filter alone when no query is typed", () => {
    const results = searchCourses(catalog, {
      query: "",
      filters: { ...emptyFilters, departments: ["1"] },
    });
    expect(results.map((item) => item.subject_id)).toEqual(["1.000"]);
  });

  it("treats the default filter state as inactive", () => {
    expect(activeFilterCount(emptyFilters)).toBe(0);
    expect(activeFilterCount({ ...emptyFilters, departments: ["6"], level: "U" })).toBe(2);
    expect(activeFilterCount({ ...emptyFilters, hideRetired: false })).toBe(1);
  });

  it("derives department codes and counts from the catalog", () => {
    expect(departmentOf("21G.103")).toBe("21G");
    expect(departmentOptions(catalog)).toEqual([
      { department: "1", count: 1 },
      { department: "6", count: 3 },
      { department: "21G", count: 1 },
    ]);
  });
});
