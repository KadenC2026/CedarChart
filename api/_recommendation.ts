export type CatalogCourse = {
  subject_id: string;
  title: string;
  description?: string;
  is_historical?: boolean;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "build",
  "course",
  "courses",
  "from",
  "help",
  "into",
  "learn",
  "like",
  "make",
  "that",
  "the",
  "their",
  "them",
  "this",
  "understand",
  "want",
  "with",
  "would",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function unique(values: string[]) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function lexicalScore(course: CatalogCourse, originalQuery: string, searchTerms: string[]) {
  const subjectId = course.subject_id.toLowerCase();
  const title = normalize(course.title);
  const description = normalize(course.description ?? "");
  const original = normalize(originalQuery);

  if (subjectId === original || subjectId.replace(/\W/g, "") === original.replace(/\W/g, "")) {
    return 100_000;
  }

  const phrases = unique([originalQuery, ...searchTerms]);
  let score = 0;

  for (const [index, phrase] of phrases.entries()) {
    const weight = index === 0 ? 4 : 1;
    if (subjectId.includes(phrase)) score += 1_200 * weight;
    if (title === phrase) score += 1_000 * weight;
    else if (title.includes(phrase)) score += 650 * weight;
    if (description.includes(phrase)) score += 160 * weight;

    for (const token of tokens(phrase)) {
      if (title.split(" ").includes(token)) score += 120 * weight;
      else if (title.includes(token)) score += 70 * weight;
      if (description.includes(token)) score += 18 * weight;
    }
  }

  return score;
}

export function retrieveCandidates(
  catalog: CatalogCourse[],
  originalQuery: string,
  searchTerms: string[] = [],
  limit = 60,
) {
  return catalog
    .filter((course) => !course.is_historical)
    .map((course) => ({ course, score: lexicalScore(course, originalQuery, searchTerms) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.course.subject_id.localeCompare(b.course.subject_id, undefined, { numeric: true }),
    )
    .slice(0, limit)
    .map(({ course }) => course);
}

export function catalogExcerpt(course: CatalogCourse, maxLength = 420) {
  const source = (course.description ?? course.title).replace(/\s+/g, " ").trim();
  if (source.length <= maxLength) return source;
  return source.slice(0, maxLength - 1).trimEnd() + "…";
}

export function keywordResults(courses: CatalogCourse[], limit = 5) {
  return courses.slice(0, limit).map((course) => ({
    courseId: `mit:${course.subject_id}`,
    title: course.title,
    relevanceExplanation: "Keyword match from the imported MIT catalog.",
    supportingCatalogText: catalogExcerpt(course),
    recommendationMethod: "keyword" as const,
  }));
}

export function groundedAiResults(
  ranked: Array<{ subjectId?: unknown; relevanceExplanation?: unknown }>,
  candidates: CatalogCourse[],
  limit = 5,
) {
  const byId = new Map(candidates.map((course) => [course.subject_id, course]));
  const seen = new Set<string>();

  return ranked.flatMap((item) => {
    const subjectId = typeof item.subjectId === "string" ? item.subjectId : "";
    const course = byId.get(subjectId);
    if (!course || seen.has(subjectId)) return [];

    const explanation =
      typeof item.relevanceExplanation === "string"
        ? item.relevanceExplanation.replace(/\s+/g, " ").trim().slice(0, 360)
        : "";
    if (!explanation) return [];
    seen.add(subjectId);

    return [{
      courseId: `mit:${subjectId}`,
      title: course.title,
      relevanceExplanation: explanation,
      supportingCatalogText: catalogExcerpt(course),
      recommendationMethod: "AI" as const,
    }];
  }).slice(0, limit);
}
