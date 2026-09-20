import { describe, expect, it } from "vitest";
import {
  blocksOverlap,
  buildScheduleCandidates,
  courseAssignments,
  formatMeeting,
  mentionedPrerequisites,
  parseMeetingTime,
  parseSchedule,
  suggestCoursesThatFit,
  unavoidableConflicts,
  type ScheduleCourseInput,
} from "./schedule";
import type { RemoteCourse } from "./types";

function course(partial: Partial<RemoteCourse> & { subject_id: string; title: string }): RemoteCourse {
  return { total_units: 12, ...partial };
}

describe("meeting time parsing", () => {
  it("reads afternoon times that omit a meridiem", () => {
    expect(parseMeetingTime("2.30-4", false)).toEqual({ start: 14.5, end: 16 });
    expect(parseMeetingTime("1-2.30", false)).toEqual({ start: 13, end: 14.5 });
  });

  it("keeps morning times in the morning", () => {
    expect(parseMeetingTime("9.30-11", false)).toEqual({ start: 9.5, end: 11 });
    expect(parseMeetingTime("10.30-12", false)).toEqual({ start: 10.5, end: 12 });
  });

  it("carries a span across noon", () => {
    expect(parseMeetingTime("11-1", false)).toEqual({ start: 11, end: 13 });
  });

  it("gives a single listed hour a one-hour slot", () => {
    expect(parseMeetingTime("3", false)).toEqual({ start: 15, end: 16 });
    expect(parseMeetingTime("11", false)).toEqual({ start: 11, end: 12 });
  });

  it("honours an explicit meridiem and the evening flag", () => {
    expect(parseMeetingTime("7-10 PM", true)).toEqual({ start: 19, end: 22 });
    expect(parseMeetingTime("4-6 PM", true)).toEqual({ start: 16, end: 18 });
  });

  it("rejects unusable tokens", () => {
    expect(parseMeetingTime("TBA", false)).toBeNull();
    expect(parseMeetingTime("", false)).toBeNull();
  });
});

describe("schedule string parsing", () => {
  it("splits sections and their selectable options", () => {
    const sections = parseSchedule("Lecture,26-100/TR/0/2.30-4;Recitation,26-168/WF/0/10,38-166/WF/0/1");
    expect(sections).toHaveLength(2);
    expect(sections[0].kind).toBe("Lecture");
    expect(sections[0].options[0].blocks).toEqual([
      { day: "T", start: 14.5, end: 16 },
      { day: "R", start: 14.5, end: 16 },
    ]);
    expect(sections[1].options).toHaveLength(2);
  });

  it("reads an option that chains several day and time groups", () => {
    const sections = parseSchedule("Lab,4-006/T/0/11-1/R/0/10-1");
    expect(sections[0].options[0].blocks).toEqual([
      { day: "T", start: 11, end: 13 },
      { day: "R", start: 10, end: 13 },
    ]);
  });

  it("skips sections with no usable times", () => {
    expect(parseSchedule("Lab,TBA")).toEqual([]);
    expect(parseSchedule(undefined)).toEqual([]);
  });

  it("formats meetings that share a time span as one line", () => {
    const sections = parseSchedule("Lecture,26-100/TR/0/2.30-4");
    expect(formatMeeting(sections[0].options[0].blocks)).toBe("TR 2:30 PM–4:00 PM");
  });
});

describe("overlap detection", () => {
  it("treats touching blocks as compatible", () => {
    expect(blocksOverlap({ day: "M", start: 9, end: 10 }, { day: "M", start: 10, end: 11 })).toBe(false);
    expect(blocksOverlap({ day: "M", start: 9, end: 10.5 }, { day: "M", start: 10, end: 11 })).toBe(true);
    expect(blocksOverlap({ day: "M", start: 9, end: 10.5 }, { day: "T", start: 9, end: 10.5 })).toBe(false);
  });

  it("enumerates only internally consistent ways to take a course", () => {
    const sections = parseSchedule("Lecture,10-250/MW/0/1;Recitation,1-190/F/0/1,1-190/M/0/1");
    const assignments = courseAssignments(sections);
    // The Monday recitation collides with the Monday lecture, so one option survives.
    expect(assignments).toHaveLength(1);
    expect(assignments[0].choices[1].option.blocks).toEqual([{ day: "F", start: 13, end: 14 }]);
  });

  it("reports pairs that overlap under every option", () => {
    const inputs: ScheduleCourseInput[] = [
      { course: course({ subject_id: "1.000", title: "A", schedule: "Lecture,1-100/MW/0/9.30-11" }), tier: "preferred" },
      { course: course({ subject_id: "2.060", title: "B", schedule: "Lecture,2-200/MW/0/9.30-11" }), tier: "preferred" },
      { course: course({ subject_id: "3.000", title: "C", schedule: "Lecture,3-300/TR/0/9.30-11" }), tier: "preferred" },
    ];
    const conflicts = unavoidableConflicts(inputs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].a).toBe("1.000");
    expect(conflicts[0].b).toBe("2.060");
    expect(conflicts[0].detail).toContain("Mon 9:30 AM–11:00 AM");
  });
});

