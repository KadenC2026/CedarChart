import type { RemoteCourse } from "./types";

export type TermKey = "fall" | "IAP" | "spring" | "summer";

export const termKeys: TermKey[] = ["fall", "IAP", "spring", "summer"];

export const termLabels: Record<TermKey, string> = {
  fall: "Fall",
  IAP: "IAP",
  spring: "Spring",
  summer: "Summer",
};

export type CourseAttribute = "GIR" | "HASS-A" | "HASS-H" | "HASS-S" | "HASS-E" | "CI-H" | "CI-HW";

export const courseAttributes: CourseAttribute[] = [
  "GIR",
  "HASS-A",
  "HASS-H",
  "HASS-S",
  "HASS-E",
  "CI-H",
  "CI-HW",
];

export type CourseFilters = {
  departments: string[];
  level: "any" | "U" | "G";
  terms: TermKey[];
  attributes: CourseAttribute[];
  unitsMin: number | null;
  unitsMax: number | null;
  hideRetired: boolean;
};

export const emptyFilters: CourseFilters = {
  departments: [],
  level: "any",
  terms: [],
  attributes: [],
  unitsMin: null,
  unitsMax: null,
  hideRetired: true,
};

/** "6.1200" belongs to Course 6; "21G.103" belongs to Course 21G. */
export function departmentOf(subjectId: string) {
  const [department] = subjectId.split(".");
  return department || subjectId;
}

export function offeredInTerm(course: RemoteCourse, term: TermKey) {
  if (term === "fall") return Boolean(course.offered_fall);
  if (term === "spring") return Boolean(course.offered_spring);
  if (term === "IAP") return Boolean(course.offered_IAP);
  return Boolean(course.offered_summer);
}

function attributeValues(value: string | undefined) {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function hasAttribute(course: RemoteCourse, attribute: CourseAttribute) {
  if (attribute === "GIR") return Boolean(course.gir_attribute);
  return (
    attributeValues(course.hass_attribute).includes(attribute) ||
    attributeValues(course.communication_requirement).includes(attribute)
  );
}

export function matchesFilters(course: RemoteCourse, filters: CourseFilters) {
  if (filters.hideRetired && course.is_historical) return false;
  if (filters.departments.length && !filters.departments.includes(departmentOf(course.subject_id))) return false;
  if (filters.level !== "any" && course.level !== filters.level) return false;
  if (filters.terms.length && !filters.terms.some((term) => offeredInTerm(course, term))) return false;
  if (filters.attributes.length && !filters.attributes.some((attribute) => hasAttribute(course, attribute))) return false;
  const units = course.total_units ?? 0;
  if (filters.unitsMin !== null && units < filters.unitsMin) return false;
  if (filters.unitsMax !== null && units > filters.unitsMax) return false;
  return true;
}

/** Counts only choices the student changed, so the default state reads as "no filters". */
export function activeFilterCount(filters: CourseFilters) {
  return (
    (filters.departments.length ? 1 : 0) +
    (filters.level !== "any" ? 1 : 0) +
    (filters.terms.length ? 1 : 0) +
    (filters.attributes.length ? 1 : 0) +
    (filters.unitsMin !== null || filters.unitsMax !== null ? 1 : 0) +
    (filters.hideRetired === emptyFilters.hideRetired ? 0 : 1)
  );
}

function queryTokens(query: string) {
  return query.split(/[^a-z0-9.]+/).filter((token) => token.length > 1);
}

/** "6.1210" and "61210" should match, so punctuation is dropped for comparison. */
function condensed(value: string) {
  return value.replace(/[^a-z0-9]/g, "");
}

/** Every query token appears in the title. Description-only mentions score 200. */
export const TITLE_MATCH_SCORE = 540;

/**
 * Relevance ranking: a subject number beats a title match, and a title match beats a
 * description mention. Without this, a search for "algorithms" is dominated by whichever
 * department happens to sort first among thousands of description-only mentions.
 */
export function searchScore(
  course: Pick<RemoteCourse, "subject_id" | "title" | "description">,
  rawQuery: string,
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const id = course.subject_id.toLowerCase();
  const title = course.title.toLowerCase();
  const description = (course.description ?? "").toLowerCase();

  if (id === query || condensed(id) === condensed(query)) return 1000;
  if (id.startsWith(query) || condensed(id).startsWith(condensed(query))) return 900;
  if (id.includes(query)) return 800;
  if (title === query) return 700;

  const tokens = queryTokens(query);
  if (!tokens.length) return 0;

  const titleWords = title.split(/[^a-z0-9.]+/).filter(Boolean);
  const tokensInTitle = tokens.filter((token) => title.includes(token)).length;
  if (tokensInTitle === tokens.length) {
    const wholeWords = tokens.every((token) => titleWords.some((word) => word === token));
    const wordStarts = tokens.every((token) => titleWords.some((word) => word.startsWith(token)));
    if (wholeWords) return 640;
    if (wordStarts) return 600;
    return 540;
  }

  const tokensInDescription = tokens.filter((token) => description.includes(token)).length;
  if (tokensInTitle) return 300 + tokensInTitle * 20 + (tokensInDescription === tokens.length ? 20 : 0);
  if (tokensInDescription === tokens.length) return 200;
  return 0;
}

export function compareSubjectIds(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Average enrollment from the snapshot, used only to break ties between equal matches. */
export function enrollmentOf(course: RemoteCourse) {
  return typeof course.enrollment_number === "number" ? course.enrollment_number : 0;
}

export function compareByRelevance(
  a: { course: RemoteCourse; score: number },
  b: { course: RemoteCourse; score: number },
) {
  return (
    b.score - a.score ||
    enrollmentOf(b.course) - enrollmentOf(a.course) ||
    compareSubjectIds(a.course.subject_id, b.course.subject_id)
  );
}

export type CourseSearchOptions = { query: string; filters: CourseFilters; limit?: number };

/**
 * Deterministic catalog search. With an empty query the filters act as a browse view,
 * so the filter menu stays useful before anything is typed.
 */
export function searchCourses(catalog: RemoteCourse[], options: CourseSearchOptions) {
  const { query, filters, limit } = options;
  const allowed = catalog.filter((course) => matchesFilters(course, filters));
  const trimmed = query.trim();

  const ranked = trimmed
    ? allowed
        .map((course) => ({ course, score: searchScore(course, trimmed) }))
        .filter((entry) => entry.score > 0)
        .sort(compareByRelevance)
        .map((entry) => entry.course)
    : [...allowed].sort((a, b) => compareSubjectIds(a.subject_id, b.subject_id));

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}

/** True when any of these subjects has the query in its title, not just its description. */
export function hasTitleMatch(
  courses: Array<Pick<RemoteCourse, "subject_id" | "title" | "description">>,
  query: string,
) {
  return courses.some((course) => searchScore(course, query) >= TITLE_MATCH_SCORE);
}

/** Department codes present in the catalog, with how many subjects each contributes. */
export function departmentOptions(catalog: RemoteCourse[]) {
  const counts = new Map<string, number>();
  for (const course of catalog) {
    const department = departmentOf(course.subject_id);
    counts.set(department, (counts.get(department) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => compareSubjectIds(a.department, b.department));
}
