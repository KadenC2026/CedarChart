import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blocksOverlap,
  buildScheduleCandidates,
  formatMeeting,
  parseSchedule,
  type ScheduleCourseInput,
} from "./schedule";
import type { RemoteCourse } from "./types";

const catalog = JSON.parse(
  readFileSync(new URL("../../public/data/catalog.json", import.meta.url), "utf8"),
) as RemoteCourse[];

const byId = new Map(catalog.map((course) => [course.subject_id, course]));

function input(subjectId: string, tier: "required" | "preferred" = "preferred"): ScheduleCourseInput {
  const course = byId.get(subjectId);
  if (!course) throw new Error("missing subject in snapshot: " + subjectId);
  return { course, tier };
}

describe("schedule parsing over the imported snapshot", () => {
  it("parses every listed meeting into a sane weekday block", () => {
    const scheduled = catalog.filter((course) => course.schedule);
    expect(scheduled.length).toBeGreaterThan(1000);

    let blockCount = 0;
    for (const course of scheduled) {
      for (const section of parseSchedule(course.schedule)) {
        for (const option of section.options) {
          for (const block of option.blocks) {
            blockCount += 1;
            expect(block.end).toBeGreaterThan(block.start);
            expect(block.start).toBeGreaterThanOrEqual(8);
            expect(block.end).toBeLessThanOrEqual(23);
            expect(block.end - block.start).toBeLessThanOrEqual(5);
          }
        }
      }
    }
    expect(blockCount).toBeGreaterThan(4000);
  });

  it("reads a lecture time that matches the published listing", () => {
    const sections = parseSchedule(byId.get("6.1200")?.schedule);
    const lecture = sections.find((section) => section.kind === "Lecture");
    expect(lecture).toBeDefined();
    expect(formatMeeting(lecture!.options[0].blocks)).toBe("TR 2:30 PM–4:00 PM");
  });
});

describe("suggested schedules over the imported snapshot", () => {
  const priority = [
    input("6.1200", "required"),
    input("6.3900", "required"),
    input("6.1010"),
    input("21M.301"),
    input("1.018"),
    input("2.060"),
  ];

  it("never suggests a schedule that overlaps itself", () => {
    const candidates = buildScheduleCandidates(priority, { maxUnits: 54, earliestStart: null, latestEnd: null });
    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      const blocks = candidate.entries.flatMap((entry) => entry.blocks);
      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          expect(blocksOverlap(blocks[i], blocks[j])).toBe(false);
        }
      }
    }
  });

  it("keeps required subjects and respects the unit cap", () => {
    const candidates = buildScheduleCandidates(priority, { maxUnits: 48, earliestStart: null, latestEnd: null });
    for (const candidate of candidates) {
      expect(candidate.totalUnits).toBeLessThanOrEqual(48);
    }
    const placed = candidates[0].entries.map((entry) => entry.subjectId);
    expect(placed).toContain("6.1200");
    expect(placed).toContain("6.3900");
  });

  it("offers more than one arrangement to compare", () => {
    const candidates = buildScheduleCandidates(priority, { maxUnits: 48, earliestStart: null, latestEnd: null });
    expect(candidates.length).toBeGreaterThan(1);
  });
});