describe("suggested schedules", () => {
  const clash = course({ subject_id: "6.1200", title: "Math for CS", schedule: "Lecture,26-100/TR/0/2.30-4" });
  const clashing = course({ subject_id: "18.06", title: "Linear Algebra", schedule: "Lecture,26-100/TR/0/3-4.30" });
  const free = course({ subject_id: "6.1910", title: "Computation Structures", schedule: "Lecture,26-100/MW/0/11-12.30" });
  const untimed = course({ subject_id: "7.012", title: "Biology", schedule: undefined });

  const inputs: ScheduleCourseInput[] = [
    { course: clash, tier: "required" },
    { course: clashing, tier: "preferred" },
    { course: free, tier: "preferred" },
    { course: untimed, tier: "preferred" },
  ];

  it("keeps the required class and explains what it dropped", () => {
    const [first] = buildScheduleCandidates(inputs, { maxUnits: 48, earliestStart: null, latestEnd: null });
    const placed = first.entries.map((entry) => entry.subjectId);
    expect(placed).toContain("6.1200");
    expect(placed).toContain("6.1910");
    expect(placed).not.toContain("18.06");

    const dropped = new Map(first.excluded.map((entry) => [entry.subjectId, entry.reason]));
    expect(dropped.get("18.06")).toBe("time-conflict");
    expect(dropped.get("7.012")).toBe("no-meeting-times");
  });

  it("reports units, days on campus, and the day's edges", () => {
    const [first] = buildScheduleCandidates(inputs);
    expect(first.totalUnits).toBe(24);
    expect(first.daysOnCampus).toEqual(["M", "T", "W", "R"]);
    expect(first.earliestStart).toBe(11);
    expect(first.latestEnd).toBe(16);
  });

  it("respects a unit cap", () => {
    const [first] = buildScheduleCandidates(inputs, { maxUnits: 12, earliestStart: null, latestEnd: null });
    expect(first.entries.map((entry) => entry.subjectId)).toEqual(["6.1200"]);
    expect(first.excluded.find((entry) => entry.subjectId === "6.1910")?.reason).toBe("unit-cap");
  });

  it("offers several distinct schedules when the list allows it", () => {
    const candidates = buildScheduleCandidates(inputs);
    expect(candidates.length).toBeGreaterThan(2);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(candidates.length);

    const arrangements = candidates.map((candidate) =>
      candidate.entries.map((entry) => entry.subjectId).sort().join(","),
    );
    expect(new Set(arrangements).size).toBeGreaterThan(1);
    // The class that lost the overlap should still appear in an alternative.
    expect(arrangements.some((arrangement) => arrangement.includes("18.06"))).toBe(true);
  });

  it("drops sections that fall outside the chosen hours", () => {
    const early = course({ subject_id: "5.111", title: "Chemistry", schedule: "Lecture,5-100/MW/0/9-10.30" });
    const candidates = buildScheduleCandidates(
      [{ course: early, tier: "preferred" }],
      { maxUnits: 48, earliestStart: 10, latestEnd: null },
    );
    expect(candidates).toEqual([]);
  });

  it("returns nothing for an empty list", () => {
    expect(buildScheduleCandidates([])).toEqual([]);
  });
});

describe("courses that fit an existing term", () => {
  const current = course({ subject_id: "6.1200", title: "Math for CS", schedule: "Lecture,26-100/TR/0/2.30-4" });
  const alternateFits = course({
    subject_id: "18.06",
    title: "Linear Algebra",
    schedule: "Lecture,2-190/TR/0/3-4.30,2-190/MW/0/10-11.30",
  });
  const alwaysClashes = course({ subject_id: "6.1210", title: "Algorithms", schedule: "Lecture,32-123/TR/0/3-4" });

  it("keeps a course when at least one section option avoids the current term", () => {
    const suggestions = suggestCoursesThatFit([current], [alwaysClashes, alternateFits]);
    expect(suggestions.map((entry) => entry.course.subject_id)).toEqual(["18.06"]);
    expect(formatMeeting(suggestions[0].blocks)).toBe("MW 10:00 AM–11:30 AM");
  });

  it("respects the term unit cap", () => {
    expect(suggestCoursesThatFit(
      [current],
      [alternateFits],
      { maxUnits: 12, earliestStart: null, latestEnd: null },
    )).toEqual([]);
  });
});

describe("prerequisite advisory", () => {
  it("lists mentioned subjects that are not marked complete", () => {
    const catalog = [
      course({ subject_id: "6.1210", title: "Algorithms", prerequisites: "6.1200 and 6.100B" }),
      course({ subject_id: "6.1200", title: "Math for CS" }),
      course({ subject_id: "6.100B", title: "Computational Thinking" }),
      course({ subject_id: "18.06", title: "Linear Algebra" }),
    ];
    const unmet = mentionedPrerequisites(catalog[0], catalog, new Set(["6.1200"]));
    expect(unmet).toEqual(["6.100B"]);
  });

  it("says nothing when no prerequisite text exists", () => {
    const target = course({ subject_id: "6.9999", title: "Seminar" });
    expect(mentionedPrerequisites(target, [target], new Set())).toEqual([]);
  });
});
