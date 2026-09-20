import { localId } from "./requirements";
import type { InterestSearchResult, RemoteCourse } from "./types";

export type GroundedCourseRecommendation = {
  course: RemoteCourse;
  recommendation: InterestSearchResult;
};

export function groundCourseRecommendations(
  results: InterestSearchResult[],
  catalog: RemoteCourse[],
): GroundedCourseRecommendation[] {
  const courseById = new Map(catalog.map((course) => [course.subject_id, course]));
  const seen = new Set<string>();

  return results.flatMap((recommendation) => {
    const subjectId = localId(recommendation.courseId);
    const course = courseById.get(subjectId);
    if (!course || seen.has(subjectId)) return [];
    seen.add(subjectId);
    return [{ course, recommendation }];
  });
}

export async function requestCourseRecommendations({
  query,
  careerGoal = "",
  catalog,
}: {
  query: string;
  careerGoal?: string;
  catalog: RemoteCourse[];
}) {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, careerGoal }),
  });

  if (!response.ok) throw new Error("recommendation endpoint unavailable");
  const payload = await response.json();
  const results = Array.isArray(payload.results)
    ? payload.results as InterestSearchResult[]
    : [];

  return groundCourseRecommendations(results, catalog);
}
