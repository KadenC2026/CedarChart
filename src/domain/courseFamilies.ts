import {
  compareSubjectIds,
  enrollmentOf,
  matchesFilters,
  searchScore,
  type CourseFilters,
} from "./courseSearch";
import type { RemoteCourse } from "./types";

export type CourseFamily = {
  id: string;
  label: string;
  title: string;
  members: RemoteCourse[];
  primary: RemoteCourse;
};

function numericStem(subjectId: string) {
  const match = subjectId.match(/^(\d+(?:\.\d+)?)[A-Z]+$/i);
  return match?.[1] ?? subjectId;
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/\b(part|version|section)\s+[a-z0-9]+\b/g, "")
    .replace(/\b[a-c]\b$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(title: string) {
  return new Set(normalizeTitle(title).split(/\s+/).filter(Boolean));
}

function titlesAreSimilar(a: string, b: string) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  const aTokens = titleTokens(a);
  const bTokens = titleTokens(b);
  if (!aTokens.size || !bTokens.size) return false;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union >= 0.72;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    this.add(id);
    const parent = this.parent.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export function buildCourseFamilies(catalog: RemoteCourse[]) {
  const byId = new Map(catalog.map((course) => [course.subject_id, course]));
  const uf = new UnionFind();
  catalog.forEach((course) => uf.add(course.subject_id));

  // FireRoad-provided equivalencies are authoritative for grouping.
  for (const course of catalog) {
    for (const equivalent of course.equivalent_subjects ?? []) {
      if (byId.has(equivalent)) uf.union(course.subject_id, equivalent);
    }
  }

  // The catalog occasionally omits equivalent_subjects on Concourse (CC) or
  // Experimental Study Group (ES) versions of a GIR. Match those learning-
  // community subjects to the same GIR only when their titles also agree.
  // Requiring both signals avoids collapsing unrelated ways to satisfy a GIR.
  const learningCommunityCourses = catalog.filter((course) =>
    /^(CC|ES)\./.test(course.subject_id) && Boolean(course.gir_attribute),
  );
  for (const learningCourse of learningCommunityCourses) {
    for (const candidate of catalog) {
      if (
        candidate.subject_id !== learningCourse.subject_id &&
        candidate.gir_attribute === learningCourse.gir_attribute &&
        titlesAreSimilar(candidate.title, learningCourse.title)
      ) {
        uf.union(learningCourse.subject_id, candidate.subject_id);
      }
    }
  }

  // Group lettered variants only when their titles indicate the same subject.
  const byStem = new Map<string, RemoteCourse[]>();
  for (const course of catalog) {
    const stem = numericStem(course.subject_id);
    byStem.set(stem, [...(byStem.get(stem) ?? []), course]);
  }

  for (const [stem, courses] of byStem) {
    if (courses.length < 2) continue;
    for (let i = 0; i < courses.length; i += 1) {
      for (let j = i + 1; j < courses.length; j += 1) {
        const a = courses[i];
        const b = courses[j];
        const isVariantPair =
          numericStem(a.subject_id) === stem &&
          numericStem(b.subject_id) === stem &&
          (a.subject_id !== stem || b.subject_id !== stem);
        if (isVariantPair && titlesAreSimilar(a.title, b.title)) {
          uf.union(a.subject_id, b.subject_id);
        }
      }
    }
  }

  const grouped = new Map<string, RemoteCourse[]>();
  for (const course of catalog) {
    const root = uf.find(course.subject_id);
    grouped.set(root, [...(grouped.get(root) ?? []), course]);
  }

  const families: CourseFamily[] = [];
  const familyByCourseId = new Map<string, CourseFamily>();

  for (const members of grouped.values()) {
    members.sort((a, b) => a.subject_id.localeCompare(b.subject_id, undefined, { numeric: true }));
    const stems = [...new Set(members.map((course) => numericStem(course.subject_id)))];
    const preferredStem = stems.length === 1 ? stems[0] : undefined;
    const primary =
      (preferredStem ? members.find((course) => course.subject_id === preferredStem) : undefined) ??
      members[0];
    const id = members.length > 1 && preferredStem ? preferredStem : primary.subject_id;
    const family: CourseFamily = {
      id,
      label: members.length > 1 && preferredStem ? preferredStem : primary.subject_id,
      title: primary.title,
      members,
      primary,
    };
    families.push(family);
    members.forEach((course) => familyByCourseId.set(course.subject_id, family));
  }

  families.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { families, familyByCourseId };
}

export function familySearchText(family: CourseFamily) {
  return family.members
    .flatMap((course) => [course.subject_id, course.title, course.description ?? ""])
    .join(" ")
    .toLowerCase();
}

export function familyScore(family: CourseFamily, query: string) {
  return family.members.reduce((best, course) => Math.max(best, searchScore(course, query)), 0);
}

/** A family stays visible when any merged variant satisfies the filters. */
export function searchFamilies(
  families: CourseFamily[],
  options: { query: string; filters: CourseFilters; limit?: number },
) {
  const { query, filters, limit } = options;
  const trimmed = query.trim();
  const allowed = families.filter((family) =>
    family.members.some((course) => matchesFilters(course, filters)),
  );

  const ranked = trimmed
    ? allowed
        .map((family) => ({
          family,
          score: familyScore(family, trimmed),
          enrollment: family.members.reduce((best, course) => Math.max(best, enrollmentOf(course)), 0),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.enrollment - a.enrollment ||
            compareSubjectIds(a.family.label, b.family.label),
        )
        .map((entry) => entry.family)
    : [...allowed].sort((a, b) => compareSubjectIds(a.label, b.label));

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
