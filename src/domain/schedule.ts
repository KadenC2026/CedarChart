import { compareSubjectIds } from "./courseSearch";
import { referencesCourse } from "./progression";
import type { PriorityTier, RemoteCourse } from "./types";

export type DayKey = "M" | "T" | "W" | "R" | "F";

export const scheduleDays: DayKey[] = ["M", "T", "W", "R", "F"];

export const dayLabels: Record<DayKey, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

export type MeetingBlock = { day: DayKey; start: number; end: number };
export type SectionOption = { location: string; blocks: MeetingBlock[] };
export type CourseSection = { kind: string; options: SectionOption[] };

function parseClock(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction] = text.split(".");
  const hour = Number.parseInt(whole, 10);
  const minutes = fraction ? Number.parseInt(fraction.padEnd(2, "0"), 10) : 0;
  if (hour > 23 || minutes > 59) return null;
  return hour + minutes / 60;
}

function to24Hour(value: number, meridiem: string | null, evening: boolean) {
  const hour = Math.floor(value);
  if (meridiem === "PM" && hour < 12) return value + 12;
  if (meridiem === "AM") return value;
  if (evening && hour < 12) return value + 12;
  // MIT lists afternoon meetings without a meridiem: 1-7 mean PM, 8-12 mean AM or noon.
  return hour < 8 ? value + 12 : value;
}

/** Parses one FireRoad time token such as "2.30-4", "11-1", or "4-6 PM". */
export function parseMeetingTime(token: string, evening: boolean): { start: number; end: number } | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const meridiemMatch = /(AM|PM)\s*$/i.exec(trimmed);
  const meridiem = meridiemMatch ? meridiemMatch[1].toUpperCase() : null;
  const body = meridiemMatch ? trimmed.slice(0, meridiemMatch.index).trim() : trimmed;

  const parts = body.split("-");
  if (parts.length > 2) return null;

  const rawStart = parseClock(parts[0]);
  if (rawStart === null) return null;
  const rawEnd = parts.length === 2 ? parseClock(parts[1]) : null;
  if (parts.length === 2 && rawEnd === null) return null;

  const start = to24Hour(rawStart, meridiem, evening);
  let end = rawEnd === null ? start + 1 : to24Hour(rawEnd, meridiem, evening);
  // "11-1" means 11:00 to 13:00, so an end that lands before the start is an afternoon time.
  while (end <= start) end += 12;
  return { start, end };
}

/** Parses "26-100/TR/0/2.30-4", including options that chain several day/time triplets. */
export function parseSectionOption(option: string): SectionOption | null {
  const fields = option.split("/");
  if (fields.length < 4 || (fields.length - 1) % 3 !== 0) return null;

  const blocks: MeetingBlock[] = [];
  for (let index = 1; index < fields.length; index += 3) {
    const days = fields[index].trim().toUpperCase();
    const evening = fields[index + 1].trim() === "1";
    const span = parseMeetingTime(fields[index + 2], evening);
    if (!span) continue;
    for (const day of days) {
      if (scheduleDays.includes(day as DayKey)) {
        blocks.push({ day: day as DayKey, start: span.start, end: span.end });
      }
    }
  }

  return blocks.length ? { location: fields[0].trim(), blocks } : null;
}

/** Parses a FireRoad schedule string into sections, each holding the options to choose between. */
export function parseSchedule(text?: string): CourseSection[] {
  if (!text) return [];
  const sections: CourseSection[] = [];

  for (const item of text.split(";")) {
    const parts = item.split(",");
    if (parts.length < 2) continue;
    const kind = parts[0].trim() || "Section";
    const options = parts
      .slice(1)
      .map(parseSectionOption)
      .filter((option): option is SectionOption => option !== null);
    if (options.length) sections.push({ kind, options });
  }

  return sections;
}

