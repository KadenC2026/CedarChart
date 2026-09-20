import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import type { PetitionSuggestion } from "../src/domain/types";

export type PetitionCatalogCourse = {
  subject_id: string;
  title: string;
  description?: string;
  prerequisites?: string;
  level?: "U" | "G";
  is_historical?: boolean;
};

type Candidate = PetitionCatalogCourse & { prerequisiteFor: string[]; score: number };

const MAX_BACKGROUND_LENGTH = 1_200;
const CANDIDATE_LIMIT = 60;
const RESULT_LIMIT = 5;
const STOP_WORDS = new Set([
  "about", "and", "built", "class", "classes", "course", "courses", "experience", "from",
  "have", "high", "into", "school", "that", "the", "this", "through", "took", "with",
]);

let catalogCache: PetitionCatalogCourse[] | undefined;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalized(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function mentionsSubject(text: string | undefined, subjectId: string) {
  if (!text) return false;
  const escaped = subjectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9.])${escaped}(?=$|[^A-Za-z0-9.])`, "i").test(text);
}

function excerpt(course: PetitionCatalogCourse, maxLength = 420) {
  const source = clean(course.description ?? course.title);
  return source.length <= maxLength ? source : `${source.slice(0, maxLength - 1).trimEnd()}…`;
}

export function petitionCandidates(
  catalog: PetitionCatalogCourse[],
  backgroundExperience: string,
  plannedCourseIds: string[],
  excludedCourseIds: string[] = [],
  limit = CANDIDATE_LIMIT,
) {
  const excluded = new Set(excludedCourseIds);
  const planned = catalog.filter((course) => plannedCourseIds.includes(course.subject_id));
  const backgroundTokens = tokens(backgroundExperience);

  return catalog
    .filter((course) => !course.is_historical && course.level !== "G" && !excluded.has(course.subject_id))
    .map((course): Candidate => {
      const prerequisiteFor = planned
        .filter((target) => mentionsSubject(target.prerequisites, course.subject_id))
        .map((target) => target.subject_id);
      const courseTokens = tokens(`${course.title} ${course.description ?? ""}`);
      let overlap = 0;
      for (const token of backgroundTokens) if (courseTokens.has(token)) overlap += 1;
      const introductory = /\b(introduction|introductory|fundamentals|principles)\b/i.test(course.title);
      const score = prerequisiteFor.length * 120 + overlap * 18 + (introductory && overlap ? 8 : 0);
      return { ...course, prerequisiteFor, score };
    })
    .filter((course) => course.score > 0)
    .sort((a, b) => b.score - a.score || a.subject_id.localeCompare(b.subject_id, undefined, { numeric: true }))
    .slice(0, limit);
}

export function catalogPetitionSuggestions(candidates: Candidate[], limit = RESULT_LIMIT): PetitionSuggestion[] {
  return candidates.slice(0, limit).map((course) => ({
    courseId: course.subject_id,
    title: course.title,
    overlapExplanation: course.prerequisiteFor.length
      ? `This subject is listed in the prerequisite text for ${course.prerequisiteFor.join(", ")}, and its catalog description overlaps with the experience you entered.`
      : "This subject's catalog description overlaps with the experience you entered.",
    petitionQuestion: `Could my prior experience cover the preparation expected from ${course.subject_id}?`,
    supportingCatalogText: excerpt(course),
    prerequisiteFor: course.prerequisiteFor,
    recommendationMethod: "catalog",
  }));
}

export function groundedPetitionSuggestions(
  ranked: Array<{ subjectId?: unknown; overlapExplanation?: unknown; petitionQuestion?: unknown }>,
  candidates: Candidate[],
  limit = RESULT_LIMIT,
): PetitionSuggestion[] {
  const byId = new Map(candidates.map((course) => [course.subject_id, course]));
  const seen = new Set<string>();

  return ranked.flatMap((item) => {
    const subjectId = typeof item.subjectId === "string" ? item.subjectId : "";
    const course = byId.get(subjectId);
    if (!course || seen.has(subjectId)) return [];
    const overlapExplanation = typeof item.overlapExplanation === "string" ? clean(item.overlapExplanation).slice(0, 420) : "";
    const petitionQuestion = typeof item.petitionQuestion === "string" ? clean(item.petitionQuestion).slice(0, 260) : "";
    if (!overlapExplanation || !petitionQuestion) return [];
    seen.add(subjectId);
    return [{
      courseId: subjectId,
      title: course.title,
      overlapExplanation,
      petitionQuestion,
      supportingCatalogText: excerpt(course),
      prerequisiteFor: course.prerequisiteFor,
      recommendationMethod: "AI" as const,
    }];
  }).slice(0, limit);
}

const rankingSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subjectId: { type: "string" },
          overlapExplanation: { type: "string" },
          petitionQuestion: { type: "string" },
        },
        required: ["subjectId", "overlapExplanation", "petitionQuestion"],
        additionalProperties: false,
      },
      maxItems: RESULT_LIMIT,
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

function loadCatalog() {
  if (!catalogCache) {
    const path = join(process.cwd(), "public", "data", "catalog.json");
    catalogCache = JSON.parse(readFileSync(path, "utf8")) as PetitionCatalogCourse[];
  }
  return catalogCache;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const backgroundExperience = typeof req.body?.backgroundExperience === "string" ? clean(req.body.backgroundExperience) : "";
  const careerGoal = typeof req.body?.careerGoal === "string" ? clean(req.body.careerGoal).slice(0, 300) : "";
  const plannedCourseIds = Array.isArray(req.body?.plannedCourseIds)
    ? req.body.plannedCourseIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 80)
    : [];
  const excludedCourseIds = Array.isArray(req.body?.excludedCourseIds)
    ? req.body.excludedCourseIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 120)
    : [];

  if (!backgroundExperience) return res.status(400).json({ error: "backgroundExperience is required" });
  if (backgroundExperience.length > MAX_BACKGROUND_LENGTH) {
    return res.status(400).json({ error: `backgroundExperience must be ${MAX_BACKGROUND_LENGTH} characters or fewer` });
  }

  let candidates: Candidate[];
  try {
    candidates = petitionCandidates(loadCatalog(), `${backgroundExperience} ${careerGoal}`, plannedCourseIds, excludedCourseIds);
  } catch (error) {
    console.error("Unable to prepare petition candidates", error);
    return res.status(500).json({ error: "Catalog unavailable" });
  }

  const fallback = () => res.status(200).json({ results: catalogPetitionSuggestions(candidates), method: "catalog" });
  if (!candidates.length || !process.env.OPENAI_API_KEY) return fallback();

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      store: false,
      instructions:
        "Identify MIT subjects the student could discuss with an instructor or academic advisor because their stated experience may overlap with expected preparation. Select only supplied subjectIds. Use only the student's statement and supplied catalog records. Never say a prerequisite is waived, that a petition will be approved, or that the student has earned credit. Frame every result as a question for an instructor or advisor. Return only the requested structured data.",
      input: JSON.stringify({
        backgroundExperience,
        careerGoal,
        plannedCourseIds,
        candidates: candidates.map((course) => ({
          subjectId: course.subject_id,
          title: course.title,
          description: excerpt(course, 760),
          prerequisiteFor: course.prerequisiteFor,
        })),
      }),
      text: { format: { type: "json_schema", name: "petition_suggestions", strict: true, schema: rankingSchema } },
      max_output_tokens: 1_100,
    });
    const parsed = JSON.parse(response.output_text) as { results?: Array<{ subjectId?: unknown; overlapExplanation?: unknown; petitionQuestion?: unknown }> };
    const results = groundedPetitionSuggestions(Array.isArray(parsed.results) ? parsed.results : [], candidates);
    return results.length ? res.status(200).json({ results, method: "AI" }) : fallback();
  } catch (error) {
    console.error("AI petition suggestions failed; using catalog fallback", error);
    return fallback();
  }
}