export function blocksOverlap(a: MeetingBlock, b: MeetingBlock) {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

export function blockSetsConflict(first: MeetingBlock[], second: MeetingBlock[]) {
  return first.some((a) => second.some((b) => blocksOverlap(a, b)));
}

function selfConflict(blocks: MeetingBlock[]) {
  return blocks.some((block, index) => blocks.slice(index + 1).some((other) => blocksOverlap(block, other)));
}

export type SectionChoice = { kind: string; option: SectionOption };
export type SectionAssignment = { choices: SectionChoice[]; blocks: MeetingBlock[] };

/**
 * Every internally consistent way to take a course: one option per section, with no
 * meeting of the course overlapping another meeting of the same course.
 */
export function courseAssignments(sections: CourseSection[], limit = 240): SectionAssignment[] {
  if (!sections.length) return [];
  let assignments: SectionAssignment[] = [{ choices: [], blocks: [] }];

  for (const section of sections) {
    const next: SectionAssignment[] = [];
    for (const assignment of assignments) {
      for (const option of section.options) {
        if (selfConflict(option.blocks)) continue;
        if (blockSetsConflict(assignment.blocks, option.blocks)) continue;
        next.push({
          choices: [...assignment.choices, { kind: section.kind, option }],
          blocks: [...assignment.blocks, ...option.blocks],
        });
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    if (!next.length) return [];
    assignments = next;
  }

  return assignments;
}

export function formatHour(value: number) {
  const hour24 = Math.floor(value);
  const minutes = Math.round((value - hour24) * 60);
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

/** Collapses blocks that share a time span into one line, e.g. "TR 2:30 PM–4:00 PM". */
export function formatMeeting(blocks: MeetingBlock[]) {
  const groups = new Map<string, { days: DayKey[]; start: number; end: number }>();
  for (const block of blocks) {
    const key = `${block.start}-${block.end}`;
    const group = groups.get(key);
    if (group) group.days.push(block.day);
    else groups.set(key, { days: [block.day], start: block.start, end: block.end });
  }

  return [...groups.values()]
    .sort((a, b) => a.start - b.start)
    .map((group) => {
      const days = scheduleDays.filter((day) => group.days.includes(day)).join("");
      return `${days} ${formatHour(group.start)}–${formatHour(group.end)}`;
    })
    .join(", ");
}

export type ScheduleCourseInput = { course: RemoteCourse; tier: PriorityTier };

export type CourseFitSuggestion = {
  course: RemoteCourse;
  choices: SectionChoice[];
  blocks: MeetingBlock[];
};

export type ScheduleConstraints = {
  maxUnits: number;
  earliestStart: number | null;
  latestEnd: number | null;
};

export const defaultConstraints: ScheduleConstraints = {
  maxUnits: 48,
  earliestStart: null,
  latestEnd: null,
};

export type ExclusionReason = "no-meeting-times" | "time-conflict" | "unit-cap" | "outside-hours";

export type ScheduleExclusion = { subjectId: string; title: string; reason: ExclusionReason };

export type ScheduleEntry = {
  subjectId: string;
  title: string;
  units: number;
  tier: PriorityTier;
  choices: SectionChoice[];
  blocks: MeetingBlock[];
};

export type ScheduleCandidate = {
  id: string;
  label: string;
  rationale: string;
  entries: ScheduleEntry[];
  excluded: ScheduleExclusion[];
  totalUnits: number;
  daysOnCampus: DayKey[];
  earliestStart: number | null;
  latestEnd: number | null;
};

export const exclusionLabels: Record<ExclusionReason, string> = {
  "no-meeting-times": "no meeting times in the imported snapshot",
  "time-conflict": "every section option overlaps a class already placed",
  "unit-cap": "would pass the unit cap",
  "outside-hours": "only meets outside your chosen hours",
};

type SolverItem = {
  input: ScheduleCourseInput;
  units: number;
  weight: number;
  assignments: SectionAssignment[];
  blockedByHours: boolean;
};

type Placement = { item: SolverItem; assignment: SectionAssignment };

function withinHours(blocks: MeetingBlock[], constraints: ScheduleConstraints) {
  return blocks.every(
    (block) =>
      (constraints.earliestStart === null || block.start >= constraints.earliestStart) &&
      (constraints.latestEnd === null || block.end <= constraints.latestEnd),
  );
}

function combinedCourseBlocks(
  courses: RemoteCourse[],
  constraints: ScheduleConstraints,
  limit = 600,
) {
  const options = courses
    .map((course) => courseAssignments(parseSchedule(course.schedule))
      .filter((assignment) => withinHours(assignment.blocks, constraints)))
    .filter((assignments) => assignments.length > 0)
    .sort((a, b) => a.length - b.length);
  if (!options.length) return [[]] as MeetingBlock[][];

  const combinations: MeetingBlock[][] = [];
  function walk(index: number, blocks: MeetingBlock[]) {
    if (combinations.length >= limit) return;
    if (index === options.length) {
      combinations.push(blocks);
      return;
    }
    for (const assignment of options[index]) {
      if (blockSetsConflict(blocks, assignment.blocks)) continue;
      walk(index + 1, [...blocks, ...assignment.blocks]);
      if (combinations.length >= limit) return;
    }
  }
  walk(0, []);
  return combinations;
}

/**
 * Returns courses that have at least one complete section assignment compatible
 * with every timed course already in the selected plan term.
 */
export function suggestCoursesThatFit(
  currentCourses: RemoteCourse[],
  candidates: RemoteCourse[],
  constraints: ScheduleConstraints = defaultConstraints,
  limit = 8,
): CourseFitSuggestion[] {
  const currentUnits = currentCourses.reduce((sum, course) => sum + unitsOf(course), 0);
  const currentIds = new Set(currentCourses.map((course) => course.subject_id));
  const baseArrangements = combinedCourseBlocks(currentCourses, constraints);
  if (!baseArrangements.length) return [];

  const suggestions: CourseFitSuggestion[] = [];
  for (const course of candidates) {
    if (currentIds.has(course.subject_id)) continue;
    if (currentUnits + unitsOf(course) > constraints.maxUnits) continue;
    const assignments = courseAssignments(parseSchedule(course.schedule))
      .filter((assignment) => withinHours(assignment.blocks, constraints));
    const assignment = assignments.find((option) =>
      baseArrangements.some((base) => !blockSetsConflict(base, option.blocks)),
    );
    if (!assignment) continue;
    suggestions.push({ course, choices: assignment.choices, blocks: assignment.blocks });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

function placementMetrics(placements: Placement[]) {
  const blocks = placements.flatMap((placement) => placement.assignment.blocks);
  const days = scheduleDays.filter((day) => blocks.some((block) => block.day === day));
  const starts = blocks.map((block) => block.start);
  const ends = blocks.map((block) => block.end);
  return {
    days,
    earliestStart: starts.length ? Math.min(...starts) : null,
    latestEnd: ends.length ? Math.max(...ends) : null,
    key: placements
      .map((placement) => placement.item.input.course.subject_id)
      .sort(compareSubjectIds)
      .join("|"),
  };
}

/** Identifies an arrangement by its courses and their exact meeting times. */
function placementSignature(placements: Placement[]) {
  return placements
    .map(
      (placement) =>
        placement.item.input.course.subject_id +
        "@" +
        placement.assignment.blocks
          .map((block) => `${block.day}${block.start}-${block.end}`)
          .sort()
          .join(","),
    )
    .sort()
    .join("|");
}

/** Prefers a compacter week, then a later first class, then a stable ordering. */
function comparePlacements(a: Placement[], b: Placement[]) {
  const left = placementMetrics(a);
  const right = placementMetrics(b);
  if (left.days.length !== right.days.length) return left.days.length - right.days.length;
  const leftStart = left.earliestStart ?? 0;
  const rightStart = right.earliestStart ?? 0;
  if (leftStart !== rightStart) return rightStart - leftStart;
  return left.key.localeCompare(right.key);
}

/**
 * Branch-and-bound search over "take it or skip it" for each course, choosing section
 * options that avoid overlaps. The node budget keeps a long priority list responsive;
 * the weights make the first feasible answer already a strong one.
 */
function solve(
  items: SolverItem[],
  constraints: ScheduleConstraints,
  banned: Set<string> = new Set(),
): Placement[] {
  const suffixWeight = new Array<number>(items.length + 1).fill(0);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    suffixWeight[index] = suffixWeight[index + 1] + items[index].weight;
  }

  let best: Placement[] = [];
  let bestScore = -1;
  let budget = 40000;

  function walk(index: number, chosen: Placement[], blocks: MeetingBlock[], units: number, score: number) {
    if (budget <= 0) return;
    if (score + suffixWeight[index] < bestScore) return;

    if (index === items.length) {
      if (!chosen.length || banned.has(placementSignature(chosen))) return;
      if (score > bestScore || (score === bestScore && comparePlacements(chosen, best) < 0)) {
        best = [...chosen];
        bestScore = score;
      }
      return;
    }

    budget -= 1;
    const item = items[index];

    if (units + item.units <= constraints.maxUnits) {
      for (const assignment of item.assignments) {
        if (!withinHours(assignment.blocks, constraints)) continue;
        if (blockSetsConflict(blocks, assignment.blocks)) continue;
        chosen.push({ item, assignment });
        walk(index + 1, chosen, [...blocks, ...assignment.blocks], units + item.units, score + item.weight);
        chosen.pop();
        if (budget <= 0) return;
      }
    }

    walk(index + 1, chosen, blocks, units, score);
  }

  walk(0, [], [], 0, 0);
  return best;
}

function unitsOf(course: RemoteCourse) {
  return typeof course.total_units === "number" ? course.total_units : 0;
}

function buildItems(
  inputs: ScheduleCourseInput[],
  constraints: ScheduleConstraints,
  weightOf: (input: ScheduleCourseInput, index: number, total: number) => number,
): SolverItem[] {
  return inputs.map((input, index) => {
    const assignments = courseAssignments(parseSchedule(input.course.schedule));
    const allowed = assignments.filter((assignment) => withinHours(assignment.blocks, constraints));
    return {
      input,
      units: unitsOf(input.course),
      weight: weightOf(input, index, inputs.length) + (input.tier === "required" ? 1_000_000 : 0),
      assignments,
      blockedByHours: assignments.length > 0 && allowed.length === 0,
    };
  });
}

function exclusionFor(item: SolverItem, chosenUnits: number, constraints: ScheduleConstraints): ExclusionReason {
  if (!item.assignments.length) return "no-meeting-times";
  if (item.blockedByHours) return "outside-hours";
  if (chosenUnits + item.units > constraints.maxUnits) return "unit-cap";
  return "time-conflict";
}

function toCandidate(
  id: string,
  label: string,
  rationale: string,
  items: SolverItem[],
  placements: Placement[],
  constraints: ScheduleConstraints,
): ScheduleCandidate {
  const entries: ScheduleEntry[] = placements.map((placement) => ({
    subjectId: placement.item.input.course.subject_id,
    title: placement.item.input.course.title,
    units: placement.item.units,
    tier: placement.item.input.tier,
    choices: placement.assignment.choices,
    blocks: placement.assignment.blocks,
  }));

  const totalUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
  const placed = new Set(entries.map((entry) => entry.subjectId));
  const excluded = items
    .filter((item) => !placed.has(item.input.course.subject_id))
    .map((item) => ({
      subjectId: item.input.course.subject_id,
      title: item.input.course.title,
      reason: exclusionFor(item, totalUnits, constraints),
    }));

  const metrics = placementMetrics(placements);
  return {
    id,
    label,
    rationale,
    entries,
    excluded,
    totalUnits,
    daysOnCampus: metrics.days,
    earliestStart: metrics.earliestStart,
    latestEnd: metrics.latestEnd,
  };
}

/**
 * Up to four suggested schedules for the priority list. Required courses outrank
 * everything; the strategies then differ in what they optimise so the options are
 * genuinely different rather than reshuffled.
 */
export function buildScheduleCandidates(
  inputs: ScheduleCourseInput[],
  constraints: ScheduleConstraints = defaultConstraints,
): ScheduleCandidate[] {
  if (!inputs.length) return [];

  const priorityWeight = (_input: ScheduleCourseInput, index: number, total: number) =>
    Math.pow(2, Math.min(24, total - 1 - index));
  const countWeight = (_input: ScheduleCourseInput, index: number, total: number) =>
    1 + (total - index) * 1e-6;

  const strategies: Array<{
    id: string;
    label: string;
    rationale: string;
    constraints: ScheduleConstraints;
    weightOf: (input: ScheduleCourseInput, index: number, total: number) => number;
  }> = [
    {
      id: "priority",
      label: "Your priority order",
      rationale: "Protects the classes highest in your list, even if that means fewer classes overall.",
      constraints,
      weightOf: priorityWeight,
    },
    {
      id: "most-classes",
      label: "Most classes that fit",
      rationale: "Packs in as many listed classes as the unit cap and overlaps allow.",
      constraints,
      weightOf: countWeight,
    },
    {
      id: "lighter-load",
      label: "Lighter load",
      rationale: "Keeps the week smaller by holding units well under your cap.",
      constraints: { ...constraints, maxUnits: Math.min(constraints.maxUnits, 36) },
      weightOf: countWeight,
    },
    {
      id: "later-mornings",
      label: "Later mornings",
      rationale: "Only places sections that start at 10:00 AM or later.",
      constraints: { ...constraints, earliestStart: Math.max(constraints.earliestStart ?? 0, 10) },
      weightOf: priorityWeight,
    },
  ];

  const candidates: ScheduleCandidate[] = [];
  const seen = new Set<string>();

  for (const strategy of strategies) {
    const items = buildItems(inputs, strategy.constraints, strategy.weightOf);
    const placements = solve(items, strategy.constraints, seen);
    if (!placements.length) continue;

    seen.add(placementSignature(placements));
    candidates.push(
      toCandidate(
        strategy.id,
        strategy.label,
        strategy.rationale,
        items,
        placements,
        strategy.constraints,
      ),
    );
  }

  // When the strategies agree, keep offering the next best distinct arrangement so a
  // student still has real alternatives to compare.
  const items = buildItems(inputs, constraints, priorityWeight);
  while (candidates.length < 4) {
    const placements = solve(items, constraints, seen);
    if (!placements.length) break;
    seen.add(placementSignature(placements));
    candidates.push(
      toCandidate(
        "alternative-" + (candidates.length + 1),
        "Another option",
        "The next best arrangement after the schedules above.",
        items,
        placements,
        constraints,
      ),
    );
  }

  return candidates;
}

export type ScheduleConflict = { a: string; b: string; detail: string };

/** Pairs in the list that overlap no matter which section options are chosen. */
export function unavoidableConflicts(inputs: ScheduleCourseInput[]): ScheduleConflict[] {
  const prepared = inputs
    .map((input) => ({
      subjectId: input.course.subject_id,
      assignments: courseAssignments(parseSchedule(input.course.schedule)),
    }))
    .filter((entry) => entry.assignments.length > 0);

  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const first = prepared[i];
      const second = prepared[j];
      const always = first.assignments.every((a) =>
        second.assignments.every((b) => blockSetsConflict(a.blocks, b.blocks)),
      );
      if (!always) continue;

      let detail = "Every option overlaps.";
      outer: for (const blockA of first.assignments[0].blocks) {
        for (const blockB of second.assignments[0].blocks) {
          if (blocksOverlap(blockA, blockB)) {
            detail = `${dayLabels[blockA.day]} ${formatHour(blockA.start)}–${formatHour(blockA.end)} overlaps ${formatHour(blockB.start)}–${formatHour(blockB.end)}`;
            break outer;
          }
        }
      }

      conflicts.push({ a: first.subjectId, b: second.subjectId, detail });
    }
  }

  return conflicts;
}

/**
 * Subjects named in a prerequisite rule that are not marked complete. This is an
 * advisory reading list, not a verdict: AND/OR, permission, and unknown conditions
 * stay in the catalog text, which remains the source of truth.
 */
export function mentionedPrerequisites(
  course: RemoteCourse,
  catalog: RemoteCourse[],
  earned: Set<string>,
) {
  if (!course.prerequisites) return [];
  return catalog
    .filter(
      (candidate) =>
        candidate.subject_id !== course.subject_id &&
        referencesCourse(course.prerequisites, candidate) &&
        !earned.has(candidate.subject_id),
    )
    .map((candidate) => candidate.subject_id)
    .sort(compareSubjectIds);
}
